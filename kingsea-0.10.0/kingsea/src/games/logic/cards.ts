// Cartes et sabot (plusieurs jeux de 52 cartes mélangés).
import { shuffle, type Rng } from './rng';

export type Suit = '♠' | '♥' | '♦' | '♣';
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export interface Card { rank: number; suit: Suit } // rank 1 (As) … 13 (Roi)

export const rankLabel = (r: number): string => (r === 1 ? 'A' : r === 11 ? 'V' : r === 12 ? 'D' : r === 13 ? 'R' : String(r));
export const isRed = (c: Card): boolean => c.suit === '♥' || c.suit === '♦';

export class Shoe {
  private cards: Card[] = [];
  /** Coupe : on remélange quand il reste moins de 25 % du sabot. */
  readonly cutAt: number;
  constructor(private rng: Rng, readonly decks = 6) { this.cutAt = Math.floor(52 * decks * 0.25); this.shuffle(); }
  shuffle(): void {
    this.shuffles++;
    this.cards = [];
    for (let d = 0; d < this.decks; d++) for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) this.cards.push({ rank, suit });
    shuffle(this.cards, this.rng);
  }
  get remaining(): number { return this.cards.length; }
  get needsShuffle(): boolean { return this.cards.length < this.cutAt; }
  draw(): Card {
    if (!this.cards.length) this.shuffle();
    return this.cards.pop()!;
  }
  /** Nombre de remélanges (le comptage Hi-Lo repart à zéro). */
  shuffles = 0;
  /** Contenu restant du sabot (sauvegarde d'une manche en cours). */
  snapshot(): Card[] { return this.cards.map((c) => ({ ...c })); }
  restore(cards: Card[]): void { this.cards = cards.map((c) => ({ ...c })); }
  /** Pour les tests : impose les prochaines cartes (la première de la liste sort en premier). */
  stack(next: Card[]): void { this.cards.push(...[...next].reverse()); }
}

export const cardPoints = (c: Card): number => (c.rank === 1 ? 1 : Math.min(10, c.rank));

/** Valeur d'une main de blackjack : les As valent 11 tant que la main ne dépasse pas 21. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardPoints(c); if (c.rank === 1) aces++; }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export const isBlackjack = (cards: Card[]): boolean => cards.length === 2 && handValue(cards).total === 21;

/** Comptage Hi-Lo (blackjack Hi-Lo, phase 4) : 2-6 → +1, 7-9 → 0, 10-As → −1. */
export function hiLo(c: Card): number { const p = cardPoints(c); return p >= 2 && p <= 6 ? 1 : p >= 7 && p <= 9 ? 0 : -1; }
