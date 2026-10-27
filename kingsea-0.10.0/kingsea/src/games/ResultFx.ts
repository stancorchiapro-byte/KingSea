// Présentation commune des résultats des jeux du casino : bannière dont l'intensité suit le gain net
// (gain, beau gain, gros gain, jackpot), montant qui défile, pluie de jetons et éclats dorés, ou
// simple pastille pour une mise rendue / une perte. Purement visuel : les montants affichés sont ceux
// renvoyés par l'autorité au jeu. Ne capte aucun toucher (n'empêche jamais de rejouer).
import { drawChipTop, goldGradient, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { font } from '../ui/UIKit';
import type { Area } from './MiniGame';

/** Palier visuel d'un gain net en jetons (0 = petit gain … 3 = jackpot). */
export function winTier(net: number, stake: number): 0 | 1 | 2 | 3 {
  const k = stake > 0 ? net / stake : 0;
  if (net >= 2000 || k >= 50) return 3;
  if (net >= 500 || k >= 10) return 2;
  if (net >= 100 || k >= 3) return 1;
  return 0;
}

const TITLES = ['Gagné', 'Beau gain', 'Gros gain', 'Jackpot !'];
const CHIPS = [5, 25, 100, 500, 1000];
interface P { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; kind: 0 | 1; v: number; s: number }
const MAX_P = 90;

export class ResultFx {
  private t = 0;
  private dur = 0;
  private net = 0;
  private tier: 0 | 1 | 2 | 3 = 0;
  private sub = '';
  private kind: 'win' | 'push' | 'lose' | null = null;
  /** Particules réutilisées (aucune allocation pendant l'animation). */
  private parts: P[] = Array.from({ length: MAX_P }, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, life: 0, kind: 0, v: 5, s: 1 }));
  private emitLeft = 0;
  private emitAcc = 0;
  lowFx = false;
  /** Monnaie affichée (jetons au casino, KSCoins ailleurs). */
  unit = 'jetons';
  /** Hauteur relative de la bannière dans la zone de jeu (0 = haut, 1 = bas). */
  anchorY = 0.36;
  /** Position horizontale relative de la bannière (0,5 = centre). */
  anchorX = 0.5;

  get active(): boolean { return this.kind !== null; }

  /** net > 0 : gain ; net = 0 : mise rendue ; net < 0 : perte. sub : détail (ex. « 17 rouge »). */
  show(net: number, stake: number, sub = ''): number {
    this.net = net; this.sub = sub; this.t = 0;
    this.kind = net > 0 ? 'win' : net === 0 ? 'push' : 'lose';
    this.tier = net > 0 ? winTier(net, stake) : 0;
    this.dur = this.kind === 'win' ? 2.4 + this.tier * 0.5 : 1.7;
    this.emitLeft = this.kind === 'win' ? [10, 22, 40, 70][this.tier] * (this.lowFx ? 0.4 : 1) : 0;
    this.emitAcc = 0;
    for (const p of this.parts) p.life = 0;
    return this.tier;
  }

  clear(): void { this.kind = null; for (const p of this.parts) p.life = 0; }

  update(dt: number, a: Area): void {
    if (!this.kind) return;
    this.t += dt;
    // Émission étalée sur la première seconde
    if (this.emitLeft > 0) {
      this.emitAcc += dt * Math.max(20, this.emitLeft * 1.6);
      while (this.emitAcc >= 1 && this.emitLeft > 0) { this.emitAcc -= 1; this.emitLeft--; this.spawn(a); }
    }
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt; p.vy += (p.kind === 0 ? 900 : 120) * dt; p.vx *= 0.995;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      // Les jetons rebondissent une fois sur le bas de la zone
      if (p.kind === 0 && p.y > a.y + a.h - 10 && p.vy > 0) { p.y = a.y + a.h - 10; p.vy *= -0.35; p.vx *= 0.7; }
    }
    if (this.t >= this.dur && !this.parts.some((p) => p.life > 0)) this.kind = null;
  }

  private spawn(a: Area): void {
    const p = this.parts.find((q) => q.life <= 0); if (!p) return;
    const cx = a.x + a.w * this.anchorX, cy = a.y + a.h * this.anchorY;
    const chip = Math.random() < 0.7;
    p.kind = chip ? 0 : 1;
    p.x = cx + (Math.random() - 0.5) * Math.min(a.w * 0.5, 260);
    p.y = cy + (Math.random() - 0.5) * 20;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = chip ? 260 + Math.random() * 320 : 80 + Math.random() * 160;
    p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
    p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12;
    p.life = chip ? 1.6 + Math.random() * 0.8 : 0.9 + Math.random() * 0.6;
    p.v = CHIPS[Math.min(CHIPS.length - 1, Math.floor(Math.random() * (2 + this.tier)))];
    p.s = 0.8 + Math.random() * 0.5;
  }

  render(ctx: CanvasRenderingContext2D, a: Area, ui: number): void {
    if (!this.kind) return;
    const t = this.t, cy = a.y + a.h * this.anchorY;
    // Bannière entièrement visible même si l'ancre est près d'un bord
    const cx = Math.max(a.x + 130, Math.min(a.x + a.w - 130, a.x + a.w * this.anchorX));
    const fadeOut = Math.max(0, Math.min(1, (this.dur - t) / 0.4));
    ctx.save();
    if (this.kind === 'win') {
      // Halo derrière la bannière (plus large pour les gros gains)
      const glowR = Math.min(a.w, a.h) * (0.35 + this.tier * 0.1);
      const pulse = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.globalAlpha = fadeOut * Math.min(1, t * 4);
      const hg = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowR);
      hg.addColorStop(0, `rgba(255,214,120,${0.28 * pulse + this.tier * 0.06})`); hg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = hg; ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
      // Rayons tournants (gros gain et jackpot)
      if (this.tier >= 2 && !this.lowFx) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.6); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,220,140,0.07)';
        for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(glowR * 1.2, -glowR * 0.09); ctx.lineTo(glowR * 1.2, glowR * 0.09); ctx.fill(); }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // Particules (sous la bannière)
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.life * 2) * fadeOut + (1 - fadeOut) * Math.min(1, p.life * 2);
      if (p.kind === 0) {
        // Jeton qui tournoie : aplati selon sa rotation
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.rot)));
        drawChipTop(ctx, 0, 0, 9 * ui * p.s, p.v);
        ctx.restore();
      } else {
        ctx.fillStyle = '#fff3c4';
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const r = 4 * ui * p.s; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const an = (i * Math.PI) / 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); ctx.lineTo(Math.cos(an + Math.PI / 4) * r * 0.3, Math.sin(an + Math.PI / 4) * r * 0.3); }
        ctx.fill(); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // Bannière
    const appear = Math.min(1, t / 0.35);
    const back = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2); // easeOutBack
    const sc = this.kind === 'win' ? 0.55 + 0.45 * back(appear) : 0.9 + 0.1 * appear;
    ctx.globalAlpha = fadeOut * Math.min(1, t * 5);
    ctx.translate(cx, cy); ctx.scale(sc, sc);
    if (this.kind === 'win') {
      const shown = Math.round(this.net * Math.min(1, t / (0.5 + this.tier * 0.25)));
      const title = TITLES[this.tier], amount = `+${shown.toLocaleString('fr-FR')} ${this.unit}`;
      const big = (24 + this.tier * 5) * ui;
      ctx.font = font(big, 900); const aw = ctx.measureText(amount).width;
      ctx.font = font(13 * ui, 900); const tw = ctx.measureText(title.toUpperCase()).width;
      const w = Math.min(a.w - 24 * ui, Math.max(aw, tw) + 70 * ui), h = big + (this.sub ? 50 : 36) * ui;
      // Ruban : fond nuit, double filet d'or, coins biseautés
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 16 * ui; ctx.shadowOffsetY = 4 * ui;
      roundRect(ctx, -w / 2, -h / 2, w, h, 14 * ui);
      const bg = ctx.createLinearGradient(0, -h / 2, 0, h / 2); bg.addColorStop(0, '#1b2840'); bg.addColorStop(1, '#0a1020');
      ctx.fillStyle = bg; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = goldGradient(ctx, -w / 2, -h / 2, w / 2, h / 2); ctx.lineWidth = 2.4 * ui; ctx.stroke();
      roundRect(ctx, -w / 2 + 5 * ui, -h / 2 + 5 * ui, w - 10 * ui, h - 10 * ui, 10 * ui); ctx.strokeStyle = 'rgba(239,220,174,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      // Reflet qui balaie le ruban
      const sweep = ((t * 0.8) % 1.6) - 0.3;
      ctx.save(); roundRect(ctx, -w / 2, -h / 2, w, h, 14 * ui); ctx.clip();
      const sx = -w / 2 + sweep * w, sg = ctx.createLinearGradient(sx - 40 * ui, 0, sx + 40 * ui, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(13 * ui, 900); ctx.fillStyle = LUXE.champagne; ctx.fillText(title.toUpperCase(), 0, -h / 2 + 15 * ui);
      ctx.font = font(big, 900); ctx.fillStyle = goldGradient(ctx, 0, -big / 2, 0, big / 2);
      ctx.fillText(amount, 0, -h / 2 + 22 * ui + big / 2);
      if (this.sub) { ctx.font = font(12 * ui, 700); ctx.fillStyle = PAL.text; ctx.fillText(this.sub, 0, h / 2 - 13 * ui, w - 20 * ui); }
    } else {
      const text = this.kind === 'push' ? `Mise rendue${this.sub ? ` · ${this.sub}` : ''}` : `${this.sub ? `${this.sub} · ` : ''}−${(-this.net).toLocaleString('fr-FR')} ${this.unit}`;
      ctx.font = font(15 * ui, 800);
      const w = Math.min(a.w - 24 * ui, ctx.measureText(text).width + 34 * ui), h = 36 * ui;
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = this.kind === 'push' ? 'rgba(20,24,34,0.92)' : 'rgba(40,10,16,0.9)'; ctx.fill();
      ctx.strokeStyle = this.kind === 'push' ? 'rgba(239,220,174,0.5)' : 'rgba(255,107,107,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = this.kind === 'push' ? PAL.text : '#ffb3b3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 1, w - 16 * ui);
    }
    ctx.restore();
  }
}
