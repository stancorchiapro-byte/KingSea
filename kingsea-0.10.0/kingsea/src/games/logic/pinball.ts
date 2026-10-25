// Flipper maritime : table inclinée, deux batteurs, trois champignons (bumpers), deux lance-balles (slingshots),
// trois couloirs à allumer en haut, lanceur à ressort. Collision balle/segments avec vitesse de surface
// (les batteurs « frappent » réellement la balle). Pur et déterministe : testé sous Node.

export const PB = { W: 300, H: 540, G: 560, R: 8, MAX_V: 1500, DRAIN_Y: 552 };

export interface Seg { ax: number; ay: number; bx: number; by: number; kick?: number; score?: number; thick?: number }
export interface Bumper { x: number; y: number; r: number; flash: number }
export interface Flipper { px: number; py: number; len: number; rest: number; up: number; angle: number; omega: number; pressed: boolean; side: 'left' | 'right' }

const seg = (ax: number, ay: number, bx: number, by: number, extra: Partial<Seg> = {}): Seg => ({ ax, ay, bx, by, ...extra });

export const WALLS: Seg[] = [
  // Contour : mur gauche, voûte, mur droit du couloir de lancement
  seg(10, 400, 10, 60), seg(10, 60, 40, 20), seg(40, 20, 110, 4), seg(110, 4, 190, 4), seg(190, 4, 260, 16), seg(260, 16, 300, 60),
  seg(300, 60, 300, 540),
  // Paroi intérieure du couloir de lancement
  seg(270, 140, 270, 540),
  // Fond du couloir (ressort du lanceur)
  seg(270, 510, 300, 510),
  // Pentes vers les batteurs (couloirs de retour)
  seg(10, 400, 92, 452, { thick: 5 }), seg(270, 400, 208, 452, { thick: 5 }),
  // Guides des couloirs du haut
  seg(90, 50, 90, 80), seg(130, 50, 130, 80), seg(170, 50, 170, 80), seg(210, 50, 210, 80),
  // Lance-balles (triangles) : seule la grande face frappe
  seg(45, 330, 45, 392), seg(45, 392, 82, 414), seg(225, 330, 225, 392), seg(225, 392, 188, 414),
  seg(45, 330, 82, 414, { kick: 260, score: 10 }), seg(225, 330, 188, 414, { kick: 260, score: 10 }),
];

/** Couloirs du haut (capteurs) : x de chaque couloir. */
export const LANES = [110, 150, 190];
export const LANE_Y = 66;

export function makeBumpers(): Bumper[] {
  return [{ x: 110, y: 160, r: 17, flash: 0 }, { x: 190, y: 160, r: 17, flash: 0 }, { x: 150, y: 225, r: 17, flash: 0 }];
}

export function makeFlippers(): Flipper[] {
  return [
    { px: 92, py: 452, len: 48, rest: 0.52, up: -0.5, angle: 0.52, omega: 0, pressed: false, side: 'left' },
    { px: 208, py: 452, len: 48, rest: Math.PI - 0.52, up: Math.PI + 0.5, angle: Math.PI - 0.52, omega: 0, pressed: false, side: 'right' },
  ];
}

export interface PinBall { x: number; y: number; vx: number; vy: number }
export interface PinState {
  ball: PinBall; flippers: Flipper[]; bumpers: Bumper[]; lanes: boolean[];
  score: number; multiplier: number; inPlay: boolean; drained: boolean;
}

export function newPinState(): PinState {
  return { ball: { x: 285, y: 500, vx: 0, vy: 0 }, flippers: makeFlippers(), bumpers: makeBumpers(), lanes: [false, false, false], score: 0, multiplier: 1, inPlay: false, drained: false };
}

export function resetBall(s: PinState): void { s.ball = { x: 285, y: 500, vx: 0, vy: 0 }; s.inPlay = false; s.drained = false; }

/** Lanceur : power ∈ [0, 1]. */
export function launch(s: PinState, power: number): void {
  const p = Math.max(0.15, Math.min(1, power));
  s.ball.vy = -(720 + p * 580); s.ball.vx = 0; s.inPlay = true;
}

export function flipperTip(f: Flipper): { x: number; y: number } { return { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len }; }

const FLIP_UP_SPEED = 24, FLIP_DOWN_SPEED = 14;

function moveFlipper(f: Flipper, h: number): void {
  const target = f.pressed ? f.up : f.rest;
  const dir = Math.sign(target - f.angle);
  const sp = f.pressed ? FLIP_UP_SPEED : FLIP_DOWN_SPEED;
  const step = dir * sp * h;
  if (Math.abs(target - f.angle) <= Math.abs(step)) { f.omega = 0; f.angle = target; }
  else { f.angle += step; f.omega = dir * sp; }
}

/** Collision balle / segment épais, avec vitesse de surface (vsx, vsy) au point de contact. */
function collideSeg(b: PinBall, ax: number, ay: number, bx: number, by: number, thick: number, e: number,
  surf: ((cx: number, cy: number) => { x: number; y: number }) | null, kick = 0): boolean {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((b.x - ax) * dx + (b.y - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cy = ay + dy * t;
  const ox = b.x - cx, oy = b.y - cy, d = Math.hypot(ox, oy), min = PB.R + thick;
  if (d >= min || d === 0) return false;
  const nx = ox / d, ny = oy / d;
  b.x = cx + nx * min; b.y = cy + ny * min;
  const vs = surf ? surf(cx, cy) : { x: 0, y: 0 };
  const rvx = b.vx - vs.x, rvy = b.vy - vs.y, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    if (kick) { b.vx += nx * kick; b.vy += ny * kick; }
  }
  return true;
}

export interface PinEvents { bumper: number; sling: number; lane: number; flipper: boolean; wall: boolean }

export function stepPinball(s: PinState, dt: number, substeps = 10): PinEvents {
  const ev: PinEvents = { bumper: 0, sling: 0, lane: 0, flipper: false, wall: false };
  const h = dt / substeps, b = s.ball;
  for (const bm of s.bumpers) bm.flash = Math.max(0, bm.flash - dt);
  for (let k = 0; k < substeps; k++) {
    for (const f of s.flippers) moveFlipper(f, h);
    if (!s.inPlay || s.drained) continue;
    b.vy += PB.G * h;
    const v = Math.hypot(b.vx, b.vy);
    if (v > PB.MAX_V) { b.vx *= PB.MAX_V / v; b.vy *= PB.MAX_V / v; }
    const prevY = b.y;
    b.x += b.vx * h; b.y += b.vy * h;
    for (const w of WALLS) {
      if (collideSeg(b, w.ax, w.ay, w.bx, w.by, w.thick ?? 1, w.kick ? 0.3 : 0.45, null, w.kick ?? 0)) {
        if (w.kick) { ev.sling++; s.score += (w.score ?? 0) * s.multiplier; } else ev.wall = true;
      }
    }
    for (const f of s.flippers) {
      const tip = flipperTip(f);
      const surf = (cx: number, cy: number) => ({ x: -f.omega * (cy - f.py), y: f.omega * (cx - f.px) });
      if (collideSeg(b, f.px, f.py, tip.x, tip.y, 5, 0.25, surf)) ev.flipper = true;
    }
    for (const bm of s.bumpers) {
      const dx = b.x - bm.x, dy = b.y - bm.y, d = Math.hypot(dx, dy), min = bm.r + PB.R;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d;
        b.x = bm.x + nx * min; b.y = bm.y + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
        b.vx += nx * 220; b.vy += ny * 220;
        bm.flash = 0.18; ev.bumper++; s.score += 100 * s.multiplier;
      }
    }
    // Couloirs du haut : on les allume en passant vers le bas
    if (prevY < LANE_Y && b.y >= LANE_Y) {
      const i = LANES.findIndex((x) => Math.abs(b.x - x) < 20);
      if (i >= 0 && !s.lanes[i]) {
        s.lanes[i] = true; ev.lane++; s.score += 50 * s.multiplier;
        if (s.lanes.every(Boolean)) { s.score += 500 * s.multiplier; s.multiplier = Math.min(5, s.multiplier + 1); s.lanes = [false, false, false]; }
      }
    }
    if (b.y > PB.DRAIN_Y) { s.drained = true; s.inPlay = false; }
  }
  // Balle retombée sur le ressort : on peut relancer
  if (s.inPlay && b.x > 272 && b.y > 480 && Math.hypot(b.vx, b.vy) < 40) { s.inPlay = false; b.vx = 0; b.vy = 0; }
  return ev;
}
