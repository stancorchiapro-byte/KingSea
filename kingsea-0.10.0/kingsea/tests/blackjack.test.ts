// Blackjack (mise à jour Stan) : bonus de blackjack naturel, double face cachée, tables, pourboires, aucun double paiement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import { BJ_TABLES, Blackjack, naturalPayout } from '../src/games/logic/blackjack.ts';
import type { Card } from '../src/games/logic/cards.ts';
import { handle, xpForLevel, type AuthEnv, type AuthState } from '../src/authority/index';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });
function rig(cards: Card[]): Blackjack { const g = new Blackjack(seededRandom(2)); g.shoe.stack(cards); return g; }

test('bonus naturel : arrondi inférieur, mise impaire', () => {
  assert.deepEqual(naturalPayout(25), { base: 62, bonus: 12 });
  const g = rig([C(12), C(5), C(1), C(10)]); // joueur D,A ; croupier 5,10
  g.deal(25);
  assert.equal(g.hands[0].outcome, 'blackjack');
  assert.equal(g.totalPayout, 62 + 12);
});

test('21 en trois cartes : pas un blackjack, payé 1:1 sans bonus', () => {
  const g = rig([C(5), C(10), C(6), C(7), /* tirage joueur */ C(10)]); // joueur 5,6 → +10 = 21 ; croupier 10,7
  g.deal(10);
  g.hit();
  assert.equal(g.phase, 'settled');
  assert.equal(g.hands[0].outcome, 'win');
  assert.equal(g.hands[0].bonus, 0);
  assert.equal(g.totalPayout, 20);
});

test('blackjack contre blackjack du croupier : égalité, mise rendue, pas de bonus', () => {
  const g = rig([C(1), C(1), C(13), C(12)]);
  g.deal(10);
  assert.equal(g.hands[0].outcome, 'push');
  assert.equal(g.totalPayout, 10);
});

test('As + 10 après séparation : 21 ordinaire, sans bonus', () => {
  const g = rig([C(8), C(9), C(8), C(7), /* main 1 */ C(3), /* main 2 */ C(10), /* main 1 suite */ C(10)]);
  g.deal(10);
  g.split();
  assert.equal(g.hands.length, 2);
  for (const h of g.hands) assert.ok(!h.bonus);
});

test('double face cachée : marqué, réglé normalement', () => {
  const g = rig([C(6), C(10), C(5), C(7), /* carte du double */ C(10)]); // joueur 11 ; croupier 17
  g.deal(10);
  g.double(true);
  assert.equal(g.hands[0].hiddenDouble, true);
  assert.equal(g.hands[0].bet, 20);
  assert.equal(g.hands[0].outcome, 'win');
  assert.equal(g.totalPayout, 40);
});

// ---------------------------------------------------------------- autorité
const env = (): AuthEnv => ({ rng: seededRandom(7), now: 1_000_000, day: '2026-10-24' });
let n = 0;
const req = (game: string, action: string, input: unknown) => ({ kind: 'casino' as const, game, action, input, id: `bj${++n}xx` });
const fresh = (chips = 10_000, level = 1): AuthState => ({
  wallet: { balance: 0, processedTx: [] }, chips: { balance: chips, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {},
  progress: { xp: xpForLevel(level), level } as unknown as AuthState['progress'], // normalisé par l'autorité
});
/** Impose les prochaines cartes du sabot de l'autorité (la première sort en premier). */
function stackShoe(s: AuthState, game: string, next: Card[]): void {
  const filler: Card[] = Array.from({ length: 200 }, (_, i) => C((i % 13) + 1, '♣'));
  s.sessions[`shoe:${game}`] = { game, tx: '', stake: 0, at: 0, data: { cards: [...filler, ...[...next].reverse()], shuffles: 1, base: 0 } as unknown as Record<string, unknown> };
}

test('autorité : blackjack naturel, paiement, bonus et total séparés, versés une seule fois', () => {
  const s = fresh();
  stackShoe(s, 'blackjack', [C(1), C(9), C(13), C(7)]);
  const r = handle(s, req('blackjack', 'deal', { bet: 100, table: 'standard' }), env());
  assert.ok(r.ok);
  if (!r.ok) return;
  const h = (r.view.hands as Array<{ outcome: string; payout: number; bonus: number }>)[0];
  assert.equal(h.outcome, 'blackjack');
  assert.equal(h.bonus, 50);
  assert.equal(h.payout, 250 + 50);
  assert.equal(r.payout, 300);
  assert.equal(s.chips!.balance, 10_000 - 100 + 300);
  // Manche close : aucune action ne peut la payer une seconde fois
  assert.equal(handle(s, req('blackjack', 'act', { move: 'stand' }), env()).ok, false);
  assert.equal(s.chips!.balance, 10_200);
});

test('autorité : double face cachée — carte masquée dans la vue jusqu’au règlement', () => {
  const s = fresh();
  // joueur 6,5 (=11) ; croupier 10,7 → double : la carte n'est pas montrée… mais le croupier termine aussitôt
  stackShoe(s, 'blackjack', [C(6), C(10), C(5), C(7), C(9)]);
  assert.ok(handle(s, req('blackjack', 'deal', { bet: 50, table: 'standard' }), env()).ok);
  const r = handle(s, req('blackjack', 'act', { move: 'double', faceDown: true }), env());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.view.phase, 'settled');
  const h = (r.view.hands as Array<{ cards: Card[]; hiddenDouble: boolean; outcome: string }>)[0];
  assert.equal(h.hiddenDouble, true);
  assert.equal(h.cards[2].rank, 9, 'retournée au règlement');
  assert.equal(h.outcome, 'win');
  assert.equal(s.chips!.balance, 10_000 - 100 + 200);
});

test('autorité : double face cachée avec une autre main encore à jouer — carte masquée', () => {
  const s = fresh();
  // 8,8 séparés ; main 1 reçoit 3 (=11) → double face cachée (10) ; main 2 reçoit 2 et reste à jouer
  stackShoe(s, 'blackjack', [C(8), C(10), C(8), C(7), C(3), C(2), C(10)]);
  assert.ok(handle(s, req('blackjack', 'deal', { bet: 20, table: 'debutant' }), env()).ok);
  assert.ok(handle(s, req('blackjack', 'act', { move: 'split' }), env()).ok);
  const r = handle(s, req('blackjack', 'act', { move: 'double', faceDown: true }), env());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.view.phase, 'player');
  const h = (r.view.hands as Array<{ cards: Card[] }>)[0];
  assert.equal(h.cards[2].rank, 0, 'carte du double masquée');
  assert.ok(!JSON.stringify(r.view).includes('"rank":10,"suit":"♠"}],"bet":40'), 'valeur absente de la vue');
});

test('autorité : limites de table, niveau requis, table inconnue', () => {
  const s = fresh(100_000, 1);
  assert.equal(handle(s, req('blackjack', 'deal', { bet: 4, table: 'debutant' }), env()).ok, false, 'sous le minimum');
  assert.equal(handle(s, req('blackjack', 'deal', { bet: 101, table: 'debutant' }), env()).ok, false, 'au-dessus du maximum');
  assert.equal(handle(s, req('blackjack', 'deal', { bet: 500, table: 'premium' }), env()).ok, false, 'niveau 3 requis');
  assert.equal(handle(s, req('blackjack', 'deal', { bet: 600, table: 'vip' }), env()).ok, false, 'niveau 5 requis');
  assert.equal(handle(s, req('blackjack', 'deal', { bet: 10, table: 'casino-pirate' }), env()).ok, false);
  assert.equal(s.chips!.balance, 100_000, 'rien prélevé');
  const vip = fresh(100_000, 5);
  const r = handle(vip, req('blackjack', 'deal', { bet: 5000, table: 'vip' }), env());
  assert.ok(r.ok, 'VIP : jusqu’à 5 000');
  assert.equal(BJ_TABLES.length, 4);
});

test('autorité : pourboire au croupier — solde vérifié, montant prélevé une fois', () => {
  const s = fresh(30);
  const r = handle(s, req('blackjack', 'tip', { amount: 10 }), env());
  assert.ok(r.ok);
  assert.equal(s.chips!.balance, 20);
  assert.equal(handle(s, req('blackjack', 'tip', { amount: 25 }), env()).ok, false, 'solde insuffisant');
  for (const amount of [0, -5, 2.5, '10']) assert.equal(handle(s, req('blackjack', 'tip', { amount }), env()).ok, false);
  const q = req('blackjack', 'tip', { amount: 5 });
  assert.ok(handle(s, q, env()).ok);
  assert.equal(handle(s, q, env()).ok, false, 'même demande rejouée');
  assert.equal(s.chips!.balance, 15);
  assert.equal(s.stats['tips.total'], 15);
});
