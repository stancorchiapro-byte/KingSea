// Icônes des objets (inventaire, boutique) : verre ou assiette pour les consommables, le personnage du joueur
// portant le vêtement pour la garde-robe, un meuble miniature pour les décorations, une étoile pour les objets.
import { drawLook, FEET_Y, type Look } from '../art/characters';
import { drawFurniture, furnitureExtraTop } from '../art/furniture';
import type { FurnitureDef } from '../data/furniture';
import type { ItemDef, WearSlot } from '../data/items';
import { TILE } from '../world/types';
import { drawGlassIcon, drawPlateIcon } from './BarMenu';
import type { Button } from './UIKit';

/** Apparence du joueur avec un élément appliqué (aperçu). */
export function lookWith(base: Look, slot: WearSlot, value: string): Look {
  const l = { ...base };
  switch (slot) {
    case 'outfit': l.outfit = value as Look['outfit']; break;
    case 'pants': l.pants = value as Look['pants']; break;
    case 'shoes': l.shoes = value as Look['shoes']; break;
    case 'hat': l.hat = value as Look['hat']; break;
    case 'glasses': l.glasses = true; l.glassesStyle = value as Look['glassesStyle']; break;
    case 'jewel': l.jewel = value as Look['jewel']; break;
  }
  return l;
}

export function itemIconFor(def: ItemDef, base: Look): Button['icon'] {
  if (def.type === 'food') return drawPlateIcon(def.colors[0], def.colors[1]);
  if (def.type === 'drink') return drawGlassIcon(def.colors[0], def.colors[1]);
  if (def.slot && def.value) {
    const look = lookWith(base, def.slot, def.value);
    // Cadrage sur la partie concernée (unités de l'image du personnage : pieds à y = 46, tête vers y = 6–22)
    const [center, span] = def.slot === 'shoes' ? [40, 16] : def.slot === 'pants' ? [37, 22] : def.slot === 'outfit' ? [27, 38] : def.slot === 'jewel' ? [22, 22] : [14, 18];
    return (ctx, cx, cy, s) => {
      const r = s * 0.78, k = (r * 2) / span;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239,220,174,0.14)'; ctx.fill(); ctx.clip();
      drawLook(ctx, look, 'idle', 'down', 0, cx, cy + (FEET_Y - center) * k, k);
      ctx.restore();
    };
  }
  if (def.id === 'phone') return phoneIcon;
  if (def.id === 'ks-pass') return passIcon;
  // Objet utilisable / cosmétique : étoile scintillante aux couleurs de l'objet
  return (ctx, cx, cy, s) => {
    ctx.save();
    ctx.fillStyle = def.colors[0];
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.16 : s * 0.42, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = def.colors[1]; ctx.beginPath(); ctx.arc(cx + s * 0.28, cy - s * 0.28, s * 0.08, 0, Math.PI * 2); ctx.arc(cx - s * 0.3, cy + s * 0.25, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
}

/** Meuble miniature (décorations de cabine). */
export function furnitureIcon(f: FurnitureDef): Button['icon'] {
  return (ctx, cx, cy, size) => {
    const ex = furnitureExtraTop(f), fw = f.w * TILE, fh = (f.h + ex) * TILE;
    const k = (size * 1.1) / Math.max(fw, fh);
    ctx.save(); ctx.translate(cx - (fw * k) / 2, cy - (fh * k) / 2 + ex * TILE * k); ctx.scale(k, k);
    drawFurniture(ctx, f, fw, f.h * TILE, 0);
    ctx.restore();
  };
}

/** Téléphone KS : coque marine, écran turquoise, pastille dorée. */
export const phoneIcon: NonNullable<Button['icon']> = (ctx, cx, cy, s) => {
  ctx.save();
  const w = s * 0.5, h = s * 0.86;
  ctx.fillStyle = '#0b1424'; ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, s * 0.09); ctx.fill();
  ctx.strokeStyle = '#e5b54a'; ctx.lineWidth = Math.max(1, s * 0.035); ctx.stroke();
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); g.addColorStop(0, '#1fc7c1'); g.addColorStop(1, '#0e5f8a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(cx - w * 0.4, cy - h * 0.4, w * 0.8, h * 0.72, s * 0.04); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(cx - w * 0.28, cy - h * 0.28, w * 0.4, h * 0.1, s * 0.03); ctx.fill();
  ctx.beginPath(); ctx.roundRect(cx - w * 0.1, cy - h * 0.12, w * 0.38, h * 0.1, s * 0.03); ctx.fill();
  ctx.fillStyle = '#e5b54a'; ctx.beginPath(); ctx.arc(cx, cy + h * 0.41, s * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

/** KS Pass Croisière : carte d'embarquement bleu nuit, bande dorée, monogramme KS. */
export const passIcon: NonNullable<Button['icon']> = (ctx, cx, cy, s) => {
  ctx.save();
  const w = s * 0.92, h = s * 0.6;
  ctx.translate(cx, cy); ctx.rotate(-0.12);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, '#0e2a4a'); g.addColorStop(1, '#1b4b7a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, s * 0.07); ctx.fill();
  ctx.strokeStyle = '#e5b54a'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke();
  ctx.fillStyle = '#e5b54a'; ctx.fillRect(-w / 2, h * 0.12, w, h * 0.12);
  ctx.font = `900 ${Math.round(s * 0.24)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', -w * 0.18, -h * 0.12);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.12, -h * 0.26, w * 0.26, h * 0.06); ctx.fillRect(w * 0.12, -h * 0.12, w * 0.2, h * 0.06);
  ctx.restore();
};

/** Clé de cabine : principale dorée (anneau gravé), double argenté. */
export function keyIcon(master: boolean): NonNullable<Button['icon']> {
  return (ctx, cx, cy, s) => {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.6);
    const main = master ? '#e5b54a' : '#c9d3dc', dark = master ? '#9a7426' : '#7c8792';
    ctx.strokeStyle = main; ctx.lineWidth = s * 0.12;
    ctx.beginPath(); ctx.arc(-s * 0.22, 0, s * 0.17, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = main; ctx.fillRect(-s * 0.06, -s * 0.05, s * 0.5, s * 0.1);
    ctx.fillRect(s * 0.26, s * 0.03, s * 0.07, s * 0.14); ctx.fillRect(s * 0.38, s * 0.03, s * 0.06, s * 0.1);
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(-s * 0.22, 0, s * 0.06, 0, Math.PI * 2); ctx.fill();
    if (master) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.12, s * 0.03, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };
}
