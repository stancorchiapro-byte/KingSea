// Hasard des jeux. En production : générateur cryptographique du système (imprévisible).
// En test : générateur déterministe injecté. En multijoueur, le tirage se fera côté serveur.

export type Rng = () => number; // [0, 1)

export const secureRandom: Rng = () => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; }
  return Math.random();
};

export const randInt = (rng: Rng, n: number): number => Math.min(n - 1, Math.floor(rng() * n));

/** Index tiré selon des poids positifs. */
export function weightedIndex(rng: Rng, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/** Jour local au format AAAA-MM-JJ (récompenses quotidiennes). */
export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
