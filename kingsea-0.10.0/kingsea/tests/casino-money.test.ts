// Intégrité des jetons du casino : soldes vérifiés à chaque étape (avant, après la mise, après le résultat), sur des
// mains imposées (sabot contrôlé, sans hasard), plus les régressions des bugs corrigés en 0.15 :
//  • gain ignoré quand un identifiant de manche était réutilisé (historique de transactions glissant) ;
//  • jetons de bienvenue et cadeau de la réception reversés une fois sortis de cet historique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import type { Card } from '../src/games/logic/cards.ts';
import { abandonSession, handle, RECEPTION_GIFT, WELCOME_CHIPS, xpForLevel, type AuthEnv, type AuthReply, type AuthState } from '../src/authority/index';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });
const env = (): AuthEnv => ({ rng: seededRandom(3), now: 1_000_000, day: '2026-10-27', seed: 'joueur-test' });
let n = 0;
const rid = () => `money${++n}xx`;
const bj = (action: string, input: unknown, id = rid()) => ({ kind: 'casino' as const, game: 'blackjack', action, input, id });
const fresh = (chips = 1000): AuthState => ({
  wallet: { balance: 0, processedTx: [] }, chips: { balance: chips, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {},
  progress: { xp: xpForLevel(1), level: 1 } as unknown as AuthState['progress'],
});
function stackShoe(s: AuthState, next: Card[]): void {
  const filler: Card[] = Array.from({ length: 200 }, (_, i) => C((i % 13) + 1, '♣'));
  s.sessions['shoe:blackjack'] = { game: 'blackjack', tx: '', stake: 0, at: 0, data: { cards: [...filler, ...[...next].reverse()], shuffles: 1, base: 0 } as unknown as Record<string, unknown> };
}
const ok = (r: AuthReply): AuthReply & { ok: true } => { assert.ok(r.ok, r.ok ? '' : r.error); return r as AuthReply & { ok: true }; };
const bal = (s: AuthState) => s.chips!.balance;

/** Joue une main (une case) : sabot imposé, actions données, contrôle des soldes à chaque étape. */
function round(cards: Card[], bet: number, moves: Array<Record<string, unknown>>, expect: { afterBet: number; final: number; outcome?: string }) {
  const s = fresh();
  stackShoe(s, cards);
  const before = bal(s);
  let r = ok(handle(s, bj('deal', { bet, table: 'debutant' }), env()));
  assert.equal(bal(s), r.done ? before - bet + r.payout : before - bet, 'mise débitée à la distribution');
  if (!r.done) assert.equal(bal(s), expect.afterBet);
  for (const m of moves) r = ok(handle(s, bj('act', m), env()));
  assert.equal(r.done, true, 'manche réglée');
  assert.equal(bal(s), expect.final, 'solde final');
  if (expect.outcome) assert.equal((r.view.hands as Array<{ outcome: string }>)[0].outcome, expect.outcome);
  assert.equal(s.sessions.blackjack, undefined, 'plus de manche ouverte');
  return { s, r };
}

test('victoire 1:1 : 1000 → 990 (mise) → 1010 (retour 20 = mise 10 + gain net 10)', () => {
  round([C(10), C(10), C(9), C(7)], 10, [{ move: 'stand' }], { afterBet: 990, final: 1010, outcome: 'win' });
});
test('défaite : la mise reste prélevée, rien n’est rendu', () => {
  round([C(10), C(10), C(7), C(9)], 10, [{ move: 'stand' }], { afterBet: 990, final: 990, outcome: 'lose' });
});
test('égalité : mise rendue (net 0)', () => {
  round([C(10), C(10), C(8), C(8)], 10, [{ move: 'stand' }], { afterBet: 990, final: 1000, outcome: 'push' });
});
test('blackjack naturel : 3:2 + bonus maison 50 % → 10 misés, 25 + 5 rendus', () => {
  const s = fresh();
  stackShoe(s, [C(1), C(9), C(13), C(7)]);
  const r = ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  assert.equal(r.done, true, 'réglé immédiatement (croupier sans blackjack)');
  assert.equal(r.payout, 30); assert.equal(bal(s), 1000 - 10 + 30);
});
test('blackjack du croupier contre 20 : main perdue, aucune action possible ensuite', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(13), C(10), C(1)]); // croupier 10 visible + As caché : vérifié d'entrée
  const r = ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  assert.equal(r.done, true); assert.equal(bal(s), 990);
  assert.equal(handle(s, bj('act', { move: 'stand' }), env()).ok, false, 'manche déjà réglée');
  assert.equal(bal(s), 990);
});
test('dépassement de 21 : perdu tout de suite, même si le croupier dépasse ensuite', () => {
  round([C(10), C(6), C(6), C(10), C(10)], 10, [{ move: 'hit' }], { afterBet: 990, final: 990, outcome: 'lose' });
});
test('double : mise supplémentaire prélevée au moment du double, retour 4× la mise de départ en cas de victoire', () => {
  const s = fresh();
  stackShoe(s, [C(5), C(10), C(6), C(7), C(10)]); // 11 contre 10+7, carte du double : 10 → 21
  ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  assert.equal(bal(s), 990);
  const r = ok(handle(s, bj('act', { move: 'double' }), env()));
  assert.equal(r.stake, 10, 'supplément = mise initiale');
  assert.equal(r.done, true); assert.equal(r.payout, 40); assert.equal(bal(s), 1000 - 20 + 40);
});
test('séparation : chaque main garde sa mise, réglée séparément (une gagnée, une perdue)', () => {
  const s = fresh();
  // 8,8 contre 10 + 7 ; main 1 reçoit 10 (18, gagne) ; main 2 reçoit 10 puis tire 10 (dépasse)
  stackShoe(s, [C(8), C(10), C(8, '♥'), C(7), C(10), C(10, '♥'), C(10, '♦')]);
  ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  const sp = ok(handle(s, bj('act', { move: 'split' }), env()));
  assert.equal(sp.stake, 10); assert.equal(bal(s), 980, 'deux mises prélevées');
  ok(handle(s, bj('act', { move: 'stand' }), env()));
  const r = ok(handle(s, bj('act', { move: 'hit' }), env()));
  assert.equal(r.done, true);
  const h = r.view.hands as Array<{ outcome: string; payout: number; bet: number }>;
  assert.deepEqual(h.map((x) => [x.bet, x.outcome, x.payout]), [[10, 'win', 20], [10, 'lose', 0]]);
  assert.equal(bal(s), 1000 - 20 + 20);
});
test('séparation refusée faute de jetons : solde et main inchangés', () => {
  const s = fresh(15);
  stackShoe(s, [C(8), C(10), C(8, '♥'), C(7)]);
  ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  assert.equal(bal(s), 5);
  const r = handle(s, bj('act', { move: 'split' }), env());
  assert.equal(r.ok, false); assert.equal(bal(s), 5);
  assert.equal((s.sessions.blackjack.data.snapshot as { hands: unknown[] }).hands.length, 1, 'toujours une seule main');
});
test('double clic : la même requête rejouée n’est ni débitée ni payée deux fois', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(10), C(9), C(7)]);
  const id = rid();
  ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }, id), env()));
  assert.equal(handle(s, bj('deal', { bet: 10, table: 'debutant' }, id), env()).ok, false, 'même identifiant refusé');
  assert.equal(bal(s), 990, 'une seule mise');
  const stand = rid();
  ok(handle(s, bj('act', { move: 'stand' }, stand), env()));
  assert.equal(bal(s), 1010);
  assert.equal(handle(s, bj('act', { move: 'stand' }, stand), env()).ok, false);
  assert.equal(handle(s, bj('act', { move: 'stand' }), env()).ok, false, 'fin de manche déclenchée deux fois : refusée');
  assert.equal(bal(s), 1010, 'gain versé une seule fois');
});
test('interruption (application fermée en pleine main) puis réouverture : réglée une fois, selon la règle (le joueur reste)', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(10), C(9), C(7)]);
  ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  // Sauvegarde puis rechargement (même format que la sauvegarde du téléphone)
  const reloaded = JSON.parse(JSON.stringify(s)) as AuthState;
  assert.equal(abandonSession(reloaded, 'blackjack', env()), 20);
  assert.equal(reloaded.chips!.balance, 1010);
  assert.equal(abandonSession(reloaded, 'blackjack', env()), 0, 'deuxième règlement : rien');
  assert.equal(reloaded.chips!.balance, 1010);
});
test('sauvegarde puis rechargement en pleine main : la partie continue et se règle normalement', () => {
  const s = fresh();
  stackShoe(s, [C(10), C(10), C(9), C(7)]);
  ok(handle(s, bj('deal', { bet: 10, table: 'debutant' }), env()));
  const reloaded = JSON.parse(JSON.stringify(s)) as AuthState;
  const r = ok(handle(reloaded, bj('act', { move: 'stand' }), env()));
  assert.equal(r.payout, 20); assert.equal(reloaded.chips!.balance, 1010);
});

// ---------------------------------------------------------------- régressions des bugs corrigés
test('régression : une mise acceptée reçoit toujours son gain (identifiant de manche déjà connu → requête refusée, rien prélevé)', () => {
  const s = fresh();
  // Ancienne manche dont la mise est sortie de l'historique glissant mais pas le gain
  s.chips!.processedTx.push('blackjack:ancien1:gain');
  stackShoe(s, [C(10), C(10), C(9), C(7)]);
  const r = handle(s, bj('deal', { bet: 10, table: 'debutant' }, 'ancien1'), env());
  assert.equal(r.ok, false); assert.equal(bal(s), 1000, 'rien prélevé');
  // Machines à sous (réglées en une requête) : même garde
  s.chips!.processedTx.push('slots:ancien2:gain');
  assert.equal(handle(s, { kind: 'casino', game: 'slots', action: 'play', input: { machine: 'tresors', bet: 10 }, id: 'ancien2' }, env()).ok, false);
  assert.equal(bal(s), 1000);
});
test('régression : 3 000 mains au hasard (1 à 5 cases, actions variées) — solde = avant − mises + retours à chaque manche, aucun jeton créé', () => {
  const rng = seededRandom(7);
  const s = fresh(100_000);
  let anomalies = 0;
  for (let k = 0; k < 3000; k++) {
    const before = bal(s);
    let r = handle(s, bj('deal', { bets: Array.from({ length: 1 + Math.floor(rng() * 5) }, () => 5 + Math.floor(rng() * 20)), table: 'debutant' }), env());
    assert.ok(r.ok);
    let stake = r.stake, payout = r.payout;
    for (let g = 0; !r.done && g < 100; g++) {
      const v = (r as AuthReply & { ok: true }).view, can = (v.can ?? {}) as Record<string, boolean>;
      const input = v.phase === 'insurance' ? { move: 'insurance', take: rng() < 0.5 } : { move: (['hit', 'stand', 'double', 'split'].filter((m) => can[m]))[Math.floor(rng() * 4) % Math.max(1, ['hit', 'stand', 'double', 'split'].filter((m) => can[m]).length)] ?? 'stand' };
      r = handle(s, bj('act', input), env());
      assert.ok(r.ok, r.ok ? '' : r.error);
      stake += r.stake; payout += r.payout;
    }
    if (bal(s) !== before - stake + payout) anomalies++;
  }
  assert.equal(anomalies, 0, 'aucune manche ne crée ni ne perd de jetons');
  assert.ok(s.chips!.processedTx.length >= 400, 'historique de transactions plein (fenêtre glissante atteinte)');
});
test('régression : jetons de bienvenue versés une seule fois, même quand « chips:welcome » sort de l’historique', () => {
  const s: AuthState = { wallet: { balance: 0, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {} } as unknown as AuthState;
  ok(handle(s, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: rid() }, env()));
  assert.equal(bal(s), WELCOME_CHIPS, 'nouveau joueur : bienvenue versée');
  s.chips!.processedTx = Array.from({ length: 400 }, (_, i) => `autre:${i}`); // la bienvenue n'est plus dans la fenêtre
  ok(handle(s, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: rid() }, env()));
  assert.equal(bal(s), WELCOME_CHIPS, 'pas de second versement');
  // Ancien profil (sans le drapeau) dont l'historique a déjà tourné : aucun versement non plus
  const old = fresh(500); old.chips!.processedTx = ['autre:1'];
  ok(handle(old, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: rid() }, env()));
  assert.equal(old.chips!.balance, 500);
});
test('régression : cadeau de la réception versé une seule fois, même quand « gift:welcome » sort de l’historique', () => {
  const s = fresh();
  const r1 = ok(handle(s, { kind: 'purser', game: 'purser', action: 'gift', input: {}, id: rid() }, env()));
  assert.equal(r1.view.granted, RECEPTION_GIFT);
  s.wallet.processedTx = Array.from({ length: 400 }, (_, i) => `autre:${i}`);
  const coins = s.wallet.balance;
  const r2 = ok(handle(s, { kind: 'purser', game: 'purser', action: 'gift', input: {}, id: rid() }, env()));
  assert.equal(r2.view.granted, 0); assert.equal(s.wallet.balance, coins);
});
