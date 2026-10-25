// Billard : règles du « 8 américain » à deux joueurs (même appareil), version de salon claire et complète :
// • Casse : rien n'est attribué ; la 8 empochée à la casse est replacée.
// • Table ouverte tant que pleines (1–7) / rayées (9–15) ne sont pas attribuées : la première bille
//   empochée régulièrement (hors casse) attribue son groupe au tireur.
// • Faute : blanche empochée, aucune bille touchée, première bille touchée hors de son groupe (ou la 8 alors
//   qu'il reste des billes de son groupe). Après une faute : bille en main pour l'adversaire.
// • Le tireur rejoue s'il empoche régulièrement au moins une bille de son groupe (n'importe laquelle si table ouverte).
// • La 8 : gagnée si empochée régulièrement après son groupe ; perdue si empochée trop tôt ou avec une faute.

export type Group = 'pleines' | 'rayées';
export const groupOf = (id: number): Group | 'noire' | 'blanche' => (id === 0 ? 'blanche' : id === 8 ? 'noire' : id < 8 ? 'pleines' : 'rayées');

export interface EightBallState {
  turn: 0 | 1;
  groups: [Group | null, Group | null];
  /** Billes encore sur la table (hors blanche). */
  onTable: number[];
  shots: number;
  winner: 0 | 1 | null;
  /** Bille en main pour le joueur au tir (après une faute adverse). */
  ballInHand: boolean;
  /** Prochain tir = casse. */
  breakShot: boolean;
}

export interface ShotInfo { firstHit: number | null; potted: number[]; scratch: boolean }
export interface ShotVerdict { foul: string | null; again: boolean; message: string; respot8: boolean }

export function newEightBall(): EightBallState {
  return { turn: 0, groups: [null, null], onTable: Array.from({ length: 15 }, (_, i) => i + 1), shots: 0, winner: null, ballInHand: false, breakShot: true };
}

const other = (t: 0 | 1): 0 | 1 => (t === 0 ? 1 : 0);
const NAMES = ['Joueur 1', 'Joueur 2'];

/** Billes restantes du groupe d'un joueur (null si groupe non attribué). */
export function remainingOf(s: EightBallState, p: 0 | 1): number | null {
  const g = s.groups[p];
  return g ? s.onTable.filter((id) => groupOf(id) === g).length : null;
}

/** Applique le résultat d'un tir et renvoie le verdict (état modifié en place). */
export function judgeShot(s: EightBallState, shot: ShotInfo): ShotVerdict {
  if (s.winner !== null) return { foul: null, again: false, message: 'Partie terminée', respot8: false };
  const me = s.turn, g = s.groups[me];
  const before = remainingOf(s, me);
  s.shots++;
  const wasBreak = s.breakShot;
  s.breakShot = false;
  s.ballInHand = false;
  const potted = shot.potted.filter((id) => id !== 0);
  s.onTable = s.onTable.filter((id) => !potted.includes(id));
  const eight = potted.includes(8);

  // Faute ?
  let foul: string | null = null;
  if (shot.scratch) foul = 'Blanche empochée';
  else if (shot.firstHit === null) foul = 'Aucune bille touchée';
  else if (!wasBreak) {
    const fh = groupOf(shot.firstHit);
    if (g && fh !== g && !(fh === 'noire' && before === 0)) foul = fh === 'noire' ? 'La 8 touchée trop tôt' : `Première bille touchée : ${fh}, pas les tiennes`;
    if (!g && fh === 'noire') foul = 'La 8 touchée en premier (table ouverte)';
  }

  // La 8
  if (eight) {
    if (wasBreak && !shot.scratch) {
      s.onTable.push(8);
      return { foul: null, again: potted.length > 1, message: 'La 8 à la casse : elle est replacée', respot8: true };
    }
    const legal = !foul && g !== null && before === 0;
    s.winner = legal ? me : other(me);
    return { foul, again: false, message: legal ? `${NAMES[me]} empoche la 8 et gagne !` : `${NAMES[me]} empoche la 8 ${foul ? 'sur une faute' : 'trop tôt'} : ${NAMES[other(me)]} gagne`, respot8: false };
  }

  // Attribution des groupes (table ouverte, hors casse, sans faute)
  if (!g && !foul && !wasBreak && potted.length) {
    const first = groupOf(potted[0]) as Group;
    s.groups[me] = first; s.groups[other(me)] = first === 'pleines' ? 'rayées' : 'pleines';
  }
  const mine = s.groups[me];
  const pottedOwn = potted.filter((id) => (mine ? groupOf(id) === mine : true)).length;

  if (foul) {
    s.turn = other(me); s.ballInHand = true;
    return { foul, again: false, message: `Faute : ${foul}. Bille en main pour ${NAMES[s.turn]}`, respot8: false };
  }
  if (pottedOwn > 0) {
    const assigned = !g && mine ? ` · ${NAMES[me]} joue les ${mine}` : '';
    return { foul: null, again: true, message: `${pottedOwn} bille${pottedOwn > 1 ? 's' : ''} empochée${pottedOwn > 1 ? 's' : ''}, ${NAMES[me]} rejoue${assigned}`, respot8: false };
  }
  s.turn = other(me);
  return { foul: null, again: false, message: `À ${NAMES[s.turn]} de jouer`, respot8: false };
}

/** Effet donné à la blanche : la vitesse ajoutée après le premier choc, dans l'axe du tir. */
export type Spin = 'centre' | 'coulé' | 'rétro';
export const SPIN_FACTOR: Record<Spin, number> = { centre: 0, 'coulé': 0.32, 'rétro': -0.42 };

/**
 * Applique l'effet au premier contact blanche–bille : la blanche garde une part de sa vitesse d'avant le choc
 * dans l'axe du tir (coulé : elle suit ; rétro : elle revient).
 */
export function applySpin(cue: { vx: number; vy: number }, dir: { x: number; y: number }, preSpeed: number, spin: Spin): void {
  const k = SPIN_FACTOR[spin];
  if (!k) return;
  cue.vx += dir.x * preSpeed * k; cue.vy += dir.y * preSpeed * k;
}
