// Skee-Ball : 9 boules à faire rouler sur la rampe jusqu'aux trous de la cible.
// Tire le doigt vers le haut : la longueur du geste donne la force (donc la hauteur atteinte), l'inclinaison la visée.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { clamp } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { ArcadeCard } from './arcade';
import { CORNER_R, SKEE_BALLS, SKEE_CENTER, SKEE_CORNERS, SKEE_RINGS, skeeLanding, skeeScoreAt } from './logic/skeeball';
import { secureRandom } from './logic/rng';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const ROLL = 0.6, FLY = 0.35, SHOW = 0.7;

export class SkeeBallGame implements MiniGame {
  readonly id = 'skeeball';
  readonly title = 'Skee-Ball';
  readonly bg: [string, string] = ['#2a1406', '#0c0602'];
  readonly rules =
    '9 boules. Pose le doigt sur la boule et glisse vers le haut, puis relâche.\n• Geste court : la boule s’arrête bas sur la cible ; geste long : elle monte plus haut.\n' +
    '• Incline le geste pour viser à gauche ou à droite.\n• Anneaux : 10, 20, 30, 40, 50 au centre ; les deux petits trous du haut valent 100.\nRécompense : 1 KSCoin pour 25 points (plafond quotidien commun).';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private startBtn!: Button;
  private card!: ArcadeCard;
  private phase: 'ready' | 'aim' | 'roll' | 'over' = 'ready';
  private left = SKEE_BALLS;
  private score = 0;
  private throwsLog: number[] = [];
  private roll: { aim: number; land: { x: number; y: number }; pts: number; t: number } | null = null;
  private drag: { id: number; sx: number; sy: number; x: number; y: number } | null = null;
  private board = { x: 0, y: 0, w: 0, h: 0 };
  private lane = { topY: 0, botY: 0, topW: 0, botW: 0, cx: 0 };
  private handler: PointerHandler = { onDown: (p) => this.down(p), onMove: (p) => this.move(p), onUp: (p, c) => this.up(p, c) };

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.startBtn = makeButton({ id: 'start', label: 'Commencer', style: 'gold', fontSize: 18, onTap: () => this.start() });
    this.layer.buttons = [this.startBtn];
    this.card = new ArcadeCard(host.s, 'skeeball', this.title);
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const bw = Math.min(a.h * 0.42 * 2, a.w * 0.55), bh = bw / 2;
    this.board = { x: a.x + (a.w - bw) / 2, y: a.y + 4 * ui, w: bw, h: bh };
    this.lane = { topY: a.y + bh + 4 * ui, botY: a.y + a.h, topW: bw * 0.7, botW: Math.min(a.w * 0.5, bw * 1.3), cx: a.x + a.w / 2 };
    this.card.place(a, ui, this.startBtn);
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }
  canQuit() { return { ok: true as const }; }

  private start(): void { this.left = SKEE_BALLS; this.score = 0; this.throwsLog = []; this.phase = 'aim'; this.startBtn.visible = false; }

  private down(p: PointerInfo): boolean {
    if (this.phase !== 'aim' || p.y < this.lane.topY) return false;
    this.drag = { id: p.id, sx: p.x, sy: p.y, x: p.x, y: p.y };
    return true;
  }
  private move(p: PointerInfo): void { if (this.drag?.id === p.id) { this.drag.x = p.x; this.drag.y = p.y; } }
  private up(p: PointerInfo, cancelled: boolean): void {
    const d = this.drag; this.drag = null;
    if (!d || cancelled || this.phase !== 'aim') return;
    const dx = p.x - d.sx, dy = p.y - d.sy;
    if (dy > -15 * this.host.vp.ui) return;
    const power = clamp(-dy / (this.host.area.h * 0.55), 0, 1.2);
    const aim = clamp((dx / -dy) * 1.6, -1, 1);
    const land = skeeLanding(power, aim, secureRandom() * 2 - 1, secureRandom() * 2 - 1);
    this.roll = { aim, land, pts: skeeScoreAt(land.x, land.y), t: 0 };
    this.phase = 'roll'; this.left--;
    this.host.s.audio.roll();
  }

  update(dt: number): void {
    const r = this.roll, s = this.host.s;
    if (this.phase !== 'roll' || !r) return;
    const before = r.t; r.t += dt;
    if (before < ROLL + FLY && r.t >= ROLL + FLY) { if (r.pts > 0) s.audio.coin(); else s.audio.knock(0.4); this.score += r.pts; this.throwsLog.push(r.pts); }
    if (r.t > ROLL + FLY + SHOW) {
      this.roll = null;
      if (this.left <= 0) {
        this.phase = 'over';
        this.card.finish(this.score, 'points');
        this.startBtn.label = 'Rejouer'; this.startBtn.visible = true;
      } else this.phase = 'aim';
    }
  }

  private bpt(x: number, y: number) { const B = this.board; return { x: B.x + (x + 1) / 2 * B.w, y: B.y + (1 - y) * B.h }; }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, B = this.board, L = this.lane, a = this.host.area;
    // Cible
    roundRect(ctx, B.x - 6, B.y - 4, B.w + 12, B.h + 8, 10 * ui); ctx.fillStyle = '#5a2d0c'; ctx.fill();
    ctx.fillStyle = '#c8954e'; ctx.fillRect(B.x, B.y, B.w, B.h);
    const sc = B.w / 2, c = this.bpt(SKEE_CENTER.x, SKEE_CENTER.y);
    const ringCols = ['#ffd166', '#ff3fa4', '#6ff3ff', '#7b4dff', '#59e3a7'];
    for (let i = SKEE_RINGS.length - 1; i >= 0; i--) {
      const [r] = SKEE_RINGS[i];
      ctx.fillStyle = i % 2 ? '#a8763a' : '#8a5a26'; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * sc, r * B.h, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ringCols[i]; ctx.lineWidth = 2 * ui; ctx.stroke();
    }
    ctx.fillStyle = '#1a0d04'; ctx.beginPath(); ctx.ellipse(c.x, c.y, SKEE_RINGS[0][0] * sc * 0.55, SKEE_RINGS[0][0] * B.h * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    SKEE_RINGS.forEach(([r, pts], i) => {
      const inner = i ? SKEE_RINGS[i - 1][0] : 0;
      drawLabel(ctx, String(pts), c.x, c.y + (i ? (r + inner) / 2 : r * 0.78) * B.h, Math.max(9, 11 * ui), '#fff');
    });
    for (const k of SKEE_CORNERS) {
      const p = this.bpt(k.x, k.y);
      ctx.fillStyle = '#1a0d04'; ctx.beginPath(); ctx.ellipse(p.x, p.y, CORNER_R * sc, CORNER_R * B.h, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PAL.goldLight; ctx.lineWidth = 2 * ui; ctx.stroke();
      drawLabel(ctx, '100', p.x, p.y + CORNER_R * B.h + 8 * ui, 10 * ui, PAL.goldLight);
    }
    // Rampe en perspective
    ctx.fillStyle = '#7a4a1c';
    ctx.beginPath(); ctx.moveTo(L.cx - L.topW / 2, L.topY); ctx.lineTo(L.cx + L.topW / 2, L.topY); ctx.lineTo(L.cx + L.botW / 2, L.botY); ctx.lineTo(L.cx - L.botW / 2, L.botY); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 1; i < 6; i++) { const u = i / 6, y = L.topY + (L.botY - L.topY) * u; ctx.fillRect(L.cx - (L.topW + (L.botW - L.topW) * u) / 2, y, L.topW + (L.botW - L.topW) * u, 1); }
    // Boule
    const home = { x: L.cx, y: L.botY - 26 * ui };
    const r = this.roll, R = 13 * ui;
    if (r) {
      const land = this.bpt(r.land.x, r.land.y);
      let x: number, y: number, rad: number;
      if (r.t < ROLL) { const u = r.t / ROLL; y = home.y + (L.topY - home.y) * u; x = L.cx + r.aim * (L.topW / 2) * u * 0.8; rad = R * (1 - 0.4 * u); }
      else if (r.t < ROLL + FLY) { const u = (r.t - ROLL) / FLY, sx = L.cx + r.aim * L.topW * 0.4; x = sx + (land.x - sx) * u; y = L.topY + (land.y - L.topY) * u - Math.sin(Math.PI * u) * 30 * ui; rad = R * 0.6; }
      else { x = land.x; y = land.y; rad = R * 0.6 * Math.max(0.2, 1 - (r.t - ROLL - FLY) * 2); }
      ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      if (r.t >= ROLL + FLY) drawPill(ctx, r.pts ? `+${r.pts}` : 'Rigole', land.x, land.y - 22 * ui, 15 * ui, r.pts ? 'rgba(46,139,87,0.9)' : 'rgba(192,57,43,0.85)', '#fff');
    } else if (this.phase === 'aim') {
      ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(home.x, home.y, R, 0, Math.PI * 2); ctx.fill();
      if (this.drag) {
        ctx.strokeStyle = 'rgba(255,209,102,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(home.x, home.y); ctx.lineTo(home.x + (this.drag.x - this.drag.sx), home.y + (this.drag.y - this.drag.sy)); ctx.stroke(); ctx.setLineDash([]);
        const power = clamp(-(this.drag.y - this.drag.sy) / (a.h * 0.55), 0, 1.2);
        roundRect(ctx, a.x + a.w - 34 * ui, L.topY, 14 * ui, L.botY - L.topY - 10 * ui, 6 * ui); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
        const ph = (L.botY - L.topY - 10 * ui) * power / 1.2;
        ctx.fillStyle = power > 1 ? PAL.danger : PAL.goldLight; ctx.fillRect(a.x + a.w - 32 * ui, L.botY - 10 * ui - ph, 10 * ui, ph);
      }
    }
    drawPill(ctx, `Score ${this.score}`, a.x + 60 * ui, a.y + 20 * ui, 15 * ui, 'rgba(0,0,0,0.6)', PAL.goldLight);
    drawPill(ctx, `Boules ${this.left}`, a.x + 60 * ui, a.y + 50 * ui, 13 * ui, 'rgba(0,0,0,0.5)', PAL.text);
    this.throwsLog.forEach((v, i) => drawLabel(ctx, String(v), a.x + a.w - 24 * ui, a.y + 16 * ui + i * 18 * ui, 12 * ui, v >= 50 ? PAL.goldLight : PAL.textDim));
    if (this.phase === 'ready') drawPill(ctx, 'Glisse la boule vers le haut : plus le geste est long, plus elle monte', L.cx, L.topY + 30 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text, this.host.area.w - 16 * ui);
    if (this.phase === 'ready' || this.phase === 'over') this.card.render(ctx, ui, this.phase === 'over');
    this.layer.render(ctx, ui);
  }
}
