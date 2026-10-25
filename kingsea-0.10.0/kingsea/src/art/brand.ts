// Identité KingSea (« KingSea · Croisière ») : monogramme KS calligraphié (pleins et déliés), médaillon laqué
// noir cerclé d'or, rayons art déco, couronne, lettrage KINGSEA dessiné (aucune police : rendu identique sur
// tous les téléphones), pièce KSCoin et jetons de casino détaillés. Tout est vectoriel, mis en cache hors
// écran à la résolution réelle, et sert aussi à l'icône de l'application (scripts/make-icons.mjs).
import { makeCanvas } from './canvas';

/** Couleurs de la marque (or champagne, noir laqué, bordeaux, vert tapis, ivoire). */
export const LUXE = {
  black: '#0b0a0d', onyx: '#16131a', lacquer: '#1d1820',
  champagne: '#efdcae', gold: '#d4af5a', goldDeep: '#a07a2c', goldDark: '#6e5220',
  bordeaux: '#6e1a2b', bordeauxDeep: '#3a0c17', felt: '#0f5a3f', feltDeep: '#083726',
  ivory: '#f6f0e3', ivoryDim: '#cbbfa8',
} as const;

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

/** Dégradé « or métallique » sur une boîte verticale. */
export function goldGradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff3cf'); g.addColorStop(0.22, LUXE.champagne); g.addColorStop(0.5, LUXE.gold);
  g.addColorStop(0.72, LUXE.goldDeep); g.addColorStop(0.86, '#e9cf8c'); g.addColorStop(1, LUXE.goldDark);
  return g;
}

// ---------------------------------------------------------------- lettrage art déco (traits géométriques)
type GlyphOp = ['M', number, number] | ['L', number, number] | ['E', number, number, number, number, number, number, boolean];
const GLYPHS: Record<string, { w: number; ops: GlyphOp[] }> = {
  K: { w: 0.6, ops: [['M', 0.07, 0], ['L', 0.07, 1], ['M', 0.56, 0], ['L', 0.09, 0.56], ['M', 0.27, 0.36], ['L', 0.58, 1]] },
  I: { w: 0.16, ops: [['M', 0.08, 0], ['L', 0.08, 1]] },
  N: { w: 0.68, ops: [['M', 0.07, 1], ['L', 0.07, 0], ['L', 0.61, 1], ['L', 0.61, 0]] },
  G: { w: 0.78, ops: [['E', 0.41, 0.5, 0.35, 0.5, -Math.PI * 0.3, 0, true], ['L', 0.76, 0.5], ['M', 0.76, 0.5], ['L', 0.48, 0.5]] },
  S: { w: 0.6, ops: [['E', 0.31, 0.255, 0.25, 0.255, -Math.PI * 0.12, Math.PI * 0.5, true], ['E', 0.31, 0.745, 0.27, 0.255, -Math.PI * 0.5, Math.PI * 0.88, false]] },
  E: { w: 0.54, ops: [['M', 0.5, 0], ['L', 0.07, 0], ['L', 0.07, 1], ['L', 0.5, 1], ['M', 0.07, 0.5], ['L', 0.42, 0.5]] },
  A: { w: 0.7, ops: [['M', 0.02, 1], ['L', 0.35, 0], ['L', 0.68, 1], ['M', 0.18, 0.64], ['L', 0.52, 0.64]] },
  C: { w: 0.72, ops: [['E', 0.41, 0.5, 0.35, 0.5, -Math.PI * 0.27, Math.PI * 0.27, true]] },
  O: { w: 0.82, ops: [['E', 0.41, 0.5, 0.36, 0.5, 0, Math.PI * 2, false]] },
  R: { w: 0.6, ops: [['M', 0.07, 1], ['L', 0.07, 0], ['L', 0.3, 0], ['E', 0.3, 0.26, 0.24, 0.26, -Math.PI / 2, Math.PI / 2, false], ['L', 0.07, 0.52], ['M', 0.28, 0.52], ['L', 0.58, 1]] },
  // È : E surmonté d'un accent grave
  'È': { w: 0.54, ops: [['M', 0.5, 0], ['L', 0.07, 0], ['L', 0.07, 1], ['L', 0.5, 1], ['M', 0.07, 0.5], ['L', 0.42, 0.5], ['M', 0.14, -0.34], ['L', 0.32, -0.14]] },
  ' ': { w: 0.35, ops: [] },
};

/** Largeur d'un mot dessiné en lettrage KS (hauteur h, interlettrage en proportion de h). */
export function wordWidth(word: string, h: number, tracking = 0.18): number {
  let w = 0;
  for (const ch of word) w += (GLYPHS[ch]?.w ?? 0.6) * h + tracking * h;
  return w - tracking * h;
}

/** Trace un mot (lettres capitales disponibles : K I N G S E A C O R È) centré en (cx, cy). */
export function drawWord(ctx: Ctx, word: string, cx: number, cy: number, h: number, style: string | CanvasGradient, tracking = 0.18, weight = 0.12): void {
  const total = wordWidth(word, h, tracking);
  let x = cx - total / 2;
  const y = cy - h / 2;
  ctx.save();
  ctx.strokeStyle = style; ctx.lineWidth = Math.max(1, h * weight); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 3;
  for (const ch of word) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    ctx.beginPath();
    for (const op of g.ops) {
      if (op[0] === 'M') ctx.moveTo(x + op[1] * h, y + op[2] * h);
      else if (op[0] === 'L') ctx.lineTo(x + op[1] * h, y + op[2] * h);
      else { const [, ex, ey, rx, ry, a0, a1, ccw] = op; ctx.moveTo(x + ex * h + Math.cos(a0) * rx * h, y + ey * h + Math.sin(a0) * ry * h); ctx.ellipse(x + ex * h, y + ey * h, rx * h, ry * h, 0, a0, a1, ccw); }
    }
    ctx.stroke();
    x += g.w * h + tracking * h;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- monogramme calligraphié
/** Échantillonne une courbe de Bézier cubique. */
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 48): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}

/**
 * Trait « plume large » : épaisseur variable selon la direction (pleins verticaux, déliés horizontaux),
 * comme une capitale didone. widthAt(i, angle) renvoie l'épaisseur au point i.
 */
function nibPath(ctx: Ctx, pts: Pt[], widthAt: (i: number, ang: number) => number): void {
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const w = widthAt(i, ang) / 2, nx = -Math.sin(ang), ny = Math.cos(ang);
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

const THICK = 0.17, THIN = 0.035;
const contrast = (ang: number) => THIN + (THICK - THIN) * Math.pow(Math.abs(Math.sin(ang)), 1.6);

/** Tracés du monogramme dans un repère d'unité 1 (hauteur des lettres ≈ 1, centrées en 0,0). */
function kPath(ctx: Ctx): void {
  // Fût, bras délié, jambe pleine, empattements filiformes
  nibPath(ctx, [[-0.42, -0.5], [-0.42, 0.5]], () => THICK);
  nibPath(ctx, [[-0.35, 0.06], [0.06, -0.48]], () => THIN * 1.15);
  nibPath(ctx, [[-0.22, -0.1], [0.02, 0.5]], (i) => (i === 0 ? THICK * 0.55 : THICK * 0.95));
  for (const [x, y, w] of [[-0.42, -0.5, 0.3], [-0.42, 0.5, 0.3], [0.06, -0.48, 0.18], [0.02, 0.5, 0.16]] as const) {
    nibPath(ctx, [[x - w / 2, y], [x + w / 2, y]], () => THIN);
  }
}
function sPath(ctx: Ctx): void {
  const segs: Array<[Pt, Pt, Pt, Pt]> = [
    [[0.5, -0.36], [0.44, -0.5], [0.2, -0.52], [0.1, -0.46]],
    [[0.1, -0.46], [-0.02, -0.4], [-0.02, -0.2], [0.12, -0.1]],
    [[0.12, -0.1], [0.3, 0.02], [0.5, 0.08], [0.5, 0.26]],
    [[0.5, 0.26], [0.5, 0.46], [0.24, 0.53], [0.12, 0.48]],
    [[0.12, 0.48], [0.07, 0.46], [0.05, 0.42], [0.05, 0.37]],
  ];
  const pts: Pt[] = [];
  for (const s of segs) pts.push(...cubic(s[0], s[1], s[2], s[3], 28).slice(pts.length ? 1 : 0));
  nibPath(ctx, pts, (_i, ang) => contrast(ang));
  // Empattements verticaux aux extrémités du S
  nibPath(ctx, [[0.5, -0.43], [0.5, -0.29]], () => THIN * 1.1);
  nibPath(ctx, [[0.05, 0.31], [0.05, 0.43]], () => THIN * 1.1);
}

/** Dessine le monogramme (origine au centre, hauteur des lettres = h). fill : or, ivoire… ; gap : couleur du fond pour l'entrelacs. */
function drawMonogram(ctx: Ctx, h: number, fill: string | CanvasGradient, gap: string): void {
  ctx.save();
  ctx.scale(h, h);
  ctx.save(); ctx.translate(-0.07, 0); ctx.beginPath(); kPath(ctx); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  // Le S passe devant le K : un liseré couleur du fond crée l'entrelacs
  ctx.translate(0.09, 0);
  ctx.save(); ctx.beginPath(); sPath(ctx); ctx.strokeStyle = gap; ctx.lineWidth = 0.05; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  ctx.beginPath(); sPath(ctx); ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- emblème
function crownPath(ctx: Ctx, w: number, h: number): void {
  // Couronne art déco à cinq pointes
  ctx.beginPath();
  ctx.moveTo(-w / 2, h * 0.5);
  ctx.lineTo(-w / 2, -h * 0.1); ctx.lineTo(-w * 0.32, h * 0.18); ctx.lineTo(-w * 0.2, -h * 0.4); ctx.lineTo(-w * 0.08, h * 0.12);
  ctx.lineTo(0, -h * 0.6); ctx.lineTo(w * 0.08, h * 0.12); ctx.lineTo(w * 0.2, -h * 0.4); ctx.lineTo(w * 0.32, h * 0.18); ctx.lineTo(w / 2, -h * 0.1);
  ctx.lineTo(w / 2, h * 0.5); ctx.closePath();
}

/** Médaillon + monogramme dans le repère du médaillon (rayon R), sans halo ni lettrage. */
function drawMedallion(ctx: Ctx, R: number, small: boolean): void {
  // Rayons art déco derrière le médaillon
  if (!small) {
    ctx.save();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, long = i % 2 === 0;
      ctx.strokeStyle = long ? 'rgba(239,220,174,0.28)' : 'rgba(239,220,174,0.14)';
      ctx.lineWidth = R * (long ? 0.018 : 0.01);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 1.08, Math.sin(a) * R * 1.08); ctx.lineTo(Math.cos(a) * R * (long ? 1.42 : 1.28), Math.sin(a) * R * (long ? 1.42 : 1.28)); ctx.stroke();
    }
    ctx.restore();
  }
  // Laque noire avec reflet
  const bg = ctx.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.05, 0, 0, R);
  bg.addColorStop(0, '#3a2f3c'); bg.addColorStop(0.45, LUXE.lacquer); bg.addColorStop(1, '#060507');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  // Filigrane : losange art déco
  if (!small) {
    ctx.strokeStyle = 'rgba(212,175,90,0.16)'; ctx.lineWidth = R * 0.012;
    for (const k of [0.78, 0.66]) { ctx.beginPath(); ctx.moveTo(0, -R * k); ctx.lineTo(R * k, 0); ctx.lineTo(0, R * k); ctx.lineTo(-R * k, 0); ctx.closePath(); ctx.stroke(); }
  }
  // Anneaux d'or
  const ring = goldGradient(ctx, -R, -R, R, R);
  ctx.strokeStyle = ring; ctx.lineWidth = R * (small ? 0.11 : 0.075); ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  if (!small) {
    ctx.lineWidth = R * 0.018; ctx.beginPath(); ctx.arc(0, 0, R * 0.88, 0, Math.PI * 2); ctx.stroke();
    // Petits losanges aux points cardinaux
    ctx.fillStyle = ring;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * R * 0.94, y = Math.sin(a) * R * 0.94, d = R * 0.045;
      ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); ctx.fill();
    }
  }
  // Monogramme
  drawMonogram(ctx, R * (small ? 1.12 : 0.98), goldGradient(ctx, -R * 0.6, -R * 0.6, R * 0.6, R * 0.6), '#0d0a0e');
}

const cache = new Map<string, { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D }>();
function cached(key: string, w: number, h: number, draw: (c: Ctx) => void) {
  let c = cache.get(key);
  if (!c) {
    c = makeCanvas(w, h);
    draw(c.ctx);
    cache.set(key, c);
    if (cache.size > 40) cache.delete(cache.keys().next().value as string);
  }
  return c;
}

/**
 * Emblème KS. variant 'full' : rayons, couronne, lettrage KINGSEA et devise ; 'small' : médaillon seul,
 * traits renforcés (barre du haut, icônes, petits affichages). size ≈ diamètre du médaillon en px CSS.
 * t anime un reflet qui balaie l'or.
 */
export function drawKSEmblem(ctx: Ctx, cx: number, cy: number, size: number, t = 0, variant: 'full' | 'small' = 'full', withName = true): void {
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
  const R = size / 2, px = Math.ceil(R * dpr);
  const small = variant === 'small' || size < 56;
  const name = withName && !small;
  const W = R * (small ? 2.3 : 3), H = R * (small ? 2.3 : name ? 4.1 : 3.4);
  const ox = W / 2, oy = small ? H / 2 : R * 1.7;
  const key = `emb:${px}:${small ? 's' : 'f'}:${name ? 1 : 0}`;
  const c = cached(key, W * dpr, H * dpr, (g) => {
    g.scale(dpr, dpr); g.translate(ox, oy);
    if (!small) {
      const halo = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.6);
      halo.addColorStop(0, 'rgba(212,175,90,0.22)'); halo.addColorStop(1, 'rgba(212,175,90,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.6, 0, Math.PI * 2); g.fill();
    }
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = R * 0.15; g.shadowOffsetY = R * 0.04;
    g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill(); g.restore();
    drawMedallion(g, R, small);
    if (!small) {
      // Couronne
      g.save(); g.translate(0, -R * 1.18);
      crownPath(g, R * 0.62, R * 0.36); g.fillStyle = goldGradient(g, -R * 0.3, -R * 0.2, R * 0.3, R * 0.2); g.fill();
      g.strokeStyle = LUXE.goldDark; g.lineWidth = R * 0.012; g.stroke();
      g.fillStyle = LUXE.ivory;
      for (const [x, y] of [[0, -0.6], [-0.2, -0.4], [0.2, -0.4]] as const) { g.beginPath(); g.arc(x * R * 0.62, y * R * 0.36, R * 0.032, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = LUXE.bordeaux; g.fillRect(-R * 0.28, R * 0.1, R * 0.56, R * 0.045);
      g.restore();
    }
    if (name) {
      const nh = R * 0.42, ny = R * 1.62;
      const ng = goldGradient(g, 0, ny - nh / 2, 0, ny + nh / 2);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = R * 0.08; g.shadowOffsetY = R * 0.03;
      drawWord(g, 'KINGSEA', 0, ny, nh, ng, 0.2, 0.11);
      g.restore();
      // Filet : trait – losange – trait
      const ly = ny + nh * 0.95, lw = wordWidth('KINGSEA', nh, 0.2) * 0.5;
      g.strokeStyle = 'rgba(239,220,174,0.85)'; g.lineWidth = Math.max(1, R * 0.014);
      g.beginPath(); g.moveTo(-lw, ly); g.lineTo(-R * 0.08, ly); g.moveTo(R * 0.08, ly); g.lineTo(lw, ly); g.stroke();
      g.fillStyle = LUXE.gold; g.beginPath(); g.moveTo(0, ly - R * 0.045); g.lineTo(R * 0.045, ly); g.lineTo(0, ly + R * 0.045); g.lineTo(-R * 0.045, ly); g.closePath(); g.fill();
      // Signature générale du jeu (le navire entier, pas seulement le casino)
      drawWord(g, 'CROISIÈRE', 0, ly + R * 0.2, R * 0.13, LUXE.champagne, 0.42, 0.1);
    }
  });
  ctx.drawImage(c.canvas as CanvasImageSource, cx - ox, cy - oy, W, H);
  // Reflet animé sur l'or (léger, uniquement sur la grande version)
  if (!small && t > 0) {
    const k = ((t * 0.22) % 1.6) - 0.3;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2); ctx.clip();
    const sg = ctx.createLinearGradient(cx - R + k * R * 2.4, cy - R, cx - R * 0.55 + k * R * 2.4, cy + R);
    sg.addColorStop(0, 'rgba(255,248,225,0)'); sg.addColorStop(0.5, 'rgba(255,248,225,0.13)'); sg.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = sg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- KSCoin
/** Pièce KSCoin (vue de face). squash ∈ [-1, 1] : rotation sur l'axe vertical (animation de pièce qui tourne). */
export function drawKSCoin(ctx: Ctx, cx: number, cy: number, r: number, squash = 1): void {
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
  const px = Math.max(4, Math.round(r * dpr));
  const c = cached(`coin:${px}`, px * 2 + 2, px * 2 + 2, (g) => {
    g.translate(px + 1, px + 1);
    const R = px;
    // Tranche cannelée
    g.fillStyle = LUXE.goldDeep; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    if (R >= 7) {
      g.strokeStyle = 'rgba(255,240,200,0.55)'; g.lineWidth = Math.max(0.6, R * 0.03);
      const n = Math.min(64, Math.round(R * 2.2));
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88); g.lineTo(Math.cos(a) * R * 0.99, Math.sin(a) * R * 0.99); g.stroke(); }
    }
    // Face
    const face = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.08, 0, 0, R * 0.9);
    face.addColorStop(0, '#fff2c8'); face.addColorStop(0.45, LUXE.gold); face.addColorStop(1, LUXE.goldDeep);
    g.fillStyle = face; g.beginPath(); g.arc(0, 0, R * 0.84, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(110,82,32,0.85)'; g.lineWidth = Math.max(0.8, R * 0.05); g.beginPath(); g.arc(0, 0, R * 0.72, 0, Math.PI * 2); g.stroke();
    // Monogramme en relief (ombre puis lumière)
    if (R >= 6) {
      g.save(); g.translate(R * 0.025, R * 0.04); drawMonogram(g, R * 0.86, 'rgba(90,64,20,0.75)', 'rgba(0,0,0,0)'); g.restore();
      drawMonogram(g, R * 0.86, '#fff0c0', 'rgba(0,0,0,0)');
    } else { g.fillStyle = LUXE.goldDark; g.beginPath(); g.arc(0, 0, R * 0.3, 0, Math.PI * 2); g.fill(); }
    // Éclat
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-R * 0.35, -R * 0.45, R * 0.28, R * 0.12, -0.6, 0, Math.PI * 2); g.fill();
  });
  const s = Math.abs(squash) < 0.08 ? 0.08 : Math.abs(squash);
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, 1);
  ctx.drawImage(c.canvas as CanvasImageSource, -r - 1 / dpr, -r - 1 / dpr, (px * 2 + 2) / dpr, (px * 2 + 2) / dpr);
  if (s < 0.95) { ctx.fillStyle = `rgba(110,82,32,${(1 - s) * 0.5})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------- jetons de casino
/** Valeurs des jetons et couleurs (base, inserts de tranche, texte). */
export const CHIP_STYLES: Record<number, { base: string; spot: string; ink: string }> = {
  1: { base: '#ece6d8', spot: '#1f4e8c', ink: '#1f4e8c' },
  5: { base: '#b3202e', spot: '#f6f0e3', ink: '#8c1520' },
  10: { base: '#1f4e8c', spot: '#f6f0e3', ink: '#1f4e8c' },
  25: { base: '#11704b', spot: '#f6f0e3', ink: '#0b5136' },
  50: { base: '#e07b22', spot: '#1b1b1b', ink: '#9a4d0c' },
  100: { base: '#1b1b1f', spot: '#d4af5a', ink: '#1b1b1f' },
  250: { base: '#d0507d', spot: '#f6f0e3', ink: '#922a52' },
  500: { base: '#5b2a86', spot: '#efdcae', ink: '#5b2a86' },
  1000: { base: '#c99a2e', spot: '#1b1b1f', ink: '#6e5220' },
};
export const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

/** Plus grande valeur de jeton ≤ v (pour décomposer une mise en pile). */
export function chipBreakdown(amount: number, max = 12): number[] {
  const out: number[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (let i = CHIP_VALUES.length - 1; i >= 0 && out.length < max; i--) {
    while (rest >= CHIP_VALUES[i] && out.length < max) { out.push(CHIP_VALUES[i]); rest -= CHIP_VALUES[i]; }
  }
  return out;
}

const chipLabel = (v: number) => (v >= 1000 ? `${v / 1000}K` : String(v));

/** Jeton vu de dessus : tranche à inserts, anneau, incrustation ivoire avec la valeur. */
export function drawChipTop(ctx: Ctx, cx: number, cy: number, r: number, value: number, selected = false): void {
  const st = CHIP_STYLES[value] ?? { base: LUXE.gold, spot: LUXE.ivory, ink: LUXE.goldDark };
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
  const px = Math.max(5, Math.round(r * dpr));
  const c = cached(`chip:${value}:${px}`, px * 2 + 4, px * 2 + 4, (g) => {
    g.translate(px + 2, px + 2);
    const R = px;
    g.fillStyle = st.base; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    // Six inserts de tranche
    g.fillStyle = st.spot;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = a0 + 0.32;
      g.beginPath(); g.arc(0, 0, R, a0, a1); g.arc(0, 0, R * 0.78, a1, a0, true); g.closePath(); g.fill();
    }
    // Anneau intérieur pointillé
    g.strokeStyle = st.spot; g.globalAlpha = 0.85; g.lineWidth = Math.max(0.7, R * 0.045); g.setLineDash([R * 0.12, R * 0.09]);
    g.beginPath(); g.arc(0, 0, R * 0.7, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    // Incrustation
    const inlay = g.createRadialGradient(-R * 0.15, -R * 0.2, R * 0.05, 0, 0, R * 0.58);
    inlay.addColorStop(0, '#ffffff'); inlay.addColorStop(1, LUXE.ivoryDim);
    g.fillStyle = inlay; g.beginPath(); g.arc(0, 0, R * 0.56, 0, Math.PI * 2); g.fill();
    g.strokeStyle = st.base; g.lineWidth = Math.max(0.6, R * 0.035); g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.stroke();
    const label = chipLabel(value);
    g.fillStyle = st.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(R * (label.length > 2 ? 0.42 : 0.55))}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
    g.fillText(label, 0, R * 0.04);
    // Volume : ombre basse et reflet haut
    const sh = g.createLinearGradient(0, -R, 0, R);
    sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(0.6, R * 0.03); g.beginPath(); g.arc(0, 0, R - 0.5, 0, Math.PI * 2); g.stroke();
  });
  ctx.drawImage(c.canvas as CanvasImageSource, cx - r - 2 / dpr, cy - r - 2 / dpr, (px * 2 + 4) / dpr, (px * 2 + 4) / dpr);
  if (selected) {
    ctx.save(); ctx.strokeStyle = LUXE.champagne; ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.shadowColor = 'rgba(239,220,174,0.8)'; ctx.shadowBlur = r * 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

/** Pile de jetons vue de trois quarts (montant engagé sur la table). Renvoie la hauteur de la pile. */
export function drawChipStack(ctx: Ctx, cx: number, baseY: number, r: number, amount: number, maxChips = 10): number {
  const chips = chipBreakdown(amount, maxChips).reverse();
  const th = r * 0.22, ry = r * 0.42;
  chips.forEach((v, i) => {
    const st = CHIP_STYLES[v] ?? { base: LUXE.gold, spot: LUXE.ivory, ink: LUXE.goldDark };
    const y = baseY - i * th;
    // Tranche
    ctx.fillStyle = st.base; ctx.beginPath(); ctx.ellipse(cx, y, r, ry, 0, 0, Math.PI); ctx.lineTo(cx - r, y - th); ctx.ellipse(cx, y - th, r, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = st.spot;
    for (let k = -2; k <= 2; k++) { const x = cx + k * r * 0.38; ctx.fillRect(x - r * 0.07, y - th + 1, r * 0.14, th - 1); }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(cx, y, r, ry, 0, 0, Math.PI); ctx.stroke();
    // Dessus
    ctx.fillStyle = st.base; ctx.beginPath(); ctx.ellipse(cx, y - th, r, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = st.spot; ctx.lineWidth = Math.max(0.6, r * 0.08); ctx.setLineDash([r * 0.2, r * 0.15]);
    ctx.beginPath(); ctx.ellipse(cx, y - th, r * 0.8, ry * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (i === chips.length - 1) { ctx.fillStyle = LUXE.ivory; ctx.beginPath(); ctx.ellipse(cx, y - th, r * 0.48, ry * 0.48, 0, 0, Math.PI * 2); ctx.fill(); }
  });
  return chips.length * th + ry;
}

/** Texte en petites capitales espacées (titres de panneaux). */
export function spacedCaps(ctx: Ctx, text: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = 'left', spacing = 0.12): void {
  ctx.save();
  ctx.font = `700 ${Math.round(px)}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  const c2 = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in c2) c2.letterSpacing = `${(px * spacing).toFixed(1)}px`;
  ctx.fillText(text.toUpperCase(), x, y);
  if ('letterSpacing' in c2) c2.letterSpacing = '0px';
  ctx.restore();
}
