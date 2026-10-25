// Taille de l'écran, densité de pixels et zones de sécurité (encoche, barre système).

export interface Insets { top: number; right: number; bottom: number; left: number }

export class Viewport {
  /** Dimensions en pixels CSS. */
  width = 0;
  height = 0;
  dpr = 1;
  /** Densité maximale (abaissée en économie d'énergie ou si l'appareil peine). */
  maxDpr = 2.5;
  safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private listeners: Array<() => void> = [];

  constructor(private canvas: HTMLCanvasElement, private probe: HTMLElement | null) {
    const onResize = () => this.update();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    window.visualViewport?.addEventListener('resize', onResize);
    this.update();
  }

  get isPortrait(): boolean { return this.height > this.width; }

  /** Unité d'interface : grandit légèrement sur les grands écrans, jamais trop petite. */
  get ui(): number {
    const short = Math.min(this.width, this.height);
    return Math.max(0.85, Math.min(1.35, short / 400));
  }

  onResize(fn: () => void): void { this.listeners.push(fn); }

  setMaxDpr(v: number): void { if (v !== this.maxDpr) { this.maxDpr = v; this.update(); } }

  update(): void {
    const w = Math.max(1, Math.round(window.innerWidth));
    const h = Math.max(1, Math.round(window.innerHeight));
    // Limite la densité à 2.5 : au-delà le gain visuel est faible et le coût GPU/batterie élevé.
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.probe) {
      const cs = getComputedStyle(this.probe);
      const px = (v: string) => parseFloat(v) || 0;
      this.safe = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    }
    for (const fn of this.listeners) fn();
  }
}
