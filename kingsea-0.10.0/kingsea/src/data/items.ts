// Catalogue central des objets (inventaire) : identifiants stables, type, prix, empilement, effets.
// Ajouter un objet = ajouter une ligne ici (et, pour un vêtement, son dessin dans art/characters.ts) : l'autorité,
// l'inventaire, la boutique et la garde-robe le prennent en compte sans autre changement.
// Types : nourriture, boissons (jauges faim/soif), vêtements et accessoires (portés par le personnage),
// objets cosmétiques et utilisables (effets visuels), décorations (meubles de cabine, catalogue data/furniture.ts).
import { MENUS, type Drink } from './drinks';

export type ItemType = 'food' | 'drink' | 'clothing' | 'accessory' | 'cosmetic' | 'usable' | 'decoration';
/** Emplacement porté : tenue complète, pantalon, chaussures, couvre-chef, lunettes, bijou. */
export type WearSlot = 'outfit' | 'pants' | 'shoes' | 'hat' | 'glasses' | 'jewel';
export type UseEffect = 'fireworks' | 'confetti' | 'aura';

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  desc: string;
  /** Prix en KSCoins (0 : non vendu, obtenu autrement). */
  price: number;
  /** Quantité maximale détenue (1 : objet unique). */
  stack: number;
  /** Niveau requis pour l'acheter. */
  level?: number;
  hunger?: number;
  thirst?: number;
  /** Menu de vente (consommables : bar, snack…). */
  menu?: string;
  slot?: WearSlot;
  /** Valeur appliquée à l'apparence quand on porte l'objet. */
  value?: string;
  /** Couleurs d'icône. */
  colors: [string, string];
  effect?: UseEffect;
}

const consumable = (menu: string, d: Drink): ItemDef => ({
  id: `${d.kind}.${d.id}`, name: d.name, type: d.kind, desc: d.desc, price: d.price, stack: 20,
  hunger: d.hunger, thirst: d.thirst, menu, colors: [d.color, d.foam], level: menu === 'vip' ? 5 : undefined,
});

/** Vêtements et accessoires vendus à la Boutique KS (les éléments de base restent gratuits). */
const WEAR: Array<[WearSlot, string, string, string, number, number, [string, string], ItemType]> = [
  // emplacement, valeur, nom, description, prix, niveau, couleurs, type
  ['outfit', 'blazer', 'Veste croisée', 'Blazer à boutons dorés et pantalon assorti', 300, 1, ['#1d2a4a', '#d4af5a'], 'clothing'],
  ['outfit', 'cuir', 'Perfecto', 'Veste de cuir noir et t-shirt', 260, 1, ['#141216', '#c9ccd3'], 'clothing'],
  ['outfit', 'soiree', 'Robe de soirée', 'Robe longue satinée, ceinture fine', 400, 2, ['#5e1426', '#d4af5a'], 'clothing'],
  ['outfit', 'lin', 'Costume de lin', 'Lin clair, chemise ouverte : élégance d’été', 320, 2, ['#e9dcc0', '#7a5432'], 'clothing'],
  ['outfit', 'survet', 'Survêtement', 'Veste zippée à bandes, pantalon de jogging', 150, 1, ['#1f4fbf', '#ffffff'], 'clothing'],
  ['pants', 'jean', 'Jean brut', 'Denim indigo', 80, 1, ['#2b3f6b', '#c9a35a'], 'clothing'],
  ['pants', 'chino', 'Chino sable', 'Coton léger', 90, 1, ['#c8b28a', '#7a5432'], 'clothing'],
  ['pants', 'noir', 'Pantalon noir', 'Coupe droite habillée', 90, 1, ['#141216', '#4a4a52'], 'clothing'],
  ['pants', 'blanc', 'Pantalon blanc', 'Lin blanc de croisière', 90, 1, ['#f6f0e3', '#c9ccd3'], 'clothing'],
  ['shoes', 'baskets', 'Baskets blanches', 'Semelle épaisse', 70, 1, ['#f6f6f6', '#1fc7c1'], 'clothing'],
  ['shoes', 'mocassins', 'Mocassins', 'Cuir cognac', 120, 1, ['#7a3f1d', '#d4af5a'], 'clothing'],
  ['shoes', 'escarpins', 'Escarpins vernis', 'Rouge laqué', 150, 1, ['#b0193b', '#141216'], 'clothing'],
  ['shoes', 'bottes', 'Bottines', 'Cuir noir', 140, 1, ['#141216', '#5a3a1e'], 'clothing'],
  ['shoes', 'sandales', 'Sandales', 'Pour le pont et la piscine', 50, 1, ['#c98d62', '#e8c77a'], 'clothing'],
  ['hat', 'fedora', 'Fedora', 'Feutre gris à ruban noir', 140, 1, ['#5a5560', '#141216'], 'accessory'],
  ['hat', 'beret', 'Béret', 'Laine bordeaux', 90, 1, ['#5e1426', '#3a0c17'], 'accessory'],
  ['hat', 'panama', 'Panama', 'Paille fine et ruban noir', 120, 1, ['#efdcae', '#141216'], 'accessory'],
  ['hat', 'bandana', 'Bandana', 'Coton imprimé', 60, 1, ['#c0392b', '#ffffff'], 'accessory'],
  ['glasses', 'aviateur', 'Lunettes aviateur', 'Monture dorée, verres fumés', 110, 1, ['#d4af5a', '#3a3238'], 'accessory'],
  ['glasses', 'rondes', 'Lunettes rondes', 'Monture fine, verres clairs', 90, 1, ['#141216', '#bfe6f2'], 'accessory'],
  ['jewel', 'collier', 'Collier de perles', 'Un rang de perles nacrées', 200, 1, ['#f6f0e3', '#d4af5a'], 'accessory'],
  ['jewel', 'montre', 'Montre dorée', 'Bracelet maille milanaise', 250, 2, ['#d4af5a', '#141216'], 'accessory'],
  ['jewel', 'boucles', 'Boucles d’oreilles', 'Créoles dorées', 120, 1, ['#d4af5a', '#efdcae'], 'accessory'],
  ['jewel', 'chaine', 'Chaîne en or', 'Maille épaisse', 300, 3, ['#d4af5a', '#8a6a2b'], 'accessory'],
];

/** Éléments de base, toujours disponibles (pas besoin de les acheter). */
export const FREE_WEAR: Record<WearSlot, string[]> = {
  outfit: ['marin', 'polo', 'hawai', 'robe', 'costume', 'sport'],
  pants: ['auto'],
  shoes: ['auto'],
  hat: ['aucun', 'capitaine', 'paille', 'bob', 'casquette'],
  glasses: ['soleil'],
  jewel: ['aucun'],
};

export const ITEMS: ItemDef[] = [
  ...Object.entries(MENUS).flatMap(([menu, list]) => list.map((d) => consumable(menu, d))),
  ...WEAR.map(([slot, value, name, desc, price, level, colors, type]): ItemDef => ({ id: `${slot}:${value}`, name, type, desc, price, stack: 1, level, slot, value, colors })),
  { id: 'use.fireworks', name: 'Feu d’artifice de poche', type: 'usable', desc: 'Une gerbe d’étincelles dorées autour de toi', price: 40, stack: 10, colors: ['#ffd166', '#ff3fa4'], effect: 'fireworks' },
  { id: 'use.confetti', name: 'Canon à confettis', type: 'usable', desc: 'Pour fêter un gros gain', price: 25, stack: 10, colors: ['#1fc7c1', '#ff6f91'], effect: 'confetti' },
  { id: 'cos.parfum', name: 'Eau de parfum KS', type: 'cosmetic', desc: 'Un sillage scintillant pendant 3 minutes', price: 90, stack: 5, level: 2, colors: ['#efdcae', '#d4af5a'], effect: 'aura' },
];

export const ITEMS_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

/** Identifiant d'objet d'un article de bar ou de snack. */
export const consumableId = (d: Drink): string => `${d.kind}.${d.id}`;

/** Clé d'un élément porté (emplacement:valeur), celle de l'inventaire et des récompenses de niveau. */
export const wearKey = (slot: WearSlot, value: string): string => `${slot}:${value}`;

/** L'élément porté est-il disponible pour ce joueur (gratuit, acheté ou débloqué) ? */
export function ownsWear(slot: WearSlot, value: string, inventory: Record<string, number>, unlocks: readonly string[]): boolean {
  if (FREE_WEAR[slot].includes(value)) return true;
  const k = wearKey(slot, value);
  return (inventory[k] ?? 0) > 0 || unlocks.includes(k);
}

/** Libellés des types (inventaire). */
export const TYPE_LABELS: Record<ItemType, string> = {
  food: 'Nourriture', drink: 'Boissons', clothing: 'Vêtements', accessory: 'Accessoires', cosmetic: 'Cosmétiques', usable: 'Objets', decoration: 'Décorations',
};
