// Tape-crabe : la version maritime du tape-taupe. Touche les crabes, évite les méduses.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { ArcadeCard } from './arcade';
import { MOLE_DURATION, MoleField, type Critter } from './logic/mole';
import { secureRandom } from './logic/rng';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

export class MoleGame implements MiniGame {
  readonly id = 'mole';
  readonly title = 'Tape-crabe';
  readonly bg: [string, string] = ['#0b3a2a', '#03100b'];
  readonly rules =
    '30 secondes. Des crabes sortent des trous : touche-les avant qu’ils ne se cachent !\n• Crabe rouge : +1 · crabe doré (rare et rapide) : +3.\n• Méduse : ne la touche pas (−2) !\nLe rythme accélère. Récompense : 1 KSCoin pour 2 points (plafond quotidien commun).';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private startBtn!: Button;
  private card!: ArcadeCard;
  private field: MoleField | null = null;
  private phase: 'ready' | 'play' | 'over' = 'ready';
  private holes: Array<{ x: number; y: number; r: number }> = [];
  private pops: Array<{ x: number; y: number; t: number; v: number }> = [];
  private t = 0;
  private handler: PointerHandler = { onDown: (p) => this.tap(p) };

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.startBtn = makeButton({ id: 'start', label: 'Commencer', style: 'gold', fontSize: 18, onTap: () => this.start() });
    this.layer.buttons = [this.startBtn];
    this.card = new ArcadeCard(host.s, 'mole', this.title);
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const top = a.y + 30 * ui, h = a.h - 36 * ui, cell = Math.min(h / 3, (a.w * 0.7) / 3);
    const x0 = a.x + (a.w - cell * 3) / 2;
    this.holes = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.holes.push({ x: x0 + c * cell + cell / 2, y: top + r * cell + cell * 0.62, r: cell * 0.36 });
    this.card.place(a, ui, this.startBtn);
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }
  canQuit() { return { ok: true as const }; }

  private start(): void { this.startBtn.visible = false; this.field = null; this.phase = 'ready'; this.card.countdown(() => { this.field = new MoleField(secureRandom); this.phase = 'play'; this.pops = []; }); }

  private tap(p: PointerInfo): boolean {
    if (this.phase !== 'play' || !this.field) return false;
    // Zone de toucher généreuse : le trou + la créature au-dessus
    const i = this.holes.findIndex((h) => Math.abs(p.x - h.x) < h.r * 1.25 && p.y > h.y - h.r * 1.9 && p.y < h.y + h.r * 0.7);
    if (i < 0) return true;
    const pts = this.field.hit(i);
    if (pts !== 0) {
      this.pops.push({ x: this.holes[i].x, y: this.holes[i].y - this.holes[i].r * 1.4, t: 0, v: pts });
      if (pts > 0) this.host.s.audio.coin(); else this.host.s.audio.error();
    } else this.host.s.audio.knock(0.3);
    return true;
  }

  update(dt: number): void {
    this.t += dt;
    this.card.update(dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.8);
    const f = this.field;
    if (this.phase === 'play' && f) {
      f.update(dt);
      if (f.over) {
        this.phase = 'over';
        this.card.finish(f.score, 'points');
        this.startBtn.label = 'Rejouer'; this.startBtn.visible = true;
      }
    }
  }

  private drawCritter(ctx: CanvasRenderingContext2D, c: Critter, x: number, y: number, r: number): void {
    const up = c.hit ? 1 - c.age / 0.25 : Math.min(1, c.age / 0.12, (c.life - c.age) / 0.12);
    const cy = y - r * 0.9 * Math.max(0, up);
    ctx.save();
    ctx.beginPath(); ctx.rect(x - r * 1.6, y - r * 3, r * 3.2, r * 3); ctx.clip(); // la créature sort du trou
    if (c.kind === 'jelly') {
      ctx.fillStyle = 'rgba(190,120,255,0.85)'; ctx.beginPath(); ctx.arc(x, cy, r * 0.7, Math.PI, 0); ctx.lineTo(x + r * 0.7, cy + r * 0.15); ctx.lineTo(x - r * 0.7, cy + r * 0.15); ctx.fill();
      ctx.strokeStyle = 'rgba(190,120,255,0.8)'; ctx.lineWidth = r * 0.08;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.25, cy + r * 0.15); ctx.quadraticCurveTo(x + i * r * 0.3 + Math.sin(this.t * 6 + i) * r * 0.15, cy + r * 0.5, x + i * r * 0.25, cy + r * 0.9); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.22, cy - r * 0.25, r * 0.08, 0, Math.PI * 2); ctx.arc(x + r * 0.22, cy - r * 0.25, r * 0.08, 0, Math.PI * 2); ctx.fill();
    } else {
      const col = c.kind === 'gold' ? PAL.gold : '#e8463a', dark = c.kind === 'gold' ? PAL.goldDark : '#9c2a20';
      ctx.fillStyle = dark; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * 0.85, cy - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, cy, r * 0.75, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.05; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * 0.2, cy - r * 0.4); ctx.lineTo(x + s * r * 0.25, cy - r * 0.7); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.25, cy - r * 0.72, r * 0.12, 0, Math.PI * 2); ctx.arc(x + r * 0.25, cy - r * 0.72, r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - r * 0.25, cy - r * 0.72, r * 0.06, 0, Math.PI * 2); ctx.arc(x + r * 0.25, cy - r * 0.72, r * 0.06, 0, Math.PI * 2); ctx.fill();
      if (c.kind === 'gold') { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - r * 0.3, cy - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    if (c.hit) { ctx.strokeStyle = PAL.goldLight; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); } }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, a = this.host.area, f = this.field;
    // Sable et trous
    roundRect(ctx, a.x + a.w * 0.12, a.y + 26 * ui, a.w * 0.76, a.h - 28 * ui, 18 * ui); ctx.fillStyle = '#d9b97a'; ctx.fill();
    for (let i = 0; i < 9; i++) {
      const h = this.holes[i];
      ctx.fillStyle = '#3a2a12'; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      const c = f?.holes[i];
      if (c) this.drawCritter(ctx, c, h.x, h.y, h.r);
      ctx.fillStyle = '#c9a564'; ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.12, h.r * 1.05, h.r * 0.28, 0, 0, Math.PI); ctx.fill();
    }
    for (const p of this.pops) drawLabel(ctx, p.v > 0 ? `+${p.v}` : `${p.v}`, p.x, p.y - p.t * 40 * ui, 20 * ui, p.v > 0 ? PAL.goldLight : PAL.danger);
    // Temps
    const left = f ? Math.max(0, MOLE_DURATION - f.time) : MOLE_DURATION;
    roundRect(ctx, a.x + a.w * 0.3, a.y + 6 * ui, a.w * 0.4, 12 * ui, 6 * ui); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    roundRect(ctx, a.x + a.w * 0.3, a.y + 6 * ui, a.w * 0.4 * (left / MOLE_DURATION), 12 * ui, 6 * ui); ctx.fillStyle = left < 8 ? PAL.danger : PAL.success; ctx.fill();
    drawPill(ctx, `Score ${f?.score ?? 0}`, a.x + 60 * ui, a.y + 12 * ui, 15 * ui, 'rgba(0,0,0,0.6)', PAL.goldLight);
    drawPill(ctx, `${Math.ceil(left)} s`, a.x + a.w - 40 * ui, a.y + 12 * ui, 14 * ui, 'rgba(0,0,0,0.6)', PAL.text);
    if ((this.phase === 'ready' && !this.card.counting) || this.phase === 'over') this.card.render(ctx, ui, this.phase === 'over');
    this.card.renderCountdown(ctx, a, ui);
    this.layer.render(ctx, ui);
  }
}
