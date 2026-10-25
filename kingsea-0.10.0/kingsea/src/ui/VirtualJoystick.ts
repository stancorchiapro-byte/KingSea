// Joystick virtuel flottant : au repos en bas à gauche ; il se place sous le pouce
// dès que le joueur touche la moitié gauche de l'écran (plus confortable qu'une base fixe).
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import type { Viewport } from '../engine/Viewport';
import { computeStick, knobOffset, type Stick } from './joystickMath';

export class VirtualJoystick implements PointerHandler {
  value: Stick = { x: 0, y: 0, mag: 0 };
  scale = 1;
  /** Mode gaucher : joystick à droite, boutons d'action à gauche. */
  mirror = false;
  enabled = true;
  private pid: number | null = null;
  private base = { x: 0, y: 0 };
  private knob = { x: 0, y: 0 };
  private rest = { x: 0, y: 0 };
  private fade = 0.55;

  constructor(private vp: Viewport) { this.layout(); }

  get radius(): number { return 54 * this.vp.ui * this.scale; }
  get active(): boolean { return this.pid !== null; }

  layout(): void {
    const v = this.vp, R = this.radius;
    const rx = v.safe.left + 28 * v.ui + R * 1.25;
    this.rest = { x: this.mirror ? v.width - rx - v.safe.right + v.safe.left : rx, y: v.height - v.safe.bottom - 24 * v.ui - R * 1.25 };
    if (this.pid === null) { this.base = { ...this.rest }; this.knob = { x: 0, y: 0 }; }
  }

  /** Zone d'activation : moitié gauche, sous la barre du haut. */
  private inZone(x: number, y: number): boolean {
    const v = this.vp;
    return (this.mirror ? x > v.width * 0.54 : x < v.width * 0.46) && y > v.safe.top + 70 * v.ui;
  }

  onDown(p: PointerInfo): boolean {
    if (!this.enabled || this.pid !== null || !this.inZone(p.x, p.y)) return false;
    this.pid = p.id;
    const v = this.vp, R = this.radius;
    // Base sous le doigt, mais jamais coupée par le bord de l'écran.
    this.base = {
      x: this.mirror ? Math.min(v.width - v.safe.right - R - 8, Math.max(v.width * 0.54, p.x)) : Math.max(v.safe.left + R + 8, Math.min(v.width * 0.46, p.x)),
      y: Math.max(v.safe.top + R + 70 * v.ui, Math.min(v.height - v.safe.bottom - R - 8, p.y)),
    };
    this.onMove(p);
    return true;
  }

  onMove(p: PointerInfo): void {
    if (p.id !== this.pid) return;
    const dx = p.x - this.base.x, dy = p.y - this.base.y;
    this.knob = knobOffset(dx, dy, this.radius);
    this.value = computeStick(dx, dy, this.radius);
  }

  onUp(p: PointerInfo): void {
    if (p.id !== this.pid) return;
    this.release();
  }

  release(): void {
    this.pid = null;
    this.value = { x: 0, y: 0, mag: 0 };
    this.knob = { x: 0, y: 0 };
    this.base = { ...this.rest };
  }

  update(dt: number): void {
    const target = this.active ? 1 : 0.55;
    this.fade += (target - this.fade) * Math.min(1, dt * 10);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;
    const R = this.radius, { x, y } = this.base;
    ctx.save();
    ctx.globalAlpha = this.fade;
    ctx.fillStyle = 'rgba(14,11,16,0.45)';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(239,220,174,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    // Repères directionnels
    ctx.fillStyle = 'rgba(244,239,230,0.5)';
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const ax = x + Math.cos(a) * R * 0.78, ay = y + Math.sin(a) * R * 0.78;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5); ctx.fill(); ctx.restore();
    }
    const kx = x + this.knob.x, ky = y + this.knob.y, kr = R * 0.46;
    const g = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, kr * 0.1, kx, ky, kr);
    g.addColorStop(0, '#8ffaff'); g.addColorStop(1, PAL.turquoise);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
}
