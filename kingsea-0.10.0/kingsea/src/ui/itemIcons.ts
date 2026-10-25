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
