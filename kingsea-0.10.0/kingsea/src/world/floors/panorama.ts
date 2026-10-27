// Cinquième pont : salon Panorama (réservé aux passagers de niveau 10 : déblocage « feature:panorama »).
// Baies vitrées sur toute la façade, parquet sombre et laiton, carte du ciel interactive, globe, longues-vues,
// piano, fauteuils club. On y accède par l'ascenseur ou l'escalier du rooftop.
import { GridBuilder, makeStairs, type FloorDef } from '../types';

const W = 34, H = 16;

const grid = new GridBuilder(W, H, '.')
  .border('#')
  // Baies vitrées panoramiques (mur nord, de part et d'autre de l'ascenseur)
  .fill(2, 0, 12, 2, 'W')
  .fill(20, 0, 12, 2, 'W')
  // Tapis bordeaux à liseré doré (allée centrale et salon)
  .fill(4, 7, 26, 4, 'c');
const stairsDown = makeStairs(grid, 'left', 6, 'Rooftop');
const map = grid.build();

export const panoramaFloor: FloorDef = {
  id: 'panorama',
  level: 5,
  name: 'Pont Panorama',
  short: '5',
  theme: 'panorama',
  description: 'Salon d’observation (niveau 10) : carte du ciel, globe, longues-vues.',
  available: true,
  map,
  spawn: { x: 17, y: 3.6 },
  props: [
    stairsDown,
    { kind: 'elevator', tx: 15, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 17, y: 2.5 }, radius: 1.7 } },
    // Rambardes laiton devant les baies
    { kind: 'brassRail', tx: 2, ty: 2, w: 12, h: 1 },
    { kind: 'brassRail', tx: 20, ty: 2, w: 12, h: 1 },
    // Longues-vues (horizon de jour, étoiles filantes la nuit)
    { kind: 'telescope', tx: 6, ty: 3, w: 1, h: 1, solid: true, interact: { id: 'telescope', label: 'Longue-vue', at: { x: 6.5, y: 4.6 }, radius: 1.3 } },
    { kind: 'telescope', tx: 27, ty: 3, w: 1, h: 1, solid: true, interact: { id: 'telescope', label: 'Longue-vue', at: { x: 27.5, y: 4.6 }, radius: 1.3 } },
    // Carte du ciel interactive et globe
    { kind: 'starMap', tx: 10, ty: 12, w: 3, h: 1, solid: true, interact: { id: 'star-map', label: 'Carte du ciel', at: { x: 11.5, y: 11.6 }, radius: 1.6 } },
    { kind: 'globe', tx: 22, ty: 12, w: 2, h: 1, solid: true, interact: { id: 'globe', label: 'Globe · itinéraire', at: { x: 23, y: 11.6 }, radius: 1.5 } },
    // Piano à queue et salon club
    { kind: 'piano', tx: 28, ty: 12, w: 3, h: 1, solid: true, interact: { id: 'piano', label: 'Jouer du piano', at: { x: 29.5, y: 11.6 }, radius: 1.6 } },
    { kind: 'loungeChair', tx: 8, ty: 7, w: 1, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 8.5, y: 8.4 }, radius: 1.2, quietLabel: true } },
    { kind: 'coffeeTable', tx: 9, ty: 8, w: 2, h: 1, solid: true },
    { kind: 'loungeChair', tx: 11, ty: 7, w: 1, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 11.5, y: 8.4 }, radius: 1.2, quietLabel: true } },
    { kind: 'loungeChair', tx: 22, ty: 7, w: 1, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 22.5, y: 8.4 }, radius: 1.2, quietLabel: true } },
    { kind: 'coffeeTable', tx: 23, ty: 8, w: 2, h: 1, solid: true },
    { kind: 'loungeChair', tx: 25, ty: 7, w: 1, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 25.5, y: 8.4 }, radius: 1.2, quietLabel: true } },
    { kind: 'sofa', tx: 15, ty: 12, w: 4, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 17, y: 11.6 }, radius: 1.6 } },
    { kind: 'plant', tx: 1, ty: 14, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 32, ty: 14, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 14, ty: 3, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 19, ty: 3, w: 1, h: 1, solid: true },
    { kind: 'lamp', tx: 14, ty: 1, w: 1, h: 1 },
    { kind: 'lamp', tx: 19, ty: 1, w: 1, h: 1 },
  ],
  lighting: {
    darkness: 0.34,
    lights: [
      { x: 17, y: 3, radius: 5, color: '255,236,200' },
      { x: 8, y: 3, radius: 6, color: '150,190,255' },
      { x: 26, y: 3, radius: 6, color: '150,190,255' },
      { x: 9.8, y: 8.6, radius: 3.6, color: '255,206,140' },
      { x: 23.8, y: 8.6, radius: 3.6, color: '255,206,140' },
      { x: 11.5, y: 11.5, radius: 3, color: '255,226,170', flicker: true },
      { x: 23, y: 11.5, radius: 3, color: '255,226,170' },
      { x: 29.5, y: 12.2, radius: 3.4, color: '255,214,150' },
      { x: 17, y: 12, radius: 3.6, color: '255,214,150' },
    ],
  },
};
