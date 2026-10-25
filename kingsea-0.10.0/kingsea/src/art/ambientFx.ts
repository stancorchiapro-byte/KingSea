// Effets d'ambiance par étage, discrets et plafonnés (aucun avec « Effets réduits ») :
// hall : rais de lumière des baies vitrées et poussières dorées ; casino : scintillements ;
// arcade : pixels néon qui flottent ; machines : vapeur et étincelles ; rooftop : confettis sur le temps fort,
// faisceaux du DJ, reflets du soleil sur la piscine et ombres de mouettes ; logements : poussières.
import type { PropDef } from '../world/types';
import { TILE } from '../world/types';

interface Mote { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'dust' | 'spark' | 'twinkle' | 'pixel' | 'steam' | 'confetti' | 'glint'; rot: number }

export interface FxContext {
  floorId: string;
  props: PropDef[];
  windows: Array<{ x: number; y: number; w: number; h: number }>;
  view: { x: number; y: number; w: number; h: number };   // rectangle visible (monde)
  beat: number;           // pulsation 0..1 (120 BPM)
  t: number;
  poolTiles: Array<{ x: number; y: number }>;
  danceRect: { x: number; y: number; w: number; h: number } | null;
}

const MAX = 70;
const NEON = ['#ff3fa4', '#6ff3ff', '#7b4dff', '#ffd166', '#59e3a7'];

export class AmbientFx {
  private motes: Mote[] = [];
  private acc = 0;
  private lastBeatBar = -1;

  reset(): void { this.motes = []; this.lastBeatBar = -1; }

  private add(m: Omit<Mote, 'rot'> & { rot?: number }): void { if (this.motes.length < MAX) this.motes.push({ rot: 0, ...m }); }

  update(dt: number, c: FxContext): void {
    for (const m of this.motes) {
      m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt; m.rot += dt * 4;
      if (m.kind === 'confetti') { m.vy = Math.min(40, m.vy + 30 * dt); m.vx *= 0.99; }
      if (m.kind === 'steam') m.size += dt * 6;
      if (m.kind === 'spark') m.vy += 140 * dt;
    }
    this.motes = this.motes.filter((m) => m.life > 0);
    this.acc += dt;
    const V = c.view, rx = () => V.x + Math.random() * V.w, ry = () => V.y + Math.random() * V.h;
    const props = (kinds: string[]) => c.props.filter((p) => kinds.includes(p.kind) && p.tx * TILE > V.x - TILE && p.tx * TILE < V.x + V.w + TILE && p.ty * TILE > V.y - TILE * 2 && p.ty * TILE < V.y + V.h);
    while (this.acc > 0.1) {
      this.acc -= 0.1;
      switch (c.floorId) {
        case 'hub': case 'cabins': case 'cabin-interior': {
          // Poussières dorées, surtout dans la lumière des baies
          const w = c.windows[Math.floor(Math.random() * Math.max(1, c.windows.length))];
          const x = w ? w.x + Math.random() * w.w : rx(), y = w ? w.y + w.h + Math.random() * TILE * 3 : ry();
          if (Math.random() < 0.5) this.add({ x, y, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 3, life: 4, max: 4, size: 0.9 + Math.random(), color: 'rgba(255,236,190,0.8)', kind: 'dust' });
          break;
        }
        case 'casino': {
          const list = props(['slotMachine', 'rouletteTable', 'cardTable', 'crapsTable', 'treasureChest', 'pokerMachine']);
          if (list.length && Math.random() < 0.6) {
            const p = list[Math.floor(Math.random() * list.length)];
            this.add({ x: (p.tx + Math.random() * p.w) * TILE, y: (p.ty - 0.6 + Math.random() * p.h) * TILE, vx: 0, vy: -4, life: 0.9, max: 0.9, size: 2 + Math.random() * 2, color: Math.random() < 0.7 ? '#ffe29a' : '#ffffff', kind: 'twinkle' });
          }
          break;
        }
        case 'arcade':
          if (Math.random() < 0.7) this.add({ x: rx(), y: V.y + V.h + 4, vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 12, life: 6, max: 6, size: 1.6 + Math.random() * 1.4, color: NEON[Math.floor(Math.random() * NEON.length)], kind: 'pixel' });
          break;
        case 'engine': {
          const list = props(['pipesWall', 'engine', 'generator', 'valve']);
          if (list.length && Math.random() < 0.5) {
            const p = list[Math.floor(Math.random() * list.length)];
            this.add({ x: (p.tx + Math.random() * p.w) * TILE, y: (p.ty + 0.3) * TILE, vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 8, life: 2.2, max: 2.2, size: 3, color: 'rgba(220,228,236,0.35)', kind: 'steam' });
          }
          if (Math.random() < 0.05) {
            const eng = props(['engine', 'generator'])[0];
            if (eng) for (let i = 0; i < 6; i++) this.add({ x: (eng.tx + Math.random() * eng.w) * TILE, y: eng.ty * TILE, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 50, life: 0.6, max: 0.6, size: 1.4, color: '#ffd166', kind: 'spark' });
          }
          break;
        }
        case 'rooftop':
          if (c.poolTiles.length && Math.random() < 0.6) {
            const tl = c.poolTiles[Math.floor(Math.random() * c.poolTiles.length)];
            this.add({ x: (tl.x + Math.random()) * TILE, y: (tl.y + Math.random()) * TILE, vx: 0, vy: 0, life: 0.7, max: 0.7, size: 2 + Math.random() * 2, color: '#ffffff', kind: 'glint' });
          }
          break;
      }
    }
    // Rooftop : salve de confettis sur la piste toutes les 4 mesures (au premier temps)
    if (c.floorId === 'rooftop' && c.danceRect) {
      const bar = Math.floor(c.t / 8);
      if (bar !== this.lastBeatBar && c.beat > 0.9) {
        this.lastBeatBar = bar;
        const D = c.danceRect;
        for (let i = 0; i < 26; i++) this.add({ x: D.x + Math.random() * D.w, y: D.y - TILE * 0.5 - Math.random() * TILE, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 2.8, max: 2.8, size: 2.2, color: NEON[i % NEON.length], kind: 'confetti', rot: Math.random() * 6 });
      }
    }
  }

  /** Effets au sol / derrière les personnages (rais de lumière). */
  renderUnder(ctx: CanvasRenderingContext2D, c: FxContext): void {
    if (c.floorId === 'hub' || c.floorId === 'cabins') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.85 + Math.sin(c.t * 0.6) * 0.15;
      for (const w of c.windows) {
        if (w.x + w.w < c.view.x || w.x > c.view.x + c.view.w) continue;
        const y0 = w.y + w.h - 2, len = TILE * 3.2;
        const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
        g.addColorStop(0, `rgba(255,240,200,${0.16 * pulse})`); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(w.x + 3, y0); ctx.lineTo(w.x + w.w - 3, y0); ctx.lineTo(w.x + w.w + TILE * 0.9, y0 + len); ctx.lineTo(w.x + TILE * 0.5, y0 + len); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (c.floorId === 'rooftop') {
      // Ombres de mouettes qui traversent le pont
      for (let i = 0; i < 2; i++) {
        const span = c.view.w + 200, x = c.view.x - 100 + ((c.t * (40 + i * 15) + i * 400) % span), y = c.view.y + c.view.h * (0.3 + i * 0.35) + Math.sin(c.t * 0.5 + i) * 20;
        const fl = Math.sin(c.t * 5 + i) * 2;
        ctx.fillStyle = 'rgba(0,20,40,0.13)';
        ctx.beginPath(); ctx.moveTo(x - 10, y - fl); ctx.quadraticCurveTo(x - 4, y - 5, x, y); ctx.quadraticCurveTo(x + 4, y - 5, x + 10, y - fl); ctx.quadraticCurveTo(x, y + 2, x - 10, y - fl); ctx.fill();
      }
    }
  }

  /** Effets au-dessus des personnages. */
  renderOver(ctx: CanvasRenderingContext2D, c: FxContext): void {
    // Faisceaux du DJ qui balaient la piste
    if (c.floorId === 'rooftop' && c.danceRect) {
      const D = c.danceRect, ox = D.x + D.w / 2, oy = D.y - TILE * 1.2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const cols = ['255,63,164', '111,243,255', '123,77,255'];
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + Math.sin(c.t * (0.7 + i * 0.25) + i * 2) * 0.7, len = D.h * 1.4, spread = 0.13;
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
        g.addColorStop(0, `rgba(${cols[i]},${0.2 + c.beat * 0.15})`); g.addColorStop(1, `rgba(${cols[i]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a - spread) * len, oy + Math.sin(a - spread) * len); ctx.lineTo(ox + Math.cos(a + spread) * len, oy + Math.sin(a + spread) * len); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    for (const m of this.motes) {
      const a = Math.min(1, m.life / m.max * 1.5, (m.max - m.life) * 4);
      ctx.globalAlpha = a;
      switch (m.kind) {
        case 'dust': case 'pixel': ctx.fillStyle = m.color; ctx.fillRect(m.x, m.y, m.size, m.size); break;
        case 'spark': ctx.fillStyle = m.color; ctx.fillRect(m.x, m.y, m.size, m.size); break;
        case 'steam': ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2); ctx.fill(); break;
        case 'confetti': ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.rot); ctx.fillStyle = m.color; ctx.fillRect(-m.size / 2, -m.size / 4, m.size, m.size / 2); ctx.restore(); break;
        case 'twinkle': case 'glint': {
          const s = m.size * Math.sin(Math.PI * (1 - m.life / m.max));
          ctx.fillStyle = m.color;
          ctx.beginPath(); ctx.moveTo(m.x, m.y - s); ctx.lineTo(m.x + s * 0.25, m.y); ctx.lineTo(m.x, m.y + s); ctx.lineTo(m.x - s * 0.25, m.y); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(m.x - s, m.y); ctx.lineTo(m.x, m.y + s * 0.25); ctx.lineTo(m.x + s, m.y); ctx.lineTo(m.x, m.y - s * 0.25); ctx.closePath(); ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  get count(): number { return this.motes.length; }
}

/** Teinte du ciel du pont supérieur selon l'heure locale (journée, coucher du soleil, nuit). */
export function skyTint(hour: number): { color: string; alpha: number; night: boolean } {
  if (hour >= 7 && hour < 18) return { color: '255,255,255', alpha: 0, night: false };
  if (hour >= 18 && hour < 20) return { color: '255,140,60', alpha: 0.14, night: false };
  if (hour >= 6 && hour < 7) return { color: '255,180,140', alpha: 0.1, night: false };
  return { color: '10,20,60', alpha: 0.38, night: true };
}
