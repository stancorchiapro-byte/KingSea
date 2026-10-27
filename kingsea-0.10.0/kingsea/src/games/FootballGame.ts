// Football d'arcade : 10 tirs au but face à un gardien qui plonge.
// Glisse vers le but : la direction vise à gauche ou à droite, la longueur du geste règle la hauteur.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { ArcadeCard } from './arcade';
import { aimFromSwipe, applyError, keeperDive, shotOutcome, SHOTS_PER_GAME, type ShotOutcome } from './logic/football';
import { secureRandom } from './logic/rng';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawPill } from './widgets';

const LABELS: Record<ShotOutcome, string> = { goal: 'BUT !', saved: 'Arrêt du gardien', post: 'Poteau !', bar: 'Barre transversale !', wide: 'À côté', over: 'Au-dessus' };

export class FootballGame implements MiniGame {
  readonly id = 'football';
  readonly title = 'Football — tirs au but';
  readonly bg: [string, string] = ['#0f3a1a', '#041008'];
  readonly rules =
    '10 tirs au but.\n• Pose le doigt sous le ballon et glisse vers le but : la direction du geste vise à gauche ou à droite.\n' +
    '• Geste court : tir à ras de terre. Geste long : tir en hauteur (trop long : au-dessus !).\n• Le gardien devine de mieux en mieux. Les lucarnes sont imparables mais risquées.\n' +
    'Récompense : 2 KSCoins par but, +5 à partir de 8 buts (plafond quotidien commun).';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private startBtn!: Button;
  private card!: ArcadeCard;
  private phase: 'ready' | 'aim' | 'shot' | 'over' = 'ready';
  private results: ShotOutcome[] = [];
  private shot: { tx: number; ty: number; dive: number; t: number; outcome: ShotOutcome } | null = null;
  private goal = { cx: 0, bottom: 0, w: 0, h: 0 };
  private ballHome = { x: 0, y: 0, r: 0 };
  private drag: { id: number; sx: number; sy: number; x: number; y: number } | null = null;
  private handler: PointerHandler = { onDown: (p) => this.down(p), onMove: (p) => this.move(p), onUp: (p, c) => this.up(p, c) };

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.startBtn = makeButton({ id: 'start', label: 'Commencer', style: 'gold', fontSize: 18, onTap: () => this.start() });
    this.layer.buttons = [this.startBtn];
    this.card = new ArcadeCard(host.s, 'football', this.title);
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const w = Math.min(a.w * 0.62, a.h * 1.4);
    this.goal = { cx: a.x + a.w / 2, bottom: a.y + a.h * 0.5, w, h: w * 0.34 };
    this.ballHome = { x: a.x + a.w / 2, y: a.y + a.h * 0.86, r: 16 * ui };
    this.card.place(a, ui, this.startBtn);
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }
  canQuit() { return { ok: true as const }; }

  private start(): void { this.results = []; this.phase = 'aim'; this.shot = null; this.startBtn.visible = false; }

  private down(p: PointerInfo): boolean {
    if (this.phase !== 'aim' || p.y < this.goal.bottom) return false;
    this.drag = { id: p.id, sx: p.x, sy: p.y, x: p.x, y: p.y };
    return true;
  }
  private move(p: PointerInfo): void { if (this.drag?.id === p.id) { this.drag.x = p.x; this.drag.y = p.y; } }
  private up(p: PointerInfo, cancelled: boolean): void {
    const d = this.drag; this.drag = null;
    if (!d || cancelled || this.phase !== 'aim') return;
    const dx = p.x - d.sx, dy = p.y - d.sy, a = this.host.area;
    if (dy > -20 * this.host.vp.ui) return;
    // Prolonge le geste jusqu'à la ligne de but pour trouver la direction
    const G = this.goal, B = this.ballHome;
    const xAtGoal = B.x + dx * ((B.y - G.bottom) / -dy);
    const aim = aimFromSwipe((xAtGoal - G.cx) / (G.w / 2), Math.hypot(dx, dy) / a.h);
    const t = applyError(aim, secureRandom);
    const dive = keeperDive(t, this.results.length, secureRandom);
    this.shot = { tx: t.x, ty: t.y, dive, t: 0, outcome: shotOutcome(t, dive) };
    this.phase = 'shot';
    this.host.s.audio.knock(1);
  }

  update(dt: number): void {
    const s = this.host.s, sh = this.shot;
    if (this.phase === 'shot' && sh) {
      const before = sh.t;
      sh.t += dt;
      if (before < 0.5 && sh.t >= 0.5) {
        if (sh.outcome === 'goal') { s.audio.coin(); s.audio.cheer(); } else if (sh.outcome === 'post' || sh.outcome === 'bar') s.audio.knock(1); else s.audio.lose();
      }
      if (sh.t > 1.5) {
        this.results.push(sh.outcome); this.shot = null;
        if (this.results.length >= SHOTS_PER_GAME) {
          const goals = this.results.filter((r) => r === 'goal').length;
          this.card.finish(goals, goals > 1 ? 'buts' : 'but');
          this.phase = 'over'; this.startBtn.label = 'Rejouer'; this.startBtn.visible = true;
        } else this.phase = 'aim';
      }
    }
  }

  /** Point du but (repère -1..1 / 0..1) en coordonnées écran. */
  private goalPt(x: number, y: number) { const G = this.goal; return { x: G.cx + x * (G.w / 2), y: G.bottom - y * G.h }; }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, a = this.host.area, G = this.goal;
    // Pelouse
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#2f7a3a' : '#2a6e34'; ctx.fillRect(a.x, G.bottom - G.h * 0.3 + i * ((a.y + a.h - G.bottom) / 7), a.w, (a.y + a.h - G.bottom) / 7 + 1); }
    ctx.fillStyle = '#123d1c'; ctx.fillRect(a.x, a.y, a.w, G.bottom - G.h * 0.3 - a.y);
    // Filet et cadre
    const tl = this.goalPt(-1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(tl.x, tl.y, G.w, G.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    for (let i = 1; i < 16; i++) { ctx.beginPath(); ctx.moveTo(tl.x + (i * G.w) / 16, tl.y); ctx.lineTo(tl.x + (i * G.w) / 16, G.bottom); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(tl.x, tl.y + (i * G.h) / 6); ctx.lineTo(tl.x + G.w, tl.y + (i * G.h) / 6); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * ui; ctx.beginPath(); ctx.moveTo(tl.x, G.bottom); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tl.x + G.w, tl.y); ctx.lineTo(tl.x + G.w, G.bottom); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, G.bottom); ctx.lineTo(a.x + a.w, G.bottom); ctx.stroke();
    // Gardien
    const sh = this.shot;
    const k = sh ? Math.min(1, Math.max(0, (sh.t - 0.08) / 0.4)) : 0;
    const kx = sh ? sh.dive * k : Math.sin(performance.now() / 500) * 0.08;
    const lean = sh ? sh.dive * k * 1.1 : 0;
    const kp = this.goalPt(kx, 0), kh = G.h * 0.62, kw = kh * 0.32;
    ctx.save(); ctx.translate(kp.x, kp.y - (sh ? Math.abs(sh.dive) * k * G.h * 0.12 : 0)); ctx.rotate(lean);
    ctx.fillStyle = '#ffd166'; roundRect(ctx, -kw / 2, -kh * 0.82, kw, kh * 0.5, kw * 0.2); ctx.fill(); // maillot
    ctx.fillStyle = '#1b1b2f'; ctx.fillRect(-kw / 2, -kh * 0.34, kw * 0.42, kh * 0.34); ctx.fillRect(kw * 0.08, -kh * 0.34, kw * 0.42, kh * 0.34);
    ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(0, -kh * 0.9, kw * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = kw * 0.22; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-kw / 2, -kh * 0.75); ctx.lineTo(-kw * 1.3, -kh * 1.05); ctx.moveTo(kw / 2, -kh * 0.75); ctx.lineTo(kw * 1.3, -kh * 1.05); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#59e3a7'; for (const sx of [-1.3, 1.3]) { ctx.beginPath(); ctx.arc(sx * kw, -kh * 1.05, kw * 0.18, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // Ballon
    const B = this.ballHome;
    let bx = B.x, by = B.y, br = B.r;
    if (sh) {
      const u = Math.min(1, sh.t / 0.5), e = 1 - (1 - u) * (1 - u);
      const out = sh.outcome === 'wide' || sh.outcome === 'over';
      const tgt = this.goalPt(sh.tx, sh.ty);
      let tx = tgt.x, ty = tgt.y;
      if (sh.outcome === 'saved' && sh.t > 0.5) { tx += (sh.t - 0.5) * 120 * Math.sign(sh.tx - sh.dive || 1); ty += (sh.t - 0.5) * 80; }
      if ((sh.outcome === 'post' || sh.outcome === 'bar') && sh.t > 0.5) { ty += (sh.t - 0.5) * 160; tx -= (sh.t - 0.5) * 80 * Math.sign(sh.tx); }
      bx = B.x + (tx - B.x) * e; by = B.y + (ty - B.y) * e - Math.sin(Math.PI * u) * G.h * 0.3 * (out ? 1.2 : 0.6);
      br = B.r * (1 - 0.5 * e);
    }
    if (this.phase !== 'over' && this.phase !== 'ready' || sh) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bx, B.y + B.r * 0.9 - (B.y - by) * 0.1, br, br * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b2f'; ctx.beginPath(); ctx.arc(bx, by, br * 0.35, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2 + (sh ? sh.t * 12 : 0); ctx.beginPath(); ctx.arc(bx + Math.cos(ang) * br * 0.75, by + Math.sin(ang) * br * 0.75, br * 0.18, 0, Math.PI * 2); ctx.fill(); }
    }
    if (this.drag) {
      ctx.strokeStyle = 'rgba(255,209,102,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(B.x + (this.drag.x - this.drag.sx), B.y + (this.drag.y - this.drag.sy)); ctx.stroke(); ctx.setLineDash([]);
    }
    // Résultats
    for (let i = 0; i < SHOTS_PER_GAME; i++) {
      const r = this.results[i];
      ctx.fillStyle = r === undefined ? 'rgba(255,255,255,0.2)' : r === 'goal' ? PAL.success : PAL.danger;
      ctx.beginPath(); ctx.arc(a.x + 20 * ui + i * 20 * ui, a.y + a.h - 14 * ui, 7 * ui, 0, Math.PI * 2); ctx.fill();
    }
    const goals = this.results.filter((r) => r === 'goal').length;
    drawPill(ctx, `Buts ${goals} / ${this.results.length}`, a.x + a.w - 70 * ui, a.y + a.h - 14 * ui, 14 * ui, 'rgba(0,0,0,0.6)', PAL.goldLight);
    if (sh && sh.t > 0.5) drawPill(ctx, LABELS[sh.outcome], G.cx, G.bottom + 30 * ui, 18 * ui, sh.outcome === 'goal' ? 'rgba(46,139,87,0.9)' : 'rgba(14,11,16,0.9)', '#fff');
    if (this.phase === 'aim' && !this.drag && this.results.length === 0) drawPill(ctx, 'Glisse du ballon vers le but — geste long = tir haut', G.cx, G.bottom + 30 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text, a.w - 16 * ui);
    if (this.phase === 'ready' || this.phase === 'over') this.card.render(ctx, ui, this.phase === 'over');
    this.layer.render(ctx, ui);
  }
}
