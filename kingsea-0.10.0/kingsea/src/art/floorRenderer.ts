// Pré-rendu de la couche statique d'un étage (sols + murs) dans un canevas unique :
// une seule image dessinée par frame au lieu de centaines de tuiles → économie de batterie.
// Les couches sont gardées en cache (3 étages max) pour limiter la mémoire sur les petits téléphones.
import { seededRandom } from '../engine/math';
import { isSolidChar, isWallChar, TILE, type FloorDef } from '../world/types';
import { ART_SCALE, makeCanvas, type AnyCanvas } from './canvas';
import { PAL, THEMES, type Theme } from './palette';

export interface Region { x: number; y: number; w: number; h: number }
export interface StaticLayer { canvas: AnyCanvas; windows: Region[] }

type Ch = (x: number, y: number) => string | undefined;

export function renderStaticLayer(floor: FloorDef): StaticLayer {
  const rows = floor.map!;
  const H = rows.length, W = rows[0].length;
  const theme = THEMES[floor.themeVariant ?? floor.theme] ?? THEMES.hub;
  const { canvas, ctx } = makeCanvas(W * TILE * ART_SCALE, H * TILE * ART_SCALE);
  ctx.scale(ART_SCALE, ART_SCALE);
  const rnd = seededRandom(floor.id.length * 977 + W * 31 + H);
  const ch: Ch = (x, y) => rows[y]?.[x];
  const windows: Region[] = [];

  // ---------- Sols et eau ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = ch(x, y);
    if (c === 'p') { drawWater(ctx, x, y, ch); continue; }
    if (isSolidChar(c)) continue;
    drawFloorTile(ctx, c!, x, y, floor.theme, theme, rnd, ch);
  }

  // Médaillons
  if (floor.theme === 'hub') drawFloorMedallion(ctx, 16 * TILE, 10 * TILE, 'KS');
  if (floor.theme === 'casino') drawFloorMedallion(ctx, 17 * TILE, 10.5 * TILE, '♠');

  // ---------- Murs ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = ch(x, y);
    if (!isWallChar(c)) continue;
    const px = x * TILE, py = y * TILE;
    const below = ch(x, y + 1), belowBelow = ch(x, y + 2);
    const isFace = !isSolidChar(below) || below === 'p';
    const isUpper = !isFace && isWallChar(below) && !isSolidChar(belowBelow);
    if (c === 'G') {
      drawRailing(ctx, x, y, isFace, isUpper, ch);
      if (isUpper) windows.push({ x: px, y: py, w: TILE, h: TILE * 2 });
      continue;
    }
    if (c === 'W' && (isFace || isUpper)) {
      drawWindow(ctx, px, py, isFace);
      if (isUpper) windows.push({ x: px, y: py, w: TILE, h: TILE * 2 });
      continue;
    }
    if (isFace) drawWallFace(ctx, px, py, theme, x);
    else if (isUpper) drawWallUpper(ctx, px, py, theme, x);
    else drawWallCap(ctx, px, py, theme, x, y, ch);
  }

  // Ombre douce au pied des murs nord
  for (let x = 0; x < W; x++) for (let y = 1; y < H; y++) {
    const up = ch(x, y - 1);
    if ((up === '#' || up === 'W') && !isSolidChar(ch(x, y))) {
      const g = ctx.createLinearGradient(0, y * TILE, 0, y * TILE + 12);
      g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x * TILE, y * TILE, TILE, 12);
    }
  }
  return { canvas, windows: mergeRegions(windows) };
}

// =====================================================================================  Sols

function drawFloorTile(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, themeId: string, t: Theme, rnd: () => number, ch: Ch): void {
  const px = x * TILE, py = y * TILE;
  switch (c) {
    case 'c': return carpet(ctx, x, y, t, ch, 'c');
    case 'g': case 'm': case 'y': return engineFloor(ctx, c, px, py, t, rnd);
    case 'r': return casinoCarpet(ctx, x, y, ch);
    case 'n': return neonFloor(ctx, x, y);
    case 'b': return carpet(ctx, x, y, t, ch, 'b');
    case 'd': return deck(ctx, x, y, rnd);
    case 'e': return poolEdge(ctx, x, y, ch);
    case 'f': return danceFloorBase(ctx, px, py);
    case 'S':
    case '.':
    default: return baseFloor(ctx, themeId, x, y, t, rnd);
  }
}

function baseFloor(ctx: CanvasRenderingContext2D, themeId: string, x: number, y: number, t: Theme, rnd: () => number): void {
  const px = x * TILE, py = y * TILE;
  if (themeId === 'engine') return engineFloor(ctx, 'g', px, py, t, rnd);
  if (themeId === 'cabins' || themeId === 'cabinRoom') { // parquet à bâtons rompus simplifié
    ctx.fillStyle = (x + y) % 2 ? t.floorA : t.floorB; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = t.grout;
    for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 8, TILE, 0.7);
    ctx.fillRect(px + ((y * 8) % 24), py, 0.7, TILE);
    return;
  }
  if (themeId === 'arcade') return neonFloor(ctx, x, y);
  if (themeId === 'rooftop') { // dallage de pierre claire
    ctx.fillStyle = (x + y) % 2 ? t.floorA : t.floorB; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = t.grout; ctx.fillRect(px, py, TILE, 0.8); ctx.fillRect(px, py, 0.8, TILE);
    return;
  }
  // Marbre (hall : nacré ; casino : noir veiné d'or)
  const alt = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
  ctx.fillStyle = alt ? t.floorA : t.floorB; ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = themeId === 'casino' ? 'rgba(229,181,74,0.22)' : 'rgba(160,145,120,0.25)'; ctx.lineWidth = 0.7;
  if (rnd() < 0.55) {
    ctx.beginPath(); let vx = px + rnd() * TILE, vy = py; ctx.moveTo(vx, vy);
    for (let i = 0; i < 4; i++) { vx += (rnd() - 0.5) * 14; vy += TILE / 4; ctx.lineTo(vx, vy); }
    ctx.stroke();
  }
  ctx.fillStyle = t.grout;
  if (x % 2 === 0) ctx.fillRect(px, py, 0.8, TILE);
  if (y % 2 === 0) ctx.fillRect(px, py, TILE, 0.8);
  if (x % 2 === 0 && y % 2 === 0) { ctx.fillStyle = 'rgba(229,181,74,0.55)'; ctx.beginPath(); ctx.moveTo(px, py - 2); ctx.lineTo(px + 2, py); ctx.lineTo(px, py + 2); ctx.lineTo(px - 2, py); ctx.fill(); }
}

function carpet(ctx: CanvasRenderingContext2D, x: number, y: number, t: Theme, ch: Ch, self: string): void {
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = t.carpet; ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(px + 8 + i * 16, py + 12 + j * 16, 8, Math.PI, 0); ctx.stroke(); }
  ctx.fillStyle = t.carpetEdge;
  const e = 2.5;
  if (ch(x, y - 1) !== self) ctx.fillRect(px, py, TILE, e);
  if (ch(x, y + 1) !== self) ctx.fillRect(px, py + TILE - e, TILE, e);
  if (ch(x - 1, y) !== self) ctx.fillRect(px, py, e, TILE);
  if (ch(x + 1, y) !== self) ctx.fillRect(px + TILE - e, py, e, TILE);
}

function casinoCarpet(ctx: CanvasRenderingContext2D, x: number, y: number, ch: Ch): void {
  // Moquette de casino à motif répété sur 2 × 2 tuiles : treillis de losanges dorés, rosaces bordeaux,
  // perles aux croisements, fond pétrole légèrement chiné (pré-rendu une fois avec l'étage).
  const px = x * TILE, py = y * TILE, S = TILE * 2;
  const ox = px - (x % 2) * TILE, oy = py - (y % 2) * TILE;
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.fillStyle = '#0a3a47'; ctx.fillRect(px, py, TILE, TILE);
  // Chiné : petits points déterministes
  for (let i = 0; i < 10; i++) {
    const h = ((x * 73856093) ^ (y * 19349663) ^ (i * 83492791)) >>> 0;
    ctx.fillStyle = h % 3 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(px + (h % 31), py + ((h >>> 5) % 31), 1, 1);
  }
  // Losange central (rempli d'un pétrole plus profond) et son double filet
  ctx.beginPath(); ctx.moveTo(ox + S / 2, oy + 3); ctx.lineTo(ox + S - 3, oy + S / 2); ctx.lineTo(ox + S / 2, oy + S - 3); ctx.lineTo(ox + 3, oy + S / 2); ctx.closePath();
  ctx.fillStyle = '#083240'; ctx.fill();
  ctx.strokeStyle = 'rgba(229,181,74,0.34)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox + S / 2, oy + 9); ctx.lineTo(ox + S - 9, oy + S / 2); ctx.lineTo(ox + S / 2, oy + S - 9); ctx.lineTo(ox + 9, oy + S / 2); ctx.closePath();
  ctx.strokeStyle = 'rgba(160,40,70,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
  // Rosace au centre du losange
  const cx = ox + S / 2, cy = oy + S / 2;
  ctx.fillStyle = 'rgba(122,31,51,0.85)';
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4.2, 2.2, a, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(229,181,74,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(229,181,74,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
  // Perles aux croisements du treillis (coins de la cellule)
  for (const [qx, qy] of [[ox, oy], [ox + S, oy], [ox, oy + S], [ox + S, oy + S]]) {
    ctx.fillStyle = 'rgba(239,220,174,0.55)'; ctx.beginPath(); ctx.arc(qx, qy, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(111,243,255,0.18)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(qx, qy, 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // Bordure dorée de la moquette (double filet)
  const edge = (cond: boolean, fx: number, fy: number, fw: number, fh: number, ix: number, iy: number, iw: number, ih: number) => {
    if (!cond) return;
    ctx.fillStyle = '#e5b54a'; ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = 'rgba(229,181,74,0.45)'; ctx.fillRect(ix, iy, iw, ih);
  };
  edge(ch(x, y - 1) !== 'r' && !isSolidChar(ch(x, y - 1)), px, py, TILE, 2, px, py + 4, TILE, 0.8);
  edge(ch(x, y + 1) !== 'r' && !isSolidChar(ch(x, y + 1)), px, py + TILE - 2, TILE, 2, px, py + TILE - 4.8, TILE, 0.8);
  edge(ch(x - 1, y) !== 'r' && !isSolidChar(ch(x - 1, y)), px, py, 2, TILE, px + 4, py, 0.8, TILE);
  edge(ch(x + 1, y) !== 'r' && !isSolidChar(ch(x + 1, y)), px + TILE - 2, py, 2, TILE, px + TILE - 4.8, py, 0.8, TILE);
}

function neonFloor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = (x + y) % 2 ? '#16112b' : '#130e26'; ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = 'rgba(111,243,255,0.16)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  // Triangles et éclats géométriques, motif régulier
  const k = (x * 7 + y * 13) % 7;
  if (k === 0) { ctx.fillStyle = 'rgba(255,63,164,0.18)'; ctx.beginPath(); ctx.moveTo(px + 8, py + 22); ctx.lineTo(px + 16, py + 10); ctx.lineTo(px + 24, py + 22); ctx.fill(); }
  if (k === 2) { ctx.strokeStyle = 'rgba(123,77,255,0.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 6, py + 16); for (let i = 0; i < 4; i++) ctx.lineTo(px + 10 + i * 5, py + 16 + (i % 2 ? -4 : 4)); ctx.stroke(); }
  if (k === 4) { ctx.strokeStyle = 'rgba(111,243,255,0.2)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px + 16, py + 16, 5, 0, Math.PI * 2); ctx.stroke(); }
}

function deck(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: () => number): void {
  const px = x * TILE, py = y * TILE;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = ['#b98352', '#b07a45', '#bf8a58', '#a97441'][(i + x * 3 + y) % 4];
    ctx.fillRect(px, py + i * 8, TILE, 8);
    ctx.fillStyle = 'rgba(60,35,15,0.45)'; ctx.fillRect(px, py + i * 8 + 7.2, TILE, 0.8);
    if ((x + i * 3 + y) % 5 === 0) ctx.fillRect(px + (rnd() * 20 + 4), py + i * 8, 0.8, 7.2);
  }
}

function poolEdge(ctx: CanvasRenderingContext2D, x: number, y: number, ch: Ch): void {
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = '#f2efe8'; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#d8d2c6'; ctx.fillRect(px, py, TILE, 0.8); ctx.fillRect(px, py, 0.8, TILE);
  ctx.fillStyle = 'rgba(31,199,193,0.55)';
  if (ch(x, y + 1) === 'p') ctx.fillRect(px, py + TILE - 3, TILE, 3);
  if (ch(x, y - 1) === 'p') ctx.fillRect(px, py, TILE, 2);
  if (ch(x + 1, y) === 'p') ctx.fillRect(px + TILE - 3, py, 3, TILE);
  if (ch(x - 1, y) === 'p') ctx.fillRect(px, py, 3, TILE);
}

function danceFloorBase(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#120a22'; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#1d1238'; ctx.fillRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px + 3, py + 3, TILE - 6, 3);
}

function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, ch: Ch): void {
  const px = x * TILE, py = y * TILE;
  const g = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
  g.addColorStop(0, '#2bd0e0'); g.addColorStop(1, '#1597c4');
  ctx.fillStyle = g; ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.8; ctx.strokeRect(px + 0.4, py + 0.4, TILE - 0.8, TILE - 0.8);
  // Ombre de la margelle nord
  if (ch(x, y - 1) !== 'p') { ctx.fillStyle = 'rgba(5,60,90,0.35)'; ctx.fillRect(px, py, TILE, 7); }
}

function engineFloor(ctx: CanvasRenderingContext2D, c: string, px: number, py: number, t: Theme, rnd: () => number): void {
  if (c === 'y') {
    ctx.fillStyle = '#1c1f22'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#f2b632';
    for (let i = -TILE; i < TILE; i += 12) { ctx.beginPath(); ctx.moveTo(px + i, py + TILE); ctx.lineTo(px + i + 6, py + TILE); ctx.lineTo(px + i + 6 + TILE, py); ctx.lineTo(px + i + TILE, py); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, py, TILE, 2);
    return;
  }
  if (c === 'm') {
    ctx.fillStyle = '#4d5964'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#5f6c78';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.save(); ctx.translate(px + 4 + i * 8, py + 4 + j * 8); ctx.rotate((i + j) % 2 ? 0.6 : -0.6); ctx.fillRect(-3, -1, 6, 2); ctx.restore();
    }
    ctx.strokeStyle = '#2e363e'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    return;
  }
  ctx.fillStyle = t.floorB; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#11161b';
  for (let i = 2; i < TILE; i += 5) ctx.fillRect(px + i, py + 1, 2, TILE - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(px, py, TILE, 1);
  if (rnd() < 0.08) { ctx.fillStyle = 'rgba(60,45,30,0.5)'; ctx.beginPath(); ctx.ellipse(px + rnd() * TILE, py + rnd() * TILE, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
}

// =====================================================================================  Murs

function drawWallFace(ctx: CanvasRenderingContext2D, px: number, py: number, t: Theme, x: number): void {
  ctx.fillStyle = t.wallFace; ctx.fillRect(px, py, TILE, TILE);
  switch (t.wallStyle) {
    case 'industrial':
      ctx.fillStyle = t.wallLow; ctx.fillRect(px, py + 18, TILE, 14);
      ctx.fillStyle = '#4a5560'; ctx.fillRect(px + 2, py + 4, 2, 2); ctx.fillRect(px + TILE - 4, py + 4, 2, 2);
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + 17, TILE, 1.5);
      break;
    case 'casino':
      ctx.fillStyle = t.wallLow; ctx.fillRect(px, py + 18, TILE, 14);
      ctx.strokeStyle = 'rgba(229,181,74,0.75)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px + 4, py + TILE); ctx.lineTo(px + 4, py + 10); ctx.arc(px + 16, py + 10, 12, Math.PI, 0); ctx.lineTo(px + 28, py + TILE); ctx.stroke();
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + TILE - 2, TILE, 2);
      break;
    case 'neon': {
      ctx.fillStyle = t.wallLow; ctx.fillRect(px, py + 18, TILE, 14);
      const col = x % 3 === 0 ? '#6ff3ff' : x % 3 === 1 ? '#ff3fa4' : '#7b4dff';
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fillRect(px, py + 16, TILE, 2); ctx.globalAlpha = 0.25; ctx.fillRect(px, py + 12, TILE, 10); ctx.globalAlpha = 1;
      break;
    }
    case 'cabin':
      ctx.fillStyle = t.wallLow; ctx.fillRect(px, py + 16, TILE, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 4; i < TILE; i += 8) ctx.fillRect(px + i, py + 17, 1, 15);
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + 15, TILE, 2);
      break;
    case 'deck':
      ctx.fillStyle = t.wallLow; ctx.fillRect(px, py + 20, TILE, 12);
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + 18, TILE, 2);
      break;
    default:
      ctx.fillStyle = t.wallLow; ctx.fillRect(px, py + 16, TILE, 16);
      ctx.strokeStyle = 'rgba(229,181,74,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(px + 4, py + 19, TILE - 8, 10);
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + 15, TILE, 2); ctx.fillRect(px, py + TILE - 2, TILE, 2);
  }
}

function drawWallUpper(ctx: CanvasRenderingContext2D, px: number, py: number, t: Theme, x: number): void {
  ctx.fillStyle = t.wallFace; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = t.wallTop; ctx.fillRect(px, py, TILE, 6);
  switch (t.wallStyle) {
    case 'industrial':
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, py + 6, TILE, 2);
      ctx.fillStyle = '#3c4752'; ctx.fillRect(px + (px % 64 === 0 ? 6 : 20), py + 10, 6, 14);
      break;
    case 'casino':
      ctx.fillStyle = PAL.gold; ctx.fillRect(px, py + 6, TILE, 1.5);
      ctx.fillStyle = 'rgba(229,181,74,0.5)'; ctx.beginPath(); ctx.arc(px + 16, py + 20, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'neon': {
      const col = x % 2 ? 'rgba(111,243,255,0.5)' : 'rgba(255,63,164,0.5)';
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py + 26); ctx.lineTo(px + 16, py + 12); ctx.lineTo(px + TILE, py + 26); ctx.stroke();
      break;
    }
    case 'cabin':
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + 6, TILE, 1.5);
      ctx.strokeStyle = 'rgba(36,73,111,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= TILE; i += 2) ctx.lineTo(px + i, py + 20 + Math.sin((px + i) / 6) * 2); ctx.stroke();
      break;
    case 'deck':
      ctx.fillStyle = t.wallTrim; ctx.fillRect(px, py + 6, TILE, 1.5);
      break;
    default:
      ctx.strokeStyle = 'rgba(111,243,255,0.25)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= TILE; i += 2) ctx.lineTo(px + i, py + 18 + Math.sin((px + i) / 6) * 2.4);
      ctx.stroke();
      ctx.fillStyle = PAL.gold; ctx.fillRect(px, py + 6, TILE, 1.5);
  }
}

function drawWallCap(ctx: CanvasRenderingContext2D, px: number, py: number, t: Theme, x: number, y: number, ch: Ch): void {
  ctx.fillStyle = t.wallTop; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
  ctx.fillStyle = t.wallTrim;
  if (!isSolidChar(ch(x + 1, y))) ctx.fillRect(px + TILE - 2, py, 2, TILE);
  if (!isSolidChar(ch(x - 1, y))) ctx.fillRect(px, py, 2, TILE);
  if (!isSolidChar(ch(x, y - 1)) && ch(x, y - 1) !== undefined) ctx.fillRect(px, py, TILE, 2);
}

function drawWindow(ctx: CanvasRenderingContext2D, px: number, py: number, lower: boolean): void {
  const g = ctx.createLinearGradient(0, py - (lower ? TILE : 0), 0, py + (lower ? TILE : TILE * 2));
  g.addColorStop(0, '#7cc8f0'); g.addColorStop(0.42, '#bfe8f7'); g.addColorStop(0.46, '#1f7fbf'); g.addColorStop(1, '#0a4a86');
  ctx.fillStyle = g; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = PAL.gold;
  if (!lower) ctx.fillRect(px, py, TILE, 3); else ctx.fillRect(px, py + TILE - 4, TILE, 4);
  ctx.fillStyle = '#0d2b4f'; ctx.fillRect(px, py, 1.5, TILE); ctx.fillRect(px + TILE - 1.5, py, 1.5, TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(px + 6, py + (lower ? 0 : 6)); ctx.lineTo(px + 12, py + (lower ? 0 : 6)); ctx.lineTo(px + 4, py + (lower ? 20 : TILE)); ctx.lineTo(px - 2, py + (lower ? 20 : TILE)); ctx.fill();
}

/** Garde-corps vitré du rooftop : l'océan à perte de vue derrière la vitre. */
function drawRailing(ctx: CanvasRenderingContext2D, x: number, y: number, isFace: boolean, isUpper: boolean, ch: Ch): void {
  const px = x * TILE, py = y * TILE;
  if (isUpper || isFace) {
    // Bord nord : ciel (rangée haute) puis mer (rangée basse)
    const g = ctx.createLinearGradient(0, py - (isFace ? TILE : 0), 0, py + (isFace ? TILE : TILE * 2));
    g.addColorStop(0, '#9fd9f5'); g.addColorStop(0.4, '#d9f1fb'); g.addColorStop(0.44, '#2b8fcf'); g.addColorStop(1, '#0d5c99');
    ctx.fillStyle = g; ctx.fillRect(px, py, TILE, TILE);
  } else {
    // Côtés et bord sud : mer vue d'en haut
    ctx.fillStyle = (x + y) % 2 ? '#0d5c99' : '#0f62a2'; ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = 'rgba(200,240,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 4, py + 10 + (x % 3) * 5); ctx.lineTo(px + 14, py + 10 + (x % 3) * 5); ctx.stroke();
  }
  // Vitre + main courante dorée côté pont
  const walk = (cx: number, cy: number) => !isSolidChar(ch(cx, cy));
  ctx.fillStyle = 'rgba(210,245,255,0.28)';
  ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2.2;
  if (isFace) { ctx.fillRect(px, py + TILE - 14, TILE, 12); ctx.beginPath(); ctx.moveTo(px, py + TILE - 14); ctx.lineTo(px + TILE, py + TILE - 14); ctx.stroke(); }
  if (walk(x + 1, y)) { ctx.fillRect(px + TILE - 6, py, 6, TILE); ctx.beginPath(); ctx.moveTo(px + TILE - 6, py); ctx.lineTo(px + TILE - 6, py + TILE); ctx.stroke(); }
  if (walk(x - 1, y)) { ctx.fillRect(px, py, 6, TILE); ctx.beginPath(); ctx.moveTo(px + 6, py); ctx.lineTo(px + 6, py + TILE); ctx.stroke(); }
  if (walk(x, y - 1)) { ctx.fillRect(px, py, TILE, 6); ctx.beginPath(); ctx.moveTo(px, py + 6); ctx.lineTo(px + TILE, py + 6); ctx.stroke(); }
}

function mergeRegions(ws: Region[]): Region[] {
  const sorted = [...ws].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Region[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && last.y === w.y && last.x + last.w === w.x) last.w += w.w; else out.push({ ...w });
  }
  return out;
}

function drawFloorMedallion(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string): void {
  ctx.save(); ctx.translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate((i * Math.PI) / 4);
    const len = i % 2 === 0 ? 58 : 40;
    ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(7, 0); ctx.lineTo(-7, 0); ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(229,181,74,0.95)' : 'rgba(31,199,193,0.85)'; ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = PAL.navy; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(229,181,74,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '900 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = PAL.pearl; ctx.fillText(label, 0, 1);
  ctx.restore();
}

// =====================================================================================  Cache

let MAX_CACHED = 3;
/** Nombre d'étages gardés en mémoire (2 sur les appareils modestes). */
export function setLayerCacheSize(n: number): void { MAX_CACHED = Math.max(1, n); while (layerCache.size > MAX_CACHED) layerCache.delete(layerCache.keys().next().value as string); }
const layerCache = new Map<string, StaticLayer>();

/** Couche statique d'un étage, mise en cache (les 3 derniers étages visités). */
export function getStaticLayer(floor: FloorDef): StaticLayer {
  const key = `${floor.id}:${floor.themeVariant ?? ''}`;
  let l = layerCache.get(key);
  if (l) { layerCache.delete(key); layerCache.set(key, l); return l; }
  l = renderStaticLayer(floor);
  layerCache.set(key, l);
  while (layerCache.size > MAX_CACHED) layerCache.delete(layerCache.keys().next().value as string);
  return l;
}

/** Mémoire des couches d'étage en cache (diagnostic). */
export function layerStats(): { count: number; bytes: number } {
  let bytes = 0;
  for (const l of layerCache.values()) bytes += l.canvas.width * l.canvas.height * 4;
  return { count: layerCache.size, bytes };
}

/** Tuiles animées (eau, piste de danse) pour la surcouche dynamique. */
export function findTiles(floor: FloorDef, chars: string): Array<{ x: number; y: number; c: string }> {
  const out: Array<{ x: number; y: number; c: string }> = [];
  floor.map?.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (chars.includes(row[x])) out.push({ x, y, c: row[x] }); });
  return out;
}
