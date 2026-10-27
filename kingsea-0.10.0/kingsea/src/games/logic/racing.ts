// Circuit KS (course automobile) — logique pure, sans affichage, testée sous Node.
// Piste fermée tracée par une spline de Catmull-Rom (lignes droites, virages, chicane), largeur fixe,
// dégagements puis barrières. Voitures vues de dessus : vitesse et direction, adhérence latérale (dérive),
// freinage, sortie de piste (sable), collisions avec les barrières, les bouées et les autres voitures,
// taches d'huile (perte d'adhérence) et vagues turbo (accélération). Tours comptés par points de passage :
// impossible de gagner un tour en coupant ou en reculant. Les adversaires sont pilotés localement (IA) :
// ce n'est PAS une course en ligne.

export interface Vec { x: number; y: number }

/** Points de contrôle du circuit « Baie Royale » (sens horaire, en unités monde). */
export const TRACK_CTRL: Vec[] = [
  { x: 600, y: 350 }, { x: 1500, y: 300 }, { x: 2400, y: 330 },
  { x: 2900, y: 520 }, { x: 3000, y: 950 },
  { x: 2700, y: 1250 }, { x: 2250, y: 1200 },
  { x: 1950, y: 1450 }, { x: 2150, y: 1800 },
  { x: 2700, y: 1950 }, { x: 2850, y: 2250 },
  { x: 2400, y: 2500 }, { x: 1500, y: 2450 },
  { x: 900, y: 2300 }, { x: 700, y: 1900 },
  { x: 1100, y: 1500 }, { x: 800, y: 1100 },
  { x: 350, y: 850 }, { x: 300, y: 550 },
];

export const WORLD = { w: 3350, h: 2850 };
export const HALF_W = 92;      // demi-largeur de la piste (asphalte)
export const RUNOFF = 64;      // dégagement (sable) avant la barrière
export const LAPS = 3;
export const CAR_R = 17;       // rayon de collision d'une voiture

export interface Track { pts: Vec[]; nx: number[]; ny: number[]; cum: number[]; length: number; curv: number[]; n: number }

/** Spline fermée échantillonnée : points, normales (vers l'extérieur droit), distance cumulée, courbure. */
export function buildTrack(ctrl: Vec[] = TRACK_CTRL, perSeg = 26): Track {
  const pts: Vec[] = [];
  const m = ctrl.length;
  for (let i = 0; i < m; i++) {
    const p0 = ctrl[(i - 1 + m) % m], p1 = ctrl[i], p2 = ctrl[(i + 1) % m], p3 = ctrl[(i + 2) % m];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      pts.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  const n = pts.length, nx: number[] = [], ny: number[] = [], cum: number[] = [0], curv: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    nx.push(-dy / l); ny.push(dx / l);
    if (i > 0) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const length = cum[n - 1] + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 2 + n) % n], b = pts[i], c = pts[(i + 2) % n];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
    curv.push(Math.abs(angleDiff(h2, h1)));
  }
  return { pts, nx, ny, cum, length, curv, n };
}

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Point de la ligne centrale le plus proche (recherche locale autour de `hint`, ou complète si hint < 0). */
export function nearest(t: Track, x: number, y: number, hint = -1): { i: number; lateral: number; s: number } {
  let best = 0, bd = Infinity;
  const scan = (i: number) => { const p = t.pts[i], d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } };
  if (hint < 0) for (let i = 0; i < t.n; i++) scan(i);
  else for (let k = -30; k <= 30; k++) scan((hint + k + t.n) % t.n);
  const p = t.pts[best];
  const lateral = (x - p.x) * t.nx[best] + (y - p.y) * t.ny[best];
  return { i: best, lateral, s: t.cum[best] };
}

/** Point à la distance `s` (le long de la piste) avec un décalage latéral. */
export function pointAt(t: Track, s: number, lateral = 0): Vec & { i: number; heading: number } {
  const ss = ((s % t.length) + t.length) % t.length;
  let lo = 0, hi = t.n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (t.cum[mid] <= ss) lo = mid; else hi = mid - 1; }
  const i = lo, j = (i + 1) % t.n;
  const segL = (j === 0 ? t.length : t.cum[j]) - t.cum[i] || 1, k = (ss - t.cum[i]) / segL;
  const a = t.pts[i], b = t.pts[j];
  return { x: a.x + (b.x - a.x) * k + t.nx[i] * lateral, y: a.y + (b.y - a.y) * k + t.ny[i] * lateral, i, heading: Math.atan2(b.y - a.y, b.x - a.x) };
}

// ---------------------------------------------------------------- éléments de piste
export type ObstacleKind = 'oil' | 'buoy' | 'boost';
export interface Obstacle { kind: ObstacleKind; x: number; y: number; r: number; heading: number }

/** Taches d'huile, bouées (à contourner) et vagues turbo, placées le long de la piste. */
export function makeObstacles(t: Track): Obstacle[] {
  const at = (frac: number, lat: number, kind: ObstacleKind, r: number): Obstacle => { const p = pointAt(t, t.length * frac, lat); return { kind, x: p.x, y: p.y, r, heading: p.heading }; };
  return [
    at(0.09, -30, 'boost', 34), at(0.53, 25, 'boost', 34), at(0.71, 0, 'boost', 34),
    at(0.255, 40, 'oil', 34), at(0.62, -38, 'oil', 34), at(0.86, 30, 'oil', 30),
    at(0.40, 58, 'buoy', 13), at(0.405, 58, 'buoy', 13), at(0.41, 58, 'buoy', 13),
    at(0.46, -60, 'buoy', 13), at(0.465, -60, 'buoy', 13),
    at(0.78, -58, 'buoy', 13), at(0.785, -58, 'buoy', 13),
  ];
}

// ---------------------------------------------------------------- voitures
export interface Car {
  id: number; name: string; color: string; ai: boolean; skill: number;
  x: number; y: number; vx: number; vy: number; heading: number;
  idx: number; lateral: number;
  /** Distance parcourue depuis le départ (tours compris) — sert au classement. */
  progress: number;
  lap: number; lastS: number; checkpoint: boolean;
  lapStart: number; bestLap: number | null; lapTimes: number[];
  finished: boolean; finishTime: number | null;
  /** Perte d'adhérence (huile) et turbo restants, en secondes. */
  slip: number; boost: number;
  offTrack: boolean; wrongWay: number;
  /** Décalage de trajectoire de l'IA (−1..1) et petite variation. */
  line: number;
  /** Événements de l'image (sons, effets). */
  hit: number; skid: number; boosted: boolean;
}

export interface Inputs { steer: number; throttle: number; brake: number }

export const MAX_SPEED = 600, OFF_SPEED = 230, BOOST_SPEED = 780;

export function makeCars(t: Track, playerName: string): Car[] {
  const grid: Array<[string, string, boolean, number]> = [
    [playerName, '#d4af5a', false, 1], ['Marin', '#1fc7c1', true, 0.9], ['Corail', '#ff6f91', true, 0.93], ['Abysse', '#8fb6ff', true, 0.96],
  ];
  // Grille de départ en quinconce, derrière la ligne
  return grid.map(([name, color, ai, skill], k) => {
    const p = pointAt(t, t.length - 70 - k * 70, k % 2 ? 40 : -40);
    return {
      id: k, name, color, ai, skill, x: p.x, y: p.y, vx: 0, vy: 0, heading: p.heading, idx: p.i, lateral: k % 2 ? 40 : -40,
      progress: -(70 + k * 70), lap: 0, lastS: t.length - 70 - k * 70, checkpoint: false, lapStart: 0, bestLap: null, lapTimes: [],
      finished: false, finishTime: null, slip: 0, boost: 0, offTrack: false, wrongWay: 0, line: (k - 1.5) * 0.25, hit: 0, skid: 0, boosted: false,
    };
  });
}

/** Pilote automatique : vise un point devant sur sa trajectoire, ralentit avant les virages serrés. */
export function aiInputs(c: Car, t: Track): Inputs {
  const speed = Math.hypot(c.vx, c.vy);
  const look = 120 + speed * 0.45;
  const sNow = t.cum[c.idx];
  const target = pointAt(t, sNow + look, c.line * HALF_W * 0.55);
  const want = Math.atan2(target.y - c.y, target.x - c.x);
  const steer = Math.max(-1, Math.min(1, angleDiff(want, c.heading) * 2.4));
  // Courbure maximale dans les 420 prochaines unités → vitesse visée
  let curv = 0;
  const step = Math.max(1, Math.round(t.n / 300));
  for (let k = 0; k < 40; k += step) curv = Math.max(curv, t.curv[(c.idx + Math.round((k * 420) / 40 / (t.length / t.n))) % t.n]);
  const vTarget = MAX_SPEED * c.skill * Math.max(0.42, 1 - curv * 3.2);
  return { steer, throttle: speed < vTarget ? 1 : 0, brake: speed > vTarget + 40 ? 0.7 : 0 };
}

/**
 * Avance une voiture de `dt` secondes. `time` : chrono de course (s) pour les tours.
 * Renvoie vrai si la voiture vient de terminer un tour.
 */
export function stepCar(c: Car, inp: Inputs, t: Track, obstacles: Obstacle[], dt: number, time: number): boolean {
  c.hit = 0; c.skid = 0; c.boosted = false;
  const fx = Math.cos(c.heading), fy = Math.sin(c.heading);
  let fwd = c.vx * fx + c.vy * fy;
  let lat = -c.vx * fy + c.vy * fx;
  const speed = Math.hypot(c.vx, c.vy);
  // Surface : asphalte, sable (dégagement)
  const near = nearest(t, c.x, c.y, c.idx);
  c.idx = near.i; c.lateral = near.lateral;
  c.offTrack = Math.abs(near.lateral) > HALF_W;
  const cap = c.boost > 0 ? BOOST_SPEED : c.offTrack ? OFF_SPEED : MAX_SPEED;
  // Accélération, freinage, frottements
  const accel = c.boost > 0 ? 900 : 430;
  fwd += (inp.throttle * accel - inp.brake * (fwd > 0 ? 1050 : 250)) * dt;
  fwd -= fwd * (c.offTrack ? 1.6 : 0.35) * dt;
  if (fwd > cap) fwd += (cap - fwd) * Math.min(1, dt * 3);
  if (fwd < -150) fwd = -150;
  // Direction : plus vive à basse vitesse, plus douce à pleine vitesse ; nulle à l'arrêt
  const turn = inp.steer * 2.7 * Math.min(1, Math.abs(fwd) / 160) * (1 - 0.38 * Math.min(1, Math.abs(fwd) / MAX_SPEED)) * Math.sign(fwd || 1);
  c.heading += turn * dt;
  // Adhérence latérale : dérive contrôlée (huile : la voiture glisse)
  const grip = c.slip > 0 ? 0.9 : c.offTrack ? 4 : 7.5;
  if (Math.abs(lat) > 90 && speed > 250) c.skid = Math.min(1, Math.abs(lat) / 260);
  lat *= Math.exp(-grip * dt);
  const nfx = Math.cos(c.heading), nfy = Math.sin(c.heading);
  c.vx = nfx * fwd - nfy * lat; c.vy = nfy * fwd + nfx * lat;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.slip = Math.max(0, c.slip - dt); c.boost = Math.max(0, c.boost - dt);
  // Barrières : au-delà du dégagement, la voiture rebondit et perd de la vitesse
  const n2 = nearest(t, c.x, c.y, c.idx), wall = HALF_W + RUNOFF - CAR_R;
  if (Math.abs(n2.lateral) > wall) {
    const side = Math.sign(n2.lateral), over = Math.abs(n2.lateral) - wall;
    c.x -= t.nx[n2.i] * side * over; c.y -= t.ny[n2.i] * side * over;
    const vn = c.vx * t.nx[n2.i] + c.vy * t.ny[n2.i];
    if (vn * side > 0) { c.vx -= t.nx[n2.i] * vn * 1.35; c.vy -= t.ny[n2.i] * vn * 1.35; }
    c.vx *= 0.82; c.vy *= 0.82;
    c.hit = Math.min(1, Math.abs(vn) / 300);
  }
  // Éléments de piste
  for (const o of obstacles) {
    const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy);
    if (o.kind === 'buoy') {
      if (d < o.r + CAR_R && d > 0) {
        const push = o.r + CAR_R - d; c.x += (dx / d) * push; c.y += (dy / d) * push;
        c.vx *= 0.6; c.vy *= 0.6; c.hit = Math.max(c.hit, 0.6);
      }
    } else if (d < o.r) {
      if (o.kind === 'oil' && c.slip <= 0) c.slip = 0.7;
      if (o.kind === 'boost' && c.boost <= 0.1) { c.boost = 0.9; c.boosted = true; }
    }
  }
  // Progression et tours (point de passage à mi-parcours obligatoire)
  const s = t.cum[n2.i];
  let ds = s - c.lastS;
  if (ds < -t.length / 2) ds += t.length;
  if (ds > t.length / 2) ds -= t.length;
  c.progress += ds; c.lastS = s;
  c.wrongWay = ds < -0.5 && fwd > 40 ? c.wrongWay + dt : Math.max(0, c.wrongWay - dt * 2);
  if (!c.checkpoint && c.progress - c.lap * t.length > t.length * 0.5) c.checkpoint = true;
  if (c.checkpoint && c.progress >= (c.lap + 1) * t.length) {
    c.lap++; c.checkpoint = false;
    const lt = time - c.lapStart; c.lapTimes.push(lt); c.lapStart = time;
    if (c.bestLap === null || lt < c.bestLap) c.bestLap = lt;
    if (c.lap >= LAPS && !c.finished) { c.finished = true; c.finishTime = time; }
    return true;
  }
  return false;
}

/** Collisions entre voitures (cercles) : séparation et échange de vitesse. */
export function collideCars(cars: Car[]): number {
  let hits = 0;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= CAR_R * 2 || d === 0) continue;
    const nx = dx / d, ny = dy / d, push = (CAR_R * 2 - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) { a.vx += nx * rel * 0.5; a.vy += ny * rel * 0.5; b.vx -= nx * rel * 0.5; b.vy -= ny * rel * 0.5; }
    hits++;
  }
  return hits;
}

/** Classement : arrivés dans l'ordre d'arrivée, puis selon la distance parcourue. */
export function standings(cars: Car[]): Car[] {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  });
}

/** Score envoyé à l'autorité : temps total de course en dixièmes de seconde. */
export const raceScore = (seconds: number): number => Math.round(seconds * 10);
