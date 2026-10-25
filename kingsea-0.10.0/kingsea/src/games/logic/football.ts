// Football d'arcade (tirs au but) : le geste donne la cible dans le but, le gardien plonge.
// Repère du but : x de -1 (poteau gauche) à 1 (poteau droit), y de 0 (sol) à 1 (barre).

export type ShotOutcome = 'goal' | 'saved' | 'post' | 'bar' | 'wide' | 'over';

export const KEEPER_REACH = 0.36;
export const SHOTS_PER_GAME = 10;

/** Cible visée à partir du geste (en fractions de l'écran), avant imprécision. */
export function aimFromSwipe(goalOffsetX: number, swipeLen: number): { x: number; y: number } {
  // swipeLen : longueur du geste en fraction de la hauteur de la zone de jeu.
  return { x: goalOffsetX, y: (swipeLen - 0.15) / 0.45 };
}

/** Imprécision de la frappe : plus la cible est lointaine du centre, plus l'écart possible est grand. */
export function applyError(aim: { x: number; y: number }, rng: () => number): { x: number; y: number } {
  const spread = 0.04 + 0.05 * Math.min(1, Math.hypot(aim.x, aim.y - 0.3));
  return { x: aim.x + (rng() - 0.5) * 2 * spread, y: Math.max(0, aim.y + (rng() - 0.5) * 2 * spread) };
}

/** Plongeon du gardien : il « lit » parfois la frappe (de plus en plus souvent), sinon il devine. */
export function keeperDive(target: { x: number }, shotIndex: number, rng: () => number): number {
  const read = Math.min(0.6, 0.2 + 0.05 * shotIndex);
  if (rng() < read) return Math.max(-0.85, Math.min(0.85, target.x + (rng() - 0.5) * 0.2));
  return [-0.6, 0, 0.6][Math.floor(rng() * 3)];
}

/** Le gardien arrête-t-il une frappe en `t` en plongeant vers `diveX` ? Plus il plonge loin, moins il monte haut. */
export function keeperSaves(t: { x: number; y: number }, diveX: number): boolean {
  return Math.abs(t.x - diveX) <= KEEPER_REACH && t.y <= 0.95 - 0.35 * Math.abs(diveX);
}

export function shotOutcome(t: { x: number; y: number }, diveX: number): ShotOutcome {
  const ax = Math.abs(t.x);
  if (ax > 1.04) return 'wide';
  if (t.y > 1.04) return 'over';
  if (ax >= 0.97) return 'post';
  if (t.y >= 0.97) return 'bar';
  return keeperSaves(t, diveX) ? 'saved' : 'goal';
}
