// Connexion au serveur KingSea : WebSocket, reconnexion automatique (attente croissante), battement de cœur,
// requêtes à l'autorité avec réponse attendue (renvoyées telles quelles après une coupure : le serveur
// reconnaît leur identifiant et ne les rejoue jamais).
import type { Look } from '../art/characters';
import type { AuthReply, AuthRequest } from '../authority/types';
import { newRequestId, type AskKind, type Backend } from './Backend';
import { Diagnostics } from '../systems/Diagnostics';
import { isNative } from '../platform/native';
import { PROTOCOL_VERSION, TERMS_VERSION, type ClientMsg, type OwnProfile, type ServerMsg } from './protocol';

export type NetState = 'offline' | 'connecting' | 'online' | 'reconnecting';
type Listener = (m: ServerMsg) => void;

const TOKEN_KEY = 'kingsea.token';
const SERVER_KEY = 'kingsea.server';

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null): void { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};

/** Adresse du serveur : celle enregistrée, sinon l'origine de la page si elle est servie par un serveur KingSea. */
export function defaultServerUrl(): string {
  const saved = store.get(SERVER_KEY);
  if (saved) return saved;
  // Application native : la page vient de l'appareil (capacitor://, https://localhost) → adresse intégrée au build
  const built = typeof __KS_SERVER__ !== 'undefined' ? __KS_SERVER__ : '';
  if (built) return built.replace(/\/+$/, '');
  if (isNative()) return '';
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && location.host) return `${location.protocol}//${location.host}`;
  return '';
}
export function saveServerUrl(url: string): void { store.set(SERVER_KEY, url.trim().replace(/\/+$/, '') || null); }

/** Vérifie qu'un serveur KingSea répond à cette adresse. */
export async function probeServer(url: string, timeoutMs = 2500): Promise<{ ok: true; name: string; online: number } | { ok: false; error: string }> {
  if (!url) return { ok: false, error: 'Aucun serveur configuré' };
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(`${url.replace(/\/+$/, '')}/api/health`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(to);
    if (!r.ok) return { ok: false, error: `Réponse ${r.status}` };
    const j = await r.json();
    if (!j || j.ok !== true) return { ok: false, error: 'Ce n’est pas un serveur KingSea' };
    return { ok: true, name: String(j.name ?? 'KingSea'), online: Number(j.online ?? 0) };
  } catch {
    return { ok: false, error: 'Serveur injoignable' };
  }
}

export class Connection {
  state: NetState = 'offline';
  profile: OwnProfile | null = null;
  lastError: string | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<string, { req: AuthRequest; res: (r: AuthReply) => void; timer: ReturnType<typeof setTimeout> }>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private authWaiter: { res: (r: { ok: true; profile: OwnProfile; notice?: string } | { ok: false; msg: string }) => void } | null = null;
  private closedByUser = false;
  private pingAt = 0;
  /** Appelé après une reconnexion réussie (pour rejoindre l'étage, renvoyer l'apparence…). */
  onReconnected: (() => void) | null = null;

  constructor(readonly url: string) {}

  get token(): string | null { return store.get(TOKEN_KEY); }
  get online(): boolean { return this.state === 'online'; }

  on(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private wsUrl(): string { return this.url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws'; }

  /** Ouvre la connexion. Résout 'needAuth' (pas de jeton valide) ou 'ok' (session reprise). */
  open(): Promise<{ ok: true; profile: OwnProfile; notice?: string } | { ok: false; msg: string; needAuth?: boolean }> {
    this.closedByUser = false;
    this.state = this.state === 'offline' ? 'connecting' : 'reconnecting';
    return new Promise((resolve) => {
      let settled = false;
      const done = (r: { ok: true; profile: OwnProfile; notice?: string } | { ok: false; msg: string; needAuth?: boolean }) => { if (!settled) { settled = true; resolve(r); } };
      let ws: WebSocket;
      try { ws = new WebSocket(this.wsUrl()); } catch { this.state = 'offline'; done({ ok: false, msg: 'Adresse du serveur invalide' }); return; }
      this.ws = ws;
      const to = setTimeout(() => { done({ ok: false, msg: 'Le serveur ne répond pas' }); try { ws.close(); } catch { /* déjà fermée */ } }, 6000);
      ws.onopen = () => this.raw({ t: 'hello', v: PROTOCOL_VERSION, token: this.token ?? undefined });
      ws.onmessage = (e) => {
        let m: ServerMsg;
        try { m = JSON.parse(String(e.data)); } catch { return; }
        if (m.t === 'hello') { clearTimeout(to); done({ ok: false, msg: 'Connexion requise', needAuth: true }); }
        if (m.t === 'auth') { clearTimeout(to); this.onAuth(m); done({ ok: true, profile: m.profile, notice: m.notice }); }
        if (m.t === 'kicked') { this.lastError = m.msg; this.closedByUser = true; clearTimeout(to); done({ ok: false, msg: m.msg }); }
        this.dispatch(m);
      };
      ws.onclose = () => {
        clearTimeout(to);
        done({ ok: false, msg: 'Connexion fermée' });
        this.onClose();
      };
      ws.onerror = () => { /* suivi de onclose */ };
    });
  }

  private onAuth(m: Extract<ServerMsg, { t: 'auth' }>): void {
    store.set(TOKEN_KEY, m.token);
    store.set('kingsea.lastName', m.profile.name);
    this.profile = m.profile;
    const wasReconnecting = this.state === 'reconnecting';
    this.state = 'online'; this.retry = 0;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => { this.pingAt = performance.now(); this.raw({ t: 'ping' }); }, 10_000);
    // Requêtes restées sans réponse pendant la coupure : renvoyées (même identifiant → jamais rejouées)
    for (const p of this.pending.values()) this.raw({ t: 'req', req: p.req });
    if (wasReconnecting) this.onReconnected?.();
  }

  private dispatch(m: ServerMsg): void {
    if (m.t === 'pong' && this.pingAt) { Diagnostics.rttMs = performance.now() - this.pingAt; this.pingAt = 0; }
    if (m.t === 'res') {
      const p = this.pending.get(m.id);
      if (p) { clearTimeout(p.timer); this.pending.delete(m.id); p.res(m.reply); }
    }
    if (m.t === 'auth' || m.t === 'authError') {
      const w = this.authWaiter; this.authWaiter = null;
      if (w) w.res(m.t === 'auth' ? { ok: true, profile: m.profile, notice: m.notice } : { ok: false, msg: m.msg });
    }
    for (const l of this.listeners) { try { l(m); } catch (e) { console.error(e); } }
  }

  private onClose(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.ws = null;
    Diagnostics.rttMs = null;
    if (this.closedByUser || !this.profile) { this.state = 'offline'; this.failPending('Connexion perdue'); return; }
    // Reconnexion automatique : 1 s, 2 s, 4 s, 8 s, puis toutes les 15 s
    this.state = 'reconnecting';
    const delay = Math.min(15_000, 1000 * 2 ** this.retry++);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { void this.open(); }, delay);
    for (const l of this.listeners) l({ t: 'notice', msg: '__disconnected__' });
  }

  private failPending(msg: string): void {
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.res({ ok: false, error: msg, balance: this.profile?.wallet.balance ?? 0 }); this.pending.delete(id); }
  }

  private raw(m: ClientMsg): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  /** Message de jeu (déplacement, chat…). Ignoré hors connexion. */
  send(m: ClientMsg): void { if (this.state === 'online') this.raw(m); }

  private authCall(m: ClientMsg): Promise<{ ok: true; profile: OwnProfile; notice?: string } | { ok: false; msg: string }> {
    return new Promise((res) => {
      this.authWaiter = { res };
      if (!this.raw(m)) { this.authWaiter = null; res({ ok: false, msg: 'Serveur injoignable' }); }
      setTimeout(() => { if (this.authWaiter?.res === res) { this.authWaiter = null; res({ ok: false, msg: 'Le serveur ne répond pas' }); } }, 8000);
    });
  }

  /** Inscription : l'appelant a fait accepter les conditions d'utilisation et la politique de confidentialité. */
  register(name: string, password: string, look: Look) { return this.authCall({ t: 'register', name, password, look, terms: TERMS_VERSION }); }

  private accountCall(op: 'password' | 'delete', m: ClientMsg): Promise<{ ok: boolean; msg: string }> {
    return new Promise((res) => {
      let done = false;
      const off = this.on((r) => { if (r.t === 'account' && r.op === op && !done) { done = true; off(); res({ ok: r.ok, msg: r.msg }); } });
      if (!this.raw(m)) { done = true; off(); res({ ok: false, msg: 'Serveur injoignable' }); return; }
      setTimeout(() => { if (!done) { done = true; off(); res({ ok: false, msg: 'Le serveur ne répond pas' }); } }, 10_000);
    });
  }
  changePassword(old: string, next: string) { return this.accountCall('password', { t: 'password', old, next }); }
  /** Suppression définitive du compte ; en cas de succès, le jeton local est effacé. */
  async deleteAccount(password: string): Promise<{ ok: boolean; msg: string }> {
    const r = await this.accountCall('delete', { t: 'deleteAccount', password });
    if (r.ok) { store.set(TOKEN_KEY, null); store.set('kingsea.lastName', null); this.close(); }
    return r;
  }
  login(name: string, password: string) { return this.authCall({ t: 'login', name, password }); }

  logout(): void {
    this.raw({ t: 'logout' });
    store.set(TOKEN_KEY, null);
    this.close();
  }

  close(): void {
    this.closedByUser = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try { this.ws?.close(); } catch { /* déjà fermée */ }
    this.state = 'offline';
    this.profile = null;
  }

  /** Requête à l'autorité du serveur ; attend la réponse (renvoyée après reconnexion si besoin). */
  request(kind: AskKind, game: string, action: string, input?: unknown): Promise<AuthReply> {
    const req: AuthRequest = { kind, game, action, input, id: newRequestId() };
    return new Promise((res) => {
      const timer = setTimeout(() => { this.pending.delete(req.id); res({ ok: false, error: 'Le serveur ne répond pas', balance: this.profile?.wallet.balance ?? 0 }); }, 15_000);
      this.pending.set(req.id, { req, res, timer });
      if (this.state === 'online') this.raw({ t: 'req', req });
    });
  }
}

export class RemoteBackend implements Backend {
  readonly online = true;
  constructor(private conn: Connection) {}
  request(kind: AskKind, game: string, action: string, input?: unknown): Promise<AuthReply> {
    if (this.conn.state === 'offline') return Promise.resolve({ ok: false, error: 'Hors connexion', balance: this.conn.profile?.wallet.balance ?? 0 });
    return this.conn.request(kind, game, action, input);
  }
}
