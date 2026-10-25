// Premier étage : casino KingSea — tous les jeux sont jouables (phase 4).
import { GridBuilder, makeStairs, type FloorDef, type PropDef } from '../types';
import { SLOT_MACHINES } from '../../games/logic/slotMachines';

const W = 34, H = 20;

const grid = new GridBuilder(W, H, 'r')
  .border('#')
  // Allées en marbre noir veiné d'or (croix centrale)
  .fill(15, 2, 4, 17, '.')
  .fill(1, 9, 32, 3, '.');
const stairsDown = makeStairs(grid, 'left', 9, 'Hall');
const stairsUp = makeStairs(grid, 'right', 9, 'Arcade');
const map = grid.build();

const slots: PropDef[] = [];
for (const x of [2, 3, 4, 5, 6, 7, 8, 25, 26, 27, 28, 29, 30, 31]) {
  // Six thèmes (variante = (x + 2) % 6, même ordre que SLOT_MACHINES) ; toutes les machines sont jouables.
  const name = SLOT_MACHINES[(x + 2) % 6].name;
  slots.push({ kind: 'slotMachine', tx: x, ty: 2, w: 1, h: 1, solid: true, interact: { id: 'slots', label: name, at: { x: x + 0.5, y: 3.5 }, radius: 0.9, quietLabel: true } });
}

export const casinoFloor: FloorDef = {
  id: 'casino',
  level: 1,
  name: 'Casino KingSea',
  short: '1',
  theme: 'casino',
  description: 'Machines à sous, roulette, cartes, craps, keno, courses, Plinko, Crash.',
  available: true,
  map,
  spawn: { x: 17, y: 3.6 },
  props: [
    // Tableau de tes résultats au casino (manches jouées par jeu, jetons, pourboires)
    { kind: 'infoScreen', tx: 20, ty: 7, w: 2, h: 1, solid: true, interact: { id: 'casino-board', label: 'Tableau des joueurs', at: { x: 21, y: 8.6 }, radius: 1.5 } },
    stairsDown, stairsUp,
    { kind: 'elevator', tx: 15, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 17, y: 2.5 }, radius: 1.7 } },
    { kind: 'kenoBoard', tx: 9, ty: 0, w: 6, h: 2, interact: { id: 'keno', label: 'Keno', at: { x: 12, y: 2.6 }, radius: 1.6 } },
    { kind: 'raceScreen', tx: 19, ty: 0, w: 6, h: 2, interact: { id: 'races', label: 'Courses de chevaux', at: { x: 22, y: 2.6 }, radius: 1.6 } },
    // Table de poker (remplace l'ancienne borne « Poker classique ») : on s'y assoit, la croupière distribue
    { kind: 'cardTable', id: 'poker', tx: 12, ty: 4, w: 3, h: 2, solid: true, interact: { id: 'poker', label: 'Table de poker', at: { x: 13.5, y: 6.5 }, radius: 1.6 } },
    { kind: 'croupier', tx: 13, ty: 2, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'pokerMachine', id: 'direct', tx: 20, ty: 4, w: 1, h: 1, solid: true, interact: { id: 'direct-poker', label: 'Direct Poker', at: { x: 20.5, y: 5.5 }, radius: 0.9 } },
    { kind: 'plinkoMachine', tx: 13, ty: 14, w: 1, h: 2, solid: true, interact: { id: 'plinko', label: 'Plinko', at: { x: 13.5, y: 16.5 }, radius: 1 } },
    { kind: 'crashScreen', tx: 20, ty: 14, w: 1, h: 2, solid: true, interact: { id: 'crash', label: 'Crash', at: { x: 20.5, y: 16.5 }, radius: 1 } },
    ...slots,
    // Roulettes
    { kind: 'rouletteTable', tx: 3, ty: 5, w: 3, h: 2, solid: true, interact: { id: 'roulette', label: 'Roulette', at: { x: 4.5, y: 7.5 }, radius: 1.8 } },
    { kind: 'rouletteTable', tx: 9, ty: 5, w: 3, h: 2, solid: true, interact: { id: 'roulette', label: 'Roulette', at: { x: 10.5, y: 7.5 }, radius: 1.8 } },
    { kind: 'crapsTable', tx: 22, ty: 5, w: 3, h: 2, solid: true, interact: { id: 'craps', label: 'Craps', at: { x: 23.5, y: 7.5 }, radius: 1.8 } },
    { kind: 'rouletteTable', tx: 28, ty: 5, w: 3, h: 2, solid: true, interact: { id: 'roulette', label: 'Roulette', at: { x: 29.5, y: 7.5 }, radius: 1.8 } },
    { kind: 'croupier', tx: 4, ty: 3, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'croupier', tx: 29, ty: 3, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    // Tables de cartes (blackjack, poker, baccarat)
    { kind: 'cardTable', tx: 3, ty: 13, w: 3, h: 2, solid: true, interact: { id: 'blackjack', label: 'Blackjack', at: { x: 4.5, y: 15.5 }, radius: 1.8 } },
    { kind: 'cardTable', id: 'hilo', tx: 9, ty: 13, w: 3, h: 2, solid: true, interact: { id: 'blackjack-hilo', label: 'Blackjack Hi-Lo', at: { x: 10.5, y: 15.5 }, radius: 1.8 } },
    { kind: 'cardTable', id: 'baccarat', tx: 22, ty: 13, w: 3, h: 2, solid: true, interact: { id: 'baccarat', label: 'Baccarat', at: { x: 23.5, y: 15.5 }, radius: 1.8 } },
    { kind: 'cardTable', tx: 28, ty: 13, w: 3, h: 2, solid: true, interact: { id: 'blackjack', label: 'Blackjack', at: { x: 29.5, y: 15.5 }, radius: 1.8 } },
    { kind: 'croupier', tx: 10, ty: 11, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'croupier', tx: 23, ty: 11, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    // Caisse centrale
    { kind: 'croupier', tx: 17, ty: 13, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'cashier', tx: 15, ty: 15, w: 4, h: 2, solid: true, interact: { id: 'cashier', label: 'Caisse', at: { x: 17, y: 17.6 }, radius: 1.9 } },
    // Trésors engloutis et plantes
    { kind: 'treasureChest', tx: 1, ty: 16, w: 2, h: 2, solid: true, hitbox: { x: 0, y: 0.6, w: 2, h: 1.4 } },
    { kind: 'treasureChest', tx: 31, ty: 16, w: 2, h: 2, solid: true, hitbox: { x: 0, y: 0.6, w: 2, h: 1.4 } },
    { kind: 'plant', tx: 13, ty: 17, w: 1, h: 1, solid: true },
    { kind: 'plant', tx: 20, ty: 17, w: 1, h: 1, solid: true },
  ],
  lighting: {
    darkness: 0.38,
    lights: [
      { x: 17, y: 3, radius: 5, color: '255,230,170' },
      { x: 5.5, y: 2.6, radius: 4, color: '111,243,255' },
      { x: 28.5, y: 2.6, radius: 4, color: '255,120,200' },
      { x: 4.5, y: 6, radius: 3.5, color: '255,214,150' },
      { x: 10.5, y: 6, radius: 3.5, color: '255,214,150' },
      { x: 23.5, y: 6, radius: 3.5, color: '255,214,150' },
      { x: 29.5, y: 6, radius: 3.5, color: '255,214,150' },
      { x: 4.5, y: 14, radius: 3.5, color: '255,214,150' },
      { x: 10.5, y: 14, radius: 3.5, color: '255,214,150' },
      { x: 23.5, y: 14, radius: 3.5, color: '255,214,150' },
      { x: 29.5, y: 14, radius: 3.5, color: '255,214,150' },
      { x: 17, y: 10.5, radius: 5, color: '229,181,74' },
      { x: 17, y: 16.5, radius: 4, color: '255,226,154' },
      { x: 2, y: 17, radius: 2.5, color: '255,215,90', flicker: true },
      { x: 32, y: 17, radius: 2.5, color: '255,215,90', flicker: true },
      { x: 1.5, y: 10.5, radius: 3, color: '255,230,170' },
      { x: 32.5, y: 10.5, radius: 3, color: '255,230,170' },
    ],
  },
};
