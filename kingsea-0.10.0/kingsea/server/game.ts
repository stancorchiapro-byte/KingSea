// Serveur de jeu KingSea (autoritaire) : comptes, présence par étage, synchronisation des déplacements,
// emotes, chat modéré, blocage, signalement, cabines, et économie exécutée par l'autorité partagée.
// Indépendant du transport : index.ts y branche des WebSockets, les tests des sockets factices.
import { randomInt } from 'node:crypto';
import { DEFAULT_LOOK, enforceUnlocks, sanitizeLook } from '../src/art/characters';
import { abandonSession, activeSessions, ensureEconomy, ensureMasterKey, ensureProgress, floorAccess, giftAllowance, giveGift, handle, keyOpens, missionEvent, parseRequest, refreshMissions, transact, type AuthReply, type AuthState } from '../src/authority';
import { EMOTE_BY_ID, emoteUnlocked } from '../src/data/emotes';
import { TableManager } from './tables';
import { GAME_LABELS } from '../src/games/logic/pending';
import { dayKey } from '../src/games/logic/rng';
import { CHAT_NEAR_RADIUS, DM_MAX, GLOBAL_CHAT_COOLDOWN, GLOBAL_CHAT_LEVEL, MAX_FRIENDS, MAX_PENDING, NET_ANIMS, type DmConversation, type DmMessage, type GiftAllowanceInfo, type FriendEntry, type FriendsData, packPose, PROTOCOL_VERSION, TERMS_VERSION, type ChatScope, type ClientMsg, type NetAnim, type NetDir, type OwnProfile, type PublicPlayer, type ServerMsg } from '../src/net/protocol';
import { CabinRegistry, CABIN_IDS } from '../src/systems/Cabins';
import { STARTING_COINS } from '../src/systems/PlayerData';
import { getFloor } from '../src/world/floors';
import { TileMap } from '../src/world/TileMap';
import { TILE } from '../src/world/types';
import { checkName, checkPassword, hashPassword, newAccountId, newToken, verifyPassword } from './accounts';
import { ChatLimiter, cleanMessage, RateLimiter } from './moderation';
import { validateMove } from './movement';
import type { ServerProfile, Store } from './store';

export interface Sock { send(data: string): void; close(code?: number, reason?: string): void; readonly ip: string }

interface Client {
  sock: Sock;
  profile: ServerProfile | null;
  token: string | null;
  room: string | null;
  floor: string | null;
  pos: { x: number; y: number; t: number; dir: NetDir; anim: NetAnim };
  moved: boolean;
  chat: ChatLimiter;
  replies: Map<string, AuthReply>;
  lastSeen: number;
  lastEmote: number;
  /** Dernier message du chat global (délai minimal). */
  lastGlobal: number;
  blocked: Set<string>;
  /** Numéro court pour les instantanés (unique sur le serveur). */
  num: number;
  /** Cabine visitée (propriétaire) quand le joueur est chez quelqu'un. */
  visiting: string | null;
  dm: ChatLimiter;
}

/** Durée restante d'une sanction (« encore 2 h 15 min ») : aucune heure d'horloge n'est affichée dans le jeu. */
export function until(t: number, now: number = Date.now()): string {
  if (t > now + 5 * 365 * 86_400_000) return 'définitivement';
  const min = Math.max(1, Math.ceil((t - now) / 60_000));
  if (min < 60) return `pour encore ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return `pour encore ${h} h${m ? ` ${m} min` : ''}`;
  return `pour encore ${Math.ceil(h / 24)} jours`;
}

/** Délai de validité d'une invitation acceptée (le visiteur doit entrer avant). */
export const VISIT_PERMIT_MS = 5 * 60_000;
/** Délai de réponse à un coup de sonnette. */
export const VISIT_RING_MS = 60_000;
const NICK_RE = /^[\p{L}\p{N} '’._-]{1,20}$/u;
const TX_RE = /^[\w:.-]{6,48}$/;

const DIRS: NetDir[] = ['down', 'up', 'left', 'right'];
const ABANDON_DELAY = 60_000;
export const REPORT_RETENTION = 365 * 86_400_000;
const IDLE_TIMEOUT = 40_000;

export interface ServerOptions { now?: () => number; rng?: () => number; name?: string }

export class GameServer {
  private numSeq = 0;
  private clients = new Set<Client>();
  private byAccount = new Map<string, Client>();
  private rooms = new Map<string, Set<Client>>();
  private maps = new Map<string, TileMap>();
  private cabins = new CabinRegistry();
  private abandonTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private roomChat = new Map<string, Array<{ id: string; name: string; text: string; at: number }>>();
  /** Derniers messages du chat global (contexte des signalements, historique à la connexion). */
  private globalChat: Array<{ id: string; name: string; text: string; at: number }> = [];
  private authLimiter = new RateLimiter(12, 60_000);
  private reportLimiter = new RateLimiter(5, 600_000);
  private friendLimiter = new RateLimiter(10, 60_000);
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private dmLimiter = new RateLimiter(30, 60_000);
  private giftLimiter = new RateLimiter(12, 60_000);
  private ringLimiter = new RateLimiter(6, 60_000);
  private tableLimiter = new RateLimiter(40, 10_000);
  /** Sonnettes en attente (`visiteur>propriétaire` → échéance) et invitations acceptées (`propriétaire|visiteur`). */
  private rings = new Map<string, number>();
  private permits = new Map<string, number>();
  /** Réponses déjà envoyées aux dons (rejeu d'un même identifiant de transaction). */
  private giftReplies = new Map<string, Extract<ServerMsg, { t: 'giftResult' }>>();
  readonly tables: TableManager;
  readonly now: () => number;
  private rng: () => number;
  readonly name: string;

  constructor(private store: Store, opts: ServerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? (() => randomInt(0, 2 ** 32) / 2 ** 32);
    this.name = opts.name ?? 'KingSea';
    for (const [cabin, account] of store.cabinOwners()) this.cabins.restore(account, cabin);
    this.tables = new TableManager({
      env: (seed) => ({ ...this.env(), seed, online: true }),
      withProfile: (id, fn) => this.withProfile(id, fn),
      send: (id, m) => { const o = this.byAccount.get(id); if (o) this.send(o, m); },
      friendsOf: (id) => this.store.friends(id).map((f) => f.id),
      identity: (id) => { const pr = this.byAccount.get(id)?.profile ?? null; return pr ? { name: pr.name, look: sanitizeLook(pr.look), level: pr.progress?.level ?? 1 } : this.offlineIdentity(id); },
    }, this.now);
  }

  private idCache = new Map<string, { name: string; look: ReturnType<typeof sanitizeLook>; level: number }>();
  private offlineIdentity(id: string) {
    let v = this.idCache.get(id);
    if (!v) { const pr = this.store.profile(id); if (!pr) return null; v = { name: pr.name, look: sanitizeLook(pr.look), level: pr.progress?.level ?? 1 }; this.idCache.set(id, v); if (this.idCache.size > 500) this.idCache.delete(this.idCache.keys().next().value as string); }
    return v;
  }

  /** Exécute `fn` sur le profil d'un joueur (connecté : profil vivant ; sinon chargé puis enregistré). */
  withProfile<T>(id: string, fn: (p: AuthState) => T): T | null {
    const live = this.byAccount.get(id)?.profile;
    const p = live ?? this.store.profile(id);
    if (!p) return null;
    const r = fn(p);
    this.store.save(p);
    return r;
  }

  start(): void {
    this.timers.push(setInterval(() => this.broadcastSnapshots(), 100));
    this.timers.push(setInterval(() => this.reapIdle(), 5000));
    this.timers.push(setInterval(() => this.tables.tick(), 100));
    // Signalements conservés 12 mois au plus (politique de confidentialité)
    const purge = () => this.store.purgeReports(this.now() - REPORT_RETENTION);
    purge(); this.timers.push(setInterval(purge, 6 * 3600_000));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    for (const t of this.abandonTimers.values()) clearTimeout(t);
    this.timers = [];
    // Manches de table pas encore tirées : mises rendues avant l'arrêt
    this.tables.shutdown();
    for (const c of [...this.clients]) c.sock.close(1001, 'arrêt du serveur');
  }

  get online(): number { return [...this.clients].filter((c) => c.profile).length; }

  // ---------------------------------------------------------------- connexions
  connect(sock: Sock): Client {
    const c: Client = { sock, profile: null, token: null, room: null, floor: null, pos: { x: 0, y: 0, t: this.now(), dir: 'down', anim: 'idle' }, moved: false, chat: new ChatLimiter(), replies: new Map(), lastSeen: this.now(), lastEmote: 0, lastGlobal: 0, blocked: new Set(), num: ++this.numSeq, visiting: null, dm: new ChatLimiter() };
    this.clients.add(c);
    return c;
  }

  disconnect(c: Client): void {
    if (!this.clients.has(c)) return;
    this.clients.delete(c);
    this.leaveRoom(c);
    const p = c.profile;
    if (p && this.byAccount.get(p.id) === c) {
      // Table du casino : la place est libérée (mises non distribuées rendues, main en cours jouée selon la règle)
      this.tables.disconnect(p.id);
      this.byAccount.delete(p.id);
      this.evictVisitors(p.id, 'Ton hôte a quitté le navire : retour au couloir des cabines.');
      this.store.save(p);
      // Les amis connectés voient le changement de statut
      for (const f of this.store.friends(p.id)) this.pushFriends(f.id);
      // Manche abandonnée : réglée selon la règle de table si le joueur ne revient pas vite
      if (activeSessions(p).length) {
        const id = p.id;
        this.abandonTimers.set(id, setTimeout(() => { this.abandonTimers.delete(id); this.settleOffline(id); }, ABANDON_DELAY));
      }
    }
  }

  private settleOffline(accountId: string): void {
    if (this.byAccount.has(accountId)) return;
    const p = this.store.profile(accountId);
    if (!p) return;
    for (const s of activeSessions(p)) abandonSession(p, s.game, this.env());
    this.store.save(p);
  }

  private send(c: Client, m: ServerMsg): void { try { c.sock.send(JSON.stringify(m)); } catch { /* socket fermée */ } }

  private env() { return { rng: this.rng, now: this.now(), day: dayKey(new Date(this.now())) }; }

  message(c: Client, raw: string): void {
    c.lastSeen = this.now();
    if (typeof raw !== 'string') return;
    if (raw.length > 8000) { c.sock.close(1009, 'message trop long'); return; }
    let m: ClientMsg;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return;
    try { this.dispatch(c, m); } catch (e) { console.error('[KingSea serveur]', e); }
  }

  private dispatch(c: Client, m: ClientMsg): void {
    switch (m.t) {
      case 'ping': this.send(c, { t: 'pong' }); return;
      case 'hello': {
        if (m.v !== PROTOCOL_VERSION) { this.send(c, { t: 'kicked', msg: 'Version du jeu trop ancienne : mets l’application à jour.' }); c.sock.close(4000, 'version'); return; }
        const acc = typeof m.token === 'string' ? this.store.tokenAccount(m.token) : null;
        if (acc && m.token) { if (this.refuseBanned(c, acc)) return; this.login(c, acc, m.token); return; }
        this.send(c, { t: 'hello', v: PROTOCOL_VERSION, server: this.name, needAuth: true });
        return;
      }
      case 'register': return this.register(c, m);
      case 'login': {
        if (!this.authLimiter.allow(`ip:${c.sock.ip}`, this.now()) || !this.authLimiter.allow(`name:${String(m.name).toLowerCase()}`, this.now())) { this.send(c, { t: 'authError', msg: 'Trop de tentatives, réessaie dans une minute.' }); return; }
        const cred = typeof m.name === 'string' ? this.store.credentials(m.name.trim()) : null;
        if (!cred || typeof m.password !== 'string' || !verifyPassword(m.password, cred.salt, cred.hash)) { this.send(c, { t: 'authError', msg: 'Pseudo ou mot de passe incorrect.' }); return; }
        if (this.refuseBanned(c, cred.id)) return;
        const token = newToken();
        this.store.createToken(cred.id, token, this.now());
        this.login(c, cred.id, token);
        return;
      }
    }
    const p = c.profile;
    if (!p) { this.send(c, { t: 'authError', msg: 'Connecte-toi d’abord.' }); return; }
    switch (m.t) {
      case 'logout': if (c.token) this.store.deleteToken(c.token); c.sock.close(1000, 'déconnexion'); return;
      case 'look': {
        ensureProgress(p);
        ensureEconomy(p);
        // Seuls les vêtements obtenus (récompenses de niveau, achats en boutique) peuvent être portés
        p.look = enforceUnlocks(sanitizeLook(m.look), [...p.progress!.unlocks, ...Object.keys(p.inventory!.items)]); this.store.save(p);
        if (c.room) this.toRoom(c.room, { t: 'look', id: p.id, look: p.look, name: p.name });
        return;
      }
      case 'join': return this.join(c, m.floor, m.x, m.y, m.cabin);
      case 'move': return this.move(c, m);
      case 'emote': {
        if (!c.room || typeof m.e !== 'string' || !EMOTE_BY_ID.has(m.e) || this.now() - c.lastEmote < 800) return;
        ensureProgress(p);
        // Emotes de niveau ou du pass : seulement celles débloquées par le joueur
        if (!emoteUnlocked(m.e, p.progress!.unlocks)) { this.send(c, { t: 'notice', msg: 'Emote pas encore débloquée.' }); return; }
        c.lastEmote = this.now();
        this.toRoom(c.room, { t: 'emote', id: p.id, e: m.e }, c, p.id);
        return;
      }
      case 'chat': {
        const sc = this.store.sanction(p.id);
        if (sc && sc.muteUntil > this.now()) { this.send(c, { t: 'chatError', msg: `Chat suspendu par la modération ${until(sc.muteUntil, this.now())}.` }); return; }
        const scope: ChatScope = m.scope === 'global' ? 'global' : 'near';
        if (scope === 'near' && !c.room) return;
        if (scope === 'global') {
          ensureProgress(p);
          if (p.progress!.level < GLOBAL_CHAT_LEVEL) { this.send(c, { t: 'chatError', msg: `Chat global : à partir du niveau ${GLOBAL_CHAT_LEVEL}. Le chat de proximité reste ouvert.` }); return; }
          const wait = c.lastGlobal + GLOBAL_CHAT_COOLDOWN - this.now();
          if (wait > 0) { this.send(c, { t: 'chatError', msg: `Chat global : attends encore ${Math.ceil(wait / 1000)} s.` }); return; }
        }
        const r = c.chat.check(m.text, this.now());
        if (!r.ok) { this.send(c, { t: 'chatError', msg: r.reason }); return; }
        const msg = { id: p.id, name: p.name, text: r.text, at: this.now() };
        if (scope === 'global') {
          c.lastGlobal = this.now();
          this.globalChat.push(msg); if (this.globalChat.length > 40) this.globalChat.shift();
          for (const o of this.clients) if (o.profile && !o.blocked.has(p.id)) this.send(o, { t: 'chat', ...msg, scope });
        } else {
          const room = c.room!;
          const log = this.roomChat.get(room) ?? []; log.push(msg); if (log.length > 40) log.shift(); this.roomChat.set(room, log);
          // Proximité : seuls les joueurs à portée de voix (et l'expéditeur) reçoivent le message
          for (const o of this.rooms.get(room) ?? []) {
            if (!o.profile || o.blocked.has(p.id)) continue;
            if (o !== c && Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) > CHAT_NEAR_RADIUS) continue;
            this.send(o, { t: 'chat', ...msg, scope });
          }
        }
        refreshMissions(p, this.env(), p.id, true); missionEvent(p, 'chat', this.env()); this.store.save(p);
        return;
      }
      case 'req': {
        const req = parseRequest(m.req);
        if (!req) { this.send(c, { t: 'res', id: String((m.req as { id?: unknown })?.id ?? ''), reply: { ok: false, error: 'Requête invalide', balance: p.wallet.balance } }); return; }
        // Même requête renvoyée après une coupure : même réponse, rien n'est rejoué
        const cached = c.replies.get(req.id);
        if (cached) { this.send(c, { t: 'res', id: req.id, reply: cached }); return; }
        // Réception : la cabine est attribuée (si besoin) avant la remise de sa clé avec le KS Pass
        const giftCabin = req.kind === 'purser' && req.action === 'gift' && !p.cabin.id ? this.assignCabin(p) : null;
        const reply = handle(p, req, { ...this.env(), seed: p.id, online: true });
        this.store.save(p);
        if (giftCabin) this.send(c, { t: 'cabin', id: p.cabin.id, wallColor: p.cabin.wallColor });
        c.replies.set(req.id, reply);
        // Machines (banc partagé) : les voisins voient le résultat, jamais la mise d'avant tirage
        if (reply.ok && req.kind === 'casino' && reply.done && reply.stake + reply.payout > 0) this.tables.personalResult(p.id, req.game, reply.payout - reply.stake, GAME_LABELS[req.game] ?? req.game);
        if (c.replies.size > 60) c.replies.delete(c.replies.keys().next().value as string);
        this.send(c, { t: 'res', id: req.id, reply });
        return;
      }
      case 'cabin': {
        const id = p.cabin.id ?? this.assignCabin(p);
        this.send(c, { t: 'cabin', id, wallColor: p.cabin.wallColor });
        return;
      }
      case 'cabinColor': {
        if (Number.isInteger(m.color) && m.color >= 0 && m.color <= 3) { p.cabin.wallColor = m.color; this.store.save(p); }
        this.send(c, { t: 'cabin', id: p.cabin.id, wallColor: p.cabin.wallColor });
        return;
      }
      case 'players': {
        const list = [...this.byAccount.values()].filter((x) => x.profile).map((x) => ({ id: x.profile!.id, name: x.profile!.name, floor: x.floor ?? 'hub', look: sanitizeLook(x.profile!.look) }));
        this.send(c, { t: 'players', list });
        return;
      }
      case 'friends': this.sendFriends(c); return;
      case 'friendAdd': return this.friendAdd(c, m.query);
      case 'friendAnswer': {
        if (typeof m.id !== 'string') return;
        const has = this.store.friendRequests(p.id).incoming.some((r) => r.from === m.id);
        if (!has) { this.send(c, { t: 'friendResult', ok: false, msg: 'Cette demande n’existe plus.' }); return; }
        if (m.accept) {
          if (this.store.friends(p.id).length >= MAX_FRIENDS) { this.send(c, { t: 'friendResult', ok: false, msg: `Liste d’amis pleine (${MAX_FRIENDS}).` }); return; }
          this.makeFriends(p.id, m.id);
          this.send(c, { t: 'friendResult', ok: true, msg: 'Vous êtes maintenant amis.' });
        } else {
          this.store.deleteFriendRequest(m.id, p.id);
          this.send(c, { t: 'friendResult', ok: true, msg: 'Demande refusée.' });
        }
        this.sendFriends(c); this.pushFriends(m.id);
        return;
      }
      case 'friendCancel': {
        if (typeof m.id !== 'string') return;
        this.store.deleteFriendRequest(p.id, m.id);
        this.sendFriends(c); this.pushFriends(m.id);
        return;
      }
      case 'friendRemove': {
        if (typeof m.id !== 'string') return;
        this.store.removeFriendship(p.id, m.id);
        this.send(c, { t: 'friendResult', ok: true, msg: 'Ami retiré.' });
        this.sendFriends(c); this.pushFriends(m.id);
        return;
      }
      case 'block': {
        if (typeof m.id !== 'string' || m.id === p.id || !this.store.profile(m.id)) return;
        this.store.setBlock(p.id, m.id, m.on === true);
        if (m.on) c.blocked.add(m.id); else c.blocked.delete(m.id);
        this.send(c, { t: 'notice', msg: m.on ? 'Joueur bloqué : tu ne verras plus ses messages ni ses emotes.' : 'Joueur débloqué.' });
        return;
      }
      case 'password': {
        if (!this.authLimiter.allow(`pw:${p.id}`, this.now())) { this.send(c, { t: 'account', op: 'password', ok: false, msg: 'Trop de tentatives, réessaie dans une minute.' }); return; }
        const cred = this.store.credentials(p.name);
        if (!cred || typeof m.old !== 'string' || !verifyPassword(m.old, cred.salt, cred.hash)) { this.send(c, { t: 'account', op: 'password', ok: false, msg: 'Mot de passe actuel incorrect.' }); return; }
        const err = checkPassword(m.next);
        if (err) { this.send(c, { t: 'account', op: 'password', ok: false, msg: err }); return; }
        this.store.setPassword(p.id, hashPassword(m.next));
        this.store.deleteTokensOf(p.id, c.token ?? undefined); // les autres appareils devront se reconnecter
        this.send(c, { t: 'account', op: 'password', ok: true, msg: 'Mot de passe modifié. Les autres appareils sont déconnectés.' });
        return;
      }
      case 'deleteAccount': {
        if (!this.authLimiter.allow(`del:${p.id}`, this.now())) { this.send(c, { t: 'account', op: 'delete', ok: false, msg: 'Trop de tentatives, réessaie dans une minute.' }); return; }
        const cred = this.store.credentials(p.name);
        if (!cred || typeof m.password !== 'string' || !verifyPassword(m.password, cred.salt, cred.hash)) { this.send(c, { t: 'account', op: 'delete', ok: false, msg: 'Mot de passe incorrect.' }); return; }
        this.deleteAccount(p.id);
        this.send(c, { t: 'account', op: 'delete', ok: true, msg: 'Ton compte et toutes ses données ont été supprimés.' });
        c.sock.close(1000, 'compte supprimé');
        return;
      }
      case 'report': {
        const target = typeof m.id === 'string' ? this.store.profile(m.id) : null;
        if (!target || target.id === p.id) return;
        if (!this.reportLimiter.allow(p.id, this.now())) { this.send(c, { t: 'notice', msg: 'Trop de signalements récents.' }); return; }
        const context = JSON.stringify([...(this.roomChat.get(c.room ?? '') ?? []), ...this.globalChat].filter((x) => x.id === target.id).sort((x, y) => x.at - y.at).slice(-10));
        this.store.addReport({ reporter: p.id, target: target.id, reason: cleanMessage(String(m.reason ?? '')).slice(0, 200) || 'non précisé', context, at: this.now() });
        this.send(c, { t: 'notice', msg: `Signalement de ${target.name} envoyé à la modération. Merci.` });
        return;
      }
      // ---------------------------------------------------------------- tables du casino
      case 'tableJoin': {
        if (typeof m.game !== 'string' || !TableManager.known(m.game)) { this.send(c, { t: 'tableError', msg: 'Jeu inconnu' }); return; }
        if (!this.tableLimiter.allow(`j:${p.id}`, this.now())) return;
        const r = this.tables.join(p.id, m.game, { tier: m.tier, instance: m.instance, friend: m.friend });
        if (!r.ok) { this.send(c, { t: 'tableError', msg: r.msg }); return; }
        if (r.note) this.send(c, { t: 'notice', msg: r.note });
        return;
      }
      case 'tableLeave': this.tables.leave(p.id); this.send(c, { t: 'tableLeft' }); return;
      case 'tableList': {
        if (typeof m.game !== 'string' || !TableManager.known(m.game)) return;
        this.send(c, { t: 'tableList', game: m.game, tables: this.tables.list(m.game, p.id, typeof m.tier === 'string' ? m.tier : null), friends: this.tables.friendsTables(p.id) });
        return;
      }
      case 'tableBet': case 'tableAct': {
        if (typeof m.id !== 'string' || !TX_RE.test(m.id)) return;
        const cached = c.replies.get(m.id);
        if (cached) { this.send(c, { t: 'res', id: m.id, reply: cached }); return; }
        if (!this.tableLimiter.allow(p.id, this.now())) { this.send(c, { t: 'res', id: m.id, reply: { ok: false, error: 'Trop d’actions : un instant', balance: p.wallet.balance } }); return; }
        const reply = m.t === 'tableBet' ? this.tables.bet(p.id, m.bet, m.id) : this.tables.act(p.id, m.act, m.id);
        if (!reply.ok && !reply.balance) (reply as { balance: number }).balance = p.wallet.balance;
        this.store.save(p);
        c.replies.set(m.id, reply);
        if (c.replies.size > 60) c.replies.delete(c.replies.keys().next().value as string);
        this.send(c, { t: 'res', id: m.id, reply });
        return;
      }
      // ---------------------------------------------------------------- téléphone : messages privés
      case 'dmList': this.sendDmList(c); return;
      case 'dmHistory': {
        if (typeof m.with !== 'string') return;
        const before = typeof m.before === 'number' && Number.isInteger(m.before) ? m.before : null;
        const rows = this.store.messages(p.id, m.with, before, 41);
        const more = rows.length > 40;
        this.send(c, { t: 'dmHistory', with: m.with, msgs: rows.slice(more ? 1 : 0).map((x) => ({ ...x })), more });
        return;
      }
      case 'dmSend': return this.dmSend(c, m.to, m.text, typeof m.nonce === 'string' ? m.nonce.slice(0, 40) : undefined);
      case 'dmRead': {
        if (typeof m.with !== 'string') return;
        this.store.markRead(p.id, m.with);
        this.sendDmList(c);
        return;
      }
      case 'dmDelete': {
        if (typeof m.with !== 'string') return;
        this.store.clearConversation(p.id, m.with);
        this.sendDmList(c);
        return;
      }
      case 'contact': {
        if (typeof m.id !== 'string' || m.id === p.id || !this.store.friends(p.id).some((f) => f.id === m.id)) { this.send(c, { t: 'notice', msg: 'Seuls tes amis peuvent être enregistrés comme contacts.' }); return; }
        const cur = this.store.contacts(p.id).find((x) => x.id === m.id);
        let nick = cur?.nick ?? null;
        if (m.nick !== undefined) {
          const t = typeof m.nick === 'string' ? m.nick.replace(/\s+/g, ' ').trim() : '';
          if (t && !NICK_RE.test(t)) { this.send(c, { t: 'notice', msg: 'Surnom invalide (1 à 20 lettres ou chiffres).' }); return; }
          nick = t ? cleanMessage(t).slice(0, 20) : null;
        }
        const fav = typeof m.fav === 'boolean' ? m.fav : cur?.fav ?? false;
        this.store.setContact(p.id, m.id, nick, fav);
        this.send(c, { t: 'contacts', list: this.store.contacts(p.id) });
        this.sendDmList(c);
        return;
      }
      // ---------------------------------------------------------------- dons entre amis
      case 'gift': return this.gift(c, m.to, m.gift, m.tx);
      case 'giftInfo': {
        const names = new Map<string, string>();
        const nameOf = (id: string) => { if (!names.has(id)) names.set(id, id === 'compte-supprimé' ? 'compte supprimé' : this.offlineIdentity(id)?.name ?? '?'); return names.get(id)!; };
        const history = this.store.transfers(p.id, 30).map((t) => ({ id: t.id, from: t.from, to: t.to, fromName: nameOf(t.from), toName: nameOf(t.to), kind: t.kind, amount: t.amount, item: t.item, label: t.label, at: t.at }));
        this.send(c, { t: 'giftInfo', allowance: this.allowance(p), history });
        return;
      }
      // ---------------------------------------------------------------- visites de cabine
      case 'visitAsk': return this.visitAsk(c, m.to);
      case 'visitAnswer': {
        if (typeof m.from !== 'string') return;
        const key = `${m.from}>${p.id}`, due = this.rings.get(key);
        this.rings.delete(key);
        const v = this.byAccount.get(m.from);
        if (!due || due < this.now()) { this.send(c, { t: 'notice', msg: 'Ce coup de sonnette a expiré.' }); return; }
        if (!m.accept) { if (v) this.send(v, { t: 'visitReply', ok: false, msg: `${p.name} ne peut pas te recevoir pour le moment.` }); return; }
        if (!v) { this.send(c, { t: 'notice', msg: 'Ton visiteur s’est déconnecté.' }); return; }
        this.permits.set(`${p.id}|${m.from}`, this.now() + VISIT_PERMIT_MS);
        this.send(v, { t: 'visitReply', ok: true, msg: `${p.name} t’ouvre la porte : bienvenue !`, owner: p.id });
        this.send(c, { t: 'notice', msg: `${v.profile?.name ?? 'Ton visiteur'} arrive.` });
        return;
      }
      case 'visitKick': {
        if (typeof m.id !== 'string' || !p.cabin.id) return;
        const v = this.byAccount.get(m.id);
        this.permits.delete(`${p.id}|${m.id}`);
        if (v && v.visiting === p.id) { this.send(v, { t: 'evict', msg: `${p.name} t’a raccompagné à la porte.` }); this.leaveRoom(v); }
        this.sendVisitors(p.id);
        return;
      }
      case 'door': {
        p.flags['cabin.closed'] = m.open === false;
        if (!m.open) { for (const k of [...this.permits.keys()]) if (k.startsWith(`${p.id}|`)) this.permits.delete(k); this.evictVisitors(p.id, `${p.name} a fermé sa porte à clé.`); }
        this.store.save(p);
        this.sendVisitors(p.id);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- téléphone
  private isFriend(a: string, b: string): boolean { return this.store.friends(a).some((f) => f.id === b); }
  private blockedEither(a: string, b: string): boolean { return this.store.blocks(a).includes(b) || this.store.blocks(b).includes(a); }

  private dmConversations(id: string): { convs: DmConversation[]; unread: number } {
    const contacts = new Map(this.store.contacts(id).map((x) => [x.id, x]));
    const convs: DmConversation[] = this.store.conversations(id).map((x) => {
      const who = this.byAccount.get(x.with)?.profile ?? null;
      const ident = who ? { name: who.name, look: sanitizeLook(who.look) } : this.offlineIdentity(x.with);
      const ct = contacts.get(x.with);
      return { with: x.with, name: ident?.name ?? 'compte supprimé', look: ident?.look, online: !!who, last: x.last as DmMessage, unread: x.unread, nick: ct?.nick ?? null, fav: ct?.fav ?? false };
    });
    return { convs, unread: convs.reduce((a, x) => a + x.unread, 0) };
  }
  private sendDmList(c: Client): void { if (c.profile) this.send(c, { t: 'dmList', ...this.dmConversations(c.profile.id) }); }

  private dmSend(c: Client, to: unknown, text: unknown, nonce?: string): void {
    const p = c.profile!;
    const err = (msg: string) => this.send(c, { t: 'dmError', msg, nonce });
    if (typeof to !== 'string' || to === p.id) return err('Destinataire invalide');
    if (!this.isFriend(p.id, to)) return err('Les messages privés sont réservés à tes amis.');
    if (this.blockedEither(p.id, to)) return err('Impossible d’écrire à ce joueur.');
    const sc = this.store.sanction(p.id);
    if (sc && sc.muteUntil > this.now()) return err(`Messages suspendus par la modération ${until(sc.muteUntil, this.now())}.`);
    if (!this.dmLimiter.allow(p.id, this.now())) return err('Trop de messages : patiente une minute.');
    if (typeof text !== 'string' || text.length > DM_MAX * 2) return err('Message trop long');
    const r = c.dm.check(text.slice(0, DM_MAX), this.now());
    if (!r.ok) return err(r.reason);
    const row = this.store.addMessage(p.id, to, r.text, this.now());
    this.send(c, { t: 'dm', msg: row, nonce, name: p.name });
    const o = this.byAccount.get(to);
    if (o) this.send(o, { t: 'dm', msg: row, name: p.name });
  }

  private allowance(p: AuthState): GiftAllowanceInfo {
    const a = giftAllowance(p, this.now());
    const rel = (t: number | null) => (t === null ? null : Math.max(0, t - this.now()));
    return { coinsLeft: a.coinsLeft, itemsLeft: a.itemsLeft, coinsIn: rel(a.coinsFreeAt), itemsIn: rel(a.itemsFreeAt) };
  }

  /** Don à un ami : vérifié et appliqué par l'autorité sur les deux profils, enregistré en une transaction. */
  private gift(c: Client, to: unknown, payload: unknown, tx: unknown): void {
    const p = c.profile!;
    const txs = typeof tx === 'string' && TX_RE.test(tx) ? tx : '';
    const done = (ok: boolean, msg: string, reply?: AuthReply) => {
      const r = { t: 'giftResult' as const, ok, msg, tx: txs, reply, allowance: this.allowance(p) };
      if (txs) { this.giftReplies.set(`${p.id}:${txs}`, r); if (this.giftReplies.size > 2000) this.giftReplies.delete(this.giftReplies.keys().next().value as string); }
      this.send(c, r);
    };
    if (!txs) { this.send(c, { t: 'giftResult', ok: false, msg: 'Requête invalide', tx: '', allowance: this.allowance(p) }); return; }
    // Même don renvoyé (coupure, double appui) : même réponse, rien n'est rejoué
    const again = this.giftReplies.get(`${p.id}:${txs}`);
    if (again) { this.send(c, again); return; }
    if (!this.giftLimiter.allow(p.id, this.now())) return done(false, 'Trop de dons d’affilée : patiente une minute.');
    if (typeof to !== 'string' || to === p.id) return done(false, 'Destinataire invalide');
    if (!this.isFriend(p.id, to)) return done(false, 'Les cadeaux ne s’envoient qu’à tes amis.');
    if (this.blockedEither(p.id, to)) return done(false, 'Impossible d’envoyer un cadeau à ce joueur.');
    const liveTo = this.byAccount.get(to);
    const dest = liveTo?.profile ?? this.store.profile(to);
    if (!dest) return done(false, 'Ce joueur n’existe plus.');
    const env = { ...this.env(), seed: p.id, online: true };
    const snapA = structuredClone(p), snapB = structuredClone(dest);
    let label = '', kind = '', amount = 0, item: string | null = null;
    const reply = transact(p, env, () => {
      const g = giveGift(p, dest, payload, `${p.id}:${txs}`, this.now());
      label = g.label; kind = g.kind; amount = g.amount; item = g.item ?? g.key?.uid ?? null;
      return { view: { gift: g.kind, label: g.label, to }, stake: 0, payout: 0, done: true };
    });
    if (!reply.ok) return done(false, reply.error, reply);
    // La clé reçue est vérifiée côté destinataire à la prochaine requête (version de serrure du propriétaire)
    try {
      this.store.saveMany([p, dest], { from: p.id, to, kind, amount, item, label, tx: `${p.id}:${txs}`, at: this.now() });
    } catch (e) {
      // Échec d'écriture : les deux profils reviennent à l'état d'avant (rien n'est perdu ni créé)
      console.error('[KingSea] don', e);
      for (const [live, snap] of [[p, snapA], [dest, snapB]] as const) { for (const k of Object.keys(live)) delete (live as unknown as Record<string, unknown>)[k]; Object.assign(live, snap); }
      return done(false, 'Le don n’a pas pu être enregistré : rien n’a été débité.');
    }
    const destEnv = { ...this.env(), seed: to, online: true };
    const destReply = transact(dest, destEnv, () => ({ view: { giftFrom: p.id, label }, stake: 0, payout: 0, done: true }));
    done(true, `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} envoyé${kind === 'coins' || kind === 'chips' ? 's' : ''} à ${dest.name}.`, reply);
    if (liveTo) {
      this.store.save(dest);
      this.send(liveTo, { t: 'giftIn', from: p.id, name: p.name, label, reply: destReply });
    }
  }

  // ---------------------------------------------------------------- visites
  private visitAsk(c: Client, to: unknown): void {
    const p = c.profile!;
    const no = (msg: string) => this.send(c, { t: 'visitReply', ok: false, msg });
    if (typeof to !== 'string' || to === p.id) return no('Choisis un ami à visiter.');
    if (!this.ringLimiter.allow(p.id, this.now())) return no('Tu as beaucoup sonné : patiente une minute.');
    if (!this.isFriend(p.id, to)) return no('Tu ne peux sonner que chez tes amis.');
    if (this.blockedEither(p.id, to)) return no('Visite impossible.');
    const owner = this.byAccount.get(to);
    const op = owner?.profile ?? this.store.profile(to);
    if (!op) return no('Ce joueur n’existe plus.');
    if (!op.cabin.id) return no(`${op.name} n’a pas encore de cabine.`);
    if (op.flags['cabin.closed']) return no(`${op.name} a fermé sa porte à clé : pas de visite pour le moment.`);
    if ((this.permits.get(`${to}|${p.id}`) ?? 0) > this.now()) { this.send(c, { t: 'visitReply', ok: true, msg: `${op.name} t’attend déjà.`, owner: to }); return; }
    if (!owner) return no(`${op.name} n’est pas à bord : reviens sonner quand ${op.name} sera en ligne (ou utilise un double de sa clé).`);
    if (this.tables.tableOf(to)) return no(`${op.name} est occupé(e) à une table du casino : réessaie un peu plus tard.`);
    this.rings.set(`${p.id}>${to}`, this.now() + VISIT_RING_MS);
    this.send(owner, { t: 'visitRing', from: p.id, name: p.name, look: sanitizeLook(p.look) });
    this.send(c, { t: 'visitReply', ok: true, msg: `Ding-dong ! Tu as sonné chez ${op.name}. En attente de réponse…` });
  }

  /** Attribue une cabine libre (une seule par passager) ; sa clé n'est remise qu'à la réception. */
  private assignCabin(p: ServerProfile): string | null {
    let id = this.cabins.assign(p.id);
    if (id && !this.store.setCabin(id, p.id)) { this.cabins.release(p.id); id = null; }
    if (id) { p.cabin.id = id; ensureMasterKey(p, p.id); this.store.save(p); }
    return id;
  }

  /** Accès à la cabine de `owner` pour `visitor` : propriétaire, invitation acceptée ou double de clé à jour. */
  private cabinAccess(visitor: AuthState & { id: string }, owner: string): { ok: true; cabin: string; prof: ServerProfile } | { ok: false; msg: string } {
    const live = this.byAccount.get(owner)?.profile;
    const op = live ?? this.store.profile(owner);
    if (!op || !op.cabin.id) return { ok: false, msg: 'Cette cabine n’existe pas.' };
    if (owner === visitor.id) return { ok: true, cabin: op.cabin.id, prof: op };
    if (op.flags['cabin.closed']) return { ok: false, msg: `${op.name} a fermé sa porte à clé.` };
    if (this.blockedEither(owner, visitor.id)) return { ok: false, msg: 'Accès refusé.' };
    if ((this.permits.get(`${owner}|${visitor.id}`) ?? 0) > this.now()) return { ok: true, cabin: op.cabin.id, prof: op };
    ensureEconomy(op); ensureMasterKey(op, op.id);
    ensureEconomy(visitor);
    const lock = op.keyring!.lock;
    if ((visitor.keys ?? []).some((k) => !k.master && keyOpens(k, op.cabin.id!, owner, lock))) return { ok: true, cabin: op.cabin.id, prof: op };
    return { ok: false, msg: `La porte de ${op.name} est fermée : sonne d’abord, ou utilise un double de clé valide.` };
  }

  private visitorsOf(owner: string): Client[] { return [...this.clients].filter((o) => o.visiting === owner && o.profile); }
  private sendVisitors(owner: string): void {
    const o = this.byAccount.get(owner);
    if (o?.profile) this.send(o, { t: 'visitors', list: this.visitorsOf(owner).map((v) => ({ id: v.profile!.id, name: v.profile!.name })), open: !o.profile.flags['cabin.closed'] });
  }
  private evictVisitors(owner: string, msg: string): void {
    for (const v of this.visitorsOf(owner)) { this.send(v, { t: 'evict', msg }); this.leaveRoom(v); }
  }

  private register(c: Client, m: Extract<ClientMsg, { t: 'register' }>): void {
    if (!this.authLimiter.allow(`ip:${c.sock.ip}`, this.now())) { this.send(c, { t: 'authError', msg: 'Trop de tentatives, réessaie dans une minute.' }); return; }
    const n = checkName(m.name);
    if (!n.ok) { this.send(c, { t: 'authError', msg: n.msg }); return; }
    const pwErr = checkPassword(m.password);
    if (pwErr) { this.send(c, { t: 'authError', msg: pwErr }); return; }
    if (m.terms !== TERMS_VERSION) { this.send(c, { t: 'authError', msg: 'Accepte les conditions d’utilisation et la politique de confidentialité pour créer un compte.' }); return; }
    const id = newAccountId();
    const profile: ServerProfile = {
      id, name: n.name, look: sanitizeLook(m.look ?? DEFAULT_LOOK), created: this.now(),
      wallet: { balance: STARTING_COINS, processedTx: [] }, stats: {}, flags: { 'profile.done': true }, dailyRewards: { lastWheelDay: null },
      sessions: {}, cabin: { id: null, wallColor: 0 }, location: { floorId: 'hub', x: 0, y: 0 }, termsVersion: TERMS_VERSION,
    };
    if (!this.store.createAccount(profile, hashPassword(m.password))) { this.send(c, { t: 'authError', msg: 'Ce pseudo est déjà pris.' }); return; }
    const token = newToken();
    this.store.createToken(id, token, this.now());
    this.login(c, id, token);
  }

  /** Compte banni : connexion refusée avec la durée restante. */
  private refuseBanned(c: Client, id: string): boolean {
    const s = this.store.sanction(id);
    if (!s || s.banUntil <= this.now()) return false;
    this.send(c, { t: 'kicked', msg: `Compte suspendu par la modération ${until(s.banUntil, this.now())}${s.reason ? ` (${s.reason})` : ''}.` });
    c.sock.close(4003, 'suspendu');
    return true;
  }

  /** Suppression définitive : données en base, cabine libérée, joueur retiré de l'étage et du chat. */
  deleteAccount(id: string): void {
    const live = this.byAccount.get(id);
    if (live) { this.leaveRoom(live); this.byAccount.delete(id); live.profile = null; }
    const t = this.abandonTimers.get(id); if (t) { clearTimeout(t); this.abandonTimers.delete(id); }
    this.cabins.release(id);
    for (const log of this.roomChat.values()) for (let i = log.length - 1; i >= 0; i--) if (log[i].id === id) log.splice(i, 1);
    for (let i = this.globalChat.length - 1; i >= 0; i--) if (this.globalChat[i].id === id) this.globalChat.splice(i, 1);
    this.store.deleteAccount(id);
  }

  /** Suppression depuis la page web (exigence Google Play) : pseudo + mot de passe, limité par adresse. */
  deleteByCredentials(name: unknown, password: unknown, ip: string): { ok: boolean; msg: string } {
    if (!this.authLimiter.allow(`webdel:${ip}`, this.now())) return { ok: false, msg: 'Trop de tentatives, réessaie dans une minute.' };
    const cred = typeof name === 'string' ? this.store.credentials(name.trim()) : null;
    if (!cred || typeof password !== 'string' || !verifyPassword(password, cred.salt, cred.hash)) return { ok: false, msg: 'Pseudo ou mot de passe incorrect.' };
    const live = this.byAccount.get(cred.id);
    if (live) { this.send(live, { t: 'kicked', msg: 'Ton compte a été supprimé.' }); live.sock.close(4004, 'supprimé'); }
    this.deleteAccount(cred.id);
    return { ok: true, msg: 'Ton compte et toutes ses données ont été supprimés.' };
  }

  /** Fiche de modération d'un compte. */
  accountInfo(name: string): Record<string, unknown> | null {
    const cred = this.store.credentials(name);
    const p = cred ? this.store.profile(cred.id) : null;
    if (!p) return null;
    return { id: p.id, name: p.name, created: new Date(p.created).toISOString(), online: this.byAccount.has(p.id), balance: p.wallet.balance, sanction: this.store.sanction(p.id), reportsAgainst: this.store.reports(500).filter((r) => r.target === p.id).length };
  }

  /** Modération (outil d'administration) : bannir et/ou rendre muet, en minutes (0 = lever). */
  sanction(name: string, opts: { banMinutes?: number; muteMinutes?: number; reason?: string }): { ok: true; id: string; sanction: { banUntil: number; muteUntil: number; reason: string } | null } | { ok: false; msg: string } {
    const cred = this.store.credentials(name);
    if (!cred) return { ok: false, msg: 'compte introuvable' };
    const now = this.now(), cur = this.store.sanction(cred.id) ?? { banUntil: 0, muteUntil: 0, reason: '' };
    const at = (min: number | undefined, prev: number) => min === undefined ? prev : min <= 0 ? 0 : now + Math.min(min, 60 * 24 * 365 * 10) * 60_000;
    const next = { banUntil: at(opts.banMinutes, cur.banUntil), muteUntil: at(opts.muteMinutes, cur.muteUntil), reason: (opts.reason ?? cur.reason).slice(0, 200) };
    const active = next.banUntil > now || next.muteUntil > now;
    this.store.setSanction(cred.id, active ? next : null);
    if (next.banUntil > now) {
      this.store.deleteTokensOf(cred.id);
      const live = this.byAccount.get(cred.id);
      if (live) { this.refuseBanned(live, cred.id); this.disconnect(live); }
    }
    return { ok: true, id: cred.id, sanction: active ? next : null };
  }

  private login(c: Client, accountId: string, token: string): void {
    // Une seule connexion par compte : l'ancienne est fermée (autre téléphone, reconnexion)
    const old = this.byAccount.get(accountId);
    const prev = old && old !== c ? old.profile : null;
    if (old && old !== c) { this.send(old, { t: 'kicked', msg: 'Connexion ouverte sur un autre appareil.' }); this.leaveRoom(old); old.profile = null; old.sock.close(4001, 'remplacé'); this.clients.delete(old); }
    const timer = this.abandonTimers.get(accountId);
    if (timer) { clearTimeout(timer); this.abandonTimers.delete(accountId); }
    const p = prev ?? this.store.profile(accountId);
    if (!p) { this.send(c, { t: 'authError', msg: 'Compte introuvable.' }); return; }
    p.sessions ??= {};
    c.profile = p; c.token = token;
    c.blocked = new Set(this.store.blocks(p.id));
    this.byAccount.set(accountId, c);
    // Manches d'une connexion précédente (application fermée) : réglées maintenant
    let notice: string | undefined;
    for (const s of activeSessions(p)) {
      const pay = abandonSession(p, s.game, this.env());
      notice = `Partie de ${GAME_LABELS[s.game] ?? s.game} interrompue terminée : ${pay > 0 ? `+${pay} jetons` : 'mise perdue'}.`;
    }
    this.store.save(p);
    this.send(c, { t: 'auth', token, profile: this.own(p, c), notice });
    for (const f of this.store.friends(p.id)) this.pushFriends(f.id);
    const log = this.globalChat.filter((x) => !c.blocked.has(x.id)).slice(-20);
    if (log.length) this.send(c, { t: 'chatLog', lines: log });
  }

  private own(p: ServerProfile, c: Client): OwnProfile {
    ensureProgress(p);
    refreshMissions(p, this.env(), p.id, true);
    ensureEconomy(p);
    ensureMasterKey(p, p.id);
    // Une reconnexion ne doit jamais faire chuter les jauges : le prochain relevé repart d'ici
    p.needs!.lastTick = this.now();
    this.store.save(p);
    return {
      id: p.id, name: p.name, look: p.look, wallet: { balance: p.wallet.balance }, stats: p.stats, flags: p.flags,
      dailyRewards: p.dailyRewards, cabin: p.cabin, location: { floorId: p.location.floorId }, blocked: [...c.blocked],
      progress: p.progress!, missions: p.missions ?? null, room: p.room!,
      chips: p.chips!.balance, inventory: { ...p.inventory!.items }, needs: { hunger: p.needs!.hunger, thirst: p.needs!.thirst },
      keys: (p.keys ?? []).map((k) => ({ ...k })), lock: p.keyring?.lock ?? 0, contacts: this.store.contacts(p.id),
    };
  }

  // ---------------------------------------------------------------- présence
  private mapFor(floor: string): TileMap | null {
    let m = this.maps.get(floor);
    if (!m) {
      const f = getFloor(floor);
      if (!f || !f.available || !f.map) return null;
      m = TileMap.fromFloor(f);
      this.maps.set(floor, m);
    }
    return m;
  }

  private pub(c: Client): PublicPlayer {
    const p = c.profile!;
    return { id: p.id, n: c.num, name: p.name, look: p.look, x: Math.round(c.pos.x), y: Math.round(c.pos.y), dir: c.pos.dir, anim: c.pos.anim };
  }

  private join(c: Client, floor: unknown, x: unknown, y: unknown, cabinOwner?: unknown): void {
    const p = c.profile!;
    if (typeof floor !== 'string') return;
    ensureProgress(p); ensureEconomy(p);
    // Ponts réservés : KS Pass Croisière (et niveau pour certains espaces), vérifiés par le serveur
    const acc = floorAccess(floor, p.inventory!.items, p.progress!.unlocks);
    if (!acc.ok) { this.send(c, { t: 'notice', msg: acc.reason }); return; }
    let room = floor;
    let visit: Extract<ServerMsg, { t: 'room' }>['visit'] = null;
    let owner: string | null = null;
    if (floor === 'cabin-interior') {
      owner = typeof cabinOwner === 'string' && cabinOwner ? cabinOwner : p.id;
      if (owner === p.id && !p.cabin.id) { this.send(c, { t: 'notice', msg: 'Tu n’as pas encore de cabine.' }); return; }
      // Sa propre cabine s'ouvre avec sa clé principale, remise à la réception (profils antérieurs : clé déjà détenue)
      if (owner === p.id) { ensureEconomy(p); ensureMasterKey(p, p.id); if (!(p.keys ?? []).some((k) => k.master)) { this.send(c, { t: 'evict', msg: 'Ta clé de cabine t’attend à la réception du hall.' }); return; } }
      const a = this.cabinAccess(p, owner);
      if (!a.ok) { this.send(c, { t: 'evict', msg: a.msg }); return; }
      room = `cabin:${a.cabin}`; // chaque cabine est une instance privée : son propriétaire et ses invités
      if (owner !== p.id) {
        ensureProgress(a.prof);
        visit = { owner, name: a.prof.name, room: a.prof.room!, wallColor: a.prof.cabin.wallColor, cabin: a.cabin };
        this.permits.delete(`${owner}|${p.id}`);
      }
    }
    const map = this.mapFor(floor);
    if (!map) return;
    const f = getFloor(floor)!;
    let px = typeof x === 'number' && Number.isFinite(x) ? x : (f.spawn?.x ?? 2) * TILE;
    let py = typeof y === 'number' && Number.isFinite(y) ? y : (f.spawn?.y ?? 2) * TILE;
    if (px < 0 || py < 0 || px > map.pixelWidth || py > map.pixelHeight || map.isSolidTile(Math.floor(px / TILE), Math.floor((py - 2) / TILE))) {
      px = (f.spawn?.x ?? 2) * TILE; py = (f.spawn?.y ?? 2) * TILE;
    }
    this.leaveRoom(c);
    c.room = room; c.floor = floor;
    c.visiting = owner && owner !== p.id ? owner : null;
    c.pos = { x: px, y: py, t: this.now(), dir: 'down', anim: 'idle' };
    let set = this.rooms.get(room);
    if (!set) { set = new Set(); this.rooms.set(room, set); }
    set.add(c);
    p.location = { floorId: floor, x: px, y: py };
    this.send(c, { t: 'room', floor, players: [...set].filter((o) => o !== c && o.profile).map((o) => this.pub(o)), visit });
    this.toRoom(room, { t: 'enter', p: this.pub(c) }, c);
    if (c.visiting) this.sendVisitors(c.visiting);
    else if (floor === 'cabin-interior') this.sendVisitors(p.id);
  }

  private leaveRoom(c: Client): void {
    if (!c.room) return;
    const set = this.rooms.get(c.room);
    set?.delete(c);
    if (c.profile) this.toRoom(c.room, { t: 'leave', id: c.profile.id }, c);
    if (set && !set.size) { this.rooms.delete(c.room); }
    const wasCabin = c.room.startsWith('cabin:');
    c.room = null;
    const host = c.visiting; c.visiting = null;
    if (host) this.sendVisitors(host);
    // Le propriétaire quitte sa cabine : ses invités sont raccompagnés (il garde le contrôle de l'accès)
    else if (wasCabin && c.profile) this.evictVisitors(c.profile.id, `${c.profile.name} est sorti(e) de sa cabine : retour au couloir.`);
  }

  private move(c: Client, m: Extract<ClientMsg, { t: 'move' }>): void {
    if (!c.room || !c.floor) return;
    const map = this.mapFor(c.floor);
    if (!map) return;
    const now = this.now();
    const v = validateMove(c.pos, m.x, m.y, now, map);
    if (!v.ok) { this.send(c, { t: 'correct', x: c.pos.x, y: c.pos.y }); c.pos.t = now; return; }
    c.pos = { x: m.x, y: m.y, t: now, dir: DIRS.includes(m.dir) ? m.dir : 'down', anim: NET_ANIMS.includes(m.anim) ? m.anim : 'idle' };
    c.moved = true;
    if (c.profile) c.profile.location = { floorId: c.floor, x: m.x, y: m.y };
  }

  // ---------------------------------------------------------------- amis
  private friendEntry(id: string, since: number): FriendEntry | null {
    const live = this.byAccount.get(id)?.profile;
    const prof = live ?? this.store.profile(id);
    if (!prof) return null;
    const online = !!live;
    const floor = online ? this.byAccount.get(id)!.floor : null;
    return { id, name: prof.name, level: prof.progress?.level ?? 1, title: prof.progress?.title ?? null, online, floor: floor === 'cabin-interior' ? 'cabin-interior' : floor, since, look: sanitizeLook(prof.look) };
  }

  private friendsData(id: string): FriendsData {
    const r = this.store.friendRequests(id);
    const list = (xs: Array<{ id: string; since: number }>) => xs.map((x) => this.friendEntry(x.id, x.since)).filter((x): x is FriendEntry => !!x);
    const friends = list(this.store.friends(id)).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return { code: this.store.friendCode(id), friends, incoming: list(r.incoming.map((x) => ({ id: x.from, since: x.at }))), outgoing: list(r.outgoing.map((x) => ({ id: x.to, since: x.at }))) };
  }

  private sendFriends(c: Client): void { if (c.profile) this.send(c, { t: 'friends', data: this.friendsData(c.profile.id) }); }
  /** Met à jour la liste d'un autre joueur s'il est connecté. */
  private pushFriends(id: string): void { const o = this.byAccount.get(id); if (o) this.sendFriends(o); }

  private makeFriends(a: string, b: string): void {
    this.store.addFriendship(a, b, this.now());
    for (const id of [a, b]) {
      const o = this.byAccount.get(id);
      const prof = o?.profile ?? this.store.profile(id);
      if (!prof) continue;
      refreshMissions(prof, this.env(), prof.id, true); missionEvent(prof, 'friend', this.env()); this.store.save(prof);
    }
  }

  private friendAdd(c: Client, raw: unknown): void {
    const p = c.profile!;
    if (!this.friendLimiter.allow(p.id, this.now())) { this.send(c, { t: 'friendResult', ok: false, msg: 'Trop de demandes : réessaie dans une minute.' }); return; }
    const query = typeof raw === 'string' ? raw.trim().slice(0, 24) : '';
    if (!query) { this.send(c, { t: 'friendResult', ok: false, msg: 'Indique un code ami ou un pseudo.' }); return; }
    const target = this.store.accountByCode(query) ?? this.store.credentials(query)?.id ?? null;
    if (!target) { this.send(c, { t: 'friendResult', ok: false, msg: 'Aucun joueur avec ce code ou ce pseudo.' }); return; }
    if (target === p.id) { this.send(c, { t: 'friendResult', ok: false, msg: 'C’est ton propre code.' }); return; }
    if (this.store.friends(p.id).some((f) => f.id === target)) { this.send(c, { t: 'friendResult', ok: false, msg: 'Vous êtes déjà amis.' }); return; }
    // Un joueur qui t'a bloqué (ou que tu as bloqué) ne peut pas recevoir de demande ; message neutre
    if (this.store.blocks(target).includes(p.id) || c.blocked.has(target)) { this.send(c, { t: 'friendResult', ok: false, msg: 'Impossible d’ajouter ce joueur.' }); return; }
    const mine = this.store.friendRequests(p.id);
    // Demande croisée : acceptation immédiate
    if (mine.incoming.some((r) => r.from === target)) {
      this.makeFriends(p.id, target);
      this.send(c, { t: 'friendResult', ok: true, msg: 'Vous êtes maintenant amis.' });
      this.sendFriends(c); this.pushFriends(target);
      return;
    }
    if (mine.outgoing.some((r) => r.to === target)) { this.send(c, { t: 'friendResult', ok: false, msg: 'Demande déjà envoyée.' }); return; }
    if (mine.outgoing.length >= MAX_PENDING) { this.send(c, { t: 'friendResult', ok: false, msg: `Trop de demandes en attente (${MAX_PENDING}).` }); return; }
    if (this.store.friends(p.id).length >= MAX_FRIENDS) { this.send(c, { t: 'friendResult', ok: false, msg: `Liste d’amis pleine (${MAX_FRIENDS}).` }); return; }
    this.store.addFriendRequest(p.id, target, this.now());
    const name = this.store.profile(target)?.name ?? 'ce joueur';
    this.send(c, { t: 'friendResult', ok: true, msg: `Demande envoyée à ${name}.` });
    this.sendFriends(c);
    const o = this.byAccount.get(target);
    if (o) { this.send(o, { t: 'notice', msg: `${p.name} veut devenir ton ami (menu Amis).` }); this.sendFriends(o); }
  }

  /** Envoie à tous les membres d'un salon (sauf `except`, et sauf ceux qui ont bloqué `from`). */
  private toRoom(room: string, msg: ServerMsg, except: Client | null = null, from?: string): void {
    const set = this.rooms.get(room);
    if (!set) return;
    const data = JSON.stringify(msg);
    for (const o of set) {
      if (o === except || !o.profile) continue;
      if (from && o.blocked.has(from)) continue;
      try { o.sock.send(data); } catch { /* fermée */ }
    }
  }

  broadcastSnapshots(): void {
    for (const [room, set] of this.rooms) {
      if (set.size < 2) { for (const c of set) c.moved = false; continue; }
      const moved = [...set].filter((c) => c.moved && c.profile);
      if (!moved.length) continue;
      const d: number[] = [];
      for (const c of moved) d.push(c.num, Math.round(c.pos.x), Math.round(c.pos.y), packPose(c.pos.dir, c.pos.anim));
      const data = JSON.stringify({ t: 'snap', d } satisfies ServerMsg);
      for (const c of set) { if (c.profile) try { c.sock.send(data); } catch { /* fermée */ } }
      for (const c of moved) c.moved = false;
      void room;
    }
  }

  private reapIdle(): void {
    const now = this.now();
    for (const c of [...this.clients]) if (now - c.lastSeen > IDLE_TIMEOUT) { c.sock.close(4002, 'inactif'); this.disconnect(c); }
  }

  /** Pour l'outil de modération et les tests. */
  get stats() { return { clients: this.clients.size, online: this.online, rooms: this.rooms.size, accounts: this.store.accountCount(), cabinsFree: CABIN_IDS.length - this.cabins.occupied }; }
}
