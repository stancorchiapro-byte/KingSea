// Réception : remise du KS Pass Croisière, des KSCoins de bienvenue et de la clé de cabine (autorité, hors ligne
// et sur le vrai serveur) — une seule fois chacun, clé de la bonne cabine, accès à la cabine, interactions répétées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import { handle, RECEPTION_GIFT, xpForLevel, type AuthEnv, type AuthState } from '../src/authority/index';
import { GameServer, type Sock } from '../server/game';
import { MemoryStore } from '../server/store';
import { DEFAULT_LOOK } from '../src/art/characters';
import { PROTOCOL_VERSION, TERMS_VERSION } from '../src/net/protocol';

const env = (): AuthEnv => ({ rng: seededRandom(1), now: 1_000_000, day: '2026-10-27', seed: 'passager-1' });
let n = 0;
const gift = (s: AuthState) => handle(s, { kind: 'purser', game: 'purser', action: 'gift', input: {}, id: `rec${++n}xx` }, env());
const fresh = (cabin: string | null): AuthState => ({
  wallet: { balance: 0, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {}, cabin: { id: cabin },
  progress: { xp: xpForLevel(1), level: 1 } as unknown as AuthState['progress'],
});

test('réception : pass, KSCoins et clé de SA cabine remis ensemble, une seule fois', () => {
  const s = fresh('304');
  // Avant la réception : cabine attribuée, mais pas encore de clé
  handle(s, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: `rec${++n}xx` }, env());
  assert.equal((s.keys ?? []).filter((k) => k.master).length, 0, 'aucune clé avant la réception');
  const r = gift(s);
  assert.ok(r.ok);
  const v = r.view as { granted: number; key: { cabin: string; owner: string; master: boolean } | null; keyNew: boolean; pass: boolean };
  assert.equal(v.granted, RECEPTION_GIFT); assert.equal(s.wallet.balance, RECEPTION_GIFT);
  assert.equal(s.inventory!.items['ks-pass'], 1);
  assert.ok(v.key && v.keyNew); assert.equal(v.key!.cabin, '304'); assert.equal(v.key!.owner, 'passager-1'); assert.equal(v.key!.master, true);
  // Interaction répétée : rien n'est reversé, aucune clé en double
  for (let i = 0; i < 3; i++) {
    const again = gift(s);
    assert.ok(again.ok);
    const av = again.view as { granted: number; keyNew: boolean; already: boolean };
    assert.equal(av.granted, 0); assert.equal(av.keyNew, false); assert.equal(av.already, true);
  }
  assert.equal(s.wallet.balance, RECEPTION_GIFT);
  assert.equal(s.inventory!.items['ks-pass'], 1);
  assert.equal(s.keys!.filter((k) => k.master).length, 1, 'une seule clé principale');
  // Sauvegarde puis rechargement : l'état est reconnu
  const reloaded = JSON.parse(JSON.stringify(s)) as AuthState;
  const after = gift(reloaded);
  assert.ok(after.ok); assert.equal((after.view as { granted: number }).granted, 0); assert.equal(reloaded.keys!.filter((k) => k.master).length, 1);
});

test('réception sans cabine libre : pass et KSCoins remis, clé remise plus tard au même comptoir', () => {
  const s = fresh(null);
  const r = gift(s);
  assert.ok(r.ok);
  assert.equal((r.view as { key: unknown }).key, null);
  assert.equal(s.wallet.balance, RECEPTION_GIFT);
  s.cabin = { id: '210' };
  const later = gift(s);
  const v = later.view as { granted: number; key: { cabin: string } | null; keyNew: boolean };
  assert.equal(v.granted, 0, 'pas de second versement');
  assert.ok(v.keyNew); assert.equal(v.key!.cabin, '210');
});

test('profil antérieur : une clé principale déjà détenue est conservée sans passer par la réception', () => {
  const s = fresh('118');
  s.keys = [{ uid: 'master-passager-1-118', cabin: '118', owner: 'passager-1', master: true, name: 'Clé de la cabine 118', lock: 1 }];
  handle(s, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: `rec${++n}xx` }, env());
  assert.equal(s.keys.filter((k) => k.master).length, 1);
});

// ---------------------------------------------------------------- serveur (en ligne)
class FakeSock implements Sock {
  inbox: Array<Record<string, unknown> & { t: string }> = [];
  readonly ip = '127.0.0.1';
  send(d: string): void { this.inbox.push(JSON.parse(d)); }
  close(): void {}
  take(t: string) { const out = this.inbox.filter((m) => m.t === t); this.inbox = this.inbox.filter((m) => m.t !== t); return out; }
}

test('serveur : la réception attribue la cabine, remet sa clé ; la cabine ne s’ouvre qu’avec la clé', () => {
  let clock = 1_000_000_000;
  const server = new GameServer(new MemoryStore(), { now: () => clock, rng: seededRandom(4) });
  const join = (name: string) => {
    const sock = new FakeSock(), c = server.connect(sock);
    const say = (m: unknown) => server.message(c, JSON.stringify(m));
    say({ t: 'hello', v: PROTOCOL_VERSION });
    say({ t: 'register', name, password: 'secret123', look: DEFAULT_LOOK, terms: TERMS_VERSION });
    const id = ((sock.take('auth')[0].profile) as { id: string }).id;
    const req = (action: string) => { const rid = `r${++n}srv`; say({ t: 'req', req: { kind: 'purser', game: 'purser', action, input: {}, id: rid } }); return sock.take('res').find((m) => m.id === rid)!.reply as { ok: boolean; view: Record<string, unknown>; eco: { keys: Array<{ master: boolean; cabin: string }> } }; };
    return { sock, say, id, req };
  };
  const a = join('Arrivee');
  // Cabine demandée avant la réception (couloir des logements) : attribuée, porte fermée sans clé
  a.say({ t: 'cabin' });
  const cab = a.sock.take('cabin')[0];
  assert.ok(cab.id, 'cabine attribuée');
  a.say({ t: 'join', floor: 'cabin-interior', x: 100, y: 100 });
  const ev = a.sock.take('evict')[0] ?? a.sock.take('notice')[0];
  assert.ok(ev && /réception/.test(String(ev.msg)), `accès refusé sans clé : ${JSON.stringify(ev)}`);
  const r = a.req('gift');
  assert.ok(r.ok);
  const keys = r.eco.keys.filter((k) => k.master);
  assert.equal(keys.length, 1); assert.equal(keys[0].cabin, cab.id, 'clé de la cabine attribuée');
  a.sock.take('room');
  a.say({ t: 'join', floor: 'cabin-interior', x: 100, y: 100 });
  assert.equal(a.sock.take('room').length, 1, 'cabine ouverte avec la clé');
  // Nouveau passager allant directement à la réception : cabine attribuée par la réception
  const b = join('Directe');
  const rb = b.req('gift');
  assert.ok(rb.ok);
  assert.ok((rb.view as { key: unknown }).key, 'clé remise');
  assert.ok(b.sock.take('cabin')[0]?.id, 'cabine annoncée au téléphone');
  const again = b.req('gift');
  assert.equal((again.view as { granted: number }).granted, 0);
  assert.equal(again.eco.keys.filter((k) => k.master).length, 1);
  clock += 1000;
});
