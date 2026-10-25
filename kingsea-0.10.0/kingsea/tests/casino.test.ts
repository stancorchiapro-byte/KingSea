import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import { SUITS, Shoe, type Card } from '../src/games/logic/cards.ts';
import { evaluate, payout, DIRECT_POKER, JACKS_OR_BETTER } from '../src/games/logic/poker.ts';
import { SLOT_MACHINES, machineRtp, lineReturnRanks } from '../src/games/logic/slotMachines.ts';
import { kenoRtp, KENO_PAY, kenoReturn, drawKeno } from '../src/games/logic/keno.ts';
import { bacTotal, bacSettle, playBaccarat } from '../src/games/logic/baccarat.ts';
import { crapsSettle, playCraps, fieldReturn } from '../src/games/logic/craps.ts';
import { plinkoRtp, plinkoPath, plinkoSlot, PLINKO_MULT, PLINKO_TABLES, plinkoReturn } from '../src/games/logic/plinko.ts';
import { crashPoint, crashReturn, crashMultiplier, timeToReach } from '../src/games/logic/crash.ts';
import { makeField, raceOrder, raceReturn } from '../src/games/logic/races.ts';
import { Blackjack } from '../src/games/logic/blackjack.ts';
import { resolvePending, isPendingRound } from '../src/games/logic/pending.ts';
import { migrate } from '../src/systems/PlayerData.ts';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });

// ---------------------------------------------------------------- poker
test('poker : évaluation des 10 catégories', () => {
  assert.equal(evaluate([C(1), C(13), C(12), C(11), C(10)]).name, 'Quinte flush royale');
  assert.equal(evaluate([C(9), C(13), C(12), C(11), C(10)]).rank, 8);
  assert.equal(evaluate([C(5, '♥'), C(5, '♦'), C(5, '♣'), C(5), C(2)]).rank, 7);
  assert.equal(evaluate([C(5, '♥'), C(5, '♦'), C(5), C(9), C(9, '♥')]).rank, 6);
  assert.equal(evaluate([C(2), C(7), C(9), C(11), C(4)]).rank, 5);
  assert.equal(evaluate([C(1, '♥'), C(2), C(3), C(4), C(5)]).rank, 4); // roue
  assert.equal(evaluate([C(10, '♥'), C(11), C(12), C(13), C(1)]).rank, 4);
  assert.equal(evaluate([C(7, '♥'), C(7), C(7, '♦'), C(2), C(3)]).rank, 3);
  assert.equal(evaluate([C(7, '♥'), C(7), C(2, '♦'), C(2), C(3)]).rank, 2);
  assert.equal(evaluate([C(1, '♥'), C(1), C(2, '♦'), C(5), C(3)]).pairValue, 14);
  assert.equal(evaluate([C(1, '♥'), C(13), C(2, '♦'), C(5), C(3)]).rank, 0);
});

test('poker : « Valets ou mieux » ne paie pas une paire de 10', () => {
  assert.equal(payout(JACKS_OR_BETTER, evaluate([C(10, '♥'), C(10), C(2, '♦'), C(5), C(3)])), 0);
  assert.equal(payout(JACKS_OR_BETTER, evaluate([C(11, '♥'), C(11), C(2, '♦'), C(5), C(3)])), 1);
  assert.equal(payout(DIRECT_POKER, evaluate([C(10, '♥'), C(10), C(2, '♦'), C(5), C(3)])), 2);
});

test('Direct Poker : taux de retour exact sur les 2 598 960 mains entre 95 et 98 %', () => {
  const deck = SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit })));
  let sum = 0, n = 0;
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
    sum += payout(DIRECT_POKER, evaluate([deck[a], deck[b], deck[c], deck[d], deck[e]])); n++;
  }
  assert.equal(n, 2598960);
  const rtp = sum / n;
  assert.ok(rtp > 0.95 && rtp < 0.98, String(rtp));
});

// ---------------------------------------------------------------- machines à sous
test('6 machines à sous : symboles distincts, taux de retour entre 92 et 96 %', () => {
  assert.equal(SLOT_MACHINES.length, 6);
  for (const m of SLOT_MACHINES) {
    assert.equal(new Set(m.symbols).size, 6, m.id);
    const r = machineRtp(m);
    assert.ok(r > 0.92 && r < 0.96, `${m.id} ${r}`);
  }
  assert.equal(lineReturnRanks(SLOT_MACHINES[0], [5, 5, 5]), 500);
});

// ---------------------------------------------------------------- keno
test('keno : taux de retour entre 88 et 95 % pour 1 à 10 numéros', () => {
  for (let k = 1; k <= 10; k++) { const r = kenoRtp(k); assert.ok(r > 0.88 && r < 0.95, `${k} : ${r}`); }
  assert.equal(Object.keys(KENO_PAY).length, 10);
});

test('keno : 20 numéros distincts tirés, gains calculés', () => {
  const d = drawKeno(seededRandom(4));
  assert.equal(new Set(d).size, 20);
  assert.ok(d.every((n) => n >= 1 && n <= 80));
  assert.equal(kenoReturn([d[0]], d, 10), 37);
  assert.equal(kenoReturn([], d, 10), 0);
});

// ---------------------------------------------------------------- baccarat
test('baccarat : valeurs et tableau de tirage', () => {
  assert.equal(bacTotal([C(9), C(8)]), 7);
  assert.equal(bacTotal([C(13), C(5)]), 5);
  assert.equal(bacSettle({ banker: 100 }, 'banker'), 195);
  assert.equal(bacSettle({ player: 100, tie: 10 }, 'tie'), 100 + 90);
  // Simulation : avantage de la maison sur la Banque ≈ 1,06 %, sur le Joueur ≈ 1,24 %
  const shoe = new Shoe(seededRandom(9), 8);
  let b = 0, p = 0; const N = 60000;
  for (let i = 0; i < N; i++) { if (shoe.needsShuffle) shoe.shuffle(); const r = playBaccarat(() => shoe.draw()); b += bacSettle({ banker: 100 }, r.winner); p += bacSettle({ player: 100 }, r.winner); }
  assert.ok(b / (N * 100) > 0.97 && b / (N * 100) < 1.0, `banque ${b / (N * 100)}`);
  assert.ok(p / (N * 100) > 0.97 && p / (N * 100) < 1.0, `joueur ${p / (N * 100)}`);
});

// ---------------------------------------------------------------- craps
test('craps : Pass Line ≈ 98,6 %, Field payé correctement', () => {
  const rng = seededRandom(11); let ret = 0; const N = 80000;
  for (let i = 0; i < N; i++) ret += crapsSettle({ pass: 10 }, playCraps(rng));
  const r = ret / (N * 10);
  assert.ok(r > 0.97 && r < 1.0, String(r));
  assert.equal(fieldReturn(2), 3); assert.equal(fieldReturn(7), 0); assert.equal(fieldReturn(9), 2);
});

// ---------------------------------------------------------------- plinko, crash, courses
test('plinko : 13 cases, taux de retour exact ≈ 96,8 %', () => {
  assert.equal(PLINKO_MULT.length, 13);
  const r = plinkoRtp(); assert.ok(r > 0.95 && r < 0.98, String(r));
  const p = plinkoPath(seededRandom(2)); assert.equal(p.length, 12); assert.ok(plinkoSlot(p) >= 0 && plinkoSlot(p) <= 12);
});

test('plinko : trois niveaux de risque, symétriques, retour entre 96 et 97,5 %', () => {
  for (const risk of ['low', 'medium', 'high'] as const) {
    const t = PLINKO_TABLES[risk];
    assert.equal(t.length, 13);
    assert.deepEqual(t, [...t].reverse(), risk);
    const r = plinkoRtp(risk); assert.ok(r > 0.96 && r < 0.975, `${risk} ${r}`);
  }
  assert.ok(Math.max(...PLINKO_TABLES.high) > Math.max(...PLINKO_TABLES.medium));
  assert.ok(Math.min(...PLINKO_TABLES.low) >= 0.5);
  const path = Array(12).fill(0); // case extrême gauche
  assert.equal(plinkoReturn(path, 10, 'high'), 1200);
  assert.equal(plinkoReturn(path, 10), 160, 'défaut : risque moyen');
});

test('crash : 97 % de retour quelle que soit la cible', () => {
  const rng = seededRandom(5); const N = 100000;
  for (const target of [1.5, 2, 5]) {
    let ret = 0; for (let i = 0; i < N; i++) ret += crashReturn(100, target, crashPoint(rng));
    const r = ret / (N * 100); assert.ok(r > 0.94 && r < 1.0, `${target} → ${r}`);
  }
  assert.equal(crashReturn(10, null, 3), 0);
  assert.ok(Math.abs(crashMultiplier(timeToReach(2)) - 2) < 0.02);
});

test('courses : cotes cohérentes (≈ 94 % de retour), ordre d’arrivée complet', () => {
  const rng = seededRandom(8);
  const field = makeField(rng);
  assert.equal(field.length, 6);
  for (const h of field) assert.ok(h.prob * h.odds > 0.9 && h.prob * h.odds <= 0.94 + 1e-9);
  const order = raceOrder(field, rng);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(raceReturn(field, { [order[0]]: 10 }, order[0]), Math.floor(10 * field[order[0]].odds));
});

// ---------------------------------------------------------------- manche interrompue
test('blackjack interrompu : reprise et fin automatique (le joueur reste)', () => {
  const g = new Blackjack(seededRandom(2)); g.shoe.stack([C(10), C(10), C(8), C(7), C(5)]);
  g.deal(10);
  const snap = g.snapshot();
  const pay = resolvePending({ game: 'blackjack', tx: 't', stake: 10, data: { snapshot: snap }, at: 0 });
  assert.equal(pay, 20); // 18 contre 17
});

test('manches interrompues : chaque jeu se règle comme il se serait terminé', () => {
  assert.equal(resolvePending({ game: 'roulette', tx: 't', stake: 10, data: { bets: [{ kind: { type: 'red' }, amount: 10 }], result: 1 }, at: 0 }), 20);
  assert.equal(resolvePending({ game: 'crash', tx: 't', stake: 10, data: { bet: 10, point: 3, auto: 2, cashedAt: null }, at: 0 }), 20);
  assert.equal(resolvePending({ game: 'crash', tx: 't', stake: 10, data: { bet: 10, point: 1.5, auto: 2, cashedAt: null }, at: 0 }), 0);
  assert.equal(resolvePending({ game: 'plinko', tx: 't', stake: 10, data: { path: new Array(12).fill(0), bet: 10 }, at: 0 }), 160);
  assert.equal(resolvePending({ game: 'inconnu', tx: 't', stake: 7, data: {}, at: 0 }), 7);
});

test('sauvegarde : manche en cours validée à la lecture', () => {
  assert.ok(isPendingRound({ game: 'keno', tx: 'k1', stake: 5, data: {}, at: 1 }));
  assert.equal(migrate({ pending: { game: 'keno', tx: 'k1', stake: -5 } }).pending, null);
  assert.equal(migrate({ pending: { game: 'keno', tx: 'k1', stake: 5, data: {} } }).pending?.tx, 'k1');
});
