// Éléments graphiques partagés par les jeux : cartes, jetons, panneaux de score.
import { drawChipTop, drawKSEmblem, goldGradient } from '../art/brand';
import { makeCanvas, roundRect } from '../art/canvas';
import { flipScale } from './casinoKit';
import { PAL } from '../art/palette';
import { font, makeButton, type Button } from '../ui/UIKit';
import { isRed, rankLabel, type Card } from './logic/cards';

/** Jeton de casino (dessin détaillé de la marque : tranche à inserts, incrustation, valeur). */
export function drawChip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, value: number, selected = false): void {
  drawChipTop(ctx, cx, cy, r, value, selected);
}

/** Boutons de jetons (sélection de la mise). Appeler syncChips() à chaque image pour l'état actif/désactivé. */
export function chipButtons(values: number[], set: (v: number) => void): Button[] {
  return values.map((v) => {
    const b = makeButton({ id: `chip-${v}`, label: '', style: 'round', onTap: () => set(v) });
    b.icon = (ctx, cx, cy, s) => drawChipTop(ctx, cx, cy, s * 0.6, v, !!b.active);
    return b;
  });
}

/**
 * Barre de commandes du bas des jeux de casino : jetons à gauche, actions à droite (largeurs souhaitées
 * en unités d'interface, de gauche à droite). Si la largeur manque (téléphone en portrait), les jetons
 * passent sur une ligne au-dessus, centrés, et les actions se partagent la largeur. Renvoie la hauteur occupée.
 */
export function layoutControlBar(a: { x: number; y: number; w: number; h: number }, ui: number, chips: Button[], actions: Array<[Button, number]>): number {
  const ctrlH = 58 * ui, cs = Math.max(44, ctrlH - 4 * ui), gap = 6 * ui, ag = 8 * ui, by = a.y + a.h - ctrlH;
  const chipsW = chips.length * (cs + gap);
  const want = actions.reduce((t, [, bw]) => t + bw * ui, 0) + ag * Math.max(0, actions.length - 1);
  if (chipsW + 12 * ui + want <= a.w) {
    chips.forEach((c, i) => Object.assign(c, { x: a.x + i * (cs + gap), y: by, w: cs, h: cs }));
    let x = a.x + a.w;
    for (let i = actions.length - 1; i >= 0; i--) { const [b, bw] = actions[i]; x -= bw * ui; Object.assign(b, { x, y: by, w: bw * ui, h: cs }); x -= ag; }
    return ctrlH;
  }
  const k = Math.min(1, (a.w - ag * Math.max(0, actions.length - 1)) / Math.max(1, want - ag * Math.max(0, actions.length - 1)));
  const total = actions.reduce((t, [, bw]) => t + bw * ui * k, 0) + ag * Math.max(0, actions.length - 1);
  let x = a.x + (a.w - total) / 2;
  for (const [b, bw] of actions) { Object.assign(b, { x, y: by, w: bw * ui * k, h: cs }); x += bw * ui * k + ag; }
  const cg = Math.min(gap, (a.w - chips.length * cs) / Math.max(1, chips.length - 1));
  const cw = chips.length * cs + (chips.length - 1) * cg, cy = by - cs - 8 * ui;
  chips.forEach((c, i) => Object.assign(c, { x: a.x + (a.w - cw) / 2 + i * (cs + cg), y: cy, w: cs, h: cs }));
  return ctrlH + cs + 8 * ui;
}

export function syncChips(chips: Button[], selected: number, canAfford: (v: number) => boolean, locked = false): void {
  for (const b of chips) { const v = Number(b.id.slice(5)); b.active = v === selected; b.enabled = !locked && canAfford(v); }
}

const cardCache = new Map<string, { canvas: HTMLCanvasElement | OffscreenCanvas }>();

function renderCard(c: Card | null, w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  const key = c ? `${c.rank}${c.suit}:${w}x${h}` : `back:${w}x${h}`;
  let e = cardCache.get(key);
  if (e) return e.canvas;
  const { canvas, ctx: g } = makeCanvas(w, h);
  const r = w * 0.09;
  if (!c) {
    // Dos : laque bordeaux, croisillons dorés, médaillon KS
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r);
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#7a1f33'); bg.addColorStop(1, '#3a0c17');
    g.fillStyle = bg; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(212,175,90,0.35)'; g.lineWidth = Math.max(0.6, w * 0.012);
    for (let k = -h; k < w + h; k += w * 0.14) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
    g.restore();
    g.strokeStyle = goldGradient(g, 0, 0, w, h); g.lineWidth = Math.max(1, w * 0.035);
    roundRect(g, w * 0.07, w * 0.07, w - w * 0.14, h - w * 0.14, r * 0.7); g.stroke();
    drawKSEmblem(g, w / 2, h / 2, w * 0.46, 0, 'small');
  } else {
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r);
    const face = g.createLinearGradient(0, 0, 0, h); face.addColorStop(0, '#fffdf7'); face.addColorStop(1, '#efe6d2');
    g.fillStyle = face; g.fill();
    g.strokeStyle = 'rgba(138,106,43,0.55)'; g.lineWidth = 1; g.stroke();
    const col = isRed(c) ? '#a3172c' : '#16131a', rank = rankLabel(c.rank);
    const corner = (rot: boolean) => {
      g.save();
      if (rot) { g.translate(w, h); g.rotate(Math.PI); }
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'top';
      g.font = `900 ${Math.round(w * 0.27)}px Georgia, "Times New Roman", serif`; g.fillText(rank, w * 0.15, h * 0.04);
      g.font = `700 ${Math.round(w * 0.22)}px system-ui, sans-serif`; g.fillText(c.suit, w * 0.15, h * 0.04 + w * 0.29);
      g.restore();
    };
    corner(false); corner(true);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (c.rank >= 11) {
      // Figures : cadre art déco bordeaux et or, initiale en capitale
      const fx = w * 0.26, fy = h * 0.2, fw = w * 0.48, fh = h * 0.6;
      roundRect(g, fx, fy, fw, fh, w * 0.05);
      const fg = g.createLinearGradient(0, fy, 0, fy + fh); fg.addColorStop(0, isRed(c) ? '#7a1f33' : '#1d1820'); fg.addColorStop(1, isRed(c) ? '#3a0c17' : '#0b0a0d');
      g.fillStyle = fg; g.fill(); g.strokeStyle = goldGradient(g, fx, fy, fx + fw, fy + fh); g.lineWidth = Math.max(1, w * 0.025); g.stroke();
      g.fillStyle = goldGradient(g, 0, fy, 0, fy + fh); g.font = `900 ${Math.round(w * 0.36)}px Georgia, "Times New Roman", serif`;
      g.fillText(rank, w / 2, h * 0.45);
      g.fillStyle = '#efdcae'; g.font = `700 ${Math.round(w * 0.18)}px system-ui, sans-serif`; g.fillText(c.suit, w / 2, h * 0.66);
    } else if (c.rank === 1) {
      g.strokeStyle = 'rgba(212,175,90,0.8)'; g.lineWidth = Math.max(1, w * 0.02); g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); g.stroke();
      g.fillStyle = col; g.font = `700 ${Math.round(w * 0.5)}px system-ui, sans-serif`; g.fillText(c.suit, w / 2, h * 0.53);
    } else {
      g.fillStyle = col; g.font = `700 ${Math.round(w * 0.46)}px system-ui, sans-serif`; g.fillText(c.suit, w / 2, h * 0.54);
    }
  }
  e = { canvas };
  cardCache.set(key, e);
  if (cardCache.size > 160) cardCache.delete(cardCache.keys().next().value as string);
  return canvas;
}

/**
 * Carte à jouer (face ivoire, figures art déco, dos bordeaux au médaillon KS). flip ∈ [0, 1] anime le
 * retournement (0 = dos, 1 = face) ; sans flip, la carte est dessinée telle quelle (null = dos).
 */
export function drawCard(ctx: CanvasRenderingContext2D, c: Card | null, x: number, y: number, w: number, h: number, flip?: number): void {
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
  const pw = Math.max(8, Math.round(w * dpr)), ph = Math.max(10, Math.round(h * dpr));
  let face = c, sx = 1;
  if (flip !== undefined && c) { const f = flipScale(flip); face = f.face ? c : null; sx = f.sx; }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  const cx = x + w / 2;
  ctx.translate(cx, y); ctx.scale(sx, 1);
  ctx.drawImage(renderCard(face, pw, ph) as CanvasImageSource, -w / 2, 0, w, h);
  ctx.restore();
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string = PAL.text, align: CanvasTextAlign = 'center', weight = 800): void {
  ctx.font = font(size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}

export function drawPill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, bg: string, fg: string): void {
  ctx.font = font(size, 800);
  const w = ctx.measureText(text).width + size * 1.6, h = size * 2;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + 1);
}

/** Dé vu de dessus, avec ses points. */
export function drawDie(ctx: CanvasRenderingContext2D, value: number, cx: number, cy: number, size: number, angle = 0): void {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.18);
  ctx.fillStyle = '#fbfaf7'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  const p = size * 0.26, r = size * 0.09;
  const spots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  ctx.fillStyle = value === 1 ? '#c0392b' : '#111827';
  for (const [x, y] of spots[value] ?? []) { ctx.beginPath(); ctx.arc(x * p, y * p, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
