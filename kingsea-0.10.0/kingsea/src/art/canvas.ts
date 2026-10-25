// Création de canevas hors écran et cache de textures générées.

export type AnyCanvas = HTMLCanvasElement;

export function makeCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de créer un canevas hors écran');
  return { canvas, ctx };
}

/** Résolution des textures générées (pixels par unité monde). 2 = net sur écrans Retina avec zoom. */
export const ART_SCALE = 2;

class TextureCacheImpl {
  private map = new Map<string, AnyCanvas>();
  get(key: string): AnyCanvas | undefined { return this.map.get(key); }
  set(key: string, c: AnyCanvas): void { this.map.set(key, c); }
  getOrCreate(key: string, make: () => AnyCanvas): AnyCanvas {
    let c = this.map.get(key);
    if (!c) { c = make(); this.map.set(key, c); }
    return c;
  }
  /** Nombre de textures et mémoire estimée (4 octets par pixel), pour le diagnostic. */
  stats(prefix = ''): { count: number; bytes: number } {
    let count = 0, bytes = 0;
    for (const [k, c] of this.map) if (k.startsWith(prefix)) { count++; bytes += c.width * c.height * 4; }
    return { count, bytes };
  }
  clear(prefix?: string): void {
    if (!prefix) { this.map.clear(); return; }
    for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.map.delete(k);
  }
}

export const Textures = new TextureCacheImpl();

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
