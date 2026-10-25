// Caisse du casino : échange KSCoins ↔ jetons de casino au taux unique (authority/economy.ts › CHIP_RATE).
// On choisit le sens et la quantité, on voit les deux soldes et le montant obtenu AVANT de confirmer ; « Annuler »
// ferme sans rien faire. L'autorité réalise l'échange en une seule opération (les deux soldes ensemble ou rien),
// et le bouton est bloqué pendant la demande (un double toucher ne déclenche jamais deux échanges).
import { drawChipTop, drawKSCoin, LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import { CHIP_RATE } from '../authority/economy';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { promptNumber } from './TextPrompt';
import { font, makeButton, type Button } from './UIKit';

type Dir = 'buy' | 'sell';
const PRESETS = [10, 50, 100, 500, 1000];

export class CashierMenu extends Modal {
  private dir: Dir = 'buy';
  private amount = 100;
  private busy = false;
  /** Anti double toucher : après un échange, « Confirmer » reste inactif un court instant. */
  private coolUntil = 0;
  private note = '';
  private vp: Viewport | null = null;
  private summaryY = 0;

  constructor(s: Services, private onDone?: (msg: string) => void) {
    super(s, 'Caisse du casino');
    this.amount = Math.max(CHIP_RATE.minExchange, Math.min(100, this.max));
  }

  /** Quantité maximale échangeable dans le sens choisi (en jetons). */
  private get max(): number {
    const m = this.dir === 'buy' ? Math.floor(this.s.wallet.balance / CHIP_RATE.coinsPerChip) : this.s.chips.balance;
    return Math.min(CHIP_RATE.maxExchange, m);
  }

  private set(n: number): void { this.amount = Math.max(CHIP_RATE.minExchange, Math.min(Math.max(CHIP_RATE.minExchange, this.max), Math.floor(n))); this.note = ''; this.relayout(); }
  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 640 * vp.ui), h: Math.min(maxH, 470 * vp.ui) };
  }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, bh = Math.max(44, 44 * ui), out: Button[] = [];
    const tabsY = C.y + 70 * ui, tw = (C.w - gap) / 2;
    out.push(makeButton({ id: 'cash-buy', label: 'Acheter des jetons', style: 'secondary', active: this.dir === 'buy', fontSize: 14, x: C.x, y: tabsY, w: tw, h: bh, enabled: !this.busy, onTap: () => { this.dir = 'buy'; this.set(this.amount); } }));
    out.push(makeButton({ id: 'cash-sell', label: 'Revendre des jetons', style: 'secondary', active: this.dir === 'sell', fontSize: 14, x: C.x + tw + gap, y: tabsY, w: tw, h: bh, enabled: !this.busy, onTap: () => { this.dir = 'sell'; this.set(this.amount); } }));
    // Quantités : préréglages, tout, −/+, saisie libre
    const rowY = tabsY + bh + gap + 2 * ui;
    const items: Array<[string, string, () => void, boolean]> = [
      ...PRESETS.map((v): [string, string, () => void, boolean] => [`cash-${v}`, String(v), () => this.set(v), v <= this.max]),
      ['cash-all', 'Tout', () => this.set(this.max), this.max >= CHIP_RATE.minExchange],
    ];
    const cw = (C.w - gap * (items.length - 1)) / items.length;
    items.forEach(([id, label, fn, en], i) => out.push(makeButton({ id, label, style: 'secondary', active: label === String(this.amount), fontSize: 14, x: C.x + i * (cw + gap), y: rowY, w: cw, h: bh, enabled: en && !this.busy, onTap: fn })));
    const r2 = rowY + bh + gap;
    const sq = bh;
    out.push(makeButton({ id: 'cash-minus', label: '−', style: 'secondary', fontSize: 22, x: C.x, y: r2, w: sq, h: sq, enabled: !this.busy && this.amount > CHIP_RATE.minExchange, onTap: () => this.set(this.amount - (this.amount > 100 ? 50 : 10)) }));
    out.push(makeButton({ id: 'cash-plus', label: '+', style: 'secondary', fontSize: 22, x: C.x + sq + gap, y: r2, w: sq, h: sq, enabled: !this.busy && this.amount < this.max, onTap: () => this.set(this.amount + (this.amount >= 100 ? 50 : 10)) }));
    out.push(makeButton({ id: 'cash-custom', label: '✎ Autre montant', style: 'secondary', fontSize: 14, x: C.x + (sq + gap) * 2, y: r2, w: Math.min(200 * ui, C.w - (sq + gap) * 2), h: sq, enabled: !this.busy && this.max >= CHIP_RATE.minExchange,
      onTap: () => promptNumber(this.dir === 'buy' ? 'Jetons à acheter' : 'Jetons à revendre', this.amount, CHIP_RATE.minExchange, Math.max(CHIP_RATE.minExchange, this.max), (v) => { if (v !== null) this.set(v); }) }));
    this.summaryY = r2 + sq + 16 * ui;
    // Confirmer / Annuler
    const fy = C.y + C.h - bh, fw = (C.w - gap) / 2;
    out.push(makeButton({ id: 'cash-cancel', label: 'Annuler', style: 'ghost', fontSize: 15, x: C.x, y: fy, w: fw, h: bh, enabled: !this.busy, onTap: () => this.close() }));
    const can = !this.busy && this.max >= CHIP_RATE.minExchange && this.amount <= this.max && performance.now() >= this.coolUntil;
    out.push(makeButton({ id: 'cash-confirm', label: this.busy ? 'Échange en cours…' : 'Confirmer l’échange', style: 'gold', fontSize: 15, x: C.x + fw + gap, y: fy, w: fw, h: bh, enabled: can, onTap: () => void this.confirm() }));
    return out;
  }

  private async confirm(): Promise<void> {
    if (this.busy || performance.now() < this.coolUntil) return;
    const n = this.amount, dir = this.dir;
    if (n > this.max) { this.note = 'Solde insuffisant'; this.relayout(); return; }
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'purser', 'exchange', { dir, amount: n });
    this.busy = false;
    if (!r.ok) { this.note = r.error; this.s.audio.error(); this.relayout(); return; }
    this.s.audio.chip(); setTimeout(() => this.s.audio.coin(), 120);
    const coins = n * CHIP_RATE.coinsPerChip;
    const msg = dir === 'buy' ? `${n} jetons achetés (−${coins} KSCoins)` : `${n} jetons revendus (+${coins} KSCoins)`;
    this.note = `✓ ${msg}`;
    this.onDone?.(msg);
    this.coolUntil = performance.now() + 800;
    setTimeout(() => this.relayout(), 820);
    this.set(Math.min(this.amount, Math.max(CHIP_RATE.minExchange, this.max)));
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    ctx.save();
    ctx.textBaseline = 'middle';
    // Soldes
    const y = C.y + 18 * ui;
    drawKSCoin(ctx, C.x + 12 * ui, y, 12 * ui);
    ctx.font = font(16 * ui, 800); ctx.fillStyle = PAL.text; ctx.textAlign = 'left';
    ctx.fillText(`${this.s.wallet.balance.toLocaleString('fr-FR')} KSCoins`, C.x + 30 * ui, y);
    drawChipTop(ctx, C.x + C.w / 2 + 12 * ui, y, 12 * ui, 100);
    ctx.fillText(`${this.s.chips.balance.toLocaleString('fr-FR')} jetons`, C.x + C.w / 2 + 30 * ui, y);
    ctx.font = font(12.5 * ui, 600); ctx.fillStyle = PAL.textDim;
    ctx.fillText(`Taux : 1 jeton = ${CHIP_RATE.coinsPerChip} KSCoin${CHIP_RATE.coinsPerChip > 1 ? 's' : ''}, à l’achat comme à la revente · maximum ${CHIP_RATE.maxExchange.toLocaleString('fr-FR')} par échange`, C.x, C.y + 46 * ui, C.w);
    // Récapitulatif avant confirmation
    const coins = this.amount * CHIP_RATE.coinsPerChip;
    const give = this.dir === 'buy' ? `${coins.toLocaleString('fr-FR')} KSCoins` : `${this.amount.toLocaleString('fr-FR')} jetons`;
    const get = this.dir === 'buy' ? `${this.amount.toLocaleString('fr-FR')} jetons` : `${coins.toLocaleString('fr-FR')} KSCoins`;
    const after = this.dir === 'buy'
      ? `Après l’échange : ${(this.s.wallet.balance - coins).toLocaleString('fr-FR')} KSCoins · ${(this.s.chips.balance + this.amount).toLocaleString('fr-FR')} jetons`
      : `Après l’échange : ${(this.s.wallet.balance + coins).toLocaleString('fr-FR')} KSCoins · ${(this.s.chips.balance - this.amount).toLocaleString('fr-FR')} jetons`;
    const ok = this.amount <= this.max;
    ctx.textAlign = 'center';
    ctx.font = font(16 * ui, 800); ctx.fillStyle = ok ? LUXE.champagne : PAL.danger;
    ctx.fillText(ok ? `Tu donnes ${give} → tu reçois ${get}` : (this.dir === 'buy' ? 'Pas assez de KSCoins pour ce montant' : 'Pas assez de jetons pour ce montant'), C.x + C.w / 2, this.summaryY, C.w);
    ctx.font = font(12.5 * ui, 600); ctx.fillStyle = PAL.textDim;
    if (ok) ctx.fillText(after, C.x + C.w / 2, this.summaryY + 22 * ui, C.w);
    if (this.note) { ctx.fillStyle = this.note.startsWith('✓') ? PAL.success : PAL.danger; ctx.font = font(13 * ui, 700); ctx.fillText(this.note, C.x + C.w / 2, this.summaryY + 44 * ui, C.w); }
    ctx.restore();
  }
}
