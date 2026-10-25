import type { PointerHandler } from './Input';

/** Une scène : écran de chargement, menu, monde… Le Game n'en affiche qu'une à la fois. */
export interface Scene {
  enter(): void;
  exit(): void;
  /** dt en secondes, déjà borné. */
  update(dt: number): void;
  /** Dessin en pixels CSS (la transformation DPR est déjà appliquée). */
  render(ctx: CanvasRenderingContext2D): void;
  /** Handlers de pointeurs, du moins prioritaire au plus prioritaire. */
  pointerHandlers(): PointerHandler[];
  onResize?(): void;
  /** Bouton retour Android / touche Échap. Retourne true si consommé. */
  onBack?(): boolean;
  /** Faux : jamais ralentie à 30 images/s par inactivité (mini-jeux où la physique continue sans toucher). */
  idleThrottle?: boolean;
}
