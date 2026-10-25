// Blackjack classique — logique seule (aucun affichage). Règles retenues :
// sabot de 6 jeux, le croupier tire jusqu'à 17 et RESTE sur 17 souple, blackjack payé 3:2 (arrondi inférieur)
// PLUS un bonus KingSea de 50 % de la mise initiale (blackjack « naturel » uniquement : As + figure/10 en deux
// cartes, sans séparation ; un 21 en trois cartes ou plus n'est pas un blackjack),
// le croupier vérifie le blackjack sur As ou 10 visible, doubler sur les 2 premières cartes de chaque main
// (carte reçue face visible ou face cachée, retournée au règlement), une seule séparation (cartes de même rang) ;
// As séparés : une carte chacun.
import { handValue, isBlackjack, Shoe, type Card } from './cards';
import type { Rng } from './rng';

export type Phase = 'betting' | 'player' | 'dealer' | 'settled';
export interface BlackjackSnapshot { phase: Phase; hands: Hand[]; dealer: Card[]; active: number; shoe: Card[] }
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose';

export interface Hand {
  cards: Card[]; bet: number; done: boolean; doubled: boolean; splitAces: boolean; outcome?: Outcome;
  /** Somme rendue au règlement (mise comprise), bonus de blackjack inclus. */
  payout?: number;
  /** Bonus de blackjack naturel (déjà inclus dans payout). */
  bonus?: number;
  /** Double « face cachée » : la dernière carte reste retournée jusqu'au règlement. */
  hiddenDouble?: boolean;
}

/** Bonus KingSea sur un blackjack naturel : 50 % de la mise initiale, en plus du paiement 3:2. */
export const NATURAL_BONUS = 0.5;

/** Tables de blackjack : mises minimale et maximale (mise initiale), niveau requis. */
export interface BjTable { id: string; name: string; min: number; max: number; level: number; risk: string }
export const BJ_TABLES: BjTable[] = [
  { id: 'debutant', name: 'Débutant', min: 5, max: 100, level: 1, risk: 'Risque faible' },
  { id: 'standard', name: 'Standard', min: 25, max: 500, level: 1, risk: 'Risque modéré' },
  { id: 'premium', name: 'Premium', min: 100, max: 2000, level: 3, risk: 'Risque élevé' },
  { id: 'vip', name: 'VIP', min: 500, max: 5000, level: 5, risk: 'Risque très élevé' },
];
/** Paiement d'un blackjack naturel pour une mise donnée : [3:2 + mise, bonus]. */
export function naturalPayout(bet: number): { base: number; bonus: number } {
  return { base: Math.floor(bet * 2.5), bonus: Math.floor(bet * NATURAL_BONUS) };
}

export class Blackjack {
  phase: Phase = 'betting';
  hands: Hand[] = [];
  dealer: Card[] = [];
  active = 0;
  readonly shoe: Shoe;

  constructor(rng: Rng, decks = 6) { this.shoe = new Shoe(rng, decks); }

  get current(): Hand | undefined { return this.hands[this.active]; }

  /** État complet de la manche (pour la reprendre après une fermeture de l'application). */
  snapshot(): BlackjackSnapshot {
    return { phase: this.phase, hands: JSON.parse(JSON.stringify(this.hands)), dealer: this.dealer.map((c) => ({ ...c })), active: this.active, shoe: this.shoe.snapshot() };
  }

  static restore(snap: BlackjackSnapshot, rng: Rng): Blackjack {
    const g = new Blackjack(rng);
    g.phase = snap.phase; g.hands = JSON.parse(JSON.stringify(snap.hands)); g.dealer = snap.dealer.map((c) => ({ ...c })); g.active = snap.active;
    g.shoe.restore(snap.shoe);
    return g;
  }

  /** Règle de table pour un joueur absent : il reste sur toutes ses mains, le croupier termine. */
  autoFinish(): void { let guard = 10; while (this.phase === 'player' && guard-- > 0) this.stand(); }
  get dealerHoleHidden(): boolean { return this.phase === 'player'; }
  /** Somme engagée sur la manche (mise initiale + doubles + séparations). */
  get totalStake(): number { return this.hands.reduce((a, h) => a + h.bet, 0); }
  get totalPayout(): number { return this.hands.reduce((a, h) => a + (h.payout ?? 0), 0); }

  deal(bet: number): void {
    if (this.phase !== 'betting' && this.phase !== 'settled') throw new Error('Manche en cours');
    if (!Number.isInteger(bet) || bet <= 0) throw new Error('Mise invalide');
    if (this.shoe.needsShuffle) this.shoe.shuffle();
    this.hands = [{ cards: [], bet, done: false, doubled: false, splitAces: false }];
    this.dealer = [];
    this.active = 0;
    const h = this.hands[0];
    h.cards.push(this.shoe.draw()); this.dealer.push(this.shoe.draw());
    h.cards.push(this.shoe.draw()); this.dealer.push(this.shoe.draw());
    this.phase = 'player';
    const up = this.dealer[0];
    const dealerPeek = (up.rank === 1 || up.rank >= 10) && isBlackjack(this.dealer);
    if (isBlackjack(h.cards) || dealerPeek) { h.done = true; this.settle(); }
  }

  canHit(): boolean { const h = this.current; return this.phase === 'player' && !!h && !h.done && handValue(h.cards).total < 21; }
  canStand(): boolean { return this.phase === 'player' && !!this.current && !this.current.done; }
  canDouble(): boolean { const h = this.current; return this.phase === 'player' && !!h && !h.done && h.cards.length === 2 && !h.splitAces; }
  canSplit(): boolean {
    const h = this.current;
    return this.phase === 'player' && !!h && this.hands.length === 1 && h.cards.length === 2 && h.cards[0].rank === h.cards[1].rank;
  }

  hit(): void {
    if (!this.canHit()) return;
    const h = this.current!;
    h.cards.push(this.shoe.draw());
    if (handValue(h.cards).total >= 21) this.finishHand();
  }

  stand(): void { if (this.canStand()) this.finishHand(); }

  /** La mise supplémentaire doit avoir été prélevée par l'appelant. `faceDown` : carte reçue face cachée. */
  double(faceDown = false): void {
    if (!this.canDouble()) return;
    const h = this.current!;
    h.bet *= 2; h.doubled = true;
    if (faceDown) h.hiddenDouble = true;
    h.cards.push(this.shoe.draw());
    this.finishHand();
  }

  /** La mise de la seconde main doit avoir été prélevée par l'appelant. */
  split(): void {
    if (!this.canSplit()) return;
    const h = this.current!;
    const aces = h.cards[0].rank === 1;
    const second: Hand = { cards: [h.cards.pop()!], bet: h.bet, done: false, doubled: false, splitAces: aces };
    h.splitAces = aces;
    h.cards.push(this.shoe.draw());
    second.cards.push(this.shoe.draw());
    this.hands.push(second);
    if (aces) { h.done = true; second.done = true; this.advance(); }
    else if (handValue(h.cards).total === 21) this.finishHand();
  }

  private finishHand(): void {
    const h = this.current;
    if (h) h.done = true;
    this.advance();
  }

  private advance(): void {
    const next = this.hands.findIndex((h) => !h.done);
    if (next >= 0) { this.active = next; if (handValue(this.hands[next].cards).total === 21) this.finishHand(); return; }
    this.playDealer();
  }

  private playDealer(): void {
    this.phase = 'dealer';
    // Le croupier ne tire pas si toutes les mains du joueur ont sauté.
    if (this.hands.some((h) => handValue(h.cards).total <= 21)) {
      while (handValue(this.dealer).total < 17) this.dealer.push(this.shoe.draw());
    }
    this.settle();
  }

  private settle(): void {
    const d = handValue(this.dealer).total;
    const dealerBJ = isBlackjack(this.dealer);
    for (const h of this.hands) {
      const p = handValue(h.cards).total;
      const natural = isBlackjack(h.cards) && this.hands.length === 1;
      let o: Outcome;
      if (p > 21) o = 'lose';
      else if (natural && !dealerBJ) o = 'blackjack';
      else if (dealerBJ) o = natural ? 'push' : 'lose';
      else if (d > 21 || p > d) o = 'win';
      else if (p === d) o = 'push';
      else o = 'lose';
      h.outcome = o;
      const nat = naturalPayout(h.bet);
      h.bonus = o === 'blackjack' ? nat.bonus : 0;
      h.payout = o === 'blackjack' ? nat.base + nat.bonus : o === 'win' ? h.bet * 2 : o === 'push' ? h.bet : 0;
      h.done = true;
    }
    this.phase = 'settled';
  }
}
