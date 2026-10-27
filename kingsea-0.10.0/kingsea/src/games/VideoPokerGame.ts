// Poker, deux tables avec croupier :
// • Table de poker « Valets ou mieux » (remplace l'ancienne borne) : 5 cartes, on garde (toucher une carte)
//   puis on tire une fois. Règles et table de gains inchangées (logic/poker.ts, autorité 'poker').
// • Direct Poker KS : 5 cartes, aucun échange, paiement immédiat (variante maison).
// Les cartes sont tirées par l'autorité (serveur en ligne) ; l'écran ne fait qu'animer : le croupier
// distribue, les cartes volent puis se retournent, les jetons sont posés, payés ou ramassés.
import { drawChipStack, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { BetControl, ChipFlights, Dealer, drawTable, feltText, type Rect } from './casinoKit';
import type { Card } from './logic/cards';
import { DIRECT_POKER, evaluate, HAND_NAMES, JACKS_OR_BETTER, payout, type PayTable } from './logic/poker';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawCard, drawLabel, drawPill } from './widgets';

type Phase = 'bet' | 'hold' | 'reveal' | 'done';
const DEAL = 0.22;

export class VideoPokerGame implements MiniGame {
  readonly id: string;
  get tableGame(): string { return this.id; }
  readonly title: string;
  readonly bg: [string, string];
  readonly currency = 'chips' as const;
  readonly rules: string;
  private table: PayTable;
  private dealer: Dealer;

  constructor(readonly mode: 'classic' | 'direct') {
    this.id = mode === 'classic' ? 'poker' : 'direct-poker';
    this.title = mode === 'classic' ? 'Table de poker' : 'Direct Poker';
    this.bg = mode === 'classic' ? ['#101511', '#040605'] : ['#0d1220', '#04060c'];
    this.table = mode === 'classic' ? JACKS_OR_BETTER : DIRECT_POKER;
    this.dealer = mode === 'classic'
      ? new Dealer('Croupière · Léa', { skin: '#f0c9a6', hair: '#6b3a1e', hairStyle: 'long', outfit: 'croupier', color: '#0e2a1c', accent: '#d4af5a', hat: 'aucun', glasses: false })
      : new Dealer('Croupier · Marc');
    const bet = '\nMise : jetons, « − » / « + », « ×2 », montant libre (✎). Les mises sont en jetons de casino (échangés contre des KSCoins à la caisse), monnaie du jeu sans valeur réelle.';
    this.rules = mode === 'classic'
      ? 'Poker « Valets ou mieux » (jeu de 52 cartes mélangé à chaque main), servi par la croupière.\n1. Mise puis « Distribuer » : tu reçois 5 cartes.\n2. Touche les cartes à GARDER.\n3. « Tirer » remplace les autres une seule fois.\nGains selon la table imprimée sur le tapis (paire de Valets ou mieux). Taux de retour ≈ 97,3 % avec une stratégie optimale.' + bet
      : 'Direct Poker KS (variante maison) : 5 cartes sont servies et payées immédiatement, sans échange.\nPaire de 10 ou mieux gagnante. Taux de retour exact : 96,7 % (calculé sur les 2 598 960 mains possibles).' + bet;
  }

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private phase: Phase = 'bet';
  private hand: Card[] = [];
  private held = [false, false, false, false, false];
  /** Instant de distribution de chaque carte (animation) ; les cartes gardées ne bougent pas au tirage. */
  private born: number[] = [];
  private settledPayout = 0;
  private stake = 0;
  private waiting = false;
  private message = 'Choisis ta mise puis « Distribuer ».';
  private winRank = -1;
  private dealBtn!: Button;
  private cardRects: Rect[] = [];
  private tableR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dealerPos = { x: 0, y: 0, k: 2 };
  private betSpot = { x: 0, y: 0 };
  private flights = new ChipFlights();
  private cardHandler: PointerHandler = { onDown: (p) => this.tapCard(p) };
  private t = 0;
  private laidOutBetting = true;

  get holdBalance(): boolean { return this.phase === 'reveal' || this.waiting || this.flights.busy; }
  private get betting(): boolean { return this.phase === 'bet' || this.phase === 'done'; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [5, 10, 25, 50, 100], min: 5, initial: 10 });
    this.dealBtn = makeButton({ id: 'deal', label: 'Distribuer', style: 'gold', fontSize: 17, onTap: () => this.main() });
    this.layer.buttons = [...this.betCtl.buttons, this.dealBtn];
    if (!host.s.chips.canAfford(this.betCtl.min)) this.message = `Il te faut au moins ${this.betCtl.min} jetons pour jouer.`;
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const used = this.betCtl.layout(a, ui, [[this.dealBtn, 210]]);
    if (!this.betting) {
      // Pendant la main : seul le bouton « Tirer » reste en bas, centré
      const bw = Math.min(260 * ui, a.w * 0.7);
      Object.assign(this.dealBtn, { x: a.x + (a.w - bw) / 2, w: bw });
    }
    const reserve = this.betting ? used : this.dealBtn.h + 8 * ui;
    const tableH = a.h - reserve - 6 * ui;
    const portrait = a.h > a.w;
    const k = portrait ? Math.max(1.5, Math.min(2.4, tableH / 170)) : Math.max(1.05, Math.min(1.8, tableH / 170));
    this.dealerPos = { x: a.x + a.w / 2, y: a.y + 38 * k, k };
    this.tableR = { x: a.x + a.w * 0.03, y: this.dealerPos.y - 4 * ui, w: a.w * 0.94, h: tableH - (this.dealerPos.y - a.y) + 4 * ui };
    // Cartes : rangée de 5 au centre du tapis ; table de gains au-dessus
    const T = this.tableR;
    if (!portrait && T.w > T.h * 1.7) {
      // Paysage : table des gains en colonne à gauche du tapis, grandes cartes à droite
      const pw = Math.min(T.w * 0.3, 300 * ui), ph = Math.min(T.h * 0.62, 9 * 22 * ui);
      this.payBox = { x: T.x + T.w * 0.08, y: T.y + (T.h - ph) / 2 - 6 * ui, w: pw, h: ph };
      const rx = this.payBox.x + pw + 18 * ui, rw = T.x + T.w * 0.93 - rx;
      const cw = Math.min(rw / 5.6, (T.h * 0.5) / 1.4, 96 * ui), gap = cw * 0.16, total = cw * 5 + gap * 4;
      const cy = T.y + T.h * 0.16;
      this.cardsCx = rx + rw / 2;
      this.cardRects = [0, 1, 2, 3, 4].map((i) => ({ x: this.cardsCx - total / 2 + i * (cw + gap), y: cy, w: cw, h: cw * 1.4 }));
      this.betSpot = { x: this.cardsCx, y: Math.min(T.y + T.h - 26 * ui, cy + cw * 1.4 + 62 * ui) };
    } else {
      const payH = Math.min(T.h * 0.3, 110 * ui);
      // Table des gains : plaque centrée, en retrait des bords arrondis du tapis
      const pw = Math.min(T.w * (portrait ? 0.8 : 0.76), 640 * ui);
      this.payBox = { x: a.x + (a.w - pw) / 2, y: T.y + (portrait ? 30 : 20) * ui, w: pw, h: payH };
      const cw = Math.min((T.w * 0.86) / 5.6, (T.h - payH - 90 * ui) / 1.4, 96 * ui);
      const gap = cw * 0.16, total = cw * 5 + gap * 4;
      // Cartes centrées entre la table de gains et la case de mise (en bas du tapis)
      const payBottom = this.payBox.y + payH + 22 * ui;
      const betY = T.y + T.h - 30 * ui;
      const free = betY - 70 * ui - payBottom - cw * 1.4;
      const cy = payBottom + Math.max(0, free * 0.4);
      this.cardsCx = a.x + a.w / 2;
      this.cardRects = [0, 1, 2, 3, 4].map((i) => ({ x: a.x + (a.w - total) / 2 + i * (cw + gap), y: cy, w: cw, h: cw * 1.4 }));
      this.betSpot = { x: a.x + a.w / 2, y: Math.min(betY, cy + cw * 1.4 + 74 * ui) };
    }
    this.laidOutBetting = this.betting;
    // Résultat affiché sous les cartes (elles restent visibles)
    const r0 = this.cardRects[0];
    if (r0) { this.host.result.anchorX = (this.cardsCx - a.x) / a.w; this.host.result.anchorY = Math.min(0.9, (r0.y + r0.h + 26 * ui - a.y) / a.h); }
  }

  handlers(): PointerHandler[] { return [this.cardHandler, this.layer]; }
  canQuit() { return this.phase === 'hold' || this.phase === 'reveal' || this.waiting ? { ok: false as const, reason: 'Termine la main avant de quitter' } : { ok: true as const }; }

  private tapCard(p: PointerInfo): boolean {
    if (this.phase !== 'hold' || this.waiting) return false;
    const i = this.cardRects.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 14 && p.y <= r.y + r.h + 30);
    if (i < 0) return false;
    this.held[i] = !this.held[i];
    this.host.s.audio.card();
    return true;
  }

  /** Raccourci clavier / manette : basculer la carte i (0–4). */
  toggle(i: number): void { if (this.phase === 'hold' && i >= 0 && i < 5) { this.held[i] = !this.held[i]; this.host.s.audio.card(); } }

  private async main(): Promise<void> {
    const s = this.host.s;
    if (this.waiting || this.flights.busy && this.betting) return;
    if (this.betting) {
      const bet = this.betCtl.amount;
      if (!s.chips.canAfford(bet)) { this.host.toasts.show('Pas assez de jetons pour cette mise', 'error'); s.audio.error(); return; }
      this.waiting = true;
      const r = this.mode === 'classic' ? await s.ask('casino', 'poker', 'deal', { bet }) : await s.ask('casino', 'direct-poker', 'play', { bet });
      this.waiting = false;
      if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
      this.betCtl.remember(bet);
      this.stake = bet;
      this.flights.add({ x: this.betSpot.x, y: this.host.area.y + this.host.area.h }, this.betSpot, bet, 12 * this.host.vp.ui, 0.35);
      s.audio.chip();
      this.hand = r.view.hand as Card[]; this.held = [false, false, false, false, false];
      this.settledPayout = r.payout;
      this.winRank = -1; this.winCards = [];
      this.drawn = false;
      this.born = this.hand.map((_, i) => this.t + 0.25 + i * DEAL);
      this.dealer.play('deal', DEAL * 6);
      this.phase = 'reveal';
      this.message = '';
    } else if (this.phase === 'hold') {
      this.waiting = true;
      const r = await s.ask('casino', 'poker', 'draw', { held: [...this.held] });
      this.waiting = false;
      if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
      this.drawn = true;
      const next = r.view.hand as Card[];
      let n = 0;
      // Les cartes écartées partent, les nouvelles arrivent une à une ; les gardées restent en place
      this.born = next.map((_, i) => (this.held[i] ? this.born[i] : this.t + 0.15 + n++ * DEAL));
      this.hand = next;
      this.settledPayout = r.payout;
      if (n > 0) this.dealer.play('deal', DEAL * (n + 1));
      this.phase = 'reveal';
      this.message = '';
    }
  }

  private settle(): void {
    const e = evaluate(this.hand), mult = payout(this.table, e);
    const win = this.settledPayout; // versé par l'autorité ; le calcul local ne sert qu'à l'affichage
    const net = win - this.stake;
    this.winRank = mult > 0 ? e.rank : -1;
    this.message = mult > 0 ? `${e.name} : +${win} jetons` : `${e.name} : pas de gain`;
    const ui = this.host.vp.ui, d = this.dealer.hand(this.dealerPos.x, this.dealerPos.y, this.dealerPos.k);
    const toPlayer = { x: this.betSpot.x, y: this.host.area.y + this.host.area.h };
    if (win > 0) { this.flights.add(d, this.betSpot, win, 12 * ui, 0.45); this.flights.add(this.betSpot, toPlayer, win, 12 * ui, 0.4, 0.55); }
    else this.flights.add(this.betSpot, d, this.stake, 12 * ui, 0.45);
    this.dealer.play(net > 0 ? 'congrats' : net === 0 && win > 0 ? 'pay' : 'collect', 1.4);
    this.host.celebrate(net, this.stake, mult > 0 ? e.name : '');
    // Cartes qui composent la combinaison gagnante (suites/couleurs : les cinq ; sinon les rangs répétés)
    const counts = new Map<number, number>(); for (const c of this.hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    this.winCards = mult > 0 ? this.hand.map((c) => [4, 5, 6, 8, 9].includes(e.rank) || (counts.get(c.rank) ?? 0) >= 2) : [];
    this.winAt = this.t;
    this.phase = 'done';
  }

  update(dt: number): void {
    this.t += dt;
    const s = this.host.s;
    this.dealer.update(dt);
    this.flights.update(dt);
    if (this.phase === 'reveal') {
      // Son à l'arrivée de chaque carte
      for (const b of this.born) if (b > this.t - dt && b <= this.t) s.audio.card();
      const last = Math.max(...this.born);
      if (this.t > last + DEAL + 0.3) {
        if (this.mode === 'classic' && !this.drawn) { this.phase = 'hold'; this.message = 'Touche les cartes à garder, puis « Tirer ».'; }
        else this.settle();
      }
    }
    const bet = this.betting;
    this.betCtl.locked = !bet || this.waiting;
    this.betCtl.sync();
    this.betCtl.setShown(bet);
    this.dealBtn.label = this.phase === 'hold' ? 'Tirer' : this.phase === 'reveal' ? '…' : this.phase === 'done' ? `Rejouer · ${this.betCtl.amount}` : `Distribuer · ${this.betCtl.amount}`;
    this.dealBtn.enabled = !this.waiting && (this.phase === 'hold' || (bet && !this.flights.busy && s.chips.canAfford(this.betCtl.amount)));
    if (bet !== this.laidOutBetting) this.layout();
  }

  /** Vrai une fois le tirage fait (main classique) : la révélation suivante règle la main. */
  private drawn = false;
  private payBox = { x: 0, y: 0, w: 0, h: 0 };
  private winCards: boolean[] = [];
  private winAt = 0;
  private cardsCx = 0;

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, D = this.dealerPos;
    this.dealer.render(ctx, D.x, D.y, D.k, ui);
    drawTable(ctx, this.tableR, ui, this.mode === 'classic' ? 'green' : 'blue');
    // Table des gains imprimée sur le tapis
    const rows = [9, 8, 7, 6, 5, 4, 3, 2, 1].filter((r) => this.table.pays[r]);
    const PB = this.payBox, top = PB.y, payH = PB.h;
    const cols = PB.h > PB.w * 0.6 ? 1 : PB.w > 520 * ui ? 3 : 2, perCol = Math.ceil(rows.length / cols), lh = (payH - 8 * ui) / perCol;
    const colW = (PB.w - 8 * ui) / cols, x0 = PB.x + 4 * ui;
    roundRect(ctx, PB.x, PB.y - 4 * ui, PB.w, payH + 4 * ui, 10 * ui); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
    ctx.strokeStyle = 'rgba(239,220,174,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    rows.forEach((r, i) => {
      const col = Math.floor(i / perCol), row = i % perCol;
      const x = x0 + col * colW + 8 * ui, y = top + row * lh + lh / 2;
      const name = r === 1 ? `Paire de ${this.table.minPair === 11 ? 'Valets' : '10'}+` : HAND_NAMES[r];
      const hot = r === this.winRank && this.phase === 'done';
      if (hot) { roundRect(ctx, x - 6 * ui, y - lh / 2 + 1, colW - 10 * ui, lh - 2, 5 * ui); ctx.fillStyle = 'rgba(212,175,90,0.35)'; ctx.fill(); }
      const fs = Math.min(12 * ui, lh * 0.62, colW / 15);
      drawLabel(ctx, name, x, y, fs, hot ? LUXE.champagne : 'rgba(246,240,227,0.78)', 'left', 700);
      drawLabel(ctx, `×${this.table.pays[r]}`, x + colW - 16 * ui, y, fs, PAL.gold, 'right', 800);
    });
    feltText(ctx, this.mode === 'classic' ? 'KS Casino · Valets ou mieux' : 'KS Casino · Direct Poker', PB.x + PB.w / 2, top + payH + 10 * ui, 9 * ui, 0.45);

    // Cartes : chaque carte part de la main du croupier, arrive en arc puis se retourne
    const from = this.dealer.hand(D.x, D.y, D.k);
    this.cardRects.forEach((r, i) => {
      const c = this.hand[i];
      if (!c) {
        roundRect(ctx, r.x, r.y, r.w, r.h, r.w * 0.1); ctx.strokeStyle = 'rgba(239,220,174,0.3)'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      const born = this.born[i] ?? 0, k = Math.min(1, Math.max(0, (this.t - born) / DEAL));
      if (k <= 0) {
        roundRect(ctx, r.x, r.y, r.w, r.h, r.w * 0.1); ctx.strokeStyle = 'rgba(239,220,174,0.3)'; ctx.lineWidth = 1.4; ctx.stroke();
        return;
      }
      const e = 1 - (1 - k) * (1 - k);
      const lift = this.held[i] && this.phase !== 'done' ? 10 * ui : 0;
      const x = from.x + (r.x - from.x) * e, y = from.y + (r.y - lift - from.y) * e - Math.sin(k * Math.PI) * 16 * ui;
      const flip = Math.min(1, Math.max(0, (this.t - born - DEAL * 0.8) / 0.2));
      drawCard(ctx, c, x, y, r.w, r.h, flip);
      // Main réglée : cartes de la combinaison soulignées d'or, les autres légèrement estompées
      if (this.phase === 'done' && this.winCards.length) {
        if (this.winCards[i]) {
          const pulse = 0.6 + 0.4 * Math.sin((this.t - this.winAt) * 6);
          ctx.save(); ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = (this.host.s.lowFx ? 0 : 12) * ui * pulse;
          ctx.strokeStyle = `rgba(255,214,120,${pulse})`; ctx.lineWidth = 2.5 * ui; roundRect(ctx, x - 2, y - 2, r.w + 4, r.h + 4, r.w * 0.1); ctx.stroke(); ctx.restore();
        } else { ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, x, y, r.w, r.h, r.w * 0.09); ctx.fill(); }
      }
      if (this.held[i] && this.phase !== 'done') drawPill(ctx, 'GARDÉE', r.x + r.w / 2, r.y + r.h + 12 * ui, 10 * ui, PAL.gold, '#1a1208');
      else if (this.phase === 'hold') drawLabel(ctx, 'garder ?', r.x + r.w / 2, r.y + r.h + 12 * ui, 10 * ui, 'rgba(246,240,227,0.6)', 'center', 600);
    });
    // Case de mise
    const B = this.betSpot;
    ctx.save(); ctx.strokeStyle = 'rgba(239,220,174,0.45)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(B.x, B.y, 24 * ui, 12 * ui, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    const amt = this.phase === 'hold' || this.phase === 'reveal' ? this.stake : this.betting && !this.flights.busy ? this.betCtl.amount : 0;
    if (amt > 0) drawChipStack(ctx, B.x, B.y + 4 * ui, 15 * ui, amt, 8);
    this.flights.render(ctx);
    const r0 = this.cardRects[0];
    if (this.message && r0 && this.phase !== 'hold' && !this.host.result.active) drawPill(ctx, this.message, this.cardsCx, Math.min(r0.y + r0.h + 30 * ui, B.y - 26 * ui), 13 * ui, 'rgba(14,11,16,0.9)', PAL.text);
    if (this.betting) this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
