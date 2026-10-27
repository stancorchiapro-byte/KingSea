// Serrurier du couloir des logements : doubles de la clé de cabine (payés en KSCoins, prix fixés par l'autorité),
// renommage des doubles, changement de serrure (tous les doubles en circulation cessent d'ouvrir).
// La clé principale reste personnelle ; chaque opération est vérifiée et appliquée par l'autorité.
import { LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { KEY_COPY_PRICE, LOCK_CHANGE_PRICE, MAX_OWN_COPIES } from '../authority/keys';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { keyIcon } from './itemIcons';
import { Modal } from './Modal';
import { promptText } from './TextPrompt';
import { font, makeButton, wrapText, type Button } from './UIKit';

export class LocksmithMenu extends Modal {
  private vp: Viewport | null = null;
  private busy = false;
  private status = '';
  private confirmLock = false;
  constructor(s: Services, private toast: (m: string, k: 'success' | 'error' | 'info') => void) { super(s, 'Serrurier · Maître Anselme'); }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  protected measure(vp: Viewport, maxW: number, maxH: number) { return { w: Math.min(maxW, 620 * vp.ui), h: Math.min(maxH, 520 * vp.ui) }; }

  private keys() { return this.s.data.keys ?? []; }
  private master() { return this.keys().find((k) => k.master) ?? null; }
  private myCopies() { const m = this.master(); return m ? this.keys().filter((k) => !k.master && k.cabin === m.cabin && k.owner === m.owner) : []; }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 10 * ui, out: Button[] = [], bh = Math.max(50, 52 * ui);
    const m = this.master(), copies = this.myCopies();
    const top = C.y + 96 * ui;
    const bw = (C.w - gap) / 2;
    out.push(makeButton({ id: 'ls-copy', label: this.busy ? 'Fabrication…' : 'Faire un double', sub: `${KEY_COPY_PRICE} KSCoins · ${copies.length}/${MAX_OWN_COPIES} doubles`, style: 'gold', fontSize: 15,
      enabled: !!m && !this.busy && copies.length < MAX_OWN_COPIES && this.s.wallet.balance >= KEY_COPY_PRICE, x: C.x, y: top, w: bw, h: bh, onTap: () => void this.run('key-copy', {}, 'Double fabriqué : il est dans ton trousseau (inventaire, onglet Objets).') }));
    out.push(makeButton({ id: 'ls-lock', label: this.confirmLock ? 'Confirmer le changement' : 'Changer la serrure', sub: `${LOCK_CHANGE_PRICE} KSCoins · les doubles donnés n’ouvrent plus`, style: this.confirmLock ? 'danger' : 'secondary', fontSize: 15,
      enabled: !!m && !this.busy && this.s.wallet.balance >= LOCK_CHANGE_PRICE, x: C.x + bw + gap, y: top, w: bw, h: bh,
      onTap: () => { if (!this.confirmLock) { this.confirmLock = true; this.status = 'Les doubles déjà donnés à tes amis cesseront d’ouvrir ta porte. Touche encore pour confirmer.'; this.relayout(); return; } this.confirmLock = false; void this.run('lock-change', {}, 'Serrure changée : seuls ta clé principale et tes doubles actuels ouvrent ta porte.'); } }));
    const rowH = Math.max(46, 48 * ui), ly = top + bh + 44 * ui;
    const rows = Math.max(0, Math.floor((C.y + C.h - 24 * ui - ly) / rowH));
    this.keys().slice(0, rows).forEach((k, i) => {
      if (k.master) return;
      out.push(makeButton({ id: `ls-ren-${k.uid}`, label: 'Renommer', style: 'ghost', fontSize: 12.5, enabled: !this.busy, x: C.x + C.w - 120 * ui, y: ly + i * rowH + 4 * ui, w: 120 * ui, h: rowH - 8 * ui,
        onTap: () => promptText('Nom du double', k.name, (v) => { if (v && v !== k.name) void this.run('key-rename', { uid: k.uid, name: v }, 'Double renommé.'); }) }));
    });
    return out;
  }

  private async run(action: string, input: unknown, ok: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.status = ''; this.relayout();
    const r = await this.s.ask('purser', 'purser', action, input);
    this.busy = false;
    if (r.ok) { this.s.audio.ding(); this.status = ok; this.toast(ok, 'success'); } else { this.s.audio.error(); this.status = r.error; }
    this.relayout();
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content, m = this.master();
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(13.5 * ui, 500); ctx.fillStyle = PAL.text;
    const intro = m ? `« Bien le bonjour ! Ta cabine n° ${m.cabin} a une serrure de qualité. Je fais des doubles pour tes amis : ils ouvrent ta porte, mais ta clé principale reste à toi. »`
      : '« Il te faut d’abord une cabine : passe au couloir des logements, une porte t’attend. »';
    wrapText(ctx, intro, C.w).slice(0, 3).forEach((l, i) => ctx.fillText(l, C.x, C.y + 14 * ui + i * 20 * ui));
    const top = C.y + 96 * ui + Math.max(50, 52 * ui) + 22 * ui;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(14 * ui, 800);
    ctx.fillText('Ton trousseau', C.x, top);
    const rowH = Math.max(46, 48 * ui), ly = top + 22 * ui;
    const rows = Math.max(0, Math.floor((C.y + C.h - 24 * ui - ly) / rowH));
    const lock = this.s.data.keyring?.lock ?? 1;
    this.keys().slice(0, rows).forEach((k, i) => {
      const y = ly + i * rowH;
      roundRect(ctx, C.x, y + 2 * ui, C.w, rowH - 4 * ui, 10 * ui); ctx.fillStyle = 'rgba(18,26,40,0.8)'; ctx.fill();
      keyIcon(k.master)(ctx, C.x + 22 * ui, y + rowH / 2, 30 * ui);
      ctx.fillStyle = PAL.text; ctx.font = font(13.5 * ui, 800);
      ctx.fillText(k.name, C.x + 46 * ui, y + rowH * 0.38, C.w - 190 * ui);
      ctx.fillStyle = PAL.textDim; ctx.font = font(11 * ui, 600);
      const own = k.owner === this.s.data.playerId;
      ctx.fillText(k.master ? 'Clé principale · personnelle' : own ? (k.lock === lock ? 'Double de ta cabine · valide' : 'Double de ta cabine · serrure changée') : `Double de la cabine n° ${k.cabin} (cadeau d’un ami)`, C.x + 46 * ui, y + rowH * 0.7, C.w - 190 * ui);
    });
    if (!this.keys().length) { ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 600); ctx.fillText('Aucune clé pour l’instant.', C.x, ly + 14 * ui); }
    if (this.status) { ctx.fillStyle = LUXE.champagne; ctx.font = font(12 * ui, 700); ctx.textAlign = 'center'; ctx.fillText(this.status, C.x + C.w / 2, C.y + C.h - 8 * ui, C.w); }
    ctx.restore();
  }
}
