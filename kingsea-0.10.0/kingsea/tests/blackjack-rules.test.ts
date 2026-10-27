// Règles du blackjack KingSea, testées sur le moteur avec des distributions imposées (aucun hasard) :
// cartes (rang, enseigne, libellé, valeur), totaux souples et rigides, naturel, séparation de toutes les paires
// autorisées, refus de séparation, tour du croupier (reste sur 17 souple), règlement unique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import { BJ_RULES, Blackjack, handState, isPair } from '../src/games/logic/blackjack.ts';
import { cardInfo, handValue, isBlackjack, RANKS, rankLabel, SUITS, type Card } from '../src/games/logic/cards.ts';
import { handle, xpForLevel, type AuthEnv, type AuthState } from '../src/authority/index';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });
function rig(cards: Card[]): Blackjack { const g = new Blackjack(seededRandom(2)); g.shoe.stack(cards); return g; }

test('cartes : 4 enseignes, 13 valeurs (A, 2 à 10, J, Q, K), valeur de blackjack distincte de l’affichage', () => {
  assert.deepEqual(SUITS, ['♠', '♥', '♦', '♣']);
  assert.deepEqual(RANKS.map((r) => r.label), ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
  assert.deepEqual(RANKS.map((r) => r.blackjack), [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10]);
  assert.equal(rankLabel(12), 'Q');
  assert.equal(cardInfo(C(13, '♥')).text, 'Roi de cœur');
  assert.equal(cardInfo(C(1, '♣')).text, 'As de trèfle');
  assert.throws(() => cardInfo(C(14)), /Carte invalide/);
});

test('totaux : As à 11 tant que possible (souple), sinon 1 (rigide), recalculés à chaque carte', () => {
  assert.deepEqual(handValue([C(1), C(6)]), { total: 17, soft: true });
  assert.deepEqual(handValue([C(1), C(6), C(10)]), { total: 17, soft: false });
  assert.deepEqual(handValue([C(1), C(1)]), { total: 12, soft: true });
  assert.deepEqual(handValue([C(1), C(1), C(1), C(8)]), { total: 21, soft: true });
  assert.deepEqual(handValue([C(13), C(12), C(2)]), { total: 22, soft: false }, 'dépasse 21');
  assert.deepEqual(handValue([C(11), C(5)]), { total: 15, soft: false });
});

test('blackjack naturel : As + carte valant 10 en deux cartes seulement ; 21 en trois cartes n’en est pas un', () => {
  for (const r of [10, 11, 12, 13]) assert.equal(isBlackjack([C(1), C(r)]), true);
  assert.equal(isBlackjack([C(7), C(7), C(7)]), false);
  assert.equal(isBlackjack([C(1), C(5), C(5)]), false);
  assert.equal(isBlackjack([C(10), C(1)]), true, 'dans un ordre ou l’autre');
});

test('séparation : chacune des 13 paires (2-2 … 10-10, J-J, Q-Q, K-K, A-A) se sépare en deux mains indépendantes', () => {
  for (let r = 1; r <= 13; r++) {
    // joueur r, r ; croupier 10 (visible), 7 ; puis une carte pour chaque main séparée
    const g = rig([C(r), C(10), C(r, '♥'), C(7), C(4, '♦'), C(5, '♦'), C(9), C(9), C(9), C(9)]);
    g.deal(10);
    if (g.phase === 'insurance') g.insure(0, false);
    assert.equal(g.canSplit(), true, `paire de ${rankLabel(r)}`);
    g.split();
    assert.equal(g.hands.length, 2, `${rankLabel(r)} : deux mains`);
    assert.deepEqual(g.hands.map((h) => h.cards[0].rank), [r, r], 'une carte de la paire dans chaque main');
    assert.deepEqual(g.hands.map((h) => h.bet), [10, 10], 'chaque main garde sa mise');
    assert.ok(g.hands.every((h) => h.cards.length === 2 && h.fromSplit));
  }
});

test('séparation : deux cartes valant 10 de rangs différents (10-J, Q-K…) forment une paire (règle de table documentée)', () => {
  assert.equal(BJ_RULES.splitTenValues, true);
  for (const [a, b] of [[10, 11], [11, 12], [12, 13], [10, 13]]) {
    assert.equal(isPair(C(a), C(b)), true);
    const g = rig([C(a), C(10), C(b, '♥'), C(7), C(9), C(9)]);
    g.deal(10);
    assert.equal(g.canSplit(), true, `${rankLabel(a)}-${rankLabel(b)}`);
  }
  assert.equal(isPair(C(9), C(10)), false);
  assert.equal(isPair(C(1), C(10)), false);
  assert.equal(isPair(C(10), C(13), { ...BJ_RULES, splitTenValues: false }), false, 'règle désactivable');
});

test('séparation refusée : cartes différentes, après une carte tirée, As séparés re-séparés, au-delà de 4 mains', () => {
  let g = rig([C(10), C(10), C(5), C(7)]); g.deal(10); assert.equal(g.canSplit(), false, '10 et 5');
  g = rig([C(4), C(10), C(4, '♥'), C(7), C(2)]); g.deal(10); g.hit(); assert.equal(g.canSplit(), false, 'trois cartes');
  g = rig([C(1), C(10), C(1, '♥'), C(7), C(1, '♦'), C(1, '♣')]); g.deal(10); g.split();
  assert.ok(g.hands.every((h) => h.done), 'As séparés : une carte chacun, mains terminées');
  assert.equal(g.canSplit(), false, 'pas de nouvelle séparation d’As');
  g = rig([C(8), C(10), C(8, '♥'), C(7), C(8, '♦'), C(8, '♣'), C(8), C(8, '♥'), C(8, '♦')]);
  g.deal(10);
  g.split(); g.split(); g.split();
  assert.equal(g.hands.length, 4); assert.equal(g.canSplit(), false, '4 mains au plus');
});

test('autorité : séparation refusée faute de jetons, sans prélèvement ; séparation de deux figures différentes payée au bon montant', () => {
  const env = (): AuthEnv => ({ rng: seededRandom(5), now: 1_000_000, day: '2026-10-27' });
  const mk = (chips: number): AuthState => ({ wallet: { balance: 0, processedTx: [] }, chips: { balance: chips, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {}, progress: { xp: xpForLevel(1), level: 1 } as unknown as AuthState['progress'] });
  const stack = (s: AuthState, next: Card[]) => { const f = Array.from({ length: 200 }, (_, i) => C((i % 13) + 1, '♣')); s.sessions['shoe:blackjack'] = { game: 'blackjack', tx: '', stake: 0, at: 0, data: { cards: [...f, ...[...next].reverse()], shuffles: 1, base: 0 } as unknown as Record<string, unknown> }; };
  let i = 0; const r = (action: string, input: unknown) => ({ kind: 'casino' as const, game: 'blackjack', action, input, id: `rules${++i}xx` });
  const poor = mk(15);
  stack(poor, [C(12), C(10), C(13), C(7)]);
  assert.ok(handle(poor, r('deal', { bet: 10, table: 'debutant' }), env()).ok);
  const refused = handle(poor, r('act', { move: 'split' }), env());
  assert.equal(refused.ok, false); assert.equal(poor.chips!.balance, 5);
  const s = mk(1000);
  stack(s, [C(12), C(10), C(13), C(7), C(9), C(8)]); // Q-K séparés : 19 et 18 contre 17
  assert.ok(handle(s, r('deal', { bet: 10, table: 'debutant' }), env()).ok);
  assert.ok(handle(s, r('act', { move: 'split' }), env()).ok);
  assert.equal(s.chips!.balance, 980);
  assert.ok(handle(s, r('act', { move: 'stand' }), env()).ok);
  const end = handle(s, r('act', { move: 'stand' }), env());
  assert.ok(end.ok && end.done);
  assert.equal(s.chips!.balance, 980 + 40, 'deux mains gagnées : 2 × 20 rendus');
});

test('croupier : tire jusqu’à 16, reste sur 17 souple et rigide ; carte cachée jusqu’à son tour', () => {
  let g = rig([C(10), C(10), C(9), C(6), C(1)]); // croupier 10 + 6 = 16 → tire As → 17
  g.deal(10);
  assert.equal(g.dealerHoleHidden, true, 'carte cachée pendant le tour du joueur');
  g.stand();
  assert.equal(handValue(g.dealer).total, 17); assert.equal(g.dealer.length, 3);
  g = rig([C(10), C(1), C(9), C(6), C(5)]); // croupier As + 6 = 17 souple : reste (S17)
  g.deal(10);
  if (g.phase === 'insurance') g.insure(0, false);
  g.stand();
  assert.equal(g.dealer.length, 2, '17 souple : le croupier reste');
  assert.equal(g.hands[0].outcome, 'win', '19 contre 17');
});

test('croupier : ne tire pas quand toutes les mains ont déjà dépassé 21', () => {
  const g = rig([C(10), C(10), C(6), C(2), C(10), C(5)]); // joueur 16 tire 10 → 26 ; croupier 10 + 2
  g.deal(10);
  g.hit();
  assert.equal(g.phase, 'settled');
  assert.equal(g.dealer.length, 2, 'aucune carte tirée inutilement');
  assert.equal(g.hands[0].outcome, 'lose');
});

test('états explicites des mains et règlement unique', () => {
  const g = rig([C(10), C(9), C(8), C(10), C(7), C(9), C(9), C(7)]);
  g.deal([10, 10]);
  assert.deepEqual(g.hands.map((h) => handState(h, g.phase)), ['en-cours', 'en-cours']);
  g.stand();
  assert.deepEqual(g.hands.map((h) => handState(h, g.phase)), ['attente-croupier', 'en-cours']);
  g.stand();
  assert.deepEqual(g.hands.map((h) => handState(h, g.phase)), ['reglee', 'reglee']);
  const paid = g.hands.map((h) => h.payout);
  g.stand(); g.hit(); g.double(); g.split(); // fin de manche déclenchée encore : sans effet
  assert.deepEqual(g.hands.map((h) => h.payout), paid);
  assert.equal(g.phase, 'settled');
});
