// Autorité du jeu : TOUTES les règles qui touchent aux KSCoins, aux tirages et aux récompenses.
// Le même code s'exécute à deux endroits :
//   • sur le téléphone en mode hors ligne (LocalBackend) ;
//   • sur le serveur en mode en ligne (server/), qui fait alors seul autorité : le téléphone n'envoie
//     que des intentions (« je mise 10 sur le rouge ») et reçoit des résultats.
import type { Rng } from '../games/logic/rng';
import type { MissionsState, ProgressState, RoomState } from './progress';
import type { PassState } from './pass';
import type { EconomyHolder, KeyItem } from './economy';

export interface Session {
  game: string;
  /** Identifiant de la manche (sert d'identifiant de transaction : jamais payé deux fois). */
  tx: string;
  stake: number;
  at: number;
  /** État complet, secret compris (cartes du sabot, point du Crash…). Jamais envoyé tel quel au joueur. */
  data: Record<string, unknown>;
}

/** Données d'un joueur sur lesquelles l'autorité agit (sous-ensemble de PlayerData / ligne du serveur). */
export interface AuthState extends EconomyHolder {
  wallet: { balance: number; processedTx: string[] };
  stats: Record<string, number>;
  flags: Record<string, boolean>;
  dailyRewards: { lastWheelDay: string | null };
  /** Manches en cours et sabots persistants (blackjack), par jeu. */
  sessions: Record<string, Session>;
  /** Progression (XP, niveau, déblocages), missions et cabine — ajoutés par la mise à jour KS Casino. */
  progress?: ProgressState;
  missions?: MissionsState;
  room?: RoomState;
  /** Cabine attribuée (clé principale associée). */
  cabin?: { id: string | null };
}

export interface AuthEnv {
  rng: Rng;
  now: number;
  /** Jour courant (AAAA-MM-JJ) selon l'horloge de l'autorité (serveur en ligne). */
  day: string;
  /** Graine des missions (identifiant du joueur) et mode en ligne (missions sociales). */
  seed?: string;
  online?: boolean;
}

export interface AuthRequest { kind: 'casino' | 'purser'; game: string; action: string; input?: unknown; id: string }

export type AuthReply =
  | { ok: true; view: Record<string, unknown>; stake: number; payout: number; done: boolean; balance: number; prog?: ProgressSnapshot; eco?: EcoSnapshot }
  | { ok: false; error: string; balance: number; eco?: EcoSnapshot };

/** Jetons, inventaire et jauges renvoyés avec chaque réponse (l'autorité fait foi). */
export interface EcoSnapshot { chips: number; inv: Record<string, number>; keys?: KeyItem[]; lock?: number; needs: { hunger: number; thirst: number; coma: number | null; cause: string | null } }

/** Progression renvoyée avec chaque réponse : le téléphone l'affiche (XP gagnée, montée de niveau). */
export interface ProgressSnapshot {
  xp: number; level: number; gainedXp: number; levelUps: number[];
  unlocks: string[]; title: string | null; missions: MissionsState | null;
  /** Passe de croisière (saison, XP, paliers réclamés). */
  pass?: PassState;
  /** Cabine (seulement après une action sur la cabine). */
  room?: RoomState;
}

export class AuthError extends Error {}

export const MAX_BET = 1000;
export const MAX_TOTAL_STAKE = 5000;

/** Nombre entier de KSCoins strictement positif et raisonnable. */
export function amount(v: unknown, max = MAX_BET): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > max) throw new AuthError('Mise invalide');
  return v;
}

export function obj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

const MAX_TX_HISTORY = 400;

/** Opérations de portefeuille idempotentes (mêmes règles que systems/Wallet.ts, sur l'état brut). */
export const ledger = {
  has(s: AuthState, tx: string): boolean { return s.wallet.processedTx.includes(tx); },
  apply(s: AuthState, delta: number, tx: string): boolean {
    if (!Number.isInteger(delta) || !tx || s.wallet.processedTx.includes(tx)) return false;
    if (s.wallet.balance + delta < 0) return false;
    s.wallet.balance += delta;
    s.wallet.processedTx.push(tx);
    if (s.wallet.processedTx.length > MAX_TX_HISTORY) s.wallet.processedTx.splice(0, s.wallet.processedTx.length - MAX_TX_HISTORY);
    return true;
  },
  spend(s: AuthState, n: number, tx: string): void {
    if (s.wallet.balance < n) throw new AuthError('Pas assez de KSCoins');
    if (!ledger.apply(s, -n, tx)) throw new AuthError('Opération déjà effectuée');
  },
  earn(s: AuthState, n: number, tx: string): void { if (n > 0) ledger.apply(s, n, tx); },
};

export function incStat(s: AuthState, key: string, by = 1): void { s.stats[key] = (s.stats[key] ?? 0) + by; }
