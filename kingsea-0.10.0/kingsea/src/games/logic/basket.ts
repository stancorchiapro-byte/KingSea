// Basket-ball d'arcade : tir en vue de côté, gravité, arceau (deux points de contact) et panneau.
// Unités monde : x vers la droite, y vers le bas. Pur et déterministe : testé sous Node.

export const BASKET = {
  W: 420, H: 260, FLOOR: 250, G: 620, BALL_R: 10,
  rimFront: { x: 300, y: 105 }, rimBack: { x: 338, y: 105 }, RIM_R: 3,
  board: { x: 346, y0: 35, y1: 120 },
};

export interface Ball { x: number; y: number; vx: number; vy: number }
export interface StepEvents { scored: boolean; rim: boolean; board: boolean; floor: boolean }

/** Le centre de la balle a-t-il traversé l'arceau de haut en bas, entre les deux bords ? */
export function crossedHoop(prevY: number, y: number, x: number): boolean {
  const B = BASKET;
  return prevY < B.rimFront.y && y >= B.rimFront.y && x > B.rimFront.x + B.RIM_R && x < B.rimBack.x - B.RIM_R;
}

function bounceOnPoint(b: Ball, px: number, py: number, r: number, e: number): boolean {
  const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = r + BASKET.BALL_R;
  if (d >= min || d === 0) return false;
  const nx = dx / d, ny = dy / d;
  b.x = px + nx * min; b.y = py + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return true;
}

/** Avance la balle de dt secondes (sous-pas internes). */
export function stepBall(b: Ball, dt: number, substeps = 8): StepEvents {
  const B = BASKET, h = dt / substeps, ev: StepEvents = { scored: false, rim: false, board: false, floor: false };
  for (let i = 0; i < substeps; i++) {
    const prevY = b.y;
    b.vy += B.G * h;
    b.x += b.vx * h; b.y += b.vy * h;
    if (crossedHoop(prevY, b.y, b.x)) ev.scored = true;
    if (bounceOnPoint(b, B.rimFront.x, B.rimFront.y, B.RIM_R, 0.55)) ev.rim = true;
    if (bounceOnPoint(b, B.rimBack.x, B.rimBack.y, B.RIM_R, 0.55)) ev.rim = true;
    // Panneau : segment vertical (face avant) et ses deux extrémités
    if (b.y > B.board.y0 && b.y < B.board.y1 && b.x + B.BALL_R > B.board.x && b.x < B.board.x + 6) {
      b.x = B.board.x - B.BALL_R; if (b.vx > 0) b.vx = -b.vx * 0.6; ev.board = true;
    } else {
      if (bounceOnPoint(b, B.board.x, B.board.y0, 1, 0.5)) ev.board = true;
      if (bounceOnPoint(b, B.board.x, B.board.y1, 1, 0.5)) ev.board = true;
    }
    if (b.y + B.BALL_R > B.FLOOR) { b.y = B.FLOOR - B.BALL_R; if (b.vy > 0) { b.vy = -b.vy * 0.5; b.vx *= 0.8; ev.floor = true; } }
    if (b.x + B.BALL_R > B.W) { b.x = B.W - B.BALL_R; b.vx = -Math.abs(b.vx) * 0.5; }
  }
  return ev;
}

/** Le tir est terminé (balle au sol et lente, ou sortie). */
export function shotOver(b: Ball): boolean {
  return b.x < -30 || (b.y >= BASKET.FLOOR - BASKET.BALL_R - 1 && Math.abs(b.vy) < 60 && Math.abs(b.vx) < 40);
}

/** Simule un tir complet (utilisé par les tests et l'aide). */
export function simulateShot(x: number, y: number, vx: number, vy: number, maxT = 5): { scored: boolean; rim: boolean } {
  const b = { x, y, vx, vy };
  let scored = false, rim = false;
  for (let t = 0; t < maxT; t += 1 / 60) {
    const e = stepBall(b, 1 / 60);
    scored ||= e.scored; rim ||= e.rim;
    if (shotOver(b)) break;
  }
  return { scored, rim };
}

/** Vitesse maximale d'un lancer (geste plafonné). */
export const MAX_SHOT_SPEED = 900;
export function shotVelocity(dx: number, dy: number, scale: number): { vx: number; vy: number } {
  let vx = dx * scale, vy = dy * scale;
  const s = Math.hypot(vx, vy);
  if (s > MAX_SHOT_SPEED) { vx *= MAX_SHOT_SPEED / s; vy *= MAX_SHOT_SPEED / s; }
  return { vx, vy };
}
