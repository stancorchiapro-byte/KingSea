// Troisième étage : couloirs des logements (20 cabines, n° 301 à 320).
// Chaque joueur se voit attribuer une cabine unique (systems/Cabins.ts) ; l'intérieur arrive en phase 3.
import { GridBuilder, makeStairs, type FloorDef, type PropDef } from '../types';

const W = 40, H = 16;

const grid = new GridBuilder(W, H, '.')
  .border('#')
  // Bloc central de cabines (façade sud visible depuis le second couloir)
  .fill(4, 6, 32, 3, '#')
  // Tapis de couloir
  .fill(2, 3, 36, 2, 'b')
  .fill(2, 11, 36, 2, 'b');
const stairsDown = makeStairs(grid, 'left', 2, 'Arcade');
const stairsUp = makeStairs(grid, 'right', 2, 'Rooftop');
const map = grid.build();

/** Numéros et position des portes. */
export const CABIN_DOORS: Array<{ id: string; tx: number; ty: number }> = [];
let n = 301;
for (const x of [3, 6, 9, 12, 15, 24, 27, 30, 33, 36]) CABIN_DOORS.push({ id: String(n++), tx: x, ty: 0 });
for (const x of [6, 9, 12, 15, 18, 21, 24, 27, 30, 33]) CABIN_DOORS.push({ id: String(n++), tx: x, ty: 7 });

const doors: PropDef[] = CABIN_DOORS.map((d) => ({
  kind: 'cabinDoor', id: d.id, tx: d.tx, ty: d.ty, w: 1, h: 2,
  interact: { id: 'cabin-door', label: `Cabine ${d.id}`, at: { x: d.tx + 0.5, y: d.ty + 2.5 }, radius: 1.3, quietLabel: true },
}));

export const cabinsFloor: FloorDef = {
  id: 'cabins',
  level: 3,
  name: 'Logements',
  short: '3',
  theme: 'cabins',
  description: 'Couloirs des cabines et ta cabine personnelle.',
  available: true,
  map,
  spawn: { x: 20, y: 3.6 },
  props: [
    // Écran du couloir : ta cabine, sa décoration, l'accès direct
    { kind: 'infoScreen', tx: 4, ty: 14, w: 2, h: 1, solid: true, interact: { id: 'cabins-board', label: 'Plan des cabines', at: { x: 5, y: 13.6 }, radius: 1.4 } },
    stairsDown, stairsUp,
    { kind: 'elevator', tx: 18, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 20, y: 2.5 }, radius: 1.7 } },
    ...doors,
    { kind: 'lamp', tx: 4, ty: 1, w: 1, h: 1 },
    { kind: 'lamp', tx: 10, ty: 1, w: 1, h: 1 },
    { kind: 'lamp', tx: 25, ty: 1, w: 1, h: 1 },
    { kind: 'lamp', tx: 31, ty: 1, w: 1, h: 1 },
    { kind: 'porthole', tx: 22, ty: 1, w: 1, h: 1 },
    { kind: 'porthole', tx: 16, ty: 1, w: 1, h: 1 },
    { kind: 'lamp', tx: 11, ty: 8, w: 1, h: 1 },
    { kind: 'lamp', tx: 20, ty: 8, w: 1, h: 1 },
    { kind: 'lamp', tx: 29, ty: 8, w: 1, h: 1 },
    { kind: 'bench', tx: 9, ty: 14, w: 2, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 10, y: 14.2 }, radius: 1.4 } },
    { kind: 'bench', tx: 19, ty: 14, w: 2, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 20, y: 14.2 }, radius: 1.4 } },
    { kind: 'bench', tx: 29, ty: 14, w: 2, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 30, y: 14.2 }, radius: 1.4 } },
    { kind: 'plant', tx: 1, ty: 14, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 38, ty: 14, w: 1, h: 1, solid: true },
    // Tableau d'annonces : visites, sonnette, clés
    { kind: 'noticeBoard', tx: 24, ty: 14, w: 2, h: 1, solid: true, interact: { id: 'notice-board', label: 'Petites annonces', at: { x: 25, y: 13.6 }, radius: 1.4 } },
    // Serrurier : doubles de clé et changement de serrure
    { kind: 'locksmith', tx: 33, ty: 13, w: 3, h: 2, solid: true, interact: { id: 'locksmith', label: 'Serrurier', at: { x: 34.5, y: 12.6 }, radius: 1.7 } },
    { kind: 'plant', tx: 14, ty: 14, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 25, ty: 14, w: 1, h: 1, solid: true },
  ],
  lighting: {
    darkness: 0.3,
    lights: [
      { x: 20, y: 3, radius: 5, color: '255,236,200' },
      { x: 4.5, y: 2.6, radius: 3.5, color: '255,214,150' },
      { x: 10.5, y: 2.6, radius: 3.5, color: '255,214,150' },
      { x: 25.5, y: 2.6, radius: 3.5, color: '255,214,150' },
      { x: 31.5, y: 2.6, radius: 3.5, color: '255,214,150' },
      { x: 11.5, y: 9.6, radius: 4, color: '255,214,150' },
      { x: 20.5, y: 9.6, radius: 4, color: '255,214,150' },
      { x: 29.5, y: 9.6, radius: 4, color: '255,214,150' },
      { x: 2.5, y: 7.5, radius: 3.5, color: '255,236,200' },
      { x: 37.5, y: 7.5, radius: 3.5, color: '255,236,200' },
      { x: 10, y: 13.5, radius: 3, color: '255,226,180' },
      { x: 20, y: 13.5, radius: 3, color: '255,226,180' },
      { x: 30, y: 13.5, radius: 3, color: '255,226,180' },
      { x: 34.5, y: 12.8, radius: 3.4, color: '255,214,150' },
      { x: 1.5, y: 3.5, radius: 3, color: '255,236,200' },
      { x: 38.5, y: 3.5, radius: 3, color: '255,236,200' },
    ],
  },
};
