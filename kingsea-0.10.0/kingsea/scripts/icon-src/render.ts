// Rendu des icônes et écrans de démarrage avec le même code que le jeu (art/brand.ts), dans Chromium.
import { drawKSEmblem, LUXE } from '../../src/art/brand';

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, g: c.getContext('2d')! }; }

function background(g: CanvasRenderingContext2D, w: number, h: number, rays: boolean): void {
  const bg = g.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.5, w * 0.75);
  bg.addColorStop(0, '#2a2129'); bg.addColorStop(0.55, LUXE.onyx); bg.addColorStop(1, '#050406');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (rays) {
    g.save(); g.translate(w / 2, h / 2);
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; g.strokeStyle = i % 2 ? 'rgba(212,175,90,0.06)' : 'rgba(212,175,90,0.12)'; g.lineWidth = w * 0.004; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * w, Math.sin(a) * w); g.stroke(); }
    g.restore();
  }
}

export function render(): Record<string, string> {
  const out: Record<string, string> = {};
  // Icône complète (opaque)
  { const { c, g } = canvas(1024, 1024); background(g, 1024, 1024, true); drawKSEmblem(g, 512, 512, 700, 0, 'small'); out['icon-only'] = c.toDataURL(); }
  // Avant-plan adaptatif Android (zone sûre : 66 % centraux)
  { const { c, g } = canvas(1024, 1024); drawKSEmblem(g, 512, 512, 560, 0, 'small'); out['icon-foreground'] = c.toDataURL(); }
  { const { c, g } = canvas(1024, 1024); background(g, 1024, 1024, true); out['icon-background'] = c.toDataURL(); }
  // Écrans de démarrage (le système recadre au centre : emblème dans le tiers central)
  for (const dark of [false, true]) {
    const { c, g } = canvas(2732, 2732); background(g, 2732, 2732, false);
    if (dark) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 2732, 2732); }
    drawKSEmblem(g, 1366, 1250, 520, 0, 'full', true);
    out[dark ? 'splash-dark' : 'splash'] = c.toDataURL();
  }
  return out;
}
(window as unknown as { __render: typeof render }).__render = render;
