// Aménagement de la cabine : plan de la pièce (cases), inventaire des objets possédés, boutique de meubles
// (KSCoins, niveau requis) et choix du style. Toucher un objet de l'inventaire puis une case le pose ; toucher
// un meuble posé le reprend (on peut le déplacer, le pivoter ou le ranger). « Enregistrer » envoie la
// disposition à l'autorité, qui la valide (cases libres, passage vers la porte) et la sauvegarde.
import { drawKSCoin, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { drawFurniture, furnitureExtraTop } from '../art/furniture';
import { CABIN_WALL_COLORS, PAL } from '../art/palette';
import { checkLayout, footprint, ROOM, ROOM_FIXED } from '../authority/room';
import { newRoom, type RoomItem, type RoomState } from '../authority/progress';
import { FURNITURE, FURNITURE_BY_ID, maxCopies, ROOM_STYLES, type FurnitureDef } from '../data/furniture';
import type { PointerInfo } from '../engine/Input';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { TILE } from '../world/types';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

type Tab = 'items' | 'shop' | 'style';
const CAT_LABEL: Record<string, string> = { lit: 'Lit', 'canapé': 'Assise', table: 'Table', rangement: 'Rangement', 'éclairage': 'Éclairage', 'décoration': 'Décoration', collection: 'Collection', tapis: 'Tapis', plante: 'Plante' };

export class RoomEditor extends Modal {
  private placed: RoomItem[];
  private style: string;
  private tab: Tab = 'items';
  private page = 0;
  /** Objet en main : nouvel objet de l'inventaire, ou meuble repris sur le plan. */
  private holding: { item: string; rot: 0 | 1; uid: string; from?: RoomItem } | null = null;
  private plan = { x: 0, y: 0, cell: 10 };
  private listArea = { x: 0, y: 0, w: 0, h: 0 };
  private vp!: Viewport;
  private busy = false;
  private dirty = false;
  private hint = 'Touche un objet, puis une case du plan pour le poser.';
  private uidSeq = 0;

  constructor(s: Services, private wallColor: number, private onSaved: (room: RoomState) => void, private onWallColor: (i: number) => void) {
    super(s, 'Aménager ma cabine');
    const r = this.room;
    this.placed = r.placed.map((p) => ({ ...p }));
    this.style = r.style;
    this.layer.onBackgroundTap = (p) => this.tapPlan(p);
  }

  private get room(): RoomState { return this.s.data.room ?? newRoom(); }
  private get level(): number { return this.s.progress.level; }

  /** Exemplaires non posés de chaque objet possédé. */
  private stock(): Array<[FurnitureDef, number]> {
    const used: Record<string, number> = {};
    for (const p of this.placed) used[p.item] = (used[p.item] ?? 0) + 1;
    if (this.holding && !this.holding.from) used[this.holding.item] = (used[this.holding.item] ?? 0) + 1;
    return Object.entries(this.room.owned).map(([id, n]) => [FURNITURE_BY_ID.get(id)!, n - (used[id] ?? 0)] as [FurnitureDef, number]).filter(([f, n]) => f && n > 0);
  }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 980 * vp.ui), h: Math.min(maxH, 720 * vp.ui) };
  }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, bh = Math.max(44, 44 * ui);
    const landscape = C.w > C.h * 1.15;
    // Plan de la pièce (14 × 10 cases)
    const planW = landscape ? C.w * 0.52 : C.w, planHmax = landscape ? C.h - bh - gap : C.h * 0.42;
    const cell = Math.floor(Math.min(planW / ROOM.w, planHmax / ROOM.h));
    this.plan = { x: C.x + (landscape ? 0 : (C.w - cell * ROOM.w) / 2), y: C.y, cell };
    const btns: Button[] = [];
    // Outils de l'objet en main (sous le plan)
    const toolsY = C.y + cell * ROOM.h + gap;
    const tools: Array<[string, string, () => void, boolean]> = [
      ['rotate', 'Pivoter', () => this.rotate(), !!this.holding],
      ['store', 'Ranger', () => this.store(), !!this.holding?.from],
      ['cancel', 'Annuler', () => this.cancelHold(), !!this.holding],
      ['save', this.busy ? '…' : 'Enregistrer', () => void this.save(), this.dirty && !this.busy && !this.holding],
    ];
    const tw = Math.min(150 * ui, (cell * ROOM.w - gap * 3) / 4);
    tools.forEach(([id, label, fn, en], i) => btns.push(makeButton({ id: `room-${id}`, label, style: id === 'save' ? 'gold' : 'secondary', fontSize: 14, enabled: en, x: this.plan.x + i * (tw + gap), y: toolsY, w: tw, h: bh, onTap: fn })));
    // Onglets et liste
    const lx = landscape ? C.x + cell * ROOM.w + 16 * ui : C.x, ly = landscape ? C.y : toolsY + bh + gap + 22 * ui;
    const lw = landscape ? C.x + C.w - lx : C.w, lh = C.y + C.h - ly;
    const tabs: Array<[Tab, string]> = [['items', 'Mes objets'], ['shop', 'Boutique'], ['style', 'Style']];
    const tbw = (lw - gap * 2) / 3;
    tabs.forEach(([id, label], i) => btns.push(makeButton({ id: `tab-${id}`, label, style: 'secondary', active: this.tab === id, fontSize: 14, x: lx + i * (tbw + gap), y: ly, w: tbw, h: bh, onTap: () => { this.tab = id; this.page = 0; this.relayout(); } })));
    const area = { x: lx, y: ly + bh + gap, w: lw, h: lh - bh * 2 - gap * 2 };
    this.listArea = area;
    btns.push(...this.listButtons(area, ui, bh));
    return btns;
  }

  private listButtons(A: { x: number; y: number; w: number; h: number }, ui: number, bh: number): Button[] {
    const gap = 8 * ui, out: Button[] = [];
    type Entry = { id: string; label: string; sub: string; enabled: boolean; active?: boolean; icon?: Button['icon']; onTap: () => void };
    let entries: Entry[] = [];
    const icon = (f: FurnitureDef): Button['icon'] => (ctx, cx, cy, sz) => this.drawIcon(ctx, f, cx, cy, sz * 1.1);
    if (this.tab === 'items') {
      const st = this.stock();
      entries = st.map(([f, n]) => ({ id: `inv-${f.id}`, label: f.name, sub: `${CAT_LABEL[f.category]} · ${n} en réserve`, enabled: !this.busy, active: this.holding?.item === f.id && !this.holding.from, icon: icon(f), onTap: () => this.pick(f) }));
      if (!entries.length) entries = [{ id: 'inv-empty', label: 'Tout est installé', sub: 'Achète des meubles dans la Boutique', enabled: true, onTap: () => { this.tab = 'shop'; this.relayout(); } }];
    } else if (this.tab === 'shop') {
      // Achetables d'abord (prix croissant), puis à débloquer (niveau), puis les récompenses
      const rank = (f: FurnitureDef) => (f.reward ? 2 : f.level > this.level ? 1 : 0);
      const list = FURNITURE.slice().sort((a, b) => rank(a) - rank(b) || a.level - b.level || a.price - b.price);
      entries = list.map((f) => {
        const owned = this.room.owned[f.id] ?? 0, max = maxCopies(f);
        const locked = this.level < f.level;
        const sub = f.reward ? (owned ? 'Obtenu' : f.level > 1 ? `Récompense du niveau ${f.level}` : 'Récompense de mission')
          : locked ? `Niveau ${f.level} requis · ${f.price} KSCoins`
            : owned >= max ? `Maximum atteint (${owned})` : `${f.price} KSCoins${owned ? ` · possédé ×${owned}` : ''}`;
        return { id: `buy-${f.id}`, label: f.name, sub, enabled: !f.reward && !locked && owned < max && !this.busy && this.s.wallet.balance >= f.price, icon: icon(f), onTap: () => void this.buy(f) };
      });
    } else {
      entries = ROOM_STYLES.map((st) => {
        const ok = st.level <= this.level || this.s.progress.unlocks.includes(`style:${st.id}`);
        return { id: `style-${st.id}`, label: `Style ${st.name}`, sub: ok ? (this.style === st.id ? 'Style actuel' : 'Appliquer') : `Niveau ${st.level} requis`, enabled: ok, active: this.style === st.id,
          icon: (ctx, cx, cy, sz) => { ctx.fillStyle = st.wall; ctx.fillRect(cx - sz * 0.5, cy - sz * 0.5, sz, sz * 0.55); ctx.fillStyle = st.floor; ctx.fillRect(cx - sz * 0.5, cy + sz * 0.05, sz, sz * 0.45); ctx.strokeStyle = st.trim; ctx.lineWidth = 2; ctx.strokeRect(cx - sz * 0.5, cy - sz * 0.5, sz, sz); },
          onTap: () => { if (this.style !== st.id) { this.style = st.id; this.dirty = true; this.s.audio.tap(); this.relayout(); } } };
      });
      if (this.style === 'marin') CABIN_WALL_COLORS.forEach((c, i) => entries.push({ id: `wall-${i}`, label: `Murs : ${c.name}`, sub: i === this.wallColor ? 'Couleur actuelle' : 'Peindre (style marin)', enabled: !this.dirty, active: i === this.wallColor,
        icon: (ctx, cx, cy, sz) => { ctx.fillStyle = c.face; ctx.beginPath(); ctx.arc(cx, cy, sz * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); },
        onTap: () => { if (i !== this.wallColor) { this.close(); this.onWallColor(i); } } }));
    }
    // Pagination : autant de lignes que la place le permet
    const rowH = Math.max(52, 58 * ui), cols = A.w > 520 * ui ? 2 : 1;
    const rows = Math.max(1, Math.floor((A.h + gap) / (rowH + gap)));
    const per = rows * cols, pages = Math.max(1, Math.ceil(entries.length / per));
    this.page = Math.min(this.page, pages - 1);
    const cw = (A.w - gap * (cols - 1)) / cols;
    entries.slice(this.page * per, this.page * per + per).forEach((e, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      out.push(makeButton({ id: e.id, label: e.label, sub: e.sub, style: 'secondary', fontSize: 14, enabled: e.enabled, active: e.active, icon: e.icon, x: A.x + c * (cw + gap), y: A.y + r * (rowH + gap), w: cw, h: rowH, onTap: e.onTap }));
    });
    const py = A.y + A.h + gap, pw = Math.max(52, 60 * ui);
    out.push(makeButton({ id: 'page-prev', label: '‹', style: 'secondary', fontSize: 22, enabled: this.page > 0, x: A.x, y: py, w: pw, h: bh, onTap: () => { this.page--; this.relayout(); } }));
    out.push(makeButton({ id: 'page-next', label: '›', style: 'secondary', fontSize: 22, enabled: this.page < pages - 1, x: A.x + A.w - pw, y: py, w: pw, h: bh, onTap: () => { this.page++; this.relayout(); } }));
    this.pageLabel = pages > 1 ? `${this.page + 1} / ${pages}` : '';
    this.pageY = py + bh / 2;
    return out;
  }
  private pageLabel = '';
  private pageY = 0;

  private relayout(): void { if (this.vp) this.layout(this.vp); }

  private pick(f: FurnitureDef): void {
    if (this.holding?.from) this.cancelHold();
    this.holding = { item: f.id, rot: 0, uid: `n${Date.now().toString(36).slice(-5)}${this.uidSeq++}` };
    this.hint = `${f.name} : touche une case du plan.`;
    this.s.audio.tap();
    this.relayout();
  }

  private rotate(): void {
    const h = this.holding; if (!h) return;
    const f = FURNITURE_BY_ID.get(h.item)!;
    if (f.w === f.h) { this.hint = 'Cet objet est symétrique.'; return; }
    h.rot = h.rot ? 0 : 1; this.s.audio.tap();
    if (h.from) {
      // Pivot sur place si possible
      const moved = { ...h.from, rot: h.rot };
      const err = checkLayout([...this.placed, moved], this.room.owned);
      if (!err) { this.placed.push(moved); this.holding = null; this.dirty = true; this.hint = 'Pivoté.'; }
      else this.hint = 'Pivoté : touche une case pour le reposer.';
    }
    this.relayout();
  }

  private store(): void {
    if (!this.holding?.from) return;
    this.holding = null; this.dirty = true;
    this.hint = 'Rangé dans « Mes objets ».';
    this.s.audio.back();
    this.relayout();
  }

  private cancelHold(): void {
    const h = this.holding; if (!h) return;
    if (h.from) this.placed.push(h.from);
    this.holding = null; this.hint = 'Touche un objet, puis une case du plan pour le poser.';
    this.relayout();
  }

  private cellAt(p: PointerInfo): { x: number; y: number } | null {
    const P = this.plan, x = Math.floor((p.x - P.x) / P.cell), y = Math.floor((p.y - P.y) / P.cell);
    return x >= 0 && y >= 0 && x < ROOM.w && y < ROOM.h ? { x, y } : null;
  }

  private tapPlan(p: PointerInfo): void {
    const r = this.panel;
    if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) { this.close(); return; }
    const c = this.cellAt(p);
    if (!c || this.busy) return;
    const h = this.holding;
    if (!h) {
      // Reprendre le meuble touché (les objets muraux d'abord sur la rangée du mur, puis les meubles, puis les tapis)
      const hit = (it: RoomItem) => footprint(FURNITURE_BY_ID.get(it.item)!, it).some(([x, y]) => x === c.x && y === c.y);
      const order = [...this.placed].sort((a, b) => this.layerOf(b) - this.layerOf(a));
      const it = order.find(hit);
      if (!it) { this.hint = 'Case vide : choisis un objet dans « Mes objets ».'; return; }
      this.placed = this.placed.filter((q) => q !== it);
      this.holding = { item: it.item, rot: it.rot, uid: it.uid, from: it };
      this.hint = `${FURNITURE_BY_ID.get(it.item)!.name} : touche une case pour le déplacer.`;
      this.s.audio.tap();
      this.relayout();
      return;
    }
    const f = FURNITURE_BY_ID.get(h.item)!;
    const cand: RoomItem = { uid: h.uid, item: h.item, x: c.x, y: f.wall ? 1 : c.y, rot: h.rot };
    const err = checkLayout([...this.placed, cand], this.room.owned);
    if (err) { this.hint = err; this.s.audio.error(); return; }
    this.placed.push(cand);
    this.holding = null; this.dirty = true;
    this.hint = `${f.name} : en place. « Enregistrer » pour garder la disposition.`;
    this.s.audio.chip();
    this.relayout();
  }

  private layerOf(it: RoomItem): number { const f = FURNITURE_BY_ID.get(it.item)!; return f.wall ? 3 : f.category === 'tapis' ? 1 : 2; }

  private async buy(f: FurnitureDef): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'room', 'room-buy', { item: f.id });
    this.busy = false;
    if (!r.ok) { this.hint = r.error; this.s.audio.error(); this.relayout(); return; }
    this.s.audio.coin();
    this.hint = `${f.name} acheté : retrouve-le dans « Mes objets ».`;
    this.relayout();
  }

  private async save(): Promise<void> {
    if (this.busy || this.holding) return;
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'room', 'room-layout', { placed: this.placed, style: this.style });
    this.busy = false;
    if (!r.ok) { this.hint = r.error; this.s.audio.error(); this.relayout(); return; }
    this.dirty = false;
    this.s.audio.ding();
    this.close();
    this.onSaved(this.room);
  }

  private drawIcon(ctx: CanvasRenderingContext2D, f: FurnitureDef, cx: number, cy: number, size: number): void {
    const ex = furnitureExtraTop(f), fw = f.w * TILE, fh = (f.h + ex) * TILE;
    const k = size / Math.max(fw, fh);
    ctx.save(); ctx.translate(cx - (fw * k) / 2, cy - (fh * k) / 2 + ex * TILE * k); ctx.scale(k, k);
    drawFurniture(ctx, f, fw, f.h * TILE, 0);
    ctx.restore();
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, P = this.plan, cs = P.cell, st = ROOM_STYLES.find((x) => x.id === this.style) ?? ROOM_STYLES[0];
    const wall = this.style === 'marin' ? (CABIN_WALL_COLORS[this.wallColor] ?? CABIN_WALL_COLORS[0]).face : st.wall;
    // Murs et sol
    ctx.save();
    roundRect(ctx, P.x, P.y, cs * ROOM.w, cs * ROOM.h, 6 * ui); ctx.fillStyle = wall; ctx.fill();
    ctx.fillStyle = st.floor; ctx.fillRect(P.x + cs, P.y + cs * 2, cs * (ROOM.w - 2), cs * (ROOM.h - 3));
    ctx.fillStyle = st.trim; ctx.fillRect(P.x + cs, P.y + cs * 2 - 2, cs * (ROOM.w - 2), 2);
    ctx.fillStyle = 'rgba(150,210,255,0.85)'; for (const x of [4, 8]) ctx.fillRect(P.x + x * cs + 2, P.y + 2, cs * 2 - 4, cs * 1.6);
    // Grille
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let x = 1; x < ROOM.w; x++) { ctx.beginPath(); ctx.moveTo(P.x + x * cs, P.y + cs); ctx.lineTo(P.x + x * cs, P.y + (ROOM.h - 1) * cs); ctx.stroke(); }
    for (let y = 1; y < ROOM.h; y++) { ctx.beginPath(); ctx.moveTo(P.x + cs, P.y + y * cs); ctx.lineTo(P.x + (ROOM.w - 1) * cs, P.y + y * cs); ctx.stroke(); }
    // Éléments fixes
    ctx.fillStyle = 'rgba(30,20,10,0.45)';
    for (const k of ROOM_FIXED) { const [x, y] = k.split(',').map(Number); if (y < 8) ctx.fillRect(P.x + x * cs + 1, P.y + y * cs + 1, cs - 2, cs - 2); }
    ctx.fillStyle = 'rgba(212,175,90,0.5)'; ctx.fillRect(P.x + 6 * cs, P.y + 9 * cs, cs * 2, cs);
    ctx.font = font(Math.max(9, cs * 0.32), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText('Porte', P.x + 7 * cs, P.y + 9.5 * cs);
    ctx.fillText('Bureau', P.x + 2 * cs, P.y + 7.5 * cs);
    ctx.fillText('Armoire', P.x + 11.5 * cs, P.y + 2.5 * cs);
    // Meubles (tapis, puis meubles du fond vers l'avant, puis objets muraux)
    const items = [...this.placed].sort((a, b) => this.layerOf(a) - this.layerOf(b) || (a.y + footprint(FURNITURE_BY_ID.get(a.item)!, a).length) - (b.y + footprint(FURNITURE_BY_ID.get(b.item)!, b).length));
    for (const it of items) this.drawPlaced(ctx, it, 1);
    ctx.restore();
    // Objet en main : suit le dernier emplacement d'origine (fantôme) et liseré
    if (this.holding?.from) this.drawPlaced(ctx, { ...this.holding.from, rot: this.holding.rot }, 0.35);
    // Aide
    ctx.save();
    ctx.font = font(13 * ui, 700); ctx.fillStyle = this.holding ? LUXE.champagne : PAL.textDim; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const toolsBottom = P.y + cs * ROOM.h + 8 * ui + Math.max(44, 44 * ui) + 4 * ui;
    ctx.fillText(this.hint, P.x, toolsBottom, Math.max(cs * ROOM.w, this.content.w * 0.5));
    // Solde + pagination
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 800);
    if (this.pageLabel) ctx.fillText(this.pageLabel, this.listArea.x + this.listArea.w / 2, this.pageY);
    ctx.font = font(19 * ui, 800);
    const titleEnd = this.panel.x + 20 * ui + ctx.measureText(this.title).width + 24 * ui;
    const fitsTop = titleEnd + 90 * ui < this.closeBtn.x;
    const bx = fitsTop ? Math.max(titleEnd, this.closeBtn.x - 130 * ui) : this.panel.x + this.panel.w - 110 * ui;
    const by = fitsTop ? this.panel.y + 28 * ui : this.listArea.y - Math.max(44, 44 * ui) - 22 * ui;
    ctx.font = font(13 * ui, 800);
    drawKSCoin(ctx, bx, by, 10 * ui);
    ctx.textAlign = 'left'; ctx.fillStyle = LUXE.champagne; ctx.fillText(`${this.s.wallet.balance}`, bx + 14 * ui, by);
    ctx.restore();
  }

  private drawPlaced(ctx: CanvasRenderingContext2D, it: RoomItem, alpha: number): void {
    const f = FURNITURE_BY_ID.get(it.item); if (!f) return;
    const P = this.plan, cs = P.cell, k = cs / TILE;
    const w = it.rot ? f.h : f.w, h = it.rot ? f.w : f.h;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(P.x + it.x * cs, P.y + it.y * cs); ctx.scale(k, k);
    drawFurniture(ctx, f, w * TILE, h * TILE, it.rot);
    ctx.restore();
    if (alpha < 1) { ctx.save(); ctx.strokeStyle = LUXE.champagne; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(P.x + it.x * cs, P.y + it.y * cs, w * cs, h * cs); ctx.restore(); }
  }
}
