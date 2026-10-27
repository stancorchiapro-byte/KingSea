// Téléphone KS (objet de l'inventaire) : Messages (conversations privées, non-lus, historique), Contacts (amis,
// statut en ligne, surnom, favori, écrire, sonner, offrir), Cadeaux (capacité de don sur 24 h glissantes,
// historique des transferts) et Cabine (porte ouverte / fermée, visiteurs présents).
// Toutes les données viennent du serveur ; hors ligne, le téléphone l'indique simplement.
import { LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { GIFT_RULES } from '../authority/gifts';
import { GIFT_ITEM_MAX_VALUE, giftable, ITEMS_BY_ID } from '../data/items';
import type { Viewport } from '../engine/Viewport';
import { durationText, type PhoneState } from '../net/Phone';
import type { FriendEntry, GiftPayload } from '../net/protocol';
import type { Services } from '../systems/Services';
import { drawAvatar } from './avatar';
import { keyIcon } from './itemIcons';
import { Modal } from './Modal';
import { promptNumber, promptText } from './TextPrompt';
import { font, makeButton, wrapText, type Button } from './UIKit';

type Tab = 'messages' | 'contacts' | 'gifts' | 'cabin';
type View =
  | { k: 'tab' }
  | { k: 'chat'; id: string }
  | { k: 'gift'; id: string }
  | { k: 'giftItem'; id: string }
  | { k: 'confirm'; id: string; gift: GiftPayload; label: string };

const FLOOR_NAMES: Record<string, string> = { hub: 'Hall', engine: 'Salle des machines', casino: 'Casino', arcade: 'Arcade', cabins: 'Logements', rooftop: 'Rooftop', panorama: 'Pont Panorama', 'cabin-interior': 'En cabine' };

let lastTab: Tab = 'messages';

export class PhoneMenu extends Modal {
  private tab: Tab = lastTab;
  private view: View = { k: 'tab' };
  private vp: Viewport | null = null;
  private status = '';
  private busy = false;
  private page = 0;
  private rows: Array<{ y: number; h: number; draw: (ctx: CanvasRenderingContext2D, y: number) => void }> = [];
  private onChange = () => this.relayout();

  constructor(s: Services, private phone: PhoneState | null, start?: { tab?: Tab; giftKey?: string; chat?: string }) {
    super(s, 'Téléphone KS');
    if (start?.tab) this.tab = start.tab;
    phone?.changed.add(this.onChange);
    phone?.refresh();
    if (start?.chat && phone) { this.view = { k: 'chat', id: start.chat }; phone.openConversation(start.chat); }
    if (start?.giftKey) { this.tab = 'contacts'; this.pendingKey = start.giftKey; this.status = 'Choisis l’ami à qui offrir ce double de clé.'; }
  }
  /** Double de clé à offrir (ouvert depuis l'inventaire) : le prochain ami choisi le reçoit après confirmation. */
  private pendingKey: string | null = null;

  close(): void { this.phone?.changed.delete(this.onChange); this.phone?.closeConversation(); super.close(); }
  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }
  private go(v: View): void { this.view = v; this.page = 0; this.status = ''; this.relayout(); }

  protected measure(vp: Viewport, maxW: number, maxH: number) { return { w: Math.min(maxW, 600 * vp.ui), h: Math.min(maxH, 600 * vp.ui) }; }

  private friendsList(): FriendEntry[] {
    const f = this.phone?.friends?.friends ?? [];
    const fav = new Set((this.phone?.contacts ?? []).filter((c) => c.fav).map((c) => c.id));
    return [...f].sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, out: Button[] = [], bh = Math.max(42, 42 * ui);
    this.rows = [];
    const P = this.phone;
    if (!P) return out;
    if (this.view.k !== 'tab') {
      out.push(makeButton({ id: 'ph-back', label: '‹ Retour', style: 'ghost', fontSize: 13, x: C.x, y: C.y, w: 110 * ui, h: bh, onTap: () => { if (this.view.k === 'chat') P.closeConversation(); this.go({ k: 'tab' }); } }));
      return [...out, ...this.placeView(vp, C.y + bh + 10 * ui)];
    }
    const tabs: Array<[Tab, string]> = [['messages', `Messages${P.unread ? ` · ${P.unread}` : ''}`], ['contacts', 'Contacts'], ['gifts', 'Cadeaux'], ['cabin', 'Ma cabine']];
    const tw = (C.w - gap * 3) / 4;
    tabs.forEach(([id, label], i) => out.push(makeButton({ id: `ph-${id}`, label, style: 'secondary', active: this.tab === id, fontSize: 12.5, x: C.x + i * (tw + gap), y: C.y, w: tw, h: bh,
      onTap: () => { this.tab = lastTab = id; this.page = 0; this.status = this.pendingKey && id === 'contacts' ? this.status : ''; this.relayout(); } })));
    const top = C.y + bh + 12 * ui, bottom = C.y + C.h - 22 * ui;
    const rowH = Math.max(58, 60 * ui);
    const per = Math.max(1, Math.floor((bottom - top - bh - gap) / rowH));
    const pager = (n: number) => {
      const pages = Math.max(1, Math.ceil(n / per)); this.page = Math.min(this.page, pages - 1);
      if (pages > 1) {
        out.push(makeButton({ id: 'ph-prev', label: '‹', style: 'secondary', fontSize: 20, enabled: this.page > 0, x: C.x, y: bottom - bh, w: 54 * ui, h: bh, onTap: () => { this.page--; this.relayout(); } }));
        out.push(makeButton({ id: 'ph-next', label: '›', style: 'secondary', fontSize: 20, enabled: this.page < pages - 1, x: C.x + C.w - 54 * ui, y: bottom - bh, w: 54 * ui, h: bh, onTap: () => { this.page++; this.relayout(); } }));
      }
    };
    if (this.tab === 'messages') {
      const convs = P.convs;
      convs.slice(this.page * per, this.page * per + per).forEach((cv, i) => {
        const y = top + i * rowH;
        out.push(makeButton({ id: `ph-conv-${cv.with}`, label: '', style: 'ghost', x: C.x, y, w: C.w, h: rowH - 6 * ui, onTap: () => { P.openConversation(cv.with); this.go({ k: 'chat', id: cv.with }); },
          draw: (ctx, b) => this.drawConv(ctx, b, ui, cv.with) }));
      });
      pager(convs.length);
    } else if (this.tab === 'contacts') {
      const list = this.friendsList();
      const bw = Math.min(86 * ui, (C.w * 0.58 - gap * 3) / 4);
      list.slice(this.page * per, this.page * per + per).forEach((f, i) => {
        const y = top + i * rowH, by = y + (rowH - 6 * ui - bh) / 2;
        const fav = P.contacts.find((c) => c.id === f.id)?.fav ?? false;
        this.rows.push({ y, h: rowH, draw: (ctx, yy) => this.drawFriend(ctx, ui, f, yy, fav) });
        const acts: Array<[string, string, Button['style'], () => void, boolean]> = this.pendingKey
          ? [['key', 'Offrir la clé', 'gold', () => this.confirmKey(f), true]]
          : [
              ['msg', 'Écrire', 'primary', () => { P.openConversation(f.id); this.go({ k: 'chat', id: f.id }); }, true],
              ['ring', 'Sonner', 'secondary', () => { P.ring(f.id); this.status = `Coup de sonnette chez ${f.name}…`; this.relayout(); }, f.online],
              ['gift', 'Cadeau', 'gold', () => this.go({ k: 'gift', id: f.id }), true],
              ['more', fav ? '★' : '☆', 'ghost', () => this.contactMenu(f, fav), true],
            ];
        let x = C.x + C.w;
        for (let k = acts.length - 1; k >= 0; k--) {
          const [id, label, style, fn, en] = acts[k];
          const w = id === 'more' ? 44 * ui : id === 'key' ? 140 * ui : bw;
          x -= w;
          out.push(makeButton({ id: `ph-${id}-${f.id}`, label, style, fontSize: id === 'more' ? 18 : 12.5, enabled: en, x, y: by, w, h: bh, onTap: fn }));
          x -= 6 * ui;
        }
      });
      pager(list.length);
    } else if (this.tab === 'gifts') {
      // Rien à placer : informations et historique (renderContent) ; on offre depuis l'onglet Contacts
      out.push(makeButton({ id: 'ph-gift-choose', label: 'Offrir à un ami', style: 'gold', fontSize: 14, x: C.x, y: bottom - bh, w: Math.min(C.w, 240 * ui), h: bh, onTap: () => { this.tab = lastTab = 'contacts'; this.relayout(); } }));
    } else if (this.tab === 'cabin') {
      out.push(makeButton({ id: 'ph-door', label: P.doorOpen ? 'Fermer ma porte à clé' : 'Ouvrir ma porte', sub: P.doorOpen ? 'Plus de visite ni de sonnette' : 'Les amis peuvent sonner', style: P.doorOpen ? 'secondary' : 'gold', fontSize: 14,
        x: C.x, y: top + 70 * ui, w: Math.min(C.w, 300 * ui), h: bh + 10 * ui, onTap: () => { P.setDoor(!P.doorOpen); P.doorOpen = !P.doorOpen; this.relayout(); } }));
      P.visitors.forEach((v, i) => out.push(makeButton({ id: `ph-kick-${v.id}`, label: 'Raccompagner', style: 'ghost', fontSize: 12.5, x: C.x + C.w - 140 * ui, y: top + 150 * ui + i * rowH, w: 140 * ui, h: bh, onTap: () => P.kick(v.id) })));
    }
    return out;
  }

  private placeView(vp: Viewport, top: number): Button[] {
    const ui = vp.ui, C = this.content, P = this.phone!, gap = 8 * ui, bh = Math.max(44, 44 * ui), out: Button[] = [];
    const v = this.view, bottom = C.y + C.h;
    if (v.k === 'chat') {
      out.push(makeButton({ id: 'ph-write', label: 'Écrire un message', style: 'gold', fontSize: 15, enabled: !this.busy && P.online, x: C.x, y: bottom - bh, w: C.w - 130 * ui - gap, h: bh, onTap: () => this.write(v.id) }));
      out.push(makeButton({ id: 'ph-del', label: 'Effacer', style: 'ghost', fontSize: 13, x: C.x + C.w - 130 * ui, y: bottom - bh, w: 130 * ui, h: bh, onTap: () => this.confirmDelete(v.id) }));
      if (P.more.get(v.id)) out.push(makeButton({ id: 'ph-older', label: 'Messages plus anciens', style: 'ghost', fontSize: 12, x: C.x + C.w - 200 * ui, y: C.y, w: 200 * ui, h: Math.max(42, 42 * ui), onTap: () => P.loadOlder(v.id) }));
    } else if (v.k === 'gift') {
      const a = P.allowance;
      const kinds: Array<[string, string, string, () => void, boolean]> = [
        ['coins', 'KSCoins', a ? `encore ${a.coinsLeft} sur 24 h` : '…', () => promptNumber('KSCoins à offrir', Math.min(100, a?.coinsLeft ?? 0), 1, Math.max(1, Math.min(a?.coinsLeft ?? 0, this.s.wallet.balance)), (n) => { if (n) this.confirm(v.id, { kind: 'coins', amount: n }, `${n} KSCoins`); }), !!a && a.coinsLeft > 0 && this.s.wallet.balance > 0],
        ['chips', 'Jetons de casino', `solde : ${this.s.chips.balance.toLocaleString('fr-FR')}`, () => promptNumber('Jetons à offrir', Math.min(100, this.s.chips.balance), 1, Math.max(1, Math.min(GIFT_RULES.maxChips, this.s.chips.balance)), (n) => { if (n) this.confirm(v.id, { kind: 'chips', amount: n }, `${n} jetons`); }), this.s.chips.balance > 0],
        ['item', 'Un objet', a ? `encore ${a.itemsLeft} sur 24 h · valeur ≤ ${GIFT_ITEM_MAX_VALUE}` : '…', () => this.go({ k: 'giftItem', id: v.id }), !!a && a.itemsLeft > 0],
      ];
      kinds.forEach(([id, label, sub, fn, en], i) => out.push(makeButton({ id: `ph-gk-${id}`, label, sub, style: id === 'coins' ? 'gold' : 'secondary', fontSize: 15, enabled: en && !this.busy, x: C.x, y: top + 40 * ui + i * (bh + 18 * ui + gap), w: C.w, h: bh + 18 * ui, onTap: fn })));
    } else if (v.k === 'giftItem') {
      const inv = this.s.data.inventory?.items ?? {};
      const items = Object.entries(inv).filter(([, n]) => n > 0).map(([id]) => ITEMS_BY_ID.get(id)).filter((d) => !!d).map((d) => ({ d: d!, g: giftable(d) }));
      const keys = (this.s.data.keys ?? []).filter((k) => !k.master);
      const rowH = bh + 6 * ui, per = Math.max(1, Math.floor((bottom - top - 20 * ui) / rowH));
      const all: Array<{ id: string; label: string; sub: string; ok: boolean; run: () => void; icon?: Button['icon'] }> = [
        ...keys.map((k) => ({ id: `key-${k.uid}`, label: k.name, sub: `Double de la cabine n° ${k.cabin}`, ok: true, icon: keyIcon(false), run: () => this.confirm(v.id, { kind: 'key', uid: k.uid }, `la clé « ${k.name} »`) })),
        ...items.map(({ d, g }) => ({ id: d.id, label: d.name, sub: g.ok ? `Valeur ${d.price}` : g.why, ok: g.ok, run: () => this.confirm(v.id, { kind: 'item', item: d.id }, d.name) })),
      ];
      all.slice(this.page * per, this.page * per + per).forEach((e, i) => out.push(makeButton({ id: `ph-gi-${e.id}`, label: e.label, sub: e.sub, style: 'secondary', enabled: e.ok && !this.busy, fontSize: 14, icon: e.icon, x: C.x, y: top + 20 * ui + i * rowH, w: C.w, h: bh, onTap: e.run })));
      if (!all.length) this.status = 'Aucun objet à offrir pour l’instant.';
    } else if (v.k === 'confirm') {
      out.push(makeButton({ id: 'ph-cancel', label: 'Annuler', style: 'ghost', fontSize: 15, x: C.x, y: bottom - bh, w: (C.w - gap) / 2, h: bh, onTap: () => { this.pendingKey = null; this.go({ k: 'tab' }); } }));
      out.push(makeButton({ id: 'ph-ok', label: this.busy ? 'Envoi…' : 'Confirmer le cadeau', style: 'gold', fontSize: 15, enabled: !this.busy, x: C.x + (C.w + gap) / 2, y: bottom - bh, w: (C.w - gap) / 2, h: bh, onTap: () => void this.sendGift(v) }));
    }
    return out;
  }

  // ---------------------------------------------------------------- actions
  private write(id: string): void {
    promptText(`Message à ${this.phone!.nameOf(id)}`, '', (text) => {
      if (!text || !this.phone) return;
      this.busy = true; this.relayout();
      void this.phone.send(id, text).then((r) => { this.busy = false; this.status = r.ok ? '' : r.msg ?? 'Message refusé'; if (r.ok) this.s.audio.tick(); else this.s.audio.error(); this.relayout(); });
    });
  }

  private confirmDelete(id: string): void {
    // Confirmation simple : deuxième toucher dans les 3 secondes
    if (this.status !== 'Touche encore « Effacer » pour supprimer cette conversation (de ton téléphone seulement).') {
      this.status = 'Touche encore « Effacer » pour supprimer cette conversation (de ton téléphone seulement).'; this.relayout();
      setTimeout(() => { if (this.status.startsWith('Touche encore')) { this.status = ''; this.relayout(); } }, 3000);
      return;
    }
    this.phone!.deleteConversation(id); this.phone!.closeConversation(); this.go({ k: 'tab' });
  }

  private contactMenu(f: FriendEntry, fav: boolean): void {
    const P = this.phone!;
    P.setContact(f.id, { fav: !fav });
    this.status = fav ? `${f.name} retiré des favoris` : `${f.name} en favori`;
    // Surnom : appui long impossible au canevas → proposé juste après
    promptText(`Surnom pour ${f.name} (vide : aucun)`, P.contacts.find((c) => c.id === f.id)?.nick ?? '', (v) => { if (v !== null) P.setContact(f.id, { nick: v.trim() || null }); });
  }

  private confirmKey(f: FriendEntry): void {
    const k = (this.s.data.keys ?? []).find((x) => x.uid === this.pendingKey);
    if (!k) { this.pendingKey = null; this.status = 'Cette clé n’est plus dans ton trousseau.'; this.relayout(); return; }
    this.confirm(f.id, { kind: 'key', uid: k.uid }, `la clé « ${k.name} »`);
  }

  private confirm(id: string, gift: GiftPayload, label: string): void { this.go({ k: 'confirm', id, gift, label }); }

  private async sendGift(v: Extract<View, { k: 'confirm' }>): Promise<void> {
    if (this.busy || !this.phone) return;
    this.busy = true; this.relayout();
    const r = await this.phone.gift(v.id, v.gift);
    this.busy = false;
    this.pendingKey = null;
    if (r.ok) { this.s.audio.ding(); this.s.haptic(30); this.view = { k: 'tab' }; this.tab = lastTab = 'gifts'; }
    else this.s.audio.error();
    this.status = r.msg;
    this.relayout();
  }

  // ---------------------------------------------------------------- dessin
  private drawConv(ctx: CanvasRenderingContext2D, b: Button, ui: number, id: string): void {
    const P = this.phone!, cv = P.convs.find((x) => x.with === id);
    if (!cv) return;
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, 12 * ui); ctx.fillStyle = b.pressed ? 'rgba(40,52,74,0.9)' : 'rgba(18,26,40,0.85)'; ctx.fill();
    const r = 18 * ui;
    drawAvatar(ctx, cv.look, cv.name, b.x + 12 * ui + r, b.y + b.h / 2, r, cv.online);
    const tx = b.x + 24 * ui + r * 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(14.5 * ui, cv.unread ? 900 : 700); ctx.fillStyle = PAL.text;
    ctx.fillText(`${cv.nick ?? cv.name}${cv.fav ? ' ★' : ''}`, tx, b.y + b.h * 0.34, b.w - (tx - b.x) - 60 * ui);
    ctx.font = font(12 * ui, cv.unread ? 700 : 500); ctx.fillStyle = cv.unread ? LUXE.champagne : PAL.textDim;
    const last = cv.last ? `${cv.last.from === P.me ? 'Toi : ' : ''}${cv.last.text}` : '';
    ctx.fillText(last, tx, b.y + b.h * 0.68, b.w - (tx - b.x) - 60 * ui);
    if (cv.unread) {
      const t = String(cv.unread); ctx.font = font(11 * ui, 900);
      const w = Math.max(20 * ui, ctx.measureText(t).width + 10 * ui);
      roundRect(ctx, b.x + b.w - w - 12 * ui, b.y + b.h / 2 - 10 * ui, w, 20 * ui, 10 * ui); ctx.fillStyle = '#e2445c'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, b.x + b.w - w / 2 - 12 * ui, b.y + b.h / 2 + 0.5);
    }
    ctx.restore();
  }

  private drawFriend(ctx: CanvasRenderingContext2D, ui: number, f: FriendEntry, y: number, fav: boolean): void {
    const C = this.content, r = 17 * ui, nick = this.phone!.contacts.find((c) => c.id === f.id)?.nick;
    drawAvatar(ctx, f.look, f.name, C.x + r, y + (Math.max(58, 60 * ui) - 6 * ui) / 2, r, f.online);
    const tx = C.x + r * 2 + 10 * ui, maxW = C.w * 0.42 - r * 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(14.5 * ui, 800); ctx.fillStyle = PAL.text;
    ctx.fillText(`${nick ?? f.name}${fav ? ' ★' : ''}`, tx, y + 16 * ui, maxW);
    ctx.font = font(11.5 * ui, 600); ctx.fillStyle = f.online ? '#7ee2a8' : PAL.textDim;
    ctx.fillText(f.online ? `En ligne · ${FLOOR_NAMES[f.floor ?? ''] ?? 'à bord'}` : `Hors ligne · niv. ${f.level}`, tx, y + 34 * ui, maxW);
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content, P = this.phone;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (!P) {
      ctx.fillStyle = PAL.text; ctx.font = font(15 * ui, 600);
      wrapText(ctx, 'Le téléphone KS fonctionne en ligne : messages privés, contacts, cadeaux entre amis et visites de cabine passent par le serveur du navire. Reviens au menu et choisis « En ligne » pour l’utiliser.', C.w)
        .forEach((l, i) => ctx.fillText(l, C.x, C.y + 20 * ui + i * 22 * ui));
      ctx.restore(); return;
    }
    if (!P.online) { ctx.fillStyle = '#f08a8a'; ctx.font = font(12 * ui, 700); ctx.fillText('Connexion perdue : reconnexion en cours…', C.x, C.y + C.h - 8 * ui, C.w); }
    for (const r of this.rows) r.draw(ctx, r.y);
    const v = this.view, bh = Math.max(42, 42 * ui), top = C.y + bh + 12 * ui;
    if (v.k === 'tab') {
      if (this.tab === 'messages' && !P.convs.length) this.empty(ctx, ui, 'Aucune conversation. Onglet Contacts : « Écrire » à un ami.', top);
      if (this.tab === 'contacts' && !(P.friends?.friends.length)) this.empty(ctx, ui, P.friends ? 'Pas encore d’amis : ajoute-en depuis le menu Amis (code ami ou pseudo).' : 'Chargement…', top);
      if (this.tab === 'gifts') this.renderGifts(ctx, ui, top);
      if (this.tab === 'cabin') this.renderCabin(ctx, ui, top);
    } else if (v.k === 'chat') this.renderChat(ctx, ui, v.id, C.y + Math.max(44, 44 * ui) + 10 * ui);
    else if (v.k === 'gift' || v.k === 'giftItem') {
      ctx.fillStyle = LUXE.champagne; ctx.font = font(16 * ui, 800);
      ctx.fillText(`Cadeau pour ${P.nameOf(v.id)}`, C.x, C.y + Math.max(44, 44 * ui) + 28 * ui, C.w);
    } else if (v.k === 'confirm') {
      ctx.fillStyle = PAL.text; ctx.font = font(17 * ui, 800);
      ctx.fillText(`Offrir ${v.label} à ${P.nameOf(v.id)} ?`, C.x, top + 40 * ui, C.w);
      ctx.font = font(13 * ui, 500); ctx.fillStyle = PAL.textDim;
      wrapText(ctx, 'Le cadeau est définitif : il quitte ton inventaire et arrive immédiatement chez ton ami (même hors ligne). Les jetons restent des jetons : aucune conversion.', C.w)
        .forEach((l, i) => ctx.fillText(l, C.x, top + 76 * ui + i * 19 * ui));
    }
    if (this.status) { ctx.fillStyle = LUXE.champagne; ctx.font = font(12.5 * ui, 700); ctx.textAlign = 'center'; ctx.fillText(this.status, C.x + C.w / 2, C.y + C.h - 8 * ui - (v.k !== 'tab' ? Math.max(44, 44 * ui) + 6 * ui : 0), C.w); }
    ctx.restore();
  }

  private empty(ctx: CanvasRenderingContext2D, ui: number, text: string, y: number): void {
    ctx.fillStyle = PAL.textDim; ctx.font = font(14 * ui, 600);
    wrapText(ctx, text, this.content.w).forEach((l, i) => ctx.fillText(l, this.content.x, y + 20 * ui + i * 20 * ui));
  }

  private renderGifts(ctx: CanvasRenderingContext2D, ui: number, top: number): void {
    const C = this.content, P = this.phone!, a = P.allowance;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(15 * ui, 800);
    ctx.fillText('Capacité de don (24 heures glissantes)', C.x, top + 12 * ui);
    ctx.font = font(13.5 * ui, 600); ctx.fillStyle = PAL.text;
    const cIn = P.freesIn('coins'), iIn = P.freesIn('items');
    ctx.fillText(a ? `KSCoins : encore ${a.coinsLeft} / ${GIFT_RULES.coinsPerWindow}${cIn !== null && a.coinsLeft < GIFT_RULES.coinsPerWindow ? ` · capacité rendue dans ${durationText(cIn)}` : ''}` : 'Chargement…', C.x, top + 36 * ui, C.w);
    ctx.fillText(a ? `Objets : encore ${a.itemsLeft} / ${GIFT_RULES.itemsPerWindow} (valeur ≤ ${GIFT_ITEM_MAX_VALUE} chacun)${iIn !== null && a.itemsLeft < GIFT_RULES.itemsPerWindow ? ` · dans ${durationText(iIn)}` : ''}` : '', C.x, top + 56 * ui, C.w);
    ctx.fillText('Jetons de casino : sans limite propre, transférés tels quels.', C.x, top + 76 * ui, C.w);
    ctx.fillStyle = LUXE.champagne; ctx.font = font(14 * ui, 800);
    ctx.fillText('Derniers transferts', C.x, top + 108 * ui);
    ctx.font = font(12.5 * ui, 600);
    const maxRows = Math.max(0, Math.floor((C.y + C.h - 80 * ui - (top + 128 * ui)) / (19 * ui)));
    if (!P.transfers.length) { ctx.fillStyle = PAL.textDim; ctx.fillText('Aucun cadeau envoyé ni reçu.', C.x, top + 130 * ui); }
    P.transfers.slice(0, maxRows).forEach((t, i) => {
      const out = t.from === P.me;
      ctx.fillStyle = out ? PAL.textDim : '#7ee2a8';
      ctx.fillText(out ? `→ ${t.toName} : ${t.label}` : `← ${t.fromName} : ${t.label}`, C.x, top + 130 * ui + i * 19 * ui, C.w);
    });
  }

  private renderCabin(ctx: CanvasRenderingContext2D, ui: number, top: number): void {
    const C = this.content, P = this.phone!, cabin = this.s.data.cabin.id;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(15 * ui, 800);
    ctx.fillText(cabin ? `Cabine n° ${cabin}` : 'Pas encore de cabine (couloir des logements)', C.x, top + 12 * ui, C.w);
    ctx.font = font(13 * ui, 600); ctx.fillStyle = PAL.textDim;
    ctx.fillText(P.doorOpen ? 'Porte ouverte aux visites : tes amis peuvent sonner.' : 'Porte fermée à clé : aucune visite, même avec un double.', C.x, top + 38 * ui, C.w);
    ctx.fillStyle = PAL.text; ctx.font = font(14 * ui, 800);
    ctx.fillText(P.visitors.length ? 'Visiteurs dans ta cabine' : 'Aucun visiteur pour le moment.', C.x, top + 140 * ui);
    P.visitors.forEach((v, i) => { ctx.font = font(13.5 * ui, 600); ctx.fillText(v.name, C.x, top + 150 * ui + i * Math.max(58, 60 * ui) + 20 * ui); });
    ctx.font = font(12 * ui, 500); ctx.fillStyle = PAL.textDim;
    ctx.fillText('Doubles de clé : chez le serrurier, couloir des logements.', C.x, C.y + C.h - 30 * ui, C.w);
  }

  private renderChat(ctx: CanvasRenderingContext2D, ui: number, id: string, top: number): void {
    const C = this.content, P = this.phone!, msgs = P.history.get(id) ?? [];
    const f = P.friends?.friends.find((x) => x.id === id);
    ctx.fillStyle = LUXE.champagne; ctx.font = font(16 * ui, 800);
    ctx.fillText(P.nameOf(id), C.x + 120 * ui, C.y + 21 * ui, C.w - 330 * ui);
    ctx.font = font(11.5 * ui, 600); ctx.fillStyle = f?.online ? '#7ee2a8' : PAL.textDim;
    ctx.fillText(f ? (f.online ? 'En ligne' : 'Hors ligne') : '', C.x + 120 * ui, C.y + 37 * ui);
    const bottom = C.y + C.h - Math.max(44, 44 * ui) - 30 * ui;
    // Bulles, de bas en haut (les plus récentes en bas)
    ctx.font = font(13 * ui, 500);
    const maxW = C.w * 0.72, lh = 17 * ui;
    let y = bottom;
    for (let i = msgs.length - 1; i >= 0 && y > top + 10 * ui; i--) {
      const m = msgs[i], mine = m.from === P.me;
      const lines = wrapText(ctx, m.text, maxW - 20 * ui).slice(0, 6);
      const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20 * ui), h = lines.length * lh + 12 * ui;
      y -= h;
      if (y < top) break;
      const x = mine ? C.x + C.w - w : C.x;
      roundRect(ctx, x, y, w, h, 12 * ui); ctx.fillStyle = mine ? 'rgba(31,199,193,0.28)' : 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.fillStyle = PAL.text; ctx.textAlign = 'left';
      lines.forEach((l, k) => ctx.fillText(l, x + 10 * ui, y + 6 * ui + lh * (k + 0.5)));
      if (mine && i === msgs.length - 1 && m.read) { ctx.font = font(10 * ui, 600); ctx.fillStyle = PAL.textDim; ctx.textAlign = 'right'; ctx.fillText('Lu', C.x + C.w, y + h + 9 * ui); ctx.font = font(13 * ui, 500); }
      y -= 8 * ui;
    }
    if (!msgs.length) { ctx.fillStyle = PAL.textDim; ctx.textAlign = 'center'; ctx.fillText('Aucun message : écris le premier !', C.x + C.w / 2, (top + bottom) / 2); }
  }
}
