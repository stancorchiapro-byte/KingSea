// Machine à sous « Trésors engloutis » : 3 rouleaux, ligne centrale.
// Taux de retour théorique calculé exactement (tests) : environ 94 % — affiché dans l'interface.
import { randInt, type Rng } from './rng';

export type SlotSymbol = 'perle' | 'coquillage' | 'ancre' | 'coffre' | 'couronne' | 'ks';
export const SYMBOL_GLYPH: Record<SlotSymbol, string> = { perle: '⚪', coquillage: '🐚', ancre: '⚓', coffre: '💰', couronne: '👑', ks: 'KS' };

/** Bande d'un rouleau (32 cases) : perle ×10, coquillage ×8, ancre ×6, coffre ×4, couronne ×3, KS ×1. */
export const STRIP: SlotSymbol[] = [
  'perle', 'coquillage', 'ancre', 'perle', 'coffre', 'coquillage', 'perle', 'couronne', 'ancre', 'perle', 'coquillage', 'ks',
  'perle', 'ancre', 'coffre', 'coquillage', 'perle', 'couronne', 'ancre', 'perle', 'coquillage', 'coffre', 'perle', 'ancre',
  'coquillage', 'perle', 'couronne', 'coquillage', 'ancre', 'perle', 'coffre', 'coquillage',
];

/** Gains (retour pour 1 misé). */
export const PAYTABLE: Record<SlotSymbol, number> = { ks: 500, couronne: 100, coffre: 40, ancre: 15, coquillage: 8, perle: 4 };
export const TWO_PEARLS = 3;   // deux perles en tête de ligne
export const ONE_PEARL = 1;    // une perle sur le premier rouleau : mise remboursée

export function lineReturn(line: SlotSymbol[]): number {
  const [a, b, c] = line;
  if (a === b && b === c) return PAYTABLE[a];
  if (a === 'perle' && b === 'perle') return TWO_PEARLS;
  if (a === 'perle') return ONE_PEARL;
  return 0;
}

/** Positions d'arrêt aléatoires ; la ligne gagnante est la rangée centrale. */
export function spinReels(rng: Rng): number[] { return [0, 1, 2].map(() => randInt(rng, STRIP.length)); }
export const symbolAt = (stop: number, offset = 0): SlotSymbol => STRIP[((stop + offset) % STRIP.length + STRIP.length) % STRIP.length];
export const centerLine = (stops: number[]): SlotSymbol[] => stops.map((s) => symbolAt(s));

/** Taux de retour théorique exact (énumération de toutes les combinaisons). */
export function theoreticalRtp(): number {
  const n = STRIP.length;
  let sum = 0;
  for (const a of STRIP) for (const b of STRIP) for (const c of STRIP) sum += lineReturn([a, b, c]);
  return sum / (n * n * n);
}
