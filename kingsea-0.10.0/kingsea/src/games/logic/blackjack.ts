// Blackjack classique — logique seule (aucun affichage), de 1 à 5 places autour d'un même croupier.
// Règles de table (configurables, affichées au joueur, voir BJ_RULES et rulesText) :
//   sabot de 6 jeux, le croupier tire jusqu'à 16 et RESTE sur tous les 17 (y compris 17 souple),
//   le croupier vérifie le blackjack (« peek ») quand sa carte visible est un As ou une carte de valeur 10,
//   blackjack payé 3:2 (arrondi inférieur) — plus, sur les tables KingSea, un bonus maison de 50 % de la mise
//   initiale (blackjack « naturel » uniquement : deux premières cartes, hors séparation),
//   assurance proposée quand le croupier montre un As (au plus la moitié de la mise, payée 2:1),
//   doubler sur les deux premières cartes de chaque main, y compris après une séparation (carte face visible ou
//   face cachée, retournée au règlement), séparer les paires de même rang jusqu'à 4 mains par place,
//   As séparés : une seule carte chacun, pas de nouvelle séparation, 21 obtenu ainsi = 21 ordinaire,
//   égalité : mise rendue ; main à plus de 21 : perdue même si le croupier dépasse aussi.
import { handValue, isBlackjack, Shoe, type Card } from './cards';
import type { Rng } from './rng';

export type Phase = 'betting' | 'insurance' | 'player' | 'dealer' | 'settled';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose';

export interface Hand {
  cards: Card[]; bet: number; done: boolean; doubled: boolean; splitAces: boolean; outcome?: Outcome;
  /** Place (0 à 4) à laquelle appartient la main. */
  seat?: number;
  /** Main issue d'une séparation (un 21 en deux cartes n'y est pas un blackjack). */
  fromSplit?: boolean;
  /** Somme rendue au règlement (mise comprise), bonus de blackjack inclus. */
  payout?: number;
  /** Bonus de blackjack naturel (déjà inclus dans payout). */
  bonus?: number;
  /** Double « face cachée » : la dernière carte reste retournée jusqu'au règlement. */
  hiddenDouble?: boolean;
}

/** Assurance d'une place : montant misé (0 : refusée), décision prise, somme rendue (mise comprise). */
export interface Insurance { amount: number; decided: boolean; payout: number }

export interface BjRules {
  decks: number;
  /** Le croupier reste sur 17 souple (S17). */
  standSoft17: boolean;
  /** Paiement du blackjack (1,5 = 3:2). */
  blackjackPays: number;
  /** Bonus maison KingSea sur un blackjack naturel (fraction de la mise initiale ; 0 : aucun). */
  naturalBonus: number;
  /** Mains maximales par place après séparations. */
  maxHands: number;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  /** Assurance proposée quand le croupier montre un As. */
  insurance: boolean;
}

export const BJ_RULES: BjRules = { decks: 6, standSoft17: true, blackjackPays: 1.5, naturalBonus: 0.5, maxHands: 4, doubleAfterSplit: true, resplitAces: false, insurance: true };

/** Bonus KingSea sur un blackjack naturel : 50 % de la mise initiale, en plus du paiement 3:2. */
export const NATURAL_BONUS = BJ_RULES.naturalBonus;

/** Règles affichées au joueur (une ligne par règle). */
export function rulesText(r: BjRules = BJ_RULES): string[] {
  return [
    `Sabot de ${r.decks} jeux ; le croupier tire jusqu’à 16 et ${r.standSoft17 ? 'reste' : 'tire'} sur 17 souple.`,
    `Blackjack payé ${r.blackjackPays === 1.5 ? '3:2' : `${r.blackjackPays}:1`}${r.naturalBonus ? ` + bonus maison KingSea de ${Math.round(r.naturalBonus * 100)} % de la mise (blackjack naturel)` : ''}.`,
    'Le croupier vérifie son blackjack quand il montre un As ou un 10.',
    ...(r.insurance ? ['Assurance proposée sur un As du croupier : moitié de la mise au plus, payée 2:1.'] : []),
    `Doubler sur les deux premières cartes${r.doubleAfterSplit ? ', y compris après une séparation' : ''}.`,
    `Séparer les paires de même rang jusqu’à ${r.maxHands} mains ; As séparés : une carte chacun${r.resplitAces ? '' : ', sans nouvelle séparation'}.`,
    'Égalité : mise rendue. Au-delà de 21 : main perdue.',
  ];
}

/** Tables de blackjack : mises minimale et maximale (mise initiale), niveau requis. */
export interface BjTable { id: string; name: string; min: number; max: number; level: number; risk: string }
export const BJ_TABLES: BjTable[] = [
  { id: 'debutant', name: 'Débutant', min: 5, max: 100, level: 1, risk: 'Risque faible' },
  { id: 'standard', name: 'Standard', min: 25, max: 500, level: 1, risk: 'Risque modéré' },
  { id: 'premium', name: 'Premium', min: 100, max: 2000, level: 3, risk: 'Risque élevé' },
  { id: 'vip', name: 'VIP', min: 500, max: 5000, level: 5, risk: 'Risque très élevé' },
];

/** Paiement d'un blackjack naturel pour une mise donnée : [3:2 + mise, bonus]. */
export function naturalPayout(bet: number, r: BjRules = BJ_RULES): { base: number; bonus: number } {
  return { base: Math.floor(bet * (1 + r.blackjackPays)), bonus: Math.floor(bet * r.naturalBonus) };
}

/** Mise d'assurance maximale pour une mise initiale (la moitié, arrondie à l'inférieur). */
export const insuranceCost = (bet: number): number => Math.floor(bet / 2);

const tenValue = (c: Card) => c.rank === 1 || c.rank >= 10;

export interface BlackjackSnapshot { phase: Phase; hands: Hand[]; dealer: Card[]; active: number; shoe: Card[]; insurance?: Record<number, Insurance>; seats?: number }

export class Blackjack {
  phase: Phase = 'betting';
  hands: Hand[] = [];
  dealer: Card[] = [];
  active = 0;
  /** Nombre de places servies à cette manche. */
  seats = 1;
  insurance: Record<number, Insurance> = {};
  readonly shoe: Shoe;

  constructor(rng: Rng, decks = BJ_RULES.decks, readonly rules: BjRules = BJ_RULES) { this.shoe = new Shoe(rng, decks); }

  get current(): Hand | undefined { return this.hands[this.active]; }

  /** État complet de la manche (pour la reprendre après une fermeture de l'application). */
  snapshot(): BlackjackSnapshot {
    return { phase: this.phase, hands: JSON.parse(JSON.stringify(this.hands)), dealer: this.dealer.map((c) => ({ ...c })), active: this.active, shoe: this.shoe.snapshot(), insurance: JSON.parse(JSON.stringify(this.insurance)), seats: this.seats };
  }

  static restore(snap: BlackjackSnapshot, rng: Rng, rules: BjRules = BJ_RULES): Blackjack {
    const g = new Blackjack(rng, BJ_RULES.decks, rules);
    g.phase = snap.phase; g.hands = JSON.parse(JSON.stringify(snap.hands)); g.dealer = snap.dealer.map((c) => ({ ...c })); g.active = snap.active;
    g.insurance = snap.insurance ? JSON.parse(JSON.stringify(snap.insurance)) : {};
    g.seats = snap.seats ?? Math.max(1, ...g.hands.map((h) => (h.seat ?? 0) + 1));
    for (const h of g.hands) h.seat ??= 0;
    g.shoe.restore(snap.shoe);
    return g;
  }

  /** Règle de table pour un joueur absent : pas d'assurance, il reste sur toutes ses mains, le croupier termine. */
  autoFinish(): void {
    for (let s = 0; s < this.seats; s++) if (this.phase === 'insurance' && !this.insurance[s]?.decided) this.insure(s, false);
    let guard = 40; while (this.phase === 'player' && guard-- > 0) this.stand();
  }
  /** Laisse une place passer (absente ou délai dépassé) : refuse l'assurance ou reste sur la main en cours. */
  autoAct(): void {
    if (this.phase === 'insurance') { for (let s = 0; s < this.seats; s++) if (!this.insurance[s]?.decided) this.insure(s, false); return; }
    if (this.phase === 'player') this.stand();
  }
  get dealerHoleHidden(): boolean { return this.phase === 'player' || this.phase === 'insurance'; }
  /** Somme engagée sur la manche (mises initiales + doubles + séparations + assurances). */
  get totalStake(): number { return this.hands.reduce((a, h) => a + h.bet, 0) + Object.values(this.insurance).reduce((a, i) => a + i.amount, 0); }
  get totalPayout(): number { return this.hands.reduce((a, h) => a + (h.payout ?? 0), 0) + Object.values(this.insurance).reduce((a, i) => a + i.payout, 0); }
  /** Mises et gains d'une place. */
  seatStake(seat: number): number { return this.hands.filter((h) => h.seat === seat).reduce((a, h) => a + h.bet, 0) + (this.insurance[seat]?.amount ?? 0); }
  seatPayout(seat: number): number { return this.hands.filter((h) => h.seat === seat).reduce((a, h) => a + (h.payout ?? 0), 0) + (this.insurance[seat]?.payout ?? 0); }
  /** Place dont c'est le tour (−1 : aucune). */
  get activeSeat(): number { return this.phase === 'player' ? this.current?.seat ?? 0 : -1; }

  /** Distribue une manche : une mise (une place) ou une mise par place. */
  deal(bets: number | number[]): void {
    if (this.phase !== 'betting' && this.phase !== 'settled') throw new Error('Manche en cours');
    const list = Array.isArray(bets) ? bets : [bets];
    if (!list.length || list.length > 5 || list.some((b) => !Number.isInteger(b) || b <= 0)) throw new Error('Mise invalide');
    if (this.shoe.needsShuffle) this.shoe.shuffle();
    this.seats = list.length;
    this.hands = list.map((bet, seat) => ({ cards: [], bet, done: false, doubled: false, splitAces: false, seat }));
    this.dealer = [];
    this.insurance = {};
    this.active = 0;
    // Une carte à chaque place, une au croupier, puis une seconde à chacun
    for (const h of this.hands) h.cards.push(this.shoe.draw());
    this.dealer.push(this.shoe.draw());
    for (const h of this.hands) h.cards.push(this.shoe.draw());
    this.dealer.push(this.shoe.draw());
    const up = this.dealer[0];
    if (up.rank === 1 && this.rules.insurance) { this.phase = 'insurance'; return; }
    this.afterPeek(tenValue(up) && isBlackjack(this.dealer));
  }

  /** Décision d'assurance d'une place (la mise d'assurance doit avoir été prélevée par l'appelant). */
  canInsure(seat: number): boolean { return this.phase === 'insurance' && seat >= 0 && seat < this.seats && !this.insurance[seat]?.decided; }
  insure(seat: number, take: boolean): void {
    if (!this.canInsure(seat)) return;
    const first = this.hands.find((h) => h.seat === seat);
    this.insurance[seat] = { amount: take && first ? insuranceCost(first.bet) : 0, decided: true, payout: 0 };
    let all = true;
    for (let s = 0; s < this.seats; s++) if (!this.insurance[s]?.decided) all = false;
    if (all) this.resolveInsurance();
  }

  private resolveInsurance(): void {
    const dealerBJ = isBlackjack(this.dealer);
    for (const i of Object.values(this.insurance)) i.payout = dealerBJ ? i.amount * 3 : 0;
    this.phase = 'player';
    this.afterPeek(dealerBJ);
  }

  /** Après la vérification du croupier : blackjack du croupier → règlement ; sinon les naturels sont servis. */
  private afterPeek(dealerBJ: boolean): void {
    this.phase = 'player';
    if (dealerBJ) { for (const h of this.hands) h.done = true; this.settle(); return; }
    for (const h of this.hands) if (isBlackjack(h.cards)) h.done = true;
    this.active = -1;
    this.advance();
  }

  private seatHands(seat: number): Hand[] { return this.hands.filter((h) => h.seat === seat); }

  canHit(): boolean { const h = this.current; return this.phase === 'player' && !!h && !h.done && !h.splitAces && handValue(h.cards).total < 21; }
  canStand(): boolean { return this.phase === 'player' && !!this.current && !this.current.done; }
  canDouble(): boolean {
    const h = this.current;
    return this.phase === 'player' && !!h && !h.done && h.cards.length === 2 && !h.splitAces && (!h.fromSplit || this.rules.doubleAfterSplit);
  }
  canSplit(): boolean {
    const h = this.current;
    if (this.phase !== 'player' || !h || h.done || h.cards.length !== 2 || h.cards[0].rank !== h.cards[1].rank) return false;
    if (h.splitAces && !this.rules.resplitAces) return false;
    return this.seatHands(h.seat ?? 0).length < this.rules.maxHands;
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

  /** La mise de la nouvelle main doit avoir été prélevée par l'appelant. */
  split(): void {
    if (!this.canSplit()) return;
    const h = this.current!;
    const aces = h.cards[0].rank === 1;
    const second: Hand = { cards: [h.cards.pop()!], bet: h.bet, done: false, doubled: false, splitAces: aces, seat: h.seat, fromSplit: true };
    h.splitAces = aces; h.fromSplit = true;
    h.cards.push(this.shoe.draw());
    second.cards.push(this.shoe.draw());
    // La nouvelle main se joue juste après celle-ci (même place)
    this.hands.splice(this.active + 1, 0, second);
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
    this.active = Math.max(0, Math.min(this.active, this.hands.length - 1));
    this.playDealer();
  }

  private playDealer(): void {
    this.phase = 'dealer';
    // Le croupier ne tire pas si toutes les mains ont sauté ou sont des blackjacks déjà gagnés.
    const live = this.hands.some((h) => handValue(h.cards).total <= 21 && !(isBlackjack(h.cards) && !h.fromSplit));
    if (live) {
      for (;;) {
        const v = handValue(this.dealer);
        if (v.total > 17 || (v.total === 17 && (!v.soft || this.rules.standSoft17))) break;
        this.dealer.push(this.shoe.draw());
      }
    }
    this.settle();
  }

  private settle(): void {
    const d = handValue(this.dealer).total;
    const dealerBJ = isBlackjack(this.dealer);
    for (const h of this.hands) {
      const p = handValue(h.cards).total;
      const natural = isBlackjack(h.cards) && !h.fromSplit;
      let o: Outcome;
      if (p > 21) o = 'lose';
      else if (natural && !dealerBJ) o = 'blackjack';
      else if (dealerBJ) o = natural ? 'push' : 'lose';
      else if (d > 21 || p > d) o = 'win';
      else if (p === d) o = 'push';
      else o = 'lose';
      h.outcome = o;
      const nat = naturalPayout(h.bet, this.rules);
      h.bonus = o === 'blackjack' ? nat.bonus : 0;
      h.payout = o === 'blackjack' ? nat.base + nat.bonus : o === 'win' ? h.bet * 2 : o === 'push' ? h.bet : 0;
      h.done = true;
    }
    this.phase = 'settled';
  }
}
