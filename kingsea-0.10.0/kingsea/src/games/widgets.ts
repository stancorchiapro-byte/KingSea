// Éléments graphiques partagés par les jeux : cartes, jetons, panneaux de score.
import { drawChipTop, drawKSEmblem, goldGradient } from '../art/brand';
import { makeCanvas, roundRect } from '../art/canvas';
import { flipScale } from './casinoKit';
import { PAL } from '../art/palette';
import { font, makeButton, wrapText, type Button } from '../ui/UIKit';
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

const cardCache = new Map<string, { canvas: HTMLCanvasElement | OffscreenCanvas; pad: number }>();

/** Enseigne dessinée en vectoriel (même rendu sur tous les téléphones, sans police ni emoji). */
export function drawSuit(g: CanvasRenderingContext2D, suit: string, cx: number, cy: number, s: number, color: string): void {
  g.save(); g.translate(cx, cy); g.fillStyle = color; g.beginPath();
  const h = s / 2;
  if (suit === '♥') {
    g.moveTo(0, h * 0.95);
    g.bezierCurveTo(-h * 1.1, h * 0.1, -h * 1.05, -h * 0.95, -h * 0.5, -h * 0.95);
    g.bezierCurveTo(-h * 0.15, -h * 0.95, 0, -h * 0.7, 0, -h * 0.45);
    g.bezierCurveTo(0, -h * 0.7, h * 0.15, -h * 0.95, h * 0.5, -h * 0.95);
    g.bezierCurveTo(h * 1.05, -h * 0.95, h * 1.1, h * 0.1, 0, h * 0.95);
    g.fill();
  } else if (suit === '♦') {
    g.moveTo(0, -h); g.quadraticCurveTo(h * 0.35, -h * 0.35, h * 0.78, 0); g.quadraticCurveTo(h * 0.35, h * 0.35, 0, h);
    g.quadraticCurveTo(-h * 0.35, h * 0.35, -h * 0.78, 0); g.quadraticCurveTo(-h * 0.35, -h * 0.35, 0, -h); g.fill();
  } else if (suit === '♠') {
    g.moveTo(0, -h);
    g.bezierCurveTo(h * 0.25, -h * 0.55, h * 1.05, -h * 0.25, h * 0.98, h * 0.25);
    g.bezierCurveTo(h * 0.92, h * 0.62, h * 0.38, h * 0.68, h * 0.08, h * 0.4);
    g.quadraticCurveTo(h * 0.12, h * 0.8, h * 0.42, h);
    g.lineTo(-h * 0.42, h);
    g.quadraticCurveTo(-h * 0.12, h * 0.8, -h * 0.08, h * 0.4);
    g.bezierCurveTo(-h * 0.38, h * 0.68, -h * 0.92, h * 0.62, -h * 0.98, h * 0.25);
    g.bezierCurveTo(-h * 1.05, -h * 0.25, -h * 0.25, -h * 0.55, 0, -h);
    g.fill();
  } else {
    const r = h * 0.42;
    g.arc(0, -h * 0.5, r, 0, Math.PI * 2); g.moveTo(-h * 0.45 + r, h * 0.08); g.arc(-h * 0.45, h * 0.08, r, 0, Math.PI * 2);
    g.moveTo(h * 0.45 + r, h * 0.08); g.arc(h * 0.45, h * 0.08, r, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-h * 0.08, 0); g.quadraticCurveTo(-h * 0.1, h * 0.75, -h * 0.42, h); g.lineTo(h * 0.42, h); g.quadraticCurveTo(h * 0.1, h * 0.75, h * 0.08, 0); g.fill();
  }
  g.restore();
}

/** Positions des points (2 à 10) dans le cadre central, comme sur un jeu de cartes classique. */
const PIPS: Record<number, Array<[number, number]>> = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

function renderCard(c: Card | null, w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; pad: number } {
  const key = c ? `${c.rank}${c.suit}:${w}x${h}` : `back:${w}x${h}`;
  let e = cardCache.get(key);
  if (e) return e;
  // L'ombre portée est cuite dans l'image (un flou par image et par carte coûtait cher sur téléphone)
  const pad = Math.ceil(Math.max(3, w * 0.09));
  const { canvas, ctx: o } = makeCanvas(w + pad * 2, h + pad * 2);
  o.save();
  o.shadowColor = 'rgba(0,0,0,0.45)'; o.shadowBlur = pad * 0.9; o.shadowOffsetY = pad * 0.35;
  roundRect(o, pad + 0.5, pad + 0.5, w - 1, h - 1, w * 0.09); o.fillStyle = '#000'; o.fill();
  o.restore();
  o.translate(pad, pad);
  const g = o;
  const r = w * 0.09;
  if (!c) {
    // Dos : laque bordeaux, croisillons dorés, médaillon KS
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r);
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#7a1f33'); bg.addColorStop(1, '#3a0c17');
    g.fillStyle = bg; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(212,175,90,0.35)'; g.lineWidth = Math.max(0.6, w * 0.012);
    for (let k = -h; k < w + h; k += w * 0.14) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
    // Vernis : reflet diagonal
    const gl = g.createLinearGradient(0, 0, w, h); gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, w, h);
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
      g.font = `900 ${Math.round(w * (rank.length > 1 ? 0.22 : 0.27))}px Georgia, "Times New Roman", serif`; g.fillText(rank, w * 0.15, h * 0.04);
      drawSuit(g, c.suit, w * 0.15, h * 0.04 + w * 0.4, w * 0.17, col);
      g.restore();
    };
    corner(false); corner(true);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (c.rank >= 11) {
      // Figures : cadre art déco bordeaux et or, initiale en capitale, enseigne
      const fx = w * 0.26, fy = h * 0.2, fw = w * 0.48, fh = h * 0.6;
      roundRect(g, fx, fy, fw, fh, w * 0.05);
      const fg = g.createLinearGradient(0, fy, 0, fy + fh); fg.addColorStop(0, isRed(c) ? '#7a1f33' : '#1d1820'); fg.addColorStop(1, isRed(c) ? '#3a0c17' : '#0b0a0d');
      g.fillStyle = fg; g.fill(); g.strokeStyle = goldGradient(g, fx, fy, fx + fw, fy + fh); g.lineWidth = Math.max(1, w * 0.025); g.stroke();
      g.fillStyle = goldGradient(g, 0, fy, 0, fy + fh); g.font = `900 ${Math.round(w * 0.36)}px Georgia, "Times New Roman", serif`;
      g.fillText(rank, w / 2, h * 0.45);
      drawSuit(g, c.suit, w / 2, h * 0.66, w * 0.17, '#efdcae');
    } else if (c.rank === 1) {
      g.strokeStyle = 'rgba(212,175,90,0.8)'; g.lineWidth = Math.max(1, w * 0.02); g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); g.stroke();
      drawSuit(g, c.suit, w / 2, h / 2, w * 0.42, col);
    } else if (w >= 46) {
      // Points disposés comme sur une vraie carte ; ceux du bas sont tête-bêche
      const px0 = w * 0.33, px1 = w * 0.67, py0 = h * 0.2, py1 = h * 0.8, ps = Math.min(w * 0.2, h * 0.12);
      for (const [nx, ny] of PIPS[c.rank] ?? []) {
        const x = px0 + (px1 - px0) * nx, y = py0 + (py1 - py0) * ny;
        if (ny > 0.5) { g.save(); g.translate(x, y); g.rotate(Math.PI); drawSuit(g, c.suit, 0, 0, ps, col); g.restore(); }
        else drawSuit(g, c.suit, x, y, ps, col);
      }
    } else {
      // Très petite carte : une grande enseigne reste plus lisible que dix petits points
      drawSuit(g, c.suit, w / 2, h * 0.55, w * 0.42, col);
    }
  }
  e = { canvas, pad };
  cardCache.set(key, e);
  if (cardCache.size > 160) cardCache.delete(cardCache.keys().next().value as string);
  return e;
}

/**
 * Carte à jouer (face ivoire, figures art déco, dos bordeaux au médaillon KS). flip ∈ [0, 1] anime le
 * retournement (0 = dos, 1 = face) : la carte se soulève légèrement à mi-course et un reflet la balaie.
 */
export function drawCard(ctx: CanvasRenderingContext2D, c: Card | null, x: number, y: number, w: number, h: number, flip?: number): void {
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
  const pw = Math.max(8, Math.round(w * dpr)), ph = Math.max(10, Math.round(h * dpr));
  let face = c, sx = 1, lift = 1;
  if (flip !== undefined && c && flip < 1) { const f = flipScale(flip); face = f.face ? c : null; sx = f.sx; lift = 1 + Math.sin(Math.max(0, Math.min(1, flip)) * Math.PI) * 0.08; }
  const img = renderCard(face, pw, ph), pad = img.pad / dpr;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(sx * lift, lift);
  ctx.drawImage(img.canvas as CanvasImageSource, -w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
  if (lift > 1.01) {
    // Reflet pendant le retournement
    ctx.globalAlpha = (lift - 1) * 4; ctx.fillStyle = '#fff';
    roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.09); ctx.fill();
  }
  ctx.restore();
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string = PAL.text, align: CanvasTextAlign = 'center', weight = 800): void {
  ctx.font = font(size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}

export function drawPill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, bg: string, fg: string, maxW = Infinity): void {
  ctx.font = font(size, 800);
  // Réduit la taille du texte si la pastille dépasse la largeur disponible
  const tw0 = ctx.measureText(text).width + size * 1.6;
  if (tw0 > maxW) { size = Math.max(8, size * (maxW / tw0)); ctx.font = font(size, 800); }
  const w = ctx.measureText(text).width + size * 1.6, h = size * 2;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + 1);
}

/** Message sur fond arrondi, coupé sur plusieurs lignes si la largeur ne suffit pas (jamais tronqué ni écrasé). */
export function drawNote(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, bg: string, fg: string, maxW: number): void {
  ctx.font = font(size, 800);
  const pad = size * 0.8, lines = wrapText(ctx, text, Math.max(40, maxW - pad * 2));
  if (lines.length === 1) { drawPill(ctx, text, cx, cy, size, bg, fg, maxW); return; }
  const lh = size * 1.3, w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2), h = lines.length * lh + size * 0.9;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, size * 0.9); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - (lines.length - 1) * lh / 2 + i * lh + 1));
}

/** Dé vu de dessus : ivoire laqué, arêtes adoucies, points creusés (1 rouge, à la manière des dés de casino). */
export function drawDie(ctx: CanvasRenderingContext2D, value: number, cx: number, cy: number, size: number, angle = 0): void {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
  const h = size / 2, r = size * 0.2;
  // Ombre au sol
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, -h + size * 0.06, -h + size * 0.1, size, size, r); ctx.fill();
  // Corps : dégradé (lumière en haut à gauche) et biseau
  const body = ctx.createLinearGradient(-h, -h, h, h); body.addColorStop(0, '#ffffff'); body.addColorStop(0.6, '#f1ece2'); body.addColorStop(1, '#d6cfc2');
  roundRect(ctx, -h, -h, size, size, r); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.stroke();
  const inner = size * 0.08;
  roundRect(ctx, -h + inner, -h + inner, size - inner * 2, size - inner * 2, r * 0.7); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(0.8, size * 0.025); ctx.stroke();
  const p = size * 0.26, pr = size * 0.092;
  const spots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  for (const [x, y] of spots[value] ?? []) {
    const px = x * p, py = y * p, rr = value === 1 ? pr * 1.35 : pr;
    // Point creusé : liseré clair en bas à droite, teinte sombre
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(px + rr * 0.18, py + rr * 0.18, rr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = value === 1 ? '#b3202e' : '#14121a'; ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
