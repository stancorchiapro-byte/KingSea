// Liste des joueurs en ligne (étage de chacun) avec Bloquer / Débloquer et Signaler.
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

export interface PlayerRow { id: string; name: string; floor: string }
const FLOOR_NAMES: Record<string, string> = { hub: 'Hall', engine: 'Machines', casino: 'Casino', arcade: 'Arcade', cabins: 'Logements', rooftop: 'Rooftop', 'cabin-interior': 'Sa cabine' };
export const REPORT_REASONS = ['Insultes', 'Spam', 'Harcèlement', 'Pseudo inapproprié'];

export class PlayersMenu extends Modal {
  private rows: Array<PlayerRow & { y: number }> = [];
  private page = 0;
  private reporting: PlayerRow | null = null;

  constructor(s: Services, private list: PlayerRow[], private me: string, private blocked: Set<string>, private act: { block: (id: string, on: boolean) => void; report: (id: string, reason: string) => void; addFriend?: (name: string) => void }) {
    super(s, `Joueurs en ligne (${list.length})`);
  }

  private get perPage(): number { return 5; }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 620 * vp.ui), h: Math.min(maxH, (this.perPage * 50 + 60) * vp.ui) };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, C = this.content, out: Button[] = [];
    this.rows = [];
    if (this.reporting) {
      const r = this.reporting;
      REPORT_REASONS.forEach((reason, i) => out.push(makeButton({
        id: `reason-${i}`, label: reason, style: 'secondary', fontSize: 15, x: C.x, y: C.y + 30 * ui + i * 50 * ui, w: C.w, h: 44 * ui,
        onTap: () => { this.act.report(r.id, reason); this.reporting = null; this.close(); },
      })));
      out.push(makeButton({ id: 'cancel-report', label: 'Annuler', style: 'ghost', fontSize: 14, x: C.x, y: C.y + C.h - 44 * ui, w: 140 * ui, h: 44 * ui, onTap: () => { this.reporting = null; this.layout(vp); } }));
      return out;
    }
    const others = this.list.filter((p) => p.id !== this.me);
    const pages = Math.max(1, Math.ceil(others.length / this.perPage));
    this.page = Math.min(this.page, pages - 1);
    others.slice(this.page * this.perPage, (this.page + 1) * this.perPage).forEach((p, i) => {
      const y = C.y + i * 50 * ui;
      this.rows.push({ ...p, y: y + 22 * ui });
      const bl = this.blocked.has(p.id);
      if (this.act.addFriend) out.push(makeButton({ id: `friend-${p.id}`, label: 'Ami +', style: 'primary', fontSize: 13, x: C.x + C.w - 300 * ui, y: y + 2 * ui, w: 84 * ui, h: 40 * ui, onTap: () => { this.act.addFriend!(p.name); this.close(); } }));
      out.push(makeButton({ id: `block-${p.id}`, label: bl ? 'Débloquer' : 'Bloquer', style: bl ? 'secondary' : 'ghost', active: bl, fontSize: 13, x: C.x + C.w - 210 * ui, y: y + 2 * ui, w: 100 * ui, h: 40 * ui, onTap: () => { this.act.block(p.id, !bl); if (bl) this.blocked.delete(p.id); else this.blocked.add(p.id); this.layout(vp); } }));
      out.push(makeButton({ id: `report-${p.id}`, label: 'Signaler', style: 'danger', fontSize: 13, x: C.x + C.w - 100 * ui, y: y + 2 * ui, w: 100 * ui, h: 40 * ui, onTap: () => { this.reporting = p; this.layout(vp); } }));
    });
    if (pages > 1) {
      out.push(makeButton({ id: 'prev', label: '‹', style: 'secondary', fontSize: 18, enabled: this.page > 0, x: C.x, y: C.y + C.h - 44 * ui, w: 54 * ui, h: 44 * ui, onTap: () => { this.page--; this.layout(vp); } }));
      out.push(makeButton({ id: 'next', label: '›', style: 'secondary', fontSize: 18, enabled: this.page < pages - 1, x: C.x + 64 * ui, y: C.y + C.h - 44 * ui, w: 54 * ui, h: 44 * ui, onTap: () => { this.page++; this.layout(vp); } }));
    }
    return out;
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (this.reporting) {
      ctx.fillStyle = PAL.text; ctx.font = font(15 * ui, 700);
      ctx.fillText(`Signaler ${this.reporting.name} : pour quelle raison ?`, C.x, C.y + 10 * ui, C.w);
      return;
    }
    if (!this.rows.length) { ctx.fillStyle = PAL.textDim; ctx.font = font(15 * ui, 600); ctx.fillText('Personne d’autre n’est en ligne pour l’instant.', C.x, C.y + 20 * ui, C.w); return; }
    for (const r of this.rows) {
      ctx.fillStyle = this.blocked.has(r.id) ? PAL.textDim : PAL.text; ctx.font = font(15 * ui, 800);
      ctx.fillText(r.name, C.x, r.y - 7 * ui, C.w - (this.act.addFriend ? 310 : 220) * ui);
      ctx.fillStyle = PAL.textDim; ctx.font = font(11.5 * ui, 600);
      ctx.fillText(FLOOR_NAMES[r.floor] ?? r.floor, C.x, r.y + 10 * ui, C.w - (this.act.addFriend ? 310 : 220) * ui);
    }
  }
}
