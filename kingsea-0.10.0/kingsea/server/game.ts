// Serveur de jeu KingSea (autoritaire) : comptes, présence par étage, synchronisation des déplacements,
// emotes, chat modéré, blocage, signalement, cabines, et économie exécutée par l'autorité partagée.
// Indépendant du transport : index.ts y branche des WebSockets, les tests des sockets factices.
import { randomInt } from 'node:crypto';
import { DEFAULT_LOOK, enforceUnlocks, sanitizeLook } from '../src/art/characters';
import { abandonSession, activeSessions, ensureEconomy, ensureProgress, handle, missionEvent, parseRequest, refreshMissions, type AuthReply } from '../src/authority';
import { GAME_LABELS } from '../src/games/logic/pending';
import { dayKey } from '../src/games/logic/rng';
import { CHAT_NEAR_RADIUS, GLOBAL_CHAT_COOLDOWN, GLOBAL_CHAT_LEVEL, MAX_FRIENDS, MAX_PENDING, NET_ANIMS, type FriendEntry, type FriendsData, packPose, PROTOCOL_VERSION, TERMS_VERSION, type ChatScope, type ClientMsg, type NetAnim, type NetDir, type OwnProfile, type PublicPlayer, type ServerMsg } from '../src/net/protocol';
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
}

/** « jusqu'au 23/10 à 21:40 » (heure du serveur). */
function until(t: number): string {
  if (t > Date.now() + 5 * 365 * 86_400_000) return 'définitivement';
  const d = new Date(t), p = (n: number) => String(n).padStart(2, '0');
  return `jusqu’au ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}:${p(d.getMinutes())}`;
}

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
  readonly now: () => number;
  private rng: () => number;
  readonly name: string;

  constructor(private store: Store, opts: ServerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? (() => randomInt(0, 2 ** 32) / 2 ** 32);
    this.name = opts.name ?? 'KingSea';
    for (const [cabin, account] of store.cabinOwners()) this.cabins.restore(account, cabin);
  }

  start(): void {
    this.timers.push(setInterval(() => this.broadcastSnapshots(), 100));
    this.timers.push(setInterval(() => this.reapIdle(), 5000));
    // Signalements conservés 12 mois au plus (politique de confidentialité)
    const purge = () => this.store.purgeReports(this.now() - REPORT_RETENTION);
    purge(); this.timers.push(setInterval(purge, 6 * 3600_000));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    for (const t of this.abandonTimers.values()) clearTimeout(t);
    this.timers = [];
    for (const c of [...this.clients]) c.sock.close(1001, 'arrêt du serveur');
  }

  get online(): number { return [...this.clients].filter((c) => c.profile).length; }

  // ---------------------------------------------------------------- connexions
  connect(sock: Sock): Client {
    const c: Client = { sock, profile: null, token: null, room: null, floor: null, pos: { x: 0, y: 0, t: this.now(), dir: 'down', anim: 'idle' }, moved: false, chat: new ChatLimiter(), replies: new Map(), lastSeen: this.now(), lastEmote: 0, lastGlobal: 0, blocked: new Set(), num: ++this.numSeq };
    this.clients.add(c);
    return c;
  }

  disconnect(c: Client): void {
    if (!this.clients.has(c)) return;
    this.clients.delete(c);
    this.leaveRoom(c);
    const p = c.profile;
    if (p && this.byAccount.get(p.id) === c) {
      this.byAccount.delete(p.id);
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
      case 'join': return this.join(c, m.floor, m.x, m.y);
      case 'move': return this.move(c, m);
      case 'emote': {
        if (!c.room || !['wave', 'clap', 'dance', 'heart'].includes(m.e) || this.now() - c.lastEmote < 800) return;
        c.lastEmote = this.now();
        this.toRoom(c.room, { t: 'emote', id: p.id, e: m.e }, c, p.id);
        return;
      }
      case 'chat': {
        const sc = this.store.sanction(p.id);
        if (sc && sc.muteUntil > this.now()) { this.send(c, { t: 'chatError', msg: `Chat suspendu par la modération ${until(sc.muteUntil)}.` }); return; }
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
        const reply = handle(p, req, { ...this.env(), seed: p.id, online: true });
        this.store.save(p);
        c.replies.set(req.id, reply);
        if (c.replies.size > 60) c.replies.delete(c.replies.keys().next().value as string);
        this.send(c, { t: 'res', id: req.id, reply });
        return;
      }
      case 'cabin': {
        let id = p.cabin.id;
        if (!id) {
          id = this.cabins.assign(p.id);
          if (id && !this.store.setCabin(id, p.id)) { this.cabins.release(p.id); id = null; }
          if (id) { p.cabin.id = id; this.store.save(p); }
        }
        this.send(c, { t: 'cabin', id, wallColor: p.cabin.wallColor });
        return;
      }
      case 'cabinColor': {
        if (Number.isInteger(m.color) && m.color >= 0 && m.color <= 3) { p.cabin.wallColor = m.color; this.store.save(p); }
        this.send(c, { t: 'cabin', id: p.cabin.id, wallColor: p.cabin.wallColor });
        return;
      }
      case 'players': {
        const list = [...this.byAccount.values()].filter((x) => x.profile).map((x) => ({ id: x.profile!.id, name: x.profile!.name, floor: x.floor ?? 'hub' }));
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
    }
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
    this.send(c, { t: 'kicked', msg: `Compte suspendu par la modération ${until(s.banUntil)}${s.reason ? ` (${s.reason})` : ''}.` });
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
      notice = `Partie de ${GAME_LABELS[s.game] ?? s.game} interrompue terminée : ${pay > 0 ? `+${pay} KSCoins` : 'mise perdue'}.`;
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
    // Une reconnexion ne doit jamais faire chuter les jauges : le prochain relevé repart d'ici
    p.needs!.lastTick = this.now();
    this.store.save(p);
    return {
      id: p.id, name: p.name, look: p.look, wallet: { balance: p.wallet.balance }, stats: p.stats, flags: p.flags,
      dailyRewards: p.dailyRewards, cabin: p.cabin, location: { floorId: p.location.floorId }, blocked: [...c.blocked],
      progress: p.progress!, missions: p.missions ?? null, room: p.room!,
      chips: p.chips!.balance, inventory: { ...p.inventory!.items }, needs: { hunger: p.needs!.hunger, thirst: p.needs!.thirst },
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

  private join(c: Client, floor: unknown, x: unknown, y: unknown): void {
    const p = c.profile!;
    if (typeof floor !== 'string') return;
    let room = floor;
    if (floor === 'cabin-interior') {
      if (!p.cabin.id) { this.send(c, { t: 'notice', msg: 'Tu n’as pas encore de cabine.' }); return; }
      room = `cabin:${p.cabin.id}`; // chaque cabine est privée : son propriétaire y est seul
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
    c.pos = { x: px, y: py, t: this.now(), dir: 'down', anim: 'idle' };
    let set = this.rooms.get(room);
    if (!set) { set = new Set(); this.rooms.set(room, set); }
    set.add(c);
    p.location = { floorId: floor, x: px, y: py };
    this.send(c, { t: 'room', floor, players: [...set].filter((o) => o !== c && o.profile).map((o) => this.pub(o)) });
    this.toRoom(room, { t: 'enter', p: this.pub(c) }, c);
  }

  private leaveRoom(c: Client): void {
    if (!c.room) return;
    const set = this.rooms.get(c.room);
    set?.delete(c);
    if (c.profile) this.toRoom(c.room, { t: 'leave', id: c.profile.id }, c);
    if (set && !set.size) { this.rooms.delete(c.room); }
    c.room = null;
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
    return { id, name: prof.name, level: prof.progress?.level ?? 1, title: prof.progress?.title ?? null, online, floor: floor === 'cabin-interior' ? 'cabin-interior' : floor, since };
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
