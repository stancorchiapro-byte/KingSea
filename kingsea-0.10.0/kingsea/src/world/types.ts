// Définitions de données des étages (pures, sans DOM) — validées par tests/floors.test.ts.

export const TILE = 32; // taille d'une tuile en unités monde

export type ThemeId = 'hub' | 'engine' | 'casino' | 'arcade' | 'cabins' | 'rooftop' | 'cabinRoom';

/**
 * Caractères de la grille.
 * Murs / obstacles : '#' mur, 'W' baie vitrée, 'G' garde-corps vitré (extérieur), 'p' eau de piscine, ' ' vide.
 * Sols : '.' sol du thème, 'c' tapis, 'g' caillebotis, 'm' tôle, 'y' bande de sécurité, 'r' moquette de casino,
 * 'n' sol néon, 'b' moquette des cabines, 'd' pont en teck, 'e' margelle, 'f' piste de danse, 'S' escalier.
 */
export type TileChar = '#' | 'W' | 'G' | 'p' | ' ' | '.' | 'c' | 'g' | 'm' | 'y' | 'r' | 'n' | 'b' | 'd' | 'e' | 'f' | 'S';

export type PropKind =
  | 'elevator' | 'backbar' | 'barCounter' | 'stool' | 'bartender' | 'reception' | 'receptionist'
  | 'sofa' | 'coffeeTable' | 'plant' | 'floorSign' | 'gangway' | 'column' | 'lamp'
  | 'engine' | 'generator' | 'pipesWall' | 'controlPanel' | 'desk' | 'logbook' | 'fan' | 'crate' | 'valve' | 'compass'
  | 'stairsUp' | 'stairsDown' | 'fortuneWheel'
  // Intérieur de cabine
  | 'bed' | 'wardrobe' | 'nightstand' | 'rug' | 'cabinExit' | 'paintKit'
  // Meubles de la cabine personnalisable (id = « objet|rotation », voir data/furniture.ts)
  | 'furniture' | 'rugFurniture' | 'wallFurniture'
  // Rooftop (salon VIP, braseros, guirlandes)
  | 'vipSign' | 'fireTable' | 'lightPole' | 'champagneBar' | 'loungeSofa'
  // Casino
  | 'slotMachine' | 'rouletteTable' | 'cardTable' | 'cashier' | 'croupier' | 'casinoSign' | 'treasureChest' | 'velvetRope'
  | 'crapsTable' | 'pokerMachine' | 'kenoBoard' | 'raceScreen' | 'plinkoMachine' | 'crashScreen'
  // Arcade
  | 'arcadeCabinet' | 'poolTable' | 'bowlingLane' | 'pinball' | 'hoopMachine' | 'neonSign' | 'infoBoard' | 'attendant'
  | 'footballGoal' | 'skeeBall' | 'moleMachine'
  // Logements
  | 'cabinDoor' | 'bench' | 'porthole'
  // Rooftop
  | 'transat' | 'parasol' | 'palm' | 'tikiBar' | 'snackStand' | 'cook' | 'slide' | 'djBooth' | 'dj' | 'speaker' | 'lifebuoy' | 'deckHouse'
  // Hall (mise à jour Stan) : boutique, écrans, aquarium, piano, coin photo
  | 'shopRack' | 'infoScreen' | 'aquarium' | 'piano' | 'photoSpot' | 'telescope';

export interface InteractDef {
  /** Identifiant du gestionnaire (WorldScene) : 'elevator', 'bar', … */
  id: string;
  label: string;
  /** Point d'interaction en tuiles (par défaut : bas-centre de l'emprise). */
  at?: { x: number; y: number };
  /** Rayon en tuiles. */
  radius?: number;
  /** N'affiche l'étiquette que lorsque l'objet est ciblé (évite d'encombrer un couloir de portes). */
  quietLabel?: boolean;
}

export interface PropDef {
  kind: PropKind;
  /** Coin haut-gauche en tuiles. */
  tx: number; ty: number;
  /** Emprise en tuiles. */
  w: number; h: number;
  /** Bloque le déplacement (emprise entière, ou `hitbox` si fournie). */
  solid?: boolean;
  /** Zone solide relative en tuiles, si différente de l'emprise. */
  hitbox?: { x: number; y: number; w: number; h: number };
  interact?: InteractDef;
  /** Visible / actif seulement si ce drapeau de progression est vrai (ou faux avec '!'). */
  requiresFlag?: string;
  /** Objet ramassable une seule fois : masqué quand le drapeau `found.<id>` est vrai. */
  collectible?: boolean;
  id?: string;
}

export interface LightDef { x: number; y: number; radius: number; color: string; flag?: string; flicker?: boolean }

export interface FloorDef {
  id: string;
  /** -1 = sous-sol, 0 = rez-de-chaussée, … 4 = rooftop */
  level: number;
  name: string;
  short: string;
  theme: ThemeId;
  description: string;
  available: boolean;
  /** Phase de développement prévue si indisponible. */
  plannedPhase?: number;
  map?: string[];
  spawn?: { x: number; y: number };
  props?: PropDef[];
  /** Éclairage dynamique (étages sombres). darkness = opacité de l'obscurité ambiante ;
   *  dimFlag : drapeau qui assombrit la pièce (lampe éteinte). */
  lighting?: { darkness: number; lights: LightDef[]; dimFlag?: string; dimDarkness?: number };
  /** Intérieur (cabine) : absent de l'ascenseur et des escaliers. */
  interior?: boolean;
  /** Variante de palette (couleur des murs de la cabine). */
  themeVariant?: string;
}

export function isSolidChar(c: string | undefined): boolean {
  return c === undefined || c === '#' || c === 'W' || c === ' ' || c === 'G';
}

/** Eau de baignade : praticable, mais on y nage. */
export const isWaterChar = (c: string | undefined): boolean => c === 'p';

/** Tuiles « mur » (dessinées avec façade / chapeau) par opposition à l'eau. */
export function isWallChar(c: string | undefined): boolean {
  return c === '#' || c === 'W' || c === 'G';
}

/** Petit utilitaire pour construire une grille lisible et sans erreur de largeur. */
export class GridBuilder {
  private rows: string[][];
  constructor(readonly w: number, readonly h: number, fill: TileChar) {
    this.rows = Array.from({ length: h }, () => Array.from({ length: w }, () => fill as string));
  }
  set(x: number, y: number, c: TileChar): this { if (y >= 0 && y < this.h && x >= 0 && x < this.w) this.rows[y][x] = c; return this; }
  fill(x: number, y: number, w: number, h: number, c: TileChar): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }
  border(c: TileChar, topThickness = 2): this {
    this.fill(0, 0, this.w, topThickness, c);
    this.fill(0, this.h - 1, this.w, 1, c);
    this.fill(0, 0, 1, this.h, c);
    this.fill(this.w - 1, 0, 1, this.h, c);
    return this;
  }
  build(): string[] { return this.rows.map((r) => r.join('')); }
}

/**
 * Ajoute un escalier dans le mur latéral : à gauche il descend, à droite il monte (convention commune à tous les étages).
 * Les 3 tuiles du mur deviennent praticables ('S').
 */
export function makeStairs(grid: GridBuilder, side: 'left' | 'right', row: number, targetName: string): PropDef {
  const left = side === 'left';
  const tx = left ? 0 : grid.w - 1;
  grid.fill(tx, row, 1, 3, 'S');
  return {
    kind: left ? 'stairsDown' : 'stairsUp', tx, ty: row, w: 1, h: 3,
    interact: { id: left ? 'stairs-down' : 'stairs-up', label: `${left ? 'Descendre' : 'Monter'} · ${targetName}`, at: { x: left ? 1.2 : grid.w - 1.2, y: row + 1.6 }, radius: 1.8 },
  };
}

/** Point d'arrivée devant l'escalier d'un étage (en tuiles). */
export function stairsArrival(f: FloorDef, kind: 'stairsUp' | 'stairsDown'): { x: number; y: number } | null {
  const p = f.props?.find((q) => q.kind === kind);
  if (!p || !f.map) return null;
  const W = f.map[0].length;
  return { x: p.tx === 0 ? 2.0 : W - 2.0, y: p.ty + 2.2 };
}
