// Niveaux & Passe de croisière : niveau courant (sans limite), barre d'XP animée (XP actuelle / nécessaire),
// prochaines récompenses de niveau (paliers, objectifs à long terme, prestige) ; passe gratuit de la saison avec
// palier actuel, progression, récompenses reçues / disponibles / à venir et réclamation (une seule fois, vérifiée
// par l'autorité). Aucun achat.
import { LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { PASS, passProgress, type PassReward } from '../authority/pass';
import { levelProgress, rewardFor, type LevelReward } from '../authority/progress';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

type Tab = 'levels' | 'pass';
let lastTab: Tab = 'pass';

const UNLOCK_KIND: Record<string, string> = { title: 'Titre', emote: 'Émote', hat: 'Couvre-chef', glasses: 'Lunettes', jewel: 'Bijou', outfit: 'Tenue', furn: 'Meuble', style: 'Style de cabine', badge: 'Badge', feature: 'Accès' };
const FEATURE: Record<string, string> = { 'feature:vip-lounge': 'Salon VIP du casino', 'feature:panorama': 'Pont Panorama' };

export function unlockLabel(u: string): string {
  if (FEATURE[u]) return FEATURE[u];
  const [k, v] = u.split(':');
  return `${UNLOCK_KIND[k] ?? k} « ${v} »`;
}
function levelRewardText(r: LevelReward): string {
  return [r.coins ? `${r.coins} KSCoins` : '', r.chips ? `${r.chips} jetons` : '', ...(r.unlocks ?? []).map(unlockLabel)].filter(Boolean).join(' · ') || 'XP de prestige';
}

/** Paliers du passe disponibles et pas encore réclamés. */
export function passClaimable(s: Services): number {
  const p = s.progress.pass;
  if (!p || p.season !== PASS.season) return 0;
  const tier = passProgress(p.xp).tier;
  let n = 0; for (let t = 1; t <= tier; t++) if (!p.claimed.includes(t)) n++;
  return n;
}

export class LevelsMenu extends Modal {
  private tab: Tab = lastTab;
  private vp: Viewport | null = null;
  private page = -1;
  private busy = false;
  private status = '';
  private shownXp: number;
  private flash: { tier: number; t: number } | null = null;

  constructor(s: Services) { super(s, 'Niveaux & Passe'); this.shownXp = Math.max(0, s.progress.xp - 120); }

  private relayout(): void { if (this.vp && !this.closed) this.layout(this.vp); }

  update(dt: number): void {
    super.update(dt);
    // Barre d'XP qui se remplit à l'ouverture
    this.shownXp += (this.s.progress.xp - this.shownXp) * Math.min(1, dt * 4);
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 1.2) this.flash = null; }
  }

  protected measure(vp: Viewport, maxW: number, maxH: number) { return { w: Math.min(maxW, 760 * vp.ui), h: Math.min(maxH, 560 * vp.ui) }; }

  private get pass() { const p = this.s.progress.pass; return p && p.season === PASS.season ? p : { season: PASS.season, xp: 0, claimed: [] as number[] }; }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, out: Button[] = [], bh = Math.max(42, 42 * ui);
    const tabs: Array<[Tab, string]> = [['pass', `Passe de croisière${passClaimable(this.s) ? ` · ${passClaimable(this.s)}` : ''}`], ['levels', `Niveau ${this.s.progress.level}`]];
    const tw = (C.w - gap) / 2;
    tabs.forEach(([id, label], i) => out.push(makeButton({ id: `lv-${id}`, label, style: 'secondary', active: this.tab === id, fontSize: 14, x: C.x + i * (tw + gap), y: C.y, w: tw, h: bh, onTap: () => { this.tab = lastTab = id; this.page = -1; this.relayout(); } })));
    if (this.tab === 'pass') {
      const pass = this.pass, prog = passProgress(pass.xp);
      const top = C.y + bh + 96 * ui, cw = Math.max(96 * ui, Math.min(128 * ui, (C.w - gap * 4) / 5)), ch = C.y + C.h - top - bh - 14 * ui;
      const per = Math.max(1, Math.floor((C.w + gap) / (cw + gap)));
      const pages = Math.ceil(PASS.tiers.length / per);
      if (this.page < 0) this.page = Math.min(pages - 1, Math.floor(Math.max(0, Math.min(prog.tier, ...this.firstUnclaimed())) / per));
      this.page = Math.max(0, Math.min(pages - 1, this.page));
      PASS.tiers.slice(this.page * per, this.page * per + per).forEach((r, i) => {
        const tier = this.page * per + i + 1;
        const claimed = pass.claimed.includes(tier), ready = tier <= prog.tier && !claimed;
        out.push(makeButton({ id: `tier-${tier}`, label: '', style: 'secondary', enabled: ready && !this.busy, x: C.x + i * (cw + gap), y: top, w: cw, h: ch,
          onTap: () => void this.claim(tier), draw: (ctx, b, u) => this.drawTier(ctx, b, u, tier, r, claimed, ready, tier <= prog.tier) }));
      });
      const by = C.y + C.h - bh;
      out.push(makeButton({ id: 'tier-prev', label: '‹', style: 'secondary', fontSize: 20, enabled: this.page > 0, x: C.x, y: by, w: 60 * ui, h: bh, onTap: () => { this.page--; this.relayout(); } }));
      out.push(makeButton({ id: 'tier-next', label: '›', style: 'secondary', fontSize: 20, enabled: this.page < pages - 1, x: C.x + C.w - 60 * ui, y: by, w: 60 * ui, h: bh, onTap: () => { this.page++; this.relayout(); } }));
      const n = passClaimable(this.s);
      if (n > 1) out.push(makeButton({ id: 'tier-all', label: this.busy ? 'Réception…' : `Tout réclamer (${n})`, style: 'gold', fontSize: 14, enabled: !this.busy, x: C.x + C.w / 2 - 110 * ui, y: by, w: 220 * ui, h: bh, onTap: () => void this.claimAll() }));
    }
    return out;
  }

  private firstUnclaimed(): number[] { const p = this.pass; for (let t = 1; t <= PASS.tiers.length; t++) if (!p.claimed.includes(t)) return [t - 1]; return [PASS.tiers.length - 1]; }

  private async claim(tier: number): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true; this.relayout();
    const r = await this.s.ask('purser', 'purser', 'pass-claim', { tier });
    this.busy = false;
    if (r.ok) { this.s.audio.jackpot(); this.s.haptic([30, 40, 30]); this.status = `Palier ${tier} : ${String(r.view.label)} reçu !`; this.flash = { tier, t: 0 }; }
    else { this.s.audio.error(); this.status = r.error; }
    this.relayout();
    return r.ok;
  }

  private async claimAll(): Promise<void> {
    const p = this.pass, tier = passProgress(p.xp).tier;
    for (let t = 1; t <= tier; t++) if (!this.pass.claimed.includes(t)) { if (!(await this.claim(t))) break; }
  }

  private drawTier(ctx: CanvasRenderingContext2D, b: Button, ui: number, tier: number, r: PassReward, claimed: boolean, ready: boolean, reached: boolean): void {
    ctx.save();
    const pulse = ready ? 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 6 + tier) : 0;
    roundRect(ctx, b.x, b.y, b.w, b.h, 14 * ui);
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, ready ? 'rgba(80,60,20,0.95)' : claimed ? 'rgba(20,48,40,0.92)' : reached ? 'rgba(30,40,60,0.92)' : 'rgba(16,20,32,0.92)'); g.addColorStop(1, 'rgba(8,10,18,0.95)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = ready ? LUXE.gold : claimed ? '#59e3a7' : 'rgba(239,220,174,0.25)'; ctx.lineWidth = ready ? 2 + pulse : 1.2;
    if (ready) { ctx.shadowColor = LUXE.gold; ctx.shadowBlur = 8 + pulse * 8; }
    ctx.stroke(); ctx.shadowBlur = 0;
    if (this.flash?.tier === tier) { ctx.globalAlpha = 1 - this.flash.t / 1.2; ctx.fillStyle = 'rgba(255,230,160,0.5)'; ctx.fill(); ctx.globalAlpha = 1; }
    const cx = b.x + b.w / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Disposition en bandes qui ne se chevauchent pas : titre, icône (taille selon la place), libellé, XP
    const titleY = b.y + 15 * ui, xpY = b.y + b.h - 13 * ui, lh = 14 * ui;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(12.5 * ui, 900); ctx.fillText(`Palier ${tier}`, cx, titleY, b.w - 10 * ui);
    ctx.font = font(11.5 * ui, 700);
    const words = r.label.split(' '); let line = ''; const lines: string[] = [];
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > b.w - 12 * ui && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    const shown = lines.slice(0, 2);
    const labelTop = xpY - 11 * ui - shown.length * lh;
    const room = labelTop - 4 * ui - (titleY + 10 * ui), s = Math.min(b.w * 0.24, room / 2);
    if (s >= 8 * ui) {
      const iy = titleY + 10 * ui + room / 2;
      ctx.fillStyle = r.coins ? '#e5b54a' : r.chips ? '#e2445c' : r.item ? '#1fc7c1' : '#b88cff';
      ctx.beginPath(); ctx.arc(cx, iy, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = font(s * 0.9, 900);
      ctx.fillText(r.coins ? 'KS' : r.chips ? '◆' : r.item ? '★' : r.unlock?.startsWith('emote') ? '☺' : r.unlock?.startsWith('title') ? '§' : '✦', cx, iy + 1);
    }
    ctx.fillStyle = PAL.text; ctx.font = font(11.5 * ui, 700);
    shown.forEach((l, i) => ctx.fillText(i === 1 && lines.length > 2 ? `${l}…` : l, cx, labelTop + lh * (i + 0.5), b.w - 10 * ui));
    ctx.font = font(11.5 * ui, 800);
    ctx.fillStyle = claimed ? '#59e3a7' : ready ? LUXE.gold : PAL.textDim;
    ctx.fillText(claimed ? 'Reçu ✓' : ready ? 'Réclamer' : `${tier * PASS.xpPerTier} XP`, cx, xpY, b.w - 10 * ui);
    ctx.restore();
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content, bh = Math.max(42, 42 * ui), p = this.s.progress;
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const y0 = C.y + bh + 14 * ui;
    if (this.tab === 'pass') {
      const pass = this.pass, prog = passProgress(pass.xp);
      ctx.fillStyle = LUXE.champagne; ctx.font = font(17 * ui, 900);
      ctx.fillText(`${PASS.name} · palier ${prog.tier} / ${PASS.tiers.length}`, C.x, y0 + 10 * ui, C.w);
      ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 600);
      ctx.fillText(prog.done ? 'Passe terminé : toutes les récompenses sont débloquées.' : `Prochain palier : ${prog.into} / ${prog.needed} XP de passe · gagnée en jouant, en explorant et avec les missions (gratuit)`, C.x, y0 + 32 * ui, C.w);
      this.bar(ctx, C.x, y0 + 50 * ui, C.w, 14 * ui, prog.done ? 1 : prog.into / prog.needed, '#1fc7c1');
    } else {
      const lp = levelProgress(Math.round(this.shownXp)), real = levelProgress(p.xp);
      ctx.fillStyle = LUXE.champagne; ctx.font = font(20 * ui, 900);
      ctx.fillText(`Niveau ${real.level}${p.title ? ` · « ${p.title} »` : ''}`, C.x, y0 + 10 * ui, C.w);
      ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 600);
      ctx.fillText(`${real.into.toLocaleString('fr-FR')} / ${real.needed.toLocaleString('fr-FR')} XP vers le niveau ${real.level + 1} · XP totale ${p.xp.toLocaleString('fr-FR')} · niveaux sans limite`, C.x, y0 + 34 * ui, C.w);
      this.bar(ctx, C.x, y0 + 50 * ui, C.w, 14 * ui, lp.level < real.level ? 1 : lp.ratio, LUXE.gold);
      ctx.fillStyle = PAL.text; ctx.font = font(14 * ui, 800);
      ctx.fillText('Prochaines récompenses', C.x, y0 + 88 * ui);
      const rowH = 24 * ui, rows = Math.floor((C.y + C.h - (y0 + 108 * ui)) / rowH);
      const milestones: number[] = [];
      for (let l = real.level + 1; milestones.length < rows && l < real.level + 400; l++) {
        const r = rewardFor(l);
        if (r.unlocks?.length || (r.coins ?? 0) >= 150 || l === real.level + 1) milestones.push(l);
      }
      milestones.forEach((l, i) => {
        const y = y0 + 110 * ui + i * rowH;
        ctx.fillStyle = l === real.level + 1 ? LUXE.gold : PAL.textDim; ctx.font = font(12.5 * ui, 800);
        ctx.fillText(`Niv. ${l}`, C.x, y);
        ctx.fillStyle = PAL.text; ctx.font = font(12.5 * ui, 600);
        ctx.fillText(levelRewardText(rewardFor(l)), C.x + 70 * ui, y, C.w - 70 * ui);
      });
    }
    if (this.status) { ctx.fillStyle = LUXE.champagne; ctx.font = font(12.5 * ui, 700); ctx.textAlign = 'center'; ctx.fillText(this.status, C.x + C.w / 2, C.y + C.h - bh - 8 * ui, C.w - 140 * ui); }
    ctx.restore();
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, color: string): void {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(10,8,12,0.8)'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    const fw = Math.max(h, (w - 2) * Math.max(0, Math.min(1, k)));
    roundRect(ctx, x + 1, y + 1, fw, h - 2, (h - 2) / 2);
    const g = ctx.createLinearGradient(x, 0, x + fw, 0); g.addColorStop(0, color); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    // Reflet qui glisse
    const sx = x + ((performance.now() / 1000) * 120) % (w + 80) - 40;
    ctx.save(); roundRect(ctx, x + 1, y + 1, fw, h - 2, (h - 2) / 2); ctx.clip();
    const sg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 30, y, 60, h); ctx.restore();
  }
}
