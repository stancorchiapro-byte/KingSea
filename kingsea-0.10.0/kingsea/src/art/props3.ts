// Accessoires de la phase 4 : nouveaux jeux du casino et de l'arcade.
// Même contrat que props2.ts (image statique en cache + surcouche animée facultative).
import type { PropDef, PropKind } from '../world/types';
import { TILE } from '../world/types';
import { roundRect } from './canvas';
import { PAL } from './palette';

const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.18), 0, 0, Math.PI * 2); ctx.fill();
};
const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 800) => {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y);
};

export const EXTRA_TOP_3: Partial<Record<PropKind, number>> = {
  crapsTable: 0.3, pokerMachine: 1.5, plinkoMachine: 1.2, crashScreen: 1.2, footballGoal: 1.0, skeeBall: 0.8, moleMachine: 0.9,
};
export const WALL_PROPS_3: PropKind[] = ['kenoBoard', 'raceScreen'];

export function drawStatic3(ctx: CanvasRenderingContext2D, kind: PropKind, w: number, h: number, variant: number): boolean {
  switch (kind) {
    case 'crapsTable': {
      const top = -TILE * 0.3;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#3a2412'; roundRect(ctx, 0, top + 4, w, h - top - 8, 14); ctx.fill();
      ctx.fillStyle = '#1f6b3a'; roundRect(ctx, 5, top + 9, w - 10, h - top - 18, 10); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.7;
      roundRect(ctx, 12, top + 14, w - 24, 10, 3); ctx.stroke();
      roundRect(ctx, 12, top + 28, w - 24, 10, 3); ctx.stroke(); ctx.globalAlpha = 1;
      text(ctx, 'PASS LINE', w / 2, top + 19, 5, '#fff'); text(ctx, 'FIELD 2·3·4·9·10·11·12', w / 2, top + 33, 4, PAL.goldLight);
      for (const [x, v] of [[w / 2 - 6, '#fff'], [w / 2 + 6, '#fff']] as const) { ctx.fillStyle = v; roundRect(ctx, x - 3, top + 44, 6, 6, 1.2); ctx.fill(); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(x, top + 47, 0.9, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    case 'pokerMachine': {
      const top = -TILE * 1.5, body = variant ? '#5a1e5c' : '#163a6b';
      shadow(ctx, 2, 4, w - 4, h - 4);
      ctx.fillStyle = body; roundRect(ctx, 3, top + 6, w - 6, h - top - 6, 5); ctx.fill();
      ctx.fillStyle = PAL.gold; roundRect(ctx, 2, top, w - 4, 10, 4); ctx.fill();
      text(ctx, variant ? 'DIRECT' : 'POKER', w / 2, top + 5, 4.4, PAL.deepNavy);
      ctx.fillStyle = '#0a0f1a'; roundRect(ctx, 5, top + 13, w - 10, 20, 2); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = '#f4efe6'; ctx.fillRect(7 + i * ((w - 14) / 5), top + 18, (w - 14) / 5 - 1, 9); ctx.fillStyle = i % 2 ? '#c0392b' : '#111'; ctx.fillRect(8.5 + i * ((w - 14) / 5), top + 21, 2, 2); }
      for (let i = 0; i < 5; i++) { ctx.fillStyle = '#e5b54a'; ctx.fillRect(7 + i * ((w - 14) / 5), top + 38, (w - 14) / 5 - 1, 3); }
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(5, h - 12, w - 10, 4);
      return true;
    }
    case 'kenoBoard': {
      ctx.fillStyle = '#050c18'; roundRect(ctx, 4, 4, w - 8, h - 10, 6); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.stroke();
      text(ctx, 'KENO', w / 2, 13, 11, PAL.goldLight, 900);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 20; c++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(12 + c * ((w - 24) / 20), 24 + r * 7, (w - 24) / 20 - 1.4, 5.5); }
      return true;
    }
    case 'raceScreen': {
      ctx.fillStyle = '#050c18'; roundRect(ctx, 4, 4, w - 8, h - 10, 6); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.stroke();
      text(ctx, 'COURSES', w / 2, 12, 9, PAL.goldLight, 900);
      ctx.fillStyle = '#2f7a3a'; ctx.fillRect(12, 20, w - 24, h - 34);
      ctx.fillStyle = '#fff'; for (let y = 20; y < h - 14; y += 4) ctx.fillRect(w - 18, y, 2, 2);
      return true;
    }
    case 'plinkoMachine': {
      const top = -TILE * 1.2;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#2b1452'; roundRect(ctx, 1, top, w - 2, h - top - 4, 4); ctx.fill();
      ctx.strokeStyle = '#ff3fa4'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#0a0418'; ctx.fillRect(4, top + 10, w - 8, h - top - 26);
      ctx.fillStyle = '#e9ecef'; for (let r = 0; r < 7; r++) for (let k = 0; k <= r; k++) { ctx.beginPath(); ctx.arc(w / 2 + (k - r / 2) * 3.4, top + 14 + r * 5.5, 0.7, 0, Math.PI * 2); ctx.fill(); }
      text(ctx, 'PLINKO', w / 2, top + 5, 4.5, '#ffb3e1');
      return true;
    }
    case 'crashScreen': {
      const top = -TILE * 1.2;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#10243f'; roundRect(ctx, 1, top, w - 2, h - top - 4, 4); ctx.fill();
      ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#020810'; ctx.fillRect(4, top + 10, w - 8, 30);
      text(ctx, 'CRASH', w / 2, top + 5, 4.5, '#6ff3ff');
      return true;
    }
    case 'footballGoal': {
      const top = -TILE * 1.0;
      shadow(ctx, 0, 4, w, h - 4);
      ctx.fillStyle = '#1f6b3a'; ctx.fillRect(0, top + 14, w, h - top - 16);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.5;
      for (let x = 8; x < w - 6; x += 4) { ctx.beginPath(); ctx.moveTo(x, top + 4); ctx.lineTo(x, top + 26); ctx.stroke(); }
      for (let y = top + 4; y < top + 26; y += 4) { ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke(); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(6, top + 28); ctx.lineTo(6, top + 3); ctx.lineTo(w - 6, top + 3); ctx.lineTo(w - 6, top + 28); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(w / 2 - 14, top + 28, 28, h - top - 34);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2, h - 10, 1.6, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    case 'skeeBall': {
      const top = -TILE * 0.8;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#5a2d0c'; ctx.beginPath(); ctx.moveTo(2, top + 24); ctx.lineTo(w - 2, top + 24); ctx.lineTo(w, h - 4); ctx.lineTo(0, h - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8954e'; ctx.fillRect(5, top + 28, w - 10, h - top - 36);
      ctx.fillStyle = '#1a1238'; roundRect(ctx, 1, top, w - 2, 26, 3); ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1; ctx.stroke();
      for (const [r, c] of [[9, '#6ff3ff'], [6, '#ff3fa4'], [3, '#ffd166']] as const) { ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(w / 2, top + 13, r, 0, Math.PI * 2); ctx.stroke(); }
      return true;
    }
    case 'moleMachine': {
      const top = -TILE * 0.9;
      shadow(ctx, 0, 6, w, h - 6);
      ctx.fillStyle = '#1a1238'; roundRect(ctx, 4, top, w - 8, 14, 3); ctx.fill();
      text(ctx, 'TAPE-CRABE', w / 2, top + 7, 5.5, '#ffd166', 900);
      ctx.fillStyle = '#2b5e2f'; roundRect(ctx, 2, top + 14, w - 4, h - top - 18, 5); ctx.fill();
      ctx.strokeStyle = '#59e3a7'; ctx.lineWidth = 1; ctx.stroke();
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { ctx.fillStyle = '#0d1f0f'; ctx.beginPath(); ctx.ellipse(14 + c * ((w - 28) / 2), top + 30 + r * 16, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    default:
      return false;
  }
}

export const OVERLAY_3 = new Set<PropKind>(['kenoBoard', 'raceScreen', 'crashScreen', 'plinkoMachine', 'moleMachine']);

export function drawOverlay3(ctx: CanvasRenderingContext2D, p: PropDef, t: number): void {
  const w = p.w * TILE, h = p.h * TILE;
  switch (p.kind) {
    case 'kenoBoard': {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 20; c++) {
        const n = r * 20 + c, on = ((n * 37 + Math.floor(t * 1.5) * 11) % 80) < 20;
        if (on) { ctx.fillStyle = (n + Math.floor(t)) % 7 === 0 ? PAL.goldLight : '#c0392b'; ctx.fillRect(12 + c * ((w - 24) / 20), 24 + r * 7, (w - 24) / 20 - 1.4, 5.5); }
      }
      break;
    }
    case 'raceScreen': {
      const cols = ['#e8463a', '#1f6fd1', '#f2c94c', '#2e8b57', '#9b59b6', '#ff8c42'], lane = (h - 34) / 6;
      cols.forEach((c, i) => { const k = ((t * (0.12 + ((i * 7) % 5) * 0.01) + i * 0.07) % 1); ctx.fillStyle = c; ctx.fillRect(14 + k * (w - 36), 20 + i * lane + lane * 0.2, 5, lane * 0.6); });
      break;
    }
    case 'crashScreen': {
      const top = -TILE * 1.2, k = (t * 0.35) % 1;
      ctx.strokeStyle = k > 0.85 ? '#ff6b6b' : '#59e3a7'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const u = (i / 20) * Math.min(k, 0.85) / 0.85; ctx.lineTo(5 + u * (w - 10), top + 38 - (Math.exp(u * 2.2) - 1) / (Math.exp(2.2) - 1) * 26); }
      ctx.stroke();
      break;
    }
    case 'plinkoMachine': {
      const top = -TILE * 1.2, k = (t * 0.6 + p.tx * 0.3) % 1;
      ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.arc(w / 2 + Math.sin(k * 20) * 4 * k, top + 12 + k * 38, 1.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'moleMachine': {
      const top = -TILE * 0.9;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const i = r * 3 + c, up = Math.max(0, Math.sin(t * 2.2 + i * 2.1));
        if (up < 0.2) continue;
        const x = 14 + c * ((w - 28) / 2), y = top + 30 + r * 16 - up * 4;
        ctx.fillStyle = '#e8463a'; ctx.beginPath(); ctx.ellipse(x, y, 4.5, 3, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 2.4, y - 3.4, 1.2, 1.2); ctx.fillRect(x + 1.2, y - 3.4, 1.2, 1.2);
      }
      break;
    }
    default: break;
  }
}
