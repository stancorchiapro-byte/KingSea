// Point d'entrée unique de l'autorité : une requête → une réponse, état du joueur modifié sur place.
import { casinoAction } from './casino';
import { economyView, ensureEconomy, inComa } from './economy';
import { ensureProgress, grantXp, legacyXp, refreshMissions } from './progress';
import { purserAction } from './purser';
import { roomAction } from './room';
import { AuthError, obj, type AuthEnv, type AuthReply, type AuthRequest, type AuthState, type ProgressSnapshot } from './types';

export * from './types';
export { abandonSession, activeSessions, blackjackView, CASINO_GAMES, CRASH_AUTOS } from './casino';
export { ARCADE, COLLECTIBLES, DAILY_REWARD_CAP, RECEPTION_GIFT } from './purser';
export * from './progress';
export * from './economy';
export { checkLayout, footprint, ROOM, ROOM_FIXED } from './room';

/** Vérifie la forme d'une requête venue du réseau. */
export function parseRequest(raw: unknown): AuthRequest | null {
  const o = obj(raw);
  if ((o.kind !== 'casino' && o.kind !== 'purser') || typeof o.game !== 'string' || typeof o.action !== 'string' || typeof o.id !== 'string') return null;
  if (o.game.length > 32 || o.action.length > 20 || o.id.length < 4 || o.id.length > 48 || !/^[\w:.-]+$/.test(o.id)) return null;
  return { kind: o.kind, game: o.game, action: o.action, input: o.input, id: o.id };
}

export function handle(s: AuthState, req: AuthRequest, env: AuthEnv): AuthReply {
  s.sessions ??= {};
  const legacy = !s.progress;
  ensureProgress(s);
  // Profil d'avant la mise à jour : XP d'ancienneté (une seule fois, transaction de niveau idempotente)
  if (legacy) { const x = legacyXp(s.stats); if (x > 0) grantXp(s, x, env); }
  refreshMissions(s, env, env.seed, env.online);
  ensureEconomy(s);
  // Instantané pour annuler toute modification partielle si une règle refuse l'opération.
  const backup = JSON.stringify({ w: s.wallet, st: s.stats, f: s.flags, d: s.dailyRewards, se: s.sessions, p: s.progress, m: s.missions, r: s.room, c: s.chips, i: s.inventory, n: s.needs });
  const xp0 = s.progress.xp, lvl0 = s.progress.level;
  try {
    // Pendant un coma : aucune action de jeu (seuls le relevé des jauges et le réveil sont acceptés)
    if (inComa(s) && !(req.kind === 'purser' && (req.action === 'needs' || req.action === 'wake'))) throw new AuthError('Tu es inconscient : patiente quelques secondes');
    const r = req.kind === 'casino' ? casinoAction(s, req.game, req.action, req.input, req.id, env)
      : req.action.startsWith('room-') ? roomAction(s, req.action, req.input, req.id, env)
        : purserAction(s, req.action, req.input, req.id, env);
    const p = s.progress;
    const prog: ProgressSnapshot = {
      xp: p.xp, level: p.level, gainedXp: p.xp - xp0, levelUps: Array.from({ length: Math.max(0, p.level - lvl0) }, (_, i) => lvl0 + i + 1),
      unlocks: [...p.unlocks], title: p.title, missions: s.missions ?? null,
      ...(req.action.startsWith('room-') ? { room: s.room } : {}),
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
    if (b.m && s.missions) refill(s.missions as unknown as Record<string, unknown>, b.m); else s.missions = b.m ?? undefined;
    const msg = e instanceof AuthError ? e.message : 'Opération impossible';
    if (!(e instanceof AuthError)) console.error('[KingSea] autorité', e);
    return { ok: false, error: msg, balance: s.wallet.balance, eco: economyView(s, env) };
  }
}
