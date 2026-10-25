// Rez-de-chaussée : hall d'accueil et hub principal.
import { GridBuilder, makeStairs, type FloorDef } from '../types';

const W = 32, H = 18;

const grid = new GridBuilder(W, H, '.')
  .border('#')
  // Baies vitrées sur le mur nord (vue sur l'océan)
  .fill(9, 0, 4, 2, 'W')
  .fill(19, 0, 4, 2, 'W')
  .fill(25, 0, 5, 2, 'W')
  // Tapis central (médaillon KS dessiné par le moteur de rendu)
  .fill(11, 7, 10, 6, 'c')
  // Allée vers la passerelle sud
  .fill(14, 13, 4, 4, 'c');
const stairsDown = makeStairs(grid, 'left', 7, 'Machines');
const stairsUp = makeStairs(grid, 'right', 7, 'Casino');
const map = grid.build();

export const hubFloor: FloorDef = {
  id: 'hub',
  level: 0,
  name: 'Hall d’accueil',
  short: 'RDC',
  theme: 'hub',
  description: 'Réception, bar principal et point de rencontre.',
  available: true,
  map,
  spawn: { x: 16, y: 3.6 },
  props: [
    stairsDown, stairsUp,
    { kind: 'elevator', tx: 14, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 16, y: 2.5 }, radius: 1.7 } },
    { kind: 'floorSign', tx: 12, ty: 1, w: 2, h: 1 },
    { kind: 'lamp', tx: 18, ty: 1, w: 1, h: 1 },
    // Bar principal (nord-ouest)
    { kind: 'backbar', tx: 2, ty: 0, w: 6, h: 2 },
    { kind: 'bartender', tx: 4, ty: 2, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'barCounter', tx: 2, ty: 4, w: 6, h: 1, solid: true, interact: { id: 'bar', label: 'Bar', at: { x: 5, y: 5.6 }, radius: 1.9 } },
    { kind: 'stool', tx: 3, ty: 5, w: 1, h: 1 },
    { kind: 'stool', tx: 5, ty: 5, w: 1, h: 1 },
    { kind: 'stool', tx: 7, ty: 5, w: 1, h: 1 },
    // Réception (nord-est)
    { kind: 'receptionist', tx: 26, ty: 2, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'reception', tx: 24, ty: 4, w: 6, h: 1, solid: true, interact: { id: 'reception', label: 'Réception', at: { x: 27, y: 5.6 }, radius: 1.9 } },
    // Roue de la fortune quotidienne
    { kind: 'fortuneWheel', tx: 24, ty: 8, w: 2, h: 2, solid: true, hitbox: { x: 0.2, y: 1.2, w: 1.6, h: 0.8 }, interact: { id: 'wheel', label: 'Roue du jour', at: { x: 25, y: 10.6 }, radius: 1.7 } },
    // Salon
    { kind: 'sofa', tx: 3, ty: 11, w: 3, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 4.5, y: 12.5 }, radius: 1.7 } },
    { kind: 'coffeeTable', tx: 3, ty: 13, w: 3, h: 1, solid: true, hitbox: { x: 0.2, y: 0.3, w: 2.6, h: 0.6 } },
    { kind: 'sofa', tx: 26, ty: 11, w: 3, h: 1, solid: true, interact: { id: 'sit', label: 'S’asseoir', at: { x: 27.5, y: 12.5 }, radius: 1.7 } },
    { kind: 'coffeeTable', tx: 26, ty: 13, w: 3, h: 1, solid: true, hitbox: { x: 0.2, y: 0.3, w: 2.6, h: 0.6 } },
    // Colonnes et plantes
    { kind: 'column', tx: 9, ty: 6, w: 1, h: 1, solid: true },
    { kind: 'column', tx: 22, ty: 6, w: 1, h: 1, solid: true },
    { kind: 'column', tx: 9, ty: 13, w: 1, h: 1, solid: true },
    { kind: 'column', tx: 22, ty: 13, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 1, ty: 2, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 30, ty: 2, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 1, ty: 15, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 30, ty: 15, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 13, ty: 15, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 18, ty: 15, w: 1, h: 1, solid: true },
    // Boutique KS : vêtements, accessoires, objets (achats rangés dans l'inventaire)
    { kind: 'shopRack', tx: 2, ty: 15, w: 4, h: 1, solid: true, interact: { id: 'shop', label: 'Boutique KS', at: { x: 4, y: 14.5 }, radius: 1.8 } },
    // Aquarium (un poisson doré passe de temps en temps)
    { kind: 'aquarium', tx: 26, ty: 15, w: 3, h: 1, solid: true, interact: { id: 'aquarium', label: 'Aquarium', at: { x: 27.5, y: 14.5 }, radius: 1.8 } },
    // Piano à queue : on peut en jouer
    { kind: 'piano', tx: 10, ty: 3, w: 3, h: 1, solid: true, interact: { id: 'piano', label: 'Jouer du piano', at: { x: 11.5, y: 4.6 }, radius: 1.6 } },
    // Écran d'information : heure, programme des étages, joueurs à bord
    { kind: 'infoScreen', tx: 20, ty: 2, w: 2, h: 1, solid: true, interact: { id: 'info-screen', label: 'Écran d’infos', at: { x: 21, y: 3.6 }, radius: 1.6 } },
    // Coin photo sous l'arche fleurie
    { kind: 'photoSpot', tx: 28, ty: 8, w: 2, h: 1, interact: { id: 'photo', label: 'Coin photo', at: { x: 29, y: 9.3 }, radius: 1.4 } },
    // Passerelle d'embarquement (décor, fermée pendant la croisière)
    { kind: 'gangway', tx: 14, ty: 17, w: 4, h: 1 },
  ],
};
