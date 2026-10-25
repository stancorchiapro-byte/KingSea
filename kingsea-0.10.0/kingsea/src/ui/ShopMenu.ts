// Boutique KS (hall) : vêtements, chaussures, accessoires, bijoux et objets, payés en KSCoins.
// L'icône montre TON personnage portant l'article (aperçu). Achat validé par l'autorité (solde, niveau, objet
// unique) puis rangé dans l'inventaire ; un vêtement acheté peut être porté tout de suite.
import { drawKSCoin } from '../art/brand';
import { PAL } from '../art/palette';
import { ITEMS, type ItemDef } from '../data/items';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { itemIconFor } from './itemIcons';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

type Cat = 'tops' | 'bas' | 'acc' | 'objets';
const CATS: Array<[Cat, string, (d: ItemDef) => boolean]> = [
  ['tops', 'Tenues', (d) => d.slot === 'outfit'],
  ['bas', 'Bas & chaussures', (d) => d.slot === 'pants' || d.slot === 'shoes'],
  ['acc', 'Accessoires', (d) => d.slot === 'hat' || d.slot === 'glasses' || d.slot === 'jewel'],
  ['objets', 'Objets', (d) => d.type === 'usable' || d.type === 'cosmetic'],
];

export class ShopMenu extends Modal {
  private cat: Cat = 'tops';
  private page = 0;
  private pages = 1;
  private busy = false;
  private coolUntil = 0;
  private note = '';
  private vp: Viewport | null = null;

  constructor(s: Services, private toast: (msg: string, kind: 'success' | 'error' | 'info' | 'reward') => void) { super(s, 'Boutique KS'); }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 720 * vp.ui), h: Math.min(maxH, 540 * vp.ui) };
  }

  private owns(d: ItemDef): boolean { return this.s.itemCount(d.id) > 0 || (!!d.slot && this.s.progress.unlocks.includes(d.id)); }

  private async buy(d: ItemDef): Promise<void> {
    if (this.busy || performance.now() < this.coolUntil) return; // anti double toucher
    this.busy = true; this.note = ''; this.relayout();
    const r = await this.s.ask('purser', 'purser', 'shop-buy', { item: d.id });
    this.busy = false; this.coolUntil = performance.now() + 500;
    if (!r.ok) { this.s.audio.error(); this.note = r.error; this.relayout(); return; }
    this.s.audio.coin();
    this.toast(`${d.name} acheté (−${d.price} KSCoins) · rangé dans l’inventaire`, 'reward');
    this.relayout();
  }

  private wear(d: ItemDef): void {
    const err = this.s.wear(d.slot!, d.value!);
    if (err) { this.s.audio.error(); this.note = err; } else { this.s.audio.swish(); this.toast(`${d.name} porté`, 'success'); }
    this.relayout();
  }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, out: Button[] = [];
    const th = Math.max(40, 40 * ui), tw = (C.w - gap * (CATS.length - 1)) / CATS.length;
    CATS.forEach(([id, label], i) => out.push(makeButton({ id: `shop-${id}`, label, style: 'secondary', active: this.cat === id, fontSize: vp.isPortrait ? 12 : 14, x: C.x + i * (tw + gap), y: C.y + 30 * ui, w: tw, h: th,
      onTap: () => { this.cat = id; this.page = 0; this.note = ''; this.relayout(); } })));
    const filter = CATS.find((c) => c[0] === this.cat)![2];
    const list = ITEMS.filter((d) => d.price > 0 && filter(d));
    const top = C.y + 30 * ui + th + 10 * ui, pagerH = Math.max(40, 40 * ui), rh = Math.max(52, 58 * ui);
    const cols = vp.isPortrait ? 1 : 2, colW = (C.w - gap * (cols - 1)) / cols;
    const rowsPer = Math.max(1, Math.floor((C.y + C.h - top - pagerH - 18 * ui + gap) / (rh + gap)));
    const per = rowsPer * cols;
    this.pages = Math.max(1, Math.ceil(list.length / per));
    this.page = Math.min(this.page, this.pages - 1);
    const lvl = this.s.progress.level, bal = this.s.wallet.balance, aw = Math.max(80, 88 * ui);
    list.slice(this.page * per, this.page * per + per).forEach((d, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = C.x + col * (colW + gap), y = top + row * (rh + gap);
      const owned = this.owns(d), stackFull = !d.slot && this.s.itemCount(d.id) >= d.stack;
      const locked = (d.level ?? 1) > lvl;
      const on = owned && d.slot ? this.s.wearing(d.slot, d.value!) : false;
      const sub = locked ? `Niveau ${d.level} requis` : owned && d.slot ? (on ? 'Possédé · porté' : 'Possédé') : stackFull ? `Maximum atteint (${d.stack})` : bal < d.price ? `Il te manque ${d.price - bal} KSCoins` : d.desc;
      const have = !d.slot && this.s.itemCount(d.id) ? ` (×${this.s.itemCount(d.id)})` : '';
      out.push(makeButton({ id: `shop-row-${d.id}`, label: `${d.name}${have} · ${d.price}`, sub, icon: itemIconFor(d, this.s.data.appearance), style: 'secondary', active: on, fontSize: 14, x, y, w: colW - aw - 6 * ui, h: rh, onTap: () => { this.note = `${d.name} : ${d.desc}`; this.relayout(); } }));
      if (owned && d.slot) out.push(makeButton({ id: `shop-wear-${d.id}`, label: on ? 'Porté' : 'Porter', style: 'secondary', fontSize: 14, x: x + colW - aw, y, w: aw, h: rh, enabled: !on && !this.busy, onTap: () => this.wear(d) }));
      else out.push(makeButton({ id: `shop-buy-${d.id}`, label: 'Acheter', style: 'gold', fontSize: 14, x: x + colW - aw, y, w: aw, h: rh, enabled: !this.busy && !locked && !stackFull && bal >= d.price, onTap: () => void this.buy(d) }));
    });
    if (this.pages > 1) {
      const py = C.y + C.h - pagerH, pw = Math.max(64, 80 * ui);
      out.push(makeButton({ id: 'shop-prev', label: '‹ Préc.', style: 'ghost', fontSize: 14, x: C.x, y: py, w: pw, h: pagerH, enabled: this.page > 0, onTap: () => { this.page--; this.relayout(); } }));
      out.push(makeButton({ id: 'shop-next', label: 'Suiv. ›', style: 'ghost', fontSize: 14, x: C.x + C.w - pw, y: py, w: pw, h: pagerH, enabled: this.page < this.pages - 1, onTap: () => { this.page++; this.relayout(); } }));
    }
    return out;
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    ctx.save(); ctx.textBaseline = 'middle';
    drawKSCoin(ctx, C.x + 10 * ui, C.y + 12 * ui, 10 * ui);
    ctx.font = font(15 * ui, 800); ctx.fillStyle = PAL.text; ctx.textAlign = 'left';
    ctx.fillText(`${this.s.wallet.balance.toLocaleString('fr-FR')} KSCoins`, C.x + 26 * ui, C.y + 12 * ui);
    ctx.font = font(12 * ui, 500); ctx.fillStyle = PAL.textDim; ctx.textAlign = 'right';
    ctx.fillText('Prix en KSCoins · achats rangés dans l’inventaire', C.x + C.w, C.y + 12 * ui, C.w * 0.55);
    const pagerY = C.y + C.h - Math.max(40, 40 * ui) / 2;
    ctx.textAlign = 'center';
    // Message (description ou erreur) à la place du numéro de page
    ctx.font = font(13 * ui, 700);
    if (this.note) { ctx.fillStyle = this.note.includes(' : ') ? PAL.textDim : PAL.danger; ctx.fillText(this.note, C.x + C.w / 2, pagerY, C.w - 190 * ui); }
    else if (this.pages > 1) { ctx.fillStyle = PAL.textDim; ctx.fillText(`Page ${this.page + 1} / ${this.pages}`, C.x + C.w / 2, pagerY); }
    ctx.restore();
  }
}
