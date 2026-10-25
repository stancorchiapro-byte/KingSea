// Crash : un multiplicateur monte depuis ×1,00 et « s'écrase » à un point tiré au départ.
// Encaisser avant l'écrasement rapporte mise × multiplicateur. P(écrasement ≥ m) = 0,97 / m
// → taux de retour de 97 % quelle que soit la stratégie.
import type { Rng } from './rng';

export const CRASH_RTP = 0.97;
export const CRASH_MAX = 100;

export function crashPoint(rng: Rng): number {
  const u = rng();
  const m = CRASH_RTP / (1 - u);
  return Math.min(CRASH_MAX, Math.max(1, Math.floor(m * 100) / 100));
}

/** Multiplicateur affiché après t secondes de montée. */
export const crashMultiplier = (t: number): number => Math.floor(Math.exp(0.11 * t) * 100) / 100;
/** Temps nécessaire pour atteindre un multiplicateur. */
export const timeToReach = (m: number): number => Math.log(m) / 0.11;

export function crashReturn(bet: number, cashedAt: number | null, point: number): number {
  if (cashedAt === null || cashedAt > point) return 0;
  return Math.floor(bet * cashedAt);
}
