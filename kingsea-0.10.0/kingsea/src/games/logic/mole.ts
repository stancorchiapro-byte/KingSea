// Tape-crabe (tape-taupe maritime) : 9 trous, 30 secondes, rythme qui accélère.
// Crabe : +1 · crabe doré : +3 · méduse : −2 si on la touche (il faut l'éviter).

export type CritterKind = 'crab' | 'gold' | 'jelly';
export interface Critter { kind: CritterKind; age: number; life: number; hit: boolean }

export const MOLE_DURATION = 30;
export const MOLE_HOLES = 9;
export const MOLE_POINTS: Record<CritterKind, number> = { crab: 1, gold: 3, jelly: -2 };

export class MoleField {
  holes: Array<Critter | null> = new Array(MOLE_HOLES).fill(null);
  time = 0;
  score = 0;
  hits = 0;
  misses = 0;
  private cooldown = 0.6;

  constructor(private rng: () => number) {}

  get over(): boolean { return this.time >= MOLE_DURATION; }
  get difficulty(): number { return Math.min(1, this.time / MOLE_DURATION); }

  update(dt: number): void {
    if (this.over) return;
    this.time += dt;
    for (let i = 0; i < MOLE_HOLES; i++) {
      const c = this.holes[i];
      if (!c) continue;
      c.age += dt;
      if (c.hit ? c.age > 0.25 : c.age >= c.life) {
        if (!c.hit && c.kind !== 'jelly') this.misses++;
        this.holes[i] = null;
      }
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0 && !this.over) {
      this.spawn();
      const k = this.difficulty;
      this.cooldown = 0.85 - 0.5 * k + this.rng() * 0.15;
      if (k > 0.5 && this.rng() < 0.35) this.spawn(); // vers la fin, parfois deux à la fois
    }
  }

  private spawn(): void {
    const free = this.holes.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    const i = free[Math.floor(this.rng() * free.length)];
    const r = this.rng(), kind: CritterKind = r < 0.08 ? 'gold' : r < 0.22 ? 'jelly' : 'crab';
    const k = this.difficulty;
    this.holes[i] = { kind, age: 0, life: (1.15 - 0.55 * k) * (kind === 'gold' ? 0.7 : 1), hit: false };
  }

  /** Coup sur le trou i ; renvoie les points gagnés (ou perdus). */
  hit(i: number): number {
    const c = this.holes[i];
    if (this.over || !c || c.hit) return 0;
    c.hit = true; c.age = 0;
    const pts = MOLE_POINTS[c.kind];
    this.score = Math.max(0, this.score + pts);
    if (pts > 0) this.hits++;
    return pts;
  }
}
