// Commande au bar ou au snack : boissons et plats fictifs, prix en KSCoins, effets sur la faim et la soif.
// « Commander » : servi et consommé aussitôt ; « Emporter » : rangé dans l'inventaire pour plus tard.
// L'achat est validé par l'autorité (solde, menu, quantité maximale).
import type { Drink } from '../data/drinks';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { Icons, makeButton, type Button } from './UIKit';

export function drawGlassIcon(color: string, foam: string) {
  return (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => {
    ctx.save();
    const w = s * 0.55, h = s * 0.8;
    ctx.fillStyle = 'rgba(220,245,255,0.35)';
    ctx.beginPath(); ctx.moveTo(cx - w / 2, cy - h / 2); ctx.lineTo(cx + w / 2, cy - h / 2); ctx.lineTo(cx + w * 0.38, cy + h / 2); ctx.lineTo(cx - w * 0.38, cy + h / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.46, cy - h * 0.25); ctx.lineTo(cx + w * 0.46, cy - h * 0.25); ctx.lineTo(cx + w * 0.38, cy + h / 2); ctx.lineTo(cx - w * 0.38, cy + h / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = foam; ctx.fillRect(cx - w * 0.46, cy - h * 0.3, w * 0.92, h * 0.1);
    ctx.strokeStyle = '#e5b54a'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath(); ctx.moveTo(cx + w * 0.1, cy - h * 0.25); ctx.lineTo(cx + w * 0.3, cy - h * 0.62); ctx.stroke();
    ctx.restore();
  };
}

/** Assiette (plats). */
export function drawPlateIcon(color: string, accent: string) {
  return (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => {
    ctx.save();
    ctx.fillStyle = '#f6f0e3'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.12, s * 0.46, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.02, s * 0.28, s * 0.17, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(cx - s * 0.06, cy - s * 0.06, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
}

/** Icône d'un article : verre pour les boissons, assiette pour les plats. */
export const itemIcon = (d: { kind: 'drink' | 'food'; color: string; foam: string }) => (d.kind === 'food' ? drawPlateIcon(d.color, d.foam) : drawGlassIcon(d.color, d.foam));

/** Effets lisibles d'un article (« +30 soif · +8 faim »). */
export function effectText(d: { hunger?: number; thirst?: number }): string {
  const parts = [d.thirst ? `+${d.thirst} soif` : '', d.hunger ? `+${d.hunger} faim` : ''].filter(Boolean);
  return parts.join(' · ');
}

export class BarMenu extends Modal {
  constructor(s: Services, title: string, private drinks: Drink[], private onBuy: (d: Drink, consume: boolean) => void) { super(s, title); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    const ui = vp.ui, cols = vp.isPortrait ? 1 : 2, rows = Math.ceil(this.drinks.length / cols);
    const h = Math.min(maxH, rows * 66 * ui + (rows - 1) * 10 * ui + 34 * ui);
    return { w: Math.min(maxW, cols === 2 ? 600 * ui : 380 * ui), h };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, cols = vp.isPortrait ? 1 : 2, rows = Math.ceil(this.drinks.length / cols), gap = 10 * ui;
    const top = this.content.y + 34 * ui;
    const bw = (this.content.w - gap * (cols - 1)) / cols;
    const bh = Math.min(66 * ui, (this.content.y + this.content.h - top - gap * (rows - 1)) / rows);
    const bal = this.s.wallet.balance;
    const out: Button[] = [];
    const tw = Math.max(64, 74 * ui);
    this.drinks.forEach((d, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const afford = bal >= d.price;
      const x = this.content.x + col * (bw + gap), y = top + row * (bh + gap);
      const have = this.s.itemCount(`${d.kind}.${d.id}`);
      out.push(makeButton({
        id: `drink-${d.id}`, label: `${d.name} · ${d.price} KSCoins`,
        sub: afford ? `${effectText(d)}${have ? ` · ${have} dans ton sac` : ''}` : `Il te manque ${d.price - bal} KSCoins`,
        icon: itemIcon(d), style: 'secondary', enabled: afford, fontSize: 15,
        x, y, w: bw - tw - 6 * ui, h: bh,
        onTap: () => { this.onBuy(d, true); this.layout(vp); },
      }));
      out.push(makeButton({ id: `take-${d.id}`, label: 'Emporter', sub: 'au sac', style: 'ghost', enabled: afford, fontSize: 12, x: x + bw - tw, y, w: tw, h: bh, onTap: () => { this.onBuy(d, false); this.layout(vp); } }));
    });
    return out;
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui;
    Icons.coin(ctx, this.content.x + 9 * ui, this.content.y + 12 * ui, 18 * ui);
    ctx.fillStyle = '#f6fbff'; ctx.font = `700 ${Math.round(15 * ui)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${this.s.wallet.balance} KSCoins`, this.content.x + 22 * ui, this.content.y + 12 * ui);
    if (this.content.w > 440 * ui) {
      ctx.fillStyle = '#cbbfa8'; ctx.font = `500 ${Math.round(12 * ui)}px system-ui, sans-serif`; ctx.textAlign = 'right';
      ctx.fillText('Monnaie virtuelle du jeu, sans valeur réelle', this.content.x + this.content.w, this.content.y + 12 * ui);
    }
  }
}
