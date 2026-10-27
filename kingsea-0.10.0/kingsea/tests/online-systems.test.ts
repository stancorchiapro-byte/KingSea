// Systèmes en ligne du protocole 4, exécutés sur le vrai GameServer (sockets factices, horloge contrôlée) :
// tables multijoueurs (capacité, nouvelles instances, manches partagées, Crash, blackjack à places, déconnexions),
// messagerie privée, dons entre amis, visites de cabine et accès par double de clé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameServer, until, type Sock } from '../server/game';
import { MemoryStore } from '../server/store';
import { DEFAULT_LOOK } from '../src/art/characters';
import { PROTOCOL_VERSION, TERMS_VERSION } from '../src/net/protocol';
import { BET_WINDOW_MS, BJ_TURN_MS } from '../server/tables';
import { ROUND_SHOW_MS } from '../src/authority';

type Msg = Record<string, unknown> & { t: string };

class FakeSock implements Sock {
  inbox: Msg[] = [];
  closed = false;
  readonly ip = '127.0.0.1';
  send(d: string): void { this.inbox.push(JSON.parse(d)); }
  close(): void { this.closed = true; }
  take(t: string): Msg[] { const out = this.inbox.filter((m) => m.t === t); this.inbox = this.inbox.filter((m) => m.t !== t); return out; }
  last(t: string): Msg | undefined { const l = this.inbox.filter((m) => m.t === t); return l[l.length - 1]; }
}

function world() {
  let clock = 1_000_000_000;
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
  const store = new MemoryStore();
  const server = new GameServer(store, { now: () => clock, rng });
  let n = 0;
  const join = (name: string) => {
    const sock = new FakeSock();
    const c = server.connect(sock);
    const say = (m: unknown) => server.message(c, JSON.stringify(m));
    say({ t: 'hello', v: PROTOCOL_VERSION });
    say({ t: 'register', name, password: 'secret123', look: DEFAULT_LOOK, terms: TERMS_VERSION });
    const auth = sock.take('auth')[0];
    assert.ok(auth, `inscription de ${name}`);
    const id = (auth.profile as { id: string }).id;
    const req = (kind: string, game: string, action: string, input: unknown = {}) => {
      const rid = `r${++n}xyz`;
      say({ t: 'req', req: { kind, game, action, input, id: rid } });
      return sock.take('res').find((m) => m.id === rid)!.reply as { ok: boolean; error?: string; view: Record<string, unknown>; eco?: { chips: number; keys: Array<{ uid: string; master: boolean }>; inv: Record<string, number> }; balance: number };
    };
    const bet = (betData: unknown) => { const rid = `bet-${++n}-xyz`; say({ t: 'tableBet', id: rid, bet: betData }); return sock.take('res').find((m) => m.id === rid)!.reply as { ok: boolean; error?: string }; };
    const act = (a: unknown) => { const rid = `act-${++n}-xyz`; say({ t: 'tableAct', id: rid, act: a }); return sock.take('res').find((m) => m.id === rid)!.reply as { ok: boolean; error?: string }; };
    return { sock, c, id, say, req, bet, act, name };
  };
  const chips = (id: string, v?: number) => server.withProfile(id, (p) => { if (v !== undefined) p.chips = { balance: v, processedTx: p.chips?.processedTx ?? [] }; return p.chips?.balance ?? 0; })!;
  const coins = (id: string) => server.withProfile(id, (p) => p.wallet.balance)!;
  const friends = (a: string, b: string) => store.addFriendship(a, b, clock);
  const advance = (ms: number) => { const step = 100; for (let t = 0; t < ms; t += step) { clock += step; server.tables.tick(); } };
  return { server, store, join, chips, coins, friends, advance, now: () => clock };
}

const lastTable = (s: FakeSock) => s.last('table')?.state as { id: string; num: number; seats: Array<{ id: string; seat: number }>; phase: string; data: Record<string, unknown>; cap: number } | undefined;

test('tables : 5 places au plus, une nouvelle instance indépendante quand c’est plein, ami rejoint, départ', () => {
  const w = world();
  const ps = Array.from({ length: 7 }, (_, i) => w.join(`Joueur${i}`));
  for (const p of ps.slice(0, 5)) p.say({ t: 'tableJoin', game: 'roulette' });
  const t1 = lastTable(ps[4].sock)!;
  assert.equal(t1.cap, 5); assert.equal(t1.seats.length, 5);
  assert.deepEqual(t1.seats.map((s) => s.seat), [0, 1, 2, 3, 4], 'places distinctes');
  // Sixième joueur : table complète → une deuxième instance est créée
  ps[5].say({ t: 'tableJoin', game: 'roulette' });
  const t2 = lastTable(ps[5].sock)!;
  assert.notEqual(t2.id, t1.id); assert.equal(t2.num, 2); assert.equal(t2.seats.length, 1);
  assert.equal(w.server.tables.count('roulette'), 2);
  // Rejoindre une table pleine précise : refus clair
  ps[6].say({ t: 'tableJoin', game: 'roulette', instance: t1.id });
  assert.match(String(ps[6].sock.last('tableError')?.msg), /complète/);
  // Rejoindre un ami : à sa table (n° 2), pas la première libre
  w.friends(ps[6].id, ps[5].id);
  ps[6].say({ t: 'tableJoin', game: 'roulette', friend: ps[5].id });
  assert.equal(lastTable(ps[6].sock)!.id, t2.id);
  // Liste des tables avec amis présents
  ps[6].say({ t: 'tableList', game: 'roulette' });
  const list = ps[6].sock.last('tableList')!;
  assert.equal((list.tables as unknown[]).length, 2);
  assert.deepEqual((list.tables as Array<{ friends: string[]; players: number }>)[1], { ...(list.tables as Array<Record<string, unknown>>)[1], friends: ['Joueur5'], players: 2 });
  // Départ : la place se libère, l'instance vide disparaît
  ps[5].say({ t: 'tableLeave' }); ps[6].say({ t: 'tableLeave' });
  assert.equal(w.server.tables.count('roulette'), 1, 'instance supplémentaire vide supprimée');
  ps[0].say({ t: 'tableLeave' });
  ps[5].say({ t: 'tableJoin', game: 'roulette' });
  assert.equal(lastTable(ps[5].sock)!.id, t1.id, 'place libérée réutilisée');
});

test('roulette partagée : mises vérifiées par le serveur, un seul tirage commun, gains versés une fois', () => {
  const w = world();
  const a = w.join('Alba'), b = w.join('Brice'), c = w.join('Cyan');
  for (const p of [a, b, c]) { w.chips(p.id, 500); p.say({ t: 'tableJoin', game: 'roulette' }); }
  assert.equal(b.bet({ bets: [{ kind: { type: 'red' }, amount: 600 }] }).ok, false, 'pas au-delà du solde');
  assert.equal(w.chips(b.id), 500, 'rien débité sur refus');
  assert.ok(a.bet({ bets: [{ kind: { type: 'red' }, amount: 50 }] }).ok);
  assert.equal(a.bet({ bets: [{ kind: { type: 'black' }, amount: 50 }] }).ok, false, 'une seule mise par manche');
  assert.ok(b.bet({ bets: [{ kind: { type: 'black' }, amount: 50 }] }).ok);
  assert.equal(w.chips(a.id), 450);
  // Le troisième ne mise pas : la manche part à l'échéance
  w.advance(BET_WINDOW_MS + 200);
  const ra = a.sock.take('tableRound')[0], rb = b.sock.take('tableRound')[0], rc = c.sock.take('tableRound')[0];
  assert.ok(ra && rb && rc, 'tout le monde voit le tirage');
  assert.equal((ra.outcome as { result: number }).result, (rb.outcome as { result: number }).result, 'même numéro pour tous');
  assert.equal(rc.you, null, 'spectateur sans mise : aucune opération');
  const pa = (ra.you as { payout: number }).payout, pb = (rb.you as { payout: number }).payout;
  assert.equal(w.chips(a.id), 450 + pa); assert.equal(w.chips(b.id), 450 + pb);
  // Rouge et noir ne gagnent pas ensemble
  assert.ok(pa === 0 || pb === 0);
  // Pendant l'affichage : pas de mise, puis nouvelle manche
  assert.equal(a.bet({ bets: [{ kind: { type: 'red' }, amount: 10 }] }).ok, false);
  w.advance(ROUND_SHOW_MS.roulette + 200);
  assert.ok(a.bet({ bets: [{ kind: { type: 'red' }, amount: 10 }] }).ok);
});

test('Crash partagé : départ commun, encaissement à l’heure du serveur, perdants réglés, mise rendue si on part avant le vol', () => {
  const w = world();
  const a = w.join('Pilote'), b = w.join('Copilote');
  for (const p of [a, b]) { w.chips(p.id, 1000); p.say({ t: 'tableJoin', game: 'crash' }); }
  assert.ok(a.bet({ bet: 100, auto: null }).ok);
  assert.ok(b.bet({ bet: 100, auto: null }).ok);
  w.advance(1700);
  assert.equal(lastTable(a.sock)!.phase, 'flying');
  assert.equal(a.act({ move: 'cashout' }).ok, true, 'encaissement accepté en vol');
  assert.equal(a.act({ move: 'cashout' }).ok, false, 'pas deux fois');
  const gotA = w.chips(a.id);
  assert.ok(gotA >= 900 + 100, `gain au moins égal à la mise (${gotA})`);
  w.advance(120_000);
  const rb = b.sock.take('tableRound').find((m) => (m.outcome as { crashed?: boolean }).crashed)!;
  assert.ok(rb, 'fin du vol diffusée');
  assert.equal(w.chips(b.id), 900, 'mise perdue sans encaissement');
  assert.equal(w.chips(a.id), gotA, 'aucun double paiement');
});

test('blackjack à places : distribution multi-joueurs, tour de parole, délai, déconnexion, mises rendues avant donne', () => {
  const w = world();
  const a = w.join('Ana'), b = w.join('Ben'), c = w.join('Cléo');
  for (const p of [a, b, c]) { w.chips(p.id, 1000); p.say({ t: 'tableJoin', game: 'blackjack', tier: 'standard' }); }
  assert.equal(lastTable(a.sock)!.id, lastTable(c.sock)!.id, 'même table');
  assert.equal(a.bet({ bet: 5 }).ok, false, 'mise minimale de table');
  assert.ok(a.bet({ bet: 50 }).ok);
  assert.ok(b.bet({ bet: 50 }).ok);
  // Cléo part avant la donne : rien n'est débité (elle n'avait pas misé)
  c.say({ t: 'tableLeave' });
  w.advance(13_000);
  let st = lastTable(a.sock)!;
  const view = st.data.view as { hands: Array<{ seat: number; cards: unknown[] }>; phase: string } | null;
  assert.ok(view, 'main distribuée');
  assert.deepEqual([...new Set(view!.hands.map((h) => h.seat))].sort(), [0, 1], 'une main par joueur');
  // Hors de son tour : refus
  if (view!.phase === 'player') {
    const active = (st.data.view as { activeSeat: number }).activeSeat;
    const other = active === 0 ? b : a;
    assert.equal(other.act({ move: 'hit' }).ok, false, 'pas ton tour');
  }
  // Ben se déconnecte : sa place joue la règle de table ; Ana laisse filer son délai (reste automatiquement)
  w.server.disconnect(b.c);
  w.advance(BJ_TURN_MS * 3 + 15_000);
  const ra = a.sock.take('tableRound');
  assert.ok(ra.length >= 1, 'main réglée');
  const res = ra[0].players as Array<{ id: string; stake: number; payout: number }>;
  const mine = res.find((x) => x.id === a.id)!;
  assert.equal(w.chips(a.id), 1000 - mine.stake + mine.payout, 'solde = mise − perte + gain, une seule fois');
  const ben = res.find((x) => x.id === b.id)!;
  assert.equal(w.chips(b.id), 1000 - ben.stake + ben.payout, 'joueur déconnecté réglé correctement');
  st = lastTable(a.sock)!;
  assert.ok(['show', 'open'].includes(st.phase));
});

test('messagerie privée : amis seulement, persistée, non-lus, effacement personnel, blocage', () => {
  const w = world();
  const a = w.join('Lina'), b = w.join('Marc'), z = w.join('Zed');
  a.say({ t: 'dmSend', to: z.id, text: 'salut', nonce: 'n1' });
  assert.match(String(a.sock.last('dmError')?.msg), /amis/);
  w.friends(a.id, b.id);
  a.say({ t: 'dmSend', to: b.id, text: 'Rendez-vous au casino ?', nonce: 'n2' });
  assert.equal((a.sock.last('dm')!.msg as { text: string }).text, 'Rendez-vous au casino ?');
  assert.equal(a.sock.last('dm')!.nonce, 'n2');
  assert.equal((b.sock.last('dm')!.msg as { from: string }).from, a.id, 'reçu en direct');
  b.say({ t: 'dmList' });
  const l = b.sock.last('dmList')!;
  assert.equal(l.unread, 1);
  b.say({ t: 'dmRead', with: a.id });
  assert.equal(b.sock.last('dmList')!.unread, 0);
  b.say({ t: 'dmHistory', with: a.id });
  assert.equal((b.sock.last('dmHistory')!.msgs as unknown[]).length, 1);
  // Anti-spam : même message répété refusé
  a.say({ t: 'dmSend', to: b.id, text: 'Rendez-vous au casino ?', nonce: 'n3' });
  assert.ok(a.sock.last('dmError'));
  // Effacement chez Marc seulement
  b.say({ t: 'dmDelete', with: a.id });
  b.say({ t: 'dmHistory', with: a.id });
  assert.equal((b.sock.last('dmHistory')!.msgs as unknown[]).length, 0);
  a.say({ t: 'dmHistory', with: b.id });
  assert.equal((a.sock.last('dmHistory')!.msgs as unknown[]).length, 1, 'Lina garde son historique');
  // Contacts : surnom et favori
  a.say({ t: 'contact', id: b.id, nick: 'Marco', fav: true });
  assert.deepEqual(a.sock.last('contacts')!.list, [{ id: b.id, nick: 'Marco', fav: true }]);
  // Blocage : plus de messages
  b.say({ t: 'block', id: a.id, on: true });
  a.say({ t: 'dmSend', to: b.id, text: 'tu es là ?', nonce: 'n4' });
  assert.match(String(a.sock.last('dmError')?.msg), /Impossible/);
});

test('dons : KSCoins (1000 par 24 h glissantes), jetons réels, objets (2 par 24 h, ≤ 100), rejeu sans effet', () => {
  const w = world();
  const a = w.join('Donatrice'), b = w.join('Receveur'), z = w.join('Inconnu');
  w.server.withProfile(a.id, (p) => { p.wallet.balance = 5000; p.chips!.balance = 300; });
  a.say({ t: 'gift', to: z.id, gift: { kind: 'coins', amount: 10 }, tx: 'tx-000001' });
  assert.match(String(a.sock.last('giftResult')!.msg), /amis/);
  w.friends(a.id, b.id);
  const b0 = w.coins(b.id);
  a.say({ t: 'gift', to: b.id, gift: { kind: 'coins', amount: 600 }, tx: 'tx-000002' });
  let r = a.sock.last('giftResult')!;
  assert.equal(r.ok, true);
  assert.equal((r.allowance as { coinsLeft: number }).coinsLeft, 400);
  assert.equal(w.coins(b.id), b0 + 600);
  assert.equal(b.sock.last('giftIn')!.name, 'Donatrice', 'destinataire notifié');
  // Rejeu du même identifiant : même réponse, rien de plus
  a.say({ t: 'gift', to: b.id, gift: { kind: 'coins', amount: 600 }, tx: 'tx-000002' });
  assert.equal(w.coins(b.id), b0 + 600);
  a.say({ t: 'gift', to: b.id, gift: { kind: 'coins', amount: 500 }, tx: 'tx-000003' });
  assert.match(String(a.sock.last('giftResult')!.msg), /encore donner 400/);
  a.say({ t: 'gift', to: b.id, gift: { kind: 'coins', amount: 400 }, tx: 'tx-000004' });
  assert.equal(a.sock.last('giftResult')!.ok, true);
  a.say({ t: 'gift', to: b.id, gift: { kind: 'coins', amount: 1 }, tx: 'tx-000005' });
  r = a.sock.last('giftResult')!;
  assert.equal(r.ok, false);
  assert.ok(((r.allowance as { coinsIn: number }).coinsIn) > 0, 'délai avant renouvellement affiché');
  // Jetons : transférés tels quels (aucune conversion)
  const bc = w.chips(b.id);
  a.say({ t: 'gift', to: b.id, gift: { kind: 'chips', amount: 250 }, tx: 'tx-000006' });
  assert.equal(w.chips(a.id), 50); assert.equal(w.chips(b.id), bc + 250);
  a.say({ t: 'gift', to: b.id, gift: { kind: 'chips', amount: 51 }, tx: 'tx-000007' });
  assert.equal(a.sock.last('giftResult')!.ok, false, 'pas au-delà du solde de jetons');
  // Objets : non transférables bloqués, valeur ≤ 100, deux par 24 h
  a.say({ t: 'gift', to: b.id, gift: { kind: 'item', item: 'ks-pass' }, tx: 'tx-000008' });
  assert.equal(a.sock.last('giftResult')!.ok, false);
  w.server.withProfile(a.id, (p) => { p.inventory!.items['use.confetti'] = 3; });
  for (const [i, ok] of [[9, true], [10, true], [11, false]] as const) {
    a.say({ t: 'gift', to: b.id, gift: { kind: 'item', item: 'use.confetti' }, tx: `tx-0000${i}` });
    assert.equal(a.sock.last('giftResult')!.ok, ok, `objet n° ${i}`);
  }
  assert.equal(w.server.withProfile(b.id, (p) => p.inventory!.items['use.confetti']), 2);
  // Historique des transferts
  a.say({ t: 'giftInfo' });
  assert.ok((a.sock.last('giftInfo')!.history as unknown[]).length >= 5);
});

test('visites : sonnette, acceptation, entrée dans la bonne cabine, refus, porte fermée, double de clé, raccompagner', () => {
  const w = world();
  const host = w.join('Hôte'), guest = w.join('Invité'), other = w.join('Autre');
  for (const p of [host, guest, other]) { p.req('purser', 'purser', 'gift'); }
  host.say({ t: 'cabin' }); const cabin = host.sock.last('cabin')!.id as string;
  assert.ok(cabin);
  guest.say({ t: 'visitAsk', to: host.id });
  assert.match(String(guest.sock.last('visitReply')!.msg), /amis/);
  w.friends(host.id, guest.id); w.friends(host.id, other.id);
  // Sans invitation : porte fermée
  guest.say({ t: 'join', floor: 'cabin-interior', x: 200, y: 200, cabin: host.id });
  assert.match(String(guest.sock.last('evict')!.msg), /fermée/);
  host.say({ t: 'join', floor: 'cabin-interior', x: 200, y: 200 });
  guest.say({ t: 'visitAsk', to: host.id });
  assert.equal(host.sock.last('visitRing')!.from, guest.id, 'sonnette reçue par le propriétaire');
  host.say({ t: 'visitAnswer', from: guest.id, accept: true });
  assert.equal(guest.sock.last('visitReply')!.owner, host.id);
  guest.say({ t: 'join', floor: 'cabin-interior', x: 200, y: 200, cabin: host.id });
  const room = guest.sock.last('room')!;
  assert.equal((room.visit as { cabin: string }).cabin, cabin, 'bonne cabine');
  assert.equal((room.players as Array<{ id: string }>)[0].id, host.id, 'le propriétaire est là');
  assert.deepEqual((host.sock.last('visitors')!.list as Array<{ id: string }>).map((x) => x.id), [guest.id]);
  // Le propriétaire raccompagne
  host.say({ t: 'visitKick', id: guest.id });
  assert.match(String(guest.sock.last('evict')!.msg), /raccompagné/);
  // Refus
  other.say({ t: 'visitAsk', to: host.id });
  host.say({ t: 'visitAnswer', from: other.id, accept: false });
  assert.equal(other.sock.last('visitReply')!.ok, false);
  // Double de clé : fabriqué chez le serrurier, donné, ouvre la porte sans sonner
  w.server.withProfile(host.id, (p) => { p.wallet.balance = 1000; });
  const made = host.req('purser', 'purser', 'key-copy');
  assert.ok(made.ok, made.error);
  const uid = (made.view.key as { uid: string }).uid;
  host.say({ t: 'gift', to: guest.id, gift: { kind: 'key', uid }, tx: 'tx-key-0001' });
  assert.equal(host.sock.last('giftResult')!.ok, true);
  guest.say({ t: 'join', floor: 'cabin-interior', x: 200, y: 200, cabin: host.id });
  assert.equal((guest.sock.last('room')!.visit as { owner: string }).owner, host.id, 'le double ouvre');
  // La clé principale ne se donne pas
  const master = w.server.withProfile(host.id, (p) => p.keys!.find((k) => k.master)!.uid)!;
  host.say({ t: 'gift', to: guest.id, gift: { kind: 'key', uid: master }, tx: 'tx-key-0002' });
  assert.match(String(host.sock.last('giftResult')!.msg), /personnelle/);
  // Changement de serrure : le double donné n'ouvre plus
  guest.say({ t: 'join', floor: 'hub', x: 200, y: 200 });
  assert.ok(host.req('purser', 'purser', 'lock-change').ok);
  guest.say({ t: 'join', floor: 'cabin-interior', x: 200, y: 200, cabin: host.id });
  assert.match(String(guest.sock.last('evict')!.msg), /fermée/);
  // Porte verrouillée : plus de sonnette
  host.say({ t: 'door', open: false });
  other.say({ t: 'visitAsk', to: host.id });
  assert.match(String(other.sock.last('visitReply')!.msg), /fermé sa porte/);
});

test('accès aux ponts et emotes vérifiés par le serveur ; sanctions sans heure d’horloge', () => {
  const w = world();
  const a = w.join('Nouvelle'), b = w.join('Témoin');
  a.say({ t: 'join', floor: 'casino', x: 200, y: 200 });
  assert.match(String(a.sock.last('notice')!.msg), /KS Pass/);
  a.req('purser', 'purser', 'gift');
  a.say({ t: 'join', floor: 'panorama', x: 200, y: 200 });
  assert.match(String(a.sock.last('notice')!.msg), /niveau 10/);
  a.say({ t: 'join', floor: 'hub', x: 17 * 32, y: 4 * 32 }); b.say({ t: 'join', floor: 'hub', x: 17 * 32, y: 4 * 32 });
  b.sock.take('emote');
  a.say({ t: 'emote', e: 'laugh' });
  assert.equal(b.sock.last('emote')!.e, 'laugh');
  w.advance(1000);
  a.say({ t: 'emote', e: 'captain' });
  assert.match(String(a.sock.last('notice')!.msg), /débloquée/);
  a.say({ t: 'emote', e: 'inexistante' });
  assert.equal(until(w.now() + 90 * 60_000, w.now()), 'pour encore 1 h 30 min');
  assert.doesNotMatch(until(w.now() + 3 * 86_400_000, w.now()), /\d{1,2}:\d{2}/);
});

test('blackjack partagé : plusieurs mains par joueur dans la limite de 5 places, comptes exacts', () => {
  const w = world();
  const a = w.join('Multi'), b = w.join('Voisin');
  for (const p of [a, b]) { w.chips(p.id, 1000); p.say({ t: 'tableJoin', game: 'blackjack', tier: 'standard' }); }
  // Une place reste gardée pour le voisin qui n'a pas encore misé : 4 au plus pour Multi
  assert.equal((lastTable(a.sock)!.data as { freeBoxes: number }).freeBoxes, 4);
  assert.match(String(a.bet({ bets: [25, 25, 25, 25, 25] }).error), /Places libres à cette table : 4/);
  assert.equal(w.chips(a.id), 1000, 'rien prélevé au refus');
  assert.ok(a.bet({ bets: [25, 50, 100] }).ok);
  assert.equal(w.chips(a.id), 1000 - 175, 'les trois mises prélevées ensemble');
  assert.match(String(b.bet({ bets: [25, 25, 25] }).error), /Places libres à cette table : 2/);
  assert.ok(b.bet({ bets: [25] }).ok);
  w.advance(500);
  const st = lastTable(a.sock)!;
  const view = st.data.view as { hands: Array<{ seat: number }> };
  assert.deepEqual((st.data as { myBoxes: number[] }).myBoxes, [0, 1, 2], 'Multi joue les places 1 à 3');
  assert.ok(view.hands.length >= 4, 'quatre mains principales distribuées');
  // Les deux joueurs laissent filer leurs délais : la règle de table (rester) s'applique, puis le croupier
  w.advance(BJ_TURN_MS * 8 + 15_000);
  const ra = a.sock.take('tableRound')[0], rb = b.sock.take('tableRound')[0];
  const pa = (ra.players as Array<{ id: string; stake: number; payout: number }>).find((x) => x.id === a.id)!;
  const pb = (rb.players as Array<{ id: string; stake: number; payout: number }>).find((x) => x.id === b.id)!;
  assert.equal(pa.stake, 175);
  assert.equal(w.chips(a.id), 1000 - pa.stake + pa.payout, 'Multi : total des trois mains, versé une fois');
  assert.equal(w.chips(b.id), 1000 - pb.stake + pb.payout);
});

test('tables : après un redémarrage du serveur (manches renumérotées depuis 1), aucun identifiant de transaction n’est réutilisé — chaque gain est versé', () => {
  const w = world();
  const a = w.join('Rejoue');
  w.chips(a.id, 1000);
  a.say({ t: 'tableJoin', game: 'blackjack', tier: 'debutant' });
  const playOnce = () => {
    // Main gagnante imposée (20 contre 17) : le gain doit être versé à chaque fois
    const t = w.server.tables.tableOf(a.id) as unknown as { shoe: { stack(c: unknown[]): void } };
    t.shoe.stack([{ rank: 10, suit: '♠' }, { rank: 10, suit: '♥' }, { rank: 13, suit: '♦' }, { rank: 7, suit: '♣' }]);
    const before = w.chips(a.id);
    const r = a.bet({ bets: [10] });
    assert.ok(r.ok, `mise acceptée : ${r.error ?? ''}`);
    w.advance(BJ_TURN_MS * 3 + 15_000);
    const round = a.sock.take('tableRound').at(-1)!;
    const me = (round.players as Array<{ id: string; stake: number; payout: number }>).find((x) => x.id === a.id)!;
    assert.equal(me.payout, 20, 'main gagnante : 10 misés, 20 rendus');
    assert.equal(w.chips(a.id), before - me.stake + me.payout, `solde = avant − mise + retour (mise ${me.stake}, retour ${me.payout})`);
  };
  playOnce();
  for (let i = 0; i < 4; i++) {
    // Redémarrage simulé : toutes les tables disparaissent et sont recréées (table n° 1, manche 1) ; l'historique
    // glissant du joueur a déjà perdu la mise ancienne mais garde encore son gain
    a.say({ t: 'tableLeave' });
    (w.server.tables as unknown as { tables: Map<string, unknown> }).tables.clear();
    w.server.withProfile(a.id, (p) => { p.chips!.processedTx = p.chips!.processedTx.filter((x) => !x.endsWith(':mise')); });
    a.say({ t: 'tableJoin', game: 'blackjack', tier: 'debutant' });
    assert.equal(lastTable(a.sock)!.num, 1, 'table recréée sous le même numéro');
    playOnce();
  }
});
