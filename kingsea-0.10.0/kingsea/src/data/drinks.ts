// Cartes des bars et snacks (prix en KSCoins, monnaie virtuelle sans valeur réelle). Chaque article indique ce
// qu'il rend à la faim et à la soif (jauges de 0 à 100) : les boissons désaltèrent surtout, les plats rassasient.
// Les articles achetés vont dans l'inventaire (authority/economy.ts) ; on peut les consommer tout de suite ou plus tard.

export interface Drink {
  id: string; name: string; desc: string; price: number; color: string; foam: string;
  /** Points de faim rendus (0–100). */
  hunger: number;
  /** Points de soif rendus (0–100). */
  thirst: number;
  /** Nourriture (assiette) ou boisson (verre) : icône et verbe (« manger » / « boire »). */
  kind: 'drink' | 'food';
}

export const HUB_BAR_DRINKS: Drink[] = [
  { id: 'lagon', name: 'Lagon Bleu', desc: 'Pétillant, glaçons turquoise', price: 20, color: '#1fc7c1', foam: '#bff8f5', hunger: 0, thirst: 30, kind: 'drink' },
  { id: 'ecume', name: 'Écume Dorée', desc: 'Mousse vanille & ananas', price: 35, color: '#e5b54a', foam: '#fff1c4', hunger: 8, thirst: 40, kind: 'drink' },
  { id: 'corail', name: 'Corail Fizz', desc: 'Fruits rouges, bulles roses', price: 25, color: '#ff6f91', foam: '#ffd3df', hunger: 0, thirst: 35, kind: 'drink' },
  { id: 'abysse', name: 'Abysse', desc: 'Thé glacé myrtille', price: 15, color: '#3f51b5', foam: '#c5cdfa', hunger: 0, thirst: 25, kind: 'drink' },
  { id: 'eau', name: 'Eau minérale', desc: 'Bouteille fraîche', price: 8, color: '#bfe6f2', foam: '#ffffff', hunger: 0, thirst: 20, kind: 'drink' },
  { id: 'croissant', name: 'Croissant au beurre', desc: 'Sorti du four du bord', price: 15, color: '#d9a35a', foam: '#f6dfa8', hunger: 20, thirst: 0, kind: 'food' },
  { id: 'club', name: 'Club sandwich', desc: 'Poulet, crudités, pain de mie', price: 40, color: '#e9d3a5', foam: '#7bbf5a', hunger: 45, thirst: 0, kind: 'food' },
];

export const ROOFTOP_BAR_DRINKS: Drink[] = [
  { id: 'sunset', name: 'Coucher de soleil', desc: 'Mangue, orange, grenadine', price: 30, color: '#ff8c42', foam: '#ffe0c2', hunger: 5, thirst: 40, kind: 'drink' },
  { id: 'coco', name: 'Coco Lagon', desc: 'Lait de coco & citron vert', price: 25, color: '#f4efe6', foam: '#ffffff', hunger: 5, thirst: 35, kind: 'drink' },
  { id: 'menthe', name: 'Menthe Marine', desc: 'Limonade menthe-concombre', price: 20, color: '#59e3a7', foam: '#d6ffe9', hunger: 0, thirst: 35, kind: 'drink' },
  { id: 'nuit', name: 'Nuit Étoilée', desc: 'Myrtille pétillante, paillettes', price: 40, color: '#7b4dff', foam: '#e2d6ff', hunger: 0, thirst: 50, kind: 'drink' },
];

/** Petite restauration du rooftop. */
export const SNACK_ITEMS: Drink[] = [
  { id: 'burger', name: 'Mini-burger', desc: 'Pain brioché, sauce maison', price: 35, color: '#c48a4a', foam: '#f2c14e', hunger: 45, thirst: 0, kind: 'food' },
  { id: 'glace', name: 'Glace coco', desc: 'Deux boules, copeaux', price: 20, color: '#f4efe6', foam: '#ffb3e1', hunger: 15, thirst: 10, kind: 'food' },
  { id: 'fruits', name: 'Brochette de fruits', desc: 'Ananas, fraise, kiwi', price: 15, color: '#ff6f91', foam: '#9cffb8', hunger: 15, thirst: 15, kind: 'food' },
  { id: 'frites', name: 'Frites de patate douce', desc: 'Sel de mer', price: 25, color: '#ff9f43', foam: '#ffd166', hunger: 30, thirst: 0, kind: 'food' },
  { id: 'poke', name: 'Poké bowl', desc: 'Saumon, riz, mangue, avocat', price: 55, color: '#f08a5d', foam: '#7bbf5a', hunger: 65, thirst: 5, kind: 'food' },
];

/** Bar à champagne du salon VIP (niveau 5) : cuvées fictives sans alcool, et bouchées. */
export const VIP_DRINKS: Drink[] = [
  { id: 'brut-ks', name: 'Bulles KS', desc: 'Pétillant de raisin blanc, cuvée maison', price: 60, color: '#efdcae', foam: '#fffaf0', hunger: 0, thirst: 60, kind: 'drink' },
  { id: 'rose-royal', name: 'Rosé Royal', desc: 'Pétillant framboise & rose', price: 75, color: '#f4a6b8', foam: '#ffe6ee', hunger: 0, thirst: 70, kind: 'drink' },
  { id: 'or-noir', name: 'Or Noir', desc: 'Cola artisanal, paillettes dorées', price: 50, color: '#2a1a12', foam: '#d4af5a', hunger: 0, thirst: 55, kind: 'drink' },
  { id: 'canapes', name: 'Plateau de canapés', desc: 'Six bouchées du chef', price: 80, color: '#e9d3a5', foam: '#d4af5a', hunger: 70, thirst: 0, kind: 'food' },
];

/** Toutes les cartes, par menu (identifiant envoyé à l'autorité). */
export const MENUS: Record<string, Drink[]> = { hub: HUB_BAR_DRINKS, rooftop: ROOFTOP_BAR_DRINKS, snack: SNACK_ITEMS, vip: VIP_DRINKS };
