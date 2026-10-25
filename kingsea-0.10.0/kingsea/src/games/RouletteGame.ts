// Vue tactile de la roulette européenne : tapis de mises, roue animée, historique.
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { easeOutCubic } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { betKey, colorOf, WHEEL_ORDER, type Bet, type BetKind } from './logic/roulette';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawChip, drawLabel, drawPill } from './widgets';
import { BetControl, ChipFlights, Dealer } from './casinoKit';
import { betWins, returnMultiplier } from './logic/roulette';
import { goldGradient } from '../art/brand';

const TAU = Math.PI * 2;
/** Jeton affiché pour un montant (plus grande valeur de jeton contenue). */
const chipFor = (n: number): number => [1000, 500, 250, 100, 50, 25, 10, 5, 1].find((v) => n >= v) ?? 1;

const COLORS = { red: '#a3172c', black: '#16131a', green: '#0f7a4f' } as const;

interface Cell { kind: BetKind; x: number; y: number; w: number; h: number; label: string; color?: string }

export class RouletteGame implements MiniGame {
  readonly id = 'roulette';
  readonly title = 'Roulette';
  readonly bg: [string, string] = ['#0a1f3a', '#040c18'];
  readonly currency = 'chips' as const;
  readonly rules =
    'Roulette européenne : 37 cases (0 à 36).\nTouche le tapis pour poser le jeton choisi, autant de fois que tu veux, puis « Lancer ».\n' +
    'Gains (mise comprise) :\n• Numéro plein : ×36\n• Douzaine ou colonne (2:1) : ×3\n• Rouge/Noir, Pair/Impair, 1-18/19-36 : ×2\nLe 0 fait perdre toutes les mises sauf celles posées sur le 0.';

  private host!: MiniGameHost;
  get holdBalance(): boolean { return this.spin !== null || this.waiting || this.flights.busy; }
  /** Requête envoyée à l'autorité, réponse attendue. */
  private waiting = false;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private bets = new Map<string, Bet>();
  private lastBets: Bet[] = [];
  private cells: Cell[] = [];
  private wheel = { cx: 0, cy: 0, r: 0 };
  private dealer = new Dealer('Antoine');
  private dealerPos = { x: 0, y: 0, k: 1.2 };
  private flights = new ChipFlights();
  /** Mises de la manche jouée (affichées pendant le tirage, puis payées ou ramassées). */
  private onTable: Bet[] = [];
  private t = 0;
  private rot = 0;
  private spin: { start: number; dur: number; from: number; to: number; result: number; stake: number; payout: number } | null = null;
  private result: number | null = null;
  private history: number[] = [];
  private message = 'Pose tes jetons sur le tapis.';
  private btn: Record<string, Button> = {};
  private boardHandler: PointerHandler;

  constructor() {
    this.boardHandler = { onDown: (p) => this.tapBoard(p) };
  }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [1, 5, 25, 100], min: 1, initial: 5, mode: 'chip', onDouble: () => this.doubleBets() });
    this.btn.clear = makeButton({ id: 'clear', label: 'Effacer', style: 'secondary', fontSize: 15, onTap: () => { this.bets.clear(); } });
    this.btn.rebet = makeButton({ id: 'rebet', label: 'Rejouer', style: 'secondary', fontSize: 15, onTap: () => this.rebet() });
    this.btn.spin = makeButton({ id: 'spin', label: 'Lancer', style: 'gold', fontSize: 17, onTap: () => this.launch() });
    this.layer.buttons = [...this.betCtl.buttons, this.btn.clear, this.btn.rebet, this.btn.spin];
  }

  /** ×2 : double toutes les mises posées (si le solde le permet). */
  private doubleBets(): void {
    if (this.staked <= 0) return;
    if (this.staked * 2 > this.host.s.chips.balance) { this.host.toasts.show('Pas assez de jetons pour doubler', 'error'); return; }
    for (const [k, b] of this.bets) this.bets.set(k, { ...b, amount: b.amount * 2 });
    this.host.s.audio.chip();
  }

  get staked(): number { let s = 0; for (const b of this.bets.values()) s += b.amount; return s; }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const portrait = a.h > a.w * 0.9;
    const ctrlH = this.betCtl.layout(a, ui, [[this.btn.clear, 96], [this.btn.rebet, 100], [this.btn.spin, 130]]);
    let boardX: number, boardY: number, boardW: number, boardH: number;
    if (portrait) {
      const r = Math.min(a.w * 0.28, a.h * 0.17);
      this.wheel = { cx: a.x + a.w * 0.42, cy: a.y + r + 6, r };
      boardX = a.x; boardY = a.y + r * 2 + 40 * ui; boardW = a.w; boardH = a.h - (boardY - a.y) - ctrlH - 10 * ui;
      this.dealerPos = { x: a.x + a.w * 0.42 + r + (a.w * 0.58 - r) / 2, y: a.y + r * 1.25, k: Math.min(1.6, r / 50) };
    } else {
      const r = Math.min((a.h - ctrlH - 34 * ui) / 2, a.w * 0.19);
      this.wheel = { cx: a.x + r + 8 * ui, cy: a.y + r + 4 * ui, r };
      // Le croupier se tient au bout de la table, à droite du tapis
      boardX = a.x + r * 2 + 30 * ui; boardY = a.y + 30 * ui; boardW = a.x + a.w - boardX - 64 * ui; boardH = a.h - ctrlH - 46 * ui;
      this.dealerPos = { x: a.x + a.w - 32 * ui, y: boardY + boardH * 0.5, k: 1.15 };
    }
    const cw = boardW / 14, ch = Math.min(cw * 1.25, boardH / 5);
    const cells: Cell[] = [];
    cells.push({ kind: { type: 'number', n: 0 }, x: boardX, y: boardY, w: cw, h: ch * 3, label: '0', color: COLORS.green });
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      cells.push({ kind: { type: 'number', n }, x: boardX + cw * (col + 1), y: boardY + ch * row, w: cw, h: ch, label: String(n), color: COLORS[colorOf(n) as 'red' | 'black'] });
    }
    for (let row = 0; row < 3; row++) cells.push({ kind: { type: 'column', c: (3 - row) as 1 | 2 | 3 }, x: boardX + cw * 13, y: boardY + ch * row, w: cw, h: ch, label: '2:1' });
    for (let d = 0; d < 3; d++) cells.push({ kind: { type: 'dozen', d: (d + 1) as 1 | 2 | 3 }, x: boardX + cw * (1 + d * 4), y: boardY + ch * 3, w: cw * 4, h: ch, label: ['1-12', '13-24', '25-36'][d] });
    const outside: Array<[BetKind, string, string?]> = [[{ type: 'low' }, '1-18'], [{ type: 'even' }, 'Pair'], [{ type: 'red' }, '◆', COLORS.red], [{ type: 'black' }, '◆', COLORS.black], [{ type: 'odd' }, 'Impair'], [{ type: 'high' }, '19-36']];
    outside.forEach(([k, l, c], i) => cells.push({ kind: k, x: boardX + cw * (1 + i * 2), y: boardY + ch * 4, w: cw * 2, h: ch, label: l, color: c }));
    this.cells = cells;
  }

  handlers(): PointerHandler[] { return [this.boardHandler, this.layer]; }
  canQuit() { return this.spin || this.waiting ? { ok: false as const, reason: 'Attends la fin du tirage' } : { ok: true as const }; }

  private tapBoard(p: PointerInfo): boolean {
    const c = this.cells.find((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
    if (!c) return false;
    if (this.spin || this.waiting) return true;
    const s = this.host.s;
    if (this.staked + this.betCtl.amount > s.chips.balance) { this.host.toasts.show('Mises supérieures à ton solde', 'error'); s.audio.error(); return true; }
    const k = betKey(c.kind);
    const prev = this.bets.get(k);
    this.bets.set(k, { kind: c.kind, amount: (prev?.amount ?? 0) + this.betCtl.amount });
    this.result = null;
    s.audio.chip();
    return true;
  }

  private rebet(): void {
    const total = this.lastBets.reduce((a, b) => a + b.amount, 0);
    if (!total || this.spin) return;
    if (total > this.host.s.chips.balance) { this.host.toasts.show('Solde insuffisant pour remiser', 'error'); return; }
    this.bets = new Map(this.lastBets.map((b) => [betKey(b.kind), { ...b }]));
    this.result = null;
  }

  private async launch(): Promise<void> {
    const s = this.host.s, total = this.staked;
    if (this.spin || this.waiting || total <= 0) return;
    const bets = [...this.bets.values()].map((b) => ({ ...b }));
    // Le tirage est décidé par l'autorité (serveur en ligne) ; l'animation ne fait que l'afficher.
    this.waiting = true; this.message = 'Rien ne va plus…';
    const r = await s.ask('casino', 'roulette', 'play', { bets });
    this.waiting = false;
    if (!r.ok) { this.message = ''; this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    const result = r.view.result as number;
    const dur = 4.2;
    const idx = WHEEL_ORDER.indexOf(result);
    const rotEnd = this.rot + 0.6 * dur;
    const target = -Math.PI / 2 + idx * (TAU / 37) + rotEnd + TAU / 74;
    const from = Math.random() * TAU;
    let to = target; // la bille tourne en sens inverse de la roue, 5 tours au moins
    while (to > from - TAU * 5) to -= TAU;
    this.spin = { start: this.t, dur, from, to, result, stake: r.stake, payout: r.payout };
    this.onTable = bets;
    this.dealer.play('deal', 1.2);
    this.lastBets = [...this.bets.values()].map((b) => ({ ...b }));
    this.message = 'Rien ne va plus…';
  }

  private finish(): void {
    const sp = this.spin!, s = this.host.s;
    const ret = sp.payout, staked = sp.stake;
    this.result = sp.result;
    this.history.unshift(sp.result); this.history = this.history.slice(0, 12);
    const net = ret - staked;
    const col = { green: 'vert', red: 'rouge', black: 'noir' }[colorOf(sp.result)];
    this.message = `${sp.result} ${col} · ${net > 0 ? `gagné +${net}` : net === 0 ? 'mise rendue' : `perdu −${-net}`}`;
    if (net > 0) s.audio.win(); else s.audio.lose();
    // Le croupier ramasse les mises perdantes et paie les gagnantes, case par case
    const ui = this.host.vp.ui, D = this.dealerPos, hand = this.dealer.hand(D.x, D.y, D.k);
    for (const b of this.onTable) {
      const cell = this.cells.find((c) => betKey(c.kind) === betKey(b.kind));
      if (!cell) continue;
      const at = { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
      if (betWins(b.kind, sp.result)) this.flights.add(hand, at, b.amount * (returnMultiplier(b.kind) - 1), 9 * ui, 0.5, 0.2);
      else this.flights.add(at, hand, b.amount, 9 * ui, 0.45);
    }
    this.dealer.play(net > 0 ? 'congrats' : 'collect', 1.4);
    this.bets.clear();
    this.spin = null;
    setTimeout(() => { this.onTable = []; }, 900);
  }

  update(dt: number): void {
    this.t += dt;
    this.dealer.update(dt);
    this.flights.update(dt);
    this.rot += 0.6 * dt;
    if (this.spin && this.t - this.spin.start >= this.spin.dur) this.finish();
    this.betCtl.locked = !!this.spin || this.waiting;
    this.betCtl.engaged = this.staked;
    this.betCtl.sync();
    this.btn.spin.enabled = !this.spin && !this.waiting && this.staked > 0;
    this.btn.spin.label = this.staked > 0 ? `Lancer · ${this.staked}` : 'Lancer';
    this.btn.clear.enabled = !this.spin && this.staked > 0;
    this.btn.rebet.enabled = !this.spin && this.staked === 0 && this.lastBets.length > 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, W = this.wheel;
    // Roue
    ctx.save(); ctx.translate(W.cx, W.cy);
    ctx.fillStyle = '#4a2a14'; ctx.beginPath(); ctx.arc(0, 0, W.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = goldGradient(ctx, -W.r, -W.r, W.r, W.r); ctx.lineWidth = Math.max(3, W.r * 0.05); ctx.stroke();
    const seg = TAU / 37;
    for (let i = 0; i < 37; i++) {
      const n = WHEEL_ORDER[i], a0 = -Math.PI / 2 + i * seg + this.rot;
      ctx.fillStyle = COLORS[colorOf(n)];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, W.r * 0.9, a0, a0 + seg); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.rotate(a0 + seg / 2); ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(7, W.r * 0.075)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(W.r * 0.8, 0); ctx.rotate(Math.PI / 2); ctx.fillText(String(n), 0, 0); ctx.restore();
    }
    ctx.fillStyle = '#2b1a0c'; ctx.beginPath(); ctx.arc(0, 0, W.r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(0, 0, W.r * 0.12, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(this.rot * 2 + (i * Math.PI) / 2); ctx.fillRect(-1.5, 0, 3, W.r * 0.45); ctx.restore(); }
    // Bille
    let ba: number, br: number;
    if (this.spin) {
      const p = Math.min(1, (this.t - this.spin.start) / this.spin.dur), e = easeOutCubic(p);
      ba = this.spin.from + (this.spin.to - this.spin.from) * e;
      br = W.r * (0.95 - 0.2 * Math.max(0, (p - 0.6) / 0.4));
    } else if (this.result !== null) {
      const idx = WHEEL_ORDER.indexOf(this.result);
      ba = -Math.PI / 2 + idx * seg + this.rot + seg / 2; br = W.r * 0.75;
    } else { ba = -Math.PI / 2; br = W.r * 0.95; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(ba) * br, Math.sin(ba) * br, Math.max(3, W.r * 0.045), 0, TAU); ctx.fill();
    ctx.restore();

    // Historique
    const hy = W.cy + W.r + 18 * ui;
    this.history.slice(0, 8).forEach((n, i) => drawPill(ctx, String(n), W.cx - W.r + 14 * ui + i * 26 * ui, hy, 10 * ui, COLORS[colorOf(n)], '#fff'));

    // Tapis
    for (const c of this.cells) {
      ctx.fillStyle = c.color ?? '#0d5e3e';
      ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      const win = this.result !== null && c.kind.type === 'number' && c.kind.n === this.result;
      if (win) { ctx.strokeStyle = PAL.gold; ctx.lineWidth = 3; ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4); }
      drawLabel(ctx, c.label, c.x + c.w / 2, c.y + c.h / 2, Math.min(c.h * 0.42, c.w * 0.45, 15 * ui), '#fff', 'center', 800);
      const bet = this.bets.get(betKey(c.kind)) ?? this.onTable.find((b) => betKey(b.kind) === betKey(c.kind));
      if (bet) drawChip(ctx, c.x + c.w / 2, c.y + c.h / 2, Math.min(c.w, c.h) * 0.38, chipFor(bet.amount));
    }
    const D = this.dealerPos;
    this.dealer.render(ctx, D.x, D.y, D.k, ui);
    this.flights.render(ctx);
    const board = this.cells[0];
    drawLabel(ctx, this.message, board.x, board.y - 16 * ui, 14 * ui, PAL.text, 'left', 700);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
