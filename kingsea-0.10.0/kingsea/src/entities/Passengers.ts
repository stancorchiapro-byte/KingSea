// Passagers d'ambiance (personnages non joueurs) : ils se promènent, s'arrêtent, discutent, dansent
// et répondent aux saluts. Ce ne sont PAS d'autres joueurs (le multijoueur arrive en phase 6).
// Logique pure (aucun rendu) : testée sous Node avec une vraie carte d'étage.
import type { Dir, Look } from '../art/characters';
import { randomLook } from '../art/characters';
import type { TileMap } from '../world/TileMap';
import { TILE, isWaterChar } from '../world/types';

export const P_FOOT_W = 14, P_FOOT_H = 8;
const SPEED = 52;

export interface Passenger {
  look: Look;
  x: number; y: number; dir: Dir;
  state: 'walk' | 'idle' | 'dance' | 'wave';
  target: { x: number; y: number } | null;
  t: number;          // temps restant dans l'état courant
  animT: number;      // compteur d'animation
  stuck: number;      // temps passé bloqué
  dancer: boolean;    // reste sur la piste de danse
  waved: number;      // délai avant de pouvoir resaluer
}

export interface CrowdOptions { count: number; danceTiles?: Array<{ x: number; y: number }>; dancers?: number }

/** Tuiles praticables (sol libre, hors eau) où un passager peut se rendre. */
export function walkableSpots(map: TileMap): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let ty = 1; ty < map.h - 1; ty++) for (let tx = 1; tx < map.w - 1; tx++) {
    const c = map.charAt(tx, ty);
    if (isWaterChar(c) || map.isSolidTile(tx, ty)) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.8) * TILE;
    if (!map.collides({ x: x - P_FOOT_W / 2 - 3, y: y - P_FOOT_H - 3, w: P_FOOT_W + 6, h: P_FOOT_H + 6 })) out.push({ x, y });
  }
  return out;
}

/** Ligne droite praticable entre deux points (échantillonnage tous les 6 unités). */
export function clearPath(map: TileMap, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 6));
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
    if (map.collides({ x: x - P_FOOT_W / 2, y: y - P_FOOT_H, w: P_FOOT_W, h: P_FOOT_H })) return false;
    if (isWaterChar(map.charAt(Math.floor(x / TILE), Math.floor((y - 3) / TILE)))) return false;
  }
  return true;
}

export class Crowd {
  list: Passenger[] = [];
  private spots: Array<{ x: number; y: number }>;

  constructor(private map: TileMap, opts: CrowdOptions, private rand: () => number = Math.random, avoid?: { x: number; y: number }) {
    this.spots = walkableSpots(map);
    const dance = opts.danceTiles ?? [];
    for (let i = 0; i < opts.count && this.spots.length; i++) {
      const dancer = i < (opts.dancers ?? 0) && dance.length > 0;
      let p = dancer ? dance[Math.floor(rand() * dance.length)] : this.spots[Math.floor(rand() * this.spots.length)];
      // On évite d'apparaître sur le joueur
      for (let k = 0; k < 8 && avoid && Math.hypot(p.x - avoid.x, p.y - avoid.y) < TILE * 2.5; k++) p = this.spots[Math.floor(rand() * this.spots.length)];
      this.list.push({
        look: randomLook(rand), x: p.x, y: p.y, dir: 'down', state: dancer ? 'dance' : 'idle', target: null,
        t: dancer ? 999 : 0.5 + rand() * 2, animT: rand() * 10, stuck: 0, dancer, waved: 0,
      });
    }
  }

  private pickTarget(p: Passenger): { x: number; y: number } | null {
    for (let k = 0; k < 12; k++) {
      const s = this.spots[Math.floor(this.rand() * this.spots.length)];
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < TILE * 1.5 || d > TILE * 9) continue;
      if (clearPath(this.map, p.x, p.y, s.x, s.y)) return s;
    }
    return null;
  }

  /** Le joueur salue : les passagers proches lui répondent. Renvoie le nombre de réponses. */
  greet(px: number, py: number): number {
    let n = 0;
    for (const p of this.list) {
      if (p.waved > 0 || Math.hypot(p.x - px, p.y - py) > TILE * 4.5) continue;
      p.state = 'wave'; p.t = 1.6; p.target = null; p.waved = 6; n++;
      p.dir = 'down';
    }
    return n;
  }

  update(dt: number, player: { x: number; y: number }): void {
    for (const p of this.list) {
      p.animT += dt;
      p.waved = Math.max(0, p.waved - dt);
      p.t -= dt;
      if (p.state === 'dance') continue;
      if (p.state === 'wave') { if (p.t <= 0) { p.state = p.dancer ? 'dance' : 'idle'; p.t = 1 + this.rand() * 2; } continue; }
      const near = Math.hypot(p.x - player.x, p.y - player.y) < TILE * 1.1;
      if (p.state === 'idle') {
        if (near) { const dx = player.x - p.x, dy = player.y - p.y; p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'; continue; }
        if (p.t <= 0) {
          p.target = this.pickTarget(p);
          if (p.target) { p.state = 'walk'; p.t = 12; p.stuck = 0; } else p.t = 1 + this.rand() * 2;
        }
        continue;
      }
      // Marche
      const tg = p.target!;
      const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
      if (d < 3 || p.t <= 0 || p.stuck > 0.8) { p.state = 'idle'; p.target = null; p.t = 1.5 + this.rand() * 4; continue; }
      if (near) { p.stuck += dt; continue; } // laisse passer le joueur
      const step = Math.min(d, SPEED * dt);
      const box = { x: p.x - P_FOOT_W / 2, y: p.y - P_FOOT_H, w: P_FOOT_W, h: P_FOOT_H };
      const r = this.map.moveBox(box, (dx / d) * step, (dy / d) * step);
      const nx = r.x + P_FOOT_W / 2, ny = r.y + P_FOOT_H;
      if (Math.hypot(nx - p.x, ny - p.y) < step * 0.3) p.stuck += dt; else p.stuck = 0;
      p.x = nx; p.y = ny;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    }
  }
}
