// Kit commun des jeux de casino (mise à jour KS Casino) : tables (tapis, rail de cuir, filet d'or),
// croupier 2D animé, vols de jetons et de cartes, et contrôle de mise partagé (jetons prédéfinis, montant
// libre, −/+, ×2, rejouer, total engagé). Les montants restent bornés par le solde et les plafonds de
// l'autorité ; aucune mise n'est prélevée ici : seule l'autorité débite et crédite.
import { CHIP_VALUES, chipBreakdown, drawChipStack, drawChipTop, goldGradient, LUXE } from '../art/brand';
import { drawLook, NPC_LOOKS, type Look } from '../art/characters';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { MAX_BET } from '../authority/types';
import { promptNumber } from '../ui/TextPrompt';
import { font, makeButton, type Button } from '../ui/UIKit';
import type { MiniGameHost } from './MiniGame';

export type Rect = { x: number; y: number; w: number; h: number };

// ---------------------------------------------------------------- tables
export type FeltColor = 'green' | 'bordeaux' | 'blue' | 'black';
const FELTS: Record<FeltColor, [string, string]> = {
  green: ['#167a55', '#073626'], bordeaux: ['#7a1f33', '#33090f'], blue: ['#1d4f8a', '#0a1f3c'], black: ['#2a242c', '#0b090d'],
};

/** Table de casino : rail de cuir rembourré, filet d'or, tapis avec lumière zénithale. */
export function drawTable(ctx: CanvasRenderingContext2D, r: Rect, ui: number, felt: FeltColor = 'green', shape: 'round' | 'rect' = 'round'): Rect {
  ctx.save();
  const rail = 14 * ui, rr = shape === 'round' ? Math.min(r.h * 0.5, 90 * ui) : 22 * ui;
  // Ombre portée
  roundRect(ctx, r.x, r.y + 6 * ui, r.w, r.h, rr); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  // Rail de cuir
  roundRect(ctx, r.x, r.y, r.w, r.h, rr);
  const lg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  lg.addColorStop(0, '#4a2c22'); lg.addColorStop(0.5, '#2a1712'); lg.addColorStop(1, '#170c09');
  ctx.fillStyle = lg; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  // Tapis
  const fr = { x: r.x + rail, y: r.y + rail, w: r.w - rail * 2, h: r.h - rail * 2 };
  roundRect(ctx, fr.x, fr.y, fr.w, fr.h, Math.max(4, rr - rail));
  const [c0, c1] = FELTS[felt];
  const fg = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h * 0.35, 10, fr.x + fr.w / 2, fr.y + fr.h * 0.5, Math.max(fr.w, fr.h) * 0.75);
  fg.addColorStop(0, c0); fg.addColorStop(1, c1);
  ctx.fillStyle = fg; ctx.fill();
  // Filet d'or
  ctx.strokeStyle = goldGradient(ctx, fr.x, fr.y, fr.x + fr.w, fr.y + fr.h); ctx.lineWidth = 2; ctx.stroke();
  roundRect(ctx, fr.x + 6 * ui, fr.y + 6 * ui, fr.w - 12 * ui, fr.h - 12 * ui, Math.max(3, rr - rail - 6 * ui));
  ctx.strokeStyle = 'rgba(239,220,174,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  return fr;
}

/** Texte imprimé sur le tapis (petites capitales dorées). */
export function feltText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, alpha = 0.7): void {
  ctx.save();
  ctx.font = font(px, 700); ctx.fillStyle = `rgba(239,220,174,${alpha})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${(px * 0.12).toFixed(1)}px`;
  ctx.fillText(text.toUpperCase(), x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  ctx.restore();
}

// ---------------------------------------------------------------- croupier
export type DealerMood = 'idle' | 'deal' | 'collect' | 'pay' | 'congrats' | 'sorry' | 'shuffle';

/**
 * Croupier en 2D (même dessin que l'équipage du navire, en grand) : distribue (geste du bras), ramasse les
 * jetons perdus, paie les gains, félicite (applaudit) ou console (salue), mélange. Il indique aussi d'où
 * partent les cartes et les jetons (sa main).
 */
export class Dealer {
  mood: DealerMood = 'idle';
  private moodT = 0;
  private t = Math.random() * 3;
  constructor(readonly name = 'Croupier', readonly look: Look = NPC_LOOKS.croupier) {}

  play(mood: DealerMood, dur = 0.6): void { this.mood = mood; this.moodT = dur; }

  update(dt: number): void {
    this.t += dt;
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = 'idle'; }
  }

  /** Position de la main (origine des cartes et des jetons), pour un croupier dessiné en (cx, baseY) à l'échelle k. */
  hand(cx: number, baseY: number, k: number): { x: number; y: number } { return { x: cx + 10 * k, y: baseY - 18 * k }; }

  render(ctx: CanvasRenderingContext2D, cx: number, baseY: number, k: number, ui: number): void {
    const anim = this.mood === 'congrats' ? 'clap' : this.mood === 'sorry' ? 'wave' : this.mood === 'idle' ? 'idle' : 'interact';
    const fps = anim === 'interact' ? 6 : anim === 'idle' ? 2.5 : 5;
    // Le bas du corps est caché par la table : on ne dessine que le buste
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 40 * k, baseY - 60 * k, 80 * k, 60 * k); ctx.clip();
    drawLook(ctx, this.look, anim, 'down', Math.floor(this.t * fps), cx, baseY + 14 * k, k);
    ctx.restore();
    // Plaque nominative
    ctx.save();
    ctx.font = font(10 * ui, 800);
    const w = ctx.measureText(this.name).width + 16 * ui;
    roundRect(ctx, cx - w / 2, baseY + 2 * ui, w, 16 * ui, 8 * ui);
    ctx.fillStyle = 'rgba(10,8,12,0.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = LUXE.champagne; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.name, cx, baseY + 10 * ui);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- vols de jetons
interface Flight { fx: number; fy: number; tx: number; ty: number; amount: number; t: number; dur: number; r: number; delay: number; done?: () => void }

/** Jetons qui volent (mise posée, gain payé, mise ramassée), en arc, avec ombre. */
export class ChipFlights {
  private list: Flight[] = [];
  get busy(): boolean { return this.list.length > 0; }
  add(from: { x: number; y: number }, to: { x: number; y: number }, amount: number, r: number, dur = 0.45, delay = 0, done?: () => void): void {
    if (amount <= 0) return;
    this.list.push({ fx: from.x, fy: from.y, tx: to.x, ty: to.y, amount, t: 0, dur, r, delay, done });
  }
  update(dt: number): void {
    for (const f of this.list) { if (f.delay > 0) f.delay -= dt; else f.t += dt; }
    for (const f of this.list) if (f.t >= f.dur) f.done?.();
    this.list = this.list.filter((f) => f.t < f.dur);
  }
  render(ctx: CanvasRenderingContext2D): void {
    for (const f of this.list) {
      if (f.delay > 0) continue;
      const k = Math.min(1, f.t / f.dur), e = 1 - (1 - k) * (1 - k);
      const x = f.fx + (f.tx - f.fx) * e, y = f.fy + (f.ty - f.fy) * e - Math.sin(k * Math.PI) * 40;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, f.fy + (f.ty - f.fy) * e + f.r * 0.6, f.r, f.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      const top = chipBreakdown(f.amount, 1)[0] ?? 1;
      drawChipTop(ctx, x, y, f.r, top);
    }
  }
}

// ---------------------------------------------------------------- cartes
/** Carte qui se retourne : flip ∈ [0, 1] (0 = dos, 1 = face), mise à l'échelle horizontale. */
export function flipScale(flip: number): { face: boolean; sx: number } {
  const k = Math.max(0, Math.min(1, flip));
  return { face: k >= 0.5, sx: Math.max(0.04, Math.abs(Math.cos(k * Math.PI))) };
}

// ---------------------------------------------------------------- contrôle de mise
const LADDER = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000];

export interface BetOptions {
  presets: number[];
  min?: number;
  max?: number;
  initial?: number;
  /** 'stake' : montant d'une mise unique ; 'chip' : valeur du jeton posé à chaque toucher (jeux à zones). */
  mode?: 'stake' | 'chip';
  /** ×2 en mode jetons : doubler toutes les mises posées (fourni par le jeu). */
  onDouble?: () => void;
}

/**
 * Contrôle de mise commun. Le montant est toujours borné : minimum de la table, maximum de la table,
 * solde disponible (moins ce qui est déjà engagé). Le jeu lit `amount` au moment de jouer.
 */
export class BetControl {
  amount: number;
  /** Mise de la manche précédente (« Rejouer »). */
  last: number | null = null;
  /** Total déjà engagé sur la table (jeux à zones) : affiché et déduit du maximum possible. */
  engaged = 0;
  locked = false;
  readonly min: number;
  readonly max: number;
  readonly chips: Button[];
  readonly minus: Button;
  readonly plus: Button;
  readonly double: Button;
  readonly custom: Button;
  private summary = { x: 0, y: 0, w: 0 };
  /** Jetons qui tiennent dans la largeur (calculé par layout). */
  private fits = new Set<Button>();
  private shown = true;
  private pulse = 0;

  constructor(private host: MiniGameHost, readonly opts: BetOptions) {
    this.min = opts.min ?? Math.min(...opts.presets);
    // Plafond : celui de la table quand il est donné (tables de blackjack jusqu'à 5 000), sinon le plafond général
    this.max = opts.max ?? MAX_BET;
    this.amount = opts.initial ?? opts.presets[0];
    this.chips = opts.presets.map((v) => {
      const b = makeButton({ id: `chip-${v}`, label: '', style: 'round', onTap: () => this.set(v) });
      b.icon = (ctx, cx, cy, s) => drawChipTop(ctx, cx, cy, s * 0.6, v, !!b.active);
      return b;
    });
    this.minus = makeButton({ id: 'bet-minus', label: '−', style: 'secondary', fontSize: 22, onTap: () => this.step(-1) });
    this.plus = makeButton({ id: 'bet-plus', label: '+', style: 'secondary', fontSize: 22, onTap: () => this.step(1) });
    this.double = makeButton({ id: 'bet-double', label: '×2', style: 'secondary', fontSize: 16, onTap: () => (opts.mode === 'chip' && opts.onDouble ? opts.onDouble() : this.set(this.amount * 2)) });
    this.custom = makeButton({ id: 'bet-custom', label: '✎', style: 'secondary', fontSize: 18, onTap: () => this.ask() });
  }

  get buttons(): Button[] { return [...this.chips, this.minus, this.plus, this.double, this.custom]; }

  /** Plus grand montant jouable maintenant. */
  get ceiling(): number { return Math.max(0, Math.min(this.max, this.host.s.chips.balance - this.engaged)); }

  set(v: number, sound = true): void {
    if (this.locked) return;
    const n = Math.max(this.min, Math.min(this.max, Math.floor(v)));
    if (n > this.ceiling && n > this.min) { this.host.toasts.show(`Maximum possible : ${this.ceiling} jetons`, 'info', 1.6); }
    this.amount = Math.max(this.min, Math.min(n, Math.max(this.min, this.ceiling)));
    this.pulse = 1;
    if (sound) this.host.s.audio.chip();
  }

  step(dir: 1 | -1): void {
    const i = LADDER.findIndex((x) => x >= this.amount);
    const cur = i < 0 ? LADDER.length - 1 : LADDER[i] === this.amount ? i : dir > 0 ? i - 1 : i;
    const next = LADDER[Math.max(0, Math.min(LADDER.length - 1, cur + dir))];
    this.set(next);
  }

  private ask(): void {
    if (this.locked) return;
    const top = Math.max(this.min, Math.min(this.max, this.ceiling));
    promptNumber(this.opts.mode === 'chip' ? 'Valeur du jeton' : 'Montant de la mise', this.amount, this.min, top, (v) => { if (v !== null) this.set(v); });
  }

  /** Affiche ou masque les réglages de mise (masqués pendant une main). */
  setShown(show: boolean): void {
    this.shown = show;
    for (const c of this.chips) c.visible = show && this.fits.has(c);
    for (const b of [this.minus, this.plus, this.double, this.custom]) b.visible = show;
  }

  /** Mémorise la mise jouée (pour « Rejouer »). */
  remember(v = this.amount): void { this.last = v; }

  /** À appeler à chaque image : états actif / désactivé. */
  sync(): void {
    const ceil = this.ceiling;
    for (const c of this.chips) {
      const v = Number(c.id.slice(5));
      c.active = v === this.amount; c.enabled = !this.locked && v <= Math.max(ceil, 0) && v >= this.min;
    }
    this.minus.enabled = !this.locked && this.amount > this.min;
    this.plus.enabled = !this.locked && this.amount < Math.min(this.max, ceil);
    this.double.enabled = !this.locked && (this.opts.mode === 'chip' ? this.engaged > 0 && this.engaged * 2 <= Math.min(this.host.s.chips.balance, 5000) : this.amount * 2 <= Math.min(this.max, ceil));
    this.custom.enabled = !this.locked && ceil >= this.min;
    this.pulse = Math.max(0, this.pulse - 0.05);
  }

  /**
   * Place jetons et réglages sur une ligne au bas de la zone, avec les boutons d'action du jeu à droite
   * (largeurs souhaitées en unités d'interface). Si la largeur manque : deux lignes (réglages au-dessus).
   * Renvoie la hauteur occupée (résumé de mise compris).
   */
  layout(a: Rect, ui: number, actions: Array<[Button, number]>): number {
    const cs = Math.max(44, 50 * ui), gap = 6 * ui, ag = 8 * ui, sum = 20 * ui, sq = Math.max(44, 44 * ui);
    const modW = 4 * sq + 3 * gap, chipsW = this.chips.length * (cs + gap) - gap;
    const want = actions.reduce((t, [, w]) => t + w * ui, 0) + ag * Math.max(0, actions.length - 1);
    const by = a.y + a.h - cs;
    if (chipsW + gap * 2 + modW + 14 * ui + want <= a.w) {
      this.chips.forEach((c, i) => Object.assign(c, { x: a.x + i * (cs + gap), y: by, w: cs, h: cs }));
      this.fits = new Set(this.chips); this.setShown(this.shown);
      let x = a.x + chipsW + gap * 2;
      for (const b of [this.minus, this.plus, this.double, this.custom]) { Object.assign(b, { x, y: by + (cs - sq) / 2, w: sq, h: sq }); x += sq + gap; }
      let rx = a.x + a.w;
      for (let i = actions.length - 1; i >= 0; i--) { const [b, w] = actions[i]; rx -= w * ui; Object.assign(b, { x: rx, y: by, w: w * ui, h: cs }); rx -= ag; }
      this.summary = { x: a.x, y: by - sum * 0.6, w: chipsW + gap * 2 + modW };
      return cs + sum;
    }
    // Deux lignes : réglages (jetons + boutons) au-dessus, actions en bas
    const k = Math.min(1, (a.w - ag * Math.max(0, actions.length - 1)) / Math.max(1, want - ag * Math.max(0, actions.length - 1)));
    const total = actions.reduce((t, [, w]) => t + w * ui * k, 0) + ag * Math.max(0, actions.length - 1);
    let x = a.x + (a.w - total) / 2;
    for (const [b, w] of actions) { Object.assign(b, { x, y: by, w: w * ui * k, h: cs }); x += w * ui * k + ag; }
    const rowY = by - cs - 8 * ui;
    const fit = Math.min(cs, (a.w - modW - gap * (this.chips.length + 1)) / this.chips.length);
    const c2 = Math.max(44, fit);
    const rowW = this.chips.length * (c2 + gap) + modW;
    let cx = a.x + Math.max(0, (a.w - rowW) / 2);
    // Si même en réduisant les jetons la ligne déborde, on n'affiche que les jetons qui tiennent
    this.fits = new Set();
    for (const c of this.chips) {
      const fitsRow = cx + c2 + gap + modW <= a.x + a.w + 0.5;
      if (fitsRow) { this.fits.add(c); Object.assign(c, { x: cx, y: rowY + (cs - c2) / 2, w: c2, h: c2 }); cx += c2 + gap; }
    }
    this.setShown(this.shown);
    for (const b of [this.minus, this.plus, this.double, this.custom]) { Object.assign(b, { x: cx, y: rowY + (cs - sq) / 2, w: sq, h: sq }); cx += sq + gap; }
    this.summary = { x: a.x + Math.max(0, (a.w - rowW) / 2), y: rowY - sum * 0.6, w: rowW };
    return cs * 2 + 8 * ui + sum;
  }

  /** Résumé : mise courante (pile de jetons) et total engagé. */
  render(ctx: CanvasRenderingContext2D, ui: number, extra = ''): void {
    const S = this.summary;
    ctx.save();
    const label = this.opts.mode === 'chip' ? `Jeton : ${this.amount}` : `Mise : ${this.amount}`;
    const txt = `${label}${this.engaged > 0 ? ` · Engagé : ${this.engaged}` : ''}${extra ? ` · ${extra}` : ''}`;
    ctx.font = font(12 * ui, 800);
    ctx.fillStyle = this.pulse > 0 ? LUXE.champagne : PAL.textDim; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    drawChipStack(ctx, S.x + 9 * ui, S.y + 5 * ui, 7 * ui, this.opts.mode === 'chip' ? this.amount : Math.max(this.amount, 1), 4);
    ctx.fillText(txt, S.x + 22 * ui, S.y, S.w - 22 * ui);
    ctx.restore();
  }
}

/** Valeurs de jetons proposées selon le minimum de la table. */
export function presetChips(min: number): number[] {
  const from = CHIP_VALUES.findIndex((v) => v >= min);
  return CHIP_VALUES.slice(Math.max(0, from), Math.max(0, from) + 4);
}
