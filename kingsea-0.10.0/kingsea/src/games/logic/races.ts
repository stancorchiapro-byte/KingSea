// Courses de chevaux : 6 chevaux, cotes fixes affichées avant le départ.
// Probabilités de victoire cohérentes avec les cotes (marge de la maison ≈ 6 %).
// L'ordre d'arrivée est tiré au départ ; l'animation se contente de le respecter.
import { shuffle, weightedIndex, type Rng } from './rng';

export const HORSE_NAMES = ['Écume', 'Tempête', 'Corail', 'Marée Haute', 'Alizé', 'Nautilus', 'Sirène', 'Mistral', 'Perle Noire', 'Embrun'];
export const HORSE_COLORS = ['#e8463a', '#1f6fd1', '#e5b54a', '#59e3a7', '#7b4dff', '#ff8c42'];
const PROBS = [0.32, 0.24, 0.17, 0.12, 0.09, 0.06];
export const RACE_MARGIN = 0.94;

export interface Horse { name: string; color: string; prob: number; odds: number }

/** Partants de la course : noms tirés au hasard, cotes = retour pour 1 (mise comprise). */
export function makeField(rng: Rng): Horse[] {
  const names = shuffle([...HORSE_NAMES], rng).slice(0, 6);
  const probs = shuffle([...PROBS], rng);
  return names.map((name, i) => ({ name, color: HORSE_COLORS[i], prob: probs[i], odds: Math.floor((RACE_MARGIN / probs[i]) * 10) / 10 }));
}

/** Ordre d'arrivée : chaque place est tirée parmi les chevaux restants, selon leurs probabilités. */
export function raceOrder(field: Horse[], rng: Rng): number[] {
  const left = field.map((_, i) => i), order: number[] = [];
  while (left.length) {
    const k = weightedIndex(rng, left.map((i) => field[i].prob));
    order.push(left[k]); left.splice(k, 1);
  }
  return order;
}

export function raceReturn(field: Horse[], bets: Record<number, number>, winner: number): number {
  return Math.floor((bets[winner] ?? 0) * field[winner].odds);
}
