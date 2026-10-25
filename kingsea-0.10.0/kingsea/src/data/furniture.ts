// Catalogue des meubles et objets de la cabine (chambre personnalisable). Chaque objet a un style, une taille
// en cases, un prix en KSCoins (0 = non achetable) et une condition de déblocage : niveau, mission, ou
// disponible d'emblée. Le dessin est fait par art/furniture.ts à partir de ces données (aucune image).

export type FurnitureStyle = 'moderne' | 'minimaliste' | 'luxe' | 'futuriste' | 'marin';
export type FurnitureCategory = 'lit' | 'canapé' | 'table' | 'rangement' | 'éclairage' | 'décoration' | 'collection' | 'tapis' | 'plante';

export interface FurnitureDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  style: FurnitureStyle;
  /** Taille au sol en cases (largeur × profondeur). */
  w: number; h: number;
  /** Prix en KSCoins (0 : uniquement par déblocage). */
  price: number;
  /** Niveau requis pour l'acheter ou l'obtenir. */
  level: number;
  /** Obtenu en récompense (niveau ou mission) plutôt qu'acheté. */
  reward?: boolean;
  /** Bloque le passage (sinon : tapis, plantes basses…). */
  solid: boolean;
  /** Se pose au mur (tableaux, appliques) : seulement sur la rangée du haut. */
  wall?: boolean;
  /** Couleurs principales (dessin). */
  colors: [string, string, string];
  /** Lumière émise (éclairages) : rayon en cases. */
  light?: number;
}

export const FURNITURE: FurnitureDef[] = [
  // ---- de base (disponibles dès le niveau 1)
  { id: 'bed-classic', name: 'Lit marin', category: 'lit', style: 'marin', w: 2, h: 2, price: 0, level: 1, solid: true, colors: ['#f4efe6', '#24496f', '#a6774a'] },
  { id: 'table-teak', name: 'Table en teck', category: 'table', style: 'marin', w: 1, h: 1, price: 60, level: 1, solid: true, colors: ['#a6774a', '#7a5432', '#d9b98c'] },
  { id: 'chair-teak', name: 'Fauteuil de pont', category: 'canapé', style: 'marin', w: 1, h: 1, price: 50, level: 1, solid: true, colors: ['#a6774a', '#f4efe6', '#24496f'] },
  { id: 'rug-navy', name: 'Tapis bleu nuit', category: 'tapis', style: 'marin', w: 2, h: 2, price: 40, level: 1, solid: false, colors: ['#123d6e', '#d4af5a', '#0a2748'] },
  { id: 'plant-small', name: 'Plante en pot', category: 'plante', style: 'minimaliste', w: 1, h: 1, price: 30, level: 1, solid: false, colors: ['#2e8b57', '#1f6b42', '#c8b79a'] },
  { id: 'shelf-white', name: 'Étagère blanche', category: 'rangement', style: 'minimaliste', w: 1, h: 1, price: 70, level: 1, solid: true, colors: ['#f2f0eb', '#cfc9bd', '#6b5d4a'] },
  { id: 'lamp-floor', name: 'Lampadaire', category: 'éclairage', style: 'moderne', w: 1, h: 1, price: 80, level: 1, solid: true, colors: ['#2b2b30', '#ffe9b0', '#8a8a92'], light: 3 },
  { id: 'painting-sea', name: 'Tableau marine', category: 'décoration', style: 'marin', w: 1, h: 1, price: 90, level: 1, solid: false, wall: true, colors: ['#0b5ea8', '#f4efe6', '#d4af5a'] },
  // ---- moderne
  { id: 'sofa-grey', name: 'Canapé gris', category: 'canapé', style: 'moderne', w: 2, h: 1, price: 180, level: 2, solid: true, colors: ['#7d7f86', '#5c5e64', '#2b2b30'] },
  { id: 'table-glass', name: 'Table basse en verre', category: 'table', style: 'moderne', w: 2, h: 1, price: 150, level: 3, solid: true, colors: ['#bfe6f2', '#2b2b30', '#e8f6fa'] },
  { id: 'bed-modern', name: 'Lit plateforme', category: 'lit', style: 'moderne', w: 2, h: 2, price: 320, level: 4, solid: true, colors: ['#e7e3dc', '#4a4a52', '#9aa0a8'] },
  // ---- minimaliste
  { id: 'bench-oak', name: 'Banc en chêne clair', category: 'canapé', style: 'minimaliste', w: 2, h: 1, price: 120, level: 2, solid: true, colors: ['#d9c3a0', '#b89c72', '#f2ece2'] },
  { id: 'lamp-paper', name: 'Lanterne de papier', category: 'éclairage', style: 'minimaliste', w: 1, h: 1, price: 90, level: 3, solid: true, colors: ['#f6f0e3', '#ffe9b0', '#b89c72'], light: 3 },
  { id: 'bonsai', name: 'Bonsaï', category: 'plante', style: 'minimaliste', w: 1, h: 1, price: 140, level: 5, solid: true, colors: ['#3f7d4f', '#7a5432', '#e7e3dc'] },
  // ---- luxe
  { id: 'lamp-deco', name: 'Lampe art déco', category: 'éclairage', style: 'luxe', w: 1, h: 1, price: 0, level: 2, reward: true, solid: true, colors: ['#d4af5a', '#fff0c0', '#1d1820'], light: 3 },
  { id: 'plant-palm', name: 'Palmier en jardinière dorée', category: 'plante', style: 'luxe', w: 1, h: 1, price: 0, level: 3, reward: true, solid: true, colors: ['#2e8b57', '#d4af5a', '#1f6b42'] },
  { id: 'sofa-velvet', name: 'Canapé de velours bordeaux', category: 'canapé', style: 'luxe', w: 2, h: 1, price: 0, level: 6, reward: true, solid: true, colors: ['#6e1a2b', '#d4af5a', '#3a0c17'] },
  { id: 'rug-persian', name: 'Tapis persan', category: 'tapis', style: 'luxe', w: 3, h: 2, price: 260, level: 4, solid: false, colors: ['#6e1a2b', '#d4af5a', '#123d6e'] },
  { id: 'bed-canopy', name: 'Lit à baldaquin', category: 'lit', style: 'luxe', w: 2, h: 2, price: 600, level: 7, solid: true, colors: ['#6e1a2b', '#d4af5a', '#f6f0e3'] },
  { id: 'bar-cart', name: 'Desserte à champagne', category: 'table', style: 'luxe', w: 1, h: 1, price: 280, level: 6, solid: true, colors: ['#d4af5a', '#1d1820', '#f6f0e3'] },
  { id: 'aquarium', name: 'Aquarium tropical', category: 'décoration', style: 'luxe', w: 2, h: 1, price: 0, level: 8, reward: true, solid: true, colors: ['#1fc7c1', '#0b5ea8', '#d4af5a'], light: 2 },
  { id: 'piano', name: 'Piano à queue', category: 'décoration', style: 'luxe', w: 2, h: 2, price: 0, level: 10, reward: true, solid: true, colors: ['#0b0a0d', '#f6f0e3', '#d4af5a'] },
  { id: 'chandelier', name: 'Lustre de cristal', category: 'éclairage', style: 'luxe', w: 1, h: 1, price: 0, level: 12, reward: true, solid: false, colors: ['#efdcae', '#ffffff', '#d4af5a'], light: 4 },
  { id: 'statue-gold', name: 'Statue dorée de sirène', category: 'collection', style: 'luxe', w: 1, h: 1, price: 0, level: 15, reward: true, solid: true, colors: ['#d4af5a', '#8a6a2b', '#1d1820'] },
  { id: 'yacht-model', name: 'Maquette de yacht', category: 'collection', style: 'luxe', w: 1, h: 1, price: 0, level: 20, reward: true, solid: true, colors: ['#f6f0e3', '#6e1a2b', '#a6774a'] },
  // ---- futuriste
  { id: 'chair-pod', name: 'Fauteuil œuf', category: 'canapé', style: 'futuriste', w: 1, h: 1, price: 220, level: 5, solid: true, colors: ['#e8eef5', '#7b4dff', '#1d1820'] },
  { id: 'lamp-neon', name: 'Néon KS', category: 'éclairage', style: 'futuriste', w: 1, h: 1, price: 200, level: 6, solid: false, wall: true, colors: ['#ff3fa4', '#6ff3ff', '#1d1820'], light: 3 },
  { id: 'table-holo', name: 'Table holographique', category: 'table', style: 'futuriste', w: 2, h: 1, price: 420, level: 9, solid: true, colors: ['#6ff3ff', '#1d1820', '#7b4dff'], light: 2 },
  { id: 'bed-capsule', name: 'Lit capsule', category: 'lit', style: 'futuriste', w: 2, h: 2, price: 550, level: 11, solid: true, colors: ['#e8eef5', '#6ff3ff', '#2b2b30'] },
  // ---- objets de collection (missions)
  { id: 'trophy-casino', name: 'Trophée du casino', category: 'collection', style: 'luxe', w: 1, h: 1, price: 0, level: 1, reward: true, solid: true, colors: ['#d4af5a', '#0f5a3f', '#1d1820'] },
  { id: 'globe-antique', name: 'Globe ancien', category: 'collection', style: 'marin', w: 1, h: 1, price: 0, level: 1, reward: true, solid: true, colors: ['#c8a46a', '#7a5432', '#d4af5a'] },
  { id: 'telescope', name: 'Longue-vue de laiton', category: 'collection', style: 'marin', w: 1, h: 1, price: 0, level: 1, reward: true, solid: true, colors: ['#d4af5a', '#7a5432', '#2b2b30'] },
];

export const FURNITURE_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

/** Objets possédés au départ (la cabine n'est jamais vide) et leur disposition initiale. */
export const STARTER_FURNITURE = ['bed-classic', 'rug-navy', 'table-teak', 'chair-teak', 'plant-small', 'lamp-floor', 'painting-sea'];
export const STARTER_LAYOUT: Array<{ item: string; x: number; y: number }> = [
  { item: 'bed-classic', x: 1, y: 2 }, { item: 'lamp-floor', x: 3, y: 2 }, { item: 'rug-navy', x: 5, y: 4 },
  { item: 'table-teak', x: 9, y: 6 }, { item: 'chair-teak', x: 10, y: 6 }, { item: 'plant-small', x: 12, y: 8 }, { item: 'painting-sea', x: 2, y: 1 },
];

/** Nombre maximal d'exemplaires d'un objet (lits et objets de collection : un seul). */
export function maxCopies(f: FurnitureDef): number { return f.category === 'lit' || f.category === 'collection' || f.reward ? 1 : 4; }

export const ROOM_STYLES: Array<{ id: FurnitureStyle; name: string; wall: string; floor: string; trim: string; level: number }> = [
  { id: 'marin', name: 'Marin', wall: '#9ec6e0', floor: '#d9b98c', trim: '#f4efe6', level: 1 },
  { id: 'moderne', name: 'Moderne', wall: '#d8d6d1', floor: '#8c8f96', trim: '#2b2b30', level: 2 },
  { id: 'minimaliste', name: 'Minimaliste', wall: '#f2efe8', floor: '#e3d3b5', trim: '#cfc9bd', level: 3 },
  { id: 'luxe', name: 'Luxe', wall: '#3a0c17', floor: '#2a1f17', trim: '#d4af5a', level: 5 },
  { id: 'futuriste', name: 'Futuriste', wall: '#1d1d2b', floor: '#2b2b3a', trim: '#6ff3ff', level: 8 },
];
