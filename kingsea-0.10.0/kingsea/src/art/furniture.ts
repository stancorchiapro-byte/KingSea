// Dessin des meubles de la cabine personnalisable (aucune image : tout est tracé à partir du catalogue
// data/furniture.ts). Contrat identique aux autres accessoires : unités monde, origine = coin haut-gauche de
// l'emprise au sol, hauteur supplémentaire disponible au-dessus (furnitureExtraTop). `rot` = tourné d'un quart.
import type { FurnitureDef } from '../data/furniture';
import { TILE } from '../world/types';
import { roundRect } from './canvas';

/** Hauteur dessinée au-dessus de l'emprise (en cases), selon le type d'objet. */
export function furnitureExtraTop(f: FurnitureDef): number {
  if (f.wall) return 0;
  switch (f.category) {
    case 'lit': return f.id === 'bed-canopy' ? 1.6 : 0.6;
    case 'canapé': return 0.7;
    case 'table': return f.id === 'table-holo' ? 0.9 : 0.35;
    case 'rangement': return 1.4;
    case 'éclairage': return f.id === 'chandelier' ? 2.2 : 1.6;
    case 'plante': return f.id === 'plant-palm' ? 1.9 : 1.1;
    case 'décoration': return f.id === 'piano' ? 0.9 : 0.8;
    case 'collection': return 1.0;
    case 'tapis': return 0;
  }
}

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};
const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, Math.max(3, h * 0.16), 0, 0, Math.PI * 2); ctx.fill();
};
const legs = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, c: string) => {
  ctx.fillStyle = c; ctx.fillRect(x + 2, y, 2.5, hgt); ctx.fillRect(x + w - 4.5, y, 2.5, hgt);
};

/** Dessine l'objet `f` dans une emprise w × h (px monde). */
export function drawFurniture(ctx: CanvasRenderingContext2D, f: FurnitureDef, w: number, h: number, rot: 0 | 1): void {
  const [a, b, c] = f.colors;
  const T = TILE;
  if (f.wall) return drawWall(ctx, f, w, h);
  switch (f.category) {
    case 'tapis': {
      roundRect(ctx, 2, 2, w - 4, h - 4, 4); ctx.fillStyle = a; ctx.fill();
      ctx.strokeStyle = b; ctx.lineWidth = 2; roundRect(ctx, 6, 6, w - 12, h - 12, 3); ctx.stroke();
      ctx.fillStyle = c;
      if (f.id === 'rug-persian') {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, (w / 2 - 14) * (1 - i * 0.3), (h / 2 - 12) * (1 - i * 0.3), 0, 0, Math.PI * 2); ctx.strokeStyle = i % 2 ? b : c; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.fillStyle = b; for (let x = 4; x < w - 4; x += 4) { ctx.fillRect(x, 0, 1.2, 3); ctx.fillRect(x, h - 3, 1.2, 3); }
      } else {
        ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = b; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, h / 2 - Math.min(w, h) * 0.3); ctx.lineTo(w / 2, h / 2 + Math.min(w, h) * 0.3); ctx.moveTo(w / 2 - Math.min(w, h) * 0.3, h / 2); ctx.lineTo(w / 2 + Math.min(w, h) * 0.3, h / 2); ctx.stroke();
      }
      return;
    }
    case 'lit': {
      const top = -T * (f.id === 'bed-canopy' ? 1.6 : 0.6);
      shadow(ctx, 0, 6, w, h - 8);
      if (f.id === 'bed-canopy') {
        ctx.fillStyle = c; ctx.fillRect(2, top, 3, h - top - 4); ctx.fillRect(w - 5, top, 3, h - top - 4);
        ctx.fillStyle = b; ctx.fillRect(0, top, w, 4);
        ctx.fillStyle = shade(a, 0.1); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(4, top + 4); ctx.quadraticCurveTo(10, top + 30, 5, top + 52); ctx.lineTo(4, top + 4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w - 4, top + 4); ctx.quadraticCurveTo(w - 10, top + 30, w - 5, top + 52); ctx.lineTo(w - 4, top + 4); ctx.fill(); ctx.globalAlpha = 1;
      }
      const hb = f.id === 'bed-capsule' ? 26 : 20, y0 = f.id === 'bed-canopy' ? -T * 0.6 : top;
      ctx.fillStyle = f.id === 'bed-capsule' ? a : c; roundRect(ctx, 0, y0, w, hb, f.id === 'bed-capsule' ? 12 : 5); ctx.fill();
      if (f.id === 'bed-capsule') { ctx.fillStyle = b; ctx.fillRect(6, y0 + hb - 5, w - 12, 2); }
      ctx.fillStyle = f.id === 'bed-canopy' ? c : '#f4f7fa'; roundRect(ctx, 3, y0 + 13, w - 6, h - y0 - 17, 6); ctx.fill();
      ctx.fillStyle = '#ffffff'; roundRect(ctx, 8, y0 + 17, w / 2 - 12, 14, 5); ctx.fill(); roundRect(ctx, w / 2 + 4, y0 + 17, w / 2 - 12, 14, 5); ctx.fill();
      ctx.fillStyle = f.id === 'bed-canopy' ? a : b; roundRect(ctx, 3, y0 + 36, w - 6, h - y0 - 40, 6); ctx.fill();
      ctx.fillStyle = f.style === 'luxe' ? '#d4af5a' : shade(f.id === 'bed-canopy' ? a : b, 0.25); ctx.fillRect(3, y0 + 36, w - 6, 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
      for (let y = y0 + 46; y < h - 8; y += 8) { ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(w - 8, y); ctx.stroke(); }
      return;
    }
    case 'canapé': {
      shadow(ctx, 0, 4, w, h - 4);
      if (f.id === 'chair-pod') {
        ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.3, w / 2 - 2, h * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = b; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.45, w / 2 - 7, h * 0.48, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c; ctx.fillRect(w / 2 - 2, h * 0.9, 4, h * 0.1);
        return;
      }
      const back = -T * 0.7, wide = (rot ? h : w) > T * 1.5;
      ctx.fillStyle = shade(a, -0.2); roundRect(ctx, 2, back, w - 4, 18, 6); ctx.fill();
      ctx.fillStyle = a; roundRect(ctx, 0, back + 12, w, h - back - 16, 6); ctx.fill();
      ctx.fillStyle = shade(a, 0.15);
      const n = wide ? 2 : 1;
      for (let i = 0; i < n; i++) { roundRect(ctx, 6 + i * (w - 12) / n, back + 15, (w - 12) / n - 3, 13, 4); ctx.fill(); }
      ctx.fillStyle = b; roundRect(ctx, -1, back + 9, 7, h - back - 12, 3); ctx.fill(); roundRect(ctx, w - 6, back + 9, 7, h - back - 12, 3); ctx.fill();
      if (f.id === 'bench-oak') { ctx.fillStyle = c; ctx.fillRect(4, back + 28, w - 8, 2); }
      legs(ctx, 0, h - 5, w, 4, f.style === 'luxe' ? '#d4af5a' : c);
      return;
    }
    case 'table': {
      shadow(ctx, 4, 4, w - 8, h - 6);
      if (f.id === 'table-holo') {
        ctx.fillStyle = b; roundRect(ctx, 4, h * 0.2, w - 8, h * 0.55, 6); ctx.fill();
        ctx.strokeStyle = a; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(w / 2 - 14, h * 0.3); ctx.lineTo(w / 2 + 14, h * 0.3); ctx.lineTo(w / 2 + 6, -T * 0.8); ctx.lineTo(w / 2 - 6, -T * 0.8); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(w / 2, -T * 0.4, 7, 0, Math.PI * 2); ctx.stroke();
        return;
      }
      if (f.id === 'bar-cart') {
        ctx.strokeStyle = a; ctx.lineWidth = 1.6; roundRect(ctx, 5, -T * 0.25, w - 10, h * 0.85 + T * 0.25, 3); ctx.stroke();
        ctx.fillStyle = b; ctx.fillRect(6, h * 0.25, w - 12, 3); ctx.fillRect(6, h * 0.6, w - 12, 3);
        ctx.fillStyle = '#1f3d2a'; ctx.fillRect(9, h * 0.25 - 12, 4, 12); ctx.fillStyle = a; ctx.fillRect(9, h * 0.25 - 14, 4, 3);
        ctx.fillStyle = c; ctx.fillRect(17, h * 0.25 - 8, 3, 8); ctx.fillRect(22, h * 0.25 - 8, 3, 8);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(8, h - 3, 2.5, 0, Math.PI * 2); ctx.arc(w - 8, h - 3, 2.5, 0, Math.PI * 2); ctx.fill();
        return;
      }
      const glass = f.id === 'table-glass';
      legs(ctx, 2, 10, w - 4, h - 12, b);
      ctx.fillStyle = glass ? 'rgba(191,230,242,0.7)' : a; roundRect(ctx, 2, 0, w - 4, 12, 3); ctx.fill();
      ctx.fillStyle = glass ? 'rgba(255,255,255,0.6)' : shade(a, 0.2); ctx.fillRect(4, 1.5, w - 8, 2);
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(w * 0.35, 5, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill(); // tasse / livre
      return;
    }
    case 'rangement': {
      const top = -T * 1.4;
      shadow(ctx, 0, 2, w, h - 2);
      ctx.fillStyle = a; roundRect(ctx, 2, top, w - 4, h - top - 3, 2); ctx.fill();
      ctx.fillStyle = b;
      for (let i = 1; i < 4; i++) ctx.fillRect(4, top + i * ((h - top) / 4), w - 8, 2);
      const books = ['#6e1a2b', '#123d6e', '#d4af5a', '#2e8b57', '#f6f0e3'];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { ctx.fillStyle = books[(r * 2 + i) % books.length]; ctx.fillRect(6 + i * 5, top + (r + 1) * ((h - top) / 4) - 9, 4, 9 - ((i + r) % 3)); }
      ctx.fillStyle = c; ctx.fillRect(2, h - 4, w - 4, 2);
      return;
    }
    case 'éclairage': {
      if (f.id === 'chandelier') {
        const top = -T * 2.2;
        ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, top); ctx.lineTo(w / 2, top + 14); ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(w / 2, top + 18, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.beginPath(); ctx.moveTo(w / 2 - 12 + i * 4, top + 20); ctx.lineTo(w / 2 - 10 + i * 4, top + 30 + (i % 3) * 3); ctx.lineTo(w / 2 - 8 + i * 4, top + 20); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,240,190,0.25)'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.6, w / 2 - 2, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        return;
      }
      const top = -T * 1.6;
      shadow(ctx, w * 0.25, h - 8, w * 0.5, 6);
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(w / 2, h - 5, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = f.id === 'lamp-deco' ? a : c; ctx.fillRect(w / 2 - 1.2, top + 18, 2.4, h - top - 22);
      if (f.id === 'lamp-paper') {
        ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(w / 2, top + 14, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(w / 2 - 9, top + 14 + i * 4); ctx.lineTo(w / 2 + 9, top + 14 + i * 4); ctx.stroke(); }
      } else {
        ctx.fillStyle = f.id === 'lamp-deco' ? c : a;
        ctx.beginPath(); ctx.moveTo(w / 2 - 6, top + 6); ctx.lineTo(w / 2 + 6, top + 6); ctx.lineTo(w / 2 + 11, top + 20); ctx.lineTo(w / 2 - 11, top + 20); ctx.closePath(); ctx.fill();
        if (f.id === 'lamp-deco') { ctx.strokeStyle = a; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      ctx.fillStyle = b; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(w / 2, top + 21, 8, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      return;
    }
    case 'plante': {
      const palm = f.id === 'plant-palm', bonsai = f.id === 'bonsai';
      shadow(ctx, 5, h - 12, w - 10, 10);
      ctx.fillStyle = palm ? b : c;
      ctx.beginPath(); ctx.moveTo(8, h - 16); ctx.lineTo(w - 8, h - 16); ctx.lineTo(w - 10, h - 2); ctx.lineTo(10, h - 2); ctx.closePath(); ctx.fill();
      if (bonsai) {
        ctx.strokeStyle = b; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w / 2, h - 16); ctx.quadraticCurveTo(w / 2 - 8, h - 26, w / 2 + 2, h - 36); ctx.stroke();
        ctx.fillStyle = a; for (const [x, y, r] of [[w / 2 - 8, h - 36, 8], [w / 2 + 6, h - 40, 9], [w / 2, h - 48, 7]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
        return;
      }
      const cx = w / 2, cy = h - 16, n = palm ? 7 : 9, len = palm ? 30 : 18;
      if (palm) { ctx.fillStyle = '#8a6a2b'; ctx.fillRect(cx - 2, cy - 30, 4, 30); }
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI + (i / (n - 1)) * Math.PI, L = len + (i % 3) * 4;
        ctx.save(); ctx.translate(cx, palm ? cy - 30 : cy); ctx.rotate(ang);
        ctx.fillStyle = i % 2 ? a : shade(a, 0.15); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -6, L, 2); ctx.quadraticCurveTo(L * 0.5, 4, 0, 0); ctx.fill(); ctx.restore();
      }
      return;
    }
    case 'décoration': {
      if (f.id === 'piano') {
        shadow(ctx, 0, 4, w, h - 4);
        ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(w - 4, 4); ctx.quadraticCurveTo(w, h * 0.5, w * 0.6, h - 4); ctx.lineTo(2, h - 4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = a; ctx.save(); ctx.translate(4, 4); ctx.rotate(-0.5); ctx.fillRect(0, -T * 0.8, w * 0.75, 3); ctx.restore();
        ctx.fillStyle = b; ctx.fillRect(4, h - 12, w * 0.5, 7);
        ctx.fillStyle = a; for (let i = 0; i < 9; i++) ctx.fillRect(6 + i * (w * 0.5 - 4) / 9, h - 12, 2, 4);
        return;
      }
      if (f.id === 'aquarium') {
        shadow(ctx, 0, 2, w, h - 2);
        ctx.fillStyle = '#1d1820'; ctx.fillRect(2, h * 0.45, w - 4, h * 0.55 - 2);
        ctx.fillStyle = shade(a, -0.1); ctx.globalAlpha = 0.85; ctx.fillRect(3, -T * 0.7, w - 6, h * 0.45 + T * 0.7); ctx.globalAlpha = 1;
        ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.strokeRect(3, -T * 0.7, w - 6, h * 0.45 + T * 0.7);
        ctx.fillStyle = '#ffb062'; ctx.beginPath(); ctx.ellipse(w * 0.3, -T * 0.3, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6fae'; ctx.beginPath(); ctx.ellipse(w * 0.65, -T * 0.05, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2e8b57'; for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * (w - 16) / 4, h * 0.3, 2, h * 0.15);
        return;
      }
      // Objet décoratif générique (vase)
      shadow(ctx, 6, h - 10, w - 12, 8);
      ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(w / 2, h - 14, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(w / 2 - 4, h - 30, 8, 6);
      return;
    }
    case 'collection': {
      // Socle + objet
      shadow(ctx, 4, h - 8, w - 8, 7);
      ctx.fillStyle = '#1d1820'; roundRect(ctx, 6, h - 14, w - 12, 12, 2); ctx.fill();
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(6, h - 14, w - 12, 1.5);
      const top = h - 14;
      if (f.id === 'statue-gold') {
        ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(w / 2, top - 8, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w / 2, top - 20, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w / 2, top); ctx.quadraticCurveTo(w / 2 + 10, top - 2, w / 2 + 8, top - 8); ctx.lineTo(w / 2 + 3, top - 2); ctx.fill();
      } else if (f.id === 'yacht-model') {
        ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(5, top - 6); ctx.lineTo(w - 4, top - 6); ctx.lineTo(w - 9, top); ctx.lineTo(8, top); ctx.closePath(); ctx.fill();
        ctx.fillStyle = b; ctx.fillRect(5, top - 6, w - 9, 1.5);
        ctx.fillStyle = a; ctx.fillRect(10, top - 11, 10, 5); ctx.fillStyle = c; ctx.fillRect(w / 2, top - 24, 1.2, 18);
      } else if (f.id === 'globe-antique') {
        ctx.fillStyle = b; ctx.fillRect(w / 2 - 1, top - 6, 2, 6);
        ctx.fillStyle = a; ctx.beginPath(); ctx.arc(w / 2, top - 15, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(w / 2, top - 15, 11, -2.4, 0.8); ctx.stroke();
        ctx.fillStyle = shade(a, -0.3); ctx.beginPath(); ctx.ellipse(w / 2 - 2, top - 17, 3, 4, 0.4, 0, Math.PI * 2); ctx.fill();
      } else if (f.id === 'telescope') {
        ctx.strokeStyle = b; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w / 2, top - 10); ctx.lineTo(w / 2 - 6, top); ctx.moveTo(w / 2, top - 10); ctx.lineTo(w / 2 + 6, top); ctx.stroke();
        ctx.save(); ctx.translate(w / 2, top - 12); ctx.rotate(-0.5); ctx.fillStyle = a; ctx.fillRect(-12, -2.5, 24, 5); ctx.fillStyle = c; ctx.fillRect(8, -3, 4, 6); ctx.restore();
      } else {
        // Trophée
        ctx.fillStyle = a; ctx.fillRect(w / 2 - 1.5, top - 8, 3, 8);
        ctx.beginPath(); ctx.moveTo(w / 2 - 8, top - 22); ctx.lineTo(w / 2 + 8, top - 22); ctx.quadraticCurveTo(w / 2 + 7, top - 9, w / 2, top - 8); ctx.quadraticCurveTo(w / 2 - 7, top - 9, w / 2 - 8, top - 22); ctx.fill();
        ctx.strokeStyle = a; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w / 2 - 9, top - 17, 3, 1.5, 4.7); ctx.arc(w / 2 + 9, top - 17, 3, -1.6, 1.6); ctx.stroke();
        ctx.fillStyle = b; ctx.fillRect(w / 2 - 6, top - 3, 12, 3);
      }
      return;
    }
  }
}

function drawWall(ctx: CanvasRenderingContext2D, f: FurnitureDef, w: number, h: number): void {
  const [a, b, c] = f.colors;
  if (f.id === 'lamp-neon') {
    ctx.save(); ctx.shadowColor = a; ctx.shadowBlur = 8; ctx.strokeStyle = a; ctx.lineWidth = 2;
    ctx.font = `900 ${h * 0.5}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('KS', w / 2, h * 0.45); ctx.shadowColor = b; ctx.strokeStyle = b; ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, w - 8, h - 10); ctx.restore();
    return;
  }
  // Tableau encadré
  ctx.fillStyle = c; ctx.fillRect(3, 3, w - 6, h - 9);
  ctx.fillStyle = a; ctx.fillRect(6, 6, w - 12, h - 15);
  ctx.fillStyle = b; ctx.beginPath(); ctx.moveTo(6, h - 12); ctx.quadraticCurveTo(w / 2, h * 0.35, w - 6, h - 14); ctx.lineTo(w - 6, h - 9); ctx.lineTo(6, h - 9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(w / 2, 9); ctx.lineTo(w / 2 + 5, h * 0.55); ctx.lineTo(w / 2 - 3, h * 0.55); ctx.fill();
}
