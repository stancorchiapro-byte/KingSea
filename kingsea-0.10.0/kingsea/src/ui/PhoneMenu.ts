// Téléphone KS (objet personnel de l'inventaire), présenté comme un vrai smartphone : coque, barre d'état (heure du
// téléphone, comme le rooftop qui suit l'heure locale ; réseau du navire), écran d'accueil à icônes, applications
// avec en-tête « ‹ » et barre d'accueil, animations d'ouverture et de changement d'application.
// Chaque application s'appuie sur un système réel du jeu, sans copie des données :
//   • Messages, Contacts, Cadeaux : serveur du navire (en ligne) — hors ligne, l'application l'indique ;
//   • Ma cabine : cabine attribuée, clé, porte et visiteurs (porte et visiteurs en ligne) ;
//   • Plan du navire : ponts réels, accès (KS Pass, niveau) vérifiés comme à l'ascenseur, déplacement ;
//   • Portefeuille : soldes de l'autorité (KSCoins, jetons) et relevé des mouvements de jetons de la session ;
//   • Clés & pass : trousseau et KS Pass de l'inventaire ;
//   • Inventaire, Missions, Niveaux, Réglages : ouvrent les menus du jeu, puis reviennent au téléphone.
import { drawKSEmblem, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { GIFT_RULES } from '../authority/gifts';
import { levelProgress } from '../authority/progress';
import { GIFT_ITEM_MAX_VALUE, giftable, ITEMS_BY_ID } from '../data/items';
import type { Viewport } from '../engine/Viewport';
import { durationText, type PhoneState } from '../net/Phone';
import type { FriendEntry, GiftPayload } from '../net/protocol';
import type { Services } from '../systems/Services';
import { FLOORS } from '../world/floors';
import { drawAvatar } from './avatar';
import { floorLabel } from './ElevatorMenu';
import { keyIcon } from './itemIcons';
import { Modal } from './Modal';
import { promptNumber, promptText } from './TextPrompt';
import { font, Icons, makeButton, wrapText, type Button } from './UIKit';

export type PhoneApp = 'home' | 'messages' | 'contacts' | 'gifts' | 'cabin' | 'map' | 'wallet' | 'keys';
type Launch = 'inventory' | 'missions' | 'levels' | 'settings';

/** Liens vers les systèmes du jeu (fournis par la scène du navire). */
export interface PhoneLinks {
  /** Ouvre un menu du jeu ; le téléphone revient à l'écran d'accueil quand ce menu se ferme. */
  launch(app: Launch): void;
  /** Se rend à un pont (mêmes règles d'accès que l'ascenseur). */
  travel(floorId: string): void;
  /** Pont où se trouve le joueur. */
  floor: string;
}

interface AppDef { id: PhoneApp | Launch; name: string; c0: string; c1: string; online?: boolean }
const APPS: AppDef[] = [
  { id: 'messages', name: 'Messages', c0: '#3ad07f', c1: '#127a45', online: true },
  { id: 'contacts', name: 'Contacts', c0: '#5b9cff', c1: '#2350b0', online: true },
  { id: 'gifts', name: 'Cadeaux', c0: '#f0607a', c1: '#93203a', online: true },
  { id: 'cabin', name: 'Ma cabine', c0: '#d8b25a', c1: '#7d5d1b' },
  { id: 'map', name: 'Plan', c0: '#2fd3cc', c1: '#0c6b67' },
  { id: 'wallet', name: 'Portefeuille', c0: '#f3cf72', c1: '#946515' },
  { id: 'keys', name: 'Clés & pass', c0: '#b996ff', c1: '#5a37a6' },
  { id: 'inventory', name: 'Inventaire', c0: '#e59a4c', c1: '#8a4a12' },
  { id: 'missions', name: 'Missions', c0: '#ff8a5c', c1: '#a3361a' },
  { id: 'levels', name: 'Niveaux', c0: '#7fd1ff', c1: '#2a6c9a' },
  { id: 'settings', name: 'Réglages', c0: '#a7aebb', c1: '#4c5361' },
];
const APP_TITLES: Record<PhoneApp, string> = { home: 'Téléphone KS', messages: 'Messages', contacts: 'Contacts', gifts: 'Cadeaux', cabin: 'Ma cabine', map: 'Plan du navire', wallet: 'Portefeuille', keys: 'Clés & pass' };

type View =
  | { k: 'tab' }
  | { k: 'chat'; id: string }
  | { k: 'gift'; id: string }
  | { k: 'giftItem'; id: string }
  | { k: 'confirm'; id: string; gift: GiftPayload; label: string };

const FLOOR_NAMES: Record<string, string> = { hub: 'Hall', engine: 'Salle des machines', casino: 'Casino', arcade: 'Arcade', cabins: 'Logements', rooftop: 'Rooftop', panorama: 'Pont Panorama', 'cabin-interior': 'En cabine' };

interface Rect { x: number; y: number; w: number; h: number }

export class PhoneMenu extends Modal {
  private app: PhoneApp = 'home';
  private view: View = { k: 'tab' };
  private vp: Viewport | null = null;
  private status = '';
  private busy = false;
  private page = 0;
  /** Animation de changement d'application (0 → 1). */
  private appT = 1;
  private mapCol = { w: 0, bw: 0 };
  private frame: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private screen: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private header: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private homeBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rows: Array<{ y: number; h: number; draw: (ctx: CanvasRenderingContext2D, y: number) => void }> = [];
  private onChange = () => this.relayout();
  private backBtn: Button;
  private homeBtn: Button;
  /** Double de clé à offrir (ouvert depuis l'inventaire) : le prochain ami choisi le reçoit après confirmation. */
  private pendingKey: string | null = null;

  constructor(s: Services, private phone: PhoneState | null, private links: PhoneLinks, start?: { app?: PhoneApp; giftKey?: string; chat?: string }) {
    super(s, 'Téléphone KS');
    if (start?.app) this.app = start.app;
    phone?.changed.add(this.onChange);
    phone?.refresh();
    if (start?.chat && phone) { this.app = 'messages'; this.view = { k: 'chat', id: start.chat }; phone.openConversation(start.chat); }
    if (start?.giftKey) { this.app = 'contacts'; this.pendingKey = start.giftKey; this.status = 'Choisis l’ami à qui offrir ce double de clé.'; }
    this.backBtn = makeButton({ id: 'ph-back', label: '‹', style: 'ghost', fontSize: 24, onTap: () => this.back() });
    this.homeBtn = makeButton({ id: 'ph-home', label: '', style: 'ghost', onTap: () => this.goHome(), draw: (ctx, b, ui) => this.drawHomeBar(ctx, b, ui) });
  }

  get currentApp(): PhoneApp { return this.app; }

  close(): void { this.phone?.changed.delete(this.onChange); this.phone?.closeConversation(); super.close(); }
  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  /** Touche Retour / Échap : sous-écran → application → accueil → fermeture. */
  back(): boolean {
    if (this.app === 'home') return false;
    if (this.view.k !== 'tab') {
      if (this.view.k === 'chat') this.phone?.closeConversation();
      this.go({ k: 'tab' });
    } else this.goHome();
    return true;
  }
  private goHome(): void {
    if (this.app === 'home') { this.close(); return; }
    this.phone?.closeConversation();
    this.app = 'home'; this.view = { k: 'tab' }; this.page = 0; this.status = ''; this.appT = 0; this.pendingKey = null;
    this.relayout();
  }
  openApp(id: PhoneApp | Launch): void {
    if (id === 'inventory' || id === 'missions' || id === 'levels' || id === 'settings') { this.links.launch(id); return; }
    this.app = id; this.view = { k: 'tab' }; this.page = 0; this.status = this.pendingKey && id === 'contacts' ? this.status : ''; this.appT = 0;
    if (id === 'messages' || id === 'contacts' || id === 'gifts' || id === 'cabin') this.phone?.refresh();
    this.relayout();
  }
  private go(v: View): void { this.view = v; this.page = 0; this.status = ''; this.appT = 0.4; this.relayout(); }

  update(dt: number): void { super.update(dt); this.appT = Math.min(1, this.appT + dt * 6); }

  protected measure(vp: Viewport, maxW: number, maxH: number) { return { w: Math.min(maxW, 600 * vp.ui), h: Math.min(maxH, 600 * vp.ui) }; }

  /** Coque du téléphone : verticale sur écran vertical, horizontale (téléphone tourné) sur écran large. */
  layout(vp: Viewport): void {
    this.vp = vp;
    const ui = vp.ui;
    const ax = vp.safe.left, ay = vp.safe.top, aw = vp.width - vp.safe.left - vp.safe.right, ah = vp.height - vp.safe.top - vp.safe.bottom;
    const land = aw > ah * 1.15;
    let w: number, h: number;
    if (land) { h = ah - 12; w = Math.min(aw - 16, Math.max(h * 1.6, 560 * ui), 920 * ui); }
    else { w = Math.min(aw - 16, 480 * ui); h = Math.min(ah - 12, Math.max(w * 1.9, 560 * ui)); }
    const bezel = Math.max(7, 9 * ui);
    this.frame = { x: ax + (aw - w) / 2, y: ay + (ah - h) / 2, w, h };
    this.panel = this.frame;
    this.screen = { x: this.frame.x + bezel, y: this.frame.y + bezel, w: w - bezel * 2, h: h - bezel * 2 };
    const S = this.screen, sb = 24 * ui, hh = Math.max(46, 46 * ui), hb = 44;
    this.header = { x: S.x, y: S.y + sb, w: S.w, h: hh };
    this.homeBar = { x: S.x + S.w * 0.25, y: S.y + S.h - hb, w: S.w * 0.5, h: hb };
    const pad = 12 * ui;
    this.content = { x: S.x + pad, y: this.header.y + hh + 4 * ui, w: S.w - pad * 2, h: S.h - sb - hh - hb - 8 * ui };
    const cs = Math.max(44, 44 * ui);
    Object.assign(this.closeBtn, { x: S.x + S.w - cs - 4 * ui, y: this.header.y + (hh - cs) / 2, w: cs, h: cs });
    Object.assign(this.backBtn, { x: S.x + 4 * ui, y: this.header.y + (hh - cs) / 2, w: cs, h: cs, visible: this.app !== 'home' });
    Object.assign(this.homeBtn, this.homeBar);
    this.rows = [];
    this.layer.buttons = [...this.place(vp), this.backBtn, this.homeBtn, this.closeBtn];
  }

  // ---------------------------------------------------------------- placement
  protected place(vp: Viewport): Button[] {
    const ui = vp.ui;
    if (this.app === 'home') return this.placeHome(ui);
    const online = this.app === 'messages' || this.app === 'contacts' || this.app === 'gifts';
    if (online && !this.phone) return [];
    if (this.view.k !== 'tab') return this.placeView(vp, this.content.y);
    switch (this.app) {
      case 'messages': case 'contacts': case 'gifts': return this.placeOnline(ui);
      case 'cabin': return this.placeCabin(ui);
      case 'map': return this.placeMap(ui);
      case 'keys': return this.placeKeys(ui);
      default: return [];
    }
  }

  private placeHome(ui: number): Button[] {
    const C = this.content, cols = C.w > 520 * ui ? 6 : C.w > 330 * ui ? 4 : 3;
    const rows = Math.ceil(APPS.length / cols);
    const cellW = C.w / cols, cellH = Math.min(Math.max(84, 96 * ui), (C.h - 8 * ui) / rows);
    const size = Math.max(44, Math.min(cellW * 0.62, cellH - 24 * ui, 64 * ui));
    return APPS.map((a, i) => {
      const cx = C.x + (i % cols + 0.5) * cellW, cy = C.y + 6 * ui + Math.floor(i / cols) * cellH;
      return makeButton({ id: `app-${a.id}`, label: a.name, style: 'ghost', x: cx - Math.max(size, cellW * 0.9) / 2, y: cy, w: Math.max(size, cellW * 0.9), h: Math.max(size + 18 * ui, 44),
        onTap: () => this.openApp(a.id), draw: (ctx, b) => this.drawAppIcon(ctx, b, a, size, ui) });
    });
  }

  private placeOnline(ui: number): Button[] {
    const C = this.content, gap = 8 * ui, out: Button[] = [], bh = Math.max(44, 44 * ui), P = this.phone!;
    const top = C.y, bottom = C.y + C.h - 20 * ui;
    const rowH = Math.max(58, 60 * ui);
    const per = Math.max(1, Math.floor((bottom - top - bh - gap) / rowH));
    const pager = (n: number) => {
      const pages = Math.max(1, Math.ceil(n / per)); this.page = Math.min(this.page, pages - 1);
      if (pages > 1) {
        out.push(makeButton({ id: 'ph-prev', label: '‹', style: 'secondary', fontSize: 20, enabled: this.page > 0, x: C.x, y: bottom - bh, w: 54 * ui, h: bh, onTap: () => { this.page--; this.relayout(); } }));
        out.push(makeButton({ id: 'ph-next', label: '›', style: 'secondary', fontSize: 20, enabled: this.page < pages - 1, x: C.x + C.w - 54 * ui, y: bottom - bh, w: 54 * ui, h: bh, onTap: () => { this.page++; this.relayout(); } }));
      }
    };
    if (this.app === 'messages') {
      const convs = P.convs;
      convs.slice(this.page * per, this.page * per + per).forEach((cv, i) => {
        const y = top + i * rowH;
        out.push(makeButton({ id: `ph-conv-${cv.with}`, label: '', style: 'ghost', x: C.x, y, w: C.w, h: rowH - 6 * ui, onTap: () => { P.openConversation(cv.with); this.go({ k: 'chat', id: cv.with }); },
          draw: (ctx, b) => this.drawConv(ctx, b, ui, cv.with) }));
      });
      pager(convs.length);
    } else if (this.app === 'contacts') {
      const list = this.friendsList();
      const narrow = C.w < 400 * ui;
      const rowC = narrow ? rowH + bh : rowH;
      const perC = Math.max(1, Math.floor((bottom - top - bh - gap) / rowC));
      const pages = Math.max(1, Math.ceil(list.length / perC)); this.page = Math.min(this.page, pages - 1);
      list.slice(this.page * perC, this.page * perC + perC).forEach((f, i) => {
        const y = top + i * rowC, by = narrow ? y + rowH - 8 * ui : y + (rowH - 6 * ui - bh) / 2;
        const fav = P.contacts.find((c) => c.id === f.id)?.fav ?? false;
        this.rows.push({ y, h: rowH, draw: (ctx, yy) => this.drawFriend(ctx, ui, f, yy, fav, narrow) });
        const acts: Array<[string, string, Button['style'], () => void, boolean]> = this.pendingKey
          ? [['key', 'Offrir la clé', 'gold', () => this.confirmKey(f), true]]
          : [
              ['msg', 'Écrire', 'primary', () => { P.openConversation(f.id); this.go({ k: 'chat', id: f.id }); }, true],
              ['ring', 'Sonner', 'secondary', () => { P.ring(f.id); this.status = `Coup de sonnette chez ${f.name}…`; this.relayout(); }, f.online],
              ['gift', 'Cadeau', 'gold', () => this.go({ k: 'gift', id: f.id }), true],
              ['more', fav ? '★' : '☆', 'ghost', () => this.contactMenu(f, fav), true],
            ];
        const avail = narrow ? C.w : C.w * 0.6;
        const fixed = acts.some((a) => a[0] === 'more') ? 44 : 0;
        const bw = acts.length === 1 ? Math.min(160 * ui, avail) : Math.max(44, (avail - fixed - 6 * ui * (acts.length - 1)) / (acts.length - (fixed ? 1 : 0)));
        let x = C.x + C.w;
        for (let k = acts.length - 1; k >= 0; k--) {
          const [id, label, style, fn, en] = acts[k];
          const w = id === 'more' ? 44 : bw;
          x -= w;
          out.push(makeButton({ id: `ph-${id}-${f.id}`, label, style, fontSize: id === 'more' ? 18 : 12.5, enabled: en, x, y: by, w, h: bh, onTap: fn }));
          x -= 6 * ui;
        }
      });
      if (pages > 1) {
        out.push(makeButton({ id: 'ph-prev', label: '‹', style: 'secondary', fontSize: 20, enabled: this.page > 0, x: C.x, y: bottom - bh, w: 54 * ui, h: bh, onTap: () => { this.page--; this.relayout(); } }));
        out.push(makeButton({ id: 'ph-next', label: '›', style: 'secondary', fontSize: 20, enabled: this.page < pages - 1, x: C.x + C.w - 54 * ui, y: bottom - bh, w: 54 * ui, h: bh, onTap: () => { this.page++; this.relayout(); } }));
      }
    } else if (this.app === 'gifts') {
      out.push(makeButton({ id: 'ph-gift-choose', label: 'Offrir à un ami', style: 'gold', fontSize: 14, x: C.x, y: bottom - bh, w: Math.min(C.w, 240 * ui), h: bh, onTap: () => this.openApp('contacts') }));
    }
    return out;
  }

  private placeCabin(ui: number): Button[] {
    const C = this.content, P = this.phone, bh = Math.max(44, 44 * ui), out: Button[] = [];
    if (!P || !this.s.data.cabin.id) return out;
    out.push(makeButton({ id: 'ph-door', label: P.doorOpen ? 'Fermer ma porte à clé' : 'Ouvrir ma porte', sub: P.doorOpen ? 'Plus de visite ni de sonnette' : 'Les amis peuvent sonner', style: P.doorOpen ? 'secondary' : 'gold', fontSize: 14,
      x: C.x, y: C.y + 96 * ui, w: Math.min(C.w, 300 * ui), h: bh + 10 * ui, onTap: () => { P.setDoor(!P.doorOpen); P.doorOpen = !P.doorOpen; this.relayout(); } }));
    P.visitors.forEach((v, i) => out.push(makeButton({ id: `ph-kick-${v.id}`, label: 'Raccompagner', style: 'ghost', fontSize: 12.5, x: C.x + C.w - 140 * ui, y: C.y + 196 * ui + i * (bh + 8 * ui), w: 140 * ui, h: bh, onTap: () => P.kick(v.id) })));
    return out;
  }

  /** Plan : un pont par ligne, du plus haut au plus bas ; « Y aller » quand l'accès est permis. */
  private placeMap(ui: number): Button[] {
    const C = this.content, decks = this.decks(), n = decks.length, gap = 6 * ui;
    // Une colonne si tous les ponts tiennent en hauteur, sinon deux (téléphone tourné)
    const cols = (C.h - gap * (n - 1)) / n >= Math.max(48, 50 * ui) ? 1 : 2;
    const perCol = Math.ceil(n / cols), colW = (C.w - gap * (cols - 1)) / cols;
    const rowH = Math.max(44, Math.min(60 * ui, (C.h - gap * (perCol - 1)) / perCol));
    const bw = Math.max(88, Math.min(104 * ui, colW * 0.34));
    this.mapCol = { w: colW, bw };
    return decks.flatMap((f, i) => {
      const col = Math.floor(i / perCol), cx = C.x + col * (colW + gap);
      const y = C.y + (i % perCol) * (rowH + gap);
      const here = f.id === this.links.floor || (f.id === 'cabins' && this.links.floor === 'cabin-interior');
      const acc = this.s.floorAccess(f.id);
      this.rows.push({ y, h: rowH, draw: (ctx, yy) => this.drawDeck(ctx, ui, f.id, cx, yy, rowH, here) });
      const ok = f.available && acc.ok && !here;
      return [makeButton({ id: `ph-go-${f.id}`, label: here ? 'Ici' : !f.available ? 'Fermé' : !acc.ok ? 'Accès' : 'Y aller', style: ok ? 'primary' : 'secondary', fontSize: 13, enabled: ok,
        x: cx + colW - bw, y: y + (rowH - Math.max(44, rowH - 8 * ui)) / 2, w: bw, h: Math.max(44, rowH - 8 * ui),
        onTap: () => { this.close(); this.links.travel(f.id); } })];
    });
  }

  private placeKeys(ui: number): Button[] {
    const C = this.content, out: Button[] = [], P = this.phone, bh = Math.max(44, 44 * ui);
    const copies = (this.s.data.keys ?? []).filter((k) => !k.master);
    const top = this.keysTop(ui);
    const fit = Math.max(0, Math.floor((C.y + C.h - 26 * ui - top) / (bh + 8 * ui)));
    if (P) copies.slice(0, fit).forEach((k, i) => out.push(makeButton({ id: `ph-offer-${k.uid}`, label: 'Offrir', style: 'gold', fontSize: 13,
      x: C.x + C.w - 100 * ui, y: top + i * (bh + 8 * ui), w: 100 * ui, h: bh,
      onTap: () => { this.pendingKey = k.uid; this.openApp('contacts'); this.status = `Choisis l’ami à qui offrir « ${k.name} ».`; this.relayout(); } })));
    return out;
  }

  /** Haut de la liste des doubles (sous les cartes du KS Pass et de la clé principale et le titre). */
  private keysTop(ui: number): number { return this.content.y + 4 * ui + 2 * Math.max(54, 58 * ui) + 24 * ui + 30 * ui; }

  private decks() { return [...FLOORS].filter((f) => f.id !== 'cabin-interior').sort((a, b) => b.level - a.level); }

  private placeView(vp: Viewport, top: number): Button[] {
    const ui = vp.ui, C = this.content, P = this.phone!, gap = 8 * ui, bh = Math.max(44, 44 * ui), out: Button[] = [];
    const v = this.view, bottom = C.y + C.h;
    if (v.k === 'chat') {
      const dw = Math.min(110 * ui, C.w * 0.3);
      out.push(makeButton({ id: 'ph-write', label: 'Écrire un message', style: 'gold', fontSize: 15, enabled: !this.busy && P.online, x: C.x, y: bottom - bh, w: C.w - dw - gap, h: bh, onTap: () => this.write(v.id) }));
      out.push(makeButton({ id: 'ph-del', label: 'Effacer', style: 'ghost', fontSize: 13, x: C.x + C.w - dw, y: bottom - bh, w: dw, h: bh, onTap: () => this.confirmDelete(v.id) }));
      if (P.more.get(v.id)) out.push(makeButton({ id: 'ph-older', label: 'Messages plus anciens', style: 'ghost', fontSize: 12, x: C.x + (C.w - Math.min(C.w, 220 * ui)) / 2, y: top, w: Math.min(C.w, 220 * ui), h: Math.max(44, 42 * ui), onTap: () => P.loadOlder(v.id) }));
    } else if (v.k === 'gift') {
      const a = P.allowance;
      const kinds: Array<[string, string, string, () => void, boolean]> = [
        ['coins', 'KSCoins', a ? `encore ${a.coinsLeft} sur 24 h` : '…', () => promptNumber('KSCoins à offrir', Math.min(100, a?.coinsLeft ?? 0), 1, Math.max(1, Math.min(a?.coinsLeft ?? 0, this.s.wallet.balance)), (n) => { if (n) this.confirm(v.id, { kind: 'coins', amount: n }, `${n} KSCoins`); }), !!a && a.coinsLeft > 0 && this.s.wallet.balance > 0],
        ['chips', 'Jetons de casino', `solde : ${this.s.chips.balance.toLocaleString('fr-FR')}`, () => promptNumber('Jetons à offrir', Math.min(100, this.s.chips.balance), 1, Math.max(1, Math.min(GIFT_RULES.maxChips, this.s.chips.balance)), (n) => { if (n) this.confirm(v.id, { kind: 'chips', amount: n }, `${n} jetons`); }), this.s.chips.balance > 0],
        ['item', 'Un objet', a ? `encore ${a.itemsLeft} sur 24 h · valeur ≤ ${GIFT_ITEM_MAX_VALUE}` : '…', () => this.go({ k: 'giftItem', id: v.id }), !!a && a.itemsLeft > 0],
      ];
      kinds.forEach(([id, label, sub, fn, en], i) => out.push(makeButton({ id: `ph-gk-${id}`, label, sub, style: id === 'coins' ? 'gold' : 'secondary', fontSize: 15, enabled: en && !this.busy, x: C.x, y: top + 34 * ui + i * (bh + 18 * ui + gap), w: C.w, h: bh + 18 * ui, onTap: fn })));
    } else if (v.k === 'giftItem') {
      const inv = this.s.data.inventory?.items ?? {};
      const items = Object.entries(inv).filter(([, n]) => n > 0).map(([id]) => ITEMS_BY_ID.get(id)).filter((d) => !!d).map((d) => ({ d: d!, g: giftable(d) }));
      const keys = (this.s.data.keys ?? []).filter((k) => !k.master);
      const rowH = bh + 6 * ui, per = Math.max(1, Math.floor((bottom - top - 30 * ui) / rowH));
      const all: Array<{ id: string; label: string; sub: string; ok: boolean; run: () => void; icon?: Button['icon'] }> = [
        ...keys.map((k) => ({ id: `key-${k.uid}`, label: k.name, sub: `Double de la cabine n° ${k.cabin}`, ok: true, icon: keyIcon(false), run: () => this.confirm(v.id, { kind: 'key', uid: k.uid }, `la clé « ${k.name} »`) })),
        ...items.map(({ d, g }) => ({ id: d.id, label: d.name, sub: g.ok ? `Valeur ${d.price}` : g.why, ok: g.ok, run: () => this.confirm(v.id, { kind: 'item', item: d.id }, d.name) })),
      ];
      all.slice(this.page * per, this.page * per + per).forEach((e, i) => out.push(makeButton({ id: `ph-gi-${e.id}`, label: e.label, sub: e.sub, style: 'secondary', enabled: e.ok && !this.busy, fontSize: 14, icon: e.icon, x: C.x, y: top + 30 * ui + i * rowH, w: C.w, h: bh, onTap: e.run })));
      if (!all.length) this.status = 'Aucun objet à offrir pour l’instant.';
    } else if (v.k === 'confirm') {
      out.push(makeButton({ id: 'ph-cancel', label: 'Annuler', style: 'ghost', fontSize: 15, x: C.x, y: bottom - bh, w: (C.w - gap) / 2, h: bh, onTap: () => { this.pendingKey = null; this.go({ k: 'tab' }); } }));
      out.push(makeButton({ id: 'ph-ok', label: this.busy ? 'Envoi…' : 'Confirmer', style: 'gold', fontSize: 15, enabled: !this.busy, x: C.x + (C.w + gap) / 2, y: bottom - bh, w: (C.w - gap) / 2, h: bh, onTap: () => void this.sendGift(v) }));
    }
    return out;
  }

  private friendsList(): FriendEntry[] {
    const f = this.phone?.friends?.friends ?? [];
    const fav = new Set((this.phone?.contacts ?? []).filter((c) => c.fav).map((c) => c.id));
    return [...f].sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
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
    const ask = 'Touche encore « Effacer » pour supprimer cette conversation (de ton téléphone seulement).';
    if (this.status !== ask) {
      this.status = ask; this.relayout();
      setTimeout(() => { if (this.status === ask) { this.status = ''; this.relayout(); } }, 3000);
      return;
    }
    this.phone!.deleteConversation(id); this.phone!.closeConversation(); this.go({ k: 'tab' });
  }

  private contactMenu(f: FriendEntry, fav: boolean): void {
    const P = this.phone!;
    P.setContact(f.id, { fav: !fav });
    this.status = fav ? `${f.name} retiré des favoris` : `${f.name} en favori`;
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
    if (r.ok) { this.s.audio.ding(); this.s.haptic(30); this.app = 'gifts'; this.view = { k: 'tab' }; }
    else this.s.audio.error();
    this.status = r.msg;
    this.relayout();
  }

  // ---------------------------------------------------------------- dessin
  render(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, F = this.frame, S = this.screen;
    ctx.save();
    ctx.globalAlpha = this.t;
    ctx.fillStyle = 'rgba(6,5,8,0.6)'; ctx.fillRect(0, 0, vp.width, vp.height);
    // Ouverture : le téléphone remonte légèrement (les zones tactiles sont déjà en place, l'animation dure 0,15 s)
    ctx.translate(0, (1 - this.t) * 26 * ui);
    // Coque : métal sombre, liseré doré, boutons latéraux
    const r = Math.max(18, 30 * ui);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    roundRect(ctx, F.x, F.y, F.w, F.h, r);
    const body = ctx.createLinearGradient(F.x, F.y, F.x + F.w, F.y + F.h); body.addColorStop(0, '#2a2530'); body.addColorStop(0.5, '#141117'); body.addColorStop(1, '#221d27');
    ctx.fillStyle = body; ctx.fill(); ctx.restore();
    roundRect(ctx, F.x + 1, F.y + 1, F.w - 2, F.h - 2, r - 1); ctx.strokeStyle = 'rgba(212,175,90,0.75)'; ctx.lineWidth = 1.6; ctx.stroke();
    // Écran : fond d'écran aux couleurs du navire
    ctx.save();
    roundRect(ctx, S.x, S.y, S.w, S.h, r * 0.72); ctx.clip();
    const wall = ctx.createLinearGradient(0, S.y, 0, S.y + S.h); wall.addColorStop(0, '#0f2236'); wall.addColorStop(0.55, '#0a1624'); wall.addColorStop(1, '#120d18');
    ctx.fillStyle = wall; ctx.fillRect(S.x, S.y, S.w, S.h);
    if (this.app === 'home') { ctx.globalAlpha = this.t * 0.08; drawKSEmblem(ctx, S.x + S.w / 2, S.y + S.h * 0.62, Math.min(S.w, S.h) * 0.5, 0, 'small'); ctx.globalAlpha = this.t; }
    else { ctx.fillStyle = 'rgba(8,12,20,0.55)'; ctx.fillRect(S.x, S.y, S.w, S.h); }
    this.drawStatusBar(ctx, ui);
    this.drawHeader(ctx, ui);
    // Contenu de l'application, avec un léger fondu à l'ouverture
    ctx.globalAlpha = this.t * (0.35 + 0.65 * this.appT);
    this.renderContent(ctx, vp);
    this.layer.render(ctx, ui);
    ctx.restore();
    ctx.restore();
  }

  private drawStatusBar(ctx: CanvasRenderingContext2D, ui: number): void {
    const S = this.screen, y = S.y + 13 * ui;
    ctx.save();
    ctx.fillStyle = PAL.text; ctx.font = font(12.5 * ui, 800); ctx.textBaseline = 'middle';
    // Heure du téléphone (même horloge que l'ambiance du rooftop : journée, coucher du soleil, nuit)
    const d = new Date();
    ctx.textAlign = 'left';
    ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, S.x + 22 * ui, y);
    // Réseau du navire : barres pleines en ligne, barrées hors ligne (état réel de la connexion)
    const on = !!this.phone && this.phone.online;
    const bx = S.x + S.w - 22 * ui;
    for (let i = 0; i < 4; i++) {
      const bh = (4 + i * 2.5) * ui, xx = bx - (3 - i) * 5 * ui;
      ctx.fillStyle = on ? PAL.text : 'rgba(255,255,255,0.25)';
      ctx.fillRect(xx, y + 6 * ui - bh, 3 * ui, bh);
    }
    ctx.textAlign = 'right'; ctx.font = font(11 * ui, 700); ctx.fillStyle = on ? PAL.text : PAL.textDim;
    ctx.fillText(on ? 'KS Mer' : 'Hors ligne', bx - 22 * ui, y);
    ctx.restore();
  }

  private drawHeader(ctx: CanvasRenderingContext2D, ui: number): void {
    const H = this.header;
    ctx.save();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    let title = APP_TITLES[this.app];
    const v = this.view;
    if (this.phone && v.k === 'chat') title = this.phone.nameOf(v.id);
    else if (this.phone && (v.k === 'gift' || v.k === 'giftItem')) title = `Cadeau pour ${this.phone.nameOf(v.id)}`;
    else if (v.k === 'confirm') title = 'Confirmer le cadeau';
    ctx.fillStyle = this.app === 'home' ? LUXE.champagne : PAL.text; ctx.font = font((this.app === 'home' ? 17 : 17.5) * ui, 800);
    ctx.fillText(title, H.x + H.w / 2, H.y + H.h / 2 - (v.k === 'chat' ? 6 * ui : 0), H.w - 120 * ui);
    if (this.phone && v.k === 'chat') {
      const f = this.phone.friends?.friends.find((x) => x.id === v.id);
      ctx.font = font(11.5 * ui, 600); ctx.fillStyle = f?.online ? '#7ee2a8' : PAL.textDim;
      ctx.fillText(f ? (f.online ? 'En ligne' : 'Hors ligne') : '', H.x + H.w / 2, H.y + H.h / 2 + 11 * ui);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(H.x, H.y + H.h); ctx.lineTo(H.x + H.w, H.y + H.h); ctx.stroke();
    ctx.restore();
  }

  private drawHomeBar(ctx: CanvasRenderingContext2D, b: Button, ui: number): void {
    // Barre d'accueil des smartphones : dans une application → accueil ; à l'accueil → ranger le téléphone
    const w = Math.min(b.w, 130 * ui), h = 5 * ui;
    roundRect(ctx, b.x + (b.w - w) / 2, b.y + b.h / 2 - h / 2, w, h, h / 2);
    ctx.fillStyle = b.pressed ? LUXE.champagne : 'rgba(255,255,255,0.75)'; ctx.fill();
  }

  private drawAppIcon(ctx: CanvasRenderingContext2D, b: Button, a: AppDef, size: number, ui: number): void {
    const cx = b.x + b.w / 2, top = b.y, x = cx - size / 2;
    const off = a.online && !(this.phone && this.phone.online);
    ctx.save();
    if (b.pressed) { ctx.translate(cx, top + size / 2); ctx.scale(0.94, 0.94); ctx.translate(-cx, -(top + size / 2)); }
    roundRect(ctx, x, top, size, size, size * 0.24);
    const g = ctx.createLinearGradient(x, top, x + size, top + size); g.addColorStop(0, a.c0); g.addColorStop(1, a.c1);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    drawGlyph(ctx, a.id, cx, top + size / 2, size * 0.5);
    if (off) { ctx.fillStyle = 'rgba(10,12,18,0.5)'; roundRect(ctx, x, top, size, size, size * 0.24); ctx.fill(); }
    // Pastille de messages non lus
    const unread = a.id === 'messages' ? this.phone?.unread ?? 0 : 0;
    if (unread > 0) {
      const t = unread > 99 ? '99+' : String(unread); ctx.font = font(11 * ui, 900);
      const w = Math.max(20 * ui, ctx.measureText(t).width + 10 * ui);
      roundRect(ctx, x + size - w * 0.7, top - 6 * ui, w, 20 * ui, 10 * ui); ctx.fillStyle = '#e2445c'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + size - w * 0.7 + w / 2, top + 4 * ui);
    }
    ctx.restore();
    ctx.fillStyle = off ? PAL.textDim : PAL.text; ctx.font = font(12 * ui, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(a.name, cx, top + size + 5 * ui, b.w);
  }

  private drawConv(ctx: CanvasRenderingContext2D, b: Button, ui: number, id: string): void {
    const P = this.phone!, cv = P.convs.find((x) => x.with === id);
    if (!cv) return;
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, 12 * ui); ctx.fillStyle = b.pressed ? 'rgba(40,52,74,0.9)' : 'rgba(18,26,40,0.85)'; ctx.fill();
    const r = 18 * ui;
    drawAvatar(ctx, cv.look, cv.name, b.x + 12 * ui + r, b.y + b.h / 2, r, cv.online);
    const tx = b.x + 24 * ui + r * 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(15 * ui, cv.unread ? 900 : 700); ctx.fillStyle = PAL.text;
    ctx.fillText(`${cv.nick ?? cv.name}${cv.fav ? ' ★' : ''}`, tx, b.y + b.h * 0.33, b.w - (tx - b.x) - 60 * ui);
    ctx.font = font(12.5 * ui, cv.unread ? 700 : 500); ctx.fillStyle = cv.unread ? LUXE.champagne : PAL.textDim;
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

  private drawFriend(ctx: CanvasRenderingContext2D, ui: number, f: FriendEntry, y: number, fav: boolean, narrow: boolean): void {
    const C = this.content, r = 17 * ui, nick = this.phone!.contacts.find((c) => c.id === f.id)?.nick;
    const rowH = Math.max(58, 60 * ui);
    drawAvatar(ctx, f.look, f.name, C.x + r, y + (narrow ? 26 * ui : (rowH - 6 * ui) / 2), r, f.online);
    const tx = C.x + r * 2 + 10 * ui, maxW = (narrow ? C.w : C.w * 0.4) - r * 2 - 10 * ui;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(15 * ui, 800); ctx.fillStyle = PAL.text;
    ctx.fillText(`${nick ?? f.name}${fav ? ' ★' : ''}`, tx, y + 17 * ui, maxW);
    ctx.font = font(12 * ui, 600); ctx.fillStyle = f.online ? '#7ee2a8' : PAL.textDim;
    ctx.fillText(f.online ? `En ligne · ${FLOOR_NAMES[f.floor ?? ''] ?? 'à bord'}` : `Hors ligne · niv. ${f.level}`, tx, y + 36 * ui, maxW);
  }

  private drawDeck(ctx: CanvasRenderingContext2D, ui: number, id: string, x: number, y: number, h: number, here: boolean): void {
    const f = FLOORS.find((q) => q.id === id)!, acc = this.s.floorAccess(id), W = this.mapCol.w;
    ctx.save();
    // Coupe du navire : chaque pont est une bande, le pont actuel en or
    roundRect(ctx, x, y, W, h, 10 * ui);
    ctx.fillStyle = here ? 'rgba(212,175,90,0.22)' : 'rgba(255,255,255,0.05)'; ctx.fill();
    if (here) { ctx.strokeStyle = 'rgba(239,220,174,0.8)'; ctx.lineWidth = 1.4; ctx.stroke(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const maxW = W - this.mapCol.bw - 22 * ui;
    ctx.font = font(15 * ui, 800); ctx.fillStyle = PAL.text;
    ctx.fillText(f.name, x + 12 * ui, y + h * 0.36, maxW);
    ctx.font = font(12 * ui, 600); ctx.fillStyle = here ? LUXE.champagne : PAL.textDim;
    const st = here ? 'Tu es ici' : !f.available ? 'En construction' : !acc.ok ? (acc.needPass ? 'KS Pass requis (réception)' : acc.reason) : f.description;
    ctx.fillText(`${floorLabel(f)} · ${st}`, x + 12 * ui, y + h * 0.7, maxW);
    ctx.restore();
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content, P = this.phone;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const r of this.rows) r.draw(ctx, r.y);
    const online = this.app === 'messages' || this.app === 'contacts' || this.app === 'gifts';
    if (this.app === 'home') this.renderHome(ctx, ui);
    else if (online && !P) this.empty(ctx, ui, 'Cette application passe par le serveur du navire : messages privés, contacts et cadeaux entre amis. Elle est disponible quand tu joues en ligne (menu principal → « En ligne »).', C.y);
    else if (this.app === 'cabin') this.renderCabin(ctx, ui);
    else if (this.app === 'wallet') this.renderWallet(ctx, ui);
    else if (this.app === 'keys') this.renderKeys(ctx, ui);
    else if (this.app === 'map') { /* lignes dessinées ci-dessus */ }
    else if (P) {
      if (!P.online) { ctx.fillStyle = '#f08a8a'; ctx.font = font(12 * ui, 700); ctx.fillText('Connexion perdue : reconnexion en cours…', C.x, C.y + C.h - 8 * ui, C.w); }
      const v = this.view;
      if (v.k === 'tab') {
        if (this.app === 'messages' && !P.convs.length) this.empty(ctx, ui, 'Aucune conversation. Application Contacts : « Écrire » à un ami.', C.y);
        if (this.app === 'contacts' && !(P.friends?.friends.length)) this.empty(ctx, ui, P.friends ? 'Pas encore d’amis : ajoute-en depuis le menu Amis (code ami ou pseudo).' : 'Chargement…', C.y);
        if (this.app === 'gifts') this.renderGifts(ctx, ui, C.y);
      } else if (v.k === 'chat') this.renderChat(ctx, ui, v.id, C.y);
      else if (v.k === 'confirm') {
        ctx.fillStyle = PAL.text; ctx.font = font(17 * ui, 800);
        wrapText(ctx, `Offrir ${v.label} à ${P.nameOf(v.id)} ?`, C.w).forEach((l, i) => ctx.fillText(l, C.x, C.y + 24 * ui + i * 24 * ui));
        ctx.font = font(13.5 * ui, 500); ctx.fillStyle = PAL.textDim;
        wrapText(ctx, 'Le cadeau est définitif : il quitte ton inventaire et arrive immédiatement chez ton ami (même hors ligne). Les jetons restent des jetons : aucune conversion.', C.w)
          .forEach((l, i) => ctx.fillText(l, C.x, C.y + 84 * ui + i * 20 * ui));
      } else if (v.k === 'gift' || v.k === 'giftItem') {
        ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 600);
        ctx.fillText(v.k === 'gift' ? 'Que veux-tu offrir ?' : 'Choisis l’objet à offrir', C.x, C.y + 14 * ui, C.w);
      }
    }
    if (this.status) {
      ctx.fillStyle = LUXE.champagne; ctx.font = font(13 * ui, 700); ctx.textAlign = 'center';
      const lines = wrapText(ctx, this.status, C.w);
      const by = C.y + C.h - 10 * ui - (this.view.k !== 'tab' ? Math.max(44, 44 * ui) + 6 * ui : 0);
      lines.forEach((l, i) => ctx.fillText(l, C.x + C.w / 2, by - (lines.length - 1 - i) * 17 * ui));
    }
    ctx.restore();
  }

  private renderHome(ctx: CanvasRenderingContext2D, ui: number): void {
    // Ligne d'information sous les icônes : soldes réels et cabine (les icônes ouvrent le détail)
    const C = this.content;
    const cab = this.s.data.cabin.id;
    const master = (this.s.data.keys ?? []).some((k) => k.master);
    const text = `${this.s.wallet.balance.toLocaleString('fr-FR')} KSCoins · ${this.s.chips.balance.toLocaleString('fr-FR')} jetons${cab ? ` · cabine ${cab}${master ? '' : ' (clé à la réception)'}` : ''}`;
    ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 600); ctx.textAlign = 'center';
    ctx.fillText(text, C.x + C.w / 2, C.y + C.h - 10 * ui, C.w);
  }

  private empty(ctx: CanvasRenderingContext2D, ui: number, text: string, y: number): void {
    ctx.fillStyle = PAL.textDim; ctx.font = font(14.5 * ui, 600); ctx.textAlign = 'left';
    wrapText(ctx, text, this.content.w).forEach((l, i) => ctx.fillText(l, this.content.x, y + 20 * ui + i * 21 * ui));
  }

  private renderGifts(ctx: CanvasRenderingContext2D, ui: number, top: number): void {
    const C = this.content, P = this.phone!, a = P.allowance;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(15 * ui, 800);
    ctx.fillText('Capacité de don (24 heures glissantes)', C.x, top + 12 * ui, C.w);
    ctx.font = font(13.5 * ui, 600); ctx.fillStyle = PAL.text;
    const cIn = P.freesIn('coins'), iIn = P.freesIn('items');
    const lines = [
      a ? `KSCoins : encore ${a.coinsLeft} / ${GIFT_RULES.coinsPerWindow}${cIn !== null && a.coinsLeft < GIFT_RULES.coinsPerWindow ? ` · rendue dans ${durationText(cIn)}` : ''}` : 'Chargement…',
      a ? `Objets : encore ${a.itemsLeft} / ${GIFT_RULES.itemsPerWindow} (valeur ≤ ${GIFT_ITEM_MAX_VALUE})${iIn !== null && a.itemsLeft < GIFT_RULES.itemsPerWindow ? ` · dans ${durationText(iIn)}` : ''}` : '',
      'Jetons de casino : transférés tels quels.',
    ].flatMap((l) => wrapText(ctx, l, C.w));
    lines.forEach((l, i) => ctx.fillText(l, C.x, top + 38 * ui + i * 20 * ui));
    const hy = top + 48 * ui + lines.length * 20 * ui;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(14 * ui, 800);
    ctx.fillText('Derniers transferts', C.x, hy);
    ctx.font = font(13 * ui, 600);
    const maxRows = Math.max(0, Math.floor((C.y + C.h - Math.max(44, 44 * ui) - 30 * ui - (hy + 20 * ui)) / (20 * ui)));
    if (!P.transfers.length) { ctx.fillStyle = PAL.textDim; ctx.fillText('Aucun cadeau envoyé ni reçu.', C.x, hy + 22 * ui); }
    P.transfers.slice(0, maxRows).forEach((t, i) => {
      const out = t.from === P.me;
      ctx.fillStyle = out ? PAL.textDim : '#7ee2a8';
      ctx.fillText(out ? `→ ${t.toName} : ${t.label}` : `← ${t.fromName} : ${t.label}`, C.x, hy + 22 * ui + i * 20 * ui, C.w);
    });
  }

  private renderCabin(ctx: CanvasRenderingContext2D, ui: number): void {
    const C = this.content, P = this.phone, cabin = this.s.data.cabin.id;
    const master = (this.s.data.keys ?? []).find((k) => k.master);
    ctx.fillStyle = LUXE.champagne; ctx.font = font(16 * ui, 800);
    ctx.fillText(cabin ? `Cabine n° ${cabin}` : 'Pas encore de cabine', C.x, C.y + 14 * ui, C.w);
    ctx.font = font(13.5 * ui, 600); ctx.fillStyle = master ? '#7ee2a8' : '#f0c27a';
    const keyLine = master ? `Clé : « ${master.name} » (dans ton trousseau)` : cabin ? 'Clé : à retirer à la réception du hall avec ton KS Pass' : 'Ta cabine et sa clé te sont remises à la réception du hall.';
    wrapText(ctx, keyLine, C.w).forEach((l, i) => ctx.fillText(l, C.x, C.y + 40 * ui + i * 19 * ui));
    if (!P) {
      ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 500);
      wrapText(ctx, 'Porte, sonnette et visiteurs : en ligne seulement. Ta cabine se trouve au pont des logements (porte à plaque dorée) ; décore-la depuis l’inventaire une fois à l’intérieur.', C.w)
        .forEach((l, i) => ctx.fillText(l, C.x, C.y + 96 * ui + i * 19 * ui));
      return;
    }
    if (!cabin) return;
    ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 600);
    ctx.fillText(P.doorOpen ? 'Porte ouverte aux visites : tes amis peuvent sonner.' : 'Porte fermée à clé : aucune visite, même avec un double.', C.x, C.y + 80 * ui, C.w);
    ctx.fillStyle = PAL.text; ctx.font = font(14 * ui, 800);
    ctx.fillText(P.visitors.length ? 'Visiteurs dans ta cabine' : 'Aucun visiteur pour le moment.', C.x, C.y + 176 * ui, C.w);
    const bh = Math.max(44, 44 * ui);
    P.visitors.forEach((v, i) => { ctx.font = font(14 * ui, 600); ctx.fillText(v.name, C.x, C.y + 196 * ui + i * (bh + 8 * ui) + bh / 2, C.w - 150 * ui); });
  }

  private renderWallet(ctx: CanvasRenderingContext2D, ui: number): void {
    const C = this.content, s = this.s;
    const card = (x: number, y: number, w: number, h: number, c0: string, c1: string) => {
      roundRect(ctx, x, y, w, h, 14 * ui);
      const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.fill();
    };
    const ch = Math.max(56, 62 * ui), two = C.w > 420 * ui;
    const cw = two ? (C.w - 10 * ui) / 2 : C.w;
    const cards: Array<[string, string, string, string]> = [
      ['KSCoins', s.wallet.balance.toLocaleString('fr-FR'), '#8a6a1f', '#3b2b0b'],
      ['Jetons de casino', s.chips.balance.toLocaleString('fr-FR'), '#14504c', '#0a2422'],
    ];
    cards.forEach(([label, val, c0, c1], i) => {
      const x = two ? C.x + i * (cw + 10 * ui) : C.x, y = two ? C.y + 4 * ui : C.y + 4 * ui + i * (ch + 8 * ui);
      card(x, y, cw, ch, c0, c1);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = font(12.5 * ui, 700);
      ctx.fillText(label, x + 14 * ui, y + ch * 0.3, cw - 28 * ui);
      ctx.fillStyle = '#fff'; ctx.font = font(22 * ui, 900);
      ctx.fillText(val, x + 14 * ui, y + ch * 0.68, cw - 28 * ui);
      ctx.restore();
    });
    let y = C.y + 4 * ui + (two ? ch : ch * 2 + 8 * ui) + 14 * ui;
    const lp = levelProgress(s.progress.xp);
    ctx.textAlign = 'left'; ctx.fillStyle = PAL.text; ctx.font = font(13.5 * ui, 700);
    ctx.fillText(`Niveau ${lp.level} · ${Math.round(lp.ratio * 100)} % vers le niveau ${lp.level + 1}`, C.x, y, C.w);
    y += 22 * ui;
    ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 600);
    wrapText(ctx, 'Jetons ↔ KSCoins : à la caisse du casino (1er pont). Aucun argent réel.', C.w).forEach((l) => { ctx.fillText(l, C.x, y, C.w); y += 18 * ui; });
    y += 8 * ui;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(14 * ui, 800);
    ctx.fillText('Mouvements de jetons (depuis l’ouverture du jeu)', C.x, y, C.w);
    y += 22 * ui;
    const rowH = 21 * ui, maxRows = Math.max(0, Math.floor((C.y + C.h - y) / rowH));
    if (!s.chipLog.length) { ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 600); ctx.fillText('Aucun mouvement pour l’instant.', C.x, y, C.w); return; }
    for (const e of s.chipLog.slice(0, maxRows)) {
      ctx.font = font(13 * ui, 600); ctx.textAlign = 'left'; ctx.fillStyle = PAL.text;
      ctx.fillText(e.label, C.x, y, C.w - 90 * ui);
      ctx.textAlign = 'right'; ctx.font = font(13 * ui, 800); ctx.fillStyle = e.delta > 0 ? '#7ee2a8' : '#f08a8a';
      ctx.fillText(`${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta).toLocaleString('fr-FR')}`, C.x + C.w, y);
      y += rowH;
    }
  }

  private renderKeys(ctx: CanvasRenderingContext2D, ui: number): void {
    const C = this.content, s = this.s, keys = s.data.keys ?? [];
    const pass = (s.data.inventory?.items['ks-pass'] ?? 0) > 0 || !!s.data.flags['gift.received'];
    const master = keys.find((k) => k.master), copies = keys.filter((k) => !k.master);
    const card = (y: number, title: string, sub: string, okc: boolean) => {
      const h = Math.max(54, 58 * ui);
      roundRect(ctx, C.x, y, C.w, h, 12 * ui); ctx.fillStyle = okc ? 'rgba(126,226,168,0.12)' : 'rgba(240,194,122,0.12)'; ctx.fill();
      ctx.strokeStyle = okc ? 'rgba(126,226,168,0.5)' : 'rgba(240,194,122,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = PAL.text; ctx.font = font(15 * ui, 800); ctx.fillText(title, C.x + 14 * ui, y + h * 0.35, C.w - 28 * ui);
      ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 600); ctx.fillText(sub, C.x + 14 * ui, y + h * 0.7, C.w - 28 * ui);
      return h;
    };
    let y = C.y + 4 * ui;
    y += card(y, pass ? 'KS Pass Croisière' : 'KS Pass : non reçu', pass ? 'Accès à tous les ponts ouverts' : 'À retirer à la réception du hall', pass) + 10 * ui;
    y += card(y, master ? master.name : 'Clé de cabine : non reçue', master ? `Clé principale · serrure n° ${master.lock}` : 'Remise à la réception avec le KS Pass', !!master) + 14 * ui;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(14 * ui, 800); ctx.textAlign = 'left';
    ctx.fillText(copies.length ? `Doubles (${copies.length})` : 'Aucun double de clé', C.x, y + 8 * ui, C.w);
    const bh = Math.max(44, 44 * ui), top = this.keysTop(ui);
    const fit = Math.max(0, Math.floor((C.y + C.h - 26 * ui - top) / (bh + 8 * ui)));
    copies.slice(0, fit).forEach((k, i) => {
      ctx.fillStyle = PAL.text; ctx.font = font(13.5 * ui, 600);
      ctx.fillText(`${k.name} · cabine ${k.cabin}`, C.x, top + i * (bh + 8 * ui) + bh / 2, C.w - (this.phone ? 110 * ui : 0));
    });
    if (copies.length > fit) { ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 600); ctx.fillText(`… et ${copies.length - fit} autre(s) : voir l’inventaire`, C.x, top + fit * (bh + 8 * ui) + 10 * ui, C.w); }
    ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 500);
    ctx.fillText('Doubles et changement de serrure : chez le serrurier (pont des logements).', C.x, C.y + C.h - 10 * ui, C.w);
  }

  private renderChat(ctx: CanvasRenderingContext2D, ui: number, id: string, top: number): void {
    const C = this.content, P = this.phone!, msgs = P.history.get(id) ?? [];
    const bottom = C.y + C.h - Math.max(44, 44 * ui) - 30 * ui;
    // Bulles, de bas en haut (les plus récentes en bas)
    ctx.font = font(14 * ui, 500);
    const maxW = C.w * 0.78, lh = 18 * ui;
    let y = bottom;
    const start = top + (P.more.get(id) ? 50 * ui : 0);
    for (let i = msgs.length - 1; i >= 0 && y > start + 10 * ui; i--) {
      const m = msgs[i], mine = m.from === P.me;
      const lines = wrapText(ctx, m.text, maxW - 22 * ui).slice(0, 6);
      const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22 * ui), h = lines.length * lh + 14 * ui;
      y -= h;
      if (y < start) break;
      const x = mine ? C.x + C.w - w : C.x;
      roundRect(ctx, x, y, w, h, 14 * ui); ctx.fillStyle = mine ? 'rgba(31,199,193,0.32)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      ctx.fillStyle = PAL.text; ctx.textAlign = 'left';
      lines.forEach((l, k) => ctx.fillText(l, x + 11 * ui, y + 7 * ui + lh * (k + 0.5)));
      if (mine && i === msgs.length - 1 && m.read) { ctx.font = font(11 * ui, 600); ctx.fillStyle = PAL.textDim; ctx.textAlign = 'right'; ctx.fillText('Lu', C.x + C.w, y + h + 9 * ui); ctx.font = font(14 * ui, 500); }
      y -= 8 * ui;
    }
    if (!msgs.length) { ctx.fillStyle = PAL.textDim; ctx.textAlign = 'center'; ctx.fillText('Aucun message : écris le premier !', C.x + C.w / 2, (top + bottom) / 2); }
  }
}

/** Pictogrammes vectoriels des applications (blanc, lisibles à toutes les tailles). */
function drawGlyph(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1.6, s * 0.1); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const h = s / 2;
  switch (id) {
    case 'messages':
      roundRect(ctx, cx - h, cy - h * 0.75, s, s * 0.7, s * 0.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - h * 0.4, cy + h * 0.6); ctx.lineTo(cx - h * 0.65, cy + h * 1.0); ctx.lineTo(cx, cy + h * 0.6); ctx.fill();
      break;
    case 'contacts':
      ctx.beginPath(); ctx.arc(cx, cy - h * 0.35, h * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.7, h * 0.78, h * 0.5, 0, Math.PI, 0); ctx.fill();
      break;
    case 'gifts':
      ctx.fillRect(cx - h * 0.85, cy - h * 0.15, s * 0.85, h * 1.05);
      ctx.fillRect(cx - h, cy - h * 0.5, s, h * 0.35);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.5); ctx.lineTo(cx, cy + h * 0.9); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx - h * 0.3, cy - h * 0.7, h * 0.3, h * 0.18, 0.3, 0, Math.PI * 2); ctx.ellipse(cx + h * 0.3, cy - h * 0.7, h * 0.3, h * 0.18, -0.3, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'cabin':
      roundRect(ctx, cx - h * 0.62, cy - h, s * 0.62, s, s * 0.06); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + h * 0.32, cy + h * 0.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
      break;
    case 'map':
      ctx.beginPath(); ctx.arc(cx, cy - h * 0.25, h * 0.55, Math.PI, 0); ctx.lineTo(cx, cy + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx, cy - h * 0.25, h * 0.22, 0, Math.PI * 2); ctx.fill();
      break;
    case 'wallet':
      roundRect(ctx, cx - h, cy - h * 0.6, s, s * 0.62, s * 0.12); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, cx + h * 0.2, cy - h * 0.18, h * 0.8, h * 0.45, h * 0.12); ctx.fill();
      break;
    case 'keys': keyIcon(true)(ctx, cx, cy, s * 1.2); break;
    case 'inventory': Icons.bag(ctx, cx, cy, s * 1.2); break;
    case 'missions':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? h * 0.42 : h; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      break;
    case 'levels':
      ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h * 0.85, cy); ctx.lineTo(cx, cy + h); ctx.lineTo(cx - h * 0.85, cy); ctx.closePath(); ctx.stroke();
      ctx.font = `900 ${Math.round(s * 0.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', cx, cy + s * 0.02);
      break;
    case 'settings':
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillRect(-s * 0.08, -h, s * 0.16, h * 0.4); ctx.restore(); }
      ctx.beginPath(); ctx.arc(cx, cy, h * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.26, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
}
