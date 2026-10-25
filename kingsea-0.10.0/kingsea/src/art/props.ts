// Accessoires du décor : image statique mise en cache + surcouche animée éventuelle.
import { TILE, type PropDef, type PropKind } from '../world/types';
import { ART_SCALE, makeCanvas, roundRect, Textures, type AnyCanvas } from './canvas';
import { PAL } from './palette';
import { drawOverlay2, drawStatic2, EXTRA_TOP_2, OVERLAY_2, variantOf } from './props2';
import { drawFurniture, furnitureExtraTop } from './furniture';
import { FURNITURE_BY_ID } from '../data/furniture';
import { drawOverlay4, drawStatic4, EXTRA_TOP_4, OVERLAY_4 } from './props4';
import { drawOverlay3, drawStatic3, EXTRA_TOP_3, OVERLAY_3, WALL_PROPS_3 } from './props3';
import { drawOverlay5, drawStatic5, EXTRA_TOP_5, OVERLAY_5 } from './props5';

export interface PropVisual { img: AnyCanvas; ox: number; oy: number; w: number; h: number }

/** Accessoires fixés au mur (dessinés avant les entités triées en profondeur). */
export const WALL_PROPS = new Set<PropKind>(['elevator', 'backbar', 'pipesWall', 'controlPanel', 'fan', 'floorSign', 'lamp', 'gangway',
  'stairsUp', 'stairsDown', 'casinoSign', 'neonSign', 'cabinDoor', 'porthole', 'lifebuoy', 'rug', 'cabinExit', 'rugFurniture', 'wallFurniture', ...WALL_PROPS_3]);
/** Accessoires représentés par un personnage (pas d'image). */
export const CHARACTER_PROPS = new Set<PropKind>(['bartender', 'receptionist', 'croupier', 'attendant', 'cook', 'dj']);

/** Espace supplémentaire au-dessus de l'emprise (en tuiles), pour les objets hauts. */
const EXTRA_TOP: Partial<Record<PropKind, number>> = {
  barCounter: 0.7, reception: 0.7, sofa: 0.9, plant: 1.3, column: 2.2, engine: 1.2, generator: 0.6, desk: 0.5, crate: 0.4, valve: 0.6, stool: 0.3, coffeeTable: 0.2, logbook: 0.6, compass: 0.2,
};

export function getPropVisual(p: PropDef): PropVisual | null {
  if (CHARACTER_PROPS.has(p.kind)) return null;
  if (p.kind === 'furniture' || p.kind === 'rugFurniture' || p.kind === 'wallFurniture') return furnitureVisual(p);
  const extra = EXTRA_TOP[p.kind] ?? EXTRA_TOP_2[p.kind] ?? EXTRA_TOP_3[p.kind] ?? EXTRA_TOP_4[p.kind] ?? EXTRA_TOP_5[p.kind] ?? 0;
  const w = p.w * TILE, h = (p.h + extra) * TILE;
  const variant = variantOf(p);
  const img = Textures.getOrCreate(`prop:${p.kind}:${p.w}x${p.h}:${variant}`, () => {
    const { canvas, ctx } = makeCanvas(w * ART_SCALE, h * ART_SCALE);
    ctx.scale(ART_SCALE, ART_SCALE);
    ctx.translate(0, extra * TILE); // origine = coin haut-gauche de l'emprise
    if (!drawStatic2(ctx, p.kind, p.w * TILE, p.h * TILE, variant) && !drawStatic3(ctx, p.kind, p.w * TILE, p.h * TILE, variant) && !drawStatic4(ctx, p.kind, p.w * TILE, p.h * TILE) && !drawStatic5(ctx, p.kind, p.w * TILE, p.h * TILE)) drawStatic(ctx, p.kind, p.w * TILE, p.h * TILE);
    return canvas;
  });
  return { img, ox: 0, oy: -extra * TILE, w, h };
}

/** Meuble de cabine : dessiné à partir du catalogue (identifiant « objet|rotation »). */
function furnitureVisual(p: PropDef): PropVisual | null {
  const [item, r] = (p.id ?? '').split('|');
  const f = FURNITURE_BY_ID.get(item);
  if (!f) return null;
  const rot: 0 | 1 = r === '1' ? 1 : 0;
  const extra = furnitureExtraTop(f);
  const w = p.w * TILE, h = (p.h + extra) * TILE;
  const img = Textures.getOrCreate(`furn:${f.id}:${p.w}x${p.h}:${rot}`, () => {
    const { canvas, ctx } = makeCanvas(w * ART_SCALE, h * ART_SCALE);
    ctx.scale(ART_SCALE, ART_SCALE);
    ctx.translate(0, extra * TILE);
    drawFurniture(ctx, f, p.w * TILE, p.h * TILE, rot);
    return canvas;
  });
  return { img, ox: 0, oy: -extra * TILE, w, h };
}

function lg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.18), 0, 0, Math.PI * 2); ctx.fill();
}

function drawStatic(ctx: CanvasRenderingContext2D, kind: PropKind, w: number, h: number): void {
  switch (kind) {
    case 'elevator': {
      // Encadrement doré, intérieur sombre (les portes sont animées dans la surcouche)
      ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, '#0b2240'], [1, '#14365f']]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = lg(ctx, 0, 0, w, 0, [[0, PAL.goldDark], [0.5, PAL.goldLight], [1, PAL.goldDark]]);
      ctx.fillRect(10, 12, w - 20, h - 12);
      ctx.fillStyle = '#0a1830'; ctx.fillRect(14, 16, w - 28, h - 16);
      // Arche & indicateur
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.ellipse(w / 2, 13, w / 2 - 10, 9, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#081426'; roundRect(ctx, w / 2 - 20, 2, 40, 10, 3); ctx.fill();
      // Boutons d'appel
      ctx.fillStyle = PAL.goldLight; roundRect(ctx, w - 9, 30, 6, 14, 2); ctx.fill();
      ctx.fillStyle = PAL.cyan; ctx.beginPath(); ctx.arc(w - 6, 34, 1.6, 0, Math.PI * 2); ctx.arc(w - 6, 40, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'backbar': {
      ctx.fillStyle = lg(ctx, 0, 0, 0, h, [[0, '#2a1a12'], [1, '#4a2e1c']]); ctx.fillRect(2, 4, w - 4, h - 4);
      ctx.fillStyle = 'rgba(140,220,255,0.18)'; ctx.fillRect(8, 8, w - 16, h - 22); // miroir
      const colors = ['#1fc7c1', '#e5b54a', '#ff6fae', '#7bd389', '#8fb6ff', '#ffb062', '#c38bff'];
      for (let shelf = 0; shelf < 2; shelf++) {
        const sy = 26 + shelf * 18;
        ctx.fillStyle = PAL.goldDark; ctx.fillRect(6, sy, w - 12, 2.5);
        for (let i = 0; i < Math.floor((w - 16) / 9); i++) {
          const bx = 9 + i * 9, c = colors[(i * 3 + shelf * 2) % colors.length];
          const bh = 9 + ((i + shelf) % 3) * 2;
          ctx.fillStyle = c; roundRect(ctx, bx, sy - bh, 5, bh, 1.5); ctx.fill();
          ctx.fillRect(bx + 1.5, sy - bh - 3, 2, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(bx + 1, sy - bh + 2, 1, bh - 4);
        }
      }
      // Enseigne néon « BAR »
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = PAL.cyan; ctx.shadowBlur = 8; ctx.fillStyle = '#c9fbff'; ctx.fillText('BAR KS', w / 2, 12); ctx.shadowBlur = 0;
      break;
    }
    case 'barCounter':
    case 'reception': {
      const isBar = kind === 'barCounter';
      const top = -TILE * 0.55;
      shadow(ctx, 0, 0, w, h);
      // Façade
      ctx.fillStyle = isBar ? lg(ctx, 0, 0, 0, h, [[0, '#123a68'], [1, '#0b2546']]) : lg(ctx, 0, 0, 0, h, [[0, '#f8f4ec'], [1, '#ddd3c2']]);
      ctx.fillRect(0, top + 8, w, h - top - 8);
      // Plateau marbre
      ctx.fillStyle = isBar ? '#e9e3d8' : '#123a68';
      roundRect(ctx, -1, top, w + 2, 11, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(2, top + 2, w - 4, 2);
      // Filet doré + vagues
      ctx.fillStyle = PAL.gold; ctx.fillRect(0, top + 11, w, 2); ctx.fillRect(0, h - 3, w, 2);
      ctx.strokeStyle = isBar ? 'rgba(31,199,193,0.6)' : 'rgba(18,58,104,0.35)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let x = 4; x < w - 4; x += 2) ctx.lineTo(x, top + 22 + Math.sin(x / 5) * 2.2);
      ctx.stroke();
      if (isBar) {
        // Verres & shaker sur le comptoir
        ctx.fillStyle = 'rgba(200,240,255,0.8)'; roundRect(ctx, 14, top - 7, 5, 8, 1); ctx.fill(); roundRect(ctx, w - 26, top - 6, 5, 7, 1); ctx.fill();
        ctx.fillStyle = '#c9ccd3'; roundRect(ctx, w / 2 - 3, top - 11, 6, 12, 2); ctx.fill();
      } else {
        // Plaque KS, cloche, lampe
        ctx.fillStyle = PAL.gold; roundRect(ctx, w / 2 - 14, top + 16, 28, 11, 2); ctx.fill();
        ctx.fillStyle = PAL.navy; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', w / 2, top + 22);
        ctx.fillStyle = PAL.goldLight; ctx.beginPath(); ctx.arc(30, top + 1, 4, Math.PI, 0); ctx.fill(); ctx.fillRect(25, top + 1, 10, 1.5);
        ctx.fillStyle = '#efe7d6'; ctx.beginPath(); ctx.moveTo(w - 28, top - 12); ctx.lineTo(w - 18, top - 12); ctx.lineTo(w - 15, top - 4); ctx.lineTo(w - 31, top - 4); ctx.fill();
        ctx.fillStyle = PAL.gold; ctx.fillRect(w - 24, top - 4, 2, 5);
      }
      break;
    }
    case 'stool': {
      shadow(ctx, 8, 14, 16, 14);
      ctx.fillStyle = PAL.gold; ctx.fillRect(15, 8, 2, 18);
      ctx.fillStyle = PAL.goldDark; ctx.beginPath(); ctx.ellipse(16, 26, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1fc7c1'; ctx.beginPath(); ctx.ellipse(16, 7, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#17a19c'; ctx.fillRect(8, 7, 16, 3);
      break;
    }
    case 'sofa': {
      shadow(ctx, 0, 4, w, h - 4);
      const back = -TILE * 0.85;
      ctx.fillStyle = '#137d8a'; roundRect(ctx, 2, back, w - 4, 20, 7); ctx.fill();
      ctx.fillStyle = '#1aa3a8'; roundRect(ctx, 0, back + 14, w, h - back - 16, 6); ctx.fill();
      ctx.fillStyle = '#21bfc2';
      for (let i = 0; i < 3; i++) { roundRect(ctx, 6 + i * (w - 12) / 3, back + 16, (w - 12) / 3 - 3, 14, 4); ctx.fill(); }
      ctx.fillStyle = '#0f6c75'; roundRect(ctx, -2, back + 10, 9, h - back - 12, 4); ctx.fill(); roundRect(ctx, w - 7, back + 10, 9, h - back - 12, 4); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.fillRect(4, h - 3, 3, 3); ctx.fillRect(w - 7, h - 3, 3, 3);
      break;
    }
    case 'coffeeTable': {
      shadow(ctx, 6, 4, w - 12, h - 6);
      ctx.fillStyle = PAL.gold; ctx.fillRect(14, 12, 2, 16); ctx.fillRect(w - 16, 12, 2, 16);
      ctx.fillStyle = 'rgba(170,230,255,0.55)'; ctx.beginPath(); ctx.ellipse(w / 2, 10, w / 2 - 4, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#f4efe6'; ctx.save(); ctx.translate(w / 2 - 8, 6); ctx.rotate(-0.2); ctx.fillRect(0, 0, 12, 8); ctx.fillStyle = PAL.ocean; ctx.fillRect(1, 1, 10, 3); ctx.restore();
      break;
    }
    case 'plant': {
      shadow(ctx, 4, 16, 24, 14);
      ctx.fillStyle = lg(ctx, 8, 0, 24, 0, [[0, PAL.goldDark], [0.5, PAL.goldLight], [1, PAL.goldDark]]);
      ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(24, 12); ctx.lineTo(22, 30); ctx.lineTo(10, 30); ctx.closePath(); ctx.fill();
      const leaf = (a: number, len: number, col: string) => {
        ctx.save(); ctx.translate(16, 12); ctx.rotate(a);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -7, len, 0); ctx.quadraticCurveTo(len * 0.5, 5, 0, 0); ctx.fill(); ctx.restore();
      };
      for (let i = 0; i < 9; i++) leaf(-Math.PI + (i / 8) * Math.PI + (i % 2 ? 0.1 : -0.1), 18 + (i % 3) * 5, i % 2 ? '#2f9e6b' : '#3dbb7e');
      leaf(-Math.PI / 2, 26, '#45c98a');
      break;
    }
    case 'column': {
      shadow(ctx, 2, 18, 28, 12);
      const top = -TILE * 2.2;
      ctx.fillStyle = lg(ctx, 4, 0, 28, 0, [[0, '#d8cfbf'], [0.4, '#fbf8f2'], [1, '#c9bfae']]);
      ctx.fillRect(6, top + 8, 20, h - top - 12);
      ctx.fillStyle = PAL.gold; ctx.fillRect(3, top, 26, 8); ctx.fillRect(3, h - 6, 26, 6);
      ctx.fillStyle = PAL.goldLight; ctx.fillRect(3, top, 26, 2);
      ctx.strokeStyle = 'rgba(160,150,135,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(11 + i * 5, top + 10); ctx.lineTo(11 + i * 5, h - 8); ctx.stroke(); }
      break;
    }
    case 'floorSign': {
      ctx.fillStyle = '#081a33'; roundRect(ctx, 3, 3, w - 6, h - 6, 3); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.font = 'bold 4.6px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const lines: Array<[string, string]> = [['4', 'Rooftop'], ['3', 'Logements'], ['2', 'Arcade'], ['1', 'Casino'], ['0', 'Hall'], ['-1', 'Machines']];
      lines.forEach(([n, l], i) => {
        const y = 7 + i * 3.8;
        ctx.fillStyle = PAL.gold; ctx.fillText(n, 7, y); ctx.fillStyle = PAL.pearl; ctx.fillText(l, 15, y);
      });
      break;
    }
    case 'lamp': {
      ctx.fillStyle = PAL.goldDark; ctx.fillRect(w / 2 - 1, 10, 2, 10);
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.moveTo(w / 2 - 7, 8); ctx.lineTo(w / 2 + 7, 8); ctx.lineTo(w / 2 + 4, 0); ctx.lineTo(w / 2 - 4, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,154,0.35)'; ctx.beginPath(); ctx.arc(w / 2, 8, 9, 0, Math.PI); ctx.fill();
      break;
    }
    case 'gangway': {
      ctx.fillStyle = 'rgba(140,210,255,0.35)'; ctx.fillRect(4, 4, w - 8, h - 6);
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.strokeRect(4, 4, w - 8, h - 6);
      ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w / 2, h - 2); ctx.stroke();
      ctx.font = 'bold 5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = PAL.pearl; ctx.fillText('PASSERELLE', w / 2, 16);
      break;
    }
    case 'engine': {
      const top = -TILE * 1.2;
      shadow(ctx, 0, 6, w, h - 6);
      // Socle
      ctx.fillStyle = '#20272e'; ctx.fillRect(0, h - 22, w, 22);
      ctx.fillStyle = '#f2b632';
      for (let x = 0; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 6, h); ctx.lineTo(x + 12, h - 6); ctx.lineTo(x + 6, h - 6); ctx.fill(); }
      // Bloc moteur
      ctx.fillStyle = lg(ctx, 0, top, 0, h - 20, [[0, '#7c8a96'], [0.5, '#56636f'], [1, '#3b4651']]);
      roundRect(ctx, 8, top + 14, w - 16, h - top - 36, 10); ctx.fill();
      // Cylindres
      const n = 5, cw = (w - 40) / n;
      for (let i = 0; i < n; i++) {
        const cx = 20 + i * cw;
        ctx.fillStyle = lg(ctx, cx, 0, cx + cw - 6, 0, [[0, '#4a5560'], [0.5, '#9aa8b4'], [1, '#4a5560']]);
        roundRect(ctx, cx, top, cw - 6, 34, 4); ctx.fill();
        ctx.fillStyle = '#2b333b'; ctx.fillRect(cx, top + 6, cw - 6, 2); ctx.fillRect(cx, top + 14, cw - 6, 2);
      }
      // Tuyau d'échappement et jauges
      ctx.strokeStyle = '#a4542f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w - 10, top + 40); ctx.quadraticCurveTo(w + 2, top + 20, w - 6, top - 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const gx = 30 + i * 40, gy = top + 62;
        ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(gx, gy, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2b333b'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = PAL.gold; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KS-MARINE V12', w / 2, top + 88);
      break;
    }
    case 'generator': {
      const top = -TILE * 0.6;
      shadow(ctx, 0, 8, w, h - 8);
      ctx.fillStyle = lg(ctx, 0, top, 0, h, [[0, '#3f6b54'], [1, '#2a4a3a']]); roundRect(ctx, 2, top + 4, w - 4, h - top - 6, 5); ctx.fill();
      ctx.fillStyle = '#1b2e25';
      for (let i = 0; i < 6; i++) ctx.fillRect(10, top + 14 + i * 5, w - 40, 2);
      ctx.fillStyle = '#c9d3cc'; roundRect(ctx, w - 26, top + 12, 18, 14, 2); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.font = 'bold 6px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('GEN', w - 24, top + 34);
      break;
    }
    case 'pipesWall': {
      const pipe = (y: number, r: number, col: string) => {
        ctx.fillStyle = lg(ctx, 0, y - r, 0, y + r, [[0, col], [0.4, '#d8dee4'], [1, col]]);
        ctx.fillRect(0, y - r, w, r * 2);
        ctx.fillStyle = '#2b333b';
        for (let x = 20; x < w; x += 48) ctx.fillRect(x, y - r - 1, 4, r * 2 + 2);
      };
      pipe(22, 5, '#6b7883'); pipe(38, 3.5, '#8a5a3a'); pipe(50, 4, '#4f6c86');
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(w * 0.6, 22, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2b632'; ctx.font = 'bold 5px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('VAPEUR', 6, 31);
      break;
    }
    case 'controlPanel': {
      ctx.fillStyle = '#1b232b'; roundRect(ctx, 2, 6, w - 4, h - 6, 4); ctx.fill();
      ctx.strokeStyle = '#6d7a86'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#071b14'; roundRect(ctx, 8, 12, w - 16, 18, 2); ctx.fill();
      ctx.fillStyle = '#2b333b'; ctx.fillRect(8, 36, w - 16, 18);
      ctx.fillStyle = '#f2b632'; ctx.font = 'bold 5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CONTRÔLE', w / 2, 10.5);
      break;
    }
    case 'fan': {
      ctx.fillStyle = '#1b232b'; ctx.beginPath(); ctx.arc(w / 2, h / 2 + 4, 24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6d7a86'; ctx.lineWidth = 3; ctx.stroke();
      break;
    }
    case 'desk': {
      const top = -TILE * 0.5;
      shadow(ctx, 0, 2, w, h - 2);
      ctx.fillStyle = '#5c6b78'; ctx.fillRect(2, top + 8, w - 4, h - top - 10);
      ctx.fillStyle = '#7f8f9c'; roundRect(ctx, 0, top, w, 10, 2); ctx.fill();
      ctx.fillStyle = '#3d4852'; ctx.fillRect(6, top + 14, 16, 3); ctx.fillRect(w - 22, top + 14, 16, 3);
      break;
    }
    case 'logbook': {
      ctx.save(); ctx.translate(18, -6); ctx.rotate(-0.12);
      ctx.fillStyle = '#7a2e1f'; roundRect(ctx, 0, 0, 22, 14, 2); ctx.fill();
      ctx.fillStyle = '#f2e6c9'; ctx.fillRect(2, 1.5, 18, 11);
      ctx.strokeStyle = '#7a2e1f'; ctx.beginPath(); ctx.moveTo(11, 1); ctx.lineTo(11, 13); ctx.stroke();
      ctx.fillStyle = '#5b6b78'; for (let i = 0; i < 4; i++) { ctx.fillRect(3.5, 4 + i * 2.2, 6, 0.7); ctx.fillRect(12.5, 4 + i * 2.2, 6, 0.7); }
      ctx.restore();
      ctx.fillStyle = '#e8c76a'; roundRect(ctx, 46, -10, 8, 14, 2); ctx.fill(); // lampe de bureau
      break;
    }
    case 'crate': {
      const top = -TILE * 0.4;
      shadow(ctx, 0, 4, w, h - 4);
      ctx.fillStyle = '#9b6b3c'; ctx.fillRect(1, top, w - 2, h - top);
      ctx.fillStyle = '#7a5230'; ctx.fillRect(1, top, w - 2, 4); ctx.fillRect(1, h - 4, w - 2, 4);
      ctx.strokeStyle = '#6a4526'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(3, top + 4); ctx.lineTo(w - 3, h - 4); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KS', w / 2, top + 14);
      break;
    }
    case 'valve': {
      shadow(ctx, 4, 12, 24, 16);
      ctx.fillStyle = '#6b7883'; ctx.fillRect(12, -10, 8, 38);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(16, -6, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -6); ctx.lineTo(25, -6); ctx.moveTo(16, -15); ctx.lineTo(16, 3); ctx.stroke();
      break;
    }
    case 'compass': {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(16, 24, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lg(ctx, 6, 6, 26, 26, [[0, PAL.goldLight], [1, PAL.goldDark]]);
      ctx.beginPath(); ctx.arc(16, 16, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.arc(16, 16, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(16, 10.5); ctx.lineTo(18, 16); ctx.lineTo(14, 16); ctx.fill();
      ctx.fillStyle = PAL.navy; ctx.beginPath(); ctx.moveTo(16, 21.5); ctx.lineTo(18, 16); ctx.lineTo(14, 16); ctx.fill();
      break;
    }
    default:
      break;
  }
}

export interface PropAnimState { t: number; elevatorOpen: number; panelOn: boolean; floorShort: string; lowFx: boolean; myCabin: string | null; beat: number }

/** Surcouches animées (dessinées chaque image, en unités monde, origine = coin haut-gauche de l'emprise). */
export function drawPropOverlay(ctx: CanvasRenderingContext2D, p: PropDef, s: PropAnimState): void {
  if (OVERLAY_2.has(p.kind)) { drawOverlay2(ctx, p, s); return; }
  if (OVERLAY_3.has(p.kind)) { drawOverlay3(ctx, p, s.t); return; }
  if (OVERLAY_4.has(p.kind)) { drawOverlay4(ctx, p, s.t, s.lowFx); return; }
  if (OVERLAY_5.has(p.kind)) { drawOverlay5(ctx, p, s.t, s.lowFx); return; }
  const w = p.w * TILE, h = p.h * TILE;
  switch (p.kind) {
    case 'elevator': {
      const open = s.elevatorOpen;
      const inner = { x: 14, y: 16, w: w - 28, h: h - 16 };
      const half = inner.w / 2, slide = half * open * 0.92;
      const door = lg(ctx, 0, inner.y, 0, inner.y + inner.h, [[0, '#cfd6de'], [0.5, '#9aa6b2'], [1, '#c0c8d1']]);
      ctx.fillStyle = door;
      ctx.fillRect(inner.x, inner.y, half - slide, inner.h);
      ctx.fillRect(inner.x + half + slide, inner.y, half - slide, inner.h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(inner.x + 3, inner.y, 2, inner.h);
      if (open < 0.05) { ctx.fillStyle = '#5b6672'; ctx.fillRect(inner.x + half - 0.5, inner.y, 1, inner.h); }
      // Emblème KS sur les portes
      if (open < 0.3) { ctx.fillStyle = 'rgba(229,181,74,0.8)'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', inner.x + half, inner.y + inner.h / 2); }
      // Afficheur d'étage
      ctx.fillStyle = PAL.cyan; ctx.font = 'bold 7px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.floorShort, w / 2, 7.5);
      break;
    }
    case 'controlPanel': {
      const on = s.panelOn;
      // Écran : courbe de régime
      ctx.save(); ctx.beginPath(); ctx.rect(8, 12, w - 16, 18); ctx.clip();
      ctx.strokeStyle = on ? '#ffd166' : '#3dffa8'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let x = 8; x < w - 8; x += 2) ctx.lineTo(x, 21 + Math.sin(x / 4 + s.t * (on ? 7 : 3)) * (on ? 6 : 3));
      ctx.stroke(); ctx.restore();
      // Voyants
      for (let i = 0; i < 6; i++) {
        const blink = Math.sin(s.t * (2 + i) + i * 1.7) > 0;
        ctx.fillStyle = blink ? ['#ff5c5c', '#3dffa8', '#ffd166'][i % 3] : '#3a444d';
        ctx.beginPath(); ctx.arc(14 + i * ((w - 28) / 5), 41, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // Grand interrupteur
      ctx.fillStyle = on ? '#3dffa8' : '#ff5c5c';
      ctx.beginPath(); ctx.roundRect?.(w / 2 - 6, 46, 12, 6, 2); ctx.fill();
      break;
    }
    case 'fan': {
      ctx.save(); ctx.translate(w / 2, h / 2 + 4); ctx.rotate(s.t * (s.panelOn ? 14 : 6));
      ctx.fillStyle = '#9aa8b4';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.ellipse(10, 0, 10, 4, 0.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#2b333b'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case 'engine': {
      const top = -TILE * 1.2;
      const n = 5, cw = (w - 40) / n;
      const speed = s.panelOn ? 16 : 7;
      for (let i = 0; i < n; i++) {
        const cx = 20 + i * cw;
        const lift = (Math.sin(s.t * speed + i * 1.25) + 1) * 3;
        ctx.fillStyle = '#c3ccd4'; ctx.fillRect(cx + 4, top - 6 - lift, cw - 14, 7);
        ctx.fillStyle = '#5e6a75'; ctx.fillRect(cx + 4, top - 6 - lift, cw - 14, 1.5);
      }
      // Aiguilles des jauges
      for (let i = 0; i < 3; i++) {
        const gx = 30 + i * 40, gy = top + 62;
        const a = -Math.PI * 0.8 + (s.panelOn ? 1.3 : 0.6) * Math.PI + Math.sin(s.t * 3 + i) * 0.15;
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * 6, gy + Math.sin(a) * 6); ctx.stroke();
      }
      if (!s.lowFx) {
        // Vapeur
        for (let i = 0; i < 3; i++) {
          const k = (s.t * 0.6 + i / 3) % 1;
          ctx.fillStyle = `rgba(220,230,240,${0.25 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(w - 6 + Math.sin(k * 6 + i) * 3, top - 4 - k * 26, 3 + k * 6, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'generator': {
      const top = -TILE * 0.6;
      const blink = Math.sin(s.t * 4 + p.tx) > 0.2;
      ctx.fillStyle = blink ? '#3dffa8' : '#1e5a42'; ctx.beginPath(); ctx.arc(w - 17, top + 19, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'compass': {
      const k = (Math.sin(s.t * 3) + 1) / 2;
      ctx.fillStyle = `rgba(255,236,160,${0.3 + k * 0.5})`;
      ctx.save(); ctx.translate(23, 8); ctx.rotate(s.t);
      ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.moveTo(0, 0); ctx.lineTo(1.5, 1.5); ctx.lineTo(0, 7 * (0.6 + k * 0.4)); ctx.lineTo(-1.5, 1.5); } ctx.fill();
      ctx.restore();
      break;
    }
    default:
      break;
  }
}

export function hasOverlay(kind: PropKind): boolean {
  return OVERLAY_2.has(kind) || OVERLAY_3.has(kind) || OVERLAY_4.has(kind) || OVERLAY_5.has(kind) || kind === 'elevator' || kind === 'controlPanel' || kind === 'fan' || kind === 'engine' || kind === 'generator' || kind === 'compass';
}
