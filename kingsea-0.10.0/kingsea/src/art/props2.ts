// Accessoires de la phase 2 : escaliers, casino, arcade, logements, rooftop.
// Même contrat que props.ts : image statique en cache (unités monde, origine = coin haut-gauche de l'emprise)
// + surcouche animée facultative.
import type { PropDef, PropKind } from '../world/types';
import { TILE } from '../world/types';
import { roundRect } from './canvas';
import { PAL } from './palette';

const lg = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
};
const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.18), 0, 0, Math.PI * 2); ctx.fill();
};
const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 800, align: CanvasTextAlign = 'center') => {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y);
};

/** Thèmes des machines à sous (les 6 machines prévues au cahier des charges). */
export const SLOT_THEMES = [
  { name: 'Trésors', body: '#9c6a1c', light: '#ffe29a', symbols: ['💰', '🪙', '💎'] },
  { name: 'Pirates', body: '#5a1e1e', light: '#ff7a6b', symbols: ['🏴‍☠️', '⚓', '🦜'] },
  { name: 'Créatures', body: '#0f5a6b', light: '#6ff3ff', symbols: ['🐙', '🦈', '🐢'] },
  { name: 'Perles', body: '#6b2d5c', light: '#ffb3e1', symbols: ['🦪', '🐚', '🪸'] },
  { name: 'Profondeurs', body: '#1d2a6b', light: '#9bb0ff', symbols: ['🔱', '🐋', '💎'] },
  { name: 'Aventures', body: '#1f6b3a', light: '#9cffb8', symbols: ['🤿', '🐠', '🗺️'] },
];
export const CABINET_COLORS = ['#ff3fa4', '#6ff3ff', '#7b4dff', '#ffd166', '#59e3a7'];

/** Variante visuelle d'un accessoire (couleur/thème), pour les éléments répétés. */
export function variantOf(p: PropDef): number {
  if (p.kind === 'slotMachine') return (p.tx + p.ty) % SLOT_THEMES.length;
  if (p.kind === 'arcadeCabinet') return (p.tx + p.ty) % CABINET_COLORS.length;
  if (p.kind === 'cardTable') return p.id === 'hilo' ? 1 : p.id === 'baccarat' ? 2 : p.id === 'poker' ? 3 : 0;
  if (p.kind === 'pokerMachine') return p.id === 'direct' ? 1 : 0;
  return 0;
}

export const EXTRA_TOP_2: Partial<Record<PropKind, number>> = {
  fortuneWheel: 1.4, slotMachine: 1.5, rouletteTable: 0.3, cardTable: 0.3, cashier: 0.9, treasureChest: 0.4,
  arcadeCabinet: 1.6, poolTable: 0.3, pinball: 0.7, hoopMachine: 1.3, infoBoard: 1.1,
  bed: 0.6, wardrobe: 1.6, nightstand: 0.5, paintKit: 0.4,
  bench: 0.5, transat: 0.2, parasol: 2.2, palm: 2.6, tikiBar: 1.0, snackStand: 1.0, slide: 1.6, djBooth: 0.6, speaker: 0.9,
};

export function drawStatic2(ctx: CanvasRenderingContext2D, kind: PropKind, w: number, h: number, variant: number): boolean {
  switch (kind) {
    // ------------------------------------------------------------ Escaliers (ouverture dans un mur latéral)
    case 'stairsDown':
    case 'stairsUp': {
      const down = kind === 'stairsDown';
      const n = 5;
      for (let i = 0; i < n; i++) {
        // Marches vues d'en haut : l'escalier « descend » vers le mur gauche, « monte » vers le mur droit
        const k = down ? i / (n - 1) : 1 - i / (n - 1);
        const shadeA = Math.round(60 + 140 * (down ? 1 - k : k));
        ctx.fillStyle = `rgb(${shadeA},${shadeA + 8},${shadeA + 22})`;
        ctx.fillRect((i * w) / n, 0, w / n + 0.5, h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(((down ? i : i + 1) * w) / n - 0.8, 0, 1.2, h);
      }
      ctx.fillStyle = PAL.gold; ctx.fillRect(0, 1, w, 2); ctx.fillRect(0, h - 3, w, 2);
      ctx.save(); ctx.translate(w / 2, h / 2);
      ctx.fillStyle = 'rgba(6,24,47,0.75)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = PAL.pearl; ctx.beginPath();
      if (down) { ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.lineTo(0, 4); } else { ctx.moveTo(-4, 2); ctx.lineTo(4, 2); ctx.lineTo(0, -4); }
      ctx.fill(); ctx.restore();
      return true;
    }

    case 'fortuneWheel': {
      const top = -TILE * 1.4;
      shadow(ctx, 4, 8, w - 8, h - 8);
      ctx.fillStyle = PAL.goldDark; ctx.fillRect(w / 2 - 3, top + 40, 6, h - top - 46); // pied
      ctx.fillStyle = PAL.navy; roundRect(ctx, 8, h - 14, w - 16, 10, 4); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(w / 2, top + 30, 29, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#05162c'; roundRect(ctx, 6, h - 30, w - 12, 13, 3); ctx.fill();
      text(ctx, 'ROUE DU JOUR', w / 2, h - 23.5, 6.2, PAL.goldLight, 900);
      return true;
    }

    // ------------------------------------------------------------ Casino
    case 'casinoSign': {
      ctx.fillStyle = '#050c18'; roundRect(ctx, 4, 4, w - 8, h - 10, 6); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.stroke();
      ctx.shadowColor = PAL.gold; ctx.shadowBlur = 10;
      text(ctx, 'CASINO', w / 2, h / 2 - 6, 17, PAL.goldLight, 900);
      ctx.shadowBlur = 0;
      text(ctx, 'KingSea', w / 2, h / 2 + 10, 8, PAL.cyan, 700);
      return true;
    }
    case 'slotMachine': {
      const th = SLOT_THEMES[variant];
      const top = -TILE * 1.5;
      shadow(ctx, 2, 4, w - 4, h - 4);
      ctx.fillStyle = lg(ctx, 0, top, w, top, [[0, th.body], [0.5, shadeHex(th.body, 0.25)], [1, th.body]]);
      roundRect(ctx, 3, top + 6, w - 6, h - top - 6, 5); ctx.fill();
      ctx.fillStyle = PAL.gold; roundRect(ctx, 2, top, w - 4, 10, 4); ctx.fill();
      ctx.fillStyle = '#0a0f1a'; roundRect(ctx, 6, top + 14, w - 12, 18, 2); ctx.fill(); // écran des rouleaux
      ctx.fillStyle = th.light; ctx.globalAlpha = 0.85; roundRect(ctx, 6, top + 36, w - 12, 6, 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(w - 4, top + 28, 2.6, 0, Math.PI * 2); ctx.fill(); // levier
      ctx.fillStyle = '#9aa6b2'; ctx.fillRect(w - 4.6, top + 28, 1.2, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(5, h - 12, w - 10, 4);
      text(ctx, th.name, w / 2, top + 5, 4.2, PAL.deepNavy, 800);
      return true;
    }
    case 'rouletteTable': {
      const top = -TILE * 0.3;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#4a2a14'; roundRect(ctx, 0, top, w, h - top, 14); ctx.fill();
      ctx.fillStyle = '#0d6b4f'; roundRect(ctx, 4, top + 4, w - 8, h - top - 10, 11); ctx.fill();
      // Tapis de mise (grille)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.6;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? 'rgba(192,57,43,0.75)' : 'rgba(20,20,20,0.75)';
        ctx.fillRect(40 + i * 8, top + 10 + j * 10, 8, 10); ctx.strokeRect(40 + i * 8, top + 10 + j * 10, 8, 10);
      }
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(22, top + 26, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b1a0c'; ctx.beginPath(); ctx.arc(22, top + 26, 12.5, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    case 'cardTable': {
      const top = -TILE * 0.3;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#3a2412';
      ctx.beginPath(); ctx.moveTo(0, top + 6); ctx.lineTo(w, top + 6); ctx.arc(w / 2, top + 6, w / 2, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ['#0d5e66', '#14466e', '#6b1a2a', '#0f4a2c'][variant] ?? '#0d5e66';
      ctx.beginPath(); ctx.moveTo(4, top + 8); ctx.lineTo(w - 4, top + 8); ctx.arc(w / 2, top + 8, w / 2 - 4, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w / 2, top + 8, w / 2 - 14, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      // Cartes et jetons
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + i * 0.175), r = w / 2 - 20;
        const cx = w / 2 + Math.cos(a) * r, cy = top + 8 + Math.sin(a) * r * 0.75;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a - Math.PI / 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(-3, -4, 6, 8); ctx.fillStyle = i % 2 ? '#c0392b' : '#111'; ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
      const chip = (x: number, y: number, c: string) => { for (let k = 0; k < 3; k++) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y - k * 1.6, 3.2, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.4; ctx.stroke(); } };
      chip(w / 2 - 8, top + 14, '#c0392b'); chip(w / 2, top + 13, '#1f6fd1'); chip(w / 2 + 8, top + 14, '#e5b54a');
      return true;
    }
    case 'cashier': {
      const top = -TILE * 0.9;
      shadow(ctx, 0, 2, w, h - 2);
      ctx.fillStyle = lg(ctx, 0, top, 0, h, [[0, '#0f2f55'], [1, '#081a33']]); ctx.fillRect(0, top + 22, w, h - top - 22);
      ctx.fillStyle = 'rgba(160,230,255,0.25)'; ctx.fillRect(4, top, w - 8, 22); // vitre
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.5; ctx.strokeRect(4, top, w - 8, 22);
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(4 + (i * (w - 8)) / 6, top); ctx.lineTo(4 + (i * (w - 8)) / 6, top + 22); ctx.stroke(); }
      ctx.fillStyle = PAL.gold; ctx.fillRect(0, top + 22, w, 3);
      ctx.fillStyle = '#081426'; roundRect(ctx, w / 2 - 26, top + 32, 52, 14, 3); ctx.fill();
      text(ctx, 'CAISSE', w / 2, top + 39.5, 8, PAL.goldLight, 900);
      // Bocaux de perles
      for (const jx of [14, w - 22]) {
        ctx.fillStyle = 'rgba(220,245,255,0.55)'; roundRect(ctx, jx, top + 50, 8, 10, 2); ctx.fill();
        ctx.fillStyle = '#f4efe6'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(jx + 2 + (k % 3) * 2, top + 58 - Math.floor(k / 3) * 2.5, 1.2, 0, Math.PI * 2); ctx.fill(); }
      }
      return true;
    }
    case 'treasureChest': {
      const top = -TILE * 0.4;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#6b3d16'; roundRect(ctx, 6, top + 22, w - 12, h - top - 26, 4); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.fillRect(6, top + 30, w - 12, 3); ctx.fillRect(w / 2 - 3, top + 22, 6, h - top - 26);
      ctx.fillStyle = '#7b4a1e'; ctx.beginPath(); ctx.moveTo(6, top + 22); ctx.lineTo(w - 6, top + 22); ctx.lineTo(w - 10, top + 4); ctx.lineTo(10, top + 4); ctx.closePath(); ctx.fill(); // couvercle ouvert
      ctx.fillStyle = PAL.goldLight;
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(12 + (i % 5) * 9, top + 22 - Math.floor(i / 5) * 4, 4, 2, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = PAL.pearl; ctx.beginPath(); ctx.arc(w / 2 + 6, top + 16, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.moveTo(w / 2 - 10, top + 14); ctx.lineTo(w / 2 - 6, top + 18); ctx.lineTo(w / 2 - 10, top + 22); ctx.lineTo(w / 2 - 14, top + 18); ctx.fill();
      return true;
    }

    // ------------------------------------------------------------ Arcade
    case 'neonSign': {
      ctx.fillStyle = '#07040f'; roundRect(ctx, 4, 4, w - 8, h - 10, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(123,77,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      return true;
    }
    case 'arcadeCabinet': {
      const col = CABINET_COLORS[variant];
      const top = -TILE * 1.6;
      shadow(ctx, 2, 4, w - 4, h - 4);
      ctx.fillStyle = '#1a1238'; ctx.beginPath(); ctx.moveTo(4, top + 8); ctx.lineTo(w - 4, top + 8); ctx.lineTo(w - 3, h - 2); ctx.lineTo(3, h - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(3, top + 8, 2, h - top - 10); ctx.fillRect(w - 5, top + 8, 2, h - top - 10);
      ctx.fillStyle = col; roundRect(ctx, 4, top, w - 8, 9, 2); ctx.fill(); // fronton lumineux
      ctx.fillStyle = '#05030c'; ctx.fillRect(7, top + 13, w - 14, 18);
      ctx.fillStyle = '#2b2150'; ctx.fillRect(5, top + 34, w - 10, 8); // panneau de contrôle
      ctx.fillStyle = '#ff5c5c'; ctx.beginPath(); ctx.arc(11, top + 38, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(19, top + 38, 1.6, 0, Math.PI * 2); ctx.arc(23, top + 38, 1.6, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    case 'poolTable': {
      const top = -TILE * 0.3;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#5a2e14'; roundRect(ctx, 0, top, w, h - top - 4, 6); ctx.fill();
      ctx.fillStyle = '#138a8a'; ctx.fillRect(6, top + 6, w - 12, h - top - 16);
      ctx.fillStyle = '#05030c';
      for (const [px, py] of [[6, top + 6], [w / 2, top + 5], [w - 6, top + 6], [6, h - 10], [w / 2, h - 9], [w - 6, h - 10]] as const) { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
      const balls = ['#ffd166', '#1f6fd1', '#c0392b', '#7b4dff', '#ff8c42', '#2e8b57', '#111'];
      balls.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w * 0.62 + (i % 3) * 4.2 + Math.floor(i / 3) * 2, top + 18 + (i % 3) * 4 - Math.floor(i / 3) * 2, 2.1, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.28, top + 24, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9b98c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w * 0.05, top + 30); ctx.lineTo(w * 0.26, top + 25); ctx.stroke();
      return true;
    }
    case 'bowlingLane': {
      ctx.fillStyle = '#0b0718'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = lg(ctx, 0, 0, w, 0, [[0, '#c8955a'], [0.5, '#e2b47a'], [1, '#c8955a']]);
      ctx.fillRect(8, 0, w - 16, h - 6);
      ctx.fillStyle = 'rgba(80,40,10,0.25)'; for (let x = 12; x < w - 8; x += 4) ctx.fillRect(x, 0, 0.6, h - 6);
      ctx.fillStyle = '#3a2a55'; ctx.fillRect(2, 0, 5, h - 6); ctx.fillRect(w - 7, 0, 5, h - 6); // gouttières
      // Flèches de visée
      ctx.fillStyle = 'rgba(123,77,255,0.8)';
      for (let i = 0; i < 5; i++) { const x = 14 + i * ((w - 28) / 4); ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x + 2.5, 64); ctx.lineTo(x - 2.5, 64); ctx.fill(); }
      // Quilles (au sud)
      const pinY = h - 36;
      const rows = [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3]];
      rows.forEach((r, i) => r.forEach((k) => {
        const px = w / 2 + k * 3.6, py = pinY + i * 5.5;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px, py, 2, 2.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(px - 1.6, py - 1, 3.2, 0.9);
      }));
      ctx.fillStyle = '#05030c'; ctx.fillRect(0, h - 8, w, 8);
      ctx.fillStyle = '#ff3fa4'; ctx.fillRect(0, h - 8, w, 1.5);
      return true;
    }
    case 'pinball': {
      const top = -TILE * 0.7;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#1a1238'; roundRect(ctx, 2, top, w - 4, 20, 3); ctx.fill(); // fronton
      ctx.fillStyle = '#0d3b66'; ctx.beginPath(); ctx.moveTo(3, top + 20); ctx.lineTo(w - 3, top + 20); ctx.lineTo(w - 2, h - 4); ctx.lineTo(2, h - 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.arc(10, top + 34, 3, 0, Math.PI * 2); ctx.arc(22, top + 30, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.fillRect(8, h - 14, 6, 2); ctx.fillRect(18, h - 14, 6, 2);
      text(ctx, '🐙', w / 2, top + 10, 9, '#fff', 400);
      return true;
    }
    case 'hoopMachine': {
      const top = -TILE * 1.3;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#1a1238'; ctx.fillRect(4, top, w - 8, 30); // panneau arrière
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1; ctx.strokeRect(4, top, w - 8, 30);
      ctx.fillStyle = '#05030c'; roundRect(ctx, w / 2 - 14, top + 3, 28, 9, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(w / 2 - 9, top + 15, 18, 12); ctx.strokeStyle = '#c0392b'; ctx.strokeRect(w / 2 - 5, top + 19, 10, 7);
      ctx.strokeStyle = '#ff8c42'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(w / 2, top + 30, 7, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 2, top + 31); ctx.lineTo(w / 2 + i * 1.3, top + 38); ctx.stroke(); }
      // Rampe
      ctx.fillStyle = '#2b2150'; ctx.beginPath(); ctx.moveTo(4, top + 30); ctx.lineTo(w - 4, top + 30); ctx.lineTo(w - 2, h - 4); ctx.lineTo(2, h - 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ff8c42'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(14 + i * 12, h - 10, 3.4, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    case 'infoBoard': {
      const top = -TILE * 1.1;
      shadow(ctx, 4, 2, w - 8, h - 4);
      ctx.fillStyle = '#9aa6b2'; ctx.fillRect(10, top + 28, 2, h - top - 30); ctx.fillRect(w - 12, top + 28, 2, h - top - 30);
      ctx.fillStyle = '#05030c'; roundRect(ctx, 2, top, w - 4, 34, 4); ctx.fill();
      ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, 'PROGRAMME', w / 2, top + 7, 6, '#6ff3ff', 900);
      ctx.fillStyle = 'rgba(244,239,230,0.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(8, top + 14 + i * 4.5, w - 16 - (i % 2) * 10, 1.6);
      return true;
    }

    // ------------------------------------------------------------ Logements
    case 'cabinDoor': {
      ctx.fillStyle = '#7a4b25'; roundRect(ctx, 4, 6, w - 8, h - 6, 3); ctx.fill();
      ctx.fillStyle = '#8f5a2e'; ctx.fillRect(7, 10, w - 14, 18); ctx.fillRect(7, 32, w - 14, h - 38);
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(w - 9, 38, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 2; ctx.strokeRect(3, 5, w - 6, h - 4);
      return true;
    }
    case 'bench': {
      const top = -TILE * 0.5;
      shadow(ctx, 0, 2, w, h - 2);
      ctx.fillStyle = '#7a4b25'; roundRect(ctx, 2, top, w - 4, 8, 3); ctx.fill();
      ctx.fillStyle = '#3d6f9e'; roundRect(ctx, 2, top + 8, w - 4, 12, 3); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.fillRect(4, top + 20, 2, h - top - 22); ctx.fillRect(w - 6, top + 20, 2, h - top - 22);
      return true;
    }
    case 'porthole': {
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(w / 2, h / 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lg(ctx, 0, h / 2 - 9, 0, h / 2 + 9, [[0, '#9fd9f5'], [0.5, '#d9f1fb'], [0.55, '#2b8fcf'], [1, '#0d5c99']]);
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 8.5, 0, Math.PI * 2); ctx.fill();
      return true;
    }

    // ------------------------------------------------------------ Intérieur de cabine
    case 'bed': {
      const top = -TILE * 0.6;
      shadow(ctx, 0, 6, w, h - 8);
      ctx.fillStyle = '#7a4b25'; roundRect(ctx, 0, top, w, 22, 5); ctx.fill(); // tête de lit
      ctx.fillStyle = '#f4f7fa'; roundRect(ctx, 3, top + 14, w - 6, h - top - 18, 6); ctx.fill();
      ctx.fillStyle = '#ffffff'; roundRect(ctx, 8, top + 18, w / 2 - 12, 16, 5); ctx.fill(); roundRect(ctx, w / 2 + 4, top + 18, w / 2 - 12, 16, 5); ctx.fill();
      ctx.fillStyle = '#1f6fd1'; roundRect(ctx, 3, top + 40, w - 6, h - top - 44, 6); ctx.fill(); // couverture
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
      for (let x = 10; x < w - 6; x += 2) { ctx.beginPath(); ctx.moveTo(x, top + 52 + Math.sin(x / 5) * 2.5); ctx.lineTo(x + 2, top + 52 + Math.sin((x + 2) / 5) * 2.5); ctx.stroke(); }
      ctx.fillStyle = PAL.gold; ctx.fillRect(3, top + 40, w - 6, 3);
      return true;
    }
    case 'wardrobe': {
      const top = -TILE * 1.6;
      shadow(ctx, 0, 2, w, h - 2);
      ctx.fillStyle = '#8f5a2e'; roundRect(ctx, 1, top, w - 2, h - top - 2, 3); ctx.fill();
      ctx.fillStyle = '#a06a35'; ctx.fillRect(5, top + 5, w / 2 - 7, h - top - 12); ctx.fillRect(w / 2 + 2, top + 5, w / 2 - 7, h - top - 12);
      ctx.fillStyle = PAL.gold; ctx.fillRect(w / 2 - 4, top + 34, 2, 10); ctx.fillRect(w / 2 + 2, top + 34, 2, 10);
      return true;
    }
    case 'nightstand': {
      const top = -TILE * 0.5;
      shadow(ctx, 2, 6, w - 4, h - 6);
      ctx.fillStyle = '#7a4b25'; roundRect(ctx, 3, top + 8, w - 6, h - top - 10, 3); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.fillRect(w / 2 - 1, top + 2, 2, 8);
      ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.moveTo(w / 2 - 7, top + 4); ctx.lineTo(w / 2 + 7, top + 4); ctx.lineTo(w / 2 + 4, top - 6); ctx.lineTo(w / 2 - 4, top - 6); ctx.fill();
      return true;
    }
    case 'paintKit': {
      const top = -TILE * 0.4;
      shadow(ctx, 4, 6, w - 8, h - 6);
      const cols = ['#9ec6e0', '#ead7b0', '#f4b6a6', '#b7e4cf'];
      cols.forEach((c, i) => { ctx.fillStyle = '#9aa6b2'; roundRect(ctx, 3 + (i % 2) * 13, top + 4 + Math.floor(i / 2) * 13, 11, 12, 2); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(4 + (i % 2) * 13, top + 5 + Math.floor(i / 2) * 13, 9, 4); });
      ctx.fillStyle = '#7a4b25'; ctx.save(); ctx.translate(w - 6, top + 2); ctx.rotate(0.5); ctx.fillRect(-1.5, 0, 3, 14); ctx.fillStyle = '#f4b6a6'; ctx.fillRect(-2.5, -4, 5, 5); ctx.restore();
      return true;
    }
    case 'rug': {
      ctx.fillStyle = '#123d6e'; roundRect(ctx, 2, 2, w - 4, h - 4, 10); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; roundRect(ctx, 7, 7, w - 14, h - 14, 7); ctx.stroke();
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.fillStyle = 'rgba(229,181,74,0.8)';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.fill(); }
      ctx.restore();
      return true;
    }
    case 'cabinExit': {
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(4, 0, w - 8, h);
      ctx.fillStyle = '#7a4b25'; ctx.fillRect(7, 3, w - 14, h - 6);
      ctx.fillStyle = '#1f6fd1'; roundRect(ctx, 8, -10, w - 16, 9, 2); ctx.fill(); // paillasson
      text(ctx, 'SORTIE', w / 2, h / 2, 7, PAL.goldLight, 900);
      return true;
    }

    // ------------------------------------------------------------ Rooftop
    case 'transat': {
      const top = -TILE * 0.2;
      shadow(ctx, 2, 6, w - 4, h - 6);
      ctx.fillStyle = '#f4f7fa'; roundRect(ctx, 4, top, w - 8, h - top - 4, 4); ctx.fill();
      ctx.fillStyle = '#1fc7c1'; roundRect(ctx, 6, top + 2, w - 12, 14, 3); ctx.fill(); // dossier relevé
      ctx.fillStyle = '#7fe3df'; roundRect(ctx, 6, top + 18, w - 12, h - top - 26, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let y = top + 20; y < h - 10; y += 6) ctx.fillRect(8, y, w - 16, 1.2);
      ctx.fillStyle = '#9aa6b2'; ctx.fillRect(5, h - 6, 2, 4); ctx.fillRect(w - 7, h - 6, 2, 4);
      return true;
    }
    case 'parasol': {
      const top = -TILE * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(w / 2 + 6, h - 2, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9d1c3'; ctx.fillRect(w / 2 - 1.2, top + 40, 2.4, h - top - 42);
      ctx.fillStyle = '#9aa6b2'; ctx.beginPath(); ctx.ellipse(w / 2, h - 3, 6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      // Toile vue du dessus : disque à quartiers alternés
      const cy = top + 22;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? '#f4f7fa' : '#1fc7c1';
        ctx.beginPath(); ctx.moveTo(w / 2, cy); ctx.arc(w / 2, cy, 27, (i * Math.PI) / 6, ((i + 1) * Math.PI) / 6); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w / 2, cy, 27, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(w / 2, cy, 2.5, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    case 'palm': {
      const top = -TILE * 2.6;
      shadow(ctx, 2, 18, w - 4, 12);
      ctx.fillStyle = lg(ctx, 8, 0, 24, 0, [[0, '#c9bfae'], [1, '#f4efe6']]); ctx.beginPath(); ctx.moveTo(6, 12); ctx.lineTo(26, 12); ctx.lineTo(24, 30); ctx.lineTo(8, 30); ctx.fill();
      ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(16, 14); ctx.quadraticCurveTo(10, top + 50, 18, top + 16); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + (i / 6) * Math.PI * 1.1 - 0.05;
        ctx.save(); ctx.translate(18, top + 16); ctx.rotate(a);
        ctx.fillStyle = i % 2 ? '#2f9e6b' : '#3dbb7e';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(14, -9, 30, 4); ctx.quadraticCurveTo(14, 2, 0, 0); ctx.fill();
        ctx.restore();
      }
      return true;
    }
    case 'tikiBar':
    case 'snackStand': {
      const bar = kind === 'tikiBar';
      const top = -TILE * 1.0;
      shadow(ctx, 0, 2, w, h - 2);
      // Poteaux et guirlande lumineuse (pas de toit : le serveur reste visible)
      ctx.fillStyle = bar ? '#8a6a44' : '#f4f7fa';
      ctx.fillRect(2, top, 4, h - top); ctx.fillRect(w - 6, top, 4, h - top);
      ctx.strokeStyle = 'rgba(80,60,40,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4, top + 2); ctx.quadraticCurveTo(w / 2, top + 12, w - 4, top + 2); ctx.stroke();
      // Comptoir
      ctx.fillStyle = bar ? lg(ctx, 0, 0, 0, h, [[0, '#c48a4a'], [1, '#8a5a2e']]) : lg(ctx, 0, 0, 0, h, [[0, '#ffffff'], [1, '#d9e3ea']]);
      ctx.fillRect(0, 2, w, h - 4);
      if (bar) { ctx.fillStyle = 'rgba(80,45,15,0.5)'; for (let x = 4; x < w; x += 6) ctx.fillRect(x, 4, 1.5, h - 8); }
      else { for (let x = 0; x < w; x += 10) { ctx.fillStyle = (x / 10) % 2 ? '#ff6f91' : '#ffffff'; ctx.fillRect(x, 2, 10, 6); } }
      ctx.fillStyle = bar ? '#e9e3d8' : '#1fc7c1'; roundRect(ctx, -1, -2, w + 2, 7, 2); ctx.fill();
      ctx.fillStyle = '#05162c'; roundRect(ctx, w / 2 - 18, 12, 36, 12, 3); ctx.fill();
      text(ctx, bar ? 'BAR' : 'SNACK', w / 2, 18.5, 7.5, bar ? PAL.goldLight : '#7fe3df', 900);
      return true;
    }
    case 'slide': {
      const top = -TILE * 1.6;
      shadow(ctx, 0, 10, w, h - 10);
      ctx.fillStyle = '#c9d6e0'; ctx.fillRect(w - 22, top + 10, 4, h - top - 12); ctx.fillRect(w - 8, top + 10, 4, h - top - 12); // tour
      ctx.fillStyle = '#f4f7fa'; ctx.fillRect(w - 24, top + 6, 22, 8);
      ctx.strokeStyle = '#0f8fd1'; ctx.lineWidth = 11; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w - 14, top + 10); ctx.bezierCurveTo(w + 4, top + 40, 6, top + 30, 12, h - 10); ctx.stroke();
      ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(w - 14, top + 10); ctx.bezierCurveTo(w + 4, top + 40, 6, top + 30, 12, h - 10); ctx.stroke();
      ctx.lineCap = 'butt';
      return true;
    }
    case 'djBooth': {
      const top = -TILE * 0.6;
      shadow(ctx, 0, 2, w, h - 2);
      ctx.fillStyle = '#120a22'; ctx.fillRect(0, top + 8, w, h - top - 10);
      ctx.fillStyle = '#2b1a4a'; roundRect(ctx, 0, top, w, 12, 3); ctx.fill();
      for (const x of [16, w - 16]) { ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.arc(x, top + 6, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#9aa6b2'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, top + 6, 4, 0, Math.PI * 2); ctx.stroke(); }
      return true;
    }
    case 'speaker': {
      const top = -TILE * 0.9;
      shadow(ctx, 2, 4, w - 4, h - 4);
      ctx.fillStyle = '#16121f'; roundRect(ctx, 3, top, w - 6, h - top - 2, 3); ctx.fill();
      ctx.strokeStyle = '#3a2f55'; ctx.lineWidth = 1; ctx.stroke();
      return true;
    }
    case 'lifebuoy': {
      ctx.save(); ctx.translate(w / 2, h / 2 + 4);
      for (let i = 0; i < 8; i++) { ctx.strokeStyle = i % 2 ? '#ffffff' : '#e8463a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 8, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4); ctx.stroke(); }
      ctx.restore();
      return true;
    }
    default:
      return false;
  }
}

export interface Anim2 { t: number; lowFx: boolean; myCabin: string | null; beat: number }

export const OVERLAY_2 = new Set<PropKind>(['fortuneWheel', 'slotMachine', 'rouletteTable', 'treasureChest', 'casinoSign', 'neonSign', 'arcadeCabinet', 'pinball', 'hoopMachine', 'cabinDoor', 'djBooth', 'speaker']);

export function drawOverlay2(ctx: CanvasRenderingContext2D, p: PropDef, s: Anim2): void {
  const w = p.w * TILE, h = p.h * TILE, t = s.t;
  switch (p.kind) {
    case 'fortuneWheel': {
      const top = -TILE * 1.4, cols = ['#1fc7c1', '#0b5ea8', '#7b4dff', '#ff6f91', '#e5b54a', '#59e3a7', '#ff3fa4', '#ff8c42'];
      ctx.save(); ctx.translate(w / 2, top + 30); ctx.rotate(t * 0.5);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 25, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = PAL.pearl; ctx.beginPath(); ctx.arc(w / 2, top + 30, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w / 2 - 5, top - 2); ctx.lineTo(w / 2 + 5, top - 2); ctx.lineTo(w / 2, top + 8); ctx.fill();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, on = (i + Math.floor(t * 3)) % 2 === 0; ctx.fillStyle = on ? '#fff6c2' : 'rgba(255,240,180,0.3)'; ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 27, top + 30 + Math.sin(a) * 27, 1.4, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'slotMachine': {
      const th = SLOT_THEMES[variantOf(p)], top = -TILE * 1.5;
      ctx.save(); ctx.beginPath(); ctx.rect(6, top + 14, w - 12, 18); ctx.clip();
      for (let r = 0; r < 3; r++) {
        const idx = Math.floor(t * 0.6 + r * 1.3 + p.tx) % 3;
        ctx.font = '8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(th.symbols[idx], 9.5 + r * ((w - 18) / 2), top + 23);
      }
      ctx.restore();
      const on = Math.sin(t * 5 + p.tx) > 0;
      ctx.fillStyle = on ? th.light : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(w / 2, top - 2, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rouletteTable': {
      const top = -TILE * 0.3;
      ctx.save(); ctx.translate(22, top + 26); ctx.rotate(t * 1.4);
      for (let i = 0; i < 12; i++) { ctx.fillStyle = i === 0 ? '#1f8a4c' : i % 2 ? '#c0392b' : '#111'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 11, (i * Math.PI) / 6, ((i + 1) * Math.PI) / 6); ctx.fill(); }
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22 + Math.cos(-t * 2.3) * 9, top + 26 + Math.sin(-t * 2.3) * 9, 1.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'treasureChest': {
      const k = (Math.sin(t * 2.4) + 1) / 2;
      ctx.fillStyle = `rgba(255,226,154,${0.15 + k * 0.25})`; ctx.beginPath(); ctx.ellipse(w / 2, -TILE * 0.4 + 18, w / 2 - 6, 8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'casinoSign': {
      // Ampoules qui défilent autour du panneau
      const n = 22;
      for (let i = 0; i < n; i++) {
        const per = 2 * (w - 12) + 2 * (h - 16), d = (i / n) * per;
        let x: number, y: number;
        if (d < w - 12) { x = 6 + d; y = 6; } else if (d < w - 12 + h - 16) { x = w - 6; y = 6 + d - (w - 12); } else if (d < 2 * (w - 12) + h - 16) { x = w - 6 - (d - (w - 12) - (h - 16)); y = h - 10; } else { x = 6; y = h - 10 - (d - 2 * (w - 12) - (h - 16)); }
        const on = (i + Math.floor(t * 8)) % 3 === 0;
        ctx.fillStyle = on ? PAL.goldLight : 'rgba(229,181,74,0.35)'; ctx.beginPath(); ctx.arc(x, y, on ? 1.6 : 1.1, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'neonSign': {
      const flick = s.lowFx ? 1 : Math.sin(t * 23) > -0.9 ? 1 : 0.4;
      const col = Math.floor(t / 2) % 2 ? '#ff3fa4' : '#6ff3ff';
      ctx.save(); ctx.globalAlpha = flick; ctx.shadowColor = col; ctx.shadowBlur = s.lowFx ? 0 : 10;
      text(ctx, 'ARCADE', w / 2, h / 2 - 5, 18, '#ffffff', 900);
      ctx.shadowBlur = 0; text(ctx, 'NÉON', w / 2, h / 2 + 11, 8, col, 800);
      ctx.restore();
      break;
    }
    case 'arcadeCabinet': {
      const top = -TILE * 1.6, col = CABINET_COLORS[variantOf(p)];
      ctx.save(); ctx.beginPath(); ctx.rect(7, top + 13, w - 14, 18); ctx.clip();
      const k = variantOf(p);
      if (k % 3 === 0) { // jeu de « vaisseaux »
        ctx.fillStyle = col; for (let i = 0; i < 4; i++) ctx.fillRect(9 + ((t * 10 + i * 5) % (w - 18)), top + 16 + i * 3, 3, 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(w / 2 - 2 + Math.sin(t * 2) * 5, top + 28, 4, 2);
      } else if (k % 3 === 1) { // « poisson-glouton »
        const x = 9 + ((t * 8) % (w - 18));
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x, top + 22); ctx.arc(x, top + 22, 3.5, 0.3 + Math.abs(Math.sin(t * 8)) * 0.4, Math.PI * 2 - 0.3 - Math.abs(Math.sin(t * 8)) * 0.4); ctx.fill();
        ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(9 + i * 5, top + 21.5, 1, 1);
      } else { // blocs qui tombent
        ctx.fillStyle = col; for (let i = 0; i < 3; i++) ctx.fillRect(9 + i * 5, top + 13 + ((t * 12 + i * 7) % 18), 4, 4);
        ctx.fillStyle = '#59e3a7'; ctx.fillRect(8, top + 27, w - 16, 3);
      }
      ctx.restore();
      ctx.fillStyle = col; ctx.globalAlpha = 0.25 + Math.abs(Math.sin(t * 2 + p.tx)) * 0.2;
      ctx.fillRect(-2, h - 4, w + 4, 6); ctx.globalAlpha = 1;
      break;
    }
    case 'pinball': {
      const top = -TILE * 0.7;
      const on = Math.floor(t * 4 + p.tx) % 3;
      ['#ff3fa4', '#6ff3ff', '#ffd166'].forEach((c, i) => { ctx.fillStyle = i === on ? c : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(8 + i * 8, top + 17, 1.6, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(w / 2 + Math.sin(t * 3 + p.tx) * 8, top + 40 + Math.cos(t * 2.2) * 10, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'hoopMachine': {
      const top = -TILE * 1.3;
      const score = String(Math.floor(t * 2 + p.tx * 7) % 100).padStart(2, '0');
      text(ctx, score, w / 2, top + 7.5, 7, '#ff5c5c', 900);
      break;
    }
    case 'cabinDoor': {
      const num = p.id ?? '';
      const mine = s.myCabin !== null && num === s.myCabin;
      ctx.fillStyle = mine ? PAL.gold : '#e8dcc8'; roundRect(ctx, w / 2 - 9, 13, 18, 9, 2); ctx.fill();
      text(ctx, num, w / 2, 17.8, 7, mine ? PAL.deepNavy : '#5a3a1e', 900);
      if (mine) { ctx.fillStyle = `rgba(255,226,154,${0.35 + Math.sin(t * 3) * 0.2})`; ctx.fillRect(4, h - 3, w - 8, 3); }
      break;
    }
    case 'djBooth': {
      const top = -TILE * 0.6;
      for (let i = 0; i < 8; i++) {
        const lvl = s.lowFx ? 0.5 : (Math.sin(t * 9 + i * 1.3) + 1) / 2 * (0.4 + s.beat * 0.6);
        ctx.fillStyle = i < 3 ? '#59e3a7' : i < 6 ? '#ffd166' : '#ff3fa4';
        ctx.fillRect(w / 2 - 14 + i * 3.6, top + 22 - lvl * 10, 2.6, lvl * 10);
      }
      break;
    }
    case 'speaker': {
      const top = -TILE * 0.9;
      const pulse = 1 + s.beat * 0.25;
      for (const [y, r] of [[top + 14, 6], [top + 34, 9]] as const) {
        ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.arc(w / 2, y, r * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7b4dff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#3a2f55'; ctx.beginPath(); ctx.arc(w / 2, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
