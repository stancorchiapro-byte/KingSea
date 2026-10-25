// Intérieur de la cabine personnelle (instancié : chaque joueur a la sienne, jamais partagée).
// Les éléments fixes (porte, garde-robe, établi d'aménagement, bureau du journal) ne bougent pas ; tous les
// meubles viennent de la disposition sauvegardée (RoomState, validée par l'autorité : authority/room.ts).
// Style de la pièce (murs, sol, moulures) et couleur des murs (style marin) choisis par le joueur.
import { CABIN_WALL_COLORS, THEMES } from '../../art/palette';
import { FURNITURE_BY_ID, ROOM_STYLES } from '../../data/furniture';
import { newRoom, type RoomState } from '../../authority/progress';
import { GridBuilder, type FloorDef, type LightDef, type PropDef } from '../types';

const W = 14, H = 10;

const map = new GridBuilder(W, H, '.')
  .border('#')
  // Hublots panoramiques sur l'océan
  .fill(4, 0, 2, 2, 'W')
  .fill(8, 0, 2, 2, 'W')
  .build();

const darken = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16), c = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

/** Palette de la pièce : style choisi (+ couleur des murs pour le style marin). Enregistrée à la demande. */
export function roomTheme(style: string, wallColor: number): string {
  const st = ROOM_STYLES.find((x) => x.id === style) ?? ROOM_STYLES[0];
  const key = `cabinRoom-${st.id}-${st.id === 'marin' ? wallColor : 0}`;
  if (!THEMES[key]) {
    const wc = CABIN_WALL_COLORS[wallColor] ?? CABIN_WALL_COLORS[0];
    const face = st.id === 'marin' ? wc.face : st.wall;
    THEMES[key] = {
      ...THEMES.cabins,
      floorA: st.floor, floorB: darken(st.floor, 0.05), grout: darken(st.floor, 0.18),
      wallFace: face, wallLow: st.id === 'marin' ? wc.low : darken(st.wall, 0.3), wallTop: st.id === 'luxe' ? '#1d0810' : st.id === 'futuriste' ? '#0e0e18' : '#24496f',
      wallTrim: st.trim,
    };
  }
  return key;
}

/** Convertit la disposition sauvegardée en accessoires du décor (avec interactions selon le type d'objet). */
export function furnitureProps(room: RoomState): { props: PropDef[]; lights: LightDef[] } {
  const props: PropDef[] = [], lights: LightDef[] = [];
  for (const it of room.placed) {
    const f = FURNITURE_BY_ID.get(it.item);
    if (!f) continue;
    const w = it.rot ? f.h : f.w, h = it.rot ? f.w : f.h;
    const kind = f.wall ? 'wallFurniture' : f.category === 'tapis' ? 'rugFurniture' : 'furniture';
    const p: PropDef = { kind, id: `${f.id}|${it.rot}`, tx: it.x, ty: it.y, w, h, solid: f.solid && !f.wall && f.category !== 'tapis' };
    const at = { x: it.x + w / 2, y: it.y + h + 0.55 };
    if (f.category === 'lit') p.interact = { id: 'bed', label: 'Se reposer', at, radius: 1.6 };
    else if (f.category === 'canapé') p.interact = { id: 'sit', label: 'S’asseoir', at, radius: 1.4 };
    else if (f.category === 'éclairage' && !f.wall && f.id !== 'chandelier') p.interact = { id: 'cabin-lamp', label: 'Lampe', at, radius: 1.3 };
    else if (f.category === 'collection') p.interact = { id: 'admire', label: f.name, at, radius: 1.2 };
    props.push(p);
    if (f.light) lights.push({ x: it.x + w / 2, y: it.y + (f.wall ? 1.2 : 0.2), radius: f.light, color: f.id === 'lamp-neon' ? '255,120,210' : f.id === 'aquarium' || f.id === 'table-holo' ? '120,230,255' : '255,214,150', flag: f.id === 'aquarium' || f.id === 'lamp-neon' || f.id === 'table-holo' ? undefined : 'cabin.dim' });
  }
  return { props, lights };
}

export function cabinInterior(wallColor: number, room: RoomState = newRoom()): FloorDef {
  const { props, lights } = furnitureProps(room);
  return {
    id: 'cabin-interior',
    level: 3,
    name: 'Ma cabine',
    short: '3',
    theme: 'cabinRoom',
    themeVariant: roomTheme(room.style, wallColor),
    description: 'Ta cabine personnelle.',
    available: true,
    interior: true,
    map,
    spawn: { x: 7, y: 8.4 },
    props: [
      { kind: 'cabinExit', tx: 6, ty: 9, w: 2, h: 1, interact: { id: 'cabin-exit', label: 'Sortir', at: { x: 7, y: 8.7 }, radius: 1.5 } },
      { kind: 'wardrobe', tx: 11, ty: 2, w: 2, h: 1, solid: true, interact: { id: 'wardrobe', label: 'Garde-robe', at: { x: 12, y: 3.6 }, radius: 1.6 } },
      { kind: 'paintKit', tx: 10, ty: 2, w: 1, h: 1, solid: true, interact: { id: 'decorate', label: 'Aménager', at: { x: 10.5, y: 3.6 }, radius: 1.4 } },
      { kind: 'desk', tx: 1, ty: 7, w: 2, h: 1, solid: true, interact: { id: 'logbook-cabin', label: 'Journal de bord', at: { x: 2, y: 8.6 }, radius: 1.4 } },
      ...props,
    ],
    lighting: {
      darkness: 0.08, dimFlag: 'cabin.dim', dimDarkness: 0.62,
      lights: [
        { x: 5, y: 1.8, radius: 3.5, color: '170,220,255' },
        { x: 9, y: 1.8, radius: 3.5, color: '170,220,255' },
        ...lights,
      ],
    },
  };
}

export const INTERIOR_IDS = ['cabin-interior'];
