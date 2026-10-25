// Craps simplifié : Pass Line, Don't Pass, et Field (sur le premier lancer).
// Toute la séquence de lancers jusqu'à la résolution est tirée AU DÉPART (résultat fixé,
// l'animation ne fait que la dévoiler) — ce qui permet aussi de régler une manche interrompue.
import { randInt, type Rng } from './rng';

export type CrapsBet = 'pass' | 'dontpass' | 'field';
export interface CrapsRound { rolls: Array<[number, number]>; point: number | null; outcome: 'pass' | 'dontpass' | 'push12' }

export const rollDie = (rng: Rng): number => randInt(rng, 6) + 1;

export function playCraps(rng: Rng): CrapsRound {
  const rolls: Array<[number, number]> = [];
  const roll = (): number => { const d: [number, number] = [rollDie(rng), rollDie(rng)]; rolls.push(d); return d[0] + d[1]; };
  const first = roll();
  if (first === 7 || first === 11) return { rolls, point: null, outcome: 'pass' };
  if (first === 2 || first === 3) return { rolls, point: null, outcome: 'dontpass' };
  if (first === 12) return { rolls, point: null, outcome: 'push12' }; // Pass perd, Don't Pass rendu
  const point = first;
  for (;;) {
    const s = roll();
    if (s === point) return { rolls, point, outcome: 'pass' };
    if (s === 7) return { rolls, point, outcome: 'dontpass' };
  }
}

export function fieldReturn(sum: number): number {
  if (sum === 2 || sum === 12) return 3;
  return [3, 4, 9, 10, 11].includes(sum) ? 2 : 0;
}

export function crapsSettle(bets: Partial<Record<CrapsBet, number>>, r: CrapsRound): number {
  let ret = 0;
  const pass = bets.pass ?? 0, dp = bets.dontpass ?? 0, field = bets.field ?? 0;
  if (r.outcome === 'pass') ret += pass * 2;
  if (r.outcome === 'dontpass') ret += dp * 2;
  if (r.outcome === 'push12') ret += dp;
  if (field) ret += field * fieldReturn(r.rolls[0][0] + r.rolls[0][1]);
  return ret;
}
