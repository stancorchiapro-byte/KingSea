// Plinko : 12 rangées de picots, la bille va à gauche ou à droite à chaque rangée (50/50).
// Le chemin complet est tiré au lâcher ; l'animation le suit. Trois niveaux de risque, chacun avec un taux de
// retour exact entre 96 et 97 % : risque faible (gains modestes, rarement en dessous de ×1), moyen (table
// d'origine), élevé (bords jusqu'à ×120 mais le centre ne rend que ×0,2).
import type { Rng } from './rng';

export const PLINKO_ROWS = 12;
export const PLINKO_MULT = [16, 9, 3, 1.5, 1.1, 0.7, 0.5, 0.7, 1.1, 1.5, 3, 9, 16];

export type PlinkoRisk = 'low' | 'medium' | 'high';
const sym = (half: number[], mid: number): number[] => [...half, mid, ...[...half].reverse()];
export const PLINKO_TABLES: Record<PlinkoRisk, number[]> = {
  low: sym([8, 3, 1.5, 1.2, 1.1, 1], 0.5),
  medium: PLINKO_MULT,
  high: sym([120, 25, 8, 2, 0.7, 0.2], 0.2),
};
export const PLINKO_RISK_LABEL: Record<PlinkoRisk, string> = { low: 'Risque faible', medium: 'Risque moyen', high: 'Risque élevé' };
export const isPlinkoRisk = (v: unknown): v is PlinkoRisk => v === 'low' || v === 'medium' || v === 'high';

export function plinkoPath(rng: Rng): number[] { return Array.from({ length: PLINKO_ROWS }, () => (rng() < 0.5 ? 0 : 1)); }
export const plinkoSlot = (path: number[]): number => path.reduce((a, b) => a + b, 0);
export const plinkoReturn = (path: number[], bet: number, risk: PlinkoRisk = 'medium'): number => Math.floor(bet * PLINKO_TABLES[risk][plinkoSlot(path)]);

export function plinkoRtp(risk: PlinkoRisk = 'medium'): number {
  let s = 0, c = 1;
  const m = PLINKO_TABLES[risk];
  for (let k = 0; k <= PLINKO_ROWS; k++) { s += (c / 2 ** PLINKO_ROWS) * m[k]; c = (c * (PLINKO_ROWS - k)) / (k + 1); }
  return s;
}
