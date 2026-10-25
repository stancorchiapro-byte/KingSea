// Physique 2D simple de disques (billard, bowling) : frottement, chocs élastiques, bandes, poches.
// Pas de temps fixe et sous-pas pour la stabilité, quelle que soit la cadence d'affichage.

export interface Disc { id: number; x: number; y: number; vx: number; vy: number; r: number; m: number; active: boolean; tag?: string }
export interface Bounds { x: number; y: number; w: number; h: number }

export interface WorldOpts {
  /** Décélération linéaire (unités/s²) due au frottement. */
  friction: number;
  /** Coefficient de restitution entre disques et sur les bandes. */
  restitution: number;
  wallRestitution: number;
  bounds: Bounds | null;
  pockets: Array<{ x: number; y: number; r: number }>;
  /** Choc entre deux disques (vitesse relative d'approche), pour les sons et les règles (première bille touchée). */
  onHit?: (a: Disc, b: Disc, rel: number) => void;
  /** Rebond sur une bande (vitesse normale). */
  onWall?: (d: Disc, v: number) => void;
}

export function speed(d: Disc): number { return Math.hypot(d.vx, d.vy); }

export function allStopped(discs: Disc[], eps = 2): boolean { return discs.every((d) => !d.active || speed(d) < eps); }

/** Avance la simulation ; renvoie les disques empochés pendant ce pas. */
export function stepWorld(discs: Disc[], dt: number, o: WorldOpts, substeps = 6): Disc[] {
  const pocketed: Disc[] = [];
  const h = dt / substeps;
  for (let s = 0; s < substeps; s++) {
    for (const d of discs) {
      if (!d.active) continue;
      const v = speed(d);
      if (v > 0) {
        const nv = Math.max(0, v - o.friction * h);
        d.vx *= nv / v; d.vy *= nv / v;
        if (nv < 0.5) { d.vx = 0; d.vy = 0; }
      }
      d.x += d.vx * h; d.y += d.vy * h;
    }
    // Chocs entre disques
    for (let i = 0; i < discs.length; i++) {
      const a = discs[i]; if (!a.active) continue;
      for (let j = i + 1; j < discs.length; j++) {
        const b = discs[j]; if (!b.active) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = a.r + b.r;
        if (dist === 0 || dist >= min) continue;
        const nx = dx / dist, ny = dy / dist;
        // Séparation proportionnelle aux masses
        const overlap = min - dist, tm = a.m + b.m;
        a.x -= nx * overlap * (b.m / tm); a.y -= ny * overlap * (b.m / tm);
        b.x += nx * overlap * (a.m / tm); b.y += ny * overlap * (a.m / tm);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const imp = ((1 + o.restitution) * rel) / (1 / a.m + 1 / b.m);
        a.vx -= (imp / a.m) * nx; a.vy -= (imp / a.m) * ny;
        b.vx += (imp / b.m) * nx; b.vy += (imp / b.m) * ny;
        o.onHit?.(a, b, rel);
      }
    }
    // Poches puis bandes
    for (const d of discs) {
      if (!d.active) continue;
      for (const p of o.pockets) if (Math.hypot(d.x - p.x, d.y - p.y) < p.r) { d.active = false; d.vx = 0; d.vy = 0; pocketed.push(d); break; }
      if (!d.active || !o.bounds) continue;
      const B = o.bounds;
      if (d.x - d.r < B.x) { d.x = B.x + d.r; o.onWall?.(d, Math.abs(d.vx)); d.vx = Math.abs(d.vx) * o.wallRestitution; }
      if (d.x + d.r > B.x + B.w) { d.x = B.x + B.w - d.r; o.onWall?.(d, Math.abs(d.vx)); d.vx = -Math.abs(d.vx) * o.wallRestitution; }
      if (d.y - d.r < B.y) { d.y = B.y + d.r; o.onWall?.(d, Math.abs(d.vy)); d.vy = Math.abs(d.vy) * o.wallRestitution; }
      if (d.y + d.r > B.y + B.h) { d.y = B.y + B.h - d.r; o.onWall?.(d, Math.abs(d.vy)); d.vy = -Math.abs(d.vy) * o.wallRestitution; }
    }
  }
  return pocketed;
}
