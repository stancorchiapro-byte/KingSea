// Sous-sol : salle des machines.
import { GridBuilder, makeStairs, type FloorDef } from '../types';

const W = 30, H = 18;

const grid = new GridBuilder(W, H, 'g')
  .border('#')
  // Passerelles métalliques
  .fill(1, 2, 28, 2, 'm')
  .fill(13, 2, 4, 15, 'm')
  .fill(1, 11, 28, 1, 'y')
  .fill(1, 12, 28, 1, 'm')
  .fill(27, 4, 2, 7, 'm'); // passerelle vers l'escalier
const stairsUp = makeStairs(grid, 'right', 7, 'Hall');
const map = grid.build();

export const engineFloor: FloorDef = {
  id: 'engine',
  level: -1,
  name: 'Salle des machines',
  short: 'S-1',
  theme: 'engine',
  description: 'Moteurs, générateurs et secrets des mécaniciens.',
  available: true,
  map,
  spawn: { x: 15, y: 3.6 },
  props: [
    stairsUp,
    { kind: 'elevator', tx: 13, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 15, y: 2.5 }, radius: 1.7 } },
    { kind: 'pipesWall', tx: 1, ty: 0, w: 12, h: 2 },
    { kind: 'pipesWall', tx: 17, ty: 0, w: 4, h: 2 },
    { kind: 'controlPanel', tx: 21, ty: 0, w: 3, h: 2, interact: { id: 'engine-panel', label: 'Panneau', at: { x: 22.5, y: 2.5 }, radius: 1.7 } },
    { kind: 'pipesWall', tx: 24, ty: 0, w: 5, h: 2 },
    { kind: 'fan', tx: 3, ty: 0, w: 2, h: 2 },
    { kind: 'fan', tx: 26, ty: 0, w: 2, h: 2 },
    // Moteurs principaux
    { kind: 'engine', tx: 3, ty: 5, w: 7, h: 5, solid: true, hitbox: { x: 0, y: 1, w: 7, h: 4 } },
    { kind: 'engine', tx: 20, ty: 5, w: 7, h: 5, solid: true, hitbox: { x: 0, y: 1, w: 7, h: 4 } },
    // Générateurs
    { kind: 'generator', tx: 2, ty: 14, w: 3, h: 2, solid: true, hitbox: { x: 0, y: 0.5, w: 3, h: 1.5 } },
    { kind: 'generator', tx: 20, ty: 14, w: 3, h: 2, solid: true, hitbox: { x: 0, y: 0.5, w: 3, h: 1.5 } },
    // Poste du mécanicien
    { kind: 'desk', tx: 8, ty: 14, w: 2, h: 1, solid: true },
    { kind: 'logbook', tx: 8, ty: 14, w: 2, h: 1, interact: { id: 'logbook', label: 'Journal', at: { x: 9, y: 15.6 }, radius: 1.6 } },
    { kind: 'crate', tx: 25, ty: 14, w: 1, h: 1, solid: true },
    { kind: 'crate', tx: 26, ty: 14, w: 1, h: 1, solid: true },
    { kind: 'crate', tx: 26, ty: 13, w: 1, h: 1, solid: true },
    { kind: 'valve', tx: 11, ty: 13, w: 1, h: 1, solid: true },
    // Objet caché : visible seulement avec l'éclairage de maintenance, une seule fois.
    { kind: 'compass', id: 'golden-compass', tx: 27, ty: 15, w: 1, h: 1, requiresFlag: 'engine.lights', collectible: true,
      interact: { id: 'compass', label: 'Ramasser', at: { x: 27.5, y: 15.6 }, radius: 1.4 } },
  ],
  lighting: {
    darkness: 0.74,
    lights: [
      { x: 15, y: 3, radius: 5, color: '255,214,150' },
      { x: 22.5, y: 2.6, radius: 3, color: '90,255,190', flicker: true },
      { x: 6.5, y: 8, radius: 4.5, color: '255,150,70' },
      { x: 23.5, y: 8, radius: 4.5, color: '255,150,70' },
      { x: 9, y: 14.5, radius: 3, color: '255,230,160', flicker: true },
      { x: 15, y: 12, radius: 4, color: '120,200,255' },
      { x: 28, y: 8.5, radius: 3, color: '255,214,150' },
      // Éclairage de maintenance (panneau de contrôle)
      { x: 4, y: 14.5, radius: 5, color: '160,220,255', flag: 'engine.lights' },
      { x: 25, y: 14.5, radius: 5.5, color: '160,220,255', flag: 'engine.lights' },
      { x: 27.5, y: 15.5, radius: 2, color: '255,215,90', flag: 'engine.lights' },
    ],
  },
};
