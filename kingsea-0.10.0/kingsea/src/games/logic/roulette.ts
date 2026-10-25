// Roulette européenne (un seul zéro). Gains « pour 1 » standards ; retour = mise × multiplicateur.
import { randInt, type Rng } from './rng';

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export type BetKind =
  | { type: 'number'; n: number }
  | { type: 'red' } | { type: 'black' } | { type: 'odd' } | { type: 'even' } | { type: 'low' } | { type: 'high' }
  | { type: 'dozen'; d: 1 | 2 | 3 } | { type: 'column'; c: 1 | 2 | 3 };

export interface Bet { kind: BetKind; amount: number }

export const colorOf = (n: number): 'green' | 'red' | 'black' => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

export function betWins(k: BetKind, n: number): boolean {
  if (k.type === 'number') return k.n === n;
  if (n === 0) return false;
  switch (k.type) {
    case 'red': return RED.has(n);
    case 'black': return !RED.has(n);
    case 'odd': return n % 2 === 1;
    case 'even': return n % 2 === 0;
    case 'low': return n <= 18;
    case 'high': return n >= 19;
    case 'dozen': return Math.ceil(n / 12) === k.d;
    case 'column': return ((n - 1) % 3) + 1 === k.c;
  }
}

/** Retour total pour 1 misé (mise comprise) : plein 36, douzaine/colonne 3, chances simples 2. */
export function returnMultiplier(k: BetKind): number {
  if (k.type === 'number') return 36;
  if (k.type === 'dozen' || k.type === 'column') return 3;
  return 2;
}

export function betKey(k: BetKind): string {
  return k.type === 'number' ? `n${k.n}` : k.type === 'dozen' ? `d${k.d}` : k.type === 'column' ? `c${k.c}` : k.type;
}

export function settleBets(bets: Bet[], n: number): number {
  return bets.reduce((sum, b) => sum + (betWins(b.kind, n) ? b.amount * returnMultiplier(b.kind) : 0), 0);
}

export const spinWheel = (rng: Rng): number => randInt(rng, 37);
