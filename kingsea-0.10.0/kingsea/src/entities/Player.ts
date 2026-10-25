// Personnage contrôlé : déplacement analogique, collisions, animation 4 directions.
import type { Dir } from '../art/characters';
import { ANIMS } from '../art/characters';

const WALK_FRAMES = ANIMS.walk.frames;
import type { TileMap } from '../world/TileMap';

export const FOOT_W = 16;
export const FOOT_H = 9;
export const WALK_SPEED = 128; // unités monde / s (~4 tuiles/s)

export class Player {
  x: number; y: number; // position des pieds (bas-centre)
  dir: Dir = 'down';
  frame = 0;
  moving = false;
  private animT = 0;
  /** Objet tenu en main (boisson) et son minuteur. */
  held: { kind: string; color: string; t: number } | null = null;
  /** Bloque les déplacements (menu ouvert, transition). */
  frozen = false;
  /** Assis (canapé, banc) ou allongé (transat). Pousser le joystick fait se relever. */
  seat: { kind: 'sit' | 'lie'; standX: number; standY: number } | null = null;
  /** Multiplicateur de vitesse (nage : plus lent). */
  speedFactor = 1;
  /** Temps passé immobile (animation d'attente). */
  idleT = 0;
  /** Geste d'interaction en cours (s restantes). */
  actT = 0;
  /** Dernière surface foulée (bruits de pas). */
  stepCount = 0;

  constructor(x: number, y: number) { this.x = x; this.y = y; }

  get footBox() { return { x: this.x - FOOT_W / 2, y: this.y - FOOT_H, w: FOOT_W, h: FOOT_H }; }

  /** ix, iy : direction analogique (|v| ≤ 1). */
  sitAt(x: number, y: number, kind: 'sit' | 'lie'): void {
    this.seat = { kind, standX: this.x, standY: this.y };
    this.x = x; this.y = y; this.dir = 'down'; this.moving = false; this.frame = 0;
  }

  update(dt: number, ix: number, iy: number, map: TileMap): void {
    const mag = Math.min(1, Math.hypot(ix, iy));
    if (this.seat) {
      if (this.frozen || mag < 0.35) { this.moving = false; this.frame = 0; this.idleT += dt; if (this.held) { this.held.t -= dt; if (this.held.t <= 0) this.held = null; } return; }
      // Se relever : retour à l'endroit d'où l'on s'est assis (toujours libre), sinon point libre le plus proche.
      const back = { x: this.seat.standX, y: this.seat.standY };
      this.seat = null;
      const free = map.collides({ x: back.x - FOOT_W / 2, y: back.y - FOOT_H, w: FOOT_W, h: FOOT_H })
        ? map.findFreeSpot(this.x, this.y + 20, FOOT_W, FOOT_H) ?? back : back;
      this.x = free.x; this.y = free.y;
    }
    this.moving = !this.frozen && mag > 0.05;
    if (this.moving) {
      // Choix de la direction affichée : axe dominant, avec hystérésis pour éviter le scintillement en diagonale.
      const ax = Math.abs(ix), ay = Math.abs(iy);
      const horizontal = this.dir === 'left' || this.dir === 'right' ? ax > ay * 0.8 : ax > ay * 1.25;
      this.dir = horizontal ? (ix < 0 ? 'left' : 'right') : iy < 0 ? 'up' : 'down';
      const speed = WALK_SPEED * (0.35 + 0.65 * mag) * this.speedFactor;
      const n = Math.hypot(ix, iy) || 1;
      const dx = (ix / n) * speed * dt, dy = (iy / n) * speed * dt;
      const box = this.footBox;
      const r = map.moveBox(box, dx, dy);
      this.x = r.x + FOOT_W / 2;
      this.y = r.y + FOOT_H;
      const before = Math.floor(this.animT);
      this.animT += dt * (8 + 7 * mag) * this.speedFactor;
      this.frame = Math.floor(this.animT) % WALK_FRAMES;
      if (Math.floor(this.animT) !== before && this.frame % 3 === 1) this.stepCount++;
      this.idleT = 0; this.actT = 0;
    } else {
      this.animT = 0;
      this.frame = 0;
      this.idleT += dt;
    }
    this.actT = Math.max(0, this.actT - dt);
    if (this.held) { this.held.t -= dt; if (this.held.t <= 0) this.held = null; }
  }
}
