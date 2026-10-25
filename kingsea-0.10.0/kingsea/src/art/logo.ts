// Logo KS : point d'entrée historique, conservé pour les écrans existants. Le dessin est désormais l'emblème
// « KS Casino » de la marque (art/brand.ts) : monogramme calligraphié, médaillon laqué noir cerclé d'or.
import { drawKSEmblem } from './brand';

/**
 * Logo KS centré en (cx, cy). size ≈ hauteur du médaillon de l'ancien logo (même encombrement) ;
 * withName ajoute le lettrage KINGSEA et la devise. Petite version automatique sous 56 px.
 */
export function drawKSLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, t = 0, withName = true): void {
  drawKSEmblem(ctx, cx, cy, size * 1.25, t, size * 1.25 < 56 ? 'small' : 'full', withName);
}
