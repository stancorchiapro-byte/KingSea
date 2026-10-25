// Accès à l'autorité du jeu (KSCoins, tirages, récompenses).
// • LocalBackend : hors ligne, l'autorité tourne sur le téléphone (données sauvegardées localement).
// • RemoteBackend (net/Net.ts) : en ligne, chaque intention part au serveur qui seul décide.
// Les écrans de jeu ne savent pas lequel est utilisé : ils demandent, puis affichent la réponse.
import { activeSessions, abandonSession, handle, type AuthReply, type AuthRequest } from '../authority';
import { dayKey, secureRandom } from '../games/logic/rng';
import type { PlayerData } from '../systems/PlayerData';

export type AskKind = AuthRequest['kind'];

export interface Backend {
  readonly online: boolean;
  request(kind: AskKind, game: string, action: string, input?: unknown): Promise<AuthReply>;
}

let counter = 0;
/** Identifiant de requête unique (sert d'identifiant de transaction côté autorité). */
export function newRequestId(): string {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.floor(secureRandom() * 1e9).toString(36)}`;
}

export class LocalBackend implements Backend {
  readonly online = false;
  constructor(private data: () => PlayerData, private persist: () => void) {}

  async request(kind: AskKind, game: string, action: string, input?: unknown): Promise<AuthReply> {
    const r = handle(this.data(), { kind, game, action, input, id: newRequestId() }, { rng: secureRandom, now: Date.now(), day: dayKey(), seed: this.data().playerId, online: false });
    this.persist(); // économie : sauvegarde immédiate
    return r;
  }

  /** Au démarrage : termine les manches restées ouvertes (application fermée en pleine partie). */
  settleAbandoned(): Array<{ game: string; payout: number }> {
    const d = this.data(), out: Array<{ game: string; payout: number }> = [];
    for (const sess of activeSessions(d)) out.push({ game: sess.game, payout: abandonSession(d, sess.game, { rng: secureRandom, now: Date.now(), day: dayKey() }) });
    if (out.length) this.persist();
    return out;
  }
}
