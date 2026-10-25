// Inventaire central (bouton « sac » du HUD) : provisions, garde-robe, objets, décorations et jetons.
// Chaque ligne montre l'icône, la quantité, la description et l'état (porté, placé) ; le bouton d'action
// à droite consomme, porte/retire, utilise ou place l'objet. Les quantités viennent de l'autorité (dernier état
// reçu) et chaque action lui est demandée : un double toucher pendant une demande est ignoré.
import { drawChipTop, drawKSCoin, LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import { FURNITURE_BY_ID } from '../data/furniture';
import { ITEMS_BY_ID, type ItemDef, type WearSlot } from '../data/items';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { effectText } from './BarMenu';
import { furnitureIcon, itemIconFor } from './itemIcons';
import { Modal } from './Modal';
import { font, makeButton, wrapText, type Button } from './UIKit';

type Tab = 'food' | 'wear' | 'items' | 'deco' | 'chips';
const TABS: Array<[Tab, string]> = [['food', 'Provisions'], ['wear', 'Garde-robe'], ['items', 'Objets'], ['deco', 'Décorations'], ['chips', 'Jetons']];
const SLOT_LABEL: Record<WearSlot, string> = { outfit: 'Tenue', pants: 'Pantalon', shoes: 'Chaussures', hat: 'Couvre-chef', glasses: 'Lunettes', jewel: 'Bijou' };

interface Row { key: string; label: string; sub: string; icon: Button['icon']; action: string | null; enabled: boolean; run: () => void; active?: boolean }

export interface InventoryHooks {
  /** Consommation confirmée (effets réellement appliqués par l'autorité). */
  consumed: (def: ItemDef, eff: { hunger: number; thirst: number }) => void;
  /** Objet utilisé : l'effet visuel à jouer. */
  used: (def: ItemDef, effect: string) => void;
  /** Ouvre l'éditeur de cabine (null : le joueur n'est pas dans sa cabine). */
  placeDecor: (() => void) | null;
  toast: (msg: string, kind: 'success' | 'error' | 'info') => void;
}

export class InventoryMenu extends Modal {
  private tab: Tab = 'food';
  private page = 0;
  private busy = false;
  /** Anti double toucher : une consommation ou une utilisation à la fois, avec un court délai. */
  private coolUntil = 0;
  private vp: Viewport | null = null;
  private empty = '';
  private listTop = 0;

  constructor(s: Services, private hooks: InventoryHooks) { super(s, 'Inventaire'); }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 700 * vp.ui), h: Math.min(maxH, 540 * vp.ui) };
  }

  // ---------------------------------------------------------------- lignes par onglet
  private rows(): Row[] {
    const inv = this.s.data.inventory?.items ?? {};
    const owned = Object.entries(inv).filter(([, n]) => n > 0).map(([id, n]) => [ITEMS_BY_ID.get(id), n] as const).filter((e): e is readonly [ItemDef, number] => !!e[0]);
    const look = this.s.data.appearance;
    switch (this.tab) {
      case 'food':
        this.empty = 'Aucune provision. Au bar ou au snack, touche « Emporter » pour garder un plat ou une boisson.';
        return owned.filter(([d]) => d.type === 'food' || d.type === 'drink').map(([d, n]) => ({
          key: d.id, label: `${d.name} ×${n}`, sub: `${effectText(d)} · ${d.desc}`, icon: itemIconFor(d, look),
          action: d.type === 'food' ? 'Manger' : 'Boire', enabled: !this.busy, run: () => void this.consume(d),
        }));
      case 'wear': {
        this.empty = '';
        const out: Row[] = [];
        // Vêtements achetés ou débloqués (récompenses de niveau incluses)
        const unlocks = this.s.progress.unlocks;
        const defs = [...ITEMS_BY_ID.values()].filter((d) => d.slot && d.value && ((inv[d.id] ?? 0) > 0 || unlocks.includes(d.id)));
        for (const d of defs) {
          const on = this.s.wearing(d.slot!, d.value!);
          const removable = !(d.slot === 'outfit');
          out.push({
            key: d.id, label: d.name, sub: `${SLOT_LABEL[d.slot!]}${on ? ' · porté' : ''} · ${d.desc}`, icon: itemIconFor(d, look), active: on,
            action: on ? (removable ? 'Retirer' : 'Porté') : 'Porter', enabled: !this.busy && (!on || removable),
            run: () => this.wear(d.slot!, on ? null : d.value!, d.name, on),
          });
        }
        if (!out.length) this.empty = 'Aucun vêtement acheté. La Boutique KS (hall, à côté de la réception) vend tenues, chaussures, chapeaux, lunettes et bijoux. Les tenues de base se choisissent dans ton profil.';
        return out;
      }
      case 'items':
        this.empty = 'Aucun objet. La Boutique KS vend feux d’artifice, confettis et parfum.';
        return owned.filter(([d]) => d.type === 'usable' || d.type === 'cosmetic').map(([d, n]) => ({
          key: d.id, label: `${d.name} ×${n}`, sub: d.desc, icon: itemIconFor(d, look), action: 'Utiliser', enabled: !this.busy, run: () => void this.use(d),
        }));
      case 'deco': {
        this.empty = 'Aucune décoration. Achète des meubles depuis le bureau de décoration de ta cabine.';
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
            key: id, label: `${f.name} ×${n}`, sub: `${p} placé${p > 1 ? 's' : ''} · ${n - p} en réserve · se place dans ta cabine`, icon: furnitureIcon(f),
            action: place ? 'Placer' : 'En cabine', enabled: !!place && !this.busy, run: () => { if (place) { this.close(); place(); } },
          }];
        });
      }
      case 'chips':
        this.empty = '';
        return [];
    }
  }

  // ---------------------------------------------------------------- actions
  private async consume(d: ItemDef): Promise<void> {
    if (this.busy || performance.now() < this.coolUntil) return;
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'purser', 'consume', { item: d.id });
    this.busy = false; this.coolUntil = performance.now() + 500;
    if (!r.ok) { this.s.audio.error(); this.hooks.toast(r.error, 'error'); }
    else this.hooks.consumed(d, r.view as { hunger: number; thirst: number });
    this.relayout();
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

  private wear(slot: WearSlot, value: string | null, name: string, wasOn: boolean): void {
    const err = this.s.wear(slot, value);
    if (err) { this.s.audio.error(); this.hooks.toast(err, 'error'); }
    else { this.s.audio.swish(); this.hooks.toast(wasOn ? `${name} retiré` : `${name} porté`, 'success'); }
    this.relayout();
  }

  // ---------------------------------------------------------------- mise en page
  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, out: Button[] = [];
    const th = Math.max(40, 40 * ui), tw = (C.w - gap * (TABS.length - 1)) / TABS.length;
    TABS.forEach(([id, label], i) => out.push(makeButton({ id: `inv-${id}`, label, style: 'secondary', active: this.tab === id, fontSize: vp.isPortrait ? 11.5 : 14, x: C.x + i * (tw + gap), y: C.y, w: tw, h: th,
      onTap: () => { this.tab = id; this.page = 0; this.relayout(); } })));
    this.listTop = C.y + th + 12 * ui;
    const rows = this.rows();
    const rh = Math.max(52, 58 * ui), pagerH = Math.max(40, 40 * ui);
    const per = Math.max(1, Math.floor((C.y + C.h - this.listTop - pagerH - gap + gap) / (rh + gap)));
    const pages = Math.max(1, Math.ceil(rows.length / per));
    this.page = Math.min(this.page, pages - 1);
    const aw = Math.max(84, 96 * ui);
    rows.slice(this.page * per, this.page * per + per).forEach((r, i) => {
      const y = this.listTop + i * (rh + gap);
      out.push(makeButton({ id: `inv-row-${r.key}`, label: r.label, sub: r.sub, icon: r.icon, style: 'secondary', active: r.active, fontSize: 14, x: C.x, y, w: C.w - aw - gap, h: rh,
        onTap: r.enabled && r.action ? r.run : () => {} }));
      if (r.action) out.push(makeButton({ id: `inv-act-${r.key}`, label: r.action, style: r.action === 'Retirer' ? 'ghost' : 'gold', fontSize: 14, x: C.x + C.w - aw, y, w: aw, h: rh, enabled: r.enabled, onTap: r.run }));
    });
    if (pages > 1) {
      const py = C.y + C.h - pagerH, pw = Math.max(64, 80 * ui);
      out.push(makeButton({ id: 'inv-prev', label: '‹ Préc.', style: 'ghost', fontSize: 14, x: C.x, y: py, w: pw, h: pagerH, enabled: this.page > 0, onTap: () => { this.page--; this.relayout(); } }));
      out.push(makeButton({ id: 'inv-next', label: 'Suiv. ›', style: 'ghost', fontSize: 14, x: C.x + C.w - pw, y: py, w: pw, h: pagerH, enabled: this.page < pages - 1, onTap: () => { this.page++; this.relayout(); } }));
    }
    this.pages = pages;
    this.count = rows.length;
    return out;
  }
  private pages = 1;
  private count = 0;

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    ctx.save();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if (this.tab === 'chips') {
      const y = this.listTop + 40 * ui;
      drawChipTop(ctx, C.x + C.w / 2 - 110 * ui, y, 22 * ui, 100);
      ctx.font = font(26 * ui, 800); ctx.fillStyle = LUXE.champagne; ctx.textAlign = 'left';
      ctx.fillText(`${this.s.chips.balance.toLocaleString('fr-FR')} jetons`, C.x + C.w / 2 - 80 * ui, y);
      drawKSCoin(ctx, C.x + C.w / 2 - 110 * ui, y + 56 * ui, 18 * ui);
      ctx.font = font(18 * ui, 700); ctx.fillStyle = PAL.text;
      ctx.fillText(`${this.s.wallet.balance.toLocaleString('fr-FR')} KSCoins`, C.x + C.w / 2 - 80 * ui, y + 56 * ui);
      ctx.textAlign = 'center'; ctx.font = font(13.5 * ui, 500); ctx.fillStyle = PAL.textDim;
      ctx.fillText('Les jetons servent à toutes les tables et machines du casino.', C.x + C.w / 2, y + 108 * ui, C.w);
      ctx.fillText('Achat et revente à la caisse du casino (1er étage), au taux affiché.', C.x + C.w / 2, y + 130 * ui, C.w);
      ctx.fillText('Les KSCoins paient le bar, la boutique, l’arcade et la décoration.', C.x + C.w / 2, y + 152 * ui, C.w);
    } else if (!this.count && this.empty) {
      ctx.font = font(14.5 * ui, 500); ctx.fillStyle = PAL.textDim;
      wrapText(ctx, this.empty, C.w * 0.86).forEach((l, i) => ctx.fillText(l, C.x + C.w / 2, this.listTop + 50 * ui + i * 22 * ui));
    }
    if (this.pages > 1) {
      ctx.font = font(13 * ui, 700); ctx.fillStyle = PAL.textDim;
      ctx.fillText(`Page ${this.page + 1} / ${this.pages}`, C.x + C.w / 2, C.y + C.h - Math.max(40, 40 * ui) / 2);
    }
    ctx.restore();
  }
}
