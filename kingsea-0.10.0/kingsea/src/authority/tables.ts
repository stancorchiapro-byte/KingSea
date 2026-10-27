// Tables multijoueurs du casino — partie « autorité » (règles pures, sans réseau) :
// validation des mises, tirage commun à toute la table, calcul du gain de chaque joueur, et opérations sur les
// jetons d'un joueur (prélèvement de la mise, versement du gain) avec identifiants de transaction uniques.
// Le serveur (server/tables.ts) orchestre le temps, les places et la diffusion ; il appelle ces fonctions
// à l'intérieur de transact() (atomique : rien n'est modifié en cas de refus).
import { bacSettle, playBaccarat, type BacBet } from '../games/logic/baccarat';
import { Shoe } from '../games/logic/cards';
import { crapsSettle, playCraps, type CrapsBet, type CrapsRound } from '../games/logic/craps';
import { drawKeno, kenoReturn } from '../games/logic/keno';
import { makeField, raceOrder, raceReturn, type Horse } from '../games/logic/races';
import { settleBets, spinWheel, type Bet } from '../games/logic/roulette';
import type { Rng } from '../games/logic/rng';
import { checkTotal, namedBets, rouletteBets, total } from './casino';
import { chips, ensureEconomy } from './economy';
import { onRound } from './progress';
import { amount, AuthError, incStat, obj, type AuthEnv, type AuthState } from './types';

/** Jeux à manche partagée : un seul tirage pour toute la table, chacun mise selon ses choix. */
export type RoundGame = 'roulette' | 'baccarat' | 'craps' | 'keno' | 'races';
export const ROUND_GAMES: RoundGame[] = ['roulette', 'baccarat', 'craps', 'keno', 'races'];
/** Jeux personnels (machines) : chacun joue pour soi, la table montre les voisins et leurs résultats. */
export const BANK_GAMES = ['slots', 'plinko', 'poker', 'direct-poker'] as const;
/** Places par table (5 au standard ; tous les jeux du casino le permettent). */
export const TABLE_CAPACITY: Record<string, number> = {
  roulette: 5, baccarat: 5, craps: 5, keno: 5, races: 5, crash: 5, blackjack: 5, 'blackjack-hilo': 5, slots: 5, plinko: 5, poker: 5, 'direct-poker': 5,
};
/** Durée de l'animation commune après le tirage (ms) : personne ne remise avant la fin. */
export const ROUND_SHOW_MS: Record<RoundGame, number> = { roulette: 5600, baccarat: 4500, craps: 2500, keno: 6500, races: 9500 };

export interface RoundBet { stake: number; data: unknown }
export interface RoundContext { field?: Horse[] }

/** Vérifie la mise d'un joueur pour une manche partagée (lève AuthError). */
export function validateRoundBet(game: RoundGame, raw: unknown, ctx: RoundContext): RoundBet {
  const input = obj(raw);
  switch (game) {
    case 'roulette': { const bets = rouletteBets(input.bets); return { stake: checkTotal(bets.reduce((a, b) => a + b.amount, 0)), data: bets }; }
    case 'baccarat': { const bets = namedBets<BacBet>(input.bets, ['player', 'banker', 'tie']); return { stake: checkTotal(total(bets)), data: bets }; }
    case 'craps': { const bets = namedBets<CrapsBet>(input.bets, ['pass', 'dontpass', 'field']); return { stake: checkTotal(total(bets)), data: bets }; }
    case 'keno': {
      const picks = input.picks;
      if (!Array.isArray(picks) || picks.length < 1 || picks.length > 10 || new Set(picks).size !== picks.length || !picks.every((n) => Number.isInteger(n) && n >= 1 && n <= 80)) throw new AuthError('Numéros invalides');
      const bet = amount(input.bet, 100);
      return { stake: bet, data: { picks, bet } };
    }
    case 'races': {
      const field = ctx.field ?? [];
      const rawBets = obj(input.bets), bets: Record<number, number> = {};
      for (const [k, v] of Object.entries(rawBets)) { const i = Number(k); if (!Number.isInteger(i) || i < 0 || i >= field.length) throw new AuthError('Cheval inconnu'); bets[i] = amount(v); }
      return { stake: checkTotal(total(bets)), data: bets };
    }
  }
}

/** Prépare une manche (courses : partants et cotes affichés avant les mises). */
export function openRound(game: RoundGame, rng: Rng): RoundContext { return game === 'races' ? { field: makeField(rng) } : {}; }

/** Tirage commun (vue publique, identique pour tous les joueurs de la table). */
export function drawRound(game: RoundGame, rng: Rng, ctx: RoundContext): Record<string, unknown> {
  switch (game) {
    case 'roulette': return { result: spinWheel(rng) };
    case 'baccarat': { const shoe = new Shoe(rng, 8); const r = playBaccarat(() => shoe.draw()); return { player: r.player, banker: r.banker, winner: r.winner }; }
    case 'craps': return { round: playCraps(rng) };
    case 'keno': return { drawn: drawKeno(rng) };
    case 'races': return { order: raceOrder(ctx.field ?? [], rng), field: ctx.field };
  }
}

/** Gain (mise comprise) d'un joueur pour le tirage commun. */
export function settleRound(game: RoundGame, bet: RoundBet, outcome: Record<string, unknown>, ctx: RoundContext): number {
  switch (game) {
    case 'roulette': return settleBets(bet.data as Bet[], outcome.result as number);
    case 'baccarat': return bacSettle(bet.data as Partial<Record<BacBet, number>>, outcome.winner as BacBet);
    case 'craps': return crapsSettle(bet.data as Partial<Record<CrapsBet, number>>, outcome.round as CrapsRound);
    case 'keno': { const d = bet.data as { picks: number[]; bet: number }; return kenoReturn(d.picks, outcome.drawn as number[], d.bet); }
    case 'races': return raceReturn(ctx.field ?? [], bet.data as Record<number, number>, (outcome.order as number[])[0]);
  }
}

/** Prélève une mise de table (identifiant unique : la même mise n'est jamais prélevée deux fois). */
export function tableStake(s: AuthState, tx: string, stake: number): void {
  ensureEconomy(s);
  if (!Number.isInteger(stake) || stake <= 0) throw new AuthError('Mise invalide');
  if (chips.balance(s) < stake) throw new AuthError('Pas assez de jetons : passe à la caisse du casino');
  if (!chips.apply(s, -stake, `${tx}:mise`)) throw new AuthError('Mise déjà enregistrée');
}

/** Verse le gain d'une manche de table (une seule fois) et compte la manche (statistiques, XP, missions). */
export function tablePayout(s: AuthState, game: string, tx: string, payout: number, env: AuthEnv): boolean {
  ensureEconomy(s);
  if (s.chips!.processedTx.includes(`${tx}:gain`)) return false;
  chips.apply(s, Math.max(0, Math.floor(payout)), `${tx}:gain`);
  incStat(s, `plays.${game}`);
  onRound(s, game, env);
  return true;
}

/** Rembourse une mise (manche annulée : arrêt du serveur). */
export function tableRefund(s: AuthState, tx: string, stake: number): boolean {
  ensureEconomy(s);
  if (s.chips!.processedTx.includes(`${tx}:gain`) || s.chips!.processedTx.includes(`${tx}:rembourse`)) return false;
  return chips.apply(s, stake, `${tx}:rembourse`);
}
