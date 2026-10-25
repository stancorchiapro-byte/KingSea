// Roue de la fortune quotidienne du hall. La récompense est tirée et créditée dès le toucher
// (date et transaction enregistrées) ; l'animation ne fait que montrer le résultat.
import { drawKSEmblem } from '../art/brand';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import { easeOutCubic } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { dayKey } from './logic/rng';
import { canSpinToday, WHEEL_SEGMENTS } from './logic/wheel';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const TAU = Math.PI * 2;

export class WheelGame implements MiniGame {
  readonly id = 'wheel';
  readonly title = 'Roue du jour';
  readonly bg: [string, string] = ['#1d1418', '#070506'];
  readonly rules = 'Une roue gratuite par jour (date de ton téléphone). Les KSCoins gagnés sont ajoutés immédiatement.\nLa grande part violette vaut 250 KSCoins, mais elle est rare !';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private btn!: Button;
  private angle = 0;
  private anim: { start: number; from: number; to: number; idx: number } | null = null;
  private t = 0;
  private message = '';
  private cx = 0; private cy = 0; private r = 0;
  get holdBalance(): boolean { return this.anim !== null || this.waiting; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.btn = makeButton({ id: 'spin-wheel', label: 'Tourner la roue', style: 'gold', fontSize: 18, onTap: () => this.spin() });
    this.layer.buttons = [this.btn];
    this.message = this.available ? 'Ta roue du jour est prête !' : 'Déjà tournée aujourd’hui.';
  }

  private get available(): boolean { return canSpinToday(this.host.s.data.dailyRewards.lastWheelDay, dayKey()); }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const portrait = a.h > a.w;
    this.r = Math.min(portrait ? a.w * 0.42 : a.h * 0.44, 200 * ui);
    this.cx = portrait ? a.x + a.w / 2 : a.x + a.w * 0.35;
    this.cy = portrait ? a.y + this.r + 20 * ui : a.y + a.h / 2;
    const bw = 240 * ui, bh = 58 * ui;
    if (portrait) Object.assign(this.btn, { x: a.x + (a.w - bw) / 2, y: a.y + a.h - bh - 10 * ui, w: bw, h: bh });
    else Object.assign(this.btn, { x: a.x + a.w * 0.72 - bw / 2, y: a.y + a.h * 0.55, w: bw, h: bh });
  }

  handlers(): PointerHandler[] { return [this.layer]; }
  canQuit() { return { ok: true as const }; }

  private waiting = false;

  private async spin(): Promise<void> {
    const s = this.host.s, today = dayKey();
    if (this.anim || this.waiting) return;
    if (!canSpinToday(s.data.dailyRewards.lastWheelDay, today)) { this.message = 'Reviens demain pour une nouvelle roue.'; return; }
    // Tirage et versement par l'autorité (serveur en ligne : sa date fait foi, une seule roue par jour)
    this.waiting = true;
    const r = await s.ask('purser', 'purser', 'wheel', {});
    this.waiting = false;
    if (!r.ok) { this.message = r.error; s.data.dailyRewards.lastWheelDay = today; return; }
    s.data.dailyRewards.lastWheelDay = today; s.save.markDirty();
    const idx = r.view.index as number;
    const seg = TAU / WHEEL_SEGMENTS.length;
    // Le pointeur est en haut (-π/2) : on tourne pour que le centre du segment s'y arrête.
    let to = -Math.PI / 2 - (idx * seg + seg / 2);
    while (to < this.angle + TAU * 5) to += TAU;
    this.anim = { start: this.t, from: this.angle, to, idx };
    this.message = '';
  }

  update(dt: number): void {
    this.t += dt;
    if (this.anim) {
      const p = Math.min(1, (this.t - this.anim.start) / 4);
      const prev = this.angle;
      this.angle = this.anim.from + (this.anim.to - this.anim.from) * easeOutCubic(p);
      const seg = TAU / WHEEL_SEGMENTS.length;
      if (Math.floor(prev / seg) !== Math.floor(this.angle / seg)) this.host.s.audio.tick();
      if (p >= 1) {
        const won = WHEEL_SEGMENTS[this.anim.idx].coins;
        this.message = `+${won} KSCoins ! À demain pour une nouvelle roue.`;
        this.host.s.audio.win();
        this.anim = null;
      }
    }
    const avail = this.available;
    this.btn.enabled = avail && !this.anim;
    this.btn.label = avail || this.anim ? 'Tourner la roue' : `Prochaine roue dans ${this.untilMidnight()}`;
    this.btn.fontSize = avail || this.anim ? 18 : 14;
  }

  private untilMidnight(): string {
    const now = new Date(), m = new Date(now); m.setHours(24, 0, 0, 0);
    const mins = Math.max(0, Math.ceil((m.getTime() - now.getTime()) / 60000));
    return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, n = WHEEL_SEGMENTS.length, seg = TAU / n;
    ctx.save(); ctx.translate(this.cx, this.cy);
    // Couronne d'or brossé, cases laquées (onyx, bordeaux, vert casino ; le gros lot en champagne)
    const rim = ctx.createLinearGradient(-this.r, -this.r, this.r, this.r);
    rim.addColorStop(0, '#8a6a2b'); rim.addColorStop(0.5, '#efdcae'); rim.addColorStop(1, '#8a6a2b');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, this.r + 12 * ui, 0, TAU); ctx.fill();
    const LACQUER = ['#121014', '#5e1426', '#0f4a2c', '#5e1426'];
    for (let i = 0; i < n; i++) {
      const a0 = this.angle + i * seg, big = WHEEL_SEGMENTS[i].coins >= 250, mid = WHEEL_SEGMENTS[i].coins >= 100;
      const g = ctx.createRadialGradient(0, 0, this.r * 0.2, 0, 0, this.r);
      const base = big ? '#d4af5a' : LACQUER[i % LACQUER.length];
      g.addColorStop(0, big ? '#f6e7bf' : base); g.addColorStop(1, big ? '#a8843d' : base);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, this.r, a0, a0 + seg); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(239,220,174,0.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.rotate(a0 + seg / 2); ctx.translate(this.r * 0.66, 0); ctx.rotate(Math.PI / 2);
      drawLabel(ctx, String(WHEEL_SEGMENTS[i].coins), 0, 0, Math.max(12, this.r * (big || mid ? 0.15 : 0.13)), big ? '#1a1208' : mid ? '#efdcae' : '#f6f0e3', 'center', 900);
      ctx.restore();
    }
    // Ampoules du pourtour
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, on = (i + Math.floor(this.t * (this.anim ? 10 : 2))) % 2 === 0;
      ctx.fillStyle = on ? '#fff6c2' : 'rgba(255,240,180,0.35)';
      ctx.beginPath(); ctx.arc(Math.cos(a) * (this.r + 5 * ui), Math.sin(a) * (this.r + 5 * ui), 3 * ui, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#0b0a0d'; ctx.beginPath(); ctx.arc(0, 0, this.r * 0.22, 0, TAU); ctx.fill();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 3; ctx.stroke();
    drawKSEmblem(ctx, 0, 0, this.r * 0.32, this.t, 'small', false);
    // Pointeur
    ctx.fillStyle = PAL.pearl; ctx.beginPath(); ctx.moveTo(-12 * ui, -this.r - 16 * ui); ctx.lineTo(12 * ui, -this.r - 16 * ui); ctx.lineTo(0, -this.r + 12 * ui); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = PAL.goldDark; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    const a = this.host.area, portrait = a.h > a.w;
    const tx = portrait ? a.x + a.w / 2 : a.x + a.w * 0.72, ty = portrait ? this.cy + this.r + 40 * ui : a.y + a.h * 0.38;
    if (this.message) drawPill(ctx, this.message, tx, ty, 14 * ui, 'rgba(14,11,16,0.85)', PAL.text);
    this.layer.render(ctx, ui);
  }
}
