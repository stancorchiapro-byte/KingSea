// Inventaire (bouton « sac » du HUD, touche I) : provisions, garde-robe, objets, décorations, jetons.
// Grille de cartes (icône, quantité, liseré de rareté, état « porté » / « placé ») et fiche détaillée de l'objet
// sélectionné (grande icône, rareté, type, description, effets, quantité, actions). Tri par nom, quantité ou
// rareté. Les quantités viennent de l'autorité (dernier état reçu) et chaque action lui est demandée ; un double
// toucher pendant une demande, ou juste après, est ignoré.
import { drawChipTop, drawKSCoin, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { FURNITURE_BY_ID } from '../data/furniture';
import { ITEMS_BY_ID, RARITY, rarityOf, type ItemDef, type Rarity, type WearSlot } from '../data/items';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { effectText } from './BarMenu';
import { furnitureIcon, itemIconFor, keyIcon } from './itemIcons';
import { Modal } from './Modal';
import { promptText } from './TextPrompt';
import { font, makeButton, wrapText, type Button } from './UIKit';

type Tab = 'food' | 'wear' | 'items' | 'deco' | 'chips';
type Sort = 'nom' | 'quantité' | 'rareté';
const TABS: Array<[Tab, string]> = [['food', 'Provisions'], ['wear', 'Garde-robe'], ['items', 'Objets'], ['deco', 'Décorations'], ['chips', 'Jetons']];
const SLOT_LABEL: Record<WearSlot, string> = { outfit: 'Tenue', pants: 'Pantalon', shoes: 'Chaussures', hat: 'Couvre-chef', glasses: 'Lunettes', jewel: 'Bijou' };
const RANK: Record<Rarity, number> = { commun: 0, rare: 1, epique: 2, legendaire: 3 };

interface Entry {
  key: string; name: string; qty: number; max: number; desc: string; type: string; rarity: Rarity;
  icon: NonNullable<Button['icon']>; badge: string | null; details: string[];
  primary: { label: string; enabled: boolean; run: () => void; note?: string } | null;
  secondary: { label: string; run: () => void } | null;
}

export interface InventoryHooks {
  /** Consommation confirmée (effets réellement appliqués par l'autorité). */
  consumed: (def: ItemDef, eff: { hunger: number; thirst: number }) => void;
  /** Objet utilisé : l'effet visuel à jouer. */
  used: (def: ItemDef, effect: string) => void;
  /** Ouvre l'éditeur de cabine (null : le joueur n'est pas dans sa cabine). */
  placeDecor: (() => void) | null;
  toast: (msg: string, kind: 'success' | 'error' | 'info') => void;
  /** Ouvre le téléphone (messages, contacts, cadeaux, visites). */
  phone: () => void;
  /** Offrir un double de clé à un ami (téléphone, onglet Cadeaux). */
  giftKey: (uid: string) => void;
}

/** Préférences de la session (onglet et tri restent d'une ouverture à l'autre). */
let lastTab: Tab = 'food';
let lastSort: Sort = 'rareté';

export class InventoryMenu extends Modal {
  private tab: Tab = lastTab;
  private sort: Sort = lastSort;
  private page = 0;
  private busy = false;
  private coolUntil = 0;
  private vp: Viewport | null = null;
  private selected: string | null = null;
  private selT = 0;
  private entries: Entry[] = [];
  private grid = { x: 0, y: 0, w: 0, h: 0 };
  private detail = { x: 0, y: 0, w: 0, h: 0 };
  private pages = 1;
  /** Animation d'utilisation : l'icône s'élève et s'efface (consommer, utiliser, porter). */
  private fx: { icon: NonNullable<Button['icon']>; t: number; text: string } | null = null;

  constructor(s: Services, private hooks: InventoryHooks) { super(s, 'Inventaire'); }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  update(dt: number): void {
    super.update(dt);
    this.selT += dt;
    if (this.fx) { this.fx.t += dt; if (this.fx.t > 0.9) this.fx = null; }
  }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 880 * vp.ui), h: Math.min(maxH, 580 * vp.ui) };
  }

  // ---------------------------------------------------------------- contenu des onglets
  private build(tab: Tab): Entry[] {
    const inv = this.s.data.inventory?.items ?? {}, look = this.s.data.appearance;
    const owned = Object.entries(inv).filter(([, n]) => n > 0).map(([id, n]) => [ITEMS_BY_ID.get(id), n] as const).filter((e): e is readonly [ItemDef, number] => !!e[0]);
    const cool = () => !this.busy && performance.now() >= this.coolUntil;
    switch (tab) {
      case 'food':
        return owned.filter(([d]) => d.type === 'food' || d.type === 'drink').map(([d, n]) => ({
          key: d.id, name: d.name, qty: n, max: d.stack, desc: d.desc, type: d.type === 'food' ? 'Plat' : 'Boisson', rarity: rarityOf(d.price, d.level),
          icon: itemIconFor(d, look)!, badge: null, details: [effectText(d) || 'Sans effet sur les jauges', `${n} dans ton sac (max. ${d.stack})`],
          primary: { label: d.type === 'food' ? 'Manger' : 'Boire', enabled: cool(), run: () => void this.consume(d) }, secondary: null,
        }));
      case 'wear': {
        const unlocks = this.s.progress.unlocks;
        return [...ITEMS_BY_ID.values()].filter((d) => d.slot && d.value && ((inv[d.id] ?? 0) > 0 || unlocks.includes(d.id))).map((d) => {
          const on = this.s.wearing(d.slot!, d.value!), removable = d.slot !== 'outfit';
          return {
            key: d.id, name: d.name, qty: 1, max: 1, desc: d.desc, type: SLOT_LABEL[d.slot!], rarity: rarityOf(d.price, d.level),
            icon: itemIconFor(d, look)!, badge: on ? 'Porté' : null,
            details: [`Emplacement : ${SLOT_LABEL[d.slot!]}`, on ? 'Porté en ce moment' : 'Dans ta garde-robe', (inv[d.id] ?? 0) > 0 ? 'Acheté à la Boutique KS' : 'Récompense de niveau'],
            primary: on ? (removable ? null : { label: 'Porté', enabled: false, run: () => {}, note: 'Une tenue reste toujours portée : choisis-en une autre pour la remplacer.' }) : { label: 'Porter', enabled: true, run: () => this.wear(d.slot!, d.value!, d.name, false, itemIconFor(d, look)!) },
            secondary: on && removable ? { label: 'Retirer', run: () => this.wear(d.slot!, null, d.name, true, itemIconFor(d, look)!) } : null,
          };
        });
      }
      case 'items': {
        // Objets spéciaux (personnels, non transférables) et trousseau de clés en tête
        const special: Entry[] = owned.filter(([d]) => d.type === 'special').map(([d]) => ({
          key: d.id, name: d.name, qty: 1, max: 1, desc: d.desc, type: 'Spécial · personnel', rarity: 'legendaire' as Rarity,
          icon: itemIconFor(d, look)!, badge: d.id === 'ks-pass' ? 'Actif' : null,
          details: d.id === 'ks-pass' ? ['Accès : tous les ponts du navire', 'Nominatif : ne se donne, ne se vend ni ne s’échange', 'Vérifié à chaque entrée d’étage'] : ['Messages privés, contacts et notifications', 'Cadeaux entre amis et visites de cabine', this.s.online ? 'Connecté au réseau du navire' : 'Fonctionne en ligne uniquement'],
          primary: d.id === 'phone' ? { label: 'Ouvrir', enabled: true, run: () => { this.close(); this.hooks.phone(); } } : null, secondary: null,
        }));
        const keys: Entry[] = (this.s.data.keys ?? []).map((k) => {
          const lock = this.s.data.keyring?.lock ?? 1;
          const valid = k.master || k.owner !== this.s.data.playerId || k.lock === lock;
          return {
            key: `key:${k.uid}`, name: k.name, qty: 1, max: 1, type: k.master ? 'Clé principale' : 'Double de clé', rarity: (k.master ? 'legendaire' : 'rare') as Rarity,
            desc: k.master ? `Ouvre ta cabine n° ${k.cabin}. Personnelle : ne se donne pas (fais faire des doubles chez le serrurier).` : `Ouvre la cabine n° ${k.cabin}${k.owner === this.s.data.playerId ? ' (la tienne)' : ''} tant que sa serrure n’est pas changée.`,
            icon: keyIcon(k.master), badge: k.master ? 'Principale' : null,
            details: [k.master ? 'Non transférable' : valid ? 'Transférable à un ami (2 objets / 24 h)' : 'Serrure changée : ce double n’ouvre plus', `Cabine n° ${k.cabin}`],
            primary: k.master ? null : { label: 'Renommer', enabled: cool(), run: () => this.renameKey(k.uid, k.name) },
            secondary: k.master ? null : { label: 'Offrir', run: () => { this.close(); this.hooks.giftKey(k.uid); } },
          };
        });
        return [...special, ...keys, ...owned.filter(([d]) => d.type === 'usable' || d.type === 'cosmetic').map(([d, n]) => ({
          key: d.id, name: d.name, qty: n, max: d.stack, desc: d.desc, type: d.type === 'cosmetic' ? 'Cosmétique' : 'Objet à effet', rarity: rarityOf(d.price, d.level),
          icon: itemIconFor(d, look)!, badge: null, details: [d.effect === 'aura' ? 'Effet : sillage scintillant (3 min)' : d.effect === 'fireworks' ? 'Effet : gerbes d’étincelles' : 'Effet : pluie de confettis', `${n} dans ton sac (max. ${d.stack})`],
          primary: { label: 'Utiliser', enabled: cool(), run: () => void this.use(d) }, secondary: null,
        }))];
      }
      case 'deco': {
        const room = this.s.data.room;
        if (!room) return [];
        const placed: Record<string, number> = {};
        for (const p of room.placed) placed[p.item] = (placed[p.item] ?? 0) + 1;
        const place = this.hooks.placeDecor;
        return Object.entries(room.owned).filter(([, n]) => n > 0).flatMap(([id, n]) => {
          const f = FURNITURE_BY_ID.get(id);
          if (!f) return [];
          const p = placed[id] ?? 0;
          return [{
            key: id, name: f.name, qty: n, max: n, desc: `Meuble ${f.category} · style ${f.style} · ${f.w}×${f.h} cases`, type: 'Décoration', rarity: f.reward ? 'legendaire' as Rarity : rarityOf(f.price, f.level),
            icon: furnitureIcon(f)!, badge: p > 0 ? `${p} placé${p > 1 ? 's' : ''}` : null, details: [`${p} placé${p > 1 ? 's' : ''} · ${n - p} en réserve`, 'Se place dans ta cabine (bureau de décoration)'],
            primary: { label: 'Placer', enabled: !!place && !this.busy, run: () => { if (place) { this.close(); place(); } }, note: place ? undefined : 'Rends-toi dans ta cabine pour placer tes meubles.' },
            secondary: null,
          }];
        });
      }
      case 'chips': return [];
    }
  }

  private sorted(list: Entry[]): Entry[] {
    const by = this.sort;
    return [...list].sort((a, b) => by === 'nom' ? a.name.localeCompare(b.name, 'fr') : by === 'quantité' ? b.qty - a.qty || a.name.localeCompare(b.name, 'fr') : RANK[b.rarity] - RANK[a.rarity] || a.name.localeCompare(b.name, 'fr'));
  }

  // ---------------------------------------------------------------- actions
  private async consume(d: ItemDef): Promise<void> {
    if (this.busy || performance.now() < this.coolUntil) return;
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'purser', 'consume', { item: d.id });
    this.busy = false; this.coolUntil = performance.now() + 500;
    if (!r.ok) { this.s.audio.error(); this.hooks.toast(r.error, 'error'); }
    else {
      const eff = r.view as { hunger: number; thirst: number };
      this.fx = { icon: itemIconFor(d, this.s.data.appearance)!, t: 0, text: [eff.hunger ? `faim +${eff.hunger}` : '', eff.thirst ? `soif +${eff.thirst}` : ''].filter(Boolean).join(' · ') || 'Miam !' };
      this.hooks.consumed(d, eff);
    }
    this.relayout();
    setTimeout(() => this.relayout(), 520);
  }

  private async use(d: ItemDef): Promise<void> {
    if (this.busy || performance.now() < this.coolUntil) return;
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'purser', 'use', { item: d.id });
    this.busy = false;
    if (!r.ok) { this.s.audio.error(); this.hooks.toast(r.error, 'error'); this.relayout(); return; }
    this.close();
    this.hooks.used(d, String(r.view.effect));
  }

  /** Renommer un double de clé (nom vérifié par l'autorité : lettres, chiffres, 24 caractères). */
  private renameKey(uid: string, current: string): void {
    promptText('Nom de la clé', current, (v) => {
      if (!v || v === current) return;
      this.busy = true; this.relayout();
      void this.s.ask('purser', 'purser', 'key-rename', { uid, name: v }).then((r) => {
        this.busy = false;
        if (!r.ok) { this.s.audio.error(); this.hooks.toast(r.error, 'error'); } else { this.s.audio.ding(); this.hooks.toast('Clé renommée', 'success'); }
        this.relayout();
      });
    });
  }

  private wear(slot: WearSlot, value: string | null, name: string, wasOn: boolean, icon: NonNullable<Button['icon']>): void {
    const err = this.s.wear(slot, value);
    if (err) { this.s.audio.error(); this.hooks.toast(err, 'error'); }
    else { this.s.audio.swish(); this.fx = { icon, t: 0, text: wasOn ? 'Retiré' : 'Porté !' }; this.hooks.toast(wasOn ? `${name} retiré` : `${name} porté`, 'success'); }
    this.relayout();
  }

  // ---------------------------------------------------------------- mise en page
  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, out: Button[] = [];
    // Onglets avec le nombre d'objets
    const th = Math.max(42, 42 * ui), tw = (C.w - gap * (TABS.length - 1)) / TABS.length, small = tw < 120 * ui;
    TABS.forEach(([id, label]) => {
      const n = id === 'chips' ? null : this.build(id).length;
      out.push(makeButton({
        id: `inv-${id}`, label: small ? label.replace('Décorations', 'Déco').replace('Provisions', 'Vivres') : label, sub: n === null ? undefined : `${n} objet${n > 1 ? 's' : ''}`,
        style: 'secondary', active: this.tab === id, fontSize: small ? 11.5 : 14,
        x: C.x + TABS.findIndex((t) => t[0] === id) * (tw + gap), y: C.y, w: tw, h: th,
        onTap: () => { this.tab = lastTab = id; this.page = 0; this.selected = null; this.relayout(); },
      }));
    });
    this.entries = this.tab === 'chips' ? [] : this.sorted(this.build(this.tab));
    if (!this.entries.some((e) => e.key === this.selected)) { this.selected = this.entries[0]?.key ?? null; this.selT = 0; }
    // Grille + fiche : côte à côte en paysage, l'une sous l'autre en portrait
    const top = C.y + th + 12 * ui, H = C.y + C.h - top, wide = C.w > 600 * ui;
    this.grid = wide ? { x: C.x, y: top, w: C.w * 0.56, h: H } : { x: C.x, y: top, w: C.w, h: H * 0.5 };
    this.detail = wide ? { x: C.x + C.w * 0.56 + 12 * ui, y: top, w: C.w * 0.44 - 12 * ui, h: H } : { x: C.x, y: top + H * 0.5 + 10 * ui, w: C.w, h: H * 0.5 - 10 * ui };
    if (this.tab !== 'chips') {
      // Tri (cycle) et pages
      const sh = Math.max(44, 40 * ui); // zone tactile ≥ 44 px
      out.push(makeButton({ id: 'inv-sort', label: `Tri : ${this.sort}`, style: 'ghost', fontSize: 12, x: this.grid.x, y: this.grid.y, w: Math.min(150 * ui, this.grid.w * 0.45), h: sh,
        onTap: () => { this.sort = lastSort = this.sort === 'rareté' ? 'nom' : this.sort === 'nom' ? 'quantité' : 'rareté'; this.relayout(); } }));
      const cell = Math.max(64, Math.min(92 * ui, (this.grid.w - gap * 3) / 4)), cols = Math.max(1, Math.floor((this.grid.w + gap) / (cell + gap)));
      const gy = this.grid.y + sh + 8 * ui, rows = Math.max(1, Math.floor((this.grid.y + this.grid.h - gy + gap) / (cell + gap)));
      const per = cols * rows;
      this.pages = Math.max(1, Math.ceil(this.entries.length / per));
      this.page = Math.min(this.page, this.pages - 1);
      if (this.pages > 1) {
        const pw = Math.max(44, 44 * ui);
        out.push(makeButton({ id: 'inv-prev', label: '‹', style: 'ghost', fontSize: 20, x: this.grid.x + this.grid.w - pw * 2 - gap, y: this.grid.y, w: pw, h: sh, enabled: this.page > 0, onTap: () => { this.page--; this.relayout(); } }));
        out.push(makeButton({ id: 'inv-next', label: '›', style: 'ghost', fontSize: 20, x: this.grid.x + this.grid.w - pw, y: this.grid.y, w: pw, h: sh, enabled: this.page < this.pages - 1, onTap: () => { this.page++; this.relayout(); } }));
      }
      this.entries.slice(this.page * per, this.page * per + per).forEach((e, i) => {
        const x = this.grid.x + (i % cols) * (cell + gap), y = gy + Math.floor(i / cols) * (cell + gap);
        out.push(makeButton({ id: `inv-cell-${e.key}`, label: e.name, x, y, w: cell, h: cell, style: 'secondary',
          onTap: () => { if (this.selected !== e.key) { this.selected = e.key; this.selT = 0; this.s.audio.tick(); this.relayout(); } },
          draw: (ctx, b, u) => this.drawCell(ctx, b, u, e) }));
      });
      // Actions de l'objet sélectionné (bas de la fiche)
      const sel = this.entries.find((x) => x.key === this.selected);
      if (sel) {
        const D = this.detail, bh = Math.max(46, 46 * ui), by = D.y + D.h - bh;
        const two = !!sel.primary && !!sel.secondary, bw = two ? (D.w - gap) / 2 : D.w;
        if (sel.primary) out.push(makeButton({ id: 'inv-primary', label: sel.primary.label, style: 'gold', fontSize: 16, x: D.x, y: by, w: bw, h: bh, enabled: sel.primary.enabled, onTap: sel.primary.run }));
        if (sel.secondary) out.push(makeButton({ id: 'inv-secondary', label: sel.secondary.label, style: 'ghost', fontSize: 15, x: sel.primary ? D.x + bw + gap : D.x, y: by, w: bw, h: bh, onTap: sel.secondary.run }));
      }
    }
    return out;
  }

  /** Carte d'objet : fond selon la rareté, icône, quantité, état ; légère pulsation à la sélection. */
  private drawCell(ctx: CanvasRenderingContext2D, b: Button, ui: number, e: Entry): void {
    const sel = e.key === this.selected, rc = RARITY[e.rarity].color;
    const pop = sel ? 1 + 0.06 * Math.max(0, 1 - this.selT * 4) : 1;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + (b.pressed ? 2 : 0);
    ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
    roundRect(ctx, b.x, b.y, b.w, b.h, 12 * ui);
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, sel ? 'rgba(40,52,74,0.98)' : 'rgba(22,30,46,0.95)'); g.addColorStop(1, 'rgba(8,12,22,0.95)');
    ctx.fillStyle = g; ctx.fill();
    // Liseré de rareté (lueur pour la sélection)
    ctx.strokeStyle = rc; ctx.lineWidth = sel ? 2.4 : 1.2; ctx.globalAlpha = sel ? 1 : 0.65;
    if (sel) { ctx.shadowColor = rc; ctx.shadowBlur = 10; }
    ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    // Reflet nacré
    const hl = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    hl.addColorStop(0, 'rgba(255,255,255,0.08)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fill();
    e.icon(ctx, cx, b.y + b.h * 0.44, b.w * 0.42);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(10 * ui, 700); ctx.fillStyle = PAL.text;
    ctx.fillText(e.name, cx, b.y + b.h - 12 * ui, b.w - 10 * ui);
    if (e.max > 1 || e.qty > 1) {
      const t = `×${e.qty}`; ctx.font = font(11 * ui, 900);
      const w = ctx.measureText(t).width + 10 * ui;
      roundRect(ctx, b.x + b.w - w - 4 * ui, b.y + 4 * ui, w, 16 * ui, 8 * ui); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
      ctx.fillStyle = LUXE.champagne; ctx.fillText(t, b.x + b.w - w / 2 - 4 * ui, b.y + 12 * ui);
    }
    if (e.badge) {
      ctx.font = font(9.5 * ui, 800); const w = ctx.measureText(e.badge).width + 10 * ui;
      roundRect(ctx, b.x + 4 * ui, b.y + 4 * ui, w, 16 * ui, 8 * ui); ctx.fillStyle = 'rgba(47,174,107,0.9)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(e.badge, b.x + 4 * ui + w / 2, b.y + 12 * ui);
    }
    // Point de rareté
    ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(b.x + 9 * ui, b.y + b.h - 22 * ui, 3 * ui, 0, Math.PI * 2); ctx.fill();
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    ctx.save();
    ctx.textBaseline = 'middle';
    if (this.tab === 'chips') { this.renderChips(ctx, ui, C); ctx.restore(); return; }
    // Fiche de l'objet sélectionné
    const D = this.detail;
    roundRect(ctx, D.x, D.y, D.w, D.h, 14 * ui);
    const bg = ctx.createLinearGradient(0, D.y, 0, D.y + D.h);
    bg.addColorStop(0, 'rgba(14,40,70,0.55)'); bg.addColorStop(1, 'rgba(6,14,28,0.6)');
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    const sel = this.entries.find((e) => e.key === this.selected);
    if (!sel) {
      ctx.textAlign = 'center'; ctx.font = font(14 * ui, 600); ctx.fillStyle = PAL.textDim;
      wrapText(ctx, EMPTY[this.tab], D.w - 30 * ui).forEach((l, i) => ctx.fillText(l, D.x + D.w / 2, D.y + D.h * 0.38 + i * 20 * ui));
      // Grille vide : même message, côté grille (paysage)
      if (this.grid.x !== D.x) { ctx.font = font(13 * ui, 600); ctx.fillText('Rien ici pour l’instant', this.grid.x + this.grid.w / 2, this.grid.y + this.grid.h * 0.4); }
      ctx.restore(); return;
    }
    const rc = RARITY[sel.rarity].color, wide = D.w > 320 * ui;
    const ir = Math.min(D.h * (wide ? 0.17 : 0.24), 54 * ui), icx = D.x + (wide ? D.w / 2 : 16 * ui + ir), icy = D.y + 14 * ui + ir;
    // Halo de rareté qui respire, grande icône
    const halo = ctx.createRadialGradient(icx, icy, ir * 0.3, icx, icy, ir * 1.5);
    halo.addColorStop(0, `${rc}55`); halo.addColorStop(1, `${rc}00`);
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(icx, icy, ir * (1.45 + 0.05 * Math.sin(this.selT * 3)), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,12,22,0.85)'; ctx.fill();
    ctx.strokeStyle = rc; ctx.lineWidth = 2; ctx.stroke();
    sel.icon(ctx, icx, icy, ir * 1.15);
    // Textes
    const tx = wide ? D.x + D.w / 2 : D.x + 30 * ui + ir * 2, tw = wide ? D.w - 24 * ui : D.x + D.w - tx - 10 * ui;
    let y = wide ? icy + ir + 22 * ui : D.y + 22 * ui;
    ctx.textAlign = wide ? 'center' : 'left';
    ctx.font = font(17 * ui, 900); ctx.fillStyle = PAL.text; ctx.fillText(sel.name, tx, y, tw); y += 21 * ui;
    ctx.font = font(12 * ui, 800); ctx.fillStyle = rc; ctx.fillText(`${RARITY[sel.rarity].label} · ${sel.type}`, tx, y, tw); y += 22 * ui;
    ctx.font = font(12.5 * ui, 500); ctx.fillStyle = PAL.textDim;
    for (const l of wrapText(ctx, sel.desc, tw).slice(0, 2)) { ctx.fillText(l, tx, y, tw); y += 17 * ui; }
    y += 4 * ui;
    ctx.font = font(12.5 * ui, 700); ctx.fillStyle = PAL.text;
    const maxY = D.y + D.h - Math.max(46, 46 * ui) - 10 * ui;
    for (const d of sel.details) { if (y > maxY - 8 * ui) break; ctx.fillText(`• ${d}`, tx, y, tw); y += 18 * ui; }
    if (sel.primary?.note && y < maxY) { ctx.font = font(11.5 * ui, 600); ctx.fillStyle = PAL.goldLight; ctx.fillText(sel.primary.note, tx, Math.min(y + 4 * ui, maxY), tw); }
    // Animation d'utilisation : l'icône monte et s'efface, avec le résultat
    if (this.fx) {
      const k = this.fx.t / 0.9;
      ctx.globalAlpha = 1 - k;
      this.fx.icon(ctx, icx, icy - k * 50 * ui, ir * (1.15 + k * 0.5));
      ctx.textAlign = 'center'; ctx.font = font(15 * ui, 900); ctx.fillStyle = PAL.success;
      ctx.fillText(this.fx.text, icx, icy - ir - 14 * ui - k * 30 * ui);
      ctx.globalAlpha = 1;
    }
    if (this.pages > 1) {
      ctx.textAlign = 'center'; ctx.font = font(11.5 * ui, 700); ctx.fillStyle = PAL.textDim;
      ctx.fillText(`Page ${this.page + 1}/${this.pages}`, this.grid.x + this.grid.w - 2 * Math.max(44, 44 * ui) - 46 * ui, this.grid.y + Math.max(36, 34 * ui) / 2);
    }
    ctx.restore();
  }

  private renderChips(ctx: CanvasRenderingContext2D, ui: number, C: { x: number; y: number; w: number; h: number }): void {
    const cx = C.x + C.w / 2, y = this.grid.y + 50 * ui;
    drawChipTop(ctx, cx - 110 * ui, y, 24 * ui, 100);
    ctx.textAlign = 'left'; ctx.font = font(26 * ui, 900); ctx.fillStyle = LUXE.champagne;
    ctx.fillText(`${this.s.chips.balance.toLocaleString('fr-FR')} jetons`, cx - 78 * ui, y);
    drawKSCoin(ctx, cx - 110 * ui, y + 58 * ui, 20 * ui);
    ctx.font = font(19 * ui, 800); ctx.fillStyle = PAL.text;
    ctx.fillText(`${this.s.wallet.balance.toLocaleString('fr-FR')} KSCoins`, cx - 78 * ui, y + 58 * ui);
    ctx.textAlign = 'center'; ctx.font = font(13.5 * ui, 500); ctx.fillStyle = PAL.textDim;
    ['Les jetons servent à toutes les tables et machines du casino.', 'Achat et revente à la caisse du casino (1er étage), au taux affiché.', 'Les KSCoins paient le bar, la boutique, l’arcade et la décoration.']
      .forEach((l, i) => ctx.fillText(l, cx, y + 112 * ui + i * 22 * ui, C.w));
  }
}

const EMPTY: Record<Tab, string> = {
  food: 'Aucune provision. Au bar ou au snack, touche « Emporter » pour garder un plat ou une boisson.',
  wear: 'Aucun vêtement acheté. La Boutique KS (hall, à côté de la réception) vend tenues, chaussures, chapeaux, lunettes et bijoux.',
  items: 'Aucun objet. La Boutique KS vend feux d’artifice, confettis et parfum ; le KS Pass Croisière t’attend à la réception.',
  deco: 'Aucune décoration. Achète des meubles depuis le bureau de décoration de ta cabine.',
  chips: '',
};
