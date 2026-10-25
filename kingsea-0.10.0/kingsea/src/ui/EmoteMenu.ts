// Emotes sociales simples (saluer, applaudir, danser). En multijoueur, elles seront diffusées aux autres joueurs.
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

export type EmoteId = 'wave' | 'clap' | 'dance' | 'heart';
export const EMOTES: Array<{ id: EmoteId; glyph: string; label: string }> = [
  { id: 'wave', glyph: '👋', label: 'Saluer' },
  { id: 'clap', glyph: '👏', label: 'Applaudir' },
  { id: 'dance', glyph: '💃', label: 'Danser' },
  { id: 'heart', glyph: '💙', label: 'Cœur' },
];

export class EmoteMenu extends Modal {
  constructor(s: Services, private onPick: (e: EmoteId) => void) { super(s, 'Emotes'); }

  protected measure(vp: Viewport, maxW: number): { w: number; h: number } {
    return { w: Math.min(maxW, 4 * 96 * vp.ui + 3 * 10 * vp.ui), h: 92 * vp.ui };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, gap = 10 * ui, bw = (this.content.w - gap * 3) / 4;
    return EMOTES.map((e, i) => makeButton({
      id: e.id, label: e.label, style: 'secondary', fontSize: 13,
      x: this.content.x + i * (bw + gap), y: this.content.y, w: bw, h: this.content.h,
      icon: (ctx, cx, cy, s) => { ctx.font = font(s * 1.1, 400); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.glyph, cx, cy); },
      onTap: () => { this.close(); this.onPick(e.id); },
    }));
  }
}
