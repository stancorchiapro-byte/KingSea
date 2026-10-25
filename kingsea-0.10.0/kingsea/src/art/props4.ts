// Accessoires de la mise à jour KS Casino : rooftop animé (salon VIP, cordons de velours, braseros, guirlandes
// lumineuses, bar à champagne). Même contrat que props.ts : image statique en cache (unités monde, origine =
// coin haut-gauche de l'emprise) + surcouche animée facultative.
import type { PropDef, PropKind } from '../world/types';
import { TILE } from '../world/types';
import { roundRect } from './canvas';

const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.18), 0, 0, Math.PI * 2); ctx.fill();
};
const gold = (ctx: CanvasRenderingContext2D, x0: number, x1: number) => {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#8a6a2b'); g.addColorStop(0.5, '#efdcae'); g.addColorStop(1, '#8a6a2b');
  return g;
};

export const EXTRA_TOP_4: Partial<Record<PropKind, number>> = { velvetRope: 0.6, vipSign: 1.6, fireTable: 0.4, lightPole: 2.4, champagneBar: 1.0, loungeSofa: 0.8 };
export const OVERLAY_4 = new Set<PropKind>(['fireTable', 'lightPole', 'vipSign']);

export function drawStatic4(ctx: CanvasRenderingContext2D, kind: PropKind, w: number, h: number): boolean {
  switch (kind) {
    case 'velvetRope': {
      // Poteaux dorés tous les 1–2 cases, cordon bordeaux en chaînette
      const vertical = h > w;
      const len = vertical ? h : w, n = Math.max(2, Math.round(len / TILE) + 1);
      const posts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        posts.push(vertical ? [w / 2, 4 + k * (h - 8)] : [4 + k * (w - 8), h * 0.75]);
      }
      ctx.strokeStyle = '#6e1a2b'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      for (let i = 0; i < posts.length - 1; i++) {
        const [x0, y0] = posts[i], [x1, y1] = posts[i + 1];
        ctx.beginPath(); ctx.moveTo(x0, y0 - 12); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 4, x1, y1 - 12); ctx.stroke();
      }
      for (const [x, y] of posts) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = gold(ctx, x - 2, x + 2); ctx.fillRect(x - 1.6, y - 16, 3.2, 17);
        ctx.beginPath(); ctx.ellipse(x, y, 4.5, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 17, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      return true;
    }
    case 'vipSign': {
      const top = -TILE * 1.6;
      shadow(ctx, w * 0.2, h - 6, w * 0.6, 6);
      ctx.fillStyle = gold(ctx, w / 2 - 2, w / 2 + 2); ctx.fillRect(w / 2 - 1.5, top + 22, 3, h - top - 24);
      roundRect(ctx, 2, top, w - 4, 24, 5); ctx.fillStyle = '#0b0a0d'; ctx.fill();
      ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = 1.5; ctx.stroke();
      return true;
    }
    case 'fireTable': {
      shadow(ctx, 0, 4, w, h - 4);
      roundRect(ctx, 2, 2, w - 4, h - 6, 6); ctx.fillStyle = '#2a2328'; ctx.fill();
      ctx.fillStyle = '#3a3238'; roundRect(ctx, 2, 2, w - 4, 6, 4); ctx.fill();
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(4, h - 6, w - 8, 1.5);
      ctx.fillStyle = '#111'; roundRect(ctx, 8, 3, w - 16, 5, 3); ctx.fill();
      return true;
    }
    case 'lightPole': {
      const top = -TILE * 2.4;
      shadow(ctx, w * 0.3, h - 6, w * 0.4, 5);
      ctx.fillStyle = '#2b2b30'; ctx.fillRect(w / 2 - 1.2, top + 4, 2.4, h - top - 6);
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(w / 2 - 3, top, 6, 4);
      return true;
    }
    case 'champagneBar': {
      const top = -TILE * 1.0;
      shadow(ctx, 0, 4, w, h - 4);
      ctx.fillStyle = '#0b0a0d'; roundRect(ctx, 0, top + 10, w, h - top - 12, 4); ctx.fill();
      ctx.fillStyle = gold(ctx, 0, w); ctx.fillRect(0, top + 10, w, 4); ctx.fillRect(0, h - 5, w, 2);
      ctx.strokeStyle = 'rgba(212,175,90,0.6)'; ctx.lineWidth = 1;
      for (let x = 10; x < w - 6; x += 12) { ctx.beginPath(); ctx.moveTo(x, top + 18); ctx.lineTo(x + 6, h - 8); ctx.stroke(); }
      // Seau à champagne et coupes
      ctx.fillStyle = '#c9ccd3'; roundRect(ctx, w * 0.2, top - 2, 12, 12, 2); ctx.fill();
      ctx.fillStyle = '#1f3d2a'; ctx.fillRect(w * 0.2 + 4, top - 12, 4, 12); ctx.fillStyle = '#d4af5a'; ctx.fillRect(w * 0.2 + 4, top - 14, 4, 3);
      for (let i = 0; i < 4; i++) { const x = w * 0.5 + i * 9; ctx.fillStyle = 'rgba(255,240,190,0.85)'; ctx.beginPath(); ctx.moveTo(x - 3, top); ctx.lineTo(x + 3, top); ctx.lineTo(x, top + 5); ctx.fill(); ctx.fillRect(x - 0.4, top + 5, 0.8, 4); }
      return true;
    }
    case 'loungeSofa': {
      // Canapé d'extérieur blanc et coussins bordeaux / or
      const back = -TILE * 0.8;
      shadow(ctx, 0, 4, w, h - 4);
      ctx.fillStyle = '#d9d2c4'; roundRect(ctx, 0, back, w, 18, 6); ctx.fill();
      ctx.fillStyle = '#f6f0e3'; roundRect(ctx, 0, back + 12, w, h - back - 16, 6); ctx.fill();
      const n = Math.max(2, Math.round(w / TILE));
      for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#6e1a2b' : '#d4af5a'; roundRect(ctx, 6 + i * (w - 12) / n, back + 5, (w - 12) / n - 6, 11, 4); ctx.fill(); }
      ctx.fillStyle = '#2b2b30'; ctx.fillRect(3, h - 5, 3, 4); ctx.fillRect(w - 6, h - 5, 3, 4);
      return true;
    }
  }
  return false;
}

export function drawOverlay4(ctx: CanvasRenderingContext2D, p: PropDef, t: number, lowFx: boolean): void {
  const w = p.w * TILE, h = p.h * TILE;
  switch (p.kind) {
    case 'fireTable': {
      // Flammes vives (gaz) au centre de la table
      const n = Math.max(3, Math.round(w / 8));
      for (let i = 0; i < n; i++) {
        const x = 10 + (i + 0.5) * (w - 20) / n, f = lowFx ? 0.8 : 0.7 + 0.3 * Math.sin(t * 9 + i * 1.7) + 0.15 * Math.sin(t * 23 + i);
        const fh = 9 * f;
        ctx.fillStyle = 'rgba(255,150,40,0.9)'; ctx.beginPath(); ctx.moveTo(x - 3, 6); ctx.quadraticCurveTo(x - 2, 6 - fh * 0.6, x, 6 - fh); ctx.quadraticCurveTo(x + 2, 6 - fh * 0.6, x + 3, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,140,0.95)'; ctx.beginPath(); ctx.moveTo(x - 1.4, 6); ctx.quadraticCurveTo(x, 6 - fh * 0.7, x + 1.4, 6); ctx.fill();
      }
      return;
    }
    case 'lightPole': {
      // Guirlande : ampoules qui scintillent doucement (vers la droite, jusqu'au poteau suivant)
      const top = -TILE * 2.4, span = Number(p.id ?? 0) * TILE;
      if (span > 0) {
        ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(w / 2, top + 2); ctx.quadraticCurveTo(w / 2 + span / 2, top + 22, w / 2 + span, top + 2); ctx.stroke();
        const bulbs = Math.round(span / 10);
        for (let i = 1; i < bulbs; i++) {
          const k = i / bulbs, x = w / 2 + span * k, y = top + 2 + 4 * 20 * k * (1 - k) * 0.5 + 2;
          const a = lowFx ? 0.9 : 0.65 + 0.35 * Math.sin(t * 2.2 + i * 1.3);
          ctx.fillStyle = `rgba(255,${200 + (i % 3) * 20},${120 + (i % 2) * 60},${a})`;
          ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
        }
      }
      return;
    }
    case 'vipSign': {
      const top = -TILE * 1.6, pulse = lowFx ? 1 : 0.8 + 0.2 * Math.sin(t * 3);
      ctx.save(); ctx.shadowColor = '#d4af5a'; ctx.shadowBlur = 8 * pulse;
      ctx.fillStyle = `rgba(239,220,174,${0.75 + 0.25 * pulse})`; ctx.font = '900 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('VIP', w / 2, top + 12.5);
      ctx.restore();
      return;
    }
  }
  void h;
}
