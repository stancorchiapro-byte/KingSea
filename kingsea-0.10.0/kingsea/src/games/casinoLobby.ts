// Salle de jeux du casino : liste des jeux disponibles (fabriques), utilisée par le bouton « Jeux » des mini-jeux
// du casino pour passer d'un jeu à l'autre sans revenir dans la salle. Les règles restent propres à chaque jeu.
import { BaccaratGame } from './BaccaratGame';
import { BlackjackGame } from './BlackjackGame';
import { CrapsGame } from './CrapsGame';
import { CrashGame } from './CrashGame';
import { KenoGame } from './KenoGame';
import { SLOT_MACHINES } from './logic/slotMachines';
import type { MiniGame } from './MiniGame';
import { PlinkoGame } from './PlinkoGame';
import { RacesGame } from './RacesGame';
import { RouletteGame } from './RouletteGame';
import { SlotsGame } from './SlotsGame';
import { VideoPokerGame } from './VideoPokerGame';

export interface CasinoEntry { id: string; title: string; kind: string; make: () => MiniGame }

export const CASINO_LOBBY: CasinoEntry[] = [
  { id: 'blackjack', title: 'Blackjack', kind: 'Cartes · 1 à 5 mains', make: () => new BlackjackGame() },
  { id: 'blackjack-hilo', title: 'Blackjack Hi-Lo', kind: 'Cartes · comptage affiché', make: () => new BlackjackGame(true) },
  { id: 'roulette', title: 'Roulette', kind: 'Table · européenne', make: () => new RouletteGame() },
  { id: 'baccarat', title: 'Baccarat', kind: 'Cartes · Punto Banco', make: () => new BaccaratGame() },
  { id: 'craps', title: 'Craps', kind: 'Dés', make: () => new CrapsGame() },
  { id: 'poker', title: 'Poker', kind: 'Valets ou mieux', make: () => new VideoPokerGame('classic') },
  { id: 'direct-poker', title: 'Direct Poker', kind: 'Paiement immédiat', make: () => new VideoPokerGame('direct') },
  ...SLOT_MACHINES.map((m) => ({ id: `slots-${m.id}`, title: m.name, kind: 'Machine à sous', make: () => new SlotsGame(m) })),
  { id: 'keno', title: 'Keno', kind: 'Tirage', make: () => new KenoGame() },
  { id: 'races', title: 'Courses', kind: 'Paris hippiques', make: () => new RacesGame() },
  { id: 'plinko', title: 'Plinko', kind: 'Bille', make: () => new PlinkoGame() },
  { id: 'crash', title: 'Crash', kind: 'Multiplicateur', make: () => new CrashGame() },
];
