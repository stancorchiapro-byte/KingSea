// Registre des sept niveaux du bateau, du plus haut au plus bas (ordre d'affichage de l'ascenseur).
import type { RoomState } from '../../authority/progress';
import type { FloorDef } from '../types';
import { arcadeFloor } from './arcade';
import { cabinInterior } from './cabinInterior';
import { cabinsFloor } from './cabins';
import { casinoFloor } from './casino';
import { engineFloor } from './engineRoom';
import { hubFloor } from './hub';
import { rooftopFloor } from './rooftop';
import { panoramaFloor } from './panorama';

export const FLOORS: FloorDef[] = [panoramaFloor, rooftopFloor, cabinsFloor, arcadeFloor, casinoFloor, hubFloor, engineFloor];

export const HUB_ID = 'hub';
export { INTERIOR_IDS } from './cabinInterior';

/** Couleur des murs de la cabine (fournie par la sauvegarde). */
let cabinWallColor = 0;
export function setCabinWallColor(i: number): void { cabinWallColor = i; }
/** Aménagement de la cabine (meubles, style), fourni par la sauvegarde ou le serveur. */
let cabinRoom: RoomState | undefined;
export function setCabinRoom(r: RoomState | undefined): void { cabinRoom = r; }

export function getFloor(id: string): FloorDef | undefined {
  if (id === 'cabin-interior') return cabinInterior(cabinWallColor, cabinRoom);
  return FLOORS.find((f) => f.id === id);
}

/** Étage jouable, avec repli sur le hub si l'identifiant sauvegardé n'existe plus. */
export function getPlayableFloor(id: string): FloorDef {
  const f = getFloor(id);
  return f && f.available ? f : (getFloor(HUB_ID) as FloorDef);
}

/** Étage voisin (escaliers) : +1 pour monter, -1 pour descendre. */
export function adjacentFloor(from: FloorDef, dir: 1 | -1): FloorDef | undefined {
  return FLOORS.find((f) => f.level === from.level + dir && f.available);
}
