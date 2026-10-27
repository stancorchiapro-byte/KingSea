// Cartes et sabot (plusieurs jeux de 52 cartes mélangés).
import { shuffle, type Rng } from './rng';

export type Suit = '♠' | '♥' | '♦' | '♣';
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export interface Card { rank: number; suit: Suit } // rank 1 (As) … 13 (Roi)

/**
 * Les 13 valeurs d'une couleur, en un seul endroit : rang logique (1 à 13), libellé imprimé sur la carte, nom et
 * valeur au blackjack (l'As vaut 11, ou 1 si 11 ferait dépasser 21 : voir handValue). L'affichage ne sert jamais au
 * calcul : les règles utilisent le rang et la valeur de cette table.
 */
export interface RankInfo { rank: number; label: string; name: string; blackjack: number }
export const RANKS: readonly RankInfo[] = [
  { rank: 1, label: 'A', name: 'As', blackjack: 11 },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ rank: n, label: String(n), name: String(n), blackjack: n })),
  { rank: 11, label: 'J', name: 'Valet', blackjack: 10 },
  { rank: 12, label: 'Q', name: 'Dame', blackjack: 10 },
  { rank: 13, label: 'K', name: 'Roi', blackjack: 10 },
];
export const SUIT_NAMES: Record<Suit, string> = { '♠': 'pique', '♥': 'cœur', '♦': 'carreau', '♣': 'trèfle' };
/** Description complète d'une carte (rang, enseigne, libellé, valeur au blackjack). */
export function cardInfo(c: Card): RankInfo & { suit: Suit; suitName: string; text: string } {
  const r = RANKS[c.rank - 1];
  if (!r) throw new Error(`Carte invalide : ${c.rank}`);
  return { ...r, suit: c.suit, suitName: SUIT_NAMES[c.suit], text: `${r.name} de ${SUIT_NAMES[c.suit]}` };
}
export const rankLabel = (r: number): string => RANKS[r - 1]?.label ?? '?';
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

/** Valeur « basse » d'une carte (As = 1) ; handValue compte un As à 11 quand c'est possible. */
export const cardPoints = (c: Card): number => (c.rank === 1 ? 1 : RANKS[c.rank - 1]?.blackjack ?? 0); // carte cachée (rang 0) : 0

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
