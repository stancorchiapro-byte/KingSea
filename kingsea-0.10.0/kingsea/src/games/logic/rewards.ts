// Registre commun des mini-jeux : parties jouées, meilleurs scores, récompenses en KSCoins plafonnées par jour
// (on ne peut pas « farmer » un mini-jeu gratuit). Chaque récompense porte une transaction unique.
import type { Wallet } from '../../systems/Wallet';

export const DAILY_REWARD_CAP = 120;

export interface ResultInput { game: string; score: number; reward: number; better: 'high' | 'low'; today: string }
export interface ResultOutput { granted: number; newBest: boolean; best: number; plays: number; capReached: boolean }

export function recordResult(stats: Record<string, number>, wallet: Wallet, r: ResultInput): ResultOutput {
  const plays = (stats[`plays.${r.game}`] ?? 0) + 1;
  stats[`plays.${r.game}`] = plays;
  const prev = stats[`best.${r.game}`];
  const newBest = prev === undefined || (r.better === 'high' ? r.score > prev : r.score < prev);
  if (newBest) stats[`best.${r.game}`] = r.score;
  const key = `earned.${r.game}.${r.today}`;
  const already = stats[key] ?? 0;
  const want = Math.max(0, Math.floor(r.reward));
  const granted = Math.min(want, Math.max(0, DAILY_REWARD_CAP - already));
  let paid = 0;
  if (granted > 0) {
    const res = wallet.earn(granted, `reward:${r.game}:${r.today}:${plays}`);
    if (res.ok) { stats[key] = already + granted; paid = granted; }
  }
  // Nettoyage : on ne garde que les compteurs du jour.
  for (const k of Object.keys(stats)) if (k.startsWith(`earned.${r.game}.`) && k !== key) delete stats[k];
  return { granted: paid, newBest, best: stats[`best.${r.game}`], plays, capReached: (stats[key] ?? 0) >= DAILY_REWARD_CAP };
}
