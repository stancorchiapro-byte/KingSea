// Basket-ball d'arcade : 45 secondes pour marquer un maximum de paniers.
// Glisse le doigt vers le haut (et vers le panier) puis relâche : la direction et la longueur du geste donnent le tir.
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { ArcadeCard } from './arcade';
import { BASKET, shotOver, shotVelocity, stepBall, type Ball } from './logic/basket';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const DURATION = 45;
const B = BASKET;

interface Flying extends Ball { scored: boolean; t: number; pts: number }

export class BasketGame implements MiniGame {
  readonly id = 'basket';
  readonly title = 'Basket-ball d’arcade';
  readonly bg: [string, string] = ['#1a1238', '#07040f'];
  readonly rules =
    '45 secondes pour marquer un maximum de paniers.\n• Pose le doigt, glisse vers le haut en direction du panier, relâche : plus le geste est long, plus le tir est fort.\n' +
    '• Panier : 2 points, 3 points depuis la ligne lointaine. La position change après chaque panier.\n• Tu peux enchaîner les tirs sans attendre.\nRécompense : 1 KSCoin pour 3 points (plafond quotidien commun).';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private startBtn!: Button;
  private card!: ArcadeCard;
  private streak = 0;
  private bestStreak = 0;
  private phase: 'ready' | 'play' | 'over' = 'ready';
  private time = DURATION;
  private score = 0;
  private made = 0;
  private shots = 0;
  private balls: Flying[] = [];
  private startX = 110;
  private reload = 0;
  private view = { x: 0, y: 0, s: 1 };
  private drag: { id: number; x: number; y: number; sx: number; sy: number } | null = null;
  private popups: Array<{ x: number; y: number; t: number; text: string }> = [];
  private handler: PointerHandler = { onDown: (p) => this.down(p), onMove: (p) => this.move(p), onUp: (p, c) => this.up(p, c) };

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.startBtn = makeButton({ id: 'start', label: 'Commencer', style: 'gold', fontSize: 18, onTap: () => this.start() });
    this.layer.buttons = [this.startBtn];
    this.card = new ArcadeCard(host.s, 'basket', this.title);
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const s = Math.min(a.w / B.W, (a.h - 10 * ui) / B.H);
    this.view = { x: a.x + (a.w - B.W * s) / 2, y: a.y + (a.h - B.H * s) / 2, s };
    this.card.place(a, ui, this.startBtn);
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }
  canQuit() { return { ok: true as const }; }

  /** Compte à rebours, puis la partie démarre. */
  private start(): void { this.startBtn.visible = false; this.card.countdown(() => this.begin()); this.phase = 'ready'; }

  private begin(): void {
    this.streak = 0; this.bestStreak = 0;
    this.phase = 'play'; this.time = DURATION; this.score = 0; this.made = 0; this.shots = 0; this.balls = []; this.startX = 110;
    this.startBtn.visible = false;
  }

  private get ballPos() { return { x: this.startX, y: 200 }; }

  private down(p: PointerInfo): boolean {
    if (this.phase !== 'play') return false;
    this.drag = { id: p.id, x: p.x, y: p.y, sx: p.x, sy: p.y };
    return true;
  }
  private move(p: PointerInfo): void { if (this.drag && this.drag.id === p.id) { this.drag.x = p.x; this.drag.y = p.y; } }
  private up(p: PointerInfo, cancelled: boolean): void {
    const d = this.drag; this.drag = null;
    if (!d || cancelled || this.phase !== 'play' || this.reload > 0) return;
    const dx = (p.x - d.sx) / this.view.s, dy = (p.y - d.sy) / this.view.s;
    if (dy > -12) return; // geste trop court ou vers le bas : pas de tir
    const v = shotVelocity(dx, dy, 4);
    const pos = this.ballPos;
    this.balls.push({ x: pos.x, y: pos.y, vx: v.vx, vy: v.vy, scored: false, t: 0, pts: this.startX < 90 ? 3 : 2 });
    this.shots++; this.reload = 0.35;
    this.host.s.audio.tap();
  }

  update(dt: number): void {
    const s = this.host.s;
    this.card.update(dt);
    this.reload = Math.max(0, this.reload - dt);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1);
    if (this.phase === 'play') {
      this.time = Math.max(0, this.time - dt);
      for (const b of this.balls) {
        b.t += dt;
        const ev = stepBall(b, Math.min(dt, 1 / 30));
        if (ev.rim) s.audio.knock(0.5);
        if (ev.board) s.audio.knock(0.8);
        if (ev.scored && !b.scored) {
          // Série : à partir du 3e panier d'affilée, +1 point par panier
          this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
          const bonus = this.streak >= 3 ? 1 : 0;
          b.scored = true; this.score += b.pts + bonus; this.made++;
          this.popups.push({ x: B.rimFront.x + 19, y: B.rimFront.y - 20, t: 0, text: bonus ? `+${b.pts + bonus} · série ×${this.streak}` : `+${b.pts}` });
          s.audio.swish(); s.audio.coin();
          this.startX = 60 + Math.random() * 110;
        }
      }
      // Tir manqué : la série s'arrête
      for (const b of this.balls) if (!b.scored && (shotOver(b) || b.t >= 6)) this.streak = 0;
      this.balls = this.balls.filter((b) => !shotOver(b) && b.t < 6);
      if (this.time <= 0 && this.balls.length === 0) {
        this.phase = 'over';
        this.card.finish(this.score, 'points');
        this.startBtn.label = 'Rejouer'; this.startBtn.visible = true;
      }
    }
  }

  private X(x: number) { return this.view.x + x * this.view.s; }
  private Y(y: number) { return this.view.y + y * this.view.s; }

  private drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number): void {
    const r = B.BALL_R * this.view.s;
    ctx.save(); ctx.translate(this.X(x), this.Y(y)); ctx.rotate(rot);
    ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a3a0c'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, s = this.view.s;
    // Salle
    ctx.fillStyle = '#2b2150'; ctx.fillRect(this.X(0), this.Y(0), B.W * s, B.H * s);
    ctx.fillStyle = '#c8955a'; ctx.fillRect(this.X(0), this.Y(B.FLOOR), B.W * s, (B.H - B.FLOOR) * s);
    // Lignes de tir
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(this.X(90), this.Y(B.FLOOR), 2, (B.H - B.FLOOR) * s);
    drawLabel(ctx, '3 pts', this.X(60), this.Y(B.FLOOR + 5), 9 * ui, 'rgba(255,255,255,0.7)');
    // Panneau, arceau, filet
    ctx.fillStyle = '#f4efe6'; ctx.fillRect(this.X(B.board.x), this.Y(B.board.y0), 6 * s, (B.board.y1 - B.board.y0) * s);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.strokeRect(this.X(B.board.x) - 1, this.Y(75), 3, 25 * s);
    ctx.fillStyle = '#6b6b80'; ctx.fillRect(this.X(B.board.x + 6), this.Y(B.board.y0), 4 * s, (B.FLOOR - B.board.y0) * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) { const x0 = B.rimFront.x + (i / 6) * (B.rimBack.x - B.rimFront.x), x1 = B.rimFront.x + 8 + (i / 6) * (B.rimBack.x - B.rimFront.x - 16); ctx.beginPath(); ctx.moveTo(this.X(x0), this.Y(B.rimFront.y)); ctx.lineTo(this.X(x1), this.Y(B.rimFront.y + 26)); ctx.stroke(); }
    // Balles en vol (derrière l'arceau avant)
    for (const b of this.balls) this.drawBall(ctx, b.x, b.y, b.t * 8);
    ctx.strokeStyle = '#ff5c1a'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(this.X(B.rimFront.x), this.Y(B.rimFront.y)); ctx.lineTo(this.X(B.rimBack.x), this.Y(B.rimBack.y)); ctx.stroke();
    ctx.lineTo(this.X(B.board.x), this.Y(B.rimBack.y)); ctx.stroke();
    // Balle prête + visée
    if (this.phase === 'play' && this.reload <= 0) {
      const p = this.ballPos;
      this.drawBall(ctx, p.x, p.y, 0);
      if (this.drag) {
        const dx = this.drag.x - this.drag.sx, dy = this.drag.y - this.drag.sy;
        ctx.strokeStyle = 'rgba(255,209,102,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(this.X(p.x), this.Y(p.y)); ctx.lineTo(this.X(p.x) + dx * 0.6, this.Y(p.y) + dy * 0.6); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const p of this.popups) drawLabel(ctx, p.text, this.X(p.x), this.Y(p.y) - p.t * 30 * ui, 20 * ui, PAL.goldLight);
    // Tableau d'affichage
    drawPill(ctx, `Score ${this.score}`, this.X(70), this.Y(18), 15 * ui, 'rgba(0,0,0,0.6)', PAL.goldLight);
    drawPill(ctx, `⏱ ${Math.ceil(this.time)} s`, this.X(190), this.Y(18), 15 * ui, this.time < 10 && this.phase === 'play' ? 'rgba(192,57,43,0.8)' : 'rgba(0,0,0,0.6)', PAL.text);
    drawPill(ctx, `${this.made}/${this.shots}`, this.X(270), this.Y(18), 12 * ui, 'rgba(0,0,0,0.5)', PAL.textDim);
    if (this.streak >= 2 && this.phase === 'play') drawPill(ctx, `Série ${this.streak}${this.streak >= 3 ? ' · bonus +1' : ''}`, this.X(270), this.Y(42), 11 * ui, 'rgba(212,175,90,0.85)', '#1a1208');
    if ((this.phase === 'ready' && !this.card.counting) || this.phase === 'over') this.card.render(ctx, ui, this.phase === 'over');
    this.card.renderCountdown(ctx, this.host.area, ui);
    this.layer.render(ctx, ui);
  }
}
