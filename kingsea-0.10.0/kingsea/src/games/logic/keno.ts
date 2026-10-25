// Keno : 80 numéros, 20 tirés. Le joueur choisit de 1 à 10 numéros.
// Tables de gains par nombre de numéros joués ; taux de retour exacts (loi hypergéométrique, voir tests).
import { shuffle, type Rng } from './rng';

/** KENO_PAY[spots][hits] = retour (× mise). */
export const KENO_PAY: Record<number, number[]> = {
  1: [0, 3.7],
  2: [0, 1, 9],
  3: [0, 0, 3, 36],
  4: [0, 0, 2, 5, 90],
  5: [0, 0, 1, 3, 15, 350],
  6: [0, 0, 0.5, 2, 6.5, 55, 1100],
  7: [0, 0, 0.5, 1.5, 4, 14, 120, 2500],
  8: [0, 0, 0, 1, 3, 11, 60, 500, 8000],
  9: [0, 0, 0, 1, 2, 4, 25, 160, 2000, 15000],
  10: [2, 0, 0, 0, 1, 3, 15, 110, 1000, 6000, 25000],
};

export function drawKeno(rng: Rng): number[] {
  const all = Array.from({ length: 80 }, (_, i) => i + 1);
  return shuffle(all, rng).slice(0, 20);
}

export const kenoHits = (picks: number[], drawn: number[]): number => picks.filter((n) => drawn.includes(n)).length;

export function kenoReturn(picks: number[], drawn: number[], bet: number): number {
  const table = KENO_PAY[picks.length];
  if (!table) return 0;
  return Math.floor(bet * (table[kenoHits(picks, drawn)] ?? 0));
}

const choose = (n: number, k: number): number => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };

/** Taux de retour théorique pour un nombre de numéros joués. */
export function kenoRtp(spots: number): number {
  const t = KENO_PAY[spots];
  let s = 0;
  for (let h = 0; h <= spots; h++) s += ((choose(20, h) * choose(60, spots - h)) / choose(80, spots)) * (t[h] ?? 0);
  return s;
}
