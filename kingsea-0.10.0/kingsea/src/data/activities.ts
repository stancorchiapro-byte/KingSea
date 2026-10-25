// Programme des activités : affiché tel quel à la caisse du casino et au tableau de l'arcade.
// Le statut reflète l'état réel du développement (rien n'est annoncé comme jouable s'il ne l'est pas).

export interface Activity { name: string; phase: number }

export const CASINO_GAMES: Activity[] = [
  { name: 'Blackjack classique', phase: 3 },
  { name: 'Roulette', phase: 3 },
  { name: 'Machine à sous « Trésors engloutis »', phase: 3 },
  { name: 'Blackjack Hi-Lo', phase: 4 },
  { name: 'Table de poker', phase: 4 },
  { name: 'Direct Poker', phase: 4 },
  { name: '5 autres machines à sous', phase: 4 },
  { name: 'Craps', phase: 4 },
  { name: 'Keno', phase: 4 },
  { name: 'Courses de chevaux', phase: 4 },
  { name: 'Baccarat', phase: 4 },
  { name: 'Plinko', phase: 4 },
  { name: 'Crash', phase: 4 },
];

export const ARCADE_GAMES: Activity[] = [
  { name: 'Bowling', phase: 3 },
  { name: 'Billard', phase: 3 },
  { name: 'Basket-ball d’arcade', phase: 4 },
  { name: 'Football d’arcade (tirs au but)', phase: 4 },
  { name: 'Skee-Ball', phase: 4 },
  { name: 'Tape-crabe (tape-taupe)', phase: 4 },
  { name: 'Flipper maritime', phase: 4 },
];

/** Phase de développement atteinte par la version actuelle. */
export const CURRENT_PHASE = 4;

export function activityList(list: Activity[]): string {
  return list.map((a) => `• ${a.name} — ${a.phase <= CURRENT_PHASE ? 'ouvert' : `phase ${a.phase}`}`).join('\n');
}
