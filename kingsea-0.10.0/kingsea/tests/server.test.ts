// Tests d'intégration du serveur : vrais WebSockets, plusieurs joueurs, base SQLite.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index';
import { MemoryStore, openSqliteStore, type Store } from '../server/store';
import { ChatLimiter, cleanMessage } from '../server/moderation';
import { DEFAULT_LOOK } from '../src/art/characters';
import { PROTOCOL_VERSION, TERMS_VERSION, unpackPose } from '../src/net/protocol';

type Msg = Record<string, unknown> & { t: string };

class TestClient {
  ws: WebSocket;
  inbox: Msg[] = [];
  private waiters: Array<{ pred: (m: Msg) => boolean; res: (m: Msg) => void }> = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      const w = this.waiters.find((x) => x.pred(m));
      if (w) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); } else this.inbox.push(m);
    };
  }
  open(): Promise<void> { return new Promise((r, j) => { this.ws.onopen = () => r(); this.ws.onerror = () => j(new Error('ws')); }); }
  send(m: unknown): void { this.ws.send(JSON.stringify(m)); }
  wait(pred: (m: Msg) => boolean, ms = 2000): Promise<Msg> {
    const i = this.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => {
      const w = { pred, res: (m: Msg) => { clearTimeout(to); res(m); } };
      const to = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); rej(new Error('délai dépassé')); }, ms);
      this.waiters.push(w);
    });
  }
  async none(pred: (m: Msg) => boolean, ms = 400): Promise<boolean> { try { await this.wait(pred, ms); return false; } catch { return true; } }
  close(): void { this.ws.close(); }
}

const servers: Array<{ close: () => Promise<void> }> = [];
after(async () => { for (const s of servers) await s.close(); });

async function boot(store: Store = new MemoryStore(), adminToken?: string) { const s = await startServer({ port: 0, store, quiet: true, adminToken }); servers.push(s); return s; }
async function player(port: number, name: string, password = 'secret123') {
  const c = new TestClient(port); await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  await c.wait((m) => m.t === 'hello');
  c.send({ t: 'register', name, password, look: DEFAULT_LOOK, terms: TERMS_VERSION });
  const auth = await c.wait((m) => m.t === 'auth');
  return { c, auth, id: (auth.profile as { id: string }).id, token: auth.token as string };
}
let reqN = 0;
const req = (c: TestClient, kind: string, game: string, action: string, input: unknown, id = `t${++reqN}abc`) => {
  c.send({ t: 'req', req: { kind, game, action, input, id } });
  return c.wait((m) => m.t === 'res' && m.id === id).then((m) => m.reply as { ok: boolean; balance: number; payout: number; stake: number; view: Record<string, unknown>; error?: string });
};

test('comptes : inscription, pseudo déjà pris, mauvais mot de passe, reprise par jeton', async () => {
  const { port } = await boot();
  const a = await player(port, 'Alice');
  assert.equal((a.auth.profile as { wallet: { balance: number } }).wallet.balance, 500);
  const dup = new TestClient(port); await dup.open();
  dup.send({ t: 'register', name: 'alice', password: 'autre123', look: DEFAULT_LOOK, terms: TERMS_VERSION });
  assert.match(String((await dup.wait((m) => m.t === 'authError')).msg), /déjà pris/);
  dup.send({ t: 'register', name: 'Bob', password: '123', look: DEFAULT_LOOK, terms: TERMS_VERSION });
  assert.match(String((await dup.wait((m) => m.t === 'authError')).msg), /6 caractères/);
  dup.send({ t: 'login', name: 'Alice', password: 'mauvais!' });
  assert.match(String((await dup.wait((m) => m.t === 'authError')).msg), /incorrect/);
  dup.send({ t: 'join', floor: 'hub', x: 100, y: 100 });
  assert.ok(await dup.wait((m) => m.t === 'authError'), 'rien sans connexion');
  a.c.close();
  const again = new TestClient(port); await again.open();
  again.send({ t: 'hello', v: PROTOCOL_VERSION, token: a.token });
  const auth = await again.wait((m) => m.t === 'auth');
  assert.equal((auth.profile as { name: string }).name, 'Alice');
  const old = new TestClient(port); await old.open();
  old.send({ t: 'hello', v: 0 });
  assert.equal((await old.wait((m) => m.t === 'kicked')).t, 'kicked');
  again.close(); dup.close();
});

test('présence : entrer dans un étage, voir les autres, déplacements synchronisés, téléportation refusée', async () => {
  const { port } = await boot();
  const a = await player(port, 'Marin');
  const b = await player(port, 'Sirène');
  a.c.send({ t: 'join', floor: 'hub', x: 17 * 32, y: 4 * 32 });
  await a.c.wait((m) => m.t === 'room');
  b.c.send({ t: 'join', floor: 'hub', x: 15 * 32, y: 5 * 32 });
  const room = await b.c.wait((m) => m.t === 'room');
  assert.equal((room.players as Array<{ name: string }>)[0].name, 'Marin');
  const enter = await a.c.wait((m) => m.t === 'enter');
  assert.equal((enter.p as { name: string }).name, 'Sirène');
  // Petit pas valide
  a.c.send({ t: 'move', x: 17 * 32 + 10, y: 4 * 32, dir: 'right', anim: 'walk' });
  const snap = await b.c.wait((m) => m.t === 'snap');
  // Instantané compact : [numéro, x, y, pose] ; le numéro vient du message d'arrivée
  const d = snap.d as number[], an = (room.players as Array<{ n: number }>)[0].n;
  const k = d.findIndex((v, i) => i % 4 === 0 && v === an);
  assert.ok(k >= 0);
  assert.deepEqual([d[k + 1], d[k + 2], unpackPose(d[k + 3])], [17 * 32 + 10, 4 * 32, { dir: 'right', anim: 'walk' }]);
  // Téléportation à l'autre bout de l'étage : corrigée
  a.c.send({ t: 'move', x: 30 * 32, y: 16 * 32, dir: 'right', anim: 'walk' });
  const cor = await a.c.wait((m) => m.t === 'correct');
  assert.equal(cor.x, 17 * 32 + 10);
  // Changement d'étage : les autres voient le départ
  a.c.send({ t: 'join', floor: 'casino', x: 17 * 32, y: 4 * 32 });
  const leave = await b.c.wait((m) => m.t === 'leave');
  assert.equal(leave.id, a.id);
  b.c.send({ t: 'players' });
  const list = (await b.c.wait((m) => m.t === 'players')).list as Array<{ name: string; floor: string }>;
  assert.deepEqual(list.map((p) => `${p.name}@${p.floor}`).sort(), ['Marin@casino', 'Sirène@hub']);
  a.c.close(); b.c.close();
});

test('chat : diffusion dans l\'étage, insultes masquées, anti-spam, blocage, signalement', async () => {
  const store = new MemoryStore();
  const { port } = await boot(store);
  const a = await player(port, 'Capitaine');
  const b = await player(port, 'Mousse');
  const c = await player(port, 'Ailleurs');
  for (const [p, f] of [[a, 'hub'], [b, 'hub'], [c, 'arcade']] as const) { p.c.send({ t: 'join', floor: f, x: 17 * 32, y: 4 * 32 }); await p.c.wait((m) => m.t === 'room'); }
  a.c.send({ t: 'chat', text: 'Bonjour à bord, espèce de connard !' });
  const got = await b.c.wait((m) => m.t === 'chat');
  assert.equal(got.text, 'Bonjour à bord, espèce de ****** !');
  assert.equal(got.name, 'Capitaine');
  assert.ok(await c.c.none((m) => m.t === 'chat'), 'un autre étage ne reçoit pas le message');
  // Rafale : refusée puis sourdine
  for (let i = 0; i < 4; i++) a.c.send({ t: 'chat', text: `spam ${i}` });
  const err = await a.c.wait((m) => m.t === 'chatError');
  assert.ok(String(err.msg).length > 0);
  // Blocage : Mousse ne voit plus Capitaine
  b.c.send({ t: 'block', id: a.id, on: true });
  await b.c.wait((m) => m.t === 'notice');
  await new Promise((r) => setTimeout(r, 1000));
  b.c.inbox = [];
  a.c.send({ t: 'emote', e: 'wave' });
  assert.ok(await b.c.none((m) => m.t === 'emote' || m.t === 'chat', 600));
  // Signalement avec contexte
  b.c.send({ t: 'report', id: a.id, reason: 'insultes' });
  assert.match(String((await b.c.wait((m) => m.t === 'notice')).msg), /Signalement/);
  const rep = store.reports()[0];
  assert.equal(rep.target, a.id); assert.match(rep.context, /\*\*\*\*\*\*/);
  a.c.close(); b.c.close(); c.c.close();
});

test('économie côté serveur : mises réglées par le serveur, requête rejouée sans double gain', async () => {
  const { port } = await boot();
  const a = await player(port, 'Joueuse');
  // Caisse : 400 KSCoins → 400 jetons (100 jetons de bienvenue déjà offerts) ; la même requête rejouée ne change rien
  const ex = await req(a.c, 'purser', 'purser', 'exchange', { dir: 'buy', amount: 400 }, 'caisse-1') as unknown as { ok: boolean; balance: number; eco: { chips: number } };
  assert.ok(ex.ok); assert.equal(ex.balance, 100); assert.equal(ex.eco.chips, 500);
  const ex2 = await req(a.c, 'purser', 'purser', 'exchange', { dir: 'buy', amount: 400 }, 'caisse-1') as unknown as { balance: number; eco: { chips: number } };
  assert.equal(ex2.eco.chips, 500, 'échange rejoué : une seule fois');
  const exBad = await req(a.c, 'purser', 'purser', 'exchange', { dir: 'buy', amount: 1000 }) as unknown as { ok: boolean; balance: number; eco: { chips: number } };
  assert.equal(exBad.ok, false); assert.equal(exBad.balance, 100); assert.equal(exBad.eco.chips, 500);
  // Roulette en jetons : les KSCoins ne bougent pas
  const r = await req(a.c, 'casino', 'roulette', 'play', { bets: [{ kind: { type: 'red' }, amount: 50 }] }, 'roul-1') as unknown as { ok: boolean; balance: number; payout: number; eco: { chips: number } };
  assert.ok(r.ok);
  assert.equal(r.eco.chips, 500 - 50 + r.payout);
  assert.equal(r.balance, 100);
  const again = await req(a.c, 'casino', 'roulette', 'play', { bets: [{ kind: { type: 'red' }, amount: 50 }] }, 'roul-1');
  assert.deepEqual(again, r, 'même réponse, rien de rejoué');
  const bad = await req(a.c, 'casino', 'roulette', 'play', { bets: [{ kind: { type: 'red' }, amount: 99999 }] });
  assert.equal(bad.ok, false);
  const gift = await req(a.c, 'purser', 'purser', 'gift', {});
  const gift2 = await req(a.c, 'purser', 'purser', 'gift', {});
  assert.equal(gift2.balance, gift.balance, 'cadeau une seule fois');
  const arc = await req(a.c, 'purser', 'purser', 'arcade', { game: 'basket', score: 100000 });
  assert.equal(arc.ok, false, 'score impossible refusé');
  a.c.close();
});

test('cabines : une par joueur, jamais partagée ; intérieur privé', async () => {
  const { port } = await boot();
  const a = await player(port, 'Locataire A');
  const b = await player(port, 'Locataire B');
  a.c.send({ t: 'cabin' }); const ca = await a.c.wait((m) => m.t === 'cabin');
  b.c.send({ t: 'cabin' }); const cb = await b.c.wait((m) => m.t === 'cabin');
  assert.ok(ca.id && cb.id && ca.id !== cb.id);
  a.c.send({ t: 'cabin' }); assert.equal((await a.c.wait((m) => m.t === 'cabin')).id, ca.id);
  a.c.send({ t: 'join', floor: 'cabin-interior', x: 7 * 32, y: 7 * 32 }); await a.c.wait((m) => m.t === 'room');
  b.c.send({ t: 'join', floor: 'cabin-interior', x: 7 * 32, y: 7 * 32 });
  const rb = await b.c.wait((m) => m.t === 'room');
  assert.equal((rb.players as unknown[]).length, 0, 'chacun seul dans sa cabine');
  a.c.close(); b.c.close();
});

test('déconnexion en pleine main de blackjack : réglée à la reconnexion, une seule fois', async () => {
  const { port } = await boot();
  const a = await player(port, 'Absent');
  let open = false, before = 0;
  for (let i = 0; i < 20 && !open; i++) {
    const r = await req(a.c, 'casino', 'blackjack', 'deal', { bet: 20 });
    assert.ok(r.ok);
    open = r.view.phase === 'player'; before = r.balance;
  }
  assert.ok(open);
  a.c.close();
  await new Promise((r) => setTimeout(r, 150));
  const back = new TestClient(port); await back.open();
  back.send({ t: 'hello', v: PROTOCOL_VERSION, token: a.token });
  const auth = await back.wait((m) => m.t === 'auth');
  assert.match(String(auth.notice), /blackjack/);
  const bal = (auth.profile as { wallet: { balance: number } }).wallet.balance;
  assert.ok(bal >= before && bal <= before + 50);
  back.close();
});

test('une seule connexion par compte ; persistance SQLite après redémarrage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ks-'));
  try {
    const file = join(dir, 'test.db');
    let srv = await boot(await openSqliteStore(file));
    const a = await player(srv.port, 'Fidèle');
    await req(a.c, 'purser', 'purser', 'gift', {});
    const second = new TestClient(srv.port); await second.open();
    second.send({ t: 'login', name: 'fidèle', password: 'secret123' });
    await second.wait((m) => m.t === 'auth');
    assert.match(String((await a.c.wait((m) => m.t === 'kicked')).msg), /autre appareil/);
    second.close();
    await srv.close();
    srv = await boot(await openSqliteStore(file));
    const c = new TestClient(srv.port); await c.open();
    c.send({ t: 'login', name: 'Fidèle', password: 'secret123' });
    const auth = await c.wait((m) => m.t === 'auth');
    assert.equal((auth.profile as { wallet: { balance: number } }).wallet.balance, 600);
    c.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('modération : nettoyage des messages et limites de cadence', () => {
  assert.equal(cleanMessage('  salut   tout   le monde  '), 'salut tout le monde');
  assert.equal(cleanMessage('va sur www.arnaque.com vite'), 'va sur [lien masqué] vite');
  assert.equal(cleanMessage('trooooooop bien'), 'trooop bien');
  assert.equal(cleanMessage('Quel CON !'), 'Quel *** !');
  assert.equal(cleanMessage('conversation'), 'conversation', 'pas de faux positif');
  const l = new ChatLimiter();
  assert.ok(l.check('a', 0).ok);
  assert.equal(l.check('b', 100).ok, false, 'trop rapide');
  assert.ok(l.check('c', 1000).ok);
  assert.equal(l.check('a', 2000).ok, false, 'répétition');
  assert.equal(l.check('a', 3000).ok, false); // 3e faute → sourdine
  assert.equal(l.check('nouveau', 4000).ok, false);
  assert.ok(l.check('nouveau', 70000).ok);
});

// ---------------------------------------------------------------- exigences des boutiques (phase 8)
const ADMIN = 'jeton-admin-test';
const http = (port: number, path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${path}`, init);
const admin = (port: number, path: string, body?: unknown) => http(port, path, body === undefined ? { headers: { authorization: `Bearer ${ADMIN}` } } : { method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('inscription : conditions d’utilisation obligatoires', async () => {
  const srv = await boot();
  const c = new TestClient(srv.port); await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION }); await c.wait((m) => m.t === 'hello');
  c.send({ t: 'register', name: 'SansCase', password: 'secret123', look: DEFAULT_LOOK });
  assert.match(String((await c.wait((m) => m.t === 'authError')).msg), /conditions/);
  c.close();
});

test('changement de mot de passe : ancien vérifié, autres appareils déconnectés', async () => {
  const srv = await boot();
  const a = await player(srv.port, 'Changeur');
  // Deuxième appareil (jeton distinct) obtenu par connexion, puis reprise sur le premier
  const other = new TestClient(srv.port); await other.open();
  other.send({ t: 'login', name: 'Changeur', password: 'secret123' });
  const otherToken = (await other.wait((m) => m.t === 'auth')).token as string;
  other.close();
  const c = new TestClient(srv.port); await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION, token: a.token }); await c.wait((m) => m.t === 'auth');
  c.send({ t: 'password', old: 'mauvais', next: 'nouveau123' });
  assert.equal((await c.wait((m) => m.t === 'account')).ok, false);
  c.send({ t: 'password', old: 'secret123', next: '12' });
  assert.equal((await c.wait((m) => m.t === 'account')).ok, false, 'nouveau mot de passe trop court');
  c.send({ t: 'password', old: 'secret123', next: 'nouveau123' });
  assert.equal((await c.wait((m) => m.t === 'account')).ok, true);
  const d = new TestClient(srv.port); await d.open();
  d.send({ t: 'hello', v: PROTOCOL_VERSION, token: otherToken });
  assert.equal((await d.wait((m) => m.t === 'hello')).needAuth, true, 'jeton de l’autre appareil révoqué');
  d.send({ t: 'login', name: 'Changeur', password: 'secret123' });
  assert.equal((await d.wait((m) => m.t === 'authError')).t, 'authError');
  d.send({ t: 'login', name: 'Changeur', password: 'nouveau123' });
  assert.equal((await d.wait((m) => m.t === 'auth')).t, 'auth');
  c.close(); d.close();
});

test('suppression de compte dans le jeu : mot de passe exigé, tout est effacé, pseudo libéré', async () => {
  const store = new MemoryStore();
  const srv = await boot(store);
  const a = await player(srv.port, 'Partant');
  const b = await player(srv.port, 'Témoin');
  a.c.send({ t: 'cabin' });
  const cab = (await a.c.wait((m) => m.t === 'cabin')).id as string;
  assert.ok(cab);
  b.c.send({ t: 'block', id: a.id, on: true }); await b.c.wait((m) => m.t === 'notice');
  b.c.send({ t: 'report', id: a.id, reason: 'test' }); await b.c.wait((m) => m.t === 'notice');
  a.c.send({ t: 'report', id: b.id, reason: 'réciproque' }); await a.c.wait((m) => m.t === 'notice');
  a.c.send({ t: 'deleteAccount', password: 'faux' });
  assert.equal((await a.c.wait((m) => m.t === 'account')).ok, false);
  assert.ok(store.profile(a.id), 'rien supprimé sans le bon mot de passe');
  a.c.send({ t: 'deleteAccount', password: 'secret123' });
  const r = await a.c.wait((m) => m.t === 'account');
  assert.equal(r.ok, true);
  assert.equal(store.profile(a.id), null);
  assert.equal(store.tokenAccount(a.token), null);
  assert.ok(![...store.cabinOwners().values()].includes(a.id), 'cabine libérée');
  assert.deepEqual(store.blocks(b.id), [], 'blocages qui le visaient retirés');
  assert.ok(store.reports().every((x) => x.reporter !== a.id), 'signalements envoyés anonymisés');
  const again = await player(srv.port, 'Partant');
  assert.notEqual(again.id, a.id, 'pseudo réutilisable, nouveau compte vierge');
  b.c.close(); again.c.close();
});

test('pages web des boutiques et suppression sans l’application', async () => {
  const store = new MemoryStore();
  const srv = await boot(store);
  for (const [path, word] of [['/privacy', 'Supprimer ton compte'], ['/terms', 'Aucun argent réel'], ['/delete-account', 'Supprimer définitivement']]) {
    const res = await http(srv.port, path);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes(word), path);
  }
  const a = await player(srv.port, 'WebPartant');
  const post = (body: unknown) => http(srv.port, '/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ name: 'WebPartant', password: 'mauvais' })).status, 400);
  assert.ok(store.profile(a.id));
  const ok = await post({ name: 'webpartant', password: 'secret123' });
  assert.equal(ok.status, 200);
  assert.match(String((await a.c.wait((m) => m.t === 'kicked')).msg), /supprimé/);
  assert.equal(store.profile(a.id), null);
  assert.equal((await post('pas un objet')).status, 400);
});

test('modération : sourdine, bannissement (connexion refusée, joueur expulsé), levée ; accès protégé', async () => {
  const srv = await boot(new MemoryStore(), ADMIN);
  const a = await player(srv.port, 'Bavard');
  a.c.send({ t: 'join', floor: 'hub', x: 17 * 32, y: 4 * 32 }); await a.c.wait((m) => m.t === 'room');
  assert.equal((await http(srv.port, '/api/admin/account?name=Bavard')).status, 401);
  assert.equal((await admin(srv.port, '/api/admin/account?name=Inconnu')).status, 404);
  const info = await (await admin(srv.port, '/api/admin/account?name=bavard')).json();
  assert.equal(info.id, a.id); assert.equal(info.online, true);
  // Sourdine 30 min : le chat est refusé
  assert.equal((await admin(srv.port, '/api/admin/sanction', { name: 'Bavard', muteMinutes: 30, reason: 'insultes' })).status, 200);
  a.c.send({ t: 'chat', text: 'coucou' });
  assert.match(String((await a.c.wait((m) => m.t === 'chatError')).msg), /modération/);
  // Bannissement 1 jour : expulsé tout de suite, connexion et reprise de session refusées
  await admin(srv.port, '/api/admin/sanction', { name: 'Bavard', banMinutes: 1440 });
  assert.match(String((await a.c.wait((m) => m.t === 'kicked')).msg), /suspendu/);
  const c = new TestClient(srv.port); await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION, token: a.token });
  assert.equal((await c.wait((m) => m.t === 'hello')).needAuth, true, 'sessions révoquées');
  c.send({ t: 'login', name: 'Bavard', password: 'secret123' });
  assert.match(String((await c.wait((m) => m.t === 'kicked')).msg), /suspendu.*insultes/);
  // Levée des deux sanctions
  const lift = await (await admin(srv.port, '/api/admin/sanction', { name: 'Bavard', banMinutes: 0, muteMinutes: 0 })).json();
  assert.equal(lift.sanction, null);
  const d = new TestClient(srv.port); await d.open();
  d.send({ t: 'login', name: 'Bavard', password: 'secret123' });
  assert.equal((await d.wait((m) => m.t === 'auth')).t, 'auth');
  d.close();
});

test('SQLite : suppression complète, sanctions persistantes, signalements purgés après 12 mois', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ks-p8-'));
  try {
    const st = await openSqliteStore(join(dir, 'db.sqlite'));
    const base = { look: DEFAULT_LOOK, created: 1, wallet: { balance: 500, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {}, cabin: { id: null, wallColor: 0 }, location: { floorId: 'hub', x: 0, y: 0 } };
    assert.ok(st.createAccount({ ...base, id: 'a1', name: 'Un' }, { salt: 's', hash: 'h' }));
    assert.ok(st.createAccount({ ...base, id: 'a2', name: 'Deux' }, { salt: 's', hash: 'h' }));
    st.createToken('a1', 't1', 1); st.createToken('a1', 't2', 1); st.setCabin('C-101', 'a1'); st.setBlock('a2', 'a1', true);
    st.addReport({ reporter: 'a1', target: 'a2', reason: 'x', context: '[]', at: 1000 });
    st.addReport({ reporter: 'a2', target: 'a1', reason: 'y', context: '[]', at: 5000 });
    st.setSanction('a2', { banUntil: 0, muteUntil: 99_999, reason: 'spam' });
    assert.deepEqual(st.sanction('a2'), { banUntil: 0, muteUntil: 99_999, reason: 'spam' });
    st.deleteTokensOf('a1', 't2');
    assert.equal(st.tokenAccount('t1'), null); assert.equal(st.tokenAccount('t2'), 'a1');
    st.deleteAccount('a1');
    assert.equal(st.profile('a1'), null); assert.equal(st.credentials('Un'), null); assert.equal(st.tokenAccount('t2'), null);
    assert.equal(st.cabinOwners().size, 0); assert.deepEqual(st.blocks('a2'), []);
    assert.equal(st.reports().find((r) => r.reason === 'x')?.reporter, 'compte-supprimé');
    assert.equal(st.purgeReports(2000), 1);
    assert.equal(st.reports().length, 1);
    st.setSanction('a2', null); assert.equal(st.sanction('a2'), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('chat : proximité (portée de voix), global (niveau 2, délai), historique global à la connexion', async () => {
  const store = new MemoryStore();
  const { port } = await boot(store);
  const login = async (name: string) => {
    const c = new TestClient(port); await c.open();
    c.send({ t: 'hello', v: PROTOCOL_VERSION }); await c.wait((m) => m.t === 'hello');
    c.send({ t: 'login', name, password: 'secret123' });
    const auth = await c.wait((m) => m.t === 'auth');
    return { c, id: (auth.profile as { id: string }).id };
  };
  // « Amirale » est niveau 2 (profil modifié en base avant la connexion)
  const pre = await player(port, 'Amirale'); pre.c.close(); await new Promise((r) => setTimeout(r, 100));
  const prof = store.profile(pre.id)!; prof.progress = { ...prof.progress!, xp: 200, level: 2 }; store.save(prof);
  const a = await login('Amirale');
  const near = await player(port, 'Voisin'), far = await player(port, 'Lointain'), other = await player(port, 'Ailleurs');
  for (const [p, f, x] of [[a, 'hub', 10], [near, 'hub', 12], [far, 'hub', 30], [other, 'arcade', 10]] as const) { p.c.send({ t: 'join', floor: f, x: x * 32, y: 6 * 32 }); await p.c.wait((m) => m.t === 'room'); }
  // Proximité : le voisin (2 cases) reçoit, le joueur à 20 cases et l'autre étage non
  a.c.send({ t: 'chat', text: 'Salut les voisins', scope: 'near' });
  const got = await near.c.wait((m) => m.t === 'chat');
  assert.equal(got.scope, 'near'); assert.equal(got.text, 'Salut les voisins');
  assert.ok(await far.c.none((m) => m.t === 'chat'), 'hors de portée de voix');
  assert.ok(await other.c.none((m) => m.t === 'chat'), 'autre étage');
  await new Promise((r) => setTimeout(r, 1300));
  // Global : tout le navire reçoit (filtré), mais pas un joueur de niveau 1
  a.c.send({ t: 'chat', text: 'Bonsoir le navire', scope: 'global' });
  for (const p of [near, far, other]) { const m = await p.c.wait((x) => x.t === 'chat'); assert.equal(m.scope, 'global'); assert.equal(m.text, 'Bonsoir le navire'); }
  near.c.send({ t: 'chat', text: 'moi aussi', scope: 'global' });
  const refused = await near.c.wait((m) => m.t === 'chatError');
  assert.match(String(refused.msg), /niveau 2/);
  // Délai entre deux messages globaux
  await new Promise((r) => setTimeout(r, 1300));
  a.c.send({ t: 'chat', text: 'encore', scope: 'global' });
  assert.match(String((await a.c.wait((m) => m.t === 'chatError')).msg), /attends/);
  // Historique global envoyé à la connexion
  const late = await player(port, 'Retardataire');
  const log = await late.c.wait((m) => m.t === 'chatLog');
  assert.ok((log.lines as Array<{ text: string }>).some((l) => l.text === 'Bonsoir le navire'));
  for (const p of [a, near, far, other, late]) p.c.close();
});

test('amis : code unique, demande par code ou pseudo, acceptation, statut, retrait, persistance SQLite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ks-friends-'));
  try {
    const store = await openSqliteStore(join(dir, 'ks.db'));
    const { port } = await boot(store);
    const a = await player(port, 'Corsaire'), b = await player(port, 'Sirène'), z = await player(port, 'Intrus');
    a.c.send({ t: 'friends' });
    const la = (await a.c.wait((m) => m.t === 'friends')).data as { code: string; friends: unknown[] };
    assert.match(la.code, /^KS-[2-9A-HJKMNP-Z]{6}$/);
    b.c.send({ t: 'friends' });
    const lb = (await b.c.wait((m) => m.t === 'friends')).data as { code: string };
    assert.notEqual(la.code, lb.code);
    // Code inconnu, son propre code
    a.c.send({ t: 'friendAdd', query: 'KS-222222' });
    assert.equal((await a.c.wait((m) => m.t === 'friendResult')).ok, false);
    a.c.send({ t: 'friendAdd', query: la.code.toLowerCase() });
    assert.match(String((await a.c.wait((m) => m.t === 'friendResult')).msg), /propre code/);
    // Demande par code (saisie sans tiret, minuscules) : Sirène est prévenue
    a.c.send({ t: 'friendAdd', query: lb.code.replace('-', ' ').toLowerCase() });
    assert.equal((await a.c.wait((m) => m.t === 'friendResult')).ok, true);
    assert.match(String((await b.c.wait((m) => m.t === 'notice')).msg), /Corsaire/);
    const pend = (await b.c.wait((m) => m.t === 'friends' && ((m.data as { incoming: unknown[] }).incoming.length > 0))).data as { incoming: Array<{ id: string; name: string }> };
    assert.equal(pend.incoming[0].name, 'Corsaire');
    // Acceptation : amis des deux côtés, statut en ligne
    b.c.send({ t: 'friendAnswer', id: a.id, accept: true });
    assert.equal((await b.c.wait((m) => m.t === 'friendResult')).ok, true);
    const fa = (await a.c.wait((m) => m.t === 'friends' && (m.data as { friends: unknown[] }).friends.length === 1)).data as { friends: Array<{ name: string; online: boolean }> };
    assert.equal(fa.friends[0].name, 'Sirène'); assert.equal(fa.friends[0].online, true);
    // Demande par pseudo vers quelqu'un qui m'a bloqué : refus neutre
    z.c.send({ t: 'block', id: a.id, on: true }); await z.c.wait((m) => m.t === 'notice');
    a.c.send({ t: 'friendAdd', query: 'Intrus' });
    assert.match(String((await a.c.wait((m) => m.t === 'friendResult')).msg), /Impossible/);
    // Déconnexion : statut hors ligne chez l'ami ; persistance en base
    b.c.close();
    const off = (await a.c.wait((m) => m.t === 'friends' && (m.data as { friends: Array<{ online: boolean }> }).friends[0]?.online === false)).data as { friends: Array<{ online: boolean }> };
    assert.equal(off.friends[0].online, false);
    assert.equal(store.friends(a.id)[0].id, b.id);
    assert.equal(store.accountByCode(lb.code), b.id);
    // Retrait
    a.c.send({ t: 'friendRemove', id: b.id });
    await a.c.wait((m) => m.t === 'friendResult');
    assert.equal(store.friends(a.id).length, 0);
    // Suppression de compte : code et demandes effacés
    a.c.send({ t: 'friendAdd', query: 'Intrus' }); await a.c.wait((m) => m.t === 'friendResult');
    store.deleteAccount(z.id);
    assert.equal(store.friendRequests(a.id).outgoing.length, 0);
    for (const p of [a, z]) p.c.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
