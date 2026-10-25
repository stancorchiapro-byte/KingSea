// Amis (en ligne) : ton code ami unique, ajout par code ou pseudo, demandes reçues / envoyées, liste avec
// statut (en ligne, étage), profil, « Rejoindre » (ascenseur jusqu'à l'étage de l'ami) et retrait.
// Les données viennent du serveur (persistées en base) ; ce menu se met à jour quand elles changent.
import { LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import type { Connection } from '../net/Net';
import type { FriendEntry, FriendsData, ServerMsg } from '../net/protocol';
import type { Services } from '../systems/Services';
import { InfoDialog, Modal } from './Modal';
import { promptText } from './TextPrompt';
import { font, makeButton, type Button } from './UIKit';

const FLOOR_NAMES: Record<string, string> = { hub: 'Hall', engine: 'Salle des machines', casino: 'Casino', arcade: 'Arcade', cabins: 'Logements', rooftop: 'Rooftop', 'cabin-interior': 'Dans sa cabine' };
type Tab = 'friends' | 'requests';

export interface FriendsActions {
  /** Aller à l'étage d'un ami. */
  join(floor: string, name: string): void;
  /** Ouvrir la liste des joueurs en ligne. */
  players(): void;
  /** Ouvrir une boîte de dialogue par-dessus (profil, confirmation). */
  dialog(d: InfoDialog): void;
}

export class FriendsMenu extends Modal {
  private data: FriendsData | null = null;
  private tab: Tab = 'friends';
  private page = 0;
  private vp: Viewport | null = null;
  private status = 'Chargement…';
  private off: () => void;
  private rows: Array<{ e: FriendEntry; y: number; kind: 'friend' | 'in' | 'out' }> = [];

  constructor(s: Services, private conn: Connection, private act: FriendsActions, startTab: Tab = 'friends') {
    super(s, 'Amis');
    this.tab = startTab;
    this.off = conn.on((m) => this.onMsg(m));
    conn.send({ t: 'friends' });
  }

  close(): void { this.off(); super.close(); }

  private onMsg(m: ServerMsg): void {
    if (m.t === 'friends') {
      this.data = m.data; this.status = '';
      // Des demandes en attente : on les montre d'abord
      if (this.data.incoming.length && this.tab === 'friends' && !this.data.friends.length) this.tab = 'requests';
      this.relayout();
    } else if (m.t === 'friendResult') {
      this.status = m.msg;
      if (m.ok) this.s.audio.ding(); else this.s.audio.error();
      this.relayout();
    }
  }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 620 * vp.ui), h: Math.min(maxH, 560 * vp.ui) };
  }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, bh = Math.max(44, 44 * ui), out: Button[] = [];
    // Code ami + actions
    const codeY = C.y;
    out.push(makeButton({ id: 'friend-add', label: 'Ajouter', sub: 'code ou pseudo', style: 'gold', fontSize: 15, x: C.x + C.w - 150 * ui, y: codeY, w: 150 * ui, h: bh + 6 * ui, onTap: () => this.ask() }));
    const tabsY = codeY + bh + 14 * ui;
    const nIn = this.data?.incoming.length ?? 0;
    const tabs: Array<[Tab | 'online', string]> = [['friends', `Mes amis${this.data ? ` (${this.data.friends.length})` : ''}`], ['requests', `Demandes${nIn ? ` · ${nIn}` : ''}`], ['online', 'En ligne']];
    const tw = (C.w - gap * 2) / 3;
    tabs.forEach(([id, label], i) => out.push(makeButton({ id: `ftab-${id}`, label, style: 'secondary', active: this.tab === id, fontSize: 14, x: C.x + i * (tw + gap), y: tabsY, w: tw, h: bh,
      onTap: () => { if (id === 'online') { this.close(); this.act.players(); return; } this.tab = id; this.page = 0; this.relayout(); } })));
    // Liste
    const listY = tabsY + bh + 10 * ui, rowH = Math.max(54, 58 * ui);
    const statusH = 22 * ui;
    const avail = C.y + C.h - listY - bh - gap - statusH;
    const per = Math.max(1, Math.floor(avail / rowH));
    const entries: Array<{ e: FriendEntry; kind: 'friend' | 'in' | 'out' }> = !this.data ? []
      : this.tab === 'friends' ? this.data.friends.map((e) => ({ e, kind: 'friend' as const }))
        : [...this.data.incoming.map((e) => ({ e, kind: 'in' as const })), ...this.data.outgoing.map((e) => ({ e, kind: 'out' as const }))];
    const pages = Math.max(1, Math.ceil(entries.length / per));
    this.page = Math.min(this.page, pages - 1);
    this.rows = [];
    const bw = Math.min(104 * ui, (C.w * 0.55 - gap * 2) / 3);
    entries.slice(this.page * per, this.page * per + per).forEach(({ e, kind }, i) => {
      const y = listY + i * rowH;
      this.rows.push({ e, y: y + rowH / 2 - 2 * ui, kind });
      const btns: Array<[string, string, Button['style'], () => void, boolean]> = kind === 'friend'
        ? [['join', 'Rejoindre', 'primary', () => this.join(e), e.online && !!e.floor && e.floor !== 'cabin-interior'], ['profile', 'Profil', 'secondary', () => this.profile(e), true], ['remove', 'Retirer', 'ghost', () => this.confirmRemove(e), true]]
        : kind === 'in'
          ? [['accept', 'Accepter', 'gold', () => this.conn.send({ t: 'friendAnswer', id: e.id, accept: true }), true], ['refuse', 'Refuser', 'ghost', () => this.conn.send({ t: 'friendAnswer', id: e.id, accept: false }), true]]
          : [['cancel', 'Annuler', 'ghost', () => this.conn.send({ t: 'friendCancel', id: e.id }), true]];
      let x = C.x + C.w;
      for (let k = btns.length - 1; k >= 0; k--) {
        const [id, label, style, fn, en] = btns[k];
        x -= bw;
        out.push(makeButton({ id: `f-${id}-${e.id}`, label, style, fontSize: 13, enabled: en, x, y: y + (rowH - bh) / 2, w: bw, h: bh, onTap: fn }));
        x -= 6 * ui;
      }
    });
    if (pages > 1) {
      const py = C.y + C.h - bh;
      out.push(makeButton({ id: 'f-prev', label: '‹', style: 'secondary', fontSize: 20, enabled: this.page > 0, x: C.x, y: py, w: 54 * ui, h: bh, onTap: () => { this.page--; this.relayout(); } }));
      out.push(makeButton({ id: 'f-next', label: '›', style: 'secondary', fontSize: 20, enabled: this.page < pages - 1, x: C.x + C.w - 54 * ui, y: py, w: 54 * ui, h: bh, onTap: () => { this.page++; this.relayout(); } }));
    }
    return out;
  }

  private ask(): void {
    promptText('Code ami (KS-XXXXXX) ou pseudo', '', (v) => {
      if (!v) return;
      this.status = 'Envoi…'; this.relayout();
      this.conn.send({ t: 'friendAdd', query: v });
    });
  }

  private join(e: FriendEntry): void {
    if (!e.online || !e.floor) return;
    this.close();
    this.act.join(e.floor, e.name);
  }

  private profile(e: FriendEntry): void {
    const since = new Date(e.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const where = e.online ? `En ligne · ${FLOOR_NAMES[e.floor ?? ''] ?? e.floor ?? 'à bord'}` : 'Hors ligne';
    this.act.dialog(new InfoDialog(this.s, e.name, `${e.title ? `« ${e.title} »\n` : ''}Niveau ${e.level}\n${where}\nAmis depuis le ${since}`));
  }

  private confirmRemove(e: FriendEntry): void {
    this.act.dialog(new InfoDialog(this.s, 'Retirer cet ami ?', `${e.name} ne sera plus dans ta liste. Tu pourras lui renvoyer une demande plus tard.`, [
      { label: 'Annuler', style: 'ghost', onTap: () => {} },
      { label: 'Retirer', style: 'danger', onTap: () => this.conn.send({ t: 'friendRemove', id: e.id }) },
    ]));
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 700);
    ctx.fillText('Ton code ami', C.x, C.y + 10 * ui);
    ctx.fillStyle = LUXE.champagne; ctx.font = font(22 * ui, 900);
    ctx.fillText(this.data?.code ?? '…', C.x, C.y + 34 * ui, C.w - 170 * ui);
    for (const r of this.rows) {
      const e = r.e;
      ctx.fillStyle = e.online ? PAL.success : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(C.x + 6 * ui, r.y - 7 * ui, 4.5 * ui, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.text; ctx.font = font(15 * ui, 800);
      const maxW = C.w * 0.42;
      ctx.fillText(e.name, C.x + 18 * ui, r.y - 7 * ui, maxW);
      ctx.fillStyle = PAL.textDim; ctx.font = font(11.5 * ui, 600);
      const sub = r.kind === 'in' ? 'Veut devenir ton ami' : r.kind === 'out' ? 'Demande envoyée' : e.online ? `${FLOOR_NAMES[e.floor ?? ''] ?? 'À bord'} · niv. ${e.level}` : `Hors ligne · niv. ${e.level}`;
      ctx.fillText(sub, C.x + 18 * ui, r.y + 11 * ui, maxW);
    }
    const listEmpty = !this.rows.length && this.data;
    if (listEmpty) {
      ctx.fillStyle = PAL.textDim; ctx.font = font(14 * ui, 600);
      const y = C.y + 44 * ui + Math.max(44, 44 * ui) + 50 * ui;
      ctx.fillText(this.tab === 'friends' ? 'Pas encore d’amis : partage ton code ou ajoute un joueur.' : 'Aucune demande en attente.', C.x, y, C.w);
    }
    if (this.status) {
      ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 700); ctx.textAlign = 'center';
      ctx.fillText(this.status, C.x + C.w / 2, C.y + C.h - Math.max(44, 44 * ui) - 12 * ui, C.w - 130 * ui);
    }
    ctx.restore();
  }
}
