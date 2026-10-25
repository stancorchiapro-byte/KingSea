// Vue tactile du blackjack (table classique et table Hi-Lo). La logique est dans logic/blackjack.ts et les
// cartes sont distribuées par l'autorité (serveur en ligne) : le téléphone ne connaît jamais la carte cachée
// du croupier, la carte d'un double « face cachée » ni l'ordre du sabot.
// Mise à jour Stan : choix de la table (Débutant, Standard, Premium, VIP), rythme de distribution plus posé
// (une carte à la fois, le croupier révèle puis tire carte par carte), double face visible ou cachée, bonus
// de blackjack naturel, pourboires au croupier et récapitulatif détaillé de chaque manche.
import { drawChipStack, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import { promptNumber } from '../ui/TextPrompt';
import { ButtonLayer, font, makeButton, type Button } from '../ui/UIKit';
import { BetControl, ChipFlights, Dealer, drawTable, feltText, presetChips, type Rect } from './casinoKit';
import { BJ_TABLES, Blackjack, NATURAL_BONUS, type BjTable, type Hand, type Phase } from './logic/blackjack';
import { handValue, type Card } from './logic/cards';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawCard, drawLabel, drawPill } from './widgets';

const HILO_RULES =
  '\n\nComptage Hi-Lo (aide affichée à l’écran) :\n• Cartes 2 à 6 : +1 · 7 à 9 : 0 · 10, figures et As : −1.\n' +
  '• Le « compte courant » additionne toutes les cartes vues depuis le dernier mélange (une carte de double face cachée compte une fois retournée).\n' +
  '• Le « compte réel » = compte courant ÷ nombre de jeux restants dans le sabot.\n' +
  '• Plus il est élevé, plus il reste de 10 et d’As : situation favorable au joueur. Le sabot est remélangé au quart restant.';

const BASE_RULES =
    'But : approcher 21 sans le dépasser et battre le croupier.\n' +
    '• Figures = 10, As = 1 ou 11.\n' +
    `• Blackjack naturel (As + 10 ou figure, en deux cartes) : payé 3 pour 2, PLUS un bonus de ${NATURAL_BONUS * 100} % de la mise initiale. ` +
    'Un 21 en trois cartes ou plus, ou après une séparation, n’est pas un blackjack (payé 1 pour 1).\n' +
    '• Le croupier vérifie son blackjack s’il montre un As ou un 10. Il tire jusqu’à 17 et reste sur 17.\n' +
    '• Doubler (sur deux cartes) : mise doublée, une seule carte, que tu choisis de recevoir face visible ou face cachée (retournée à la fin de la manche).\n' +
    '• Séparer : deux cartes de même rang deviennent deux mains (une fois ; As séparés : une carte chacun).\n' +
    '• Égalité : mise rendue. Gain normal : 1 pour 1.\n' +
    '• Tables : ' + BJ_TABLES.map((t) => `${t.name} ${t.min}–${t.max}${t.level > 1 ? ` (niveau ${t.level})` : ''}`).join(' · ') + ' (mise initiale).\n' +
    '• Pourboire : tu peux offrir des jetons au croupier (bouton « Pourboire ») ; ils ne sont pas rendus.\n' +
    'Sabot de 6 jeux. Les mises sont en jetons de casino (échangés contre des KSCoins à la caisse), monnaie du jeu sans valeur réelle.';

/** Durée du vol d'une carte, intervalle entre deux cartes, pause avant chaque carte du croupier. */
const DEAL_TIME = 0.42;
const STEP = 0.58;
const DEALER_STEP = 0.85;
const OUTCOME_LABEL = { blackjack: 'Blackjack', win: 'Gagné', push: 'Égalité', lose: 'Perdu' } as const;
const TIPS = [1, 5, 10, 25, 50];

/** Dernière table choisie (mémorisée le temps de la session). */
let lastTable = 'standard';

interface CardTime { at: number; flipAt: number; key: string; sounded: boolean }
interface Recap { before: number; initial: number; extra: number; payout: number; bonus: number; stake: number; hands: Array<{ outcome: string; net: number }>; natural: boolean; dealerPeek: boolean }

export class BlackjackGame implements MiniGame {
  readonly id: string;
  readonly title: string;
  readonly bg: [string, string];
  readonly currency = 'chips' as const;
  readonly rules: string;
  /** Comptage Hi-Lo (variante « Blackjack Hi-Lo »), calculé par l'autorité sur les cartes visibles */
  private running = 0;
  private remaining = 312;
  /** Actions permises par l'autorité */
  private can = { hit: false, stand: false, double: false, split: false };
  private waiting = false;
  private dealer: Dealer;

  constructor(readonly hilo = false) {
    this.id = hilo ? 'blackjack-hilo' : 'blackjack';
    this.title = hilo ? 'Blackjack Hi-Lo' : 'Blackjack';
    this.bg = hilo ? ['#1d1418', '#070506'] : ['#14110f', '#050404'];
    this.rules = BASE_RULES + (hilo ? HILO_RULES : '');
    this.dealer = new Dealer(hilo ? 'Croupière · Inès' : 'Croupier · Julien', hilo ? { skin: '#c98d62', hair: '#1c1412', hairStyle: 'chignon', outfit: 'croupier', color: '#3a0c17', accent: '#d4af5a', hat: 'aucun', glasses: false } : undefined);
  }

  private host!: MiniGameHost;
  private g = new Blackjack(Math.random);
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private tableDef: BjTable = BJ_TABLES[1];
  private message = '';
  private t = 0;
  /** Calendrier des cartes : départ du vol et moment où la carte se retourne (Infinity : reste face cachée). */
  private times = new Map<string, CardTime>();
  private cardsSeen = new Map<string, string>();
  private queue = 0;
  /** Moment où le règlement est montré (après la révélation et les cartes du croupier). */
  private settleAt = 0;
  private settlePending: { payout: number } | null = null;
  private btn: Record<string, Button> = {};
  private cardW = 60;
  private table: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private felt: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dealerPos = { x: 0, y: 0, k: 2 };
  private flights = new ChipFlights();
  private laidOutBetting = true;
  /** Panneaux : choix de la table, pourboire, choix du double. */
  private panel: 'tables' | 'tip' | 'double' | null = 'tables';
  private panelBtns: Button[] = [];
  private panelRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private recap: Recap | null = null;
  private roundTips = 0;
  private before = 0;
  private initialBet = 0;
  private thanksT = 0;

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    const mk = (id: string, label: string, style: Button['style'], onTap: () => void, fontSize = 16) => (this.btn[id] = makeButton({ id, label, style, fontSize, onTap }));
    mk('deal', 'Distribuer', 'gold', () => void this.deal());
    mk('hit', 'Tirer', 'primary', () => void this.act('hit'));
    mk('stand', 'Rester', 'secondary', () => void this.act('stand'));
    mk('double', 'Doubler', 'secondary', () => this.openPanel('double'));
    mk('split', 'Séparer', 'secondary', () => void this.act('split'));
    mk('dblUp', 'Face visible', 'gold', () => void this.act('double', false), 15);
    mk('dblDown', 'Face cachée', 'gold', () => void this.act('double', true), 15);
    mk('dblCancel', 'Annuler', 'ghost', () => this.closePanel(), 15);
    mk('tableBtn', '', 'ghost', () => this.openPanel('tables'), 13);
    mk('tipBtn', 'Pourboire', 'ghost', () => this.openPanel('tip'), 13);
    this.selectTable(BJ_TABLES.find((t) => t.id === lastTable) ?? BJ_TABLES[1], false);
    this.panel = 'tables';
    this.buildPanel();
  }

  // ---------------------------------------------------------------- tables
  private tableLocked(t: BjTable): boolean {
    const p = this.host.s.progress;
    return p.level < t.level && !(t.id === 'vip' && p.unlocks.includes('feature:vip-lounge'));
  }

  private selectTable(t: BjTable, sound = true): void {
    this.tableDef = t; lastTable = t.id;
    const prev = this.betCtl?.amount;
    this.betCtl = new BetControl(this.host, { presets: presetChips(t.min).filter((v) => v <= t.max), min: t.min, max: t.max, initial: Math.max(t.min, Math.min(t.max, prev ?? t.min * 2)) });
    this.btn.tableBtn.label = `Table ${t.name} · ${t.min}–${t.max}`;
    this.rebuildLayer();
    if (this.host.area.w > 0) this.layout();
    if (sound) this.host.s.audio.chip();
    if (!this.host.s.chips.canAfford(t.min)) this.message = `Il te faut au moins ${t.min} jetons à cette table : passe à la caisse du casino.`;
    else this.message = 'Choisis ta mise puis touche « Distribuer ».';
  }

  private rebuildLayer(): void {
    this.layer.buttons = [...this.betCtl.buttons, ...Object.values(this.btn), ...this.panelBtns];
  }

  // ---------------------------------------------------------------- panneaux
  private openPanel(p: 'tables' | 'tip' | 'double'): void {
    if (this.waiting) return;
    if (p === 'tables' && !this.betting) return;
    if (p === 'double' && !(this.can.double && this.host.s.chips.canAfford(this.g.current?.bet ?? Infinity))) return;
    this.panel = p; this.buildPanel(); this.layout();
  }
  private closePanel(): void { this.panel = null; this.panelBtns = []; this.rebuildLayer(); this.layout(); }

  private buildPanel(): void {
    const s = this.host.s;
    this.panelBtns = [];
    if (this.panel === 'tables') {
      for (const t of BJ_TABLES) {
        const locked = this.tableLocked(t);
        this.panelBtns.push(makeButton({
          id: `table-${t.id}`, label: `${t.name} · ${t.min} à ${t.max.toLocaleString('fr-FR')} jetons`,
          sub: locked ? `Niveau ${t.level} requis` : `${t.risk}${s.chips.balance < t.min ? ' · solde insuffisant' : ''}`,
          style: 'secondary', active: t.id === this.tableDef.id, enabled: !locked, fontSize: 15,
          onTap: () => { this.selectTable(t); this.closePanel(); },
        }));
      }
      this.panelBtns.push(makeButton({ id: 'table-close', label: `Garder la table ${this.tableDef.name}`, style: 'ghost', fontSize: 14, enabled: !this.tableLocked(this.tableDef), onTap: () => this.closePanel() }));
    } else if (this.panel === 'tip') {
      for (const v of TIPS) this.panelBtns.push(makeButton({ id: `tip-${v}`, label: `${v}`, style: 'gold', fontSize: 16, enabled: s.chips.balance >= v, onTap: () => void this.tip(v) }));
      this.panelBtns.push(makeButton({ id: 'tip-custom', label: '✎ Autre', style: 'secondary', fontSize: 14, enabled: s.chips.balance >= 1,
        onTap: () => promptNumber('Pourboire (jetons)', 10, 1, Math.max(1, Math.min(1000, s.chips.balance)), (v) => { if (v !== null) void this.tip(v); }) }));
      this.panelBtns.push(makeButton({ id: 'tip-cancel', label: 'Annuler', style: 'ghost', fontSize: 14, onTap: () => this.closePanel() }));
    }
    this.rebuildLayer();
  }

  private async tip(v: number): Promise<void> {
    const s = this.host.s;
    if (this.waiting) return;
    if (!s.chips.canAfford(v)) { this.host.toasts.show('Pas assez de jetons pour ce pourboire', 'error'); s.audio.error(); return; }
    this.waiting = true;
    const r = await s.ask('casino', this.id, 'tip', { amount: v });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    this.roundTips += v;
    const ui = this.host.vp.ui, d = this.dealer.hand(this.dealerPos.x, this.dealerPos.y, this.dealerPos.k);
    this.flights.add({ x: this.host.area.x + this.host.area.w / 2, y: this.host.area.y + this.host.area.h }, d, v, 12 * ui, 0.6);
    this.dealer.play('congrats', 1.6);
    this.thanksT = 2.4;
    s.audio.chip(); setTimeout(() => s.audio.ding(), 500);
    this.host.toasts.show(`Pourboire de ${v} jeton${v > 1 ? 's' : ''} : merci !`, 'success', 2);
    this.closePanel();
  }

  // ---------------------------------------------------------------- mise en page
  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    // Barre de mise (jetons + réglages + Distribuer) ; pendant la main, les actions prennent la même place
    const used = this.betCtl.layout(a, ui, [[this.btn.deal, 210]]);
    const bh = this.btn.deal.h, bw = Math.min(140 * ui, (a.w - 30 * ui) / 4);
    const row = (ids: string[], w = bw) => {
      const total = ids.length * w + (ids.length - 1) * 10 * ui;
      ids.forEach((id, i) => Object.assign(this.btn[id], { x: a.x + (a.w - total) / 2 + i * (w + 10 * ui), y: a.y + a.h - bh, w, h: bh }));
    };
    row(['hit', 'stand', 'double', 'split']);
    row(['dblUp', 'dblDown', 'dblCancel'], Math.min(170 * ui, (a.w - 30 * ui) / 3));
    // Table et pourboire : coins supérieurs
    const th = Math.max(36, 34 * ui), portrait = a.h > a.w;
    const tw = Math.min(portrait ? a.w * 0.4 : 230 * ui, 260 * ui);
    Object.assign(this.btn.tableBtn, { x: a.x, y: a.y, w: tw, h: th });
    Object.assign(this.btn.tipBtn, { x: a.x + a.w - Math.min(130 * ui, a.w * 0.3), y: a.y, w: Math.min(130 * ui, a.w * 0.3), h: th });
    // Pendant la main, seule la ligne d'actions est réservée en bas : la table gagne la place des réglages
    const reserve = this.betting ? used : bh + 8 * ui;
    const tableH = a.h - reserve - 6 * ui;
    const k = portrait ? Math.max(1.6, Math.min(2.6, tableH / 160)) : Math.max(1.1, Math.min(1.9, tableH / 160));
    this.dealerPos = { x: a.x + a.w / 2, y: a.y + Math.max(38 * k, th + 30 * ui), k };
    this.table = { x: a.x + a.w * 0.03, y: this.dealerPos.y - 4 * ui, w: a.w * 0.94, h: tableH - (this.dealerPos.y - a.y) + 4 * ui };
    this.cardW = Math.min((this.table.h - 60 * ui) / 2 / 1.4 * 0.92, (portrait ? 84 : 74) * ui, a.w / (portrait ? 5.2 : 8));
    this.laidOutBetting = this.betting;
    this.layoutPanel();
  }

  private layoutPanel(): void {
    const a = this.host.area, ui = this.host.vp.ui, gap = 10 * ui;
    if (this.panel === 'tables') {
      // Une colonne si la hauteur le permet, sinon deux (paysage) ; « Garder la table » sur toute la largeur
      const bh = Math.max(50, 54 * ui), n = this.panelBtns.length;
      const cols = 54 * ui + n * (bh + gap) > a.h && a.w > 560 * ui ? 2 : 1;
      const w = Math.min(a.w - 20 * ui, cols === 2 ? 760 * ui : 520 * ui), cw = (w - 28 * ui - gap * (cols - 1)) / cols;
      const rows = Math.ceil((n - 1) / cols) + 1;
      const h = 56 * ui + rows * (bh + gap);
      this.panelRect = { x: a.x + (a.w - w) / 2, y: a.y + Math.max(0, (a.h - h) / 2), w, h };
      this.panelBtns.forEach((b, i) => {
        const last = i === n - 1, r = last ? rows - 1 : Math.floor(i / cols), c = last ? 0 : i % cols;
        Object.assign(b, { x: this.panelRect.x + 14 * ui + c * (cw + gap), y: this.panelRect.y + 48 * ui + r * (bh + gap), w: last ? w - 28 * ui : cw, h: bh });
      });
    } else if (this.panel === 'tip') {
      const n = this.panelBtns.length, w = Math.min(a.w - 20 * ui, 560 * ui), bh = Math.max(46, 48 * ui);
      const cols = a.w < 520 * ui ? 4 : n, rows = Math.ceil(n / cols), bw = (w - 28 * ui - gap * (cols - 1)) / cols;
      const h = 60 * ui + rows * (bh + gap);
      this.panelRect = { x: a.x + (a.w - w) / 2, y: a.y + Math.max(0, (a.h - h) / 2), w, h };
      this.panelBtns.forEach((b, i) => Object.assign(b, { x: this.panelRect.x + 14 * ui + (i % cols) * (bw + gap), y: this.panelRect.y + 52 * ui + Math.floor(i / cols) * (bh + gap), w: bw, h: bh }));
    }
  }

  handlers(): PointerHandler[] { return [this.layer]; }

  canQuit() {
    return this.g.phase === 'player' || this.waiting || this.settlePending ? { ok: false as const, reason: 'Termine la main en cours avant de quitter' } : { ok: true as const };
  }

  private get betting(): boolean { return this.g.phase === 'betting' || this.g.phase === 'settled'; }

  /** Reconstruit l'état affiché à partir de la vue publique envoyée par l'autorité, et planifie l'arrivée des cartes. */
  private applyView(v: Record<string, unknown>, fresh: boolean): void {
    const prevPhase = this.g.phase;
    this.g = Blackjack.restore({ phase: v.phase as Phase, hands: v.hands as Hand[], dealer: v.dealer as Card[], active: v.active as number, shoe: [] }, Math.random);
    this.can = (v.can as typeof this.can) ?? { hit: false, stand: false, double: false, split: false };
    if (typeof v.running === 'number') this.running = v.running;
    if (typeof v.remaining === 'number') this.remaining = v.remaining;
    this.schedule(fresh, prevPhase);
  }

  /**
   * Rythme de la manche : une carte à la fois (joueur, croupier, joueur, croupier face cachée), puis à la fin
   * les cartes cachées se retournent (double face cachée, puis carte du croupier) et le croupier tire posément.
   */
  private schedule(fresh: boolean, _prev: Phase): void {
    const g = this.g;
    if (fresh) { this.times.clear(); this.cardsSeen.clear(); this.queue = this.t + 0.15; }
    let q = Math.max(this.t, this.queue);
    const sig = (c: Card) => `${c.rank}${c.suit}`;
    const place = (key: string, c: Card, faceDown = false) => {
      const old = this.cardsSeen.get(key);
      if (old !== undefined && (old === sig(c) || old.startsWith('0'))) return false; // déjà là (ou carte cachée qui sera retournée)
      this.times.set(key, { at: q, flipAt: c.rank === 0 || faceDown ? Infinity : q + DEAL_TIME * 0.8, key, sounded: false });
      this.cardsSeen.set(key, sig(c));
      q += STEP;
      return true;
    };
    if (fresh) {
      // Ordre réel : joueur, croupier, joueur, croupier
      const h = g.hands[0];
      // La deuxième carte du croupier arrive toujours face cachée (retournée au règlement)
      if (h) { place('h0:0', h.cards[0]); if (g.dealer[0]) place('d:0', g.dealer[0]); if (h.cards[1]) place('h0:1', h.cards[1]); if (g.dealer[1]) place('d:1', g.dealer[1], true); }
    }
    // Carte d'un double face cachée : posée retournée, même si la réponse contient déjà le règlement
    g.hands.forEach((h, j) => h.cards.forEach((c, i) => place(`h${j}:${i}`, c, !!h.hiddenDouble && i === h.cards.length - 1)));
    if (g.phase === 'settled') {
      q += 0.35;
      // Cartes face cachée : double du joueur d'abord, puis la carte du croupier
      const reveal = (key: string, c: Card | undefined) => {
        const tm = this.times.get(key);
        if (!c || !tm || tm.flipAt !== Infinity || c.rank === 0) return;
        tm.flipAt = q; this.cardsSeen.set(key, sig(c)); q += 0.7;
      };
      g.hands.forEach((h, j) => reveal(`h${j}:${h.cards.length - 1}`, h.cards[h.cards.length - 1]));
      reveal('d:1', g.dealer[1]);
      g.dealer.forEach((c, i) => {
        if (i < 2) return;
        if (this.cardsSeen.has(`d:${i}`)) return;
        this.times.set(`d:${i}`, { at: q, flipAt: q + DEAL_TIME * 0.8, key: `d:${i}`, sounded: false });
        this.cardsSeen.set(`d:${i}`, sig(c));
        q += DEALER_STEP;
      });
      this.settleAt = q + 0.35;
    } else {
      g.dealer.forEach((c, i) => place(`d:${i}`, c));
    }
    this.queue = q;
  }

  private spot(i: number, n: number): { x: number; y: number } {
    const F = this.felt, ui = this.host.vp.ui;
    return { x: F.x + F.w / 2 + (i - (n - 1) / 2) * Math.min(F.w * 0.3, this.cardW * 3.2), y: F.y + F.h - 20 * ui };
  }

  private async deal(): Promise<void> {
    const s = this.host.s, bet = this.betCtl.amount, t = this.tableDef;
    if (!this.betting || this.waiting || this.settlePending) return;
    if (this.tableLocked(t)) { this.host.toasts.show(`Table ${t.name} : niveau ${t.level} requis`, 'error'); return; }
    if (!s.chips.canAfford(bet)) { this.host.toasts.show('Pas assez de jetons pour cette mise : passe à la caisse du casino', 'error'); s.audio.error(); return; }
    this.waiting = true;
    const before = s.chips.balance;
    const r = await s.ask('casino', this.id, 'deal', { bet, table: t.id });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    this.before = before; this.initialBet = bet; this.roundTips = 0; this.recap = null;
    this.betCtl.remember(bet);
    // Les jetons partent du joueur vers la case de mise
    const sp = this.spot(0, 1);
    this.flights.add({ x: sp.x, y: this.host.area.y + this.host.area.h }, sp, bet, 12 * this.host.vp.ui, 0.4);
    s.audio.chip();
    this.applyView(r.view, true);
    this.dealer.play('deal', STEP * 4);
    this.message = '';
    this.afterAction(r.done, r.payout);
  }

  private async act(kind: 'hit' | 'stand' | 'double' | 'split', faceDown = false): Promise<void> {
    const s = this.host.s, g = this.g;
    if (g.phase !== 'player' || this.waiting || !this.can[kind] || this.t < this.queue - STEP * 0.5) return;
    if ((kind === 'double' || kind === 'split') && !s.chips.canAfford(g.current!.bet)) { this.host.toasts.show('Pas assez de jetons', 'error'); s.audio.error(); return; }
    if (this.panel === 'double') this.closePanel();
    this.waiting = true;
    const r = await s.ask('casino', this.id, 'act', kind === 'double' ? { move: kind, faceDown } : { move: kind });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    if (kind === 'double' || kind === 'split') {
      const sp = this.spot(g.active, kind === 'split' ? 2 : g.hands.length);
      this.flights.add({ x: sp.x, y: this.host.area.y + this.host.area.h }, sp, g.current!.bet, 12 * this.host.vp.ui, 0.4);
      s.audio.chip();
      if (kind === 'double') this.host.toasts.show(faceDown ? 'Double : carte face cachée, retournée à la fin' : 'Double : une seule carte', 'info', 1.8);
    }
    this.applyView(r.view, false);
    this.dealer.play('deal', STEP * 2);
    this.afterAction(r.done, r.payout);
  }

  private afterAction(done: boolean, payout: number): void {
    if (!done) return;
    this.settlePending = { payout };
  }

  /** Règlement montré une fois les cartes retournées : jetons payés ou ramassés, récapitulatif. */
  private showSettlement(payout: number): void {
    const g = this.g, s = this.host.s;
    const stake = g.totalStake, net = payout - stake;
    const bonus = g.hands.reduce((a, h) => a + (h.bonus ?? 0), 0);
    const natural = g.hands.some((h) => h.outcome === 'blackjack');
    this.recap = {
      before: this.before, initial: this.initialBet, extra: stake - this.initialBet, payout, bonus, stake, natural,
      dealerPeek: g.dealer.length === 2 && handValue(g.dealer).total === 21,
      hands: g.hands.map((h) => ({ outcome: h.outcome ?? 'lose', net: (h.payout ?? 0) - h.bet })),
    };
    const ui = this.host.vp.ui, d = this.dealer.hand(this.dealerPos.x, this.dealerPos.y, this.dealerPos.k);
    g.hands.forEach((h, i) => {
      const sp = this.spot(i, g.hands.length);
      if (h.outcome === 'lose') this.flights.add(sp, d, h.bet, 12 * ui, 0.55);
      else if (h.outcome && h.outcome !== 'push') this.flights.add(d, sp, (h.payout ?? 0) - h.bet, 12 * ui, 0.55, 0.1);
    });
    this.dealer.play(natural ? 'congrats' : net > 0 ? 'pay' : net < 0 ? 'collect' : 'pay', 1.6);
    if (natural) { s.audio.jackpot(); s.haptic([40, 60, 40]); } else if (net > 0) s.audio.win(); else if (net < 0) s.audio.lose(); else s.audio.chip();
  }

  private get trueCount(): number { return this.running / Math.max(0.5, this.remaining / 52); }

  get holdBalance(): boolean { return this.flights.busy || !!this.settlePending; }

  update(dt: number): void {
    this.t += dt;
    this.thanksT = Math.max(0, this.thanksT - dt);
    this.dealer.update(dt);
    this.flights.update(dt);
    // Bruit de chaque carte au moment où elle part
    for (const tm of this.times.values()) if (!tm.sounded && this.t >= tm.at) { tm.sounded = true; this.host.s.audio.card(); }
    if (this.settlePending && this.t >= this.settleAt) { const p = this.settlePending.payout; this.settlePending = null; this.showSettlement(p); }
    const g = this.g, s = this.host.s;
    const bet = this.betting && !this.settlePending;
    const panel = this.panel;
    this.betCtl.locked = !bet || this.waiting || !!panel;
    this.betCtl.sync();
    this.betCtl.setShown(bet && panel !== 'tables');
    this.btn.deal.visible = bet && panel !== 'tables';
    this.btn.deal.label = g.phase === 'settled' ? `Rejouer · ${this.betCtl.amount}` : `Distribuer · ${this.betCtl.amount}`;
    this.btn.deal.enabled = !this.waiting && !panel && s.chips.canAfford(this.betCtl.amount) && !this.tableLocked(this.tableDef);
    const playing = !this.betting;
    const dealing = this.t < this.queue - STEP * 0.5; // on attend que les cartes soient posées
    for (const id of ['hit', 'stand', 'double', 'split']) this.btn[id].visible = playing && panel !== 'double';
    for (const id of ['dblUp', 'dblDown', 'dblCancel']) this.btn[id].visible = playing && panel === 'double';
    const w = this.waiting || dealing || panel === 'tables' || panel === 'tip';
    this.btn.hit.enabled = !w && this.can.hit;
    this.btn.stand.enabled = !w && this.can.stand;
    this.btn.double.enabled = !w && this.can.double && s.chips.canAfford(g.current?.bet ?? 0);
    this.btn.split.enabled = !w && this.can.split && s.chips.canAfford(g.current?.bet ?? 0);
    this.btn.dblUp.enabled = this.btn.dblDown.enabled = !this.waiting;
    this.btn.tableBtn.visible = panel !== 'tables';
    this.btn.tableBtn.enabled = bet && !this.waiting && !panel;
    this.btn.tipBtn.visible = panel !== 'tables';
    this.btn.tipBtn.enabled = !this.waiting && !panel && s.chips.balance >= 1;
    if (this.panel === 'double' && !playing) this.closePanel();
    if (bet !== this.laidOutBetting && !this.flights.busy) this.layout();
  }

  /** Main : chaque carte part de la main du croupier, arrive en arc puis se retourne (sauf carte cachée). */
  private drawHand(ctx: CanvasRenderingContext2D, key: string, cards: Card[], cx: number, y: number, from: { x: number; y: number }): number {
    const w = this.cardW, h = w * 1.4, gap = w * 0.42;
    const total = w + gap * (cards.length - 1);
    let landed = 0;
    cards.forEach((c, i) => {
      const tm = this.times.get(`${key}:${i}`);
      const at = tm?.at ?? -1;
      const k = Math.min(1, Math.max(0, (this.t - at) / DEAL_TIME));
      if (k <= 0) return;
      if (k >= 1) landed++;
      const e = 1 - (1 - k) * (1 - k);
      const tx = cx - total / 2 + i * gap;
      const x = from.x + (tx - from.x) * e, yy = y + (from.y - y) * (1 - e) - Math.sin(k * Math.PI) * 18;
      const flipAt = tm?.flipAt ?? -1;
      const flip = c.rank === 0 || flipAt === Infinity ? 0 : Math.min(1, Math.max(0, (this.t - flipAt) / 0.26));
      drawCard(ctx, c.rank === 0 ? null : c, x, yy, w, h, flip);
    });
    return landed;
  }

  /** Valeur des cartes déjà retournées (affichage). */
  private shownValue(key: string, cards: Card[]): { text: string; hidden: boolean } {
    const vis = cards.filter((c, i) => { const tm = this.times.get(`${key}:${i}`); return c.rank > 0 && (!tm || (tm.flipAt !== Infinity && this.t >= tm.flipAt + 0.13)); });
    const hidden = vis.length < cards.length;
    if (!vis.length) return { text: '?', hidden };
    const v = handValue(vis);
    return { text: `${v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : v.total}${hidden ? ' + ?' : ''}`, hidden };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const a = this.host.area, ui = this.host.vp.ui, g = this.g;
    const D = this.dealerPos;
    // Croupier derrière la table, puis la table
    this.dealer.render(ctx, D.x, D.y, D.k, ui);
    if (this.thanksT > 0) drawPill(ctx, 'Merci beaucoup !', D.x, D.y - 64 * D.k * 0.6, 12 * ui, 'rgba(255,255,255,0.92)', '#1a1208');
    this.felt = drawTable(ctx, this.table, ui, this.hilo ? 'bordeaux' : this.tableDef.id === 'vip' ? 'black' : this.tableDef.id === 'premium' ? 'blue' : 'green');
    const F = this.felt;
    const tableName = `KS · Table ${this.tableDef.name}${this.hilo ? ' · Hi-Lo' : ''} · ${this.tableDef.min}–${this.tableDef.max.toLocaleString('fr-FR')}`;
    if (F.w > 520 * ui) {
      feltText(ctx, 'Blackjack payé 3 pour 2 + bonus 50 %', F.x + F.w * 0.2, F.y + F.h * 0.5, 10 * ui);
      feltText(ctx, 'Le croupier reste sur 17', F.x + F.w * 0.8, F.y + F.h * 0.5, 10 * ui);
      feltText(ctx, tableName, F.x + F.w * 0.2, F.y + F.h * 0.58, 9 * ui, 0.4);
    } else {
      feltText(ctx, 'Blackjack 3 pour 2 + bonus 50 % · reste sur 17', F.x + F.w / 2, F.y + F.h * 0.47, 9 * ui);
      feltText(ctx, tableName, F.x + F.w / 2, F.y + F.h * 0.52, 8.5 * ui, 0.4);
    }

    // Sabot (à la droite du croupier)
    const shoe = { x: F.x + F.w * 0.8, y: F.y + 6 * ui };
    ctx.save(); roundRect(ctx, shoe.x - 4 * ui, shoe.y - 2 * ui, this.cardW * 0.9, this.cardW * 0.62, 6 * ui);
    ctx.fillStyle = '#120e14'; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.7)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
    drawCard(ctx, null, shoe.x, shoe.y, this.cardW * 0.7, this.cardW * 0.5);
    const from = this.dealer.hand(D.x, D.y, D.k);
    const h = this.cardW * 1.4;
    if (g.dealer.length) {
      this.drawHand(ctx, 'd', g.dealer, F.x + F.w / 2, F.y + 8 * ui, from);
      const dv = this.shownValue('d', g.dealer);
      const dw = this.cardW + this.cardW * 0.42 * (g.dealer.length - 1);
      drawPill(ctx, `Croupier · ${dv.text}`, F.x + F.w / 2 - dw / 2 - 58 * ui, F.y + 8 * ui + h * 0.5, 11 * ui, 'rgba(0,0,0,0.6)', LUXE.ivory);
    }
    // Cases de mise et mains du joueur
    const n = Math.max(1, g.hands.length);
    const shown = !this.settlePending;
    for (let i = 0; i < n; i++) {
      const sp = this.spot(i, n);
      ctx.save(); ctx.strokeStyle = 'rgba(239,220,174,0.45)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 22 * ui, 11 * ui, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      const hand = g.hands[i];
      const lost = hand?.outcome === 'lose' && shown && !!this.recap;
      const amt = hand && !(lost && !this.flights.busy) ? hand.bet : this.betting && !hand ? this.betCtl.amount : 0;
      if (amt > 0) drawChipStack(ctx, sp.x, sp.y + 4 * ui, 15 * ui, amt, 8);
    }
    const py = this.spot(0, 1).y - 18 * ui - h;
    g.hands.forEach((hand, i) => {
      const cx = this.spot(i, n).x;
      this.drawHand(ctx, `h${i}`, hand.cards, cx, py, from);
      const v = this.shownValue(`h${i}`, hand.cards);
      const active = g.phase === 'player' && i === g.active && n > 1;
      const res = hand.outcome && this.recap ? ` · ${OUTCOME_LABEL[hand.outcome]}` : '';
      const label = `${v.text}${hand.hiddenDouble && v.hidden ? ' (double caché)' : ''}${res}`;
      const cw = this.cardW + this.cardW * 0.42 * (hand.cards.length - 1);
      drawPill(ctx, label, cx + cw / 2 + 40 * ui, py + h * 0.5, 12 * ui, active ? PAL.gold : 'rgba(0,0,0,0.6)', active ? '#1a1208' : LUXE.ivory);
    });
    this.flights.render(ctx);
    const midY = (F.y + 8 * ui + h + py) / 2;
    if (this.recap && !this.settlePending) this.renderRecap(ctx, a.x + a.w / 2, midY, Math.min(F.w * 0.86, 560 * ui), ui);
    else if (this.message && this.betting && !this.settlePending) drawPill(ctx, this.message, a.x + a.w / 2, midY, 14 * ui, 'rgba(14,11,16,0.9)', PAL.text);
    if (this.hilo) {
      // Panneau du comptage Hi-Lo
      const px = F.x + 10 * ui, py2 = F.y + 10 * ui;
      roundRect(ctx, px, py2, 140 * ui, 84 * ui, 12 * ui); ctx.fillStyle = 'rgba(14,11,16,0.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      drawLabel(ctx, 'Comptage Hi-Lo', px + 70 * ui, py2 + 13 * ui, 11 * ui, LUXE.champagne);
      const tc = this.trueCount;
      drawLabel(ctx, `Courant ${this.running > 0 ? '+' : ''}${this.running}`, px + 70 * ui, py2 + 33 * ui, 13 * ui, PAL.text);
      drawLabel(ctx, `Réel ${tc > 0 ? '+' : ''}${tc.toFixed(1).replace('.', ',')}`, px + 70 * ui, py2 + 51 * ui, 13 * ui, tc >= 2 ? PAL.success : tc <= -2 ? PAL.danger : PAL.text);
      drawLabel(ctx, tc >= 2 ? 'Favorable au joueur' : tc <= -2 ? 'Défavorable' : 'Neutre', px + 70 * ui, py2 + 70 * ui, 10 * ui, PAL.textDim, 'center', 600);
    }
    if (this.betting && this.panel !== 'tables' && !this.settlePending) this.betCtl.render(ctx, ui, this.roundTips ? `Pourboires : ${this.roundTips}` : '');
    if (this.panel === 'tables' || this.panel === 'tip') this.renderPanel(ctx, ui);
    if (this.panel === 'double') drawPill(ctx, 'Doubler : reçois ta carte face visible, ou face cachée (retournée à la fin)', a.x + a.w / 2, this.btn.dblUp.y - 18 * ui, 12 * ui, 'rgba(14,11,16,0.9)', LUXE.champagne);
    this.layer.render(ctx, ui);
  }

  /** Récapitulatif de la manche : mises, retour, bonus, pourboires, solde avant → après. */
  private renderRecap(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, ui: number): void {
    const r = this.recap!;
    const net = r.payout - r.stake;
    const after = r.before - r.stake + r.payout - this.roundTips;
    const fmt = (v: number) => v.toLocaleString('fr-FR');
    const title = r.natural ? `Blackjack ! +${fmt(net)} jetons` : net > 0 ? `Gagné : +${fmt(net)} jetons` : net === 0 ? 'Égalité : mise rendue' : `Perdu : −${fmt(-net)} jetons`;
    const l2 = `Mise initiale ${fmt(r.initial)}${r.extra ? ` · suppl. ${fmt(r.extra)} (double/séparation)` : ''} · retour ${fmt(r.payout)}`;
    const l3 = r.natural ? `Paiement 3:2 : ${fmt(r.payout - r.bonus)} · bonus blackjack : +${fmt(r.bonus)} · total : ${fmt(r.payout)}` : r.dealerPeek ? 'Blackjack du croupier' : '';
    const l4 = `Solde ${fmt(r.before)} → ${fmt(after)}${this.roundTips ? ` (pourboires −${fmt(this.roundTips)})` : ''}`;
    const l5 = r.hands.length > 1 ? r.hands.map((h, i) => `Main ${i + 1} : ${OUTCOME_LABEL[h.outcome as keyof typeof OUTCOME_LABEL] ?? h.outcome} (${h.net >= 0 ? '+' : '−'}${fmt(Math.abs(h.net))})`).join(' · ') : '';
    const lines = [l2, l3, l5, l4].filter(Boolean);
    const lh = 15 * ui, h = 30 * ui + lines.length * lh + 10 * ui;
    ctx.save();
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 12 * ui);
    ctx.fillStyle = 'rgba(14,11,16,0.96)'; ctx.fill();
    ctx.strokeStyle = r.natural ? LUXE.champagne : net > 0 ? PAL.success : net < 0 ? 'rgba(239,220,174,0.35)' : 'rgba(239,220,174,0.5)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(15 * ui, 800); ctx.fillStyle = r.natural ? LUXE.champagne : net > 0 ? PAL.success : net < 0 ? PAL.danger : PAL.text;
    ctx.fillText(title, cx, cy - h / 2 + 17 * ui, w - 16 * ui);
    ctx.font = font(11.5 * ui, 600); ctx.fillStyle = PAL.textDim;
    lines.forEach((l, i) => { ctx.fillStyle = l === l4 ? PAL.text : PAL.textDim; ctx.fillText(l, cx, cy - h / 2 + 36 * ui + i * lh, w - 16 * ui); });
    ctx.restore();
  }

  private renderPanel(ctx: CanvasRenderingContext2D, ui: number): void {
    const P = this.panelRect, a = this.host.area;
    ctx.save();
    ctx.fillStyle = 'rgba(5,4,6,0.55)'; ctx.fillRect(a.x, a.y, a.w, a.h);
    roundRect(ctx, P.x, P.y, P.w, P.h, 16 * ui); ctx.fillStyle = 'rgba(20,16,22,0.97)'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    const title = this.panel === 'tables' ? 'Choisis ta table (mise initiale min. – max.)' : `Pourboire au croupier · solde ${this.host.s.chips.balance.toLocaleString('fr-FR')} jetons`;
    drawLabel(ctx, title, P.x + P.w / 2, P.y + 24 * ui, 14 * ui, LUXE.champagne);
  }
}
