// Direction artistique KingSea : palette commune à tout le bateau + palettes secondaires par étage.
// Interface : identité « KS Casino luxe » (noir laqué, or champagne, bordeaux, vert casino, ivoire), voir art/brand.ts.

export const PAL = {
  ocean: '#0b5ea8',
  navy: '#0a2748',
  deepNavy: '#120e14',
  abyss: '#030e1e',
  turquoise: '#1fc7c1',
  cyan: '#6ff3ff',
  pearl: '#f4efe6',
  pearlShade: '#d9d1c3',
  gold: '#d4af5a',
  goldLight: '#efdcae',
  goldDark: '#8a6a2b',
  violet: '#7b4dff',
  magenta: '#ff3fa4',
  text: '#f6f0e3',
  textDim: '#cbbfa8',
  danger: '#ff6b6b',
  success: '#59e3a7',
  // Luxe (mise à jour KS Casino) : noir laqué, bordeaux, vert tapis, ivoire
  onyx: '#16131a',
  lacquer: '#1d1820',
  bordeaux: '#6e1a2b',
  felt: '#0f5a3f',
  ivory: '#f6f0e3',
  champagne: '#efdcae',
} as const;

export interface Theme {
  floorA: string; floorB: string; grout: string; carpet: string; carpetEdge: string;
  wallTop: string; wallFace: string; wallTrim: string; wallLow: string;
  wallStyle: 'luxe' | 'industrial' | 'casino' | 'neon' | 'cabin' | 'deck';
}

export const THEMES: Record<string, Theme> = {
  hub: {
    floorA: '#ece5d8', floorB: '#e1d8c8', grout: '#cbbfa9',
    carpet: '#123d6e', carpetEdge: '#e5b54a',
    wallTop: '#0d2b4f', wallFace: '#173e6b', wallTrim: '#e5b54a', wallLow: '#0f2f55', wallStyle: 'luxe',
  },
  engine: {
    floorA: '#2a333d', floorB: '#232b34', grout: '#161c22',
    carpet: '#3a4552', carpetEdge: '#f2b632',
    wallTop: '#11171d', wallFace: '#2c3640', wallTrim: '#6d7a86', wallLow: '#1b232b', wallStyle: 'industrial',
  },
  // Casino : bleu nuit, turquoise profond, or — trésors engloutis
  casino: {
    floorA: '#141a24', floorB: '#0f141c', grout: '#c9a14a',
    carpet: '#0b3a4a', carpetEdge: '#e5b54a',
    wallTop: '#070f1d', wallFace: '#0b1e3a', wallTrim: '#e5b54a', wallLow: '#081631', wallStyle: 'casino',
  },
  // Arcade : néons bleus, violets et roses sur fond sombre
  arcade: {
    floorA: '#16112b', floorB: '#120d24', grout: '#2b2150',
    carpet: '#1b1236', carpetEdge: '#6ff3ff',
    wallTop: '#0b0718', wallFace: '#1a1238', wallTrim: '#ff3fa4', wallLow: '#120c29', wallStyle: 'neon',
  },
  // Logements : bleu doux, bois clair, lumière tamisée
  cabins: {
    floorA: '#d9b98c', floorB: '#cfae80', grout: '#b8956a',
    carpet: '#3d6f9e', carpetEdge: '#f4efe6',
    wallTop: '#24496f', wallFace: '#9ec6e0', wallTrim: '#f4efe6', wallLow: '#a6774a', wallStyle: 'cabin',
  },
  // Rooftop : teck, pierre claire, blanc nacré, accents magenta pour la fête
  rooftop: {
    floorA: '#eee8dc', floorB: '#e4ddcf', grout: '#cfc6b4',
    carpet: '#b07a45', carpetEdge: '#e5b54a',
    wallTop: '#dfe7ee', wallFace: '#f4f7fa', wallTrim: '#1fc7c1', wallLow: '#c9d6e0', wallStyle: 'deck',
  },
};

/** Couleurs de murs proposées pour la cabine personnelle. */
export const CABIN_WALL_COLORS = [
  { name: 'Bleu océan', face: '#9ec6e0', low: '#a6774a' },
  { name: 'Sable doré', face: '#ead7b0', low: '#8a5a2e' },
  { name: 'Corail', face: '#f4b6a6', low: '#8f5a3a' },
  { name: 'Menthe marine', face: '#b7e4cf', low: '#6b4a2e' },
];
CABIN_WALL_COLORS.forEach((c, i) => {
  THEMES[`cabinRoom${i}`] = { ...THEMES.cabins, wallFace: c.face, wallLow: c.low, wallTop: '#24496f' };
});
