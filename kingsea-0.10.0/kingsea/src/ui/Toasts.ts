// Messages courts en haut de l'écran (achat, découverte, erreur…).
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import { font } from './UIKit';

type Kind = 'info' | 'success' | 'error' | 'reward';
interface Toast { text: string; kind: Kind; t: number; dur: number }

export class Toasts {
  private list: Toast[] = [];

  show(text: string, kind: Kind = 'info', dur = 2.6): void {
    // Évite d'empiler le même message si le joueur tapote plusieurs fois.
    const dup = this.list.find((t) => t.text === text);
    if (dup) { dup.t = 0; return; }
    this.list.push({ text, kind, t: 0, dur });
    if (this.list.length > 3) this.list.shift();
  }

  update(dt: number): void {
    for (const t of this.list) t.t += dt;
    this.list = this.list.filter((t) => t.t < t.dur);
  }

  render(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui;
    let y = vp.safe.top + 62 * ui;
    for (const t of this.list) {
      const a = Math.min(1, t.t * 6, (t.dur - t.t) * 3);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = font(15 * ui, 700);
      const w = Math.min(vp.width - 40, ctx.measureText(t.text).width + 36 * ui), h = 38 * ui;
      const x = vp.width / 2 - w / 2;
      roundRect(ctx, x, y - (1 - a) * 8, w, h, h / 2);
      ctx.fillStyle = 'rgba(10,8,12,0.92)'; ctx.fill();
      ctx.strokeStyle = t.kind === 'error' ? PAL.danger : t.kind === 'success' ? PAL.success : t.kind === 'reward' ? PAL.gold : 'rgba(239,220,174,0.6)';
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = PAL.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.text, vp.width / 2, y + h / 2 - (1 - a) * 8, w - 20);
      ctx.restore();
      y += h + 8 * ui;
    }
  }
}
