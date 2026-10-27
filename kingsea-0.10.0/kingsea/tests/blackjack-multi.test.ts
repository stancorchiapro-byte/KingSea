// Blackjack à plusieurs mains (1 à 5 mains principales par manche, une mise par main) : scénarios reproductibles
// (sabot imposé), exécutés par l'autorité comme en jeu (hors ligne et en ligne) : distribution, actions, assurance
// par main, séparations, limites de table, solde, paiements main par main, rejeux et actions dans le désordre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import type { Card } from '../src/games/logic/cards.ts';
import { Blackjack } from '../src/games/logic/blackjack.ts';
import { handle, xpForLevel, type AuthEnv, type AuthReply, type AuthState } from '../src/authority/index';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });
const env = (): AuthEnv => ({ rng: seededRandom(7), now: 1_000_000, day: '2026-10-27' });
let n = 0;
const req = (action: string, input: unknown, id = `mh${++n}xx`) => ({ kind: 'casino' as const, game: 'blackjack', action, input, id });
const fresh = (chips = 10_000): AuthState => ({
  wallet: { balance: 0, processedTx: [] }, chips: { balance: chips, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {},
  progress: { xp: xpForLevel(1), level: 1 } as unknown as AuthState['progress'],
});
/** Impose les prochaines cartes du sabot de l'autorité (la première sort en premier). */
function stackShoe(s: AuthState, next: Card[]): void {
  const filler: Card[] = Array.from({ length: 200 }, (_, i) => C((i % 13) + 1, '♣'));
  s.sessions['shoe:blackjack'] = { game: 'blackjack', tx: '', stake: 0, at: 0, data: { cards: [...filler, ...[...next].reverse()], shuffles: 1, base: 0 } as unknown as Record<string, unknown> };
}
const ok = (r: AuthReply): AuthReply & { ok: true } => { assert.ok(r.ok, r.ok ? '' : r.error); return r as AuthReply & { ok: true }; };
type ViewHand = { seat: number; bet: number; outcome?: string; payout?: number; cards: Card[]; doubled: boolean };
const hands = (r: AuthReply & { ok: true }) => r.view.hands as ViewHand[];

test('une seule main : comportement inchangé (mise unique)', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(10), C(10), C(7)]); // joueur 10,10 ; croupier 10,7
  const r = ok(handle(s, req('deal', { bet: 50, table: 'debutant' }), env()));
  assert.equal(hands(r).length, 1);
  const end = ok(handle(s, req('act', { move: 'stand' }), env()));
  assert.equal(end.done, true);
  assert.equal(s.chips!.balance, 10_000 - 50 + 100);
});

test('deux mains, mises différentes : distribution dans l’ordre, jouées l’une après l’autre, payées séparément', () => {
  const s = fresh();
  // Main 1 : 10, 9 ; main 2 : 5, 6 ; croupier 10 (visible), 7 ; carte du double de la main 2 : 10
  stackShoe(s, [C(10), C(5), C(10), C(9), C(6), C(7), C(10)]);
  const r = ok(handle(s, req('deal', { bets: [20, 50], table: 'debutant' }), env()));
  assert.equal(s.chips!.balance, 10_000 - 70, 'les deux mises sont prélevées ensemble');
  assert.deepEqual(hands(r).map((h) => [h.seat, h.bet, h.cards.map((c) => c.rank)]), [[0, 20, [10, 9]], [1, 50, [5, 6]]]);
  assert.equal(r.view.active, 0, 'la main 1 joue d’abord');
  ok(handle(s, req('act', { move: 'stand' }), env()));
  const d = ok(handle(s, req('act', { move: 'double' }), env()));
  assert.equal(d.done, true);
  const hs = hands(d);
  assert.deepEqual(hs.map((h) => [h.outcome, h.bet, h.payout]), [['win', 20, 40], ['win', 100, 200]]);
  assert.equal(d.payout, 240);
  assert.equal(s.chips!.balance, 10_000 - 20 - 50 - 50 + 240);
});

test('cinq mains : gagnée, perdue, blackjack, égalité et main sautée dans la même manche', () => {
  const s = fresh();
  // 1res cartes : 10, 10, A, 9, 10 · croupier 10 · 2es cartes : 10, 6, R, 9, 5 · croupier 8 · tirage main 5 : 10
  stackShoe(s, [C(10), C(10), C(1), C(9), C(10), C(10), C(10), C(6), C(13), C(9), C(5), C(8), C(10)]);
  const r = ok(handle(s, req('deal', { bets: [5, 10, 15, 20, 25], table: 'debutant' }), env()));
  assert.equal(hands(r).length, 5);
  assert.equal(s.chips!.balance, 10_000 - 75);
  ok(handle(s, req('act', { move: 'stand' }), env())); // main 1 : 20
  ok(handle(s, req('act', { move: 'stand' }), env())); // main 2 : 16 (la main 3, blackjack, est déjà terminée)
  ok(handle(s, req('act', { move: 'stand' }), env())); // main 4 : 18
  const end = ok(handle(s, req('act', { move: 'hit' }), env())); // main 5 : 15 + 10 → saute
  assert.equal(end.done, true);
  const hs = hands(end);
  assert.deepEqual(hs.map((h) => h.outcome), ['win', 'lose', 'blackjack', 'push', 'lose']);
  // Paiements (mise comprise) : 10, 0, 15×2,5 + bonus 50 % (37 + 7), 20 (rendue), 0
  assert.deepEqual(hs.map((h) => h.payout), [10, 0, 44, 20, 0]);
  assert.equal(end.payout, 74);
  assert.equal(s.chips!.balance, 10_000 - 75 + 74, 'bilan net de la manche : −1');
});

test('trois et quatre mains : toutes les mises engagées, chaque main avec sa propre mise', () => {
  for (const bets of [[5, 6, 7], [5, 6, 7, 8]]) {
    const s = fresh();
    const r = ok(handle(s, req('deal', { bets, table: 'debutant' }), env()));
    const per = new Map<number, number>();
    for (const h of hands(r)) per.set(h.seat, (per.get(h.seat) ?? 0) + h.bet);
    assert.deepEqual([...per.values()], bets);
    assert.equal(r.stake, bets.reduce((a, b) => a + b, 0));
  }
});

test('refus sans rien prélever : plus de 5 mains, aucune main, mise hors limites de la table, solde insuffisant', () => {
  for (const [input, chips, why] of [
    [{ bets: [5, 5, 5, 5, 5, 5], table: 'debutant' }, 10_000, /De 1 à 5 mains/],
    [{ bets: [], table: 'debutant' }, 10_000, /De 1 à 5 mains/],
    [{ bets: [50, 150], table: 'debutant' }, 10_000, /Mise invalide/],
    [{ bets: [10, 3], table: 'debutant' }, 10_000, /minimale/],
    [{ bets: [10, 2.5], table: 'debutant' }, 10_000, /Mise invalide/],
    [{ bets: [10, -5], table: 'debutant' }, 10_000, /Mise invalide/],
    [{ bets: [10, Number.POSITIVE_INFINITY], table: 'debutant' }, 10_000, /Mise invalide/],
    [{ bets: [40, 40], table: 'debutant' }, 50, /Pas assez de jetons pour 2 mains/],
  ] as const) {
    const s = fresh(chips);
    const r = handle(s, req('deal', input), env());
    assert.equal(r.ok, false, JSON.stringify(input));
    if (!r.ok) assert.match(r.error, why);
    assert.equal(s.chips!.balance, chips, 'aucun jeton prélevé');
    assert.equal(s.sessions.blackjack, undefined, 'aucune manche ouverte');
  }
});

test('doubler : autorisé sur deux cartes, refusé après un tirage et sans les fonds', () => {
  const s = fresh();
  stackShoe(s, [C(2), C(10), C(3), C(7), C(4), C(10)]); // joueur 2,3 ; croupier 10,7 ; tirage 4 ; puis 10
  ok(handle(s, req('deal', { bets: [20], table: 'debutant' }), env()));
  ok(handle(s, req('act', { move: 'hit' }), env())); // 2,3,4 = 9
  const bal = s.chips!.balance;
  const r = handle(s, req('act', { move: 'double' }), env());
  assert.equal(r.ok, false, 'pas de double après un tirage');
  assert.equal(s.chips!.balance, bal);
  // Fonds insuffisants pour doubler
  const p = fresh(25);
  stackShoe(p, [C(5), C(10), C(6), C(7)]);
  ok(handle(p, req('deal', { bets: [20], table: 'debutant' }), env()));
  const r2 = handle(p, req('act', { move: 'double' }), env());
  assert.equal(r2.ok, false);
  assert.equal(p.chips!.balance, 5, 'rien prélevé au refus');
});

test('séparations : refusée sans paire, jusqu’à 4 mains pour une main principale, l’autre main reste indépendante', () => {
  const s = fresh();
  // Main 1 : 8,8 ; main 2 : 10,9 ; croupier 10,7 ; séparations : (8 | 3), (8 | 4), (8 | 2)
  stackShoe(s, [C(8), C(10), C(10), C(8, '♥'), C(9), C(7), C(8, '♦'), C(3), C(8, '♣'), C(4), C(8, '♥'), C(2)]);
  ok(handle(s, req('deal', { bets: [10, 20], table: 'debutant' }), env()));
  for (let i = 0; i < 3; i++) ok(handle(s, req('act', { move: 'split' }), env()));
  const bal = s.chips!.balance;
  assert.equal(bal, 10_000 - 30 - 30, 'trois séparations de 10 jetons');
  const refused = handle(s, req('act', { move: 'split' }), env());
  assert.equal(refused.ok, false, '4 mains au maximum par main principale');
  assert.equal(s.chips!.balance, bal);
  let r: AuthReply & { ok: true } = ok(handle(s, req('act', { move: 'stand' }), env()));
  while (!r.done) r = ok(handle(s, req('act', { move: 'stand' }), env()));
  const hs = hands(r);
  assert.equal(hs.filter((h) => h.seat === 0).length, 4);
  assert.equal(hs.filter((h) => h.seat === 1).length, 1, 'la main 2 n’est pas touchée par les séparations');
  // Croupier 17 : les quatre mains à 16, 10, 12, 11 perdent ; la main 2 (19) gagne
  assert.deepEqual(hs.map((h) => h.outcome), ['lose', 'lose', 'lose', 'lose', 'win']);
  assert.equal(s.chips!.balance, 10_000 - 60 + 40);
  // Pas de paire : séparation refusée
  const t = fresh();
  stackShoe(t, [C(8), C(10), C(9), C(7)]);
  ok(handle(t, req('deal', { bets: [10], table: 'debutant' }), env()));
  assert.equal(handle(t, req('act', { move: 'split' }), env()).ok, false);
});

test('assurance : une décision par main, prélevée une fois, payée 2:1 sur blackjack du croupier', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(10), C(1), C(9), C(8), C(13)]); // mains 19 et 18 ; croupier As + Roi
  const r = ok(handle(s, req('deal', { bets: [20, 30], table: 'debutant' }), env()));
  assert.equal(r.view.phase, 'insurance');
  assert.equal(r.view.insureSeat, 0);
  assert.equal(handle(s, req('act', { move: 'insurance', take: true, seat: 4 }), env()).ok, false, 'main inexistante');
  ok(handle(s, req('act', { move: 'insurance', take: true, seat: 0 }), env()));
  assert.equal(s.chips!.balance, 10_000 - 50 - 10);
  assert.equal(handle(s, req('act', { move: 'insurance', take: true, seat: 0 }), env()).ok, false, 'déjà décidée');
  assert.equal(handle(s, req('act', { move: 'hit' }), env()).ok, false, 'pas d’action avant la fin des assurances');
  const end = ok(handle(s, req('act', { move: 'insurance', take: false, seat: 1 }), env()));
  assert.equal(end.done, true, 'blackjack du croupier : manche réglée');
  assert.deepEqual(hands(end).map((h) => h.outcome), ['lose', 'lose']);
  assert.equal(end.payout, 30, 'assurance 10 × 3 (mise rendue + 2:1)');
  assert.equal(s.chips!.balance, 10_000 - 60 + 30);
});

test('fin de manche, manche suivante, rejeu d’une requête et actions dans le désordre', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(10), C(10), C(10), C(10), C(7)]); // mains 20 et 20 ; croupier 10,7
  const deal = req('deal', { bets: [10, 10], table: 'debutant' });
  ok(handle(s, deal, env()));
  // Même requête renvoyée (double toucher, réseau) : refusée, rien de prélevé en plus
  assert.equal(handle(s, deal, env()).ok, false);
  assert.equal(s.chips!.balance, 10_000 - 20);
  ok(handle(s, req('act', { move: 'stand' }), env()));
  const end = ok(handle(s, req('act', { move: 'stand' }), env()));
  assert.equal(end.done, true);
  const after = s.chips!.balance;
  assert.equal(after, 10_000 - 20 + 40);
  // Actions après la fin : refusées, aucun second paiement
  for (const move of ['stand', 'hit', 'double', 'split']) assert.equal(handle(s, req('act', { move }), env()).ok, false);
  assert.equal(handle(s, deal, env()).ok, false, 'la donne d’une manche terminée n’est jamais rejouée');
  assert.equal(s.chips!.balance, after);
  // Manche suivante : nouvelle donne normale
  const next = ok(handle(s, req('deal', { bets: [5, 5, 5], table: 'debutant' }), env()));
  assert.equal(hands(next).length, 3);
  assert.equal(s.chips!.balance, after - 15);
});

test('moteur : une main sautée n’est jamais rejouée, les mains terminées restent figées', () => {
  const g = new Blackjack(seededRandom(3));
  g.shoe.stack([C(10), C(5), C(10), C(10), C(6), C(9), C(10)]);
  g.deal([10, 10]);
  g.hit(); // main 1 : 10,10,10 → saute, passe à la main 2
  assert.equal(g.active, 1);
  const frozen = JSON.stringify(g.hands[0]);
  g.hit(); g.hit(); g.stand();
  assert.equal(JSON.stringify({ ...g.hands[0], outcome: undefined, payout: undefined, bonus: undefined }), JSON.stringify({ ...JSON.parse(frozen), outcome: undefined, payout: undefined, bonus: undefined }));
  assert.equal(g.hands[0].outcome, 'lose');
});
