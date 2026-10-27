// Mini-boîte à outils d'interface tactile dessinée sur canvas.
// Règles : zones de toucher ≥ 44 px CSS, marge de tolérance autour des boutons, retour visuel à l'appui,
// action déclenchée au relâchement (on peut annuler en glissant hors du bouton).
import { drawKSCoin, goldGradient } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';

export const FONT = '"Avenir Next", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif';
/** Taille minimale de texte (px CSS) : sous ce seuil, un texte devient difficile à lire sur un petit téléphone. */
export const MIN_TEXT = 11;
/**
 * Police d'interface. Les tailles suivent la hiérarchie de chaque écran (titres, textes, légendes) et l'échelle
 * de l'écran ; elles ne descendent jamais sous MIN_TEXT, et gardent le demi-pixel (pas d'arrondi au pixel entier,
 * qui écrasait les petites tailles).
 */
export const font = (px: number, weight = 700) => `${weight} ${Math.max(MIN_TEXT, Math.round(px * 2) / 2)}px ${FONT}`;
export const MIN_TOUCH = 44;

export type BtnStyle = 'primary' | 'secondary' | 'ghost' | 'round' | 'disabled' | 'danger' | 'gold';

export interface Button {
  id: string;
  x: number; y: number; w: number; h: number;
  label: string;
  sub?: string;
  icon?: (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => void;
  style: BtnStyle;
  enabled: boolean;
  visible: boolean;
  onTap: () => void;
  pressed?: boolean;
  /** Mise en valeur (élément sélectionné). */
  active?: boolean;
  fontSize?: number;
  /** Dessin personnalisé (cartes d'objets…) à la place du dessin standard ; l'état enfoncé reste géré. */
  draw?: (ctx: CanvasRenderingContext2D, b: Button, ui: number) => void;
}

export function makeButton(partial: Partial<Button> & Pick<Button, 'id' | 'onTap'>): Button {
  return { x: 0, y: 0, w: 120, h: 48, label: '', style: 'primary', enabled: true, visible: true, ...partial };
}

export class ButtonLayer implements PointerHandler {
  buttons: Button[] = [];
  /** Appui ailleurs que sur un bouton (ex. fermer un menu en touchant le fond). */
  onBackgroundTap: ((p: PointerInfo) => void) | null = null;
  /** Si vrai, capture tous les pointeurs (modale) même hors bouton. */
  modal = false;
  onTapSound: (() => void) | null = null;
  private owner = new Map<number, Button | null>();

  constructor(private margin = 6) {}

  hit(x: number, y: number): Button | null {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (!b.visible) continue;
      const m = this.margin;
      if (x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m) return b;
    }
    return null;
  }

  onDown(p: PointerInfo): boolean {
    const b = this.hit(p.x, p.y);
    if (b) { this.owner.set(p.id, b); b.pressed = b.enabled; return true; }
    if (this.modal) { this.owner.set(p.id, null); return true; }
    return false;
  }

  onMove(p: PointerInfo): void {
    const b = this.owner.get(p.id);
    if (b) b.pressed = b.enabled && this.hit(p.x, p.y) === b;
  }

  onUp(p: PointerInfo, cancelled: boolean): void {
    const b = this.owner.get(p.id);
    this.owner.delete(p.id);
    if (b === undefined) return;
    if (b === null) {
      const moved = Math.hypot(p.x - p.startX, p.y - p.startY);
      if (!cancelled && moved < 14) this.onBackgroundTap?.(p);
      return;
    }
    const inside = this.hit(p.x, p.y) === b;
    b.pressed = false;
    if (!cancelled && inside && b.enabled && b.visible) { this.onTapSound?.(); b.onTap(); }
  }

  render(ctx: CanvasRenderingContext2D, ui: number): void {
    for (const b of this.buttons) if (b.visible) drawButton(ctx, b, ui);
  }
}

export function drawButton(ctx: CanvasRenderingContext2D, b: Button, ui: number): void {
  if (b.draw) { ctx.save(); b.draw(ctx, b, ui); ctx.restore(); return; }
  const pressed = !!b.pressed;
  const style: BtnStyle = b.enabled ? b.style : 'disabled';
  ctx.save();
  const y = b.y + (pressed ? 2 : 0);
  if (b.style === 'round') {
    if (!b.enabled) ctx.globalAlpha *= 0.45;
    const r0 = Math.min(b.w, b.h) / 2, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const r = r0 * (pressed ? 0.93 : 1);   // léger enfoncement au toucher
    // Ombre portée et halo doré quand le bouton est actif
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.arc(cx, cy + 2, r, 0, Math.PI * 2); ctx.fill();
    if (b.active || pressed) {
      const hg = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.35);
      hg.addColorStop(0, 'rgba(240,210,130,0.28)'); hg.addColorStop(1, 'rgba(240,210,130,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, pressed ? 'rgba(30,58,86,0.97)' : 'rgba(22,40,62,0.9)'); g.addColorStop(1, pressed ? 'rgba(10,22,38,0.97)' : 'rgba(6,14,26,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Reflet nacré en haut
    const sh = ctx.createLinearGradient(0, cy - r, 0, cy);
    sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.45, r * 0.72, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = b.active || pressed ? goldGradient(ctx, cx - r, cy - r, cx + r, cy + r) : 'rgba(212,175,90,0.6)'; ctx.lineWidth = b.active ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (b.icon) b.icon(ctx, cx, cy - (b.label ? r * 0.12 : 0), r * 0.9);
    if (b.label) {
      ctx.fillStyle = PAL.text; ctx.font = font((b.fontSize ?? 11) * ui, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, cx, cy + (b.icon ? r * 0.52 : 0));
    }
    ctx.restore();
    return;
  }
  const r = Math.min(12 * ui, b.h / 2);
  // Ombre portée discrète (relief)
  if (style !== 'disabled' && style !== 'ghost' && !pressed) {
    ctx.save(); roundRect(ctx, b.x, y + 2, b.w, b.h, r); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.restore();
  }
  roundRect(ctx, b.x, y, b.w, b.h, r);
  let fill: string | CanvasGradient, stroke: string | CanvasGradient | null = null, text: string = PAL.text;
  switch (style) {
    case 'primary': {
      // Vert tapis de casino, filet doré
      const g = ctx.createLinearGradient(0, y, 0, y + b.h);
      g.addColorStop(0, pressed ? '#0b4a33' : '#167a55'); g.addColorStop(1, pressed ? '#062b1e' : '#0b4a33');
      fill = g; stroke = 'rgba(212,175,90,0.75)'; text = PAL.ivory; break;
    }
    case 'gold': {
      fill = pressed ? (() => { const g = ctx.createLinearGradient(0, y, 0, y + b.h); g.addColorStop(0, '#b8923f'); g.addColorStop(1, '#7a5c22'); return g; })() : goldGradient(ctx, 0, y, 0, y + b.h);
      stroke = 'rgba(255,248,225,0.55)'; text = '#1a1208'; break;
    }
    case 'secondary': {
      const g = ctx.createLinearGradient(0, y, 0, y + b.h);
      g.addColorStop(0, pressed ? 'rgba(52,42,54,0.96)' : 'rgba(36,29,38,0.94)'); g.addColorStop(1, pressed ? 'rgba(26,20,28,0.96)' : 'rgba(16,12,18,0.94)');
      fill = g; stroke = b.active ? goldGradient(ctx, b.x, y, b.x + b.w, y + b.h) : 'rgba(212,175,90,0.4)'; break;
    }
    case 'ghost': fill = pressed ? 'rgba(239,220,174,0.14)' : 'rgba(239,220,174,0.05)'; stroke = 'rgba(239,220,174,0.25)'; break;
    case 'danger': {
      const g = ctx.createLinearGradient(0, y, 0, y + b.h);
      g.addColorStop(0, pressed ? '#5a1222' : '#8e2236'); g.addColorStop(1, pressed ? '#3a0c17' : '#5c1424');
      fill = g; stroke = 'rgba(239,220,174,0.45)'; break;
    }
    default: fill = 'rgba(40,34,42,0.6)'; stroke = 'rgba(255,255,255,0.06)'; text = 'rgba(203,191,168,0.45)';
  }
  ctx.fillStyle = fill; ctx.fill();
  // Reflet supérieur (laque / métal)
  if (style !== 'disabled' && style !== 'ghost') {
    ctx.save(); ctx.clip();
    const hl = ctx.createLinearGradient(0, y, 0, y + b.h * 0.5);
    hl.addColorStop(0, 'rgba(255,255,255,0.12)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(b.x, y, b.w, b.h * 0.5);
    ctx.restore();
  }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = b.active ? 2.2 : 1.1; ctx.stroke(); }
  const fs = (b.fontSize ?? 16) * ui;
  ctx.fillStyle = text; ctx.textBaseline = 'middle';
  let tx = b.x + b.w / 2;
  ctx.textAlign = 'center';
  if (b.icon) {
    const isz = Math.min(b.h * 0.5, 22 * ui);
    if (b.sub || b.w > b.h * 2.6) {
      b.icon(ctx, b.x + 14 * ui + isz / 2, y + b.h / 2, isz);
      ctx.textAlign = 'left'; tx = b.x + 24 * ui + isz;
    } else { b.icon(ctx, b.x + b.w / 2, y + b.h / 2 - (b.label ? fs * 0.5 : 0), isz); }
  }
  if (b.sub) {
    if (!b.icon) { ctx.textAlign = 'left'; tx = b.x + 16 * ui; }
    const mw = b.w - (tx - b.x) - 10 * ui;
    fitFont(ctx, b.label, fs, 800, mw); ctx.fillText(b.label, tx, y + b.h / 2 - fs * 0.45, mw);
    fitFont(ctx, b.sub, fs * 0.72, 600, mw); ctx.fillStyle = style === 'disabled' ? 'rgba(200,215,230,0.45)' : style === 'gold' ? 'rgba(14,11,16,0.75)' : PAL.textDim;
    ctx.fillText(b.sub, tx, y + b.h / 2 + fs * 0.62, mw);
  } else if (b.label) {
    const mw = b.w - 12, ly = b.icon && !(b.w > b.h * 2.6) ? y + b.h / 2 + fs * 0.6 : y + b.h / 2;
    const size = fitFont(ctx, b.label, fs, 800, mw);
    // Trop long même réduit : deux lignes si le bouton est assez haut, plutôt qu'un texte écrasé
    const lines = ctx.measureText(b.label).width > mw && !b.icon && b.h >= size * 2.5 ? wrapText(ctx, b.label, mw).slice(0, 2) : [b.label];
    lines.forEach((l, i) => ctx.fillText(l, tx, ly + (i - (lines.length - 1) / 2) * size * 1.15, mw));
  }
  ctx.restore();
}

/** Panneau de fond : laque noire, double filet or champagne, ornements d'angle art déco. */
export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ui: number): void {
  ctx.save();
  const rr = 16 * ui;
  roundRect(ctx, x, y, w, h, rr);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(34,27,36,0.98)'); g.addColorStop(0.5, 'rgba(20,16,22,0.98)'); g.addColorStop(1, 'rgba(11,9,13,0.98)');
  ctx.fillStyle = g; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 6; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = goldGradient(ctx, x, y, x + w, y + h); ctx.lineWidth = 1.6; ctx.stroke();
  roundRect(ctx, x + 4 * ui, y + 4 * ui, w - 8 * ui, h - 8 * ui, Math.max(2, rr - 4 * ui));
  ctx.strokeStyle = 'rgba(212,175,90,0.22)'; ctx.lineWidth = 1; ctx.stroke();
  // Ornements d'angle : petits losanges dorés
  ctx.fillStyle = 'rgba(212,175,90,0.85)';
  for (const [cx, cy] of [[x + 12 * ui, y + 12 * ui], [x + w - 12 * ui, y + 12 * ui], [x + 12 * ui, y + h - 12 * ui], [x + w - 12 * ui, y + h - 12 * ui]]) {
    const d = 3 * ui; ctx.beginPath(); ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/**
 * Choisit la plus grande taille (≤ px, ≥ MIN_TEXT) pour laquelle le texte tient dans maxW, et l'applique.
 * Évite les libellés écrasés par la largeur maximale de fillText. Renvoie la taille retenue.
 */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, px: number, weight: number, maxW: number): number {
  let size = Math.max(MIN_TEXT, px);
  ctx.font = font(size, weight);
  const w = ctx.measureText(text).width;
  if (w > maxW && size > MIN_TEXT) { size = Math.max(MIN_TEXT, size * (maxW / w)); ctx.font = font(size, weight); }
  return size;
}

/** Coupe un texte en lignes selon une largeur maximale. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

// ---------- Icônes vectorielles (aucune image à charger) ----------
export const Icons = {
  /** Sac (inventaire). */
  bag(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.strokeStyle = PAL.text; ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.lineJoin = 'round';
    roundRect(ctx, cx - s * 0.34, cy - s * 0.18, s * 0.68, s * 0.56, s * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.18, s * 0.17, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = PAL.gold; ctx.fillRect(cx - s * 0.08, cy + s * 0.02, s * 0.16, s * 0.1);
    ctx.restore();
  },
  /** Pièce KSCoin (monnaie du jeu). */
  coin(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) { drawKSCoin(ctx, cx, cy, s * 0.46); },
  elevator(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.strokeStyle = PAL.text; ctx.fillStyle = PAL.text; ctx.lineWidth = Math.max(1.5, s * 0.08);
    roundRect(ctx, cx - s * 0.32, cy - s * 0.42, s * 0.64, s * 0.84, s * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.3); ctx.lineTo(cx + s * 0.14, cy - s * 0.1); ctx.lineTo(cx - s * 0.14, cy - s * 0.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.3); ctx.lineTo(cx + s * 0.14, cy + s * 0.1); ctx.lineTo(cx - s * 0.14, cy + s * 0.1); ctx.fill();
    ctx.restore();
  },
  gear(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = PAL.text;
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-s * 0.07, -s * 0.42, s * 0.14, s * 0.2); }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.deepNavy; ctx.beginPath(); ctx.arc(0, 0, s * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  hand(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.font = font(s * 0.8, 400); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('👋', cx, cy + s * 0.04); ctx.restore();
  },
  close(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.strokeStyle = PAL.text; ctx.lineWidth = Math.max(2, s * 0.12); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.25, cy - s * 0.25); ctx.lineTo(cx + s * 0.25, cy + s * 0.25); ctx.moveTo(cx + s * 0.25, cy - s * 0.25); ctx.lineTo(cx - s * 0.25, cy + s * 0.25); ctx.stroke(); ctx.restore();
  },
  interact(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text; ctx.beginPath();
    ctx.arc(cx, cy - s * 0.12, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.text; ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.12, s * 0.26, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
    ctx.restore();
  },
  chat(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text;
    roundRect(ctx, cx - s * 0.36, cy - s * 0.3, s * 0.72, s * 0.48, s * 0.12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.18, cy + s * 0.16); ctx.lineTo(cx - s * 0.26, cy + s * 0.36); ctx.lineTo(cx, cy + s * 0.16); ctx.fill();
    ctx.fillStyle = PAL.navy; for (const dx of [-0.17, 0, 0.17]) { ctx.beginPath(); ctx.arc(cx + dx * s, cy - s * 0.06, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },
  people(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text;
    for (const [dx, k] of [[-0.18, 0.8], [0.14, 1]] as const) {
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.arc(cx + dx * s, cy - s * 0.14, s * 0.12 * k, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + s * 0.2, s * 0.2 * k, s * 0.16 * k, 0, Math.PI, 0); ctx.fill();
    }
    ctx.restore();
  },
  /** Parchemin coché (missions). */
  missions(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.strokeStyle = PAL.text; ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    roundRect(ctx, cx - s * 0.28, cy - s * 0.36, s * 0.56, s * 0.72, s * 0.08); ctx.stroke();
    for (const k of [-0.16, 0.02, 0.2]) { ctx.beginPath(); ctx.moveTo(cx - s * 0.16, cy + k * s); ctx.lineTo(cx - s * 0.1, cy + (k + 0.05) * s); ctx.lineTo(cx - s * 0.02, cy + (k - 0.05) * s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + s * 0.04, cy + k * s); ctx.lineTo(cx + s * 0.18, cy + k * s); ctx.stroke(); }
    ctx.restore();
  },
  /** Deux personnes et un cœur (amis). */
  friends(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    Icons.people(ctx, cx - s * 0.06, cy + s * 0.04, s * 0.9);
    ctx.save(); ctx.fillStyle = '#ff6f91'; const x = cx + s * 0.26, y = cy - s * 0.24, r = s * 0.08;
    ctx.beginPath(); ctx.moveTo(x, y + r * 1.6); ctx.bezierCurveTo(x - r * 2.2, y, x - r, y - r * 1.4, x, y - r * 0.3); ctx.bezierCurveTo(x + r, y - r * 1.4, x + r * 2.2, y, x, y + r * 1.6); ctx.fill(); ctx.restore();
  },
  /** Jeton (casino). */
  chip(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text; ctx.beginPath(); ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.deepNavy; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.fillRect(cx + Math.cos(a) * s * 0.26 - s * 0.04, cy + Math.sin(a) * s * 0.26 - s * 0.04, s * 0.08, s * 0.08); }
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  },
  /** Manette (mini-jeux). */
  pad(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text; roundRect(ctx, cx - s * 0.38, cy - s * 0.18, s * 0.76, s * 0.38, s * 0.18); ctx.fill();
    ctx.fillStyle = PAL.deepNavy; ctx.fillRect(cx - s * 0.26, cy - s * 0.02, s * 0.16, s * 0.05); ctx.fillRect(cx - s * 0.205, cy - s * 0.075, s * 0.05, s * 0.16);
    ctx.beginPath(); ctx.arc(cx + s * 0.18, cy - s * 0.02, s * 0.04, 0, Math.PI * 2); ctx.arc(cx + s * 0.26, cy + s * 0.06, s * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  },
  /** Soleil couchant (rooftop). */
  sunset(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text; ctx.beginPath(); ctx.arc(cx, cy + s * 0.08, s * 0.22, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = PAL.text; ctx.lineWidth = Math.max(1.5, s * 0.06); ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * s * 0.3, cy + s * 0.08 + Math.sin(a) * s * 0.3); ctx.lineTo(cx + Math.cos(a) * s * 0.4, cy + s * 0.08 + Math.sin(a) * s * 0.4); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - s * 0.4, cy + s * 0.16); ctx.lineTo(cx + s * 0.4, cy + s * 0.16); ctx.moveTo(cx - s * 0.26, cy + s * 0.28); ctx.lineTo(cx + s * 0.26, cy + s * 0.28); ctx.stroke(); ctx.restore();
  },
  home(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.fillStyle = PAL.text; ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.38); ctx.lineTo(cx + s * 0.38, cy); ctx.lineTo(cx + s * 0.26, cy); ctx.lineTo(cx + s * 0.26, cy + s * 0.34);
    ctx.lineTo(cx - s * 0.26, cy + s * 0.34); ctx.lineTo(cx - s * 0.26, cy); ctx.lineTo(cx - s * 0.38, cy); ctx.closePath(); ctx.fill(); ctx.restore();
  },
};
