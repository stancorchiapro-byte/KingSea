// Les six machines à sous du casino. Même mécanique (3 rouleaux, ligne centrale, bande de 32 cases),
// symboles et tables de gains propres à chaque thème. Taux de retour exacts calculés (voir tests).
import { randInt, type Rng } from './rng';

/** Rang de chaque case de la bande : 0 = symbole le plus courant … 5 = symbole rare (KS). Effectifs 10/8/6/4/3/1. */
export const STRIP_PATTERN = [0, 1, 2, 0, 3, 1, 0, 4, 2, 0, 1, 5, 0, 2, 3, 1, 0, 4, 2, 0, 1, 3, 0, 2, 1, 0, 4, 1, 2, 0, 3, 1];

export interface SlotDef {
  id: string;
  name: string;
  /** Six symboles du plus courant au plus rare. */
  symbols: [string, string, string, string, string, string];
  /** Retour (× mise) pour trois symboles identiques, par rang. */
  pay: [number, number, number, number, number, number];
  /** Deux symboles de rang 0 en tête de ligne. */
  two: number;
  /** Un symbole de rang 0 sur le premier rouleau. */
  one: number;
  colors: { body: string; light: string; bg: [string, string] };
}

export const SLOT_MACHINES: SlotDef[] = [
  { id: 'tresors', name: 'Trésors engloutis', symbols: ['perle', 'coquillage', 'ancre', 'coffre', 'couronne', 'ks'], pay: [4, 8, 15, 40, 100, 500], two: 3, one: 1, colors: { body: '#b07a2a', light: '#ffe29a', bg: ['#2a1a06', '#0a0602'] } },
  { id: 'pirates', name: 'Pirates', symbols: ['piece', 'sabre', 'carte', 'drapeau', 'crane', 'ks'], pay: [4, 7, 16, 40, 120, 600], two: 3, one: 1, colors: { body: '#7a1e1e', light: '#ff9a8a', bg: ['#2a0a0a', '#0a0303'] } },
  { id: 'creatures', name: 'Créatures marines', symbols: ['poisson', 'etoile', 'tortue', 'pieuvre', 'requin', 'ks'], pay: [4, 8, 14, 45, 100, 400], two: 3, one: 1, colors: { body: '#0f6b7a', light: '#6ff3ff', bg: ['#052a30', '#020c0f'] } },
  { id: 'perles', name: 'Perles et coraux', symbols: ['perle', 'corail', 'hippocampe', 'huitre', 'couronne', 'ks'], pay: [4, 8, 15, 40, 90, 700], two: 3, one: 1, colors: { body: '#7a2d6b', light: '#ffb3e1', bg: ['#2a0a24', '#0c030a'] } },
  { id: 'profondeurs', name: 'Richesses des profondeurs', symbols: ['piece', 'boussole', 'trident', 'baleine', 'couronne', 'ks'], pay: [4, 8, 16, 38, 110, 500], two: 3, one: 1, colors: { body: '#1d2a7a', light: '#9bb0ff', bg: ['#060a2a', '#02030c'] } },
  { id: 'aventures', name: 'Aventures sous-marines', symbols: ['poisson', 'boussole', 'carte', 'scaphandre', 'coffre', 'ks'], pay: [4, 8, 15, 42, 100, 450], two: 3, one: 1, colors: { body: '#1f6b3a', light: '#9cffb8', bg: ['#062a12', '#020c05'] } },
];

export const slotStrip = (def: SlotDef): string[] => STRIP_PATTERN.map((r) => def.symbols[r]);

/** Retour (× mise) d'une ligne exprimée en rangs. */
export function lineReturnRanks(def: SlotDef, [a, b, c]: number[]): number {
  if (a === b && b === c) return def.pay[a];
  if (a === 0 && b === 0) return def.two;
  if (a === 0) return def.one;
  return 0;
}

export function spinStops(rng: Rng): number[] { return [0, 1, 2].map(() => randInt(rng, STRIP_PATTERN.length)); }
export const rankAt = (stop: number, offset = 0): number => STRIP_PATTERN[((stop + offset) % 32 + 32) % 32];
export const lineReturnStops = (def: SlotDef, stops: number[]): number => lineReturnRanks(def, stops.map((s) => rankAt(s)));

export function machineRtp(def: SlotDef): number {
  let sum = 0;
  for (const a of STRIP_PATTERN) for (const b of STRIP_PATTERN) for (const c of STRIP_PATTERN) sum += lineReturnRanks(def, [a, b, c]);
  return sum / 32 ** 3;
}
