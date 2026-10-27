// Accessoires de la refonte : pont Panorama (carte du ciel, globe terrestre, fauteuils club, rambarde laiton).
// Même contrat que props.ts : image statique en cache (unités monde, origine = coin haut-gauche de l'emprise,
// hauteur supplémentaire EXTRA_TOP_6 au-dessus) + surcouche animée facultative.
import type { PropDef, PropKind } from '../world/types';
import { TILE } from '../world/types';
import { roundRect } from './canvas';

const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.18), 0, 0, Math.PI * 2); ctx.fill();
};
const brass = (ctx: CanvasRenderingContext2D, x0: number, x1: number) => {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#8a6a2b'); g.addColorStop(0.5, '#f3dfa8'); g.addColorStop(1, '#8a6a2b');
  return g;
};

export const EXTRA_TOP_6: Partial<Record<PropKind, number>> = { starMap: 1.5, globe: 1.0, loungeChair: 0.5, brassRail: 0.4, fountain: 1.1, steamVent: 0.2, noticeBoard: 1.4 };
export const OVERLAY_6 = new Set<PropKind>(['starMap', 'globe', 'fountain', 'steamVent']);

const STARS: Array<[number, number]> = [[0.12, 0.3], [0.2, 0.18], [0.3, 0.26], [0.38, 0.14], [0.46, 0.3], [0.58, 0.22], [0.66, 0.36], [0.76, 0.2], [0.86, 0.3], [0.52, 0.5], [0.3, 0.55], [0.7, 0.58]];

export function drawStatic6(ctx: CanvasRenderingContext2D, kind: PropKind, w: number, h: number): boolean {
  switch (kind) {
    case 'starMap': {
      // Grande carte céleste encadrée de laiton, sur chevalet
      const top = -TILE * 1.45;
      shadow(ctx, w * 0.1, 0, w * 0.8, h);
      ctx.fillStyle = '#3a2a1e'; ctx.fillRect(w * 0.2, top + TILE * 1.2, 3, h - top - TILE * 1.2 - 2); ctx.fillRect(w * 0.8 - 3, top + TILE * 1.2, 3, h - top - TILE * 1.2 - 2);
      ctx.fillStyle = '#0a1430'; roundRect(ctx, 2, top, w - 4, TILE * 1.35, 4); ctx.fill();
      ctx.strokeStyle = brass(ctx, 0, w); ctx.lineWidth = 2.2; roundRect(ctx, 2, top, w - 4, TILE * 1.35, 4); ctx.stroke();
      // Cercles de coordonnées
      ctx.strokeStyle = 'rgba(229,181,74,0.35)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.ellipse(w / 2, top + TILE * 0.68, w * 0.42, TILE * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, top + TILE * 0.68); ctx.lineTo(w - 6, top + TILE * 0.68); ctx.moveTo(w / 2, top + 4); ctx.lineTo(w / 2, top + TILE * 1.3); ctx.stroke();
      // Constellations (tracés dorés)
      ctx.strokeStyle = 'rgba(243,223,168,0.6)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); STARS.slice(0, 9).forEach(([x, y], i) => { const px = 4 + x * (w - 8), py = top + 4 + y * TILE * 1.3; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of STARS) { ctx.beginPath(); ctx.arc(4 + x * (w - 8), top + 4 + y * TILE * 1.3, 1, 0, Math.PI * 2); ctx.fill(); }
      // Plaque
      ctx.fillStyle = brass(ctx, w * 0.3, w * 0.7); roundRect(ctx, w / 2 - 22, h - 12, 44, 9, 2); ctx.fill();
      ctx.fillStyle = '#141216'; ctx.font = 'bold 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CARTE DU CIEL', w / 2, h - 7.5);
      return true;
    }
    case 'globe': {
      // Globe terrestre ancien sur pied laiton (le globe tourne : surcouche)
      shadow(ctx, w * 0.15, 0, w * 0.7, h);
      ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.moveTo(w * 0.2, h - 2); ctx.lineTo(w * 0.5, h - 10); ctx.lineTo(w * 0.8, h - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = brass(ctx, w * 0.4, w * 0.6); ctx.fillRect(w / 2 - 1.5, -TILE * 0.2, 3, h - 6 + TILE * 0.2);
      ctx.strokeStyle = brass(ctx, 0, w); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w / 2, -TILE * 0.45, w * 0.42, -Math.PI * 0.85, Math.PI * 0.85, true); ctx.stroke();
      return true;
    }
    case 'loungeChair': {
      // Fauteuil club en cuir cognac, capitonné
      shadow(ctx, 0, 0, w, h);
      const top = -TILE * 0.45;
      ctx.fillStyle = '#5a2e18'; roundRect(ctx, 2, top, w - 4, h - top - 4, 7); ctx.fill();
      ctx.fillStyle = '#8a4a26'; roundRect(ctx, 5, top + 3, w - 10, h * 0.55, 5); ctx.fill();
      ctx.fillStyle = '#a5602f'; roundRect(ctx, 6, h * 0.35, w - 12, h * 0.45, 4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (const [x, y] of [[0.35, 0.05], [0.65, 0.05], [0.5, 0.25]]) { ctx.beginPath(); ctx.arc(w * x, top + 6 + y * TILE, 0.9, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#4a2512'; roundRect(ctx, 0, h * 0.25, 5, h * 0.6, 2); ctx.fill(); roundRect(ctx, w - 5, h * 0.25, 5, h * 0.6, 2); ctx.fill();
      return true;
    }
    case 'brassRail': {
      // Rambarde laiton et velours devant les baies vitrées
      const y = -TILE * 0.2;
      ctx.fillStyle = brass(ctx, 0, w); ctx.fillRect(0, y, w, 2.4);
      for (let x = 2; x < w; x += TILE) { ctx.fillRect(x, y, 2.2, h - y - 3); ctx.beginPath(); ctx.arc(x + 1.1, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#6b1a2a'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let x = 2; x + TILE < w + 1; x += TILE) { ctx.moveTo(x + 2, y + 6); ctx.quadraticCurveTo(x + TILE / 2, y + 12, x + TILE, y + 6); }
      ctx.stroke();
      return true;
    }
    case 'fountain': {
      // Fontaine de l'atrium : vasque de marbre à deux étages, liseré doré, sirène stylisée au sommet
      shadow(ctx, 0, 0, w, h);
      const cx = w / 2;
      ctx.fillStyle = '#d8d2c6'; ctx.beginPath(); ctx.ellipse(cx, h * 0.62, w * 0.5, h * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efe9de'; ctx.beginPath(); ctx.ellipse(cx, h * 0.55, w * 0.5, h * 0.33, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = brass(ctx, 0, w); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#1b6f8f'; ctx.beginPath(); ctx.ellipse(cx, h * 0.55, w * 0.43, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      // Fût central et vasque haute
      ctx.fillStyle = '#e4ddd0'; ctx.fillRect(cx - 3, -TILE * 0.55, 6, h * 0.55 + TILE * 0.55);
      ctx.fillStyle = '#efe9de'; ctx.beginPath(); ctx.ellipse(cx, -TILE * 0.5, w * 0.24, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = brass(ctx, cx - w * 0.24, cx + w * 0.24); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#e5b54a'; ctx.beginPath(); ctx.moveTo(cx, -TILE * 1.05); ctx.quadraticCurveTo(cx + 5, -TILE * 0.8, cx + 1, -TILE * 0.6); ctx.lineTo(cx - 1, -TILE * 0.6); ctx.quadraticCurveTo(cx - 5, -TILE * 0.8, cx, -TILE * 1.05); ctx.fill();
      return true;
    }
    case 'steamVent': {
      // Grille d'évent au sol (rivets, lamelles)
      ctx.fillStyle = '#20262c'; roundRect(ctx, 2, 2, w - 4, h - 4, 3); ctx.fill();
      ctx.strokeStyle = '#59636c'; ctx.lineWidth = 1; roundRect(ctx, 2, 2, w - 4, h - 4, 3); ctx.stroke();
      ctx.fillStyle = '#3a434b'; for (let y = 6; y < h - 5; y += 4) ctx.fillRect(5, y, w - 10, 1.6);
      ctx.fillStyle = '#8c969f'; for (const [x, y] of [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    case 'noticeBoard': {
      // Tableau de liège encadré de bois : petites annonces du bord (visites, clés, fêtes)
      const top = -TILE * 1.3;
      shadow(ctx, w * 0.15, 0, w * 0.7, h);
      ctx.fillStyle = '#4a2e1c'; ctx.fillRect(w * 0.25, top + TILE * 1.1, 3, h - top - TILE * 1.1 - 2); ctx.fillRect(w * 0.75 - 3, top + TILE * 1.1, 3, h - top - TILE * 1.1 - 2);
      ctx.fillStyle = '#6b4226'; roundRect(ctx, 2, top, w - 4, TILE * 1.25, 3); ctx.fill();
      ctx.fillStyle = '#c69c6d'; roundRect(ctx, 5, top + 3, w - 10, TILE * 1.25 - 6, 2); ctx.fill();
      const notes: Array<[number, number, string]> = [[0.12, 0.12, '#fffbe6'], [0.45, 0.08, '#cfe8ff'], [0.7, 0.18, '#ffe0e6'], [0.2, 0.52, '#e3ffd9'], [0.55, 0.5, '#fffbe6']];
      for (const [x, y, c] of notes) {
        const nx = 5 + x * (w - 10), ny = top + 3 + y * (TILE * 1.25 - 6);
        ctx.fillStyle = c; ctx.fillRect(nx, ny, (w - 10) * 0.26, TILE * 0.36);
        ctx.fillStyle = '#b0193b'; ctx.beginPath(); ctx.arc(nx + (w - 10) * 0.13, ny + 1.5, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(40,40,60,0.5)'; for (let k = 0; k < 3; k++) ctx.fillRect(nx + 2, ny + 4 + k * 2.6, (w - 10) * 0.2, 0.8);
      }
      return true;
    }
  }
  return false;
}

export function drawOverlay6(ctx: CanvasRenderingContext2D, p: PropDef, t: number, lowFx: boolean): void {
  const w = p.w * TILE;
  switch (p.kind) {
    case 'starMap': {
      // Étoiles qui scintillent, étoile du Roi (plus brillante) qui pulse
      if (lowFx) return;
      const top = -TILE * 1.45;
      STARS.forEach(([x, y], i) => {
        const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * (1.3 + i * 0.21) + i));
        ctx.fillStyle = `rgba(255,248,220,${a})`;
        ctx.beginPath(); ctx.arc(4 + x * (w - 8), top + 4 + y * TILE * 1.3, 1.4, 0, Math.PI * 2); ctx.fill();
      });
      const kx = 4 + 0.52 * (w - 8), ky = top + 4 + 0.5 * TILE * 1.3, r = 2.5 + Math.sin(t * 2) * 0.8;
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, r * 3); g.addColorStop(0, 'rgba(255,230,160,0.9)'); g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, r * 3, 0, Math.PI * 2); ctx.fill();
      return;
    }
    case 'fountain': {
      // Jets d'eau en arc, gouttes, rides sur le bassin, pièces qui brillent au fond
      const cx = w / 2, h = p.h * TILE, top = -TILE * 0.5;
      ctx.strokeStyle = 'rgba(200,240,255,0.75)'; ctx.lineWidth = 1.1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.2, dx = Math.cos(a) * w * 0.34, dy = Math.sin(a) * h * 0.2;
        ctx.beginPath(); ctx.moveTo(cx, top - 2); ctx.quadraticCurveTo(cx + dx * 0.5, top - 12 - Math.sin(t * 6 + i) * 1.5, cx + dx, h * 0.55 + dy); ctx.stroke();
      }
      if (!lowFx) {
        ctx.fillStyle = 'rgba(220,250,255,0.85)';
        for (let i = 0; i < 10; i++) { const k = (t * 1.6 + i * 0.1) % 1; ctx.fillRect(cx + Math.sin(i * 2.3) * w * 0.3 * k, top - 10 + k * (h * 0.6 + 10) + Math.sin(k * Math.PI) * -6, 1.1, 1.1); }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        for (let r = 0; r < 2; r++) { const k = ((t * 0.5 + r * 0.5) % 1); ctx.beginPath(); ctx.ellipse(cx, h * 0.55, w * 0.1 + k * w * 0.3, h * 0.06 + k * h * 0.18, 0, 0, Math.PI * 2); ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1; }
      }
      ctx.fillStyle = `rgba(255,214,120,${0.5 + 0.4 * Math.sin(t * 3)})`;
      for (const [x, y] of [[0.3, 0.6], [0.62, 0.66], [0.5, 0.48], [0.72, 0.52]]) { ctx.beginPath(); ctx.ellipse(w * x, h * y, 1.6, 0.9, 0, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    case 'steamVent': {
      // Panaches de vapeur intermittents
      if (lowFx) return;
      const cx = w / 2, puff = Math.max(0, Math.sin(t * 0.9 + p.tx));
      for (let i = 0; i < 6; i++) {
        const k = ((t * 0.7 + i / 6) % 1);
        ctx.fillStyle = `rgba(220,225,230,${0.28 * (1 - k) * puff})`;
        ctx.beginPath(); ctx.arc(cx + Math.sin(t + i) * 4 * k, 4 - k * TILE * 1.6, 3 + k * 10, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    case 'globe': {
      // Le globe tourne lentement (océans bleus, continents sable qui défilent)
      const cx = w / 2, cy = -TILE * 0.45, r = w * 0.36;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      const sea = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r); sea.addColorStop(0, '#5fb7d6'); sea.addColorStop(1, '#1a4f72');
      ctx.fillStyle = sea; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#e4cf9a';
      const off = (t * 4) % (r * 4);
      for (let k = -1; k < 2; k++) {
        const bx = cx - r * 2 + off + k * r * 4;
        ctx.beginPath(); ctx.ellipse(bx, cy - r * 0.3, r * 0.5, r * 0.3, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bx + r * 0.6, cy + r * 0.35, r * 0.3, r * 0.42, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bx + r * 1.7, cy - r * 0.1, r * 0.55, r * 0.35, 0.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
      return;
    }
  }
}
