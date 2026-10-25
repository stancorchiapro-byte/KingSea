// Deuxième étage : arcade et loisirs néon — toutes les activités sont jouables (phase 4).
import { GridBuilder, makeStairs, type FloorDef, type PropDef } from '../types';

const W = 34, H = 20;

const grid = new GridBuilder(W, H, 'n').border('#');
const stairsDown = makeStairs(grid, 'left', 9, 'Casino');
const stairsUp = makeStairs(grid, 'right', 9, 'Logements');
const map = grid.build();

const cabinets: PropDef[] = [];
for (const x of [2, 3, 4, 5, 6, 7, 8, 25, 26, 27, 28, 29, 30, 31]) cabinets.push({ kind: 'arcadeCabinet', tx: x, ty: 2, w: 1, h: 1, solid: true });

export const arcadeFloor: FloorDef = {
  id: 'arcade',
  level: 2,
  name: 'Arcade néon',
  short: '2',
  theme: 'arcade',
  description: 'Bowling, billard, flipper, basket, tirs au but, Skee-Ball, tape-crabe.',
  available: true,
  map,
  spawn: { x: 17, y: 3.6 },
  props: [
    stairsDown, stairsUp,
    { kind: 'elevator', tx: 15, ty: 0, w: 4, h: 2, interact: { id: 'elevator', label: 'Ascenseur', at: { x: 17, y: 2.5 }, radius: 1.7 } },
    { kind: 'neonSign', tx: 9, ty: 0, w: 6, h: 2 },
    { kind: 'neonSign', tx: 19, ty: 0, w: 6, h: 2 },
    ...cabinets,
    // Billards
    { kind: 'poolTable', tx: 3, ty: 5, w: 3, h: 2, solid: true, interact: { id: 'billiards', label: 'Billard', at: { x: 4.5, y: 7.5 }, radius: 1.8 } },
    { kind: 'poolTable', tx: 9, ty: 5, w: 3, h: 2, solid: true, interact: { id: 'billiards', label: 'Billard', at: { x: 10.5, y: 7.5 }, radius: 1.8 } },
    // Programme de l'arcade
    { kind: 'attendant', tx: 22, ty: 4, w: 1, h: 2, solid: true, hitbox: { x: 0, y: 1.4, w: 1, h: 0.6 } },
    { kind: 'infoBoard', tx: 20, ty: 5, w: 2, h: 1, solid: true, hitbox: { x: 0, y: 0.5, w: 2, h: 0.5 },
      interact: { id: 'arcade-board', label: 'Programme', at: { x: 21, y: 6.6 }, radius: 1.7 } },
    // Flippers maritimes
    ...[2, 4, 6].map((x): PropDef => ({ kind: 'pinball', tx: x, ty: 14, w: 1, h: 2, solid: true, interact: { id: 'pinball', label: 'Flipper maritime', at: { x: x + 0.5, y: 16.5 }, radius: 0.95, quietLabel: true } })),
    // Basket d'arcade
    ...[9, 12].map((x): PropDef => ({ kind: 'hoopMachine', tx: x, ty: 14, w: 2, h: 2, solid: true, interact: { id: 'basket', label: 'Basket', at: { x: x + 1, y: 16.6 }, radius: 1.2 } })),
    // Football (tirs au but), Skee-Ball, tape-crabe
    { kind: 'footballGoal', tx: 14, ty: 7, w: 3, h: 2, solid: true, interact: { id: 'football', label: 'Tirs au but', at: { x: 15.5, y: 9.6 }, radius: 1.5 } },
    ...[15, 17].map((x): PropDef => ({ kind: 'skeeBall', tx: x, ty: 13, w: 1, h: 3, solid: true, interact: { id: 'skeeball', label: 'Skee-Ball', at: { x: x + 0.5, y: 16.6 }, radius: 0.95, quietLabel: true } })),
    { kind: 'moleMachine', tx: 19, ty: 8, w: 2, h: 2, solid: true, interact: { id: 'mole', label: 'Tape-crabe', at: { x: 20, y: 10.6 }, radius: 1.2 } },
    // Pistes de bowling (quilles au sud)
    { kind: 'bowlingLane', tx: 22, ty: 12, w: 2, h: 7, solid: true, interact: { id: 'bowling', label: 'Bowling', at: { x: 23, y: 11.5 }, radius: 1.5 } },
    { kind: 'bowlingLane', tx: 25, ty: 12, w: 2, h: 7, solid: true, interact: { id: 'bowling', label: 'Bowling', at: { x: 26, y: 11.5 }, radius: 1.5 } },
    { kind: 'bowlingLane', tx: 28, ty: 12, w: 2, h: 7, solid: true, interact: { id: 'bowling', label: 'Bowling', at: { x: 29, y: 11.5 }, radius: 1.5 } },
  ],
  lighting: {
    darkness: 0.5,
    lights: [
      { x: 17, y: 3, radius: 5, color: '230,220,255' },
      { x: 5.5, y: 2.8, radius: 4.5, color: '111,243,255', flicker: true },
      { x: 28.5, y: 2.8, radius: 4.5, color: '255,63,164', flicker: true },
      { x: 4.5, y: 6, radius: 3.5, color: '255,240,210' },
      { x: 10.5, y: 6, radius: 3.5, color: '255,240,210' },
      { x: 21, y: 5.5, radius: 3, color: '111,243,255' },
      { x: 4, y: 15, radius: 3.5, color: '255,63,164' },
      { x: 11.5, y: 15, radius: 3.5, color: '255,209,102' },
      { x: 23, y: 14, radius: 3.5, color: '123,77,255' },
      { x: 26, y: 15, radius: 3.5, color: '123,77,255' },
      { x: 29, y: 14, radius: 3.5, color: '123,77,255' },
      { x: 17, y: 10.5, radius: 5, color: '160,140,255' },
      { x: 16, y: 15, radius: 3, color: '255,209,102' },
      { x: 1.5, y: 10.5, radius: 3, color: '230,220,255' },
      { x: 32.5, y: 10.5, radius: 3, color: '230,220,255' },
    ],
  },
};
