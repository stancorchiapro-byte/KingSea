// Affichages de richesse et de progression, partagés par toutes les scènes : solde de KSCoins animé
// (compteur qui défile, « +N » / « −N », pièces qui jaillissent ou tombent), badge de niveau, barre d'XP,
// annonce de montée de niveau avec ses récompenses.
import { LUXE, drawChipTop, drawKSCoin, drawKSEmblem, goldGradient } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { FURNITURE_BY_ID } from '../data/furniture';
import { levelProgress, rewardFor } from '../authority/progress';
import { font } from './UIKit';

interface Floater { text: string; color: string; t: number }
interface CoinFx { x: number; y: number; vx: number; vy: number; t: number; spin: number; gain: boolean }

/** Solde de KSCoins animé (pastille noire, pièce, montant). */
export class BalanceDisplay {
  /** Monnaie affichée : KSCoins (pièce KS) ou jetons de casino (jeton). */
  constructor(public currency: 'coins' | 'chips' = 'coins') {}
  shown = 0;
  private target = 0;
  private pulse = 0;
  private floaters: Floater[] = [];
  private coins: CoinFx[] = [];
  private spin = 0;
  private synced = false;
  /** Appelé à chaque variation (son, vibration). */
  onDelta: ((delta: number) => void) | null = null;
  /** Retient l'affichage d'un gain (ex. pendant qu'une roue tourne) : le compteur attend. */
  hold = false;

  sync(b: number): void { this.shown = b; this.target = b; this.synced = true; }

  update(dt: number, balance: number): void {
    if (!this.synced) this.sync(balance);
    if (!this.hold && balance !== this.target) {
      const delta = balance - this.target;
      this.target = balance;
      this.pulse = 1; this.spin = 1;
      this.floaters.push({ text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, color: delta > 0 ? '#7dffb2' : '#ff9b9b', t: 0 });
      if (this.floaters.length > 3) this.floaters.shift();
      const n = Math.min(10, 3 + Math.floor(Math.log10(Math.abs(delta) + 1) * 3));
      for (let i = 0; i < n; i++) {
        const a = delta > 0 ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const sp = 60 + Math.random() * 90;
        this.coins.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, spin: Math.random() * 6, gain: delta > 0 });
      }
      this.onDelta?.(delta);
    }
    if (this.shown !== this.target) {
      const diff = this.target - this.shown;
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * dt * 6));
      this.shown = Math.abs(step) >= Math.abs(diff) ? this.target : this.shown + step;
    }
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.spin = Math.max(0, this.spin - dt * 1.6);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.4);
    for (const c of this.coins) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += (c.gain ? 140 : 260) * dt; c.spin += dt * 9; }
    this.coins = this.coins.filter((c) => c.t < 0.9);
  }

  /** Dessine la pastille ; renvoie sa largeur. */
  render(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, ui: number): number {
    ctx.save();
    ctx.font = font(h * 0.45, 800);
    const txt = this.shown.toLocaleString('fr-FR');
    const w = ctx.measureText(txt).width + h * 1.45;
    roundRect(ctx, x, y, w, h, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(34,27,36,0.92)'); g.addColorStop(1, 'rgba(10,8,12,0.92)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = this.pulse > 0 ? `rgba(239,220,174,${0.5 + this.pulse * 0.5})` : 'rgba(212,175,90,0.6)';
    ctx.lineWidth = 1.3 + this.pulse * 1.8; ctx.stroke();
    const cx = x + h / 2 + 2 * ui, cy = y + h / 2;
    if (this.currency === 'chips') drawChipTop(ctx, cx, cy, h * 0.36 * (1 + this.pulse * 0.15), 100);
    else drawKSCoin(ctx, cx, cy, h * 0.36 * (1 + this.pulse * 0.15), this.spin > 0 ? Math.cos(this.spin * Math.PI * 4) : 1);
    ctx.fillStyle = PAL.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + h + 2 * ui, cy + 1);
    // Pièces qui jaillissent (gain) ou tombent (dépense)
    for (const c of this.coins) {
      ctx.globalAlpha = Math.max(0, 1 - c.t / 0.9);
      if (this.currency === 'chips') drawChipTop(ctx, cx + c.x, cy + c.y, h * 0.16, 100); else drawKSCoin(ctx, cx + c.x, cy + c.y, h * 0.16, Math.cos(c.spin));
    }
    ctx.globalAlpha = 1;
    // Montants flottants
    for (const f of this.floaters) {
      const k = f.t / 1.4;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.font = font(h * 0.42, 900); ctx.fillStyle = f.color; ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
      ctx.fillText(f.text, x + w + 6 * ui, cy - k * h * 0.9);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    return w;
  }
}

/** Badge de niveau : losange or avec le numéro. */
export function drawLevelBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, level: number): void {
  ctx.save();
  const r = size / 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
  ctx.fillStyle = goldGradient(ctx, cx - r, cy - r, cx + r, cy + r); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.78); ctx.lineTo(cx + r * 0.78, cy); ctx.lineTo(cx, cy + r * 0.78); ctx.lineTo(cx - r * 0.78, cy); ctx.closePath();
  ctx.fillStyle = LUXE.lacquer; ctx.fill();
  ctx.fillStyle = LUXE.champagne; ctx.font = font(size * (level >= 10 ? 0.36 : 0.44), 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(level), cx, cy + size * 0.02);
  ctx.restore();
}

/** Barre d'XP fine (or champagne sur noir). */
export function drawXpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, glow = 0): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,90,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  const fw = Math.max(h, w * Math.max(0, Math.min(1, ratio)));
  roundRect(ctx, x, y, fw, h, h / 2); ctx.fillStyle = goldGradient(ctx, x, y, x, y + h); ctx.fill();
  if (glow > 0) { ctx.shadowColor = `rgba(239,220,174,${glow})`; ctx.shadowBlur = 10; ctx.fill(); }
  ctx.restore();
}

/** Bloc « niveau + barre d'XP + gains d'XP flottants », pour le HUD et les mini-jeux. */
export class LevelDisplay {
  private floaters: Floater[] = [];
  private glow = 0;
  shownXp = -1;

  gain(xp: number): void {
    if (xp <= 0) return;
    this.floaters.push({ text: `+${xp} XP`, color: LUXE.champagne, t: 0 });
    if (this.floaters.length > 3) this.floaters.shift();
    this.glow = 1;
  }

  update(dt: number, xp: number): void {
    if (this.shownXp < 0 || xp < this.shownXp) this.shownXp = xp;
    if (this.shownXp < xp) this.shownXp = Math.min(xp, this.shownXp + Math.max(1, (xp - this.shownXp) * dt * 4));
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.6);
    this.glow = Math.max(0, this.glow - dt * 1.2);
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ui: number): void {
    const p = levelProgress(Math.floor(this.shownXp));
    const s = 26 * ui;
    drawLevelBadge(ctx, x + s / 2, y + s / 2, s, p.level);
    drawXpBar(ctx, x + s + 6 * ui, y + s / 2 - 4 * ui, w - s - 6 * ui, 8 * ui, p.ratio, this.glow);
    ctx.save();
    for (const f of this.floaters) {
      const k = f.t / 1.6;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.font = font(12 * ui, 900); ctx.fillStyle = f.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
      ctx.fillText(f.text, x + s + 8 * ui, y + s + 8 * ui + k * 14 * ui);
    }
    ctx.restore();
  }
}

/** Libellé lisible d'un déblocage. */
export function unlockLabel(key: string): string {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  switch (kind) {
    case 'furn': return `Meuble : ${FURNITURE_BY_ID.get(id)?.name ?? id}`;
    case 'title': return `Titre : « ${id} »`;
    case 'badge': return `Badge ${id}`;
    case 'hat': return id === 'hautdeforme' ? 'Chapeau : haut-de-forme' : `Chapeau : ${id}`;
    case 'outfit': return id === 'smoking' ? 'Tenue : smoking' : `Tenue : ${id}`;
    case 'feature': return id === 'vip-lounge' ? 'Accès au salon VIP du rooftop' : id;
    case 'style': return `Style de cabine : ${id}`;
    default: return key;
  }
}

/** Annonce plein écran (non bloquante) d'une montée de niveau. */
export class LevelUpOverlay {
  private queue: number[] = [];
  private cur: { level: number; t: number; lines: string[] } | null = null;
  private sparks: Array<{ x: number; y: number; vx: number; vy: number; t: number; c: string }> = [];
  onShow: ((level: number) => void) | null = null;

  show(levels: number[]): void { this.queue.push(...levels); }
  get active(): boolean { return !!this.cur; }
  /** Ferme l'annonce en cours et vide la file (captures, changement de scène). */
  clear(): void { this.queue = []; this.cur = null; this.sparks = []; }

  update(dt: number, w: number, h: number): void {
    if (!this.cur && this.queue.length) {
      const level = this.queue.shift()!;
      const r = rewardFor(level);
      const lines = [...(r.coins ? [`+${r.coins} KSCoins`] : []), ...(r.unlocks ?? []).map(unlockLabel)];
      this.cur = { level, t: 0, lines };
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260;
        this.sparks.push({ x: w / 2, y: h * 0.42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, t: 0, c: [LUXE.gold, LUXE.champagne, '#ffffff', LUXE.bordeaux][i % 4] });
      }
      this.onShow?.(level);
    }
    if (this.cur) { this.cur.t += dt; if (this.cur.t > 3.4) this.cur = null; }
    for (const s of this.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 220 * dt; s.vx *= 0.99; }
    this.sparks = this.sparks.filter((s) => s.t < 1.8);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, ui: number): void {
    const c = this.cur;
    if (!c && !this.sparks.length) return;
    ctx.save();
    if (c) {
      const a = Math.min(1, c.t * 4, (3.4 - c.t) * 3);
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = a;
      const cy = h * 0.42, k = 1 + Math.max(0, 0.25 - c.t) * 2;
      drawKSEmblem(ctx, w / 2, cy - 64 * ui, 64 * ui * k, c.t, 'small');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(14 * ui, 800); ctx.fillStyle = LUXE.champagne;
      ctx.fillText('NIVEAU SUPÉRIEUR', w / 2, cy - 14 * ui);
      ctx.font = font(44 * ui, 900); ctx.fillStyle = goldGradient(ctx, 0, cy, 0, cy + 50 * ui);
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
      ctx.fillText(`Niveau ${c.level}`, w / 2, cy + 26 * ui);
      ctx.shadowBlur = 0;
      ctx.font = font(15 * ui, 700); ctx.fillStyle = PAL.text;
      c.lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, w / 2, cy + 66 * ui + i * 22 * ui, w - 40));
    }
    for (const s of this.sparks) { ctx.globalAlpha = Math.max(0, 1 - s.t / 1.8); ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y, 4 * ui, 4 * ui); }
    ctx.restore();
  }
}
