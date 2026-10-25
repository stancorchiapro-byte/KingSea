// Contrat commun des mini-jeux : chaque jeu est un module indépendant (logique dans games/logic,
// affichage et commandes tactiles dans sa vue). La scène hôte fournit l'en-tête, les règles,
// la sortie et le retour au monde.
import type { PointerHandler } from '../engine/Input';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import type { Toasts } from '../ui/Toasts';

export interface Area { x: number; y: number; w: number; h: number }

export interface MiniGameHost {
  readonly s: Services;
  readonly vp: Viewport;
  readonly toasts: Toasts;
  /** Zone disponible sous l'en-tête (px CSS). */
  readonly area: Area;
  /** À appeler quand la liste de handlers du jeu change. */
  refreshHandlers(): void;
  /** Ferme le jeu et revient au navire. */
  quit(): void;
}

export interface MiniGame {
  readonly id: string;
  readonly title: string;
  /** Règles affichées par le bouton « Règles ». */
  readonly rules: string;
  /** Couleurs du fond (dégradé vertical). */
  readonly bg: [string, string];
  /** Monnaie misée : jetons de casino (jeux du casino) ; absent : KSCoins (arcade, roue). */
  readonly currency?: 'chips';
  init(host: MiniGameHost): void;
  layout(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  handlers(): PointerHandler[];
  /** Peut-on quitter maintenant (ex. pas au milieu d'une main de blackjack) ? */
  canQuit(): { ok: true } | { ok: false; reason: string };
  dispose?(): void;
  /** Vrai pendant une animation de résultat : le compteur de KSCoins attend la révélation. */
  readonly holdBalance?: boolean;
}
