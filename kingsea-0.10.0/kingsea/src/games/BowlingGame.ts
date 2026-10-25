// Bowling tactile : glisse la boule pour la placer, tire-la vers l'arrière comme une fronde puis relâche.
// La direction et la force dépendent du geste. Physique : logic/physics.ts ; score : logic/bowling.ts.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { clamp } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { frameMarks, gameState, scoreFrames, totalScore } from './logic/bowling';
import { allStopped, stepWorld, type Disc } from './logic/physics';
import { finishArcade } from './arcade';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const LANE = 600, HALF = 46, GUTTER = 10;
const PIN_R = 5, BALL_R = 9;
const HEAD_X = 520, ROW = 11, SPACING = 12;

function pinSpots(): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) out.push({ x: HEAD_X + row * ROW, y: (k - row / 2) * SPACING });
  return out;
}
const SPOTS = pinSpots();

type Phase = 'aim' | 'rolling' | 'settling' | 'over';

export class BowlingGame implements MiniGame {
  readonly id = 'bowling';
  readonly title = 'Bowling';
  readonly bg: [string, string] = ['#1a1238', '#07040f'];
  readonly rules =
    '10 frames, 2 lancers par frame (3 possibles à la 10e).\n• Glisse la boule vers le haut ou le bas pour la placer.\n' +
    '• Tire-la vers la gauche puis relâche : plus tu tires, plus elle va vite. L’angle du geste donne la direction.\n' +
    '• Strike (X) : 10 + les 2 lancers suivants. Spare (/) : 10 + le lancer suivant.\nRécompense : 1 KSCoin pour 5 points (plafond quotidien commun aux mini-jeux).';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private againBtn!: Button;
  private rolls: number[] = [];
  private pins: Disc[] = [];
  private standingBefore = new Set<number>();
  private ball: Disc = { id: 99, x: 40, y: 0, vx: 0, vy: 0, r: BALL_R, m: 7, active: true };
  private inGutter = false;
  private phase: Phase = 'aim';
  private settleT = 0;
  private aim: { id: number; sx: number; sy: number; x: number; y: number; placing: boolean } | null = null;
  private view = { x: 0, y: 0, s: 1 };
  private sheet = { x: 0, y: 0, w: 0, h: 0 };
  private message = 'Tire la boule vers la gauche, vise, relâche !';
  private result: string | null = null;
  private handler: PointerHandler;
  private hitSound = 0;
  /** Position de repos de chaque quille pour ce rack. */
  private rest: Array<{ x: number; y: number }> = [];

  constructor() {
    this.handler = { onDown: (p) => this.down(p), onMove: (p) => this.move(p), onUp: (p) => this.up(p) };
  }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.againBtn = makeButton({ id: 'again', label: 'Rejouer', style: 'gold', fontSize: 17, visible: false, onTap: () => this.reset() });
    this.layer.buttons = [this.againBtn];
    this.reset();
  }

  private reset(): void {
    this.rolls = []; this.result = null; this.phase = 'aim';
    this.againBtn.visible = false;
    this.rackAll();
    this.resetBall();
    this.message = 'Tire la boule vers la gauche, vise, relâche !';
  }

  /** Quilles légèrement irrégulières (position, poids) : chaque lancer est différent, le strike se mérite. */
  private rackAll(): void {
    const j = () => (Math.random() - 0.5) * 1.6;
    this.pins = SPOTS.map((p, i) => ({ id: i, x: p.x + j(), y: p.y + j(), vx: 0, vy: 0, r: PIN_R, m: 1.4 + Math.random() * 0.6, active: true }));
    this.rest = this.pins.map((p) => ({ x: p.x, y: p.y }));
  }

  private resetBall(): void {
    this.ball = { id: 99, x: 40, y: this.ball?.y && Math.abs(this.ball.y) < HALF - BALL_R ? this.ball.y : 0, vx: 0, vy: 0, r: BALL_R, m: 7, active: true };
    this.inGutter = false;
    this.standingBefore = new Set(this.pins.filter((p) => p.active).map((p) => p.id));
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const sheetH = 58 * ui;
    this.sheet = { x: a.x, y: a.y, w: a.w, h: sheetH };
    const avH = a.h - sheetH - 20 * ui;
    const s = Math.min(a.w / (LANE + 40), avH / (HALF * 2 + GUTTER * 2 + 20));
    this.view = { x: a.x + (a.w - LANE * s) / 2, y: a.y + sheetH + 10 * ui + avH / 2, s };
    Object.assign(this.againBtn, { x: a.x + a.w / 2 - 100 * ui, y: a.y + a.h - 60 * ui, w: 200 * ui, h: 54 * ui });
  }

  handlers(): PointerHandler[] { return [this.handler, this.layer]; }
  canQuit() { return { ok: true as const }; }

  private toWorld(px: number, py: number) { return { x: (px - this.view.x) / this.view.s, y: (py - this.view.y) / this.view.s }; }
  private toScreen(x: number, y: number) { return { x: this.view.x + x * this.view.s, y: this.view.y + y * this.view.s }; }

  private down(p: PointerInfo): boolean {
    if (this.phase !== 'aim') return false;
    const w = this.toWorld(p.x, p.y);
    if (w.x > 200 || Math.abs(w.y) > HALF + 40) return false; // zone de lancer (premier tiers de la piste)
    this.aim = { id: p.id, sx: p.x, sy: p.y, x: p.x, y: p.y, placing: true };
    return true;
  }

  private move(p: PointerInfo): void {
    if (!this.aim || this.aim.id !== p.id) return;
    this.aim.x = p.x; this.aim.y = p.y;
    const dx = (p.x - this.aim.sx) / this.view.s;
    if (this.aim.placing && dx < -12) this.aim.placing = false;
    if (this.aim.placing) {
      // Placement latéral de la boule
      this.ball.y = clamp(this.toWorld(p.x, p.y).y, -HALF + BALL_R, HALF - BALL_R);
    }
  }

  private up(p: PointerInfo): void {
    if (!this.aim || this.aim.id !== p.id) return;
    const a = this.aim; this.aim = null;
    if (a.placing) return;
    const dx = (a.sx - p.x) / this.view.s, dy = (a.sy - p.y) / this.view.s;
    const pull = Math.hypot(dx, dy);
    if (pull < 18 || dx <= 0) { this.message = 'Tire davantage vers la gauche pour lancer.'; return; }
    const angle = clamp(Math.atan2(dy, dx), -0.2, 0.2);
    const power = clamp(pull / 140, 0.25, 1);
    const speed = 240 + power * 420;
    this.ball.vx = Math.cos(angle) * speed; this.ball.vy = Math.sin(angle) * speed;
    this.phase = 'rolling';
    this.message = '';
    this.host.s.audio.roll();
  }

  update(dt: number): void {
    if (this.phase !== 'rolling' && this.phase !== 'settling') return;
    const discs = [this.ball, ...this.pins];
    // Gouttière : la boule n'interagit plus avec les quilles
    if (!this.inGutter && Math.abs(this.ball.y) > HALF) { this.inGutter = true; this.ball.vy = 0; this.ball.y = Math.sign(this.ball.y) * (HALF + GUTTER / 2); }
    const before = this.pins.map((p) => Math.hypot(p.vx, p.vy));
    const world = this.inGutter ? this.pins : discs;
    stepWorld(world, dt, { friction: 0, restitution: 0.75, wallRestitution: 0.3, bounds: null, pockets: [] }, 6);
    if (this.inGutter) { this.ball.x += this.ball.vx * dt; }
    // Frottements distincts : la boule roule, les quilles glissent et s'arrêtent vite
    const fr = (d: Disc, f: number) => { const v = Math.hypot(d.vx, d.vy); if (v > 0) { const nv = Math.max(0, v - f * dt); d.vx *= nv / v; d.vy *= nv / v; } };
    fr(this.ball, 25);
    for (const p of this.pins) fr(p, 260);
    // Sons de choc
    this.hitSound -= dt;
    this.pins.forEach((p, i) => { if (Math.hypot(p.vx, p.vy) - before[i] > 60 && this.hitSound <= 0) { this.host.s.audio.pins(1); this.hitSound = 0.04; } });
    // Quilles tombées dans la fosse ou hors piste
    for (const p of this.pins) if (p.active && (p.x > LANE + 10 || Math.abs(p.y) > HALF + 4)) { p.active = false; p.vx = 0; p.vy = 0; }
    if (this.ball.x > LANE + 20) { this.ball.active = false; this.ball.vx = 0; this.ball.vy = 0; }

    if (this.phase === 'rolling' && (!this.ball.active || Math.hypot(this.ball.vx, this.ball.vy) < 5) && allStopped(this.pins, 3)) {
      this.phase = 'settling'; this.settleT = 0.6;
    }
    if (this.phase === 'settling') {
      this.settleT -= dt;
      if (this.settleT <= 0 && allStopped(this.pins, 3)) this.scoreRoll();
    }
  }

  private scoreRoll(): void {
    // Une quille compte comme tombée si elle a quitté la piste ou bougé de plus de 4 unités.
    let down = 0;
    for (const p of this.pins) {
      if (!this.standingBefore.has(p.id)) continue;
      const spot = this.rest[p.id];
      if (!p.active || Math.hypot(p.x - spot.x, p.y - spot.y) > 4) { down++; p.active = false; }
    }
    this.rolls.push(down);
    const st = gameState(this.rolls);
    const s = this.host.s;
    const all = down === this.standingBefore.size && down > 0;
    this.message = all ? (this.standingBefore.size === 10 ? 'STRIKE !' : 'SPARE !') : `${down} quille${down > 1 ? 's' : ''}`;
    if (this.message === 'STRIKE !' || this.message === 'SPARE !') { s.audio.win(); s.audio.cheer(); }
    if (st.over) { this.finishGame(); return; }
    // Nouvelle disposition : toutes les quilles si la frame recommence (ou bonus de la 10e), sinon les quilles restantes reprennent leur place.
    if (st.standing === 10) this.rackAll();
    else for (const p of this.pins) if (p.active) { p.x = this.rest[p.id].x; p.y = this.rest[p.id].y; p.vx = 0; p.vy = 0; }
    this.resetBall();
    this.phase = 'aim';
  }

  private finishGame(): void {
    const s = this.host.s, score = totalScore(this.rolls);
    this.phase = 'over';
    this.result = `Score final : ${finishArcade(s, 'bowling', score, 'points', (m) => (this.result = `Score final : ${m}`))}`;
    this.againBtn.visible = true;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, v = this.view, s = v.s;
    this.renderSheet(ctx, ui);
    // Piste
    const p0 = this.toScreen(0, -HALF - GUTTER);
    ctx.fillStyle = '#2b2150'; ctx.fillRect(p0.x, p0.y, LANE * s, (HALF + GUTTER) * 2 * s);
    const l0 = this.toScreen(0, -HALF);
    const wood = ctx.createLinearGradient(0, l0.y, 0, l0.y + HALF * 2 * s);
    wood.addColorStop(0, '#c8955a'); wood.addColorStop(0.5, '#e2b47a'); wood.addColorStop(1, '#c8955a');
    ctx.fillStyle = wood; ctx.fillRect(l0.x, l0.y, LANE * s, HALF * 2 * s);
    ctx.fillStyle = 'rgba(80,40,10,0.15)'; for (let i = 1; i < 14; i++) ctx.fillRect(l0.x, l0.y + (i * HALF * 2 * s) / 14, LANE * s, 0.8);
    // Ligne de faute et flèches
    ctx.fillStyle = '#c0392b'; ctx.fillRect(this.toScreen(80, 0).x, l0.y, 2, HALF * 2 * s);
    ctx.fillStyle = 'rgba(123,77,255,0.8)';
    for (let i = -2; i <= 2; i++) { const q = this.toScreen(200, i * 16); ctx.beginPath(); ctx.moveTo(q.x + 7 * s, q.y); ctx.lineTo(q.x, q.y - 3 * s); ctx.lineTo(q.x, q.y + 3 * s); ctx.fill(); }
    // Fosse
    const pit = this.toScreen(LANE, -HALF - GUTTER);
    ctx.fillStyle = '#05030c'; ctx.fillRect(pit.x, pit.y, 22 * s, (HALF + GUTTER) * 2 * s);
    // Quilles
    for (const p of this.pins) {
      if (!p.active) continue;
      const q = this.toScreen(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(q.x + 2 * s, q.y + 2 * s, p.r * s, p.r * s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.arc(q.x, q.y, p.r * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = Math.max(1, s * 1.4); ctx.beginPath(); ctx.arc(q.x, q.y, p.r * s * 0.55, 0, Math.PI * 2); ctx.stroke();
    }
    // Boule
    if (this.ball.active) {
      const b = this.toScreen(this.ball.x, this.ball.y);
      const g = ctx.createRadialGradient(b.x - 3 * s, b.y - 3 * s, 1, b.x, b.y, BALL_R * s);
      g.addColorStop(0, '#9b7bff'); g.addColorStop(1, '#3a1d8a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R * s, 0, Math.PI * 2); ctx.fill();
    }
    // Visée (fronde)
    if (this.aim && !this.aim.placing && this.phase === 'aim') {
      const dx = (this.aim.sx - this.aim.x) / s, dy = (this.aim.sy - this.aim.y) / s;
      const ang = clamp(Math.atan2(dy, dx), -0.2, 0.2), power = clamp(Math.hypot(dx, dy) / 140, 0.25, 1);
      const b = this.toScreen(this.ball.x, this.ball.y);
      ctx.strokeStyle = `rgba(255,${Math.round(255 - power * 180)},80,0.9)`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(ang) * 260 * s * power, b.y + Math.sin(ang) * 260 * s * power); ctx.stroke(); ctx.setLineDash([]);
      drawPill(ctx, `Force ${Math.round(power * 100)} %`, b.x, b.y - 30 * ui, 12 * ui, 'rgba(14,11,16,0.85)', PAL.text);
    } else if (this.phase === 'aim') {
      const b = this.toScreen(this.ball.x, this.ball.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R * s + 6 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    const a = this.host.area;
    if (this.result) drawPill(ctx, this.result, a.x + a.w / 2, a.y + a.h - 80 * ui, 14 * ui, 'rgba(14,11,16,0.9)', PAL.gold);
    else if (this.message) drawPill(ctx, this.message, a.x + a.w / 2, a.y + a.h - 18 * ui, 13 * ui, 'rgba(14,11,16,0.85)', PAL.text);
    this.layer.render(ctx, ui);
  }

  private renderSheet(ctx: CanvasRenderingContext2D, ui: number): void {
    const S = this.sheet, marks = frameMarks(this.rolls), scores = scoreFrames(this.rolls);
    const fw = S.w / 11;
    for (let f = 0; f < 10; f++) {
      const x = S.x + f * fw;
      const cur = gameState(this.rolls).frame === f && this.phase !== 'over';
      roundRect(ctx, x + 1, S.y, fw - 2, S.h, 6 * ui);
      ctx.fillStyle = cur ? 'rgba(229,181,74,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.strokeStyle = cur ? PAL.gold : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      drawLabel(ctx, String(f + 1), x + 9 * ui, S.y + 9 * ui, 9 * ui, PAL.textDim, 'center', 700);
      const m = marks[f] ?? [];
      drawLabel(ctx, m.join(' '), x + fw - 6 * ui, S.y + 13 * ui, 12 * ui, PAL.text, 'right', 800);
      const sc = scores[f];
      if (sc !== null && sc !== undefined && f < marks.length) drawLabel(ctx, String(sc), x + fw / 2, S.y + S.h - 15 * ui, 15 * ui, PAL.pearl, 'center', 900);
    }
    const tx = S.x + 10 * fw;
    roundRect(ctx, tx + 1, S.y, fw - 2, S.h, 6 * ui); ctx.fillStyle = 'rgba(229,181,74,0.2)'; ctx.fill();
    drawLabel(ctx, 'Total', tx + fw / 2, S.y + 12 * ui, 10 * ui, PAL.gold, 'center', 700);
    drawLabel(ctx, String(totalScore(this.rolls)), tx + fw / 2, S.y + S.h - 16 * ui, 17 * ui, PAL.text, 'center', 900);
  }
}
