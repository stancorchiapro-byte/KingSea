// Fenêtre modale tactile : fond assombri, panneau centré, bouton fermer large, fermeture en touchant le fond.
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { ButtonLayer, drawPanel, font, Icons, makeButton, wrapText, type Button, type BtnStyle } from './UIKit';

export interface Rect { x: number; y: number; w: number; h: number }

export abstract class Modal {
  readonly layer = new ButtonLayer(8);
  panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  content: Rect = { x: 0, y: 0, w: 0, h: 0 };
  closed = false;
  protected t = 0;
  protected closeBtn: Button;
  onClosed: (() => void) | null = null;

  constructor(protected s: Services, public title: string) {
    this.layer.modal = true;
    this.layer.onTapSound = () => s.audio.tap();
    this.layer.onBackgroundTap = (p) => {
      const r = this.panel;
      if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) this.close();
    };
    this.closeBtn = makeButton({ id: 'close', style: 'round', icon: Icons.close, onTap: () => this.close() });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.s.audio.back();
    this.onClosed?.();
  }

  /** Taille souhaitée du contenu (hors titre) en px CSS. */
  protected abstract measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number };
  /** Positionne les boutons du contenu dans `this.content`. */
  protected abstract place(vp: Viewport): Button[];
  protected renderContent(_ctx: CanvasRenderingContext2D, _vp: Viewport): void {}

  layout(vp: Viewport): void {
    const ui = vp.ui, pad = 18 * ui, titleH = 52 * ui;
    const maxW = vp.width - vp.safe.left - vp.safe.right - 24;
    const maxH = vp.height - vp.safe.top - vp.safe.bottom - 20;
    const m = this.measure(vp, maxW - pad * 2, maxH - titleH - pad);
    const w = Math.min(maxW, m.w + pad * 2), h = Math.min(maxH, m.h + titleH + pad);
    const cx = vp.safe.left + (vp.width - vp.safe.left - vp.safe.right) / 2;
    const cy = vp.safe.top + (vp.height - vp.safe.top - vp.safe.bottom) / 2;
    this.panel = { x: cx - w / 2, y: cy - h / 2, w, h };
    this.content = { x: this.panel.x + pad, y: this.panel.y + titleH, w: w - pad * 2, h: h - titleH - pad };
    const cs = Math.max(44, 44 * ui);
    Object.assign(this.closeBtn, { x: this.panel.x + w - cs - 6 * ui, y: this.panel.y + 6 * ui, w: cs, h: cs });
    this.layer.buttons = [...this.place(vp), this.closeBtn];
  }

  update(dt: number): void { this.t = Math.min(1, this.t + dt * 6); }

  render(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui;
    ctx.save();
    ctx.globalAlpha = this.t;
    ctx.fillStyle = 'rgba(6,5,8,0.55)'; ctx.fillRect(0, 0, vp.width, vp.height);
    const p = this.panel;
    drawPanel(ctx, p.x, p.y, p.w, p.h, ui);
    ctx.fillStyle = PAL.gold; ctx.font = font(19 * ui, 800); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(this.title, p.x + 20 * ui, p.y + 28 * ui, p.w - 90 * ui);
    this.renderContent(ctx, vp);
    this.layer.render(ctx, ui);
    ctx.restore();
  }
}

export interface DialogAction { label: string; style?: BtnStyle; onTap: () => void; keepOpen?: boolean }

/** Boîte de dialogue texte + actions (réception, journal, découvertes, confirmations). */
export class InfoDialog extends Modal {
  private lines: string[] = [];
  private lineH = 0;

  constructor(s: Services, title: string, private text: string, private actions: DialogAction[] = [{ label: 'OK', onTap: () => {} }]) {
    super(s, title);
  }

  protected measure(vp: Viewport, maxW: number): { w: number; h: number } {
    const ui = vp.ui;
    const w = Math.min(maxW, 460 * ui);
    const ctx = this.s.game.ctx;
    ctx.save(); ctx.font = font(15 * ui, 500);
    this.lines = wrapText(ctx, this.text, w);
    ctx.restore();
    this.lineH = 21 * ui;
    return { w, h: this.lines.length * this.lineH + 14 * ui + (this.actions.length ? 52 * ui : 0) };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, n = this.actions.length;
    if (!n) return [];
    const gap = 10 * ui, bh = 48 * ui;
    const bw = Math.min(220 * ui, (this.content.w - gap * (n - 1)) / n);
    const total = bw * n + gap * (n - 1);
    const y = this.content.y + this.content.h - bh;
    return this.actions.map((a, i) => makeButton({
      id: `act${i}`, label: a.label, style: a.style ?? (i === n - 1 ? 'primary' : 'secondary'),
      x: this.content.x + (this.content.w - total) / 2 + i * (bw + gap), y, w: bw, h: bh,
      onTap: () => { a.onTap(); if (!a.keepOpen) this.close(); },
    }));
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    ctx.fillStyle = PAL.text; ctx.font = font(15 * vp.ui, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    this.lines.forEach((l, i) => ctx.fillText(l, this.content.x, this.content.y + i * this.lineH));
  }
}
