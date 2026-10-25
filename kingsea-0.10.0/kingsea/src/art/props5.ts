// Accessoires de la mise à jour « Stan » : boutique du hall, écrans d'information, aquarium, piano, coin photo.
// Même contrat que props.ts : image statique en cache (unités monde, origine = coin haut-gauche de l'emprise,
// la hauteur supplémentaire EXTRA_TOP_5 est disponible au-dessus) + surcouche animée facultative.
import type { PropDef, PropKind } from '../world/types';
import { TILE } from '../world/types';
import { roundRect } from './canvas';

const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.18), 0, 0, Math.PI * 2); ctx.fill();
};
const goldGrad = (ctx: CanvasRenderingContext2D, x0: number, x1: number) => {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#8a6a2b'); g.addColorStop(0.5, '#efdcae'); g.addColorStop(1, '#8a6a2b');
  return g;
};

export const EXTRA_TOP_5: Partial<Record<PropKind, number>> = { shopRack: 1.6, infoScreen: 1.4, aquarium: 1.2, piano: 0.9, photoSpot: 1.8, telescope: 1.0 };
export const OVERLAY_5 = new Set<PropKind>(['shopRack', 'infoScreen', 'aquarium', 'photoSpot']);

const GARMENTS = ['#1d2a4a', '#5e1426', '#e9dcc0', '#1f4fbf', '#141216', '#c8b28a', '#2b3f6b', '#b0193b'];

export function drawStatic5(ctx: CanvasRenderingContext2D, kind: PropKind, w: number, h: number): boolean {
  switch (kind) {
    case 'shopRack': {
      // Comptoir de boutique (bois laqué, filet doré) surmonté d'un portant de vêtements et d'un mannequin
      shadow(ctx, 0, 0, w, h);
      const top = -TILE * 1.45;
      // Portant
      ctx.fillStyle = goldGrad(ctx, 0, w);
      ctx.fillRect(6, top, 2.5, h - top - 8); ctx.fillRect(w * 0.62, top, 2.5, h - top - 8);
      ctx.fillRect(6, top, w * 0.62 - 3.5, 2.5);
      const n = Math.floor((w * 0.62 - 14) / 9);
      for (let i = 0; i < n; i++) {
        const x = 12 + i * 9, c = GARMENTS[i % GARMENTS.length];
        ctx.strokeStyle = '#c9ccd3'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + 3, top + 2); ctx.lineTo(x + 3, top + 5); ctx.stroke();
        ctx.fillStyle = c; roundRect(ctx, x - 1, top + 5, 8, 22 + (i % 3) * 3, 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, top + 7, 1.4, 16);
      }
      // Mannequin (buste) en tenue de soirée
      const mx = w * 0.82, my = top + 8;
      ctx.fillStyle = '#efe6d4'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5e1426'; roundRect(ctx, mx - 8, my + 5, 16, 20, 4); ctx.fill();
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(mx - 8, my + 13, 16, 1.6);
      ctx.fillStyle = '#3a2a1e'; ctx.fillRect(mx - 0.8, my + 25, 1.6, h - my - 33 + top * 0);
      // Comptoir
      const ct = 2;
      ctx.fillStyle = '#2b1a14'; roundRect(ctx, 0, ct, w, h - ct - 1, 3); ctx.fill();
      ctx.fillStyle = '#4a2e1c'; ctx.fillRect(2, ct + 2, w - 4, 5);
      ctx.fillStyle = goldGrad(ctx, 0, w); ctx.fillRect(0, ct + 7, w, 1.6); ctx.fillRect(0, h - 4, w, 1.4);
      // Boîtes et sacs sur le comptoir
      ctx.fillStyle = '#f6f0e3'; roundRect(ctx, w * 0.12, ct - 6, 10, 7, 1); ctx.fill();
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(w * 0.12 + 4, ct - 6, 2, 7);
      ctx.fillStyle = '#123a68'; roundRect(ctx, w * 0.3, ct - 9, 9, 10, 1.5); ctx.fill();
      ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w * 0.3 + 4.5, ct - 9, 2.5, Math.PI, 0); ctx.stroke();
      // Plaque
      ctx.fillStyle = '#d4af5a'; roundRect(ctx, w / 2 - 24, ct + 11, 48, 10, 2); ctx.fill();
      ctx.fillStyle = '#141216'; ctx.font = 'bold 7px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BOUTIQUE KS', w / 2, ct + 16.5);
      return true;
    }
    case 'infoScreen': {
      // Écran d'information sur pied (cadre noir, liseré doré)
      const top = -TILE * 1.3;
      shadow(ctx, w * 0.2, 0, w * 0.6, h);
      ctx.fillStyle = '#2a2a30'; ctx.fillRect(w / 2 - 2, top + 30, 4, h - top - 34);
      ctx.fillStyle = '#1c1c22'; roundRect(ctx, w / 2 - 10, h - 6, 20, 4, 2); ctx.fill();
      ctx.fillStyle = '#0b0b10'; roundRect(ctx, 2, top, w - 4, 34, 3); ctx.fill();
      ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = 1.2; roundRect(ctx, 2, top, w - 4, 34, 3); ctx.stroke();
      return true;
    }
    case 'aquarium': {
      // Aquarium sur meuble : verre, sable, rochers, algues (les poissons sont animés)
      const top = -TILE * 1.1;
      shadow(ctx, 0, 0, w, h);
      ctx.fillStyle = '#2b1a14'; roundRect(ctx, 0, h * 0.35, w, h * 0.65 - 1, 2); ctx.fill();
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(0, h * 0.35, w, 1.4);
      const g = ctx.createLinearGradient(0, top, 0, h * 0.35);
      g.addColorStop(0, '#5fd3e6'); g.addColorStop(1, '#0d4f7a');
      ctx.fillStyle = g; ctx.fillRect(3, top, w - 6, h * 0.35 - top);
      ctx.fillStyle = '#e8d3a0'; ctx.fillRect(3, h * 0.35 - 5, w - 6, 5);
      ctx.fillStyle = '#6b6f7a'; ctx.beginPath(); ctx.ellipse(w * 0.25, h * 0.35 - 5, 6, 4, 0, Math.PI, 0); ctx.ellipse(w * 0.7, h * 0.35 - 5, 8, 5, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#2fae6b'; ctx.lineWidth = 1.6;
      for (const x of [0.12, 0.45, 0.85]) { ctx.beginPath(); ctx.moveTo(w * x, h * 0.35 - 4); ctx.quadraticCurveTo(w * x + 4, h * 0.35 - 14, w * x - 1, top + 14); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(5, top + 2, 3, h * 0.35 - top - 8);
      ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 2; ctx.strokeRect(3, top, w - 6, h * 0.35 - top);
      return true;
    }
    case 'piano': {
      // Piano à queue laqué noir
      shadow(ctx, 0, 0, w, h);
      const top = -TILE * 0.8;
      ctx.fillStyle = '#0d0d12';
      ctx.beginPath(); ctx.moveTo(2, top + 10); ctx.lineTo(w * 0.55, top + 4); ctx.quadraticCurveTo(w - 2, top + 2, w - 3, top + 18); ctx.lineTo(w - 3, h - 10); ctx.lineTo(2, h - 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(6, top + 12, w * 0.5, 2);
      // Clavier
      ctx.fillStyle = '#f6f0e3'; ctx.fillRect(4, h - 14, w - 10, 6);
      ctx.fillStyle = '#0d0d12';
      for (let x = 7; x < w - 8; x += 4.2) if (Math.floor(x / 4.2) % 7 !== 2 && Math.floor(x / 4.2) % 7 !== 6) ctx.fillRect(x, h - 14, 2, 3.6);
      ctx.fillStyle = '#0d0d12'; ctx.fillRect(6, h - 8, 3, 7); ctx.fillRect(w - 10, h - 8, 3, 7);
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(w / 2 - 6, h - 4, 12, 1.4);
      return true;
    }
    case 'telescope': {
      // Longue-vue en laiton sur trépied
      const top = -TILE * 0.9, cx = w / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, h - 3, w * 0.42, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, top + 18); ctx.lineTo(cx - 9, h - 3); ctx.moveTo(cx, top + 18); ctx.lineTo(cx + 9, h - 3); ctx.moveTo(cx, top + 18); ctx.lineTo(cx, h - 2); ctx.stroke();
      ctx.save(); ctx.translate(cx, top + 16); ctx.rotate(-0.45);
      ctx.fillStyle = goldGrad(ctx, -14, 14); roundRect(ctx, -14, -4, 28, 8, 3); ctx.fill();
      ctx.fillStyle = '#8a6a2b'; ctx.fillRect(10, -5, 6, 10);
      ctx.fillStyle = '#bfe6f2'; ctx.beginPath(); ctx.arc(16, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return true;
    }
    case 'photoSpot': {
      // Coin photo : arche de fleurs, cadre doré « KS », projecteur
      const top = -TILE * 1.75;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 2, w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = goldGrad(ctx, 0, w); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(5, h - 2); ctx.lineTo(5, top + 18); ctx.arc(w / 2, top + 18, w / 2 - 5, Math.PI, 0); ctx.lineTo(w - 5, h - 2); ctx.stroke();
      const flowers = ['#ff6f91', '#ffd166', '#f6f0e3', '#c38bff'];
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + (i / 15) * Math.PI, r = w / 2 - 5;
        const x = w / 2 + Math.cos(a) * r, y = top + 18 + Math.sin(a) * r;
        ctx.fillStyle = '#2fae6b'; ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 3, 1.6, a, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = flowers[i % flowers.length]; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#d4af5a'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('KS', w / 2, top + 10);
      return true;
    }
  }
  return false;
}

export function drawOverlay5(ctx: CanvasRenderingContext2D, p: PropDef, t: number, lowFx: boolean): void {
  const w = p.w * TILE, h = p.h * TILE;
  switch (p.kind) {
    case 'shopRack': {
      // Scintillement doux sur le mannequin
      if (lowFx) return;
      const a = 0.4 + 0.4 * Math.sin(t * 2.2);
      ctx.fillStyle = `rgba(255,240,200,${a})`;
      const x = w * 0.82 + Math.sin(t * 1.3) * 5, y = -TILE * 1.45 + 18 + Math.cos(t * 1.7) * 6;
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 1, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 1, y); ctx.closePath(); ctx.fill();
      return;
    }
    case 'infoScreen': {
      // Écran : programme du jour qui défile (heure locale, étages)
      const top = -TILE * 1.3, sx = 5, sy = top + 3, sw = w - 10, sh = 28;
      const g = ctx.createLinearGradient(0, sy, 0, sy + sh); g.addColorStop(0, '#0f2a4a'); g.addColorStop(1, '#091a30');
      ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sh);
      const d = new Date(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
      ctx.fillStyle = '#efdcae'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${hh}:${mm}`, sx + 3, sy + 6);
      ctx.fillStyle = '#1fc7c1'; ctx.textAlign = 'right'; ctx.fillText('KS', sx + sw - 3, sy + 6);
      const lines = ['Casino · 1er', 'Arcade · 2e', 'Cabines · 3e', 'Rooftop · 4e', 'Boutique · RDC'];
      const k = Math.floor(t / 2.5) % lines.length, f = (t % 2.5) / 2.5;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy + 11, sw, sh - 12); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.font = '600 7px system-ui, sans-serif'; ctx.textAlign = 'center';
      const off = f > 0.85 ? (f - 0.85) / 0.15 * 10 : 0;
      ctx.fillText(lines[k], sx + sw / 2, sy + 20 - off);
      ctx.fillText(lines[(k + 1) % lines.length], sx + sw / 2, sy + 30 - off);
      ctx.restore();
      ctx.fillStyle = `rgba(31,199,193,${0.15 + 0.1 * Math.sin(t * 3)})`; ctx.fillRect(sx, sy + sh - 2, sw * ((t % 5) / 5), 2);
      return;
    }
    case 'aquarium': {
      // Poissons qui vont et viennent, bulles ; un poisson doré, plus rare, passe de temps en temps
      const top = -TILE * 1.1, bottom = h * 0.35 - 7;
      const fish: Array<[number, number, string, number]> = [[0.6, 0.3, '#ff9f43', 1], [0.9, 0.55, '#ff6f91', 0.8], [0.45, 0.75, '#ffd166', 1.2], [0.7, 0.45, '#8fb6ff', 0.9]];
      fish.forEach(([sp, yk, c, sz], i) => {
        const u = (Math.sin(t * sp * 0.6 + i * 2) + 1) / 2, dir = Math.cos(t * sp * 0.6 + i * 2) > 0 ? 1 : -1;
        const x = 8 + u * (w - 16), y = top + 6 + yk * (bottom - top - 8) + Math.sin(t * 2 + i) * 1.5;
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, 3.6 * sz, 2 * sz, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - dir * 3.2 * sz, y); ctx.lineTo(x - dir * 6 * sz, y - 2 * sz); ctx.lineTo(x - dir * 6 * sz, y + 2 * sz); ctx.closePath(); ctx.fill();
      });
      if (Math.sin(t * 0.21) > 0.93) {
        const u = (Math.sin(t * 0.9) + 1) / 2, x = 8 + u * (w - 16), y = top + 12;
        ctx.fillStyle = '#efdcae'; ctx.beginPath(); ctx.ellipse(x, y, 4.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.6)'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      }
      if (!lowFx) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.7;
        for (let i = 0; i < 4; i++) {
          const k = ((t * 0.5 + i * 0.27) % 1), x = w * (0.2 + i * 0.18), y = bottom - k * (bottom - top - 4);
          ctx.beginPath(); ctx.arc(x + Math.sin(t * 3 + i) * 1.2, y, 1 + i * 0.2, 0, Math.PI * 2); ctx.stroke();
        }
      }
      return;
    }
    case 'photoSpot': {
      // Projecteur : halo qui respire au pied de l'arche
      const a = 0.12 + 0.06 * Math.sin(t * 1.8);
      const g = ctx.createRadialGradient(w / 2, h - 6, 2, w / 2, h - 6, w * 0.5);
      g.addColorStop(0, `rgba(255,240,200,${a * 2})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(0, h - 6 - w * 0.5, w, w * 0.5 + 6);
      return;
    }
  }
}
