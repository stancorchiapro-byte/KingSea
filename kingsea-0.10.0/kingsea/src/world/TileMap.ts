// Grille de collision + obstacles des accessoires. Logique pure, testable.
import type { Rect } from '../engine/math';
import { rectsOverlap } from '../engine/math';
import { isSolidChar, TILE, type FloorDef, type PropDef } from './types';

export class TileMap {
  readonly w: number;
  readonly h: number;
  readonly rows: string[];
  /** Rectangles solides des accessoires, en unités monde. */
  solids: Rect[] = [];

  constructor(rows: string[], props: PropDef[] = [], flags: Record<string, boolean> = {}) {
    this.rows = rows;
    this.h = rows.length;
    this.w = rows[0]?.length ?? 0;
    this.rebuildSolids(props, flags);
  }

  static fromFloor(f: FloorDef, flags: Record<string, boolean> = {}): TileMap {
    if (!f.map) throw new Error(`L'étage ${f.id} n'a pas de carte`);
    return new TileMap(f.map, f.props ?? [], flags);
  }

  rebuildSolids(props: PropDef[], flags: Record<string, boolean>): void {
    this.solids = props.filter((p) => p.solid && propActive(p, flags)).map(propSolidRect);
  }

  charAt(tx: number, ty: number): string | undefined { return this.rows[ty]?.[tx]; }
  isSolidTile(tx: number, ty: number): boolean { return isSolidChar(this.charAt(tx, ty)); }

  get pixelWidth(): number { return this.w * TILE; }
  get pixelHeight(): number { return this.h * TILE; }

  /** Vrai si le rectangle (monde) chevauche un mur ou un accessoire solide. */
  collides(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE), x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE), y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolidTile(tx, ty)) return true;
    for (const s of this.solids) if (rectsOverlap(r, s)) return true;
    return false;
  }

  /**
   * Déplace une boîte (pieds du personnage) en séparant les axes, ce qui permet de glisser le long des murs.
   * Les grands déplacements sont découpés pour ne jamais traverser un obstacle fin.
   */
  moveBox(box: Rect, dx: number, dy: number): { x: number; y: number; hitX: boolean; hitY: boolean } {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE / 4)));
    let x = box.x, y = box.y, hitX = false, hitY = false;
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0 && !hitX) {
        if (!this.collides({ x: x + sx, y, w: box.w, h: box.h })) x += sx; else hitX = true;
      }
      if (sy !== 0 && !hitY) {
        if (!this.collides({ x, y: y + sy, w: box.w, h: box.h })) y += sy; else hitY = true;
      }
    }
    return { x, y, hitX, hitY };
  }

  /** Trouve la position libre la plus proche (en spirale) — évite d'apparaître dans un mur. */
  findFreeSpot(cx: number, cy: number, bw: number, bh: number, maxRadiusTiles = 8): { x: number; y: number } | null {
    const fits = (x: number, y: number) => !this.collides({ x: x - bw / 2, y: y - bh, w: bw, h: bh });
    if (fits(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= maxRadiusTiles * 2; r++) {
      const d = (r * TILE) / 2;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
        if (fits(x, y)) return { x, y };
      }
    }
    return null;
  }
}

export function propActive(p: PropDef, flags: Record<string, boolean>): boolean {
  if (p.collectible && p.id && flags[`found.${p.id}`]) return false;
  if (!p.requiresFlag) return true;
  const neg = p.requiresFlag.startsWith('!');
  const v = !!flags[neg ? p.requiresFlag.slice(1) : p.requiresFlag];
  return neg ? !v : v;
}

export function propSolidRect(p: PropDef): Rect {
  const hb = p.hitbox ?? { x: 0, y: 0, w: p.w, h: p.h };
  return { x: (p.tx + hb.x) * TILE, y: (p.ty + hb.y) * TILE, w: hb.w * TILE, h: hb.h * TILE };
}

/** Point d'interaction (monde) d'un accessoire. */
export function propInteractPoint(p: PropDef): { x: number; y: number } {
  const at = p.interact?.at;
  if (at) return { x: at.x * TILE, y: at.y * TILE };
  return { x: (p.tx + p.w / 2) * TILE, y: (p.ty + p.h) * TILE + TILE * 0.4 };
}
