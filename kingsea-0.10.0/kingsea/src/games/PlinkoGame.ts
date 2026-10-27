// Plinko : lâche une bille en haut de la pyramide ; elle rebondit sur 12 rangées de picots.
// Le chemin est tiré par l'autorité au lâcher (50/50 à chaque picot) ; l'animation suit exactement ce chemin,
// avec une chute accélérée, des rebonds amortis, des picots qui s'allument au contact et une arrivée animée.
// Plusieurs billes peuvent tomber en même temps (chacune est une mise distincte, réglée à part).
import { drawKSCoin, goldGradient, LUXE } from '../art/brand';
import { makeCanvas, roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { BetControl } from './casinoKit';
import { PLINKO_RISK_LABEL, PLINKO_ROWS, PLINKO_TABLES, plinkoRtp, plinkoSlot, type PlinkoRisk } from './logic/plinko';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const MAX_BALLS = 5;
const fmtM = (m: number) => String(m).replace('.', ',');
const RISKS: PlinkoRisk[] = ['low', 'medium', 'high'];

interface Ball { risk: PlinkoRisk; path: number[]; t: number; win: number; bet: number; steps: number[]; trail: Array<{ x: number; y: number }>; landed: number; hue: number }
interface Spark { x: number; y: number; vx: number; vy: number; t: number }

export class PlinkoGame implements MiniGame {
  readonly id = 'plinko';
  readonly tableGame = 'plinko';
  readonly title = 'Plinko';
  readonly bg: [string, string] = ['#1a0f1c', '#060407'];
  readonly currency = 'chips' as const;
  readonly rules = `Choisis ta mise et ton niveau de risque, puis « Lâcher ». La bille rebondit à gauche ou à droite sur chaque picot (une chance sur deux) et tombe dans une case : gain = mise × multiplicateur.\n` +
    `Tu peux lâcher jusqu’à ${MAX_BALLS} billes à la suite ; chacune est une mise séparée (1 à 100 jetons).\nLes bords rapportent gros mais sont rares.\n` +
    (['low', 'medium', 'high'] as PlinkoRisk[]).map((r) => `• ${PLINKO_RISK_LABEL[r]} : de ×${fmtM(Math.min(...PLINKO_TABLES[r]))} à ×${fmtM(Math.max(...PLINKO_TABLES[r]))}, retour théorique ${(plinkoRtp(r) * 100).toFixed(1).replace('.', ',')} %`).join('\n');

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private balls: Ball[] = [];
  private waiting = 0;
  private slotFlash = new Map<number, number>();
  private pegHits = new Map<string, number>();
  private sparks: Spark[] = [];
  private boardImg: { key: string; c: ReturnType<typeof makeCanvas> } | null = null;
  private message = 'Choisis ta mise et lâche la bille.';
  private board = { cx: 0, top: 0, dx: 0, dy: 0 };
  private dropBtn!: Button;
  private risk: PlinkoRisk = 'medium';
  private riskBtns: Button[] = [];
  private history: number[] = [];
  private t = 0;

  get holdBalance(): boolean { return this.balls.length > 0 || this.waiting > 0; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [5, 10, 25, 100], min: 1, initial: 10 });
    this.dropBtn = makeButton({ id: 'drop', label: 'Lâcher', style: 'gold', fontSize: 18, onTap: () => this.drop() });
    // Niveau de risque : modifiable quand aucune bille n'est en jeu (chaque bille garde le sien)
    this.riskBtns = RISKS.map((r) => makeButton({ id: `risk-${r}`, label: ({ low: 'Faible', medium: 'Moyen', high: 'Élevé' } as const)[r], style: 'secondary', fontSize: 13, onTap: () => { this.risk = r; host.s.audio.chip(); } }));
    this.layer.buttons = [...this.betCtl.buttons, this.dropBtn, ...this.riskBtns];
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui, ctrlH = this.betCtl.layout(a, ui, [[this.dropBtn, 200]]);
    const portrait = a.h > a.w, bh = Math.max(44, 40 * ui); // cible tactile ≥ 44 px
    const h = a.h - ctrlH - 30 * ui - (portrait ? bh + 26 * ui + 34 * ui : 0);
    const dy = h / (PLINKO_ROWS + 1.6), dx = Math.min(dy * 1.9, (a.w * 0.66) / (PLINKO_ROWS + 1));
    this.board = { cx: a.x + a.w / 2, top: a.y + (portrait ? 46 : 12) * ui, dx, dy };   // portrait : bande de message au-dessus
    // Boutons de risque : colonne à droite (paysage) ou ligne au-dessus des mises (portrait)
    const bw = Math.min(110 * ui, a.w * 0.26);
    this.riskBtns.forEach((b, i) => Object.assign(b, portrait
      ? { x: a.x + a.w - (3 - i) * (bw + 6 * ui), y: a.y + a.h - ctrlH - bh - 4 * ui, w: bw, h: bh }
      : { x: a.x + a.w - bw, y: a.y + 52 * ui + i * (bh + 6 * ui), w: bw, h: bh }));
  }

  handlers(): PointerHandler[] { return [this.layer]; }
  canQuit() { return this.balls.length || this.waiting ? { ok: false as const, reason: 'Attends que les billes arrivent' } : { ok: true as const }; }

  private async drop(): Promise<void> {
    const s = this.host.s, bet = this.betCtl.amount;
    if (this.balls.length + this.waiting >= MAX_BALLS) return;
    if (!s.chips.canAfford(bet)) { this.host.toasts.show('Pas assez de jetons', 'error'); s.audio.error(); return; }
    this.waiting++;
    const risk = this.risk;
    const r = await s.ask('casino', 'plinko', 'play', { bet, risk });
    this.waiting--;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    this.betCtl.remember(bet);
    // Durée de chaque rangée : légère accélération, avec un peu d'irrégularité (mouvement naturel)
    const steps: number[] = [];
    for (let i = 0; i < PLINKO_ROWS; i++) steps.push(0.2 - i * 0.004 + (Math.random() - 0.5) * 0.03);
    this.balls.push({ risk, path: r.view.path as number[], t: 0, win: r.payout, bet: r.stake, steps, trail: [], landed: -1, hue: Math.random() });
    s.audio.chip();
    this.message = '';
  }

  private pegPos(row: number, k: number): { x: number; y: number } {
    const B = this.board;
    return { x: B.cx + (k - row / 2) * B.dx, y: B.top + row * B.dy };
  }

  /** Position de la bille : chute accélérée de picot en picot, rebond amorti, puis arrivée dans la case. */
  private ballPos(b: Ball): { x: number; y: number; row: number } {
    const B = this.board;
    let t = b.t, i = 0, col = 0;
    while (i < PLINKO_ROWS && t > b.steps[i]) { t -= b.steps[i]; col += b.path[i]; i++; }
    if (i >= PLINKO_ROWS) {
      const p = this.pegPos(PLINKO_ROWS, col);
      const k = Math.min(1, t / 0.25);
      return { x: p.x, y: p.y + B.dy * (0.15 + 0.5 * k * k) - Math.sin(Math.min(1, t / 0.18) * Math.PI) * B.dy * 0.1, row: PLINKO_ROWS };
    }
    const f = t / b.steps[i];
    const p0 = this.pegPos(i, col), p1 = this.pegPos(i + 1, col + b.path[i]);
    // Rebond : petite remontée au contact, puis chute accélérée vers le picot suivant
    const bounce = Math.sin(Math.min(1, f / 0.45) * Math.PI) * B.dy * (0.32 - i * 0.01);
    const fall = f * f;
    const ex = f < 0.45 ? (f / 0.45) * 0.55 : 0.55 + ((f - 0.45) / 0.55) * 0.45;
    return { x: p0.x + (p1.x - p0.x) * ex, y: p0.y - B.dy * 0.42 + (p1.y - p0.y) * fall - bounce, row: i };
  }

  update(dt: number): void {
    const s = this.host.s;
    this.t += dt;
    for (const [k, v] of this.slotFlash) { if (v - dt <= 0) this.slotFlash.delete(k); else this.slotFlash.set(k, v - dt); }
    for (const [k, v] of this.pegHits) { if (v - dt <= 0) this.pegHits.delete(k); else this.pegHits.set(k, v - dt); }
    for (const sp of this.sparks) { sp.t += dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 260 * dt; }
    this.sparks = this.sparks.filter((sp) => sp.t < 0.8);
    for (const b of this.balls) {
      const before = this.ballPos(b).row;
      b.t += dt;
      const p = this.ballPos(b);
      b.trail.push({ x: p.x, y: p.y }); if (b.trail.length > 7) b.trail.shift();
      if (p.row !== before && before < PLINKO_ROWS) {
        let col = 0; for (let k = 0; k < before; k++) col += b.path[k];
        this.pegHits.set(`${before + 1}:${col + b.path[before]}`, 0.35);
        s.audio.plink(before);
      }
      const total = b.steps.reduce((x, y) => x + y, 0);
      if (b.landed < 0 && b.t >= total + 0.25) {
        const slot = plinkoSlot(b.path);
        b.landed = slot;
        this.slotFlash.set(slot, 1.4);
        const m = PLINKO_TABLES[b.risk][slot];
        this.history.unshift(m); this.history = this.history.slice(0, 8);
        const net = b.win - b.bet;
        this.message = `×${fmtM(m)} · mise ${b.bet} → ${b.win} jetons (${net >= 0 ? '+' : '−'}${Math.abs(net)})`;
        if (b.win >= b.bet * 3) this.host.celebrate(b.win - b.bet, b.bet, `×${fmtM(m)}`);
        if (b.win > b.bet) {
          if (b.win < b.bet * 3) s.audio.win();
          const B = this.board, x = B.cx + (slot - PLINKO_ROWS / 2) * B.dx, y = B.top + PLINKO_ROWS * B.dy + B.dy * 0.6;
          for (let i = 0; i < 12; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 140, t: 0 });
        } else if (b.win < b.bet) s.audio.lose();
        else s.audio.push();
      }
    }
    this.balls = this.balls.filter((b) => b.landed < 0 || b.t < b.steps.reduce((x, y) => x + y, 0) + 0.55);
    this.betCtl.sync();
    const busy = this.balls.length + this.waiting;
    this.dropBtn.enabled = busy < MAX_BALLS && s.chips.canAfford(this.betCtl.amount);
    for (const [i, b] of this.riskBtns.entries()) { b.active = RISKS[i] === this.risk; b.enabled = busy === 0; }
    this.dropBtn.label = busy ? `Lâcher · ${this.betCtl.amount} (${busy}/${MAX_BALLS})` : `Lâcher · ${this.betCtl.amount}`;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, B = this.board;
    // Plateau laqué en triangle et picots dorés : pré-rendus (78 picots à dégradé coûtaient cher à chaque image)
    const topY = B.top - B.dy * 0.9, botY = B.top + PLINKO_ROWS * B.dy + B.dy * 1.25, half = (PLINKO_ROWS / 2 + 1.1) * B.dx;
    const pr = Math.max(2, B.dx * 0.09);
    const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
    const bx0 = B.cx - half - 4, by0 = topY - 4, bw = half * 2 + 8, bh = botY - topY + 8;
    const key = `${B.cx},${B.top},${B.dx},${B.dy}@${dpr}`;
    if (this.boardImg?.key !== key) {
      const c = makeCanvas(Math.ceil(bw * dpr), Math.ceil(bh * dpr)), g = c.ctx;
      g.scale(dpr, dpr); g.translate(-bx0, -by0);
      g.beginPath(); g.moveTo(B.cx - B.dx * 1.2, topY); g.lineTo(B.cx + B.dx * 1.2, topY); g.lineTo(B.cx + half, botY); g.lineTo(B.cx - half, botY); g.closePath();
      const bg = g.createLinearGradient(0, topY, 0, botY); bg.addColorStop(0, 'rgba(40,30,44,0.92)'); bg.addColorStop(1, 'rgba(14,10,16,0.96)');
      g.fillStyle = bg; g.fill(); g.strokeStyle = goldGradient(g, B.cx - half, topY, B.cx + half, botY); g.lineWidth = 2; g.stroke();
      // Reflet de vitre en diagonale
      g.save(); g.clip();
      const gl = g.createLinearGradient(B.cx - half, topY, B.cx + half * 0.2, botY); gl.addColorStop(0, 'rgba(255,255,255,0.08)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(bx0, by0, bw, bh); g.restore();
      for (let r = 1; r <= PLINKO_ROWS; r++) for (let k = 0; k <= r; k++) {
        const p = this.pegPos(r, k), y = p.y - B.dy * 0.42;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(p.x + pr * 0.3, y + pr * 0.5, pr, 0, Math.PI * 2); g.fill();
        const pg = g.createRadialGradient(p.x - pr * 0.4, y - pr * 0.4, 0.5, p.x, y, pr * 1.2);
        pg.addColorStop(0, '#fff6d8'); pg.addColorStop(0.5, LUXE.gold); pg.addColorStop(1, LUXE.goldDark);
        g.fillStyle = pg; g.beginPath(); g.arc(p.x, y, pr, 0, Math.PI * 2); g.fill();
      }
      this.boardImg = { key, c };
    }
    ctx.drawImage(this.boardImg.c.canvas as CanvasImageSource, bx0, by0, bw, bh);
    // Picots qui viennent d'être touchés : halo lumineux
    for (const [id, hit] of this.pegHits) {
      const [r, k] = id.split(':').map(Number), p = this.pegPos(r, k), y = p.y - B.dy * 0.42;
      ctx.fillStyle = `rgba(255,236,170,${Math.min(1, hit * 1.6)})`; ctx.beginPath(); ctx.arc(p.x, y, pr * (1.6 + hit * 4), 0, Math.PI * 2); ctx.fill();
    }
    // Cases : du champagne (×0,5) au bordeaux profond (×16)
    const y = B.top + PLINKO_ROWS * B.dy + B.dy * 0.25, w = B.dx * 0.9;
    // Cases de la table du risque choisi (ou de la bille en jeu)
    const table = PLINKO_TABLES[this.balls[0]?.risk ?? this.risk];
    table.forEach((m, k) => {
      const x = B.cx + (k - PLINKO_ROWS / 2) * B.dx;
      const fl = this.slotFlash.get(k) ?? 0, pop = fl > 0 ? Math.sin(Math.min(1, (1.4 - fl) / 0.3) * Math.PI) * 6 * ui : 0;
      const heat = Math.min(1, Math.log2(m + 1) / 4.1);
      roundRect(ctx, x - w / 2, y - pop, w, B.dy * 0.95, 5 * ui);
      const c0 = `rgb(${Math.round(110 + 120 * heat)},${Math.round(70 + 90 * (1 - heat))},${Math.round(60 + 40 * (1 - heat))})`;
      ctx.fillStyle = fl > 0 ? goldGradient(ctx, x - w / 2, y, x + w / 2, y + B.dy) : c0; ctx.fill();
      ctx.strokeStyle = 'rgba(239,220,174,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      drawLabel(ctx, `×${String(m).replace('.', ',')}`, x, y + B.dy * 0.47 - pop, Math.min(11 * ui, w * 0.3), fl > 0 ? '#1a1208' : '#fff', 'center', 800);
    });
    // Billes : traînée, reflet
    for (const b of this.balls) {
      const p = this.ballPos(b), r = Math.max(4, B.dx * 0.24);
      b.trail.forEach((q, i) => { ctx.fillStyle = `rgba(255,120,170,${(i / b.trail.length) * 0.25})`; ctx.beginPath(); ctx.arc(q.x, q.y, r * (0.4 + i / b.trail.length * 0.5), 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x + r * 0.25, p.y + r * 0.35, r, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, 1, p.x, p.y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ff7fb0'); g.addColorStop(1, '#a3174e');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    for (const sp of this.sparks) { ctx.globalAlpha = 1 - sp.t / 0.8; drawKSCoin(ctx, sp.x, sp.y, 5 * ui, Math.cos(sp.t * 14)); }
    ctx.globalAlpha = 1;
    const a = this.host.area;
    this.history.forEach((m, i) => drawPill(ctx, `×${String(m).replace('.', ',')}`, a.x + 30 * ui, a.y + 14 * ui + i * 26 * ui, 11 * ui, m >= 1 ? 'rgba(89,227,167,0.3)' : 'rgba(255,107,107,0.25)', PAL.text));
    if (this.message) {
      const portrait = a.h > a.w;
      if (portrait) drawPill(ctx, this.message, a.x + a.w / 2 + 24 * ui, a.y + 20 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text, a.w - 64 * ui);
      else drawPill(ctx, this.message, a.x + a.w - 120 * ui, a.y + 20 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text, 236 * ui);
    }
    const rb = this.riskBtns[0];
    if (rb) drawLabel(ctx, 'Risque', a.h > a.w ? rb.x - 34 * ui : rb.x + rb.w / 2, a.h > a.w ? rb.y + rb.h / 2 : rb.y - 14 * ui, 12 * ui, PAL.textDim, 'center', 700);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
