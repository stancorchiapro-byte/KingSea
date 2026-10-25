// Personnages 2D originaux, dessinés par le code (vue 3/4 de dessus), personnalisables.
// Cadre 32×48 unités, pieds en (16, 46). Les animations sont générées à la demande et mises en cache
// (une bande d'images par apparence et par animation) : seules les animations réellement vues coûtent de la mémoire.
import { ART_SCALE, makeCanvas, Textures, type AnyCanvas } from './canvas';

export type Dir = 'down' | 'up' | 'left' | 'right';
export const DIRS: Dir[] = ['down', 'up', 'left', 'right'];
export const FRAME_W = 32, FRAME_H = 48, FEET_Y = 46;

export type HairStyle = 'court' | 'carre' | 'chignon' | 'long' | 'boucles' | 'queue' | 'rase';
export type Outfit = 'marin' | 'polo' | 'hawai' | 'robe' | 'costume' | 'sport' | 'smoking' | 'blazer' | 'cuir' | 'soiree' | 'lin' | 'survet'
  | 'barman' | 'croupier' | 'accueil' | 'cuisine' | 'dj' | 'arcade' | 'officier';
export type Hat = 'aucun' | 'capitaine' | 'paille' | 'bob' | 'casquette' | 'toque' | 'casque' | 'hautdeforme' | 'fedora' | 'beret' | 'panama' | 'bandana';
export type Pants = 'auto' | 'jean' | 'chino' | 'noir' | 'blanc';
export type Shoes = 'auto' | 'baskets' | 'mocassins' | 'escarpins' | 'bottes' | 'sandales';
export type GlassesStyle = 'soleil' | 'aviateur' | 'rondes';
export type Jewel = 'aucun' | 'collier' | 'montre' | 'boucles' | 'chaine';

export interface Look {
  skin: string; hair: string; hairStyle: HairStyle;
  outfit: Outfit; color: string; accent: string;
  hat: Hat; glasses: boolean;
  /** Garde-robe étendue (facultatif : « auto » = pantalon et chaussures de la tenue). */
  pants?: Pants; shoes?: Shoes; glassesStyle?: GlassesStyle; jewel?: Jewel;
}

// ---------------------------------------------------------------- Choix proposés au joueur
export const SKIN_TONES = ['#f6d7bd', '#f1c7a1', '#e0a77e', '#c98d62', '#a8714a', '#7a4a2e'];
export const HAIR_COLORS = ['#1c1412', '#3b2516', '#6b3d16', '#a8642a', '#e2b45a', '#d9d4cc', '#c0392b', '#ff6fa8', '#1fc7c1'];
export const HAIR_STYLES: Array<{ id: HairStyle; label: string }> = [
  { id: 'court', label: 'Court' }, { id: 'carre', label: 'Carré' }, { id: 'chignon', label: 'Chignon' }, { id: 'long', label: 'Long' },
  { id: 'boucles', label: 'Boucles' }, { id: 'queue', label: 'Queue' }, { id: 'rase', label: 'Rasé' },
];
/** `unlock` : clé de déblocage (récompense de niveau) nécessaire pour porter l'élément. */
export const PLAYER_OUTFITS: Array<{ id: Outfit; label: string; unlock?: string }> = [
  { id: 'marin', label: 'Marin' }, { id: 'polo', label: 'Polo' }, { id: 'hawai', label: 'Chemise à fleurs' },
  { id: 'robe', label: 'Robe' }, { id: 'costume', label: 'Costume' }, { id: 'sport', label: 'Sport' },
  { id: 'smoking', label: 'Smoking', unlock: 'outfit:smoking' },
  { id: 'blazer', label: 'Veste croisée', unlock: 'outfit:blazer' }, { id: 'cuir', label: 'Perfecto', unlock: 'outfit:cuir' },
  { id: 'soiree', label: 'Robe de soirée', unlock: 'outfit:soiree' }, { id: 'lin', label: 'Costume de lin', unlock: 'outfit:lin' },
  { id: 'survet', label: 'Survêtement', unlock: 'outfit:survet' },
];
export const PLAYER_PANTS: Array<{ id: Pants; label: string; unlock?: string }> = [
  { id: 'auto', label: 'De la tenue' }, { id: 'jean', label: 'Jean', unlock: 'pants:jean' }, { id: 'chino', label: 'Chino', unlock: 'pants:chino' },
  { id: 'noir', label: 'Noir', unlock: 'pants:noir' }, { id: 'blanc', label: 'Blanc', unlock: 'pants:blanc' },
];
export const PLAYER_SHOES: Array<{ id: Shoes; label: string; unlock?: string }> = [
  { id: 'auto', label: 'De la tenue' }, { id: 'baskets', label: 'Baskets', unlock: 'shoes:baskets' }, { id: 'mocassins', label: 'Mocassins', unlock: 'shoes:mocassins' },
  { id: 'escarpins', label: 'Escarpins', unlock: 'shoes:escarpins' }, { id: 'bottes', label: 'Bottines', unlock: 'shoes:bottes' }, { id: 'sandales', label: 'Sandales', unlock: 'shoes:sandales' },
];
export const PLAYER_GLASSES: Array<{ id: GlassesStyle; label: string; unlock?: string }> = [
  { id: 'soleil', label: 'Solaires' }, { id: 'aviateur', label: 'Aviateur', unlock: 'glasses:aviateur' }, { id: 'rondes', label: 'Rondes', unlock: 'glasses:rondes' },
];
export const PLAYER_JEWELS: Array<{ id: Jewel; label: string; unlock?: string }> = [
  { id: 'aucun', label: 'Aucun' }, { id: 'collier', label: 'Perles', unlock: 'jewel:collier' }, { id: 'montre', label: 'Montre', unlock: 'jewel:montre' },
  { id: 'boucles', label: 'Créoles', unlock: 'jewel:boucles' }, { id: 'chaine', label: 'Chaîne', unlock: 'jewel:chaine' },
];
export const OUTFIT_COLORS = ['#173e72', '#0f8a8a', '#1fc7c1', '#e5b54a', '#c0392b', '#ff6f91', '#7b4dff', '#2e8b57', '#f4efe6', '#1b1b2f'];
export const PLAYER_HATS: Array<{ id: Hat; label: string; unlock?: string }> = [
  { id: 'aucun', label: 'Aucun' }, { id: 'capitaine', label: 'Capitaine' }, { id: 'paille', label: 'Paille' }, { id: 'bob', label: 'Bob' }, { id: 'casquette', label: 'Casquette' },
  { id: 'hautdeforme', label: 'Haut-de-forme', unlock: 'hat:hautdeforme' },
  { id: 'fedora', label: 'Fedora', unlock: 'hat:fedora' }, { id: 'beret', label: 'Béret', unlock: 'hat:beret' },
  { id: 'panama', label: 'Panama', unlock: 'hat:panama' }, { id: 'bandana', label: 'Bandana', unlock: 'hat:bandana' },
];

/**
 * Remplace les éléments non possédés par l'équivalent gratuit. `owned` contient les clés « emplacement:valeur »
 * débloquées (récompenses de niveau) ou achetées (inventaire) ; les éléments sans clé sont gratuits.
 */
export function enforceUnlocks(l: Look, owned: readonly string[]): Look {
  const ok = <T extends { id: string; unlock?: string }>(list: T[], v: string | undefined): boolean => { const e = list.find((x) => x.id === v); return !e?.unlock || owned.includes(e.unlock); };
  return {
    ...l,
    outfit: ok(PLAYER_OUTFITS, l.outfit) ? l.outfit : 'costume',
    hat: ok(PLAYER_HATS, l.hat) ? l.hat : 'aucun',
    pants: ok(PLAYER_PANTS, l.pants) ? l.pants ?? 'auto' : 'auto',
    shoes: ok(PLAYER_SHOES, l.shoes) ? l.shoes ?? 'auto' : 'auto',
    glassesStyle: ok(PLAYER_GLASSES, l.glassesStyle) ? l.glassesStyle ?? 'soleil' : 'soleil',
    jewel: ok(PLAYER_JEWELS, l.jewel) ? l.jewel ?? 'aucun' : 'aucun',
  };
}

export const DEFAULT_LOOK: Look = { skin: '#f1c7a1', hair: '#3b2516', hairStyle: 'court', outfit: 'marin', color: '#173e72', accent: '#e5b54a', hat: 'capitaine', glasses: false };

const HAIR_IDS = HAIR_STYLES.map((h) => h.id);
const OUTFIT_IDS: Outfit[] = ['marin', 'polo', 'hawai', 'robe', 'costume', 'sport', 'smoking', 'blazer', 'cuir', 'soiree', 'lin', 'survet', 'barman', 'croupier', 'accueil', 'cuisine', 'dj', 'arcade', 'officier'];
const HAT_IDS: Hat[] = ['aucun', 'capitaine', 'paille', 'bob', 'casquette', 'toque', 'casque', 'hautdeforme', 'fedora', 'beret', 'panama', 'bandana'];
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Valide une apparence venue d'une sauvegarde (ou d'un autre joueur, plus tard) ; complète les champs invalides. */
export function sanitizeLook(raw: unknown): Look {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    skin: isHex(r.skin) ? r.skin : DEFAULT_LOOK.skin,
    hair: isHex(r.hair) ? r.hair : DEFAULT_LOOK.hair,
    hairStyle: HAIR_IDS.includes(r.hairStyle as HairStyle) ? (r.hairStyle as HairStyle) : DEFAULT_LOOK.hairStyle,
    outfit: OUTFIT_IDS.includes(r.outfit as Outfit) ? (r.outfit as Outfit) : DEFAULT_LOOK.outfit,
    color: isHex(r.color) ? r.color : isHex(r.outfit) ? (r.outfit as string) : DEFAULT_LOOK.color, // ancien format : outfit = couleur
    accent: isHex(r.accent) ? r.accent : DEFAULT_LOOK.accent,
    hat: HAT_IDS.includes(r.hat as Hat) ? (r.hat as Hat) : DEFAULT_LOOK.hat,
    glasses: typeof r.glasses === 'boolean' ? r.glasses : false,
    // Champs facultatifs (ajoutés en v0.10) : présents seulement s'ils l'étaient (anciens profils inchangés)
    ...(r.pants !== undefined ? { pants: PLAYER_PANTS.some((x) => x.id === r.pants) ? (r.pants as Pants) : 'auto' } : {}),
    ...(r.shoes !== undefined ? { shoes: PLAYER_SHOES.some((x) => x.id === r.shoes) ? (r.shoes as Shoes) : 'auto' } : {}),
    ...(r.glassesStyle !== undefined ? { glassesStyle: PLAYER_GLASSES.some((x) => x.id === r.glassesStyle) ? (r.glassesStyle as GlassesStyle) : 'soleil' } : {}),
    ...(r.jewel !== undefined ? { jewel: PLAYER_JEWELS.some((x) => x.id === r.jewel) ? (r.jewel as Jewel) : 'aucun' } : {}),
  };
}

/** Apparence aléatoire de passager (PNJ d'ambiance). */
export function randomLook(rand: () => number = Math.random): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const outfit = pick(PLAYER_OUTFITS.filter((o) => !o.unlock)).id;
  return {
    skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS.slice(0, 7)), hairStyle: pick(HAIR_IDS),
    outfit, color: pick(OUTFIT_COLORS), accent: pick(['#e5b54a', '#f4efe6', '#1fc7c1', '#ff6f91']),
    hat: rand() < 0.6 ? 'aucun' : pick(['paille', 'bob', 'casquette'] as Hat[]), glasses: rand() < 0.2,
  };
}

export const NPC_LOOKS: Record<string, Look> = {
  bartender: { skin: '#c98d62', hair: '#1c1412', hairStyle: 'court', outfit: 'barman', color: '#0d2340', accent: '#b0193b', hat: 'aucun', glasses: false },
  receptionist: { skin: '#f3d3b5', hair: '#8a4b26', hairStyle: 'chignon', outfit: 'accueil', color: '#123a6b', accent: '#1fc7c1', hat: 'aucun', glasses: false },
  croupier: { skin: '#e8b98f', hair: '#2a1d14', hairStyle: 'court', outfit: 'croupier', color: '#5a1023', accent: '#e5b54a', hat: 'aucun', glasses: false },
  attendant: { skin: '#a8714a', hair: '#ff6fa8', hairStyle: 'queue', outfit: 'arcade', color: '#1a1238', accent: '#6ff3ff', hat: 'aucun', glasses: false },
  cook: { skin: '#f1c7a1', hair: '#6b3d16', hairStyle: 'court', outfit: 'cuisine', color: '#ffffff', accent: '#ff6f91', hat: 'toque', glasses: false },
  dj: { skin: '#7a4a2e', hair: '#111111', hairStyle: 'rase', outfit: 'dj', color: '#7b4dff', accent: '#ff3fa4', hat: 'casque', glasses: true },
};

// ---------------------------------------------------------------- Animations
export type Anim = 'walk' | 'idle' | 'interact' | 'sit' | 'dance' | 'wave' | 'clap' | 'cheer';
/** Nombre d'images et directions disponibles par animation (les gestes sociaux sont de face). */
export const ANIMS: Record<Anim, { frames: number; dirs: Dir[]; fps: number }> = {
  walk: { frames: 6, dirs: DIRS, fps: 10 },
  idle: { frames: 4, dirs: DIRS, fps: 2.5 },
  interact: { frames: 2, dirs: DIRS, fps: 4 },
  sit: { frames: 2, dirs: ['down'], fps: 0.8 },
  dance: { frames: 8, dirs: ['down'], fps: 8 },
  wave: { frames: 2, dirs: ['down'], fps: 5 },
  clap: { frames: 2, dirs: ['down'], fps: 8 },
  cheer: { frames: 2, dirs: ['down'], fps: 4 },
};

interface Pose {
  dir: Dir;
  /** Avancée des jambes (−1..1) : de profil, la jambe avant ; de face, la jambe levée. */
  step: number;
  /** Angles des bras (radians, 0 = le long du corps, π = levé). De face : vers l'extérieur ; de profil : vers l'avant. */
  armA: number; armB: number;
  bob: number; sway: number;
  blink: boolean; mouth: 'smile' | 'open' | 'line';
  sit?: boolean;
}

export function poseFor(anim: Anim, dir: Dir, f: number): Pose {
  const base: Pose = { dir, step: 0, armA: 0.12, armB: 0.12, bob: 0, sway: 0, blink: false, mouth: 'smile' };
  switch (anim) {
    case 'walk': {
      const p = (f / 6) * Math.PI * 2, s = Math.sin(p);
      const side = dir === 'left' || dir === 'right';
      return { ...base, step: s, armA: side ? -s * 0.6 : 0.12 + Math.max(0, s) * 0.2, armB: side ? s * 0.6 : 0.12 + Math.max(0, -s) * 0.2, bob: -Math.abs(Math.cos(p)) * 1.1 };
    }
    case 'idle': return { ...base, bob: [0, -0.4, -0.6, -0.4][f], blink: f === 3 };
    case 'interact': {
      if (dir === 'up') return { ...base, armB: 2.3 + f * 0.25 };
      return { ...base, armB: dir === 'down' ? 1.0 + f * 0.25 : 1.35 + f * 0.2, mouth: 'open' };
    }
    case 'sit': return { ...base, sit: true, blink: f === 1, armA: 0.25, armB: 0.25 };
    case 'dance': {
      const arms: Array<[number, number]> = [[2.5, 0.3], [1.4, 1.4], [0.3, 2.5], [1.4, 1.4], [2.7, 2.7], [1.0, 1.0], [2.2, 0.6], [0.6, 2.2]];
      const p = (f / 8) * Math.PI * 2;
      return { ...base, armA: arms[f][0], armB: arms[f][1], sway: Math.sin(p) * 1.6, bob: -Math.abs(Math.sin(p * 2)) * 2, step: f % 2 ? (f % 4 === 1 ? 1 : -1) : 0, mouth: f % 4 === 0 ? 'open' : 'smile' };
    }
    case 'wave': return { ...base, armB: f ? 2.85 : 2.4, mouth: 'open' };
    case 'clap': return { ...base, armA: f ? -0.95 : -0.55, armB: f ? -0.95 : -0.55, bob: f ? -0.5 : 0 };
    case 'cheer': return { ...base, armA: f ? 2.85 : 2.6, armB: f ? 2.85 : 2.6, bob: f ? -1.6 : -0.6, mouth: 'open' };
  }
}

// ---------------------------------------------------------------- Dessin
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const OUTLINE = 'rgba(20,16,30,0.55)';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y); ctx.arcTo(x + w, y, x + w, y + h, k); ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k); ctx.arcTo(x, y, x + w, y, k); ctx.closePath();
}
function fillOut(ctx: CanvasRenderingContext2D, color: string, line = 0.7): void {
  ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = line; ctx.stroke();
}

interface Palette { top: string; topDark: string; bottom: string; bottomDark: string; legsBare: boolean; shoes: string; sleeve: string; skirt: boolean }

/** Couleurs des pantalons et chaussures achetés (remplacent ceux de la tenue). */
const PANTS_COLORS: Record<Exclude<Pants, 'auto'>, [string, string]> = { jean: ['#2b3f6b', '#1f2f52'], chino: ['#c8b28a', '#a8946c'], noir: ['#1a181d', '#0d0c10'], blanc: ['#f3eee4', '#d8d2c6'] };
const SHOE_COLORS: Record<Exclude<Shoes, 'auto'>, string> = { baskets: '#f6f6f6', mocassins: '#7a3f1d', escarpins: '#b0193b', bottes: '#141216', sandales: '#c98d62' };

function outfitPalette(l: Look): Palette {
  const P = basePalette(l);
  if (l.pants && l.pants !== 'auto' && !P.skirt) { const [a, b] = PANTS_COLORS[l.pants]; P.bottom = a; P.bottomDark = b; P.legsBare = false; }
  if (l.shoes && l.shoes !== 'auto') P.shoes = SHOE_COLORS[l.shoes];
  return P;
}

function basePalette(l: Look): Palette {
  const c = l.color;
  switch (l.outfit) {
    case 'marin': return { top: '#f8f6f0', topDark: '#d9d4c8', bottom: c, bottomDark: shade(c, -0.12), legsBare: false, shoes: '#1d1a20', sleeve: '#f8f6f0', skirt: false };
    case 'polo': return { top: c, topDark: shade(c, -0.12), bottom: '#d8c8a8', bottomDark: '#bba987', legsBare: false, shoes: '#5a3a1e', sleeve: c, skirt: false };
    case 'hawai': return { top: c, topDark: shade(c, -0.12), bottom: '#e9dcc0', bottomDark: '#cdbd9a', legsBare: true, shoes: '#c98d62', sleeve: c, skirt: false };
    case 'robe': return { top: c, topDark: shade(c, -0.12), bottom: c, bottomDark: shade(c, -0.16), legsBare: true, shoes: '#e5b54a', sleeve: c, skirt: true };
    case 'costume': return { top: c, topDark: shade(c, -0.12), bottom: shade(c, -0.08), bottomDark: shade(c, -0.18), legsBare: false, shoes: '#1d1a20', sleeve: c, skirt: false };
    case 'blazer': return { top: c, topDark: shade(c, -0.14), bottom: shade(c, -0.1), bottomDark: shade(c, -0.22), legsBare: false, shoes: '#1d1a20', sleeve: c, skirt: false };
    case 'cuir': return { top: '#141216', topDark: '#08070a', bottom: '#2b3f6b', bottomDark: '#1f2f52', legsBare: false, shoes: '#141216', sleeve: '#141216', skirt: false };
    case 'soiree': return { top: c, topDark: shade(c, -0.16), bottom: c, bottomDark: shade(c, -0.2), legsBare: false, shoes: '#d4af5a', sleeve: c, skirt: true };
    case 'lin': return { top: '#ece2cc', topDark: '#d6c9ad', bottom: '#e6dbc2', bottomDark: '#cfc2a6', legsBare: false, shoes: '#7a3f1d', sleeve: '#ece2cc', skirt: false };
    case 'survet': return { top: c, topDark: shade(c, -0.14), bottom: shade(c, -0.12), bottomDark: shade(c, -0.24), legsBare: false, shoes: '#f4f4f4', sleeve: c, skirt: false };
    case 'smoking': return { top: '#111015', topDark: '#08070a', bottom: '#111015', bottomDark: '#08070a', legsBare: false, shoes: '#08070a', sleeve: '#111015', skirt: false };
    case 'sport': return { top: c, topDark: shade(c, -0.12), bottom: '#1b2a4a', bottomDark: '#132038', legsBare: true, shoes: '#f4f4f4', sleeve: c, skirt: false };
    case 'barman': case 'croupier': return { top: '#f4efe6', topDark: '#d8d2c6', bottom: '#14161f', bottomDark: '#0c0d13', legsBare: false, shoes: '#0c0d13', sleeve: '#f4efe6', skirt: false };
    case 'accueil': return { top: c, topDark: shade(c, -0.12), bottom: '#0c1f3b', bottomDark: '#081528', legsBare: false, shoes: '#0c0d13', sleeve: c, skirt: false };
    case 'cuisine': return { top: '#ffffff', topDark: '#e3e3e3', bottom: '#2b3440', bottomDark: '#1e252e', legsBare: false, shoes: '#1d1a20', sleeve: '#ffffff', skirt: false };
    case 'dj': return { top: c, topDark: shade(c, -0.14), bottom: '#16121f', bottomDark: '#0c0a12', legsBare: false, shoes: '#f4f4f4', sleeve: c, skirt: false };
    case 'arcade': return { top: c, topDark: shade(c, -0.12), bottom: '#0b0718', bottomDark: '#050310', legsBare: false, shoes: '#6ff3ff', sleeve: c, skirt: false };
    case 'officier': return { top: '#f8f6f0', topDark: '#dcd7cc', bottom: '#f8f6f0', bottomDark: '#dcd7cc', legsBare: false, shoes: '#1d1a20', sleeve: '#f8f6f0', skirt: false };
  }
}

function drawLegs(ctx: CanvasRenderingContext2D, l: Look, P: Palette, p: Pose): void {
  const side = p.dir === 'left' || p.dir === 'right';
  const hipY = 34 + p.bob;
  if (p.sit) {
    // Assis de face : cuisses raccourcies, genoux écartés, pieds sous l'assise
    for (const x of [11.6, 16.4]) {
      ctx.fillStyle = P.legsBare ? l.skin : P.bottom; rr(ctx, x, hipY, 4.2, 5, 1.6); fillOut(ctx, P.legsBare ? l.skin : P.bottom);
      rr(ctx, x + 0.2, hipY + 4.5, 3.8, 4, 1.4); fillOut(ctx, P.legsBare ? shade(l.skin, -0.04) : P.bottomDark);
      rr(ctx, x - 0.4, hipY + 8, 5, 2.6, 1.2); fillOut(ctx, P.shoes);
    }
    return;
  }
  const legColor = (k: number) => (P.legsBare ? shade(l.skin, k) : k < 0 ? P.bottomDark : P.bottom);
  if (side) {
    // De profil (orienté vers la gauche ; la droite est obtenue par miroir) : jambe arrière puis avant
    for (const [sgn, k] of [[1, -0.06], [-1, 0]] as const) {
      const off = -p.step * 3 * sgn * -1; // la jambe « avant » avance quand step > 0
      ctx.save(); ctx.translate(16, hipY); ctx.rotate(off * 0.09);
      rr(ctx, -2.1, 0, 4.2, 10.5, 1.8); fillOut(ctx, legColor(k));
      if (!P.legsBare) { ctx.fillStyle = P.bottomDark; ctx.fillRect(-2.1, 0, 4.2, 1); }
      rr(ctx, -3.6, 9, 5.6, 2.8, 1.3); fillOut(ctx, P.shoes);
      ctx.restore();
    }
  } else {
    const liftA = Math.max(0, p.step) * 2.2, liftB = Math.max(0, -p.step) * 2.2;
    for (const [x, lift, k] of [[11.6 + p.sway * 0.3, liftA, 0], [16.4 + p.sway * 0.3, liftB, -0.05]] as const) {
      rr(ctx, x, hipY, 4.2, 10.5 - lift, 1.8); fillOut(ctx, legColor(k));
      rr(ctx, x - 0.5, hipY + 9 - lift, 5.2, 2.8, 1.3); fillOut(ctx, P.shoes);
    }
  }
  // Short / bas de pantalon (jambes nues : short au-dessus du genou)
  if (P.legsBare && !P.skirt) {
    ctx.fillStyle = P.bottom;
    if (side) { rr(ctx, 12.5, hipY - 1, 7, 5, 1.6); fillOut(ctx, P.bottom); }
    else { rr(ctx, 10.8 + p.sway * 0.3, hipY - 1, 10.4, 5, 1.6); fillOut(ctx, P.bottom); }
  }
}

function drawArm(ctx: CanvasRenderingContext2D, l: Look, P: Palette, px: number, py: number, angle: number, sign: number, dark: boolean): void {
  ctx.save(); ctx.translate(px, py); ctx.rotate(sign * angle);
  const short = l.outfit === 'hawai' || l.outfit === 'sport' || l.outfit === 'robe' || l.outfit === 'polo' || l.outfit === 'arcade';
  if (short) {
    rr(ctx, -1.8, -0.5, 3.6, 4.5, 1.5); fillOut(ctx, dark ? shade(P.sleeve === P.top ? P.top : P.sleeve, -0.1) : P.sleeve);
    rr(ctx, -1.6, 3.5, 3.2, 6, 1.4); fillOut(ctx, dark ? shade(l.skin, -0.08) : l.skin);
  } else {
    rr(ctx, -1.8, -0.5, 3.6, 9, 1.6); fillOut(ctx, dark ? P.topDark : P.sleeve);
    if (l.outfit === 'officier') { ctx.fillStyle = '#e5b54a'; ctx.fillRect(-1.8, 6.6, 3.6, 0.9); }
  }
  if (l.jewel === 'montre' && sign === 1 && !dark) { ctx.fillStyle = '#d4af5a'; ctx.fillRect(-1.9, 7.6, 3.8, 1.3); }
  ctx.beginPath(); ctx.arc(0, 9.6, 1.9, 0, Math.PI * 2); fillOut(ctx, dark ? shade(l.skin, -0.08) : l.skin, 0.5);
  ctx.restore();
}

function drawTorso(ctx: CanvasRenderingContext2D, l: Look, P: Palette, p: Pose): void {
  const side = p.dir === 'left' || p.dir === 'right', back = p.dir === 'up';
  const ty = 22 + p.bob, x0 = (side ? 11 : 9.4) + p.sway * 0.6, w = side ? 10 : 13.2;
  const g = ctx.createLinearGradient(x0, ty, x0 + w, ty);
  g.addColorStop(0, shade(P.top === '#ffffff' ? '#f4f4f4' : P.top, 0.05)); g.addColorStop(1, P.topDark);
  if (P.skirt) {
    // Robe : buste + jupe évasée
    ctx.beginPath(); ctx.moveTo(x0 + 1, ty + 1); ctx.lineTo(x0 + w - 1, ty + 1); ctx.lineTo(x0 + w + 2, ty + 18); ctx.lineTo(x0 - 2, ty + 18); ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = shade(l.color, -0.18); ctx.fillRect(x0 - 1.5, ty + 15.5, w + 3, 1.2);
    ctx.fillStyle = l.accent; ctx.fillRect(x0 + 1, ty + 9, w - 2, 1.4); // ceinture
    if (l.outfit === 'soiree') { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0 + 2, ty + 2, 1.2, 14); }
    drawJewelTorso(ctx, l, p, x0 + w / 2, ty);
    return;
  }
  rr(ctx, x0, ty, w, 13.5, 4); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.7; ctx.stroke();
  const cx = x0 + w / 2;
  switch (l.outfit) {
    case 'marin':
      if (back) { ctx.fillStyle = l.color; ctx.fillRect(x0 + 1.5, ty, w - 3, 5.5); ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 2.5, ty + 4, w - 5, 0.8); }
      else if (!side) { ctx.fillStyle = l.color; ctx.beginPath(); ctx.moveTo(x0 + 1, ty); ctx.lineTo(x0 + w - 1, ty); ctx.lineTo(cx, ty + 6.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = l.accent; ctx.beginPath(); ctx.moveTo(cx - 1.6, ty + 5.5); ctx.lineTo(cx + 1.6, ty + 5.5); ctx.lineTo(cx, ty + 8.5); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = l.color; ctx.fillRect(x0 + w - 4, ty, 4, 5); }
      ctx.fillStyle = l.color; ctx.fillRect(x0 + 0.5, ty + 11.5, w - 1, 1.6);
      break;
    case 'polo':
      if (!back) { ctx.fillStyle = shade(l.color, 0.15); ctx.fillRect(cx - 3, ty, 6, 2); ctx.fillStyle = l.accent; if (!side) { ctx.fillRect(cx - 0.4, ty + 2, 0.8, 3.5); } }
      break;
    case 'hawai':
      ctx.fillStyle = l.accent;
      for (const [dx, dy] of [[2.5, 3], [8, 2], [5, 7.5], [10, 9], [2, 10.5]] as const) { if (dx < w) { ctx.beginPath(); ctx.arc(x0 + dx, ty + dy, 1.1, 0, Math.PI * 2); ctx.fill(); } }
      if (!back && !side) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx - 3, ty); ctx.lineTo(cx, ty + 4); ctx.lineTo(cx + 3, ty); ctx.fill(); }
      break;
    case 'costume':
      if (!back && !side) {
        ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.moveTo(cx - 3, ty); ctx.lineTo(cx + 3, ty); ctx.lineTo(cx, ty + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = l.accent; ctx.beginPath(); ctx.moveTo(cx - 0.9, ty + 1.5); ctx.lineTo(cx + 0.9, ty + 1.5); ctx.lineTo(cx + 1.1, ty + 7); ctx.lineTo(cx, ty + 8.5); ctx.lineTo(cx - 1.1, ty + 7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = shade(l.color, -0.25); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx - 3, ty); ctx.lineTo(cx - 1, ty + 9); ctx.moveTo(cx + 3, ty); ctx.lineTo(cx + 1, ty + 9); ctx.stroke();
      }
      break;
    case 'smoking':
      // Revers de satin, chemise blanche, nœud papillon (couleur d'accent) et boutons dorés
      if (!back && !side) {
        ctx.fillStyle = '#f8f6f0'; ctx.beginPath(); ctx.moveTo(cx - 3.2, ty); ctx.lineTo(cx + 3.2, ty); ctx.lineTo(cx, ty + 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#26232c'; ctx.beginPath(); ctx.moveTo(cx - 3.2, ty); ctx.lineTo(cx - 0.6, ty + 9); ctx.lineTo(cx - 4.2, ty + 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 3.2, ty); ctx.lineTo(cx + 0.6, ty + 9); ctx.lineTo(cx + 4.2, ty + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = l.accent; ctx.beginPath(); ctx.moveTo(cx - 2.6, ty + 0.6); ctx.lineTo(cx, ty + 1.6); ctx.lineTo(cx - 2.6, ty + 2.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 2.6, ty + 0.6); ctx.lineTo(cx, ty + 1.6); ctx.lineTo(cx + 2.6, ty + 2.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d4af5a'; ctx.fillRect(cx - 0.5, ty + 4.5, 1, 1); ctx.fillRect(cx - 0.5, ty + 6.8, 1, 1);
      }
      break;
    case 'blazer':
      // Veste croisée : chemise blanche, revers, deux rangées de boutons dorés
      if (!back && !side) {
        ctx.fillStyle = '#f8f6f0'; ctx.beginPath(); ctx.moveTo(cx - 2.6, ty); ctx.lineTo(cx + 2.6, ty); ctx.lineTo(cx, ty + 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = shade(l.color, -0.3); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx - 2.6, ty); ctx.lineTo(cx + 1.5, ty + 9); ctx.moveTo(cx + 2.6, ty); ctx.lineTo(cx + 0.3, ty + 6); ctx.stroke();
        ctx.fillStyle = '#d4af5a'; for (const dy of [6.5, 9.5]) { ctx.beginPath(); ctx.arc(cx - 1.8, ty + dy, 0.6, 0, Math.PI * 2); ctx.arc(cx + 2.6, ty + dy, 0.6, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    case 'cuir':
      // Perfecto : col, fermeture en biais, t-shirt blanc
      if (!back && !side) {
        ctx.fillStyle = '#f4f4f4'; ctx.fillRect(cx - 2, ty, 4, 4);
        ctx.strokeStyle = '#c9ccd3'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(cx + 2.2, ty + 1); ctx.lineTo(cx - 1.5, ty + 12.5); ctx.stroke();
        ctx.fillStyle = '#26232c'; ctx.beginPath(); ctx.moveTo(x0 + 1, ty); ctx.lineTo(cx - 2, ty); ctx.lineTo(x0 + 3, ty + 5); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0 + 1.5, ty + 1.5, 1.2, 9);
      break;
    case 'lin':
      if (!back && !side) { ctx.fillStyle = l.skin; ctx.beginPath(); ctx.moveTo(cx - 2.4, ty); ctx.lineTo(cx + 2.4, ty); ctx.lineTo(cx, ty + 5); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = 'rgba(120,100,70,0.25)'; ctx.lineWidth = 0.4; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * w / 4, ty + 1); ctx.lineTo(x0 + i * w / 4 - 0.5, ty + 13); ctx.stroke(); }
      break;
    case 'survet':
      ctx.fillStyle = l.accent; ctx.fillRect(x0 + 0.6, ty + 1, 1.3, 12); ctx.fillRect(x0 + w - 1.9, ty + 1, 1.3, 12);
      if (!back && !side) { ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx, ty + 13); ctx.stroke(); }
      break;
    case 'sport':
      ctx.fillStyle = l.accent; ctx.fillRect(x0 + 0.5, ty + 6, w - 1, 1.5);
      if (!back && !side) { ctx.fillStyle = shade(l.color, -0.2); ctx.beginPath(); ctx.arc(cx, ty, 2.5, 0, Math.PI); ctx.fill(); }
      break;
    case 'barman': case 'croupier': {
      if (!back) {
        ctx.fillStyle = l.color; rr(ctx, x0 + 0.8, ty + 3, w - 1.6, 10.5, 2); ctx.fill();
        if (!side) { ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.moveTo(cx - 2.5, ty + 3); ctx.lineTo(cx + 2.5, ty + 3); ctx.lineTo(cx, ty + 8); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = l.outfit === 'croupier' ? '#e5b54a' : l.accent;
        if (!side) { ctx.fillRect(cx - 2.6, ty + 0.4, 2.2, 2); ctx.fillRect(cx + 0.4, ty + 0.4, 2.2, 2); ctx.fillRect(cx - 0.6, ty + 0.7, 1.2, 1.4); }
      } else { ctx.fillStyle = l.color; rr(ctx, x0 + 0.8, ty + 2, w - 1.6, 11, 2); ctx.fill(); }
      break;
    }
    case 'accueil':
      if (!back) { ctx.fillStyle = l.accent; ctx.beginPath(); ctx.moveTo(cx - 3.5, ty); ctx.lineTo(cx + 3.5, ty); ctx.lineTo(cx + 1, ty + 6); ctx.lineTo(cx - 1, ty + 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e5b54a'; ctx.fillRect(x0 + w - 4, ty + 4, 2, 2.5); }
      break;
    case 'cuisine':
      if (!back) { ctx.fillStyle = '#c9ccd3'; for (const dy of [3, 6.5, 10]) { ctx.beginPath(); ctx.arc(cx - 2.3, ty + dy, 0.7, 0, Math.PI * 2); ctx.arc(cx + 2.3, ty + dy, 0.7, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = l.accent; ctx.fillRect(cx - 4, ty, 8, 2); }
      break;
    case 'dj':
      ctx.fillStyle = shade(l.color, -0.25); if (!back && !side) { ctx.fillRect(cx - 0.5, ty + 2, 1, 6); ctx.fillStyle = l.accent; ctx.fillRect(x0 + 2, ty + 8, w - 4, 3); }
      if (back) { ctx.beginPath(); ctx.ellipse(cx, ty + 1.5, 5, 2.5, 0, 0, Math.PI); ctx.fill(); }
      break;
    case 'arcade':
      ctx.fillStyle = l.accent; ctx.fillRect(x0 + 0.5, ty, w - 1, 1.6); if (!back && !side) { ctx.font = '700 4px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', cx, ty + 7); }
      break;
    case 'officier':
      ctx.fillStyle = '#e5b54a';
      if (!back && !side) { for (const dy of [4, 7.5, 11]) { ctx.beginPath(); ctx.arc(cx, ty + dy, 0.75, 0, Math.PI * 2); ctx.fill(); } }
      ctx.fillRect(x0 - 0.5, ty + 0.5, 3, 1.4); ctx.fillRect(x0 + w - 2.5, ty + 0.5, 3, 1.4); // épaulettes
      break;
    default: break;
  }
  drawJewelTorso(ctx, l, p, cx, ty);
}

/** Collier de perles ou chaîne en or, au col (de face et de profil). */
function drawJewelTorso(ctx: CanvasRenderingContext2D, l: Look, p: Pose, cx: number, ty: number): void {
  if (p.dir === 'up' || (l.jewel !== 'collier' && l.jewel !== 'chaine')) return;
  const side = p.dir === 'left' || p.dir === 'right';
  const ox = side ? -1.5 : 0;
  if (l.jewel === 'collier') {
    ctx.fillStyle = '#fbf6ea';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(cx + ox + i * 1.3, ty + 1.2 + (2 - Math.abs(i)) * 0.55, 0.65, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(cx + ox, ty - 1, 3.4, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
  }
}

function drawHairBack(ctx: CanvasRenderingContext2D, l: Look, p: Pose, hx: number, hy: number): void {
  // Partie des cheveux derrière la tête (cheveux longs, queue) — visible de face et de profil
  const h = l.hair;
  ctx.fillStyle = h;
  const side = p.dir === 'left' || p.dir === 'right';
  if (p.dir === 'up') return;
  if (l.hairStyle === 'long') { rr(ctx, hx - (side ? 4 : 9.6), hy - 2, side ? 11 : 19.2, 15, 4); fillOut(ctx, shade(h, -0.06)); }
  if (l.hairStyle === 'carre') { rr(ctx, hx - (side ? 3 : 9.8), hy - 2, side ? 10 : 19.6, 10, 3.5); fillOut(ctx, shade(h, -0.06)); }
  if (l.hairStyle === 'queue' && side) { ctx.beginPath(); ctx.ellipse(hx + 9, hy + 1, 3, 6, 0.3, 0, Math.PI * 2); fillOut(ctx, shade(h, -0.06)); }
  if (l.hairStyle === 'boucles') { for (const [dx, dy] of [[-8, 2], [8, 2], [-7, 6], [7, 6]] as const) { if (side && dx < 0) continue; ctx.beginPath(); ctx.arc(hx + dx, hy + dy, 3.3, 0, Math.PI * 2); fillOut(ctx, shade(h, -0.06)); } }
}

function drawHead(ctx: CanvasRenderingContext2D, l: Look, p: Pose): void {
  const side = p.dir === 'left' || p.dir === 'right', back = p.dir === 'up';
  const hx = (side ? 15 : 16) + p.sway, hy = 13 + p.bob;
  drawHairBack(ctx, l, p, hx, hy);
  // Cou + tête
  ctx.fillStyle = shade(l.skin, -0.1); ctx.fillRect(hx - 2, hy + 7, 4, 3.2);
  ctx.beginPath(); ctx.ellipse(hx, hy, 9.2, 9, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(hx - 3, hy - 3, 1, hx, hy, 10);
  g.addColorStop(0, shade(l.skin, 0.06)); g.addColorStop(1, shade(l.skin, -0.06));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.7; ctx.stroke();
  // Oreille de profil
  if (side) { ctx.beginPath(); ctx.ellipse(hx + 4, hy + 1, 1.6, 2.2, 0, 0, Math.PI * 2); fillOut(ctx, shade(l.skin, -0.04), 0.5); }
  // Visage
  if (!back) {
    const eyeY = hy + 1.2;
    const eyes = side ? [hx - 5] : [hx - 3.7, hx + 3.7];
    for (const ex of eyes) {
      if (p.blink) { ctx.strokeStyle = '#1b1a2a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(ex - 1.3, eyeY); ctx.lineTo(ex + 1.3, eyeY); ctx.stroke(); continue; }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ex, eyeY, 1.6, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1a2a'; ctx.beginPath(); ctx.ellipse(ex + (side ? -0.5 : 0), eyeY + 0.3, 1.1, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ex - 0.2 + (side ? -0.5 : 0), eyeY - 0.6, 0.7, 0.7);
      ctx.strokeStyle = shade(l.hair, -0.05); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(ex - 1.5, eyeY - 2.8); ctx.lineTo(ex + 1.4, eyeY - 3.1); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,110,110,0.28)';
    for (const cx of side ? [hx - 4] : [hx - 5.6, hx + 5.6]) { ctx.beginPath(); ctx.ellipse(cx, hy + 4.4, 1.8, 1.1, 0, 0, Math.PI * 2); ctx.fill(); }
    const mx = side ? hx - 5.5 : hx, my = hy + 5.3;
    ctx.strokeStyle = '#7a3b2e'; ctx.fillStyle = '#7a3b2e'; ctx.lineWidth = 0.8;
    if (p.mouth === 'open') { ctx.beginPath(); ctx.ellipse(mx, my + 0.3, 1.3, 1.1, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (p.mouth === 'line') { ctx.beginPath(); ctx.moveTo(mx - 1, my); ctx.lineTo(mx + 1, my); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(mx, my - 0.8, 1.6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    if (side) { ctx.strokeStyle = shade(l.skin, -0.2); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx - 8.8, hy + 1.5); ctx.quadraticCurveTo(hx - 10.2, hy + 3, hx - 8.6, hy + 3.5); ctx.stroke(); }
    if (l.glasses) {
      const st = l.glassesStyle ?? 'soleil';
      if (st === 'aviateur') {
        ctx.fillStyle = 'rgba(40,30,20,0.8)'; ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = 0.6;
        for (const ex of eyes) { ctx.beginPath(); ctx.moveTo(ex - 2.3, eyeY - 1.6); ctx.lineTo(ex + 2.3, eyeY - 1.6); ctx.quadraticCurveTo(ex + 2.2, eyeY + 2.2, ex, eyeY + 2); ctx.quadraticCurveTo(ex - 2.4, eyeY + 1.8, ex - 2.3, eyeY - 1.6); ctx.fill(); ctx.stroke(); }
      } else if (st === 'rondes') {
        ctx.fillStyle = 'rgba(190,230,245,0.3)'; ctx.strokeStyle = '#141216'; ctx.lineWidth = 0.6;
        for (const ex of eyes) { ctx.beginPath(); ctx.arc(ex, eyeY, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      } else {
        ctx.fillStyle = 'rgba(10,15,30,0.85)'; ctx.strokeStyle = '#1b1a2a'; ctx.lineWidth = 0.6;
        for (const ex of eyes) { rr(ctx, ex - 2.2, eyeY - 1.8, 4.4, 3.3, 1.2); ctx.fill(); ctx.stroke(); }
      }
      ctx.strokeStyle = st === 'aviateur' ? '#d4af5a' : '#1b1a2a';
      if (!side) { ctx.beginPath(); ctx.moveTo(eyes[0] + 2.2, eyeY - 0.8); ctx.lineTo(eyes[1] - 2.2, eyeY - 0.8); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (const ex of eyes) ctx.fillRect(ex - 1.3, eyeY - 1.2, 1, 0.8);
    }
    if (l.jewel === 'boucles') {
      ctx.strokeStyle = '#d4af5a'; ctx.lineWidth = 0.7;
      for (const ex of side ? [hx + 4] : [hx - 9, hx + 9]) { ctx.beginPath(); ctx.arc(ex, hy + 4.6, 1.3, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  drawHairFront(ctx, l, p, hx, hy);
  drawHat(ctx, l, p, hx, hy);
}

function drawHairFront(ctx: CanvasRenderingContext2D, l: Look, p: Pose, hx: number, hy: number): void {
  const h = l.hair, side = p.dir === 'left' || p.dir === 'right', back = p.dir === 'up';
  const hl = shade(h, 0.14);
  ctx.fillStyle = h;
  if (l.hairStyle === 'rase') {
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(hx, hy - 2.5, 9.3, 7, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (back) { ctx.beginPath(); ctx.ellipse(hx, hy - 0.5, 9.3, 8.6, 0, 0, Math.PI * 2); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
    return;
  }
  if (back) {
    ctx.beginPath(); ctx.ellipse(hx, hy - 0.8, 9.7, 9.4, 0, 0, Math.PI * 2); fillOut(ctx, h);
    if (l.hairStyle === 'long') { rr(ctx, hx - 9.6, hy, 19.2, 13, 4); fillOut(ctx, h); }
    if (l.hairStyle === 'carre') { rr(ctx, hx - 9.8, hy, 19.6, 8, 3.5); fillOut(ctx, h); }
    if (l.hairStyle === 'chignon') { ctx.beginPath(); ctx.arc(hx, hy - 7, 4, 0, Math.PI * 2); fillOut(ctx, h); }
    if (l.hairStyle === 'queue') { ctx.beginPath(); ctx.ellipse(hx, hy + 6, 2.8, 6, 0, 0, Math.PI * 2); fillOut(ctx, h); ctx.fillStyle = l.accent; ctx.fillRect(hx - 2, hy - 0.5, 4, 1.6); }
    if (l.hairStyle === 'boucles') { for (const [dx, dy] of [[-6, -6], [0, -8], [6, -6], [-8, 0], [8, 0], [-6, 5], [0, 6], [6, 5]] as const) { ctx.beginPath(); ctx.arc(hx + dx, hy + dy, 3.4, 0, Math.PI * 2); fillOut(ctx, h); } }
    ctx.strokeStyle = hl; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(hx - 2, hy - 3, 5, 1.1 * Math.PI, 1.5 * Math.PI); ctx.stroke();
    return;
  }
  if (l.hairStyle === 'boucles') {
    const pts = side ? [[-7, -5], [-2, -8], [4, -7], [7, -2], [6, 3], [-8, -1]] : [[-7, -5], [-2, -8], [3, -8], [7, -5], [-9, 0], [9, 0]];
    for (const [dx, dy] of pts) { ctx.beginPath(); ctx.arc(hx + dx, hy + dy, 3.6, 0, Math.PI * 2); fillOut(ctx, h); }
  } else if (side) {
    ctx.beginPath(); ctx.ellipse(hx + 1.5, hy - 3, 8.8, 7, 0, Math.PI * 0.95, Math.PI * 2.1); fillOut(ctx, h);
    ctx.beginPath(); ctx.ellipse(hx + 5.6, hy - 0.5, 3.8, 6, 0, 0, Math.PI * 2); fillOut(ctx, h);
    ctx.fillStyle = h; ctx.beginPath(); ctx.ellipse(hx - 3, hy - 5.2, 5.5, 2.2, -0.2, 0, Math.PI * 2); ctx.fill(); // mèche
    if (l.hairStyle === 'chignon') { ctx.beginPath(); ctx.arc(hx + 6.5, hy - 6, 3.6, 0, Math.PI * 2); fillOut(ctx, h); }
    if (l.hairStyle === 'queue') { ctx.fillStyle = l.accent; ctx.fillRect(hx + 7, hy - 3, 1.6, 3); }
  } else {
    ctx.beginPath(); ctx.ellipse(hx, hy - 3, 9.8, 7.2, 0, Math.PI, Math.PI * 2); fillOut(ctx, h);
    // Frange
    ctx.beginPath(); ctx.moveTo(hx - 9.3, hy - 2.5);
    if (l.hairStyle === 'court' || l.hairStyle === 'queue' || l.hairStyle === 'chignon') { ctx.quadraticCurveTo(hx - 5, hy + 0.5, hx - 1.5, hy - 3.5); ctx.quadraticCurveTo(hx + 4, hy + 0.2, hx + 9.3, hy - 2.5); }
    else { ctx.quadraticCurveTo(hx - 6, hy + 2.5, hx, hy - 2); ctx.quadraticCurveTo(hx + 6, hy + 2.5, hx + 9.3, hy - 2.5); }
    ctx.lineTo(hx + 9.3, hy - 5); ctx.lineTo(hx - 9.3, hy - 5); ctx.closePath(); ctx.fillStyle = h; ctx.fill();
    if (l.hairStyle === 'long' || l.hairStyle === 'carre') { rr(ctx, hx - 10, hy - 3, 3.4, l.hairStyle === 'long' ? 14 : 9, 1.6); fillOut(ctx, h); rr(ctx, hx + 6.6, hy - 3, 3.4, l.hairStyle === 'long' ? 14 : 9, 1.6); fillOut(ctx, h); }
    if (l.hairStyle === 'chignon') { ctx.beginPath(); ctx.arc(hx, hy - 9, 3.6, 0, Math.PI * 2); fillOut(ctx, h); }
    if (l.hairStyle === 'queue') { ctx.beginPath(); ctx.ellipse(hx + 9, hy + 2, 2.4, 5, 0.2, 0, Math.PI * 2); fillOut(ctx, h); }
  }
  // Reflet
  ctx.strokeStyle = hl; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(hx - 2, hy - 2, 6, 1.15 * Math.PI, 1.45 * Math.PI); ctx.stroke();
}

function drawHat(ctx: CanvasRenderingContext2D, l: Look, p: Pose, hx: number, hy: number): void {
  const side = p.dir === 'left' || p.dir === 'right', back = p.dir === 'up';
  switch (l.hat) {
    case 'aucun': return;
    case 'capitaine': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 6.5, 10.2, 4.2, 0, Math.PI, Math.PI * 2); ctx.lineTo(hx + 10.2, hy - 4.5); ctx.lineTo(hx - 10.2, hy - 4.5); ctx.closePath(); fillOut(ctx, '#f8f6f0');
      ctx.fillStyle = '#10213a'; ctx.fillRect(hx - 9.8, hy - 6.5, 19.6, 2.2);
      if (!back) {
        if (side) { ctx.beginPath(); ctx.ellipse(hx - 8, hy - 4, 4.5, 1.6, -0.15, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.ellipse(hx, hy - 4, 7, 1.8, 0, 0, Math.PI); ctx.fill(); }
        ctx.fillStyle = l.accent; ctx.beginPath(); ctx.arc(side ? hx - 4 : hx, hy - 8.5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    case 'paille': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 5, 13, 3.6, 0, 0, Math.PI * 2); fillOut(ctx, '#e8c77a');
      ctx.beginPath(); ctx.ellipse(hx, hy - 7, 7, 4.5, 0, Math.PI, Math.PI * 2); ctx.lineTo(hx + 7, hy - 5.5); ctx.lineTo(hx - 7, hy - 5.5); ctx.closePath(); fillOut(ctx, '#f0d48c');
      ctx.fillStyle = l.accent === '#f4efe6' ? '#c0392b' : l.accent; ctx.fillRect(hx - 7, hy - 7.2, 14, 1.6);
      return;
    }
    case 'bob': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 6, 9.6, 5.5, 0, Math.PI, Math.PI * 2); ctx.lineTo(hx + 11, hy - 3.5); ctx.lineTo(hx - 11, hy - 3.5); ctx.closePath(); fillOut(ctx, l.color === '#f4efe6' ? '#1fc7c1' : '#f4efe6');
      return;
    }
    case 'casquette': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 5.5, 9.4, 5.8, 0, Math.PI, Math.PI * 2); ctx.closePath(); fillOut(ctx, l.accent);
      if (!back) { ctx.fillStyle = shade(l.accent, -0.2); if (side) { ctx.beginPath(); ctx.ellipse(hx - 9, hy - 5.2, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill(); } else { ctx.beginPath(); ctx.ellipse(hx, hy - 5, 7.5, 2.2, 0, 0, Math.PI); ctx.fill(); } }
      return;
    }
    case 'hautdeforme': {
      // Haut-de-forme noir, ruban doré
      ctx.beginPath(); ctx.ellipse(hx, hy - 5, 11.5, 2.8, 0, 0, Math.PI * 2); fillOut(ctx, '#121014');
      rr(ctx, hx - 6.8, hy - 19, 13.6, 14.5, 2); fillOut(ctx, '#121014');
      ctx.fillStyle = '#d4af5a'; ctx.fillRect(hx - 6.6, hy - 8.5, 13.2, 2.2);
      if (!back) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(hx - (side ? 1 : 4.5), hy - 18, 1.6, 9); }
      return;
    }
    case 'fedora': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 5.5, 12, 3, 0, 0, Math.PI * 2); fillOut(ctx, '#4a4650');
      ctx.beginPath(); ctx.moveTo(hx - 7, hy - 6); ctx.quadraticCurveTo(hx - 7, hy - 15, hx, hy - 13.5); ctx.quadraticCurveTo(hx + 7, hy - 15, hx + 7, hy - 6); ctx.closePath(); fillOut(ctx, '#5a5560');
      ctx.fillStyle = '#141216'; ctx.fillRect(hx - 7, hy - 8.4, 14, 2);
      if (!back) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx, hy - 13.5); ctx.lineTo(hx, hy - 10); ctx.stroke(); }
      return;
    }
    case 'beret': {
      ctx.save(); ctx.translate(hx, hy - 7.5); ctx.rotate(side ? -0.25 : -0.15);
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.2, 0, 0, Math.PI * 2); fillOut(ctx, '#5e1426');
      ctx.fillStyle = '#3a0c17'; ctx.fillRect(-0.6, -5.6, 1.2, 2);
      ctx.restore();
      return;
    }
    case 'panama': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 5.2, 12, 3, 0, 0, Math.PI * 2); fillOut(ctx, '#efdcae');
      ctx.beginPath(); ctx.ellipse(hx, hy - 8, 7, 5, 0, Math.PI, Math.PI * 2); ctx.lineTo(hx + 7, hy - 5.5); ctx.lineTo(hx - 7, hy - 5.5); ctx.closePath(); fillOut(ctx, '#f6e9c6');
      ctx.fillStyle = '#141216'; ctx.fillRect(hx - 7, hy - 7.6, 14, 1.6);
      return;
    }
    case 'bandana': {
      ctx.beginPath(); ctx.ellipse(hx, hy - 4.5, 9.6, 6, 0, Math.PI, Math.PI * 2); ctx.closePath(); fillOut(ctx, '#c0392b');
      ctx.fillStyle = '#ffffff'; for (const [dx, dy] of [[-5, -7], [0, -9], [5, -7], [-2, -5], [3, -5]] as const) { ctx.beginPath(); ctx.arc(hx + dx, hy + dy, 0.6, 0, Math.PI * 2); ctx.fill(); }
      if (side || back) { ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(hx + (side ? 8 : 0), hy - 4); ctx.lineTo(hx + (side ? 12 : 3), hy); ctx.lineTo(hx + (side ? 10 : -3), hy + 1); ctx.closePath(); ctx.fill(); }
      return;
    }
    case 'toque': {
      rr(ctx, hx - 6.5, hy - 17, 13, 11, 4); fillOut(ctx, '#ffffff');
      ctx.fillStyle = '#e3e3e3'; ctx.fillRect(hx - 7, hy - 7.5, 14, 2.5);
      return;
    }
    case 'casque': {
      ctx.strokeStyle = '#16121f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy - 1, 10, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      for (const s of side ? [1] : [-1, 1]) { rr(ctx, hx + s * 9.5 - 2.2, hy - 2, 4.4, 6, 1.6); fillOut(ctx, l.accent); }
      return;
    }
  }
}

function drawPose(ctx: CanvasRenderingContext2D, l: Look, p: Pose): void {
  const P = outfitPalette(l);
  const side = p.dir === 'left' || p.dir === 'right';
  if (p.dir === 'right') { ctx.translate(FRAME_W, 0); ctx.scale(-1, 1); }
  // Ombre portée
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(16, 45.5, 9.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  const shoulderY = 23.5 + p.bob;
  if (side) {
    drawArm(ctx, l, P, 16.5, shoulderY, p.armA, 1, true); // bras arrière
    drawLegs(ctx, l, P, p);
    drawTorso(ctx, l, P, p);
    drawArm(ctx, l, P, 15.5, shoulderY, p.armB, 1, false); // bras avant (geste d'interaction)
    drawHead(ctx, l, p);
  } else {
    const back = p.dir === 'up';
    const lx = 9.6 + p.sway * 0.6, rx = 22.4 + p.sway * 0.6;
    // Bras levés au-dessus des épaules : dessinés derrière le torse si dos tourné
    drawLegs(ctx, l, P, p);
    if (back) { drawArm(ctx, l, P, lx, shoulderY, p.armA, 1, false); drawArm(ctx, l, P, rx, shoulderY, p.armB, -1, false); }
    drawTorso(ctx, l, P, p);
    if (!back) { drawArm(ctx, l, P, lx, shoulderY, p.armA, 1, false); drawArm(ctx, l, P, rx, shoulderY, p.armB, -1, false); }
    drawHead(ctx, l, p);
    if (back && (p.armA > 1.6 || p.armB > 1.6)) { // mains levées visibles au-dessus de la tête
      for (const [x, a, s] of [[lx, p.armA, 1], [rx, p.armB, -1]] as const) if (a > 1.6) { ctx.save(); ctx.translate(x, shoulderY); ctx.rotate(s * a); ctx.beginPath(); ctx.arc(0, 9.6, 1.9, 0, Math.PI * 2); ctx.fillStyle = l.skin; ctx.fill(); ctx.restore(); }
    }
  }
}

// ---------------------------------------------------------------- Cache et rendu
export function lookKey(l: Look): string {
  return `${l.skin}${l.hair}${l.hairStyle}${l.outfit}${l.color}${l.accent}${l.hat}${l.glasses ? 1 : 0}${l.pants ?? ''}${l.shoes ?? ''}${l.glassesStyle ?? ''}${l.jewel ?? ''}`;
}

function strip(l: Look, anim: Anim): AnyCanvas {
  const A = ANIMS[anim];
  return Textures.getOrCreate(`char2:${lookKey(l)}:${anim}`, () => {
    const { canvas, ctx } = makeCanvas(FRAME_W * A.frames * ART_SCALE, FRAME_H * A.dirs.length * ART_SCALE);
    A.dirs.forEach((d, row) => {
      for (let f = 0; f < A.frames; f++) {
        ctx.save(); ctx.scale(ART_SCALE, ART_SCALE); ctx.translate(f * FRAME_W, row * FRAME_H);
        drawPose(ctx, l, poseFor(anim, d, f));
        ctx.restore();
      }
    });
    return canvas;
  });
}

/** Prépare à l'avance les animations courantes d'une apparence (écran de chargement). */
export function warmLook(l: Look, anims: Anim[] = ['walk', 'idle']): void { for (const a of anims) strip(l, a); }

/** Libère les animations d'apparences qui ne sont plus utilisées (changement de tenue). */
export function releaseLook(l: Look): void { Textures.clear(`char2:${lookKey(l)}:`); }

/** Dessine un personnage, pieds en (feetX, feetY). `frame` est un compteur libre (modulo appliqué). */
export function drawLook(ctx: CanvasRenderingContext2D, l: Look, anim: Anim, dir: Dir, frame: number, feetX: number, feetY: number, scale = 1): void {
  const A = ANIMS[anim];
  const row = Math.max(0, A.dirs.indexOf(dir));
  const col = ((Math.floor(frame) % A.frames) + A.frames) % A.frames;
  const img = strip(l, anim);
  ctx.drawImage(img, col * FRAME_W * ART_SCALE, row * FRAME_H * ART_SCALE, FRAME_W * ART_SCALE, FRAME_H * ART_SCALE,
    feetX - (FRAME_W / 2) * scale, feetY - FEET_Y * scale, FRAME_W * scale, FRAME_H * scale);
}

/** Dessin direct sans cache (aperçu en grand dans l'éditeur de personnage). */
export function drawLookDirect(ctx: CanvasRenderingContext2D, l: Look, anim: Anim, dir: Dir, frame: number, feetX: number, feetY: number, scale: number): void {
  const A = ANIMS[anim];
  ctx.save();
  ctx.translate(feetX - (FRAME_W / 2) * scale, feetY - FEET_Y * scale); ctx.scale(scale, scale);
  drawPose(ctx, l, poseFor(anim, A.dirs.includes(dir) ? dir : 'down', ((Math.floor(frame) % A.frames) + A.frames) % A.frames));
  ctx.restore();
}
