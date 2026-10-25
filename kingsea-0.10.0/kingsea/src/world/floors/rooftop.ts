// Quatrième étage : rooftop, piscine et espaces festifs (en plein air, garde-corps vitré sur l'océan).
import { GridBuilder, makeStairs, type FloorDef, type PropDef } from '../types';

const W = 36, H = 22;

const grid = new GridBuilder(W, H, 'd')
  .border('G')
  // Édicule de l'ascenseur
  .fill(16, 0, 4, 2, '#')
  // Plage de la piscine (pierre claire) puis margelle et bassin
  .fill(8, 4, 18, 10, '.')
  .fill(9, 5, 16, 8, 'e')
  .fill(10, 6, 14, 6, 'p')
  // Piste de danse de la boîte de nuit
  .fill(27, 14, 8, 7, 'f');
const stairsDown = makeStairs(grid, 'left', 9, 'Logements');
const map = grid.build();

const transats: PropDef[] = [];
const parasols: PropDef[] = [];
for (const x of [9, 12, 15, 18, 21, 24]) transats.push({ kind: 'transat', tx: x, ty: 14, w: 1, h: 2, solid: true, interact: { id: 'sit', label: 'S’allonger', at: { x: x + 0.5, y: 16.4 }, radius: 1.3, quietLabel: true } });
for (const x of [10, 13, 16, 19, 22]) parasols.push({ kind: 'parasol', tx: x, ty: 14, w: 2, h: 1, solid: true, hitbox: { x: 0.85, y: 0.6, w: 0.3, h: 0.4 } });

export const rooftopFloor: FloorDef = {
  id: 'rooftop',
  level: 4,
  name: 'Rooftop & piscine',
  short: '4',
  theme: 'rooftop',
  description: 'Piscine, transats, bar, snack et boîte de nuit.',
  available: true,
  map,
  spawn: { x: 18, y: 3.2 },
  props: [
    // Longue-vue : horizon le jour, étoiles filantes la nuit (secret)
    { kind: 'telescope', tx: 33, ty: 8, w: 1, h: 1, solid: true, interact: { id: 'telescope', label: 'Longue-vue', at: { x: 33.5, y: 9.6 }, radius: 1.3 } },
    stairsDown,
    { kind: 'elevator', tx: 16, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 18, y: 2.5 }, radius: 1.7 } },
    { kind: 'lifebuoy', tx: 6, ty: 1, w: 1, h: 1 },
    { kind: 'lifebuoy', tx: 29, ty: 1, w: 1, h: 1 },
    // Bar extérieur
    { kind: 'bartender', tx: 4, ty: 3, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'tikiBar', tx: 2, ty: 5, w: 5, h: 1, solid: true, interact: { id: 'rooftop-bar', label: 'Bar', at: { x: 4.5, y: 6.6 }, radius: 1.9 } },
    // Snack
    { kind: 'cook', tx: 3, ty: 14, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'snackStand', tx: 2, ty: 16, w: 4, h: 1, solid: true, interact: { id: 'snack', label: 'Snack', at: { x: 4, y: 17.6 }, radius: 1.9 } },
    // Piscine
    { kind: 'slide', tx: 26, ty: 5, w: 3, h: 3, solid: true, hitbox: { x: 0, y: 1, w: 3, h: 2 }, interact: { id: 'slide', label: 'Toboggan', at: { x: 28, y: 8.6 }, radius: 1.5 } },
    ...transats, ...parasols,
    // Boîte de nuit
    { kind: 'speaker', tx: 27, ty: 12, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1, w: 1, h: 1 } },
    { kind: 'speaker', tx: 34, ty: 12, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1, w: 1, h: 1 } },
    { kind: 'dj', tx: 31, ty: 11, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'djBooth', tx: 29, ty: 13, w: 4, h: 1, solid: true, interact: { id: 'dj', label: 'DJ · changer de style', at: { x: 31, y: 14.6 }, radius: 1.6 } },
    // Salon VIP (niveau 5 ou déblocage « feature:vip-lounge ») : cordons de velours, canapés, brasero, bar à champagne
    { kind: 'velvetRope', tx: 11, ty: 17, w: 14, h: 1, solid: true, hitbox: { x: 0, y: 0.5, w: 14, h: 0.5 } },
    { kind: 'velvetRope', tx: 11, ty: 18, w: 1, h: 3, solid: true, interact: { id: 'vip-gate', label: 'Sortir du salon', at: { x: 12.4, y: 20.5 }, radius: 0.9 } },
    { kind: 'velvetRope', tx: 24, ty: 18, w: 1, h: 3, solid: true },
    { kind: 'vipSign', tx: 10, ty: 17, w: 1, h: 1, solid: true, hitbox: { x: 0.3, y: 0.5, w: 0.4, h: 0.5 }, interact: { id: 'vip-gate', label: 'Salon VIP', at: { x: 10.4, y: 18.7 }, radius: 1.1 } },
    { kind: 'lightPole', id: '13', tx: 11, ty: 17, w: 1, h: 1 },
    { kind: 'lightPole', id: '0', tx: 24, ty: 17, w: 1, h: 1 },
    { kind: 'loungeSofa', tx: 12, ty: 18, w: 3, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 13.5, y: 19.6 }, radius: 1.4 } },
    { kind: 'fireTable', tx: 15, ty: 19, w: 3, h: 1, solid: true },
    { kind: 'loungeSofa', tx: 18, ty: 18, w: 3, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 19.5, y: 19.6 }, radius: 1.4 } },
    { kind: 'champagneBar', tx: 21, ty: 18, w: 3, h: 1, solid: true, interact: { id: 'vip-bar', label: 'Bar à champagne', at: { x: 22.5, y: 19.6 }, radius: 1.5 } },
    // Guirlandes au-dessus de la piscine
    { kind: 'lightPole', id: '17', tx: 8, ty: 4, w: 1, h: 1 },
    { kind: 'lightPole', id: '0', tx: 25, ty: 4, w: 1, h: 1 },
    // Végétation
    { kind: 'palm', tx: 1, ty: 19, w: 1, h: 1, solid: true },
    { kind: 'palm', tx: 8, ty: 19, w: 1, h: 1, solid: true },
    { kind: 'palm', tx: 30, ty: 3, w: 1, h: 1, solid: true },
    { kind: 'palm', tx: 34, ty: 3, w: 1, h: 1, solid: true },
    { kind: 'palm', tx: 12, ty: 2, w: 1, h: 1, solid: true },
    { kind: 'palm', tx: 23, ty: 2, w: 1, h: 1, solid: true },
  ],
  // Soirée : la nuit tombe sur le rooftop (heure locale, 19 h – 6 h) ; guirlandes, brasero et piscine éclairée
  lighting: {
    darkness: 0, dimFlag: 'rooftop.night', dimDarkness: 0.5,
    lights: [
      ...[10, 13.5, 17, 20.5, 24].map((x) => ({ x, y: 2.6, radius: 2.4, color: '255,214,150', flag: 'rooftop.night' })),
      ...[12, 15, 18, 21].map((x) => ({ x, y: 15.2, radius: 2.2, color: '255,214,150', flag: 'rooftop.night' })),
      { x: 16.5, y: 19.2, radius: 3.2, color: '255,150,60', flag: 'rooftop.night', flicker: true },
      { x: 17, y: 9, radius: 6, color: '90,220,255', flag: 'rooftop.night' },
      { x: 31, y: 17, radius: 5, color: '255,80,200', flag: 'rooftop.night' },
      { x: 4.5, y: 5.5, radius: 3.2, color: '255,200,120', flag: 'rooftop.night' },
      { x: 4, y: 16.6, radius: 3, color: '255,200,120', flag: 'rooftop.night' },
      { x: 22.5, y: 18.6, radius: 2.4, color: '255,230,160', flag: 'rooftop.night' },
    ],
  },
};

/** Salon VIP : positions d'entrée et de sortie (cases) et niveau requis. */
export const VIP_LOUNGE = { inside: { x: 12.5, y: 19.7 }, outside: { x: 10.3, y: 18.9 }, level: 5 };

/** Zone de la piste de danse (tuiles), utilisée pour la musique de la boîte de nuit. */
export const DANCE_FLOOR = { x: 27, y: 14, w: 8, h: 7 };
