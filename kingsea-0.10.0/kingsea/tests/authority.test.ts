import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abandonSession, activeSessions, handle, parseRequest, type AuthEnv, type AuthState } from '../src/authority/index';
import { crashDuration } from '../src/authority/casino';

function lcg(seed: number) { let s = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
// Les jeux du casino se jouent en jetons (caisse du casino) ; `balance` règle ici les deux soldes (KSCoins et jetons).
const fresh = (balance = 1000): AuthState => ({ wallet: { balance, processedTx: [] }, chips: { balance, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {} });
let n = 0;
const env = (over: Partial<AuthEnv> = {}): AuthEnv => ({ rng: lcg(42 + n), now: 1_000_000, day: '2026-10-23', ...over });
const req = (kind: 'casino' | 'purser', game: string, action: string, input: unknown, id = `r${++n}x`) => ({ kind, game, action, input, id });

test('roulette : mise prélevée, gain versé, solde exact', () => {
  const s = fresh();
  const r = handle(s, req('casino', 'roulette', 'play', { bets: [{ kind: { type: 'red' }, amount: 10 }, { kind: { type: 'number', n: 7 }, amount: 5 }] }), env());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.stake, 15);
  assert.equal(s.chips!.balance, 1000 - 15 + r.payout);
  const res = r.view.result as number;
  const expected = (res === 7 ? 5 * 36 : 0) + ([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(res) ? 20 : 0);
  assert.equal(r.payout, expected);
  assert.equal(s.stats['plays.roulette'], 1);
});

test('mises invalides ou trop chères : refusées sans rien modifier', () => {
  const s = fresh(20);
  for (const input of [{ bets: [] }, { bets: [{ kind: { type: 'number', n: 40 }, amount: 5 }] }, { bets: [{ kind: { type: 'red' }, amount: 2.5 }] }, { bets: [{ kind: { type: 'red' }, amount: 30 }] }, { bets: 'tout' }]) {
    const r = handle(s, req('casino', 'roulette', 'play', input), env());
    assert.equal(r.ok, false);
    assert.equal(s.chips!.balance, 20);
  }
  assert.deepEqual(s.chips!.processedTx, ['chips:welcome'], 'aucune transaction de jetons');
  assert.equal(handle(s, req('casino', 'inconnu', 'play', {}), env()).ok, false);
});

test('même requête rejouée (réseau qui renvoie) : jamais payée deux fois', () => {
  const s = fresh();
  const q = req('casino', 'plinko', 'play', { bet: 10 });
  const a = handle(s, q, env());
  const after = s.chips!.balance;
  const b = handle(s, q, env());
  assert.ok(a.ok); assert.equal(b.ok, false);
  assert.equal(s.chips!.balance, after);
});

test('machines, baccarat, craps, keno, Direct Poker : réglés en une opération', () => {
  const s = fresh(5000);
  const cases: Array<[string, unknown]> = [
    ['slots', { machine: 'pirates', bet: 10 }], ['baccarat', { bets: { banker: 20, tie: 5 } }], ['craps', { bets: { pass: 10, field: 5 } }],
    ['keno', { picks: [1, 2, 3, 40], bet: 10 }], ['direct-poker', { bet: 10 }], ['plinko', { bet: 10 }],
  ];
  for (const [game, input] of cases) {
    const before = s.chips!.balance;
    const r = handle(s, req('casino', game, 'play', input), env());
    assert.ok(r.ok, game);
    // Les montées de niveau versent des KSCoins : le solde de jetons ne bouge que de la mise et du gain
    if (r.ok) { assert.equal(s.chips!.balance, before - r.stake + r.payout, game); assert.equal(r.done, true); }
  }
  assert.equal(activeSessions(s).length, 0);
  assert.equal(handle(s, req('casino', 'keno', 'play', { picks: [1, 1], bet: 10 }), env()).ok, false);
  assert.equal(handle(s, req('casino', 'slots', 'play', { machine: 'fausse', bet: 10 }), env()).ok, false);
});

test('blackjack : carte cachée et sabot jamais envoyés, mises supplémentaires, règlement', () => {
  for (let k = 0; k < 40; k++) {
    const s = fresh();
    const e = env({ rng: lcg(k + 1) });
    const r = handle(s, req('casino', 'blackjack-hilo', 'deal', { bet: 20 }), e);
    assert.ok(r.ok); if (!r.ok) return;
    let v = r.view;
    assert.equal((v as Record<string, unknown>).shoe, undefined);
    if (v.phase === 'insurance') {
      const ri = handle(s, req('casino', 'blackjack-hilo', 'act', { move: 'insurance', take: false }), e);
      assert.ok(ri.ok); if (!ri.ok) return; v = ri.view;
    }
    if (v.phase === 'player') {
      assert.equal((v.dealer as Array<{ rank: number }>)[1].rank, 0, 'carte cachée masquée');
      assert.equal(JSON.stringify(v).includes('"cards":[') && JSON.stringify(s.sessions['blackjack-hilo'].data).length > 0, true);
      const can = v.can as Record<string, boolean>;
      const move = can.double ? 'double' : 'stand';
      const before = s.chips!.balance;
      const r2 = handle(s, req('casino', 'blackjack-hilo', 'act', { move }), e);
      assert.ok(r2.ok); if (!r2.ok) return;
      if (move === 'double') assert.equal(before - s.chips!.balance + (r2.done ? r2.payout : 0), 20);
      if (r2.done) assert.equal(activeSessions(s).length, 0);
      else { const r3 = handle(s, req('casino', 'blackjack-hilo', 'act', { move: 'stand' }), e); assert.ok(r3.ok); }
    }
    assert.equal(typeof (handle(s, req('casino', 'blackjack-hilo', 'deal', { bet: 10 }), e) as { view?: { running?: number } }).view?.running, 'number');
  }
});

test('blackjack abandonné : le joueur absent reste, le croupier termine, gain versé une fois', () => {
  let found = false;
  for (let k = 0; k < 30 && !found; k++) {
    const s = fresh();
    const e = env({ rng: lcg(100 + k) });
    const r = handle(s, req('casino', 'blackjack', 'deal', { bet: 50 }), e);
    if (!r.ok || r.done) continue;
    found = true;
    const before = s.chips!.balance;
    const pay = abandonSession(s, 'blackjack', e);
    assert.equal(s.chips!.balance, before + pay);
    assert.equal(abandonSession(s, 'blackjack', e), 0);
    assert.equal(activeSessions(s).length, 0);
  }
  assert.ok(found);
});

test('Crash : multiplicateur selon l\'horloge de l\'autorité, encaissement, écrasement, encaissement auto', () => {
  // Encaissement juste après le départ
  let s = fresh(); let e = env({ rng: lcg(7), now: 0 });
  assert.ok(handle(s, req('casino', 'crash', 'start', { bet: 10, auto: null }), e).ok);
  const point = s.sessions.crash.data.point as number;
  const st = handle(s, req('casino', 'crash', 'status', {}), { ...e, now: 200 });
  assert.ok(st.ok);
  const c = handle(s, req('casino', 'crash', 'cashout', {}), { ...e, now: 500 });
  assert.ok(c.ok); if (!c.ok) return;
  if (point > 1.06) { assert.ok(c.view.cashedAt as number >= 1); assert.equal(s.chips!.balance, 990 + c.payout); }
  // Écrasement si on attend trop
  s = fresh(); e = env({ rng: lcg(9), now: 0 });
  handle(s, req('casino', 'crash', 'start', { bet: 10, auto: null }), e);
  const p2 = s.sessions.crash.data.point as number;
  const late = handle(s, req('casino', 'crash', 'cashout', {}), { ...e, now: crashDuration(p2) + 50 });
  assert.ok(late.ok); if (late.ok) { assert.equal(late.view.crashed, true); assert.equal(late.payout, 0); }
  assert.equal(s.chips!.balance, 990);
  // Encaissement automatique à ×2
  let ok = false;
  for (let k = 0; k < 20 && !ok; k++) {
    s = fresh(); e = env({ rng: lcg(200 + k), now: 0 });
    handle(s, req('casino', 'crash', 'start', { bet: 10, auto: 2 }), e);
    if ((s.sessions.crash.data.point as number) < 2) continue;
    ok = true;
    const r = handle(s, req('casino', 'crash', 'status', {}), { ...e, now: crashDuration(2) + 20 });
    assert.ok(r.ok); if (r.ok) assert.equal(r.payout, 20);
    assert.equal(s.chips!.balance, 1010);
  }
  assert.ok(ok);
});

test('poker et courses : étapes dans l\'ordre, cotes fixées par l\'autorité', () => {
  const s = fresh();
  assert.equal(handle(s, req('casino', 'poker', 'draw', { held: [true, true, true, true, true] }), env()).ok, false);
  const d = handle(s, req('casino', 'poker', 'deal', { bet: 10 }), env());
  assert.ok(d.ok);
  const dr = handle(s, req('casino', 'poker', 'draw', { held: [true, false, true, false, true] }), env());
  assert.ok(dr.ok); if (dr.ok && d.ok) { assert.deepEqual((dr.view.hand as unknown[])[0], (d.view.hand as unknown[])[0]); }
  assert.equal(handle(s, req('casino', 'races', 'run', { bets: { 0: 10 } }), env()).ok, false, 'pas de course sans partants');
  const f = handle(s, req('casino', 'races', 'field', {}), env());
  assert.ok(f.ok);
  assert.equal(handle(s, req('casino', 'races', 'run', { bets: { 9: 10 } }), env()).ok, false);
  const before = s.chips!.balance;
  const run = handle(s, req('casino', 'races', 'run', { bets: { 0: 10, 2: 10 } }), env());
  assert.ok(run.ok); if (run.ok) assert.equal(s.chips!.balance, before - 20 + run.payout);
});

test('commissaire : cadeau et objet trouvé une seule fois, roue une fois par jour, achats au prix officiel', () => {
  const s = fresh(100);
  const g1 = handle(s, req('purser', 'purser', 'gift', {}), env());
  const g2 = handle(s, req('purser', 'purser', 'gift', {}), env());
  assert.ok(g1.ok && g2.ok); assert.equal(s.wallet.balance, 200);
  handle(s, req('purser', 'purser', 'find', { id: 'golden-compass' }), env());
  handle(s, req('purser', 'purser', 'find', { id: 'golden-compass' }), env());
  assert.equal(s.wallet.balance, 275);
  assert.equal(handle(s, req('purser', 'purser', 'find', { id: 'tresor-invente' }), env()).ok, false);
  const w1 = handle(s, req('purser', 'purser', 'wheel', {}), env());
  assert.ok(w1.ok);
  assert.equal(handle(s, req('purser', 'purser', 'wheel', {}), env()).ok, false);
  assert.ok(handle(s, req('purser', 'purser', 'wheel', {}), env({ day: '2026-10-24' })).ok);
  const b0 = s.wallet.balance;
  const buy = handle(s, req('purser', 'purser', 'buy', { menu: 'hub', id: 'ecume' }), env());
  assert.ok(buy.ok); assert.equal(s.wallet.balance, b0 - 35);
  assert.equal(handle(s, req('purser', 'purser', 'buy', { menu: 'hub', id: 'gratuit' }), env()).ok, false);
});

test('arcade : récompense calculée par l\'autorité, plafond quotidien, score impossible refusé', () => {
  const s = fresh(0);
  let total = 0;
  for (let i = 0; i < 10; i++) { const r = handle(s, req('purser', 'purser', 'arcade', { game: 'bowling', score: 250 }), env()); if (r.ok) total += r.payout; }
  assert.equal(total, 120);
  assert.equal(s.stats['best.bowling'], 250);
  assert.equal(handle(s, req('purser', 'purser', 'arcade', { game: 'bowling', score: 9999 }), env()).ok, false);
  assert.equal(handle(s, req('purser', 'purser', 'arcade', { game: 'football', score: 11 }), env()).ok, false);
  const r = handle(s, req('purser', 'purser', 'arcade', { game: 'bowling', score: 100 }), env({ day: '2026-10-24' }));
  assert.ok(r.ok); if (r.ok) assert.equal(r.payout, 20);
  assert.equal(handle(s, req('purser', 'purser', 'flag', { key: 'found.golden-compass', value: true }), env()).ok, false);
  assert.ok(handle(s, req('purser', 'purser', 'flag', { key: 'cabin.dim', value: true }), env()).ok);
});

test('requêtes réseau mal formées : rejetées', () => {
  assert.equal(parseRequest(null), null);
  assert.equal(parseRequest({ kind: 'casino', game: 'roulette', action: 'play', id: 'x' }), null);
  assert.equal(parseRequest({ kind: 'admin', game: 'x', action: 'y', id: 'abcd' }), null);
  assert.ok(parseRequest({ kind: 'casino', game: 'roulette', action: 'play', id: 'abc-123' }));
});
