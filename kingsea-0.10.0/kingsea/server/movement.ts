// Validation des déplacements : vitesse maximale (avec marge pour la latence), pas de traversée des murs,
// meubles ou bords de l'étage. Un déplacement refusé renvoie le joueur à sa dernière position valide.
import { WALK_SPEED } from '../src/entities/Player';
import type { TileMap } from '../src/world/TileMap';

export interface Tracked { x: number; y: number; t: number }

/** Vitesse maximale tolérée (unités/s) : marche, glissade du toboggan comprise, plus une marge. */
export const MAX_SPEED = WALK_SPEED * 2.2;
const BURST = 48; // marge fixe : s'asseoir/se relever déplace d'environ une tuile

export function validateMove(prev: Tracked, x: number, y: number, now: number, map: TileMap): { ok: boolean; reason?: string } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'position invalide' };
  if (x < 0 || y < 0 || x > map.pixelWidth || y > map.pixelHeight) return { ok: false, reason: 'hors de l’étage' };
  const dt = Math.max(0, Math.min(2, (now - prev.t) / 1000));
  const d = Math.hypot(x - prev.x, y - prev.y);
  if (d > MAX_SPEED * dt + BURST) return { ok: false, reason: 'trop rapide' };
  // Le joueur peut être assis sur un siège (au-dessus d'un meuble) : seule la case doit être praticable
  const tx = Math.floor(x / 32), ty = Math.floor((y - 2) / 32);
  if (map.isSolidTile(tx, ty)) return { ok: false, reason: 'dans un mur' };
  return { ok: true };
}
