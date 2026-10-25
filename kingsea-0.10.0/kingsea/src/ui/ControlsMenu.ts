// Aide et réglage des commandes : raccourcis clavier (une touche personnalisable par action), correspondance
// des boutons de manette, état de la manette branchée. Sur téléphone, tout se joue au toucher ; ce panneau
// sert sur ordinateur, tablette avec clavier ou avec une manette Bluetooth.
import { LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import { ACTIONS, keyName, type Action } from '../engine/Controls';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

export class ControlsMenu extends Modal {
  private page = 0;
  private waiting: Action | null = null;
  private rows: Array<{ a: (typeof ACTIONS)[number]; y: number }> = [];
  private vp: Viewport | null = null;
  private note = '';

  constructor(s: Services) { super(s, 'Commandes'); }

  close(): void { this.s.game.controls.cancelCapture(); super.close(); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 700 * vp.ui), h: Math.min(maxH, 600 * vp.ui) };
  }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, bh = Math.max(44, 40 * ui), out: Button[] = [];
    const head = 46 * ui, foot = bh + 10 * ui;
    const rowH = Math.max(46, 48 * ui);
    const per = Math.max(3, Math.floor((C.h - head - foot) / rowH));
    const pages = Math.ceil(ACTIONS.length / per);
    this.page = Math.min(this.page, pages - 1);
    this.rows = [];
    ACTIONS.slice(this.page * per, this.page * per + per).forEach((a, i) => {
      const y = C.y + head + i * rowH;
      this.rows.push({ a, y: y + rowH / 2 });
      if (a.id === 'back') return; // Échap reste toujours « retour »
      const w = Math.min(130 * ui, C.w * 0.24);
      out.push(makeButton({ id: `bind-${a.id}`, label: this.waiting === a.id ? 'Appuie…' : 'Modifier', style: this.waiting === a.id ? 'gold' : 'secondary', fontSize: 13, x: C.x + C.w - w, y: y + (rowH - bh) / 2, w, h: bh,
        onTap: () => this.rebind(a.id) }));
    });
    const fy = C.y + C.h - bh;
    out.push(makeButton({ id: 'bind-reset', label: 'Touches par défaut', style: 'ghost', fontSize: 14, x: C.x, y: fy, w: Math.min(220 * ui, C.w * 0.45), h: bh,
      onTap: () => { this.s.data.settings.keymap = {}; this.s.applySettings(); this.s.save.markDirty(); this.note = 'Touches par défaut rétablies.'; this.relayout(); } }));
    if (pages > 1) {
      out.push(makeButton({ id: 'bind-prev', label: '‹', style: 'secondary', fontSize: 20, enabled: this.page > 0, x: C.x + C.w - 118 * ui, y: fy, w: 54 * ui, h: bh, onTap: () => { this.page--; this.relayout(); } }));
      out.push(makeButton({ id: 'bind-next', label: '›', style: 'secondary', fontSize: 20, enabled: this.page < pages - 1, x: C.x + C.w - 54 * ui, y: fy, w: 54 * ui, h: bh, onTap: () => { this.page++; this.relayout(); } }));
    }
    return out;
  }

  private rebind(a: Action): void {
    const c = this.s.game.controls;
    this.waiting = a; this.note = 'Appuie sur la nouvelle touche (Échap pour annuler).';
    this.relayout();
    c.captureNext((code) => {
      this.waiting = null;
      if (code) {
        const map = this.s.data.settings.keymap;
        // Une touche ne sert qu'à une action personnalisée à la fois
        for (const k of Object.keys(map)) if (map[k] === code) delete map[k];
        map[a] = code;
        this.s.applySettings(); this.s.save.markDirty();
        this.note = `${ACTIONS.find((x) => x.id === a)!.label} : ${keyName(code)}`;
        this.s.audio.tap();
      } else this.note = 'Modification annulée.';
      this.relayout();
    });
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content, c = this.s.game.controls;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(12.5 * ui, 600); ctx.fillStyle = PAL.textDim;
    ctx.fillText(c.padName ? `Manette : ${c.padName}` : 'Clavier ou manette (au toucher, utilise les boutons à l’écran).', C.x, C.y + 10 * ui, C.w);
    ctx.fillStyle = this.note ? LUXE.champagne : PAL.textDim;
    ctx.fillText(this.note || 'Chaque action garde ses touches par défaut ; « Modifier » ajoute la tienne.', C.x, C.y + 30 * ui, C.w);
    const colKeys = C.x + C.w * 0.36, colPad = C.x + C.w * 0.6;
    for (const r of this.rows) {
      ctx.fillStyle = PAL.text; ctx.font = font(14 * ui, 800);
      ctx.fillText(r.a.label, C.x, r.y, C.w * 0.34);
      ctx.fillStyle = LUXE.champagne; ctx.font = font(13 * ui, 700);
      ctx.fillText(c.keysOf(r.a.id).slice(0, 3).map(keyName).join(' · '), colKeys, r.y, C.w * 0.23);
      ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 600);
      ctx.fillText(`🎮 ${r.a.pad}`, colPad, r.y, C.w * 0.4 - 140 * ui);
    }
    ctx.restore();
  }
}
