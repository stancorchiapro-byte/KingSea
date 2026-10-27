// Règles et paiements de chaque jeu du casino sur des résultats imposés (scénarios reproductibles, sans hasard),
// puis contrôle commun de l'autorité : mises invalides et solde insuffisant refusés sans rien prélever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import { bacSettle, bacTotal, playBaccarat } from '../src/games/logic/baccarat.ts';
import type { Card } from '../src/games/logic/cards.ts';
import { crapsSettle, fieldReturn } from '../src/games/logic/craps.ts';
import { crashReturn } from '../src/games/logic/crash.ts';
import { kenoReturn, KENO_PAY } from '../src/games/logic/keno.ts';
import { PLINKO_TABLES, plinkoReturn } from '../src/games/logic/plinko.ts';
import { DIRECT_POKER, evaluate, JACKS_OR_BETTER, payout as pokerPayout } from '../src/games/logic/poker.ts';
import { raceReturn, type Horse } from '../src/games/logic/races.ts';
import { settleBets } from '../src/games/logic/roulette.ts';
import { lineReturnRanks, SLOT_MACHINES } from '../src/games/logic/slotMachines.ts';
import { handle, xpForLevel, type AuthEnv, type AuthState } from '../src/authority/index';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });

test('roulette : plein 35:1, douzaine et colonne 2:1, chances simples 1:1, zéro perdant pour les chances simples', () => {
  assert.equal(settleBets([{ kind: { type: 'number', n: 17 }, amount: 10 }], 17), 360);
  assert.equal(settleBets([{ kind: { type: 'number', n: 17 }, amount: 10 }], 18), 0);
  assert.equal(settleBets([{ kind: { type: 'dozen', d: 2 }, amount: 10 }], 24), 30);
  assert.equal(settleBets([{ kind: { type: 'column', c: 1 }, amount: 10 }], 34), 30);
  assert.equal(settleBets([{ kind: { type: 'red' }, amount: 10 }, { kind: { type: 'black' }, amount: 10 }], 1), 20, 'rouge gagne, noir perd');
  for (const t of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) assert.equal(settleBets([{ kind: { type: t }, amount: 10 }], 0), 0);
  assert.equal(settleBets([{ kind: { type: 'number', n: 0 }, amount: 5 }], 0), 180);
});

test('baccarat : Joueur 1:1, Banque 0,95:1 (arrondi inférieur), Égalité 8:1, mises Joueur/Banque rendues sur égalité', () => {
  assert.equal(bacSettle({ player: 10 }, 'player'), 20);
  assert.equal(bacSettle({ banker: 100 }, 'banker'), 195);
  assert.equal(bacSettle({ banker: 10 }, 'banker'), 19, 'commission arrondie à l’inférieur');
  assert.equal(bacSettle({ tie: 10 }, 'tie'), 90);
  assert.equal(bacSettle({ player: 10, banker: 10 }, 'tie'), 20, 'rendues');
  assert.equal(bacSettle({ player: 10, tie: 5 }, 'banker'), 0);
  // Tirage : 8 ou 9 d'entrée (naturel) → pas de troisième carte
  const seq = [C(9), C(3), C(10), C(2)]; // J : 9, 10 = 9 ; B : 3, 2 = 5
  const r = playBaccarat(() => seq.shift()!);
  assert.equal(r.player.length, 2); assert.equal(r.banker.length, 2);
  assert.equal(bacTotal(r.player), 9); assert.equal(r.winner, 'player');
});

test('craps : Pass / Don’t Pass, 12 au premier lancer rend le Don’t Pass, Field 2:1 sur 2 et 12', () => {
  assert.equal(crapsSettle({ pass: 10, dontpass: 10 }, { rolls: [[3, 4]], point: null, outcome: 'pass' }), 20);
  assert.equal(crapsSettle({ pass: 10, dontpass: 10 }, { rolls: [[1, 1]], point: null, outcome: 'dontpass' }), 20);
  assert.equal(crapsSettle({ pass: 10, dontpass: 10 }, { rolls: [[6, 6]], point: null, outcome: 'push12' }), 10);
  assert.deepEqual([2, 3, 5, 7, 9, 12].map(fieldReturn), [3, 2, 0, 0, 2, 3]);
  assert.equal(crapsSettle({ field: 10 }, { rolls: [[1, 1]], point: null, outcome: 'dontpass' }), 30);
});

test('keno : gains selon les numéros trouvés, aucun gain sans touche', () => {
  const picks = [1, 2, 3, 4];
  const drawn = Array.from({ length: 20 }, (_, i) => i + 1); // 4 sur 4
  assert.equal(kenoReturn(picks, drawn, 10), Math.floor(10 * KENO_PAY[4][4]));
  assert.equal(kenoReturn([70, 71, 72, 73], drawn, 10), Math.floor(10 * (KENO_PAY[4][0] ?? 0)));
});

test('courses : seul le cheval gagnant paie, à sa cote fixée avant le départ', () => {
  const field: Horse[] = [{ name: 'A', color: '', prob: 0.5, odds: 1.8 }, { name: 'B', color: '', prob: 0.5, odds: 1.8 }];
  assert.equal(raceReturn(field, { 0: 10, 1: 10 }, 0), 18);
  assert.equal(raceReturn(field, { 1: 10 }, 0), 0);
});

test('Plinko, Crash, machines à sous, poker : paiements exacts sur des résultats imposés', () => {
  const center = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]; // case 6 (milieu)
  assert.equal(plinkoReturn(center, 10, 'medium'), Math.floor(10 * PLINKO_TABLES.medium[6]));
  assert.equal(plinkoReturn(Array(12).fill(0), 10, 'high'), Math.floor(10 * PLINKO_TABLES.high[0]));
  assert.equal(crashReturn(10, 2.5, 3), 25); assert.equal(crashReturn(10, null, 3), 0); assert.equal(crashReturn(10, 3.5, 3), 0, 'après l’écrasement : rien');
  const def = SLOT_MACHINES[0];
  assert.equal(lineReturnRanks(def, [1, 1, 1]), def.pay[1]);
  assert.equal(lineReturnRanks(def, [0, 0, 3]), def.two);
  assert.equal(lineReturnRanks(def, [2, 1, 1]), 0);
  const flush = evaluate([C(2, '♥'), C(5, '♥'), C(9, '♥'), C(11, '♥'), C(13, '♥')]);
  assert.equal(pokerPayout(JACKS_OR_BETTER, flush), 5, 'table 8/5 : couleur payée 5 pour 1');
  const tens = evaluate([C(10, '♥'), C(10, '♠'), C(2, '♦'), C(5, '♣'), C(8, '♥')]);
  assert.equal(pokerPayout(JACKS_OR_BETTER, tens), 0, 'paire de 10 : rien en « Valets ou mieux »');
  assert.equal(pokerPayout(DIRECT_POKER, tens), 2, 'paire de 10 : payée au Direct Poker');
});

// ---------------------------------------------------------------- contrôle commun de l'autorité
const env = (): AuthEnv => ({ rng: seededRandom(11), now: 1_000_000, day: '2026-10-27' });
let n = 0;
const fresh = (chips = 1000): AuthState => ({
  wallet: { balance: 0, processedTx: [] }, chips: { balance: chips, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {},
  progress: { xp: xpForLevel(1), level: 1 } as unknown as AuthState['progress'],
});
const BAD = [-5, 0, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '10', 1e9];
const inputs: Array<[string, string, (v: unknown) => unknown]> = [
  ['roulette', 'play', (v) => ({ bets: [{ kind: { type: 'red' }, amount: v }] })],
  ['slots', 'play', (v) => ({ machine: SLOT_MACHINES[0].id, bet: v })],
  ['baccarat', 'play', (v) => ({ bets: { player: v } })],
  ['craps', 'play', (v) => ({ bets: { pass: v } })],
  ['keno', 'play', (v) => ({ picks: [1, 2, 3], bet: v })],
  ['plinko', 'play', (v) => ({ bet: v, risk: 'low' })],
  ['direct-poker', 'play', (v) => ({ bet: v })],
  ['poker', 'deal', (v) => ({ bet: v })],
  ['crash', 'start', (v) => ({ bet: v, auto: null })],
  ['blackjack', 'deal', (v) => ({ bets: [v], table: 'debutant' })],
];

test('tous les jeux : mises négatives, nulles, décimales, infinies, textuelles ou démesurées refusées sans rien prélever', () => {
  for (const [game, action, make] of inputs) for (const v of BAD) {
    const s = fresh();
    const r = handle(s, { kind: 'casino', game, action, input: make(v), id: `bad${++n}xx` }, env());
    assert.equal(r.ok, false, `${game} ${String(v)}`);
    assert.equal(s.chips!.balance, 1000, `${game} ${String(v)} : solde intact`);
  }
});

test('tous les jeux : solde insuffisant refusé, et une mise acceptée prélève exactement la mise', () => {
  for (const [game, action, make] of inputs) {
    const poor = fresh(4);
    const r = handle(poor, { kind: 'casino', game, action, input: make(game === 'blackjack' ? 5 : 10), id: `poor${++n}xx` }, env());
    assert.equal(r.ok, false, `${game} sans fonds`);
    assert.equal(poor.chips!.balance, 4);
    const s = fresh();
    const ok = handle(s, { kind: 'casino', game, action, input: make(game === 'blackjack' ? 5 : 10), id: `ok${++n}xx` }, env());
    assert.ok(ok.ok, game);
    if (ok.ok) assert.equal(s.chips!.balance, 1000 - ok.stake + ok.payout, `${game} : solde = 1000 − mise + retour`);
  }
});
