// Manche en cours sauvegardée. Si l'application est fermée avant la fin d'une manche, elle est réglée
// au prochain démarrage, exactement comme elle se serait terminée (le résultat était déjà tiré),
// avec la même transaction de gain : impossible d'être payé deux fois.
import { Blackjack, type BlackjackSnapshot } from './blackjack';
import { bacSettle, type BacBet } from './baccarat';
import type { Card } from './cards';
import { crapsSettle, type CrapsBet, type CrapsRound } from './craps';
import { crashReturn } from './crash';
import { kenoReturn } from './keno';
import { isPlinkoRisk, plinkoReturn } from './plinko';
import { DIRECT_POKER, evaluate, JACKS_OR_BETTER, payout } from './poker';
import { raceReturn, type Horse } from './races';
import { settleBets, type Bet } from './roulette';
import { lineReturnStops, SLOT_MACHINES } from './slotMachines';

export interface PendingRound { game: string; tx: string; stake: number; data: unknown; at: number }

export const GAME_LABELS: Record<string, string> = {
  blackjack: 'blackjack', 'blackjack-hilo': 'blackjack Hi-Lo', roulette: 'roulette', slots: 'machine à sous', baccarat: 'baccarat',
  craps: 'craps', keno: 'keno', races: 'courses', plinko: 'Plinko', crash: 'Crash', poker: 'poker', 'direct-poker': 'Direct Poker',
};

/** Retour (KSCoins) d'une manche interrompue, calculé à partir de l'état sauvegardé. */
export function resolvePending(p: PendingRound): number {
  const d = p.data as Record<string, unknown>;
  switch (p.game) {
    case 'blackjack':
    case 'blackjack-hilo': {
      const g = Blackjack.restore(d.snapshot as BlackjackSnapshot, Math.random);
      g.autoFinish();
      return g.totalPayout;
    }
    case 'roulette': return settleBets(d.bets as Bet[], d.result as number);
    case 'slots': {
      const def = SLOT_MACHINES.find((m) => m.id === d.machine) ?? SLOT_MACHINES[0];
      return Math.floor(lineReturnStops(def, d.stops as number[]) * (d.bet as number));
    }
    case 'baccarat': return bacSettle(d.bets as Partial<Record<BacBet, number>>, d.winner as BacBet);
    case 'craps': return crapsSettle(d.bets as Partial<Record<CrapsBet, number>>, d.round as CrapsRound);
    case 'keno': return kenoReturn(d.picks as number[], d.drawn as number[], d.bet as number);
    case 'races': return raceReturn(d.field as Horse[], d.bets as Record<number, number>, d.winner as number);
    case 'plinko': return plinkoReturn(d.path as number[], d.bet as number, isPlinkoRisk(d.risk) ? d.risk : 'medium');
    case 'crash': {
      const auto = d.auto as number | null, point = d.point as number, cashed = d.cashedAt as number | null;
      const at = cashed ?? (auto !== null && auto <= point ? auto : null);
      return crashReturn(d.bet as number, at, point);
    }
    case 'poker': return payout(JACKS_OR_BETTER, evaluate(d.hand as Card[])) * (d.bet as number);
    case 'direct-poker': return payout(DIRECT_POKER, evaluate(d.hand as Card[])) * (d.bet as number);
    default: return p.stake; // jeu inconnu : on rend la mise
  }
}

export function isPendingRound(v: unknown): v is PendingRound {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.game === 'string' && typeof o.tx === 'string' && typeof o.stake === 'number' && Number.isFinite(o.stake) && o.stake >= 0;
}
