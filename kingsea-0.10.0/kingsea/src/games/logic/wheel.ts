// Roue de la fortune quotidienne : un tirage par jour (date locale), récompense décidée par la logique,
// l'animation ne fait que montrer le résultat. Double protection : date enregistrée + transaction unique par jour.
import { weightedIndex, type Rng } from './rng';

export const WHEEL_SEGMENTS = [
  { coins: 10, weight: 22, color: '#1fc7c1' },
  { coins: 25, weight: 20, color: '#0b5ea8' },
  { coins: 50, weight: 16, color: '#7b4dff' },
  { coins: 15, weight: 20, color: '#ff6f91' },
  { coins: 100, weight: 8, color: '#e5b54a' },
  { coins: 30, weight: 18, color: '#59e3a7' },
  { coins: 250, weight: 2, color: '#ff3fa4' },
  { coins: 20, weight: 20, color: '#ff8c42' },
];

export const canSpinToday = (lastDay: string | null, today: string): boolean => lastDay !== today;

export function pickSegment(rng: Rng): number { return weightedIndex(rng, WHEEL_SEGMENTS.map((s) => s.weight)); }

export function expectedCoins(): number {
  const tw = WHEEL_SEGMENTS.reduce((a, s) => a + s.weight, 0);
  return WHEEL_SEGMENTS.reduce((a, s) => a + (s.coins * s.weight) / tw, 0);
}
