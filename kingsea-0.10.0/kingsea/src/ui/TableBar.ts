// Bandeau de table multijoueur (casino en ligne) : numéro d'instance, places occupées / libres, phase et compte à
// rebours, avatars des joueurs assis, fil des résultats des voisins ; menu « Tables » pour voir les autres
// instances (joueurs, amis présents) et changer de table. Toutes les données viennent du serveur.
import { LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import type { TableClient } from '../net/Tables';
import type { Services } from '../systems/Services';
import { drawAvatar } from './avatar';
import { Modal } from './Modal';
import { ButtonLayer, font, makeButton, type Button } from './UIKit';

const PHASES: Record<string, string> = {
  open: 'Mises ouvertes', betting: 'Mises en cours', show: 'Résultat', flying: 'En vol', crashed: 'Écrasé',
  insurance: 'Assurance proposée', player: 'Tour des joueurs',
};

export const TABLE_BAR_H = 46;

export class TableBar {
  readonly layer = new ButtonLayer(6);
  private listBtn: Button;
  rect = { x: 0, y: 0, w: 0, h: 0 };
  constructor(s: Services, private table: TableClient, private openMenu: () => void) {
    this.listBtn = makeButton({ id: 'tables', label: 'Tables', style: 'secondary', fontSize: 13, onTap: () => { this.table.refreshList(); this.openMenu(); } });
    this.layer.buttons = [this.listBtn];
    this.layer.onTapSound = () => s.audio.tap();
  }

  layout(x: number, y: number, w: number, ui: number): void {
    this.rect = { x, y, w, h: TABLE_BAR_H * ui };
    Object.assign(this.listBtn, { x: x + w - 92 * ui, y: y + 5 * ui, w: 88 * ui, h: (TABLE_BAR_H - 10) * ui });
  }

  render(ctx: CanvasRenderingContext2D, ui: number): void {
    const t = this.table, st = t.state, r = this.rect;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.62)';
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12 * ui); ctx.fill();
    ctx.strokeStyle = 'rgba(229,181,74,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (!st) {
      ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 700);
      ctx.fillText(t.error ?? (t.online ? 'Recherche d’une table…' : 'Hors connexion : table indisponible'), r.x + 12 * ui, r.y + r.h / 2, r.w - 120 * ui);
      ctx.restore(); this.layer.render(ctx, ui); return;
    }
    ctx.fillStyle = LUXE.champagne; ctx.font = font(13.5 * ui, 900);
    ctx.fillText(`Table n° ${st.num}`, r.x + 12 * ui, r.y + r.h * 0.34);
    const secs = Math.ceil(t.endsIn / 1000);
    ctx.fillStyle = PAL.textDim; ctx.font = font(11.5 * ui, 700);
    const phase = PHASES[st.phase] ?? st.phase;
    ctx.fillText(`${st.seats.length}/${st.cap} · ${phase}${secs > 0 ? ` · ${secs} s` : ''}`, r.x + 12 * ui, r.y + r.h * 0.7, 190 * ui);
    // Places : avatars des joueurs assis, cercles vides pour les places libres
    const ar = 14 * ui, gap = 6 * ui, sx = r.x + 205 * ui;
    const room = r.x + r.w - 100 * ui - sx;
    const step = Math.min(ar * 2 + gap + 46 * ui, room / Math.max(1, st.cap));
    for (let i = 0; i < st.cap; i++) {
      const seat = st.seats.find((p) => p.seat === i);
      const cx = sx + ar + i * step, cy = r.y + r.h / 2;
      if (cx + ar > r.x + r.w - 100 * ui) break;
      if (seat) {
        drawAvatar(ctx, seat.look, seat.name, cx, cy, ar, seat.connected);
        if (seat.id === st.you) { ctx.strokeStyle = LUXE.gold; ctx.lineWidth = 2 * ui; ctx.beginPath(); ctx.arc(cx, cy, ar + 2 * ui, 0, Math.PI * 2); ctx.stroke(); }
        if (step > ar * 2 + 30 * ui) { ctx.fillStyle = PAL.text; ctx.font = font(10.5 * ui, 700); ctx.textAlign = 'left'; ctx.fillText(seat.id === st.you ? 'Toi' : seat.name, cx + ar + 4 * ui, cy, step - ar * 2 - 8 * ui); }
      } else {
        ctx.strokeStyle = 'rgba(239,220,174,0.25)'; ctx.setLineDash([3 * ui, 3 * ui]); ctx.lineWidth = 1.2 * ui;
        ctx.beginPath(); ctx.arc(cx, cy, ar, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239,220,174,0.35)'; ctx.font = font(9 * ui, 700); ctx.textAlign = 'center'; ctx.fillText('libre', cx, cy);
      }
    }
    ctx.restore();
    // Fil des résultats des voisins (sous le bandeau)
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = font(11.5 * ui, 800);
    t.feed.slice(-3).forEach((f, i) => {
      const y = r.y + r.h + 12 * ui + i * 17 * ui;
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = f.net > 0 ? '#7ee2a8' : f.net < 0 ? '#f08a8a' : PAL.textDim;
      ctx.fillText(`${f.text} ${f.net > 0 ? `+${f.net}` : f.net < 0 ? `−${-f.net}` : '±0'}`, r.x + 8 * ui, y, r.w * 0.5);
    });
    ctx.restore();
    this.layer.render(ctx, ui);
  }
}

/** Liste des instances d'un jeu : joueurs, amis présents, places libres ; rejoindre une table précise. */
export class TablesMenu extends Modal {
  private vp: Viewport | null = null;
  private timer = 0;
  constructor(s: Services, private table: TableClient) { super(s, 'Tables'); }

  update(dt: number): void {
    super.update(dt);
    this.timer += dt;
    if (this.timer > 2) { this.timer = 0; this.table.refreshList(); }
    if (this.vp && this.timer < dt * 1.5) this.layout(this.vp);
  }

  protected measure(vp: Viewport, maxW: number, maxH: number) { return { w: Math.min(maxW, 520 * vp.ui), h: Math.min(maxH, 440 * vp.ui) }; }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, rowH = Math.max(50, 52 * ui), out: Button[] = [];
    const rows = this.table.list.slice(0, Math.floor((C.h - 60 * ui) / rowH));
    rows.forEach((t, i) => {
      const mine = this.table.state?.id === t.id, full = t.players >= t.cap;
      out.push(makeButton({ id: `tb-${t.id}`, label: mine ? 'Ta table' : full ? 'Complète' : 'Rejoindre', style: mine ? 'ghost' : 'primary', enabled: !mine && !full, fontSize: 13,
        x: C.x + C.w - 120 * ui, y: C.y + i * rowH + 4 * ui, w: 120 * ui, h: rowH - 8 * ui,
        onTap: () => { this.table.join({ instance: t.id }); this.close(); } }));
    });
    const fr = this.table.friendsAt.filter((f) => f.game === this.table.game && f.table !== this.table.state?.id);
    if (fr.length) out.push(makeButton({ id: 'tb-friend', label: `Rejoindre ${fr[0].name}`, style: 'gold', fontSize: 13, x: C.x, y: C.y + C.h - 48 * ui, w: Math.min(C.w, 260 * ui), h: 46 * ui,
      onTap: () => { this.table.join({ friend: fr[0].id }); this.close(); } }));
    return out;
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content, rowH = Math.max(50, 52 * ui);
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (!this.table.list.length) { ctx.fillStyle = PAL.textDim; ctx.font = font(14 * ui, 600); ctx.fillText('Chargement des tables…', C.x, C.y + 20 * ui); }
    this.table.list.slice(0, Math.floor((C.h - 60 * ui) / rowH)).forEach((t, i) => {
      const y = C.y + i * rowH + rowH / 2;
      ctx.fillStyle = PAL.text; ctx.font = font(15 * ui, 800);
      ctx.fillText(`Table n° ${t.num}`, C.x, y - 8 * ui);
      ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 600);
      ctx.fillText(`${t.players}/${t.cap} joueurs · ${t.cap - t.players} place${t.cap - t.players > 1 ? 's' : ''} libre${t.cap - t.players > 1 ? 's' : ''}${t.friends.length ? ` · amis : ${t.friends.join(', ')}` : ''}`, C.x, y + 10 * ui, C.w - 130 * ui);
    });
    ctx.fillStyle = PAL.textDim; ctx.font = font(11.5 * ui, 600);
    ctx.fillText('Quand toutes les tables sont pleines, une nouvelle table s’ouvre automatiquement.', C.x, C.y + C.h - 60 * ui, C.w);
    ctx.restore();
  }
}
