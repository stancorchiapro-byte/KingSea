// Vue tactile de la roulette européenne : tapis de mises, roue animée, historique.
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { betKey, colorOf, WHEEL_ORDER, type Bet, type BetKind } from './logic/roulette';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawChip, drawLabel, drawPill } from './widgets';
import { BetControl, ChipFlights, Dealer } from './casinoKit';
import { betWins, returnMultiplier } from './logic/roulette';
import { goldGradient } from '../art/brand';
import { makeCanvas, roundRect } from '../art/canvas';

const TAU = Math.PI * 2;
/** Jeton affiché pour un montant (plus grande valeur de jeton contenue). */
const chipFor = (n: number): number => [1000, 500, 250, 100, 50, 25, 10, 5, 1].find((v) => n >= v) ?? 1;

const COLORS = { red: '#a3172c', black: '#16131a', green: '#0f7a4f' } as const;

interface Cell { kind: BetKind; x: number; y: number; w: number; h: number; label: string; color?: string }

export class RouletteGame implements MiniGame {
  readonly id = 'roulette';
  readonly tableGame = 'roulette';
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
  private spin: { start: number; dur: number; rel0: number; relEnd: number; result: number; stake: number; payout: number; bounces: number[] } | null = null;
  /** Roue pré-rendue (cuvette, cases, frettes, numéros) : tournée à chaque image au lieu d'être redessinée. */
  private wheelImg: { key: string; c: ReturnType<typeof makeCanvas> } | null = null;
  private lastBall = { a: -Math.PI / 2, r: 0.93 };
  private nextBounce = 0;
  /** Marqueur (« dolly ») posé par le croupier sur le numéro sorti. */
  private dollyT = -10;
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
    // Résultat affiché sur la roue (le tapis reste lisible : cases gagnantes illuminées)
    this.host.result.anchorX = (this.wheel.cx - a.x) / a.w; this.host.result.anchorY = (this.wheel.cy - a.y) / a.h;
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
    const r = await this.host.playRound('roulette', 'play', { bets }, total, () => this.host.toasts.show('Mise acceptée : tirage commun à la fin du compte à rebours'));
    this.waiting = false;
    if (!r.ok) { this.message = ''; this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    const result = r.view.result as number;
    const dur = 5.2;
    // La bille est suivie dans le repère de la roue : elle part en sens inverse, ralentit, rebondit sur
    // les déflecteurs puis se loge exactement dans la case du numéro décidé par l'autorité.
    const relEnd = pocketAngle(result);
    const rel0 = relEnd + TAU * 9 + (((this.lastBall.a - this.rot - relEnd) % TAU) + TAU) % TAU;
    const bounces = [0.6, 0.66, 0.71, 0.75, 0.79].map((b) => b + (Math.random() - 0.5) * 0.02);
    this.spin = { start: this.t, dur, rel0, relEnd, result, stake: r.stake, payout: r.payout, bounces };
    this.nextBounce = 0;
    this.result = null;
    s.audio.ballRoll(dur * 0.58);
    this.onTable = bets;
    this.dealer.play('deal', 1.2);
    this.lastBets = [...this.bets.values()].map((b) => ({ ...b }));
    this.message = 'Rien ne va plus…';
  }

  private finish(): void {
    const sp = this.spin!;
    const ret = sp.payout, staked = sp.stake;
    this.result = sp.result;
    this.history.unshift(sp.result); this.history = this.history.slice(0, 12);
    const net = ret - staked;
    const col = { green: 'vert', red: 'rouge', black: 'noir' }[colorOf(sp.result)];
    this.message = `${sp.result} ${col} · ${net > 0 ? `gagné +${net}` : net === 0 ? 'mise rendue' : `perdu −${-net}`}`;
    this.host.celebrate(net, staked, `${sp.result} ${col}`);
    this.dollyT = this.t;
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
    if (this.spin) {
      const p = (this.t - this.spin.start) / this.spin.dur;
      // Rebonds sur les déflecteurs : petits claquements synchronisés avec l'animation
      while (this.nextBounce < this.spin.bounces.length && p >= this.spin.bounces[this.nextBounce]) { this.host.s.audio.ballRattle(1 - this.nextBounce * 0.17); this.nextBounce++; }
      if (p >= 1) this.finish();
    }
    this.betCtl.locked = !!this.spin || this.waiting;
    this.betCtl.engaged = this.staked;
    this.betCtl.sync();
    this.btn.spin.enabled = !this.spin && !this.waiting && this.staked > 0;
    this.btn.spin.label = this.staked > 0 ? `Lancer · ${this.staked}` : 'Lancer';
    this.btn.clear.enabled = !this.spin && this.staked > 0;
    this.btn.rebet.enabled = !this.spin && this.staked === 0 && this.lastBets.length > 0;
  }

  /** Position de la bille (angle écran, rayon relatif) : piste, ralentissement, rebonds, puis case. */
  private ballPos(): { a: number; r: number } {
    const seg = TAU / 37;
    if (this.spin) {
      const sp = this.spin, p = Math.min(1, (this.t - sp.start) / sp.dur);
      return rouletteBall(p, sp.rel0, sp.relEnd, this.rot);
    }
    if (this.result !== null) {
      const idx = WHEEL_ORDER.indexOf(this.result);
      return { a: -Math.PI / 2 + idx * seg + this.rot + seg / 2, r: 0.62 };
    }
    return { a: -Math.PI / 2, r: 0.93 };
  }

  /** Plateau de la roue (cases rouges/noires/vertes, frettes dorées, numéros, cône) dessiné une seule fois. */
  private wheelSprite(px: number) {
    const key = String(px);
    if (this.wheelImg?.key === key) return this.wheelImg.c;
    const c = makeCanvas(Math.round(px * 0.86), Math.round(px * 0.86)), g = c.ctx, R = (px * 0.86) / 2;
    g.translate(R, R);
    const seg = TAU / 37;
    for (let i = 0; i < 37; i++) {
      const n = WHEEL_ORDER[i], a0 = -Math.PI / 2 + i * seg;
      const base = COLORS[colorOf(n)];
      const gr = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
      gr.addColorStop(0, base); gr.addColorStop(0.85, base); gr.addColorStop(1, '#00000080');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + seg); g.closePath(); g.fill();
      // Frette (séparation dorée entre deux cases)
      g.strokeStyle = 'rgba(232,200,120,0.9)'; g.lineWidth = Math.max(1, R * 0.012);
      g.beginPath(); g.moveTo(Math.cos(a0) * R * 0.62, Math.sin(a0) * R * 0.62); g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); g.stroke();
      g.save(); g.rotate(a0 + seg / 2); g.fillStyle = '#fff'; g.font = `700 ${Math.max(7, R * 0.085)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(R * 0.9, 0); g.rotate(Math.PI / 2); g.fillText(String(n), 0, 0); g.restore();
    }
    // Anneau des cases (creux où se loge la bille)
    g.strokeStyle = 'rgba(232,200,120,0.85)'; g.lineWidth = Math.max(1, R * 0.015);
    g.beginPath(); g.arc(0, 0, R * 0.8, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.stroke();
    // Cône central en bois
    const cone = g.createRadialGradient(-R * 0.15, -R * 0.15, R * 0.05, 0, 0, R * 0.62);
    cone.addColorStop(0, '#8a5a30'); cone.addColorStop(1, '#2b1a0c');
    g.fillStyle = cone; g.beginPath(); g.arc(0, 0, R * 0.61, 0, TAU); g.fill();
    for (let i = 0; i < 8; i++) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos((i * TAU) / 8) * R * 0.6, Math.sin((i * TAU) / 8) * R * 0.6); g.stroke(); }
    this.wheelImg = { key, c };
    return c;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, W = this.wheel;
    // Roue : cuvette en bois verni, piste de bille, déflecteurs fixes, plateau pré-rendu qui tourne
    const seg = TAU / 37;
    const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
    const img = this.wheelSprite(Math.round(W.r * 2 * dpr));
    ctx.save(); ctx.translate(W.cx, W.cy);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14 * ui; ctx.shadowOffsetY = 5 * ui;
    const wood = ctx.createRadialGradient(-W.r * 0.3, -W.r * 0.3, W.r * 0.2, 0, 0, W.r);
    wood.addColorStop(0, '#7a4a24'); wood.addColorStop(0.8, '#4a2a14'); wood.addColorStop(1, '#2a160a');
    ctx.fillStyle = wood; ctx.beginPath(); ctx.arc(0, 0, W.r, 0, TAU); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = goldGradient(ctx, -W.r, -W.r, W.r, W.r); ctx.lineWidth = Math.max(3, W.r * 0.04); ctx.stroke();
    // Piste de la bille (bois clair poli)
    const track = ctx.createRadialGradient(0, 0, W.r * 0.84, 0, 0, W.r * 0.97);
    track.addColorStop(0, '#2a180c'); track.addColorStop(0.5, '#a87a48'); track.addColorStop(1, '#5a3418');
    ctx.fillStyle = track; ctx.beginPath(); ctx.arc(0, 0, W.r * 0.97, 0, TAU); ctx.arc(0, 0, W.r * 0.86, 0, TAU, true); ctx.fill();
    // Déflecteurs (losanges dorés fixes)
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + seg / 2, rr = W.r * 0.875;
      ctx.save(); ctx.rotate(a); ctx.translate(rr, 0);
      ctx.fillStyle = goldGradient(ctx, -4, -4, 4, 4); ctx.beginPath(); ctx.moveTo(-W.r * 0.035, 0); ctx.lineTo(0, -W.r * 0.02); ctx.lineTo(W.r * 0.035, 0); ctx.lineTo(0, W.r * 0.02); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.rotate(this.rot);
    ctx.drawImage(img.canvas as CanvasImageSource, -W.r * 0.86, -W.r * 0.86, W.r * 1.72, W.r * 1.72);
    // Tourelle centrale : croisillon doré qui tourne avec le plateau
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 2);
      ctx.fillStyle = goldGradient(ctx, 0, -2, W.r * 0.4, 2); ctx.fillRect(0, -W.r * 0.018, W.r * 0.36, W.r * 0.036);
      ctx.beginPath(); ctx.arc(W.r * 0.36, 0, W.r * 0.035, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const hub = ctx.createRadialGradient(-W.r * 0.03, -W.r * 0.03, 1, 0, 0, W.r * 0.12);
    hub.addColorStop(0, '#fff3c4'); hub.addColorStop(1, '#8a6a2b');
    ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(0, 0, W.r * 0.11, 0, TAU); ctx.fill();
    ctx.restore();
    // Bille : position calculée dans le repère de la roue
    const b = this.ballPos();
    this.lastBall = b;
    const bx = Math.cos(b.a) * b.r * W.r, by = Math.sin(b.a) * b.r * W.r, brad = Math.max(3, W.r * 0.04);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(bx + brad * 0.3, by + brad * 0.4, brad, 0, TAU); ctx.fill();
    const bg = ctx.createRadialGradient(bx - brad * 0.35, by - brad * 0.35, brad * 0.1, bx, by, brad);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#bfc3c9');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, brad, 0, TAU); ctx.fill();
    // Reflet de la lumière du plafond sur le vernis
    const sheen = ctx.createLinearGradient(-W.r, -W.r, W.r * 0.2, W.r * 0.2);
    sheen.addColorStop(0, 'rgba(255,255,255,0.14)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.beginPath(); ctx.arc(0, 0, W.r, 0, TAU); ctx.fill();
    ctx.restore();

    // Historique
    const hy = W.cy + W.r + 18 * ui;
    if (this.history.length) drawLabel(ctx, 'Derniers', W.cx - W.r, hy - 14 * ui, 9 * ui, PAL.textDim, 'left', 700);
    this.history.slice(0, 8).forEach((n, i) => drawPill(ctx, String(n), W.cx - W.r + 14 * ui + i * 26 * ui, hy, 10 * ui, COLORS[colorOf(n)], '#fff'));

    // Tapis : feutre vert avec rail de cuir, cases cernées d'or, cases gagnantes illuminées
    const c0 = this.cells[0], last = this.cells[this.cells.length - 1];
    const bx0 = c0.x - 8 * ui, by0 = c0.y - 8 * ui, bx1 = this.cells.reduce((m, c) => Math.max(m, c.x + c.w), 0) + 8 * ui, by1 = last.y + last.h + 8 * ui;
    roundRect(ctx, bx0, by0, bx1 - bx0, by1 - by0, 12 * ui);
    ctx.fillStyle = '#2a160a'; ctx.fill();
    const felt = ctx.createRadialGradient((bx0 + bx1) / 2, (by0 + by1) / 2, 10, (bx0 + bx1) / 2, (by0 + by1) / 2, (bx1 - bx0) * 0.6);
    felt.addColorStop(0, '#13774f'); felt.addColorStop(1, '#0a4a31');
    roundRect(ctx, bx0 + 4 * ui, by0 + 4 * ui, bx1 - bx0 - 8 * ui, by1 - by0 - 8 * ui, 9 * ui); ctx.fillStyle = felt; ctx.fill();
    const settled = this.result !== null && !this.spin;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const c of this.cells) {
      if (c.color) { ctx.fillStyle = c.color; ctx.fillRect(c.x + 1.5, c.y + 1.5, c.w - 3, c.h - 3); }
      ctx.strokeStyle = 'rgba(239,220,174,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      const won = settled && betWins(c.kind, this.result!);
      if (won) {
        ctx.fillStyle = `rgba(255,214,120,${0.18 + 0.17 * pulse})`; ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2.5; ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
      }
      drawLabel(ctx, c.label, c.x + c.w / 2, c.y + c.h / 2, Math.min(c.h * 0.42, c.w * 0.45, 15 * ui), '#fff', 'center', 800);
      const bet = this.bets.get(betKey(c.kind)) ?? this.onTable.find((b) => betKey(b.kind) === betKey(c.kind));
      if (bet) {
        const cr = Math.min(c.w, c.h) * 0.38;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(c.x + c.w / 2 + 1, c.y + c.h / 2 + cr * 0.35, cr, cr * 0.45, 0, 0, TAU); ctx.fill();
        drawChip(ctx, c.x + c.w / 2, c.y + c.h / 2, cr, chipFor(bet.amount));
        if (bet.amount !== chipFor(bet.amount)) drawPill(ctx, String(bet.amount), c.x + c.w / 2, c.y + c.h / 2 + cr + 4 * ui, 8 * ui, 'rgba(0,0,0,0.75)', '#fff');
      }
    }
    // Marqueur du numéro sorti : il descend sur la case, comme le pose le croupier
    if (settled) {
      const cell = this.cells.find((c) => c.kind.type === 'number' && c.kind.n === this.result);
      if (cell) {
        const k = Math.min(1, (this.t - this.dollyT) / 0.45), drop = (1 - k) * (1 - k) * 40 * ui;
        const dx = cell.x + cell.w / 2, dy = cell.y + cell.h * 0.3 - drop, dr = Math.min(cell.w, cell.h) * 0.3;
        ctx.globalAlpha = k;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(dx + 2, cell.y + cell.h * 0.3 + dr * 0.8, dr * 0.9, dr * 0.35, 0, 0, TAU); ctx.fill();
        const dg = ctx.createLinearGradient(dx - dr, dy - dr, dx + dr, dy + dr); dg.addColorStop(0, '#ffffff'); dg.addColorStop(1, '#cfd6de');
        ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.fill();
        ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(dx, dy, dr * 0.45, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
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

/**
 * Trajectoire de la bille dans le repère de la roue (p ∈ [0, 1] : avancement de l'animation, rot : angle de la roue).
 * L'angle relatif part de rel0 et décroît (sens inverse de la roue) jusqu'à relEnd, centre de la case du numéro tiré,
 * atteint à 85 % ; le rayon passe de la piste (0,93) aux cases (0,62) avec des rebonds amortis.
 */
export function rouletteBall(p: number, rel0: number, relEnd: number, rot: number): { a: number; r: number } {
  const seg = TAU / 37;
  const q = Math.min(1, p / 0.85), e = 1 - Math.pow(1 - q, 2.6);
  let rel = rel0 + (relEnd - rel0) * e;
  let r = 0.93;
  if (p > 0.55) {
    const d = Math.min(1, (p - 0.55) / 0.3);
    const hop = Math.abs(Math.sin(d * Math.PI * 3.5)) * 0.07 * (1 - d);
    r = 0.93 - 0.31 * d + hop;
    rel += Math.sin(d * Math.PI * 5) * seg * 0.6 * (1 - d) * (1 - d);
  }
  return { a: rot + rel, r };
}

/** Centre (angle relatif à la roue) de la case d'un numéro. */
export const pocketAngle = (n: number): number => -Math.PI / 2 + WHEEL_ORDER.indexOf(n) * (TAU / 37) + TAU / 74;
