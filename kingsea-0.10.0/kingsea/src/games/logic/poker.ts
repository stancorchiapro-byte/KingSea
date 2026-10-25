// Évaluation des mains de poker à 5 cartes et tables de paiement (poker vidéo).
import type { Card } from './cards';

export const HAND_NAMES = ['Hauteur', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush', 'Quinte flush royale'] as const;
export type HandRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface HandEval { rank: HandRank; name: string; /** valeur de la paire la plus haute (As = 14) */ pairValue: number }

const val = (r: number) => (r === 1 ? 14 : r);

export function evaluate(cards: Card[]): HandEval {
  if (cards.length !== 5) throw new Error('5 cartes attendues');
  const vals = cards.map((c) => val(c.rank)).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(vals)];
  let straight = false, high = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) { straight = true; high = vals[0]; }
    else if (vals[0] === 14 && vals[1] === 5) { straight = true; high = 5; } // roue A-2-3-4-5
  }
  let rank: HandRank;
  if (straight && flush) rank = high === 14 ? 9 : 8;
  else if (groups[0][1] === 4) rank = 7;
  else if (groups[0][1] === 3 && groups[1][1] === 2) rank = 6;
  else if (flush) rank = 5;
  else if (straight) rank = 4;
  else if (groups[0][1] === 3) rank = 3;
  else if (groups[0][1] === 2 && groups[1][1] === 2) rank = 2;
  else if (groups[0][1] === 2) rank = 1;
  else rank = 0;
  const pairValue = groups[0][1] >= 2 ? groups[0][0] : 0;
  return { rank, name: HAND_NAMES[rank], pairValue };
}

/** Table de paiement : retour (× mise) par rang de main ; `minPair` = valeur minimale d'une paire payée. */
export interface PayTable { name: string; pays: Record<number, number>; minPair: number }

/** Poker classique : « Valets ou mieux » 8/5 (≈ 97,3 % avec une stratégie optimale). */
export const JACKS_OR_BETTER: PayTable = { name: 'Valets ou mieux', minPair: 11, pays: { 9: 250, 8: 50, 7: 25, 6: 8, 5: 5, 4: 4, 3: 3, 2: 2, 1: 1 } };

/**
 * Direct Poker KS (variante maison, documentée) : 5 cartes servies, AUCUN échange, paiement immédiat.
 * Paire de 10 ou mieux payée. Table configurable ; taux de retour exact calculé dans les tests (≈ 96,5 %).
 */
export const DIRECT_POKER: PayTable = { name: 'Direct Poker KS', minPair: 10, pays: { 9: 1000, 8: 300, 7: 100, 6: 45, 5: 35, 4: 25, 3: 9, 2: 4, 1: 2 } };

export function payout(table: PayTable, e: HandEval): number {
  if (e.rank === 1 && e.pairValue < table.minPair) return 0;
  return table.pays[e.rank] ?? 0;
}
