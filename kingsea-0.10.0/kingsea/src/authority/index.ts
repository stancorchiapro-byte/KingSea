// Point d'entrée unique de l'autorité : une requête → une réponse, état du joueur modifié sur place.
import { casinoAction } from './casino';
import { economyView, ensureEconomy, inComa } from './economy';
import { ensureProgress, grantXp, legacyXp, refreshMissions } from './progress';
import { purserAction } from './purser';
import { roomAction } from './room';
import { ensureMasterKey } from './keys';
import { AuthError, obj, type AuthEnv, type AuthReply, type AuthRequest, type AuthState, type ProgressSnapshot } from './types';

export * from './types';
export { abandonSession, activeSessions, BJ_MAX_BOXES, blackjackBets, blackjackView, CASINO_GAMES, CRASH_AUTOS, insureSeat } from './casino';
export { ARCADE, COLLECTIBLES, DAILY_REWARD_CAP, RECEPTION_GIFT } from './purser';
export * from './progress';
export * from './economy';
export { checkLayout, footprint, ROOM, ROOM_FIXED } from './room';
export * from './keys';
export * from './gifts';
export * from './pass';
export * from './access';
export * from './tables';

/** Vérifie la forme d'une requête venue du réseau. */
export function parseRequest(raw: unknown): AuthRequest | null {
  const o = obj(raw);
  if ((o.kind !== 'casino' && o.kind !== 'purser') || typeof o.game !== 'string' || typeof o.action !== 'string' || typeof o.id !== 'string') return null;
  if (o.game.length > 32 || o.action.length > 20 || o.id.length < 4 || o.id.length > 48 || !/^[\w:.-]+$/.test(o.id)) return null;
  return { kind: o.kind, game: o.game, action: o.action, input: o.input, id: o.id };
}

export function handle(s: AuthState, req: AuthRequest, env: AuthEnv): AuthReply {
  return transact(s, env, () => {
    // Pendant un coma : aucune action de jeu (seuls le relevé des jauges et le réveil sont acceptés)
    if (inComa(s) && !(req.kind === 'purser' && (req.action === 'needs' || req.action === 'wake'))) throw new AuthError('Tu es inconscient : patiente quelques secondes');
    return req.kind === 'casino' ? casinoAction(s, req.game, req.action, req.input, req.id, env)
      : req.action.startsWith('room-') ? roomAction(s, req.action, req.input, req.id, env)
        : purserAction(s, req.action, req.input, req.id, env);
  }, req.action.startsWith('room-'));
}

/**
 * Exécute une opération de l'autorité sur l'état d'un joueur, de façon atomique : en cas de refus (AuthError) ou
 * d'erreur, l'état est entièrement restauré. Utilisé par handle() et par les tables multijoueurs du serveur.
 */
export function transact(s: AuthState, env: AuthEnv, op: () => { view: Record<string, unknown>; stake: number; payout: number; done: boolean }, withRoom = false): AuthReply {
  s.sessions ??= {};
  const legacy = !s.progress;
  ensureProgress(s);
  // Profil d'avant la mise à jour : XP d'ancienneté (une seule fois, transaction de niveau idempotente)
  if (legacy) { const x = legacyXp(s.stats); if (x > 0) grantXp(s, x, env); }
  refreshMissions(s, env, env.seed, env.online);
  ensureEconomy(s);
  ensureMasterKey(s, env.seed);
  // Instantané pour annuler toute modification partielle si une règle refuse l'opération.
  const backup = JSON.stringify({ w: s.wallet, st: s.stats, f: s.flags, d: s.dailyRewards, se: s.sessions, p: s.progress, m: s.missions, r: s.room, c: s.chips, i: s.inventory, n: s.needs, k: s.keys, kr: s.keyring, g: s.giftLog });
  const xp0 = s.progress.xp, lvl0 = s.progress.level;
  try {
    const r = op();
    const p = s.progress;
    const prog: ProgressSnapshot = {
      xp: p.xp, level: p.level, gainedXp: p.xp - xp0, levelUps: Array.from({ length: Math.max(0, p.level - lvl0) }, (_, i) => lvl0 + i + 1),
      unlocks: [...p.unlocks], title: p.title, missions: s.missions ?? null, pass: p.pass,
      ...(withRoom ? { room: s.room } : {}),
    };
    return { ok: true, view: r.view, stake: r.stake, payout: r.payout, done: r.done, balance: s.wallet.balance, prog, eco: economyView(s, env) };
  } catch (e) {
    // Restauration sur place (d'autres objets peuvent garder une référence vers ces sous-objets)
    const b = JSON.parse(backup);
    const refill = (o: Record<string, unknown>, src: Record<string, unknown>) => { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, src); };
    s.wallet.balance = b.w.balance; s.wallet.processedTx.splice(0, s.wallet.processedTx.length, ...b.w.processedTx);
    refill(s.stats, b.st); refill(s.flags, b.f); refill(s.sessions as Record<string, unknown>, b.se);
    s.dailyRewards.lastWheelDay = b.d.lastWheelDay;
    s.chips!.balance = b.c.balance; s.chips!.processedTx.splice(0, s.chips!.processedTx.length, ...b.c.processedTx);
    refill(s.inventory!.items, b.i.items); refill(s.needs as unknown as Record<string, unknown>, b.n);
    refill(s.progress as unknown as Record<string, unknown>, b.p); refill(s.room as unknown as Record<string, unknown>, b.r);
    s.keys!.splice(0, s.keys!.length, ...b.k); Object.assign(s.keyring!, b.kr); s.giftLog!.splice(0, s.giftLog!.length, ...b.g);
    if (b.m && s.missions) refill(s.missions as unknown as Record<string, unknown>, b.m); else s.missions = b.m ?? undefined;
    const msg = e instanceof AuthError ? e.message : 'Opération impossible';
    if (!(e instanceof AuthError)) console.error('[KingSea] autorité', e);
    return { ok: false, error: msg, balance: s.wallet.balance, eco: economyView(s, env) };
  }
}
