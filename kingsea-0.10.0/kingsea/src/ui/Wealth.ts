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
/** Pièce ou jeton en vol vers le compteur (gain) : jaillit du point d'origine, puis file vers la pastille. */
interface Token { ox: number; oy: number; bx: number; by: number; t: number; delay: number; dur: number; arrived: boolean; spin: number }
interface Spark { x: number; y: number; vx: number; vy: number; t: number }
/** Paliers d'intensité selon le montant gagné : petit (rapide), moyen, gros, très gros. */
export function rewardTier(amount: number): 0 | 1 | 2 | 3 { return amount < 50 ? 0 : amount < 500 ? 1 : amount < 5000 ? 2 : 3; }
const TIER_TOKENS = [4, 9, 16, 26];

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
  /**
   * Point d'où partent les gains (écran) : le personnage dans le monde, le centre du jeu dans un mini-jeu.
   * Sans origine (menu), animation simple sur la pastille.
   */
  home: { x: number; y: number } | null = null;
  /** Effets réduits : moins de pièces en vol, pas d'éclat. */
  lowFx = false;
  /** Décalage vertical du bandeau (deux compteurs animés en même temps : KSCoins et jetons ne se chevauchent pas). */
  bannerShift = 0;
  /** Arrivée d'une pièce ou d'un jeton dans le compteur (son discret, vibration). */
  onArrive: ((index: number, total: number) => void) | null = null;
  private tokens: Token[] = [];
  private sparks: Spark[] = [];
  /** Vol en cours : le compteur avance au rythme des arrivées (de `from` à `to`, valeurs réelles de l'autorité). */
  private flight: { from: number; to: number; total: number; arrived: number; tier: number } | null = null;
  private banner: { text: string; sub: string; t: number; tier: number; x: number; y: number } | null = null;
  private flash = 0;
  private icon = { x: 0, y: 0 };

  /** Termine immédiatement le vol en cours (nouveau mouvement de solde). */
  private settleFlight(): void {
    if (!this.flight) return;
    this.shown = this.flight.to; this.flight = null; this.tokens = [];
  }

  /** Lance l'animation d'un gain réellement crédité (delta > 0). */
  private startFlight(from: number, to: number): void {
    const delta = to - from, tier = rewardTier(delta), h = this.home!;
    const n = this.lowFx ? Math.min(6, TIER_TOKENS[tier]) : TIER_TOKENS[tier];
    const stagger = Math.min(0.06, (tier >= 2 ? 0.9 : 0.5) / n);
    this.flight = { from, to, total: n, arrived: 0, tier };
    this.tokens = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * (30 + tier * 18);
      this.tokens.push({ ox: h.x, oy: h.y, bx: h.x + Math.cos(a) * r, by: h.y + Math.sin(a) * r * 0.7 - 10, t: 0, delay: i * stagger, dur: 0.55 + Math.random() * 0.2, arrived: false, spin: Math.random() * 6 });
    }
    if (tier >= 1) {
      const unit = this.currency === 'chips' ? 'jetons' : 'KSCoins';
      this.banner = { text: `${tier >= 3 ? 'GROS GAIN ! ' : ''}+${delta.toLocaleString('fr-FR')} ${unit}${this.currency === 'chips' ? ' crédités' : ''}`, sub: `Nouveau solde : ${to.toLocaleString('fr-FR')} ${unit}`, t: 0, tier, x: h.x, y: h.y };
    }
    this.flash = tier >= 2 && !this.lowFx ? 1 : 0;
  }

  sync(b: number): void { this.shown = b; this.target = b; this.synced = true; }

  update(dt: number, balance: number): void {
    if (!this.synced) this.sync(balance);
    if (!this.hold && balance !== this.target) {
      const delta = balance - this.target;
      this.settleFlight();
      const from = this.target;
      this.target = balance;
      // Gain avec une origine connue : les pièces volent vers le compteur, qui avance à chaque arrivée
      if (delta > 0 && this.home) {
        this.startFlight(from, balance);
        this.onDelta?.(delta);
        this.pulse = 0.4;
      } else {
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
    }
    // Vol des pièces / jetons : arrivées une à une, compteur proportionnel aux arrivées
    if (this.flight) {
      const f = this.flight;
      for (const tk of this.tokens) {
        if (tk.delay > 0) { tk.delay -= dt; continue; }
        tk.t += dt; tk.spin += dt * 10;
        if (!tk.arrived && tk.t >= tk.dur) {
          tk.arrived = true; f.arrived++;
          this.pulse = Math.min(1, this.pulse + 0.35); this.spin = 1;
          if (!this.lowFx) for (let k = 0; k < 4; k++) { const a = Math.random() * Math.PI * 2; this.sparks.push({ x: this.icon.x, y: this.icon.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, t: 0 }); }
          this.onArrive?.(f.arrived, f.total);
        }
      }
      this.tokens = this.tokens.filter((tk) => !tk.arrived);
      this.shown = f.from + Math.round(((f.to - f.from) * f.arrived) / f.total);
      if (f.arrived >= f.total) {
        this.shown = f.to; this.flight = null;
        this.floaters.push({ text: `+${(f.to - f.from).toLocaleString('fr-FR')}`, color: '#7dffb2', t: 0 });
        if (this.floaters.length > 3) this.floaters.shift();
      }
    } else if (this.shown !== this.target) {
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
    for (const sp of this.sparks) { sp.t += dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; }
    this.sparks = this.sparks.filter((sp) => sp.t < 0.4);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.6 + this.banner.tier * 0.4) this.banner = null; }
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  /** Gain en cours d'animation (les jeux peuvent attendre pour enchaîner). */
  get animating(): boolean { return !!this.flight; }

  /** Pièces en vol, éclats, bandeau du montant : dessinés par-dessus le jeu, sans capter les touchers. */
  private renderFlight(ctx: CanvasRenderingContext2D, h: number): void {
    const ix = this.icon.x, iy = this.icon.y, chips = this.currency === 'chips';
    // Éclat lumineux au point de départ (gros gains)
    if (this.flash > 0 && this.home) {
      const r = 60 + (1 - this.flash) * 120;
      const g = ctx.createRadialGradient(this.home.x, this.home.y, 0, this.home.x, this.home.y, r);
      g.addColorStop(0, `rgba(255,236,170,${0.45 * this.flash})`); g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g; ctx.fillRect(this.home.x - r, this.home.y - r, r * 2, r * 2);
    }
    for (const tk of this.tokens) {
      if (tk.delay > 0) continue;
      const k = Math.min(1, tk.t / tk.dur);
      // 0–0,25 : jaillissement autour de l'origine ; ensuite : courbe vers le compteur, en accélérant
      let x: number, y: number, sc = 1;
      if (k < 0.25) { const e = 1 - (1 - k / 0.25) ** 2; x = tk.ox + (tk.bx - tk.ox) * e; y = tk.oy + (tk.by - tk.oy) * e; sc = 0.6 + e * 0.6; }
      else {
        const u = (k - 0.25) / 0.75, e = u * u;
        const cx = (tk.bx + ix) / 2 + (tk.bx < ix ? -40 : 40), cy = Math.min(tk.by, iy) - 60;
        x = (1 - e) ** 2 * tk.bx + 2 * (1 - e) * e * cx + e * e * ix; y = (1 - e) ** 2 * tk.by + 2 * (1 - e) * e * cy + e * e * iy;
        sc = 1.2 - e * 0.5;
      }
      const r = h * 0.2 * sc;
      ctx.globalAlpha = 0.25; // traînée
      if (chips) drawChipTop(ctx, x, y + r * 0.6, r * 0.8, 100); else drawKSCoin(ctx, x, y + r * 0.6, r * 0.8, Math.cos(tk.spin));
      ctx.globalAlpha = 1;
      if (chips) drawChipTop(ctx, x, y, r, 100); else drawKSCoin(ctx, x, y, r, Math.cos(tk.spin));
    }
    for (const sp of this.sparks) {
      ctx.globalAlpha = 1 - sp.t / 0.4; ctx.fillStyle = chips ? '#bff7f3' : '#fff1c7';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Bandeau du montant gagné (gains moyens et plus) : apparaît en « pop », puis s'efface
    const b = this.banner;
    if (b) {
      const life = 1.6 + b.tier * 0.4, k = b.t / life;
      const pop = b.t < 0.18 ? 0.6 + (b.t / 0.18) * 0.5 : b.t < 0.3 ? 1.1 - ((b.t - 0.18) / 0.12) * 0.1 : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? Math.max(0, 1 - (k - 0.75) / 0.25) : 1;
      ctx.translate(b.x, b.y - h * 2.2 + this.bannerShift * h * 2.4 - b.t * 12); ctx.scale(pop, pop);
      const size = h * (0.55 + b.tier * 0.12);
      ctx.font = font(size, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(b.text).width + size * 1.4;
      roundRect(ctx, -tw / 2, -size * 0.85, tw, size * 1.7, size * 0.85);
      ctx.fillStyle = 'rgba(11,10,13,0.88)'; ctx.fill();
      ctx.strokeStyle = chips ? 'rgba(31,199,193,0.85)' : 'rgba(212,175,90,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = b.tier >= 2 ? goldGradient(ctx, 0, -size / 2, 0, size / 2) : LUXE.champagne;
      ctx.fillText(b.text, 0, 1);
      if (!this.flight) { ctx.font = font(size * 0.5, 700); ctx.fillStyle = PAL.text; ctx.fillText(b.sub, 0, size * 1.35); }
      ctx.restore();
    }
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
    this.icon = { x: cx, y: cy };
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
    // Gains en vol vers le compteur
    if (this.tokens.length || this.sparks.length || this.banner || this.flash > 0) this.renderFlight(ctx, h);
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
