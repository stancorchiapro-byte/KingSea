// Skee-Ball : la force du lancer décide de la hauteur d'atterrissage sur la cible, la visée de la position latérale.
// Repère de la cible : x de -1 à 1, y de 0 (bas) à 1 (haut).

export const SKEE_CENTER = { x: 0, y: 0.55 };
export const SKEE_RINGS: Array<[number, number]> = [[0.1, 50], [0.2, 40], [0.3, 30], [0.4, 20], [0.52, 10]];
export const SKEE_CORNERS = [{ x: -0.75, y: 0.95 }, { x: 0.75, y: 0.95 }];
export const CORNER_R = 0.08;
export const SKEE_BALLS = 9;

export function skeeScoreAt(x: number, y: number): number {
  for (const c of SKEE_CORNERS) if (Math.hypot(x - c.x, y - c.y) < CORNER_R) return 100;
  const d = Math.hypot(x - SKEE_CENTER.x, y - SKEE_CENTER.y);
  for (const [r, pts] of SKEE_RINGS) if (d < r) return pts;
  return 0;
}

/** Point d'atterrissage : power ∈ [0, 1.2], aim ∈ [-1, 1] ; noise ∈ [-1, 1]² (0 = lancer parfait). */
export function skeeLanding(power: number, aim: number, nx = 0, ny = 0): { x: number; y: number } {
  const p = Math.max(0, Math.min(1.2, power));
  return { x: Math.max(-1, Math.min(1, aim * 0.95 + nx * 0.035)), y: 0.05 + p * 0.95 + ny * 0.035 };
}
