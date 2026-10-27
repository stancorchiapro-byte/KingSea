// Accès aux ponts du navire : le KS Pass Croisière (remis à la réception avec le cadeau de bienvenue) ouvre tous les
// ponts ; certains espaces demandent en plus un déblocage de niveau. Vérifié par le serveur à chaque entrée d'étage
// (en ligne) et par l'ascenseur et les escaliers (hors ligne comme en ligne).

export interface FloorRule {
  /** KS Pass Croisière exigé. */
  pass?: boolean;
  /** Déblocage requis (clé `feature:…`) et niveau correspondant (affichage). */
  unlock?: string;
  level?: number;
}

export const FLOOR_ACCESS: Record<string, FloorRule> = {
  hub: {},
  casino: { pass: true },
  arcade: { pass: true },
  cabins: { pass: true },
  'cabin-interior': { pass: true },
  rooftop: { pass: true },
  engine: { pass: true },
  panorama: { pass: true, unlock: 'feature:panorama', level: 10 },
};

export type Access = { ok: true } | { ok: false; reason: string; needPass?: boolean };

/** Le passager peut-il entrer sur cet étage ? `items` : inventaire (identifiant → quantité), `unlocks` : déblocages. */
export function floorAccess(floor: string, items: Record<string, number>, unlocks: readonly string[]): Access {
  const r = FLOOR_ACCESS[floor] ?? { pass: true };
  if (r.pass && !(items['ks-pass'] > 0)) return { ok: false, needPass: true, reason: 'Accès réservé aux passagers munis du KS Pass Croisière : récupère-le à la réception du hall.' };
  if (r.unlock && !unlocks.includes(r.unlock)) return { ok: false, reason: `Espace réservé : niveau ${r.level ?? '?'} requis.` };
  return { ok: true };
}
