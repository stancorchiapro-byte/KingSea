// Baccarat « Punto Banco » : règles de tirage standard (tableau), sabot de 8 jeux.
// Paiements : Joueur 1:1, Banque 1:1 moins 5 % de commission (retour 1,95), Égalité 8:1 (retour 9).
// Sur égalité, les mises Joueur et Banque sont rendues.
import type { Card } from './cards';
import { Shoe } from './cards';
import type { Rng } from './rng';

export type BacBet = 'player' | 'banker' | 'tie';
export const BAC_RETURN: Record<BacBet, number> = { player: 2, banker: 1.95, tie: 9 };

const pts = (c: Card) => (c.rank >= 10 ? 0 : c.rank);
export const bacTotal = (cards: Card[]): number => cards.reduce((a, c) => a + pts(c), 0) % 10;

export interface BacRound { player: Card[]; banker: Card[]; winner: BacBet }

export function playBaccarat(draw: () => Card): BacRound {
  const player = [draw(), draw()], banker = [draw(), draw()];
  // ordre réel : J, B, J, B
  [player[1], banker[0]] = [banker[0], player[1]];
  const pt = bacTotal(player), bt = bacTotal(banker);
  if (pt < 8 && bt < 8) {
    let third: Card | null = null;
    if (pt <= 5) { third = draw(); player.push(third); }
    const b = bacTotal(banker);
    if (third === null) { if (b <= 5) banker.push(draw()); }
    else {
      const t = pts(third);
      const drawB = b <= 2 || (b === 3 && t !== 8) || (b === 4 && t >= 2 && t <= 7) || (b === 5 && t >= 4 && t <= 7) || (b === 6 && (t === 6 || t === 7));
      if (drawB) banker.push(draw());
    }
  }
  const p = bacTotal(player), b = bacTotal(banker);
  return { player, banker, winner: p > b ? 'player' : b > p ? 'banker' : 'tie' };
}

/** Retour total (KSCoins) pour des mises données. */
export function bacSettle(bets: Partial<Record<BacBet, number>>, winner: BacBet): number {
  let ret = 0;
  for (const k of ['player', 'banker', 'tie'] as BacBet[]) {
    const a = bets[k] ?? 0;
    if (!a) continue;
    if (k === winner) ret += Math.floor(a * BAC_RETURN[k]);
    else if (winner === 'tie') ret += a; // Joueur / Banque rendus sur égalité
  }
  return ret;
}

export const newBaccaratShoe = (rng: Rng): Shoe => new Shoe(rng, 8);
