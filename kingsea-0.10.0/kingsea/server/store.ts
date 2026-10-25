// Stockage persistant du serveur : comptes, jetons de session, profils (KSCoins, records, cabine…),
// blocages et signalements. SQLite intégré à Node (node:sqlite), sans dépendance externe.
// MemoryStore : même interface, pour les tests.
import type { Look } from '../src/art/characters';
import type { Session } from '../src/authority/types';
import type { MissionsState, ProgressState, RoomState } from '../src/authority/progress';
import type { Inventory, NeedsState, PurseState } from '../src/authority/economy';

export interface ServerProfile {
  id: string; name: string; look: Look; created: number;
  wallet: { balance: number; processedTx: string[] };
  stats: Record<string, number>;
  flags: Record<string, boolean>;
  dailyRewards: { lastWheelDay: string | null };
  sessions: Record<string, Session>;
  cabin: { id: string | null; wallColor: number };
  location: { floorId: string; x: number; y: number };
  /** Version des conditions d'utilisation acceptées à l'inscription. */
  termsVersion?: number;
  /** Progression, missions, cabine (mise à jour KS Casino ; complétés à la connexion pour les anciens profils). */
  progress?: ProgressState;
  missions?: MissionsState;
  room?: RoomState;
  /** Jetons de casino, inventaire et jauges faim/soif (complétés à la connexion pour les anciens profils). */
  chips?: PurseState;
  inventory?: Inventory;
  needs?: NeedsState;
}

export interface Credentials { id: string; salt: string; hash: string }
/** Sanction de modération : bannissement et/ou sourdine (horodatages ; 0 = aucune, Infinity interdit → très grand nombre). */
export interface Sanction { banUntil: number; muteUntil: number; reason: string }

export interface Report { id: number; reporter: string; target: string; reason: string; context: string; at: number }

export interface Store {
  createAccount(p: ServerProfile, cred: Omit<Credentials, 'id'>): boolean;
  credentials(name: string): Credentials | null;
  profile(id: string): ServerProfile | null;
  save(p: ServerProfile): void;
  createToken(id: string, token: string, now: number): void;
  tokenAccount(token: string): string | null;
  deleteToken(token: string): void;
  cabinOwners(): Map<string, string>;
  setCabin(cabin: string, account: string): boolean;
  blocks(owner: string): string[];
  setBlock(owner: string, target: string, on: boolean): void;
  addReport(r: Omit<Report, 'id'>): number;
  reports(limit?: number): Report[];
  accountCount(): number;
  /** Suppression définitive (exigence des boutiques) : compte, profil, jetons, cabine, blocages ; signalements anonymisés. */
  deleteAccount(id: string): void;
  setPassword(id: string, cred: Omit<Credentials, 'id'>): void;
  /** Révoque toutes les sessions d'un compte (sauf éventuellement une). */
  deleteTokensOf(id: string, keep?: string): void;
  sanction(id: string): Sanction | null;
  setSanction(id: string, s: Sanction | null): void;
  /** Supprime les signalements plus anciens que `before` (conservation limitée à 12 mois). */
  purgeReports(before: number): number;
  // ---- Amis (mise à jour KS Casino)
  /** Code ami du compte (créé au premier appel, unique, stable). */
  friendCode(id: string): string;
  /** Compte correspondant à un code ami (insensible à la casse, tiret facultatif). */
  accountByCode(code: string): string | null;
  friends(id: string): FriendLink[];
  /** Demandes reçues (`to` = id) et envoyées (`from` = id). */
  friendRequests(id: string): { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  addFriendRequest(from: string, to: string, at: number): void;
  deleteFriendRequest(from: string, to: string): void;
  /** Crée l'amitié (dans les deux sens) et efface les demandes croisées. */
  addFriendship(a: string, b: string, at: number): void;
  removeFriendship(a: string, b: string): void;
}

export interface FriendLink { id: string; since: number }
export interface FriendRequest { from: string; to: string; at: number }

/** Alphabet des codes amis : sans caractères ambigus (0/O, 1/I/L). */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function makeFriendCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return `KS-${s}`;
}
/** Normalise une saisie de code (« ks 7f3k9q » → « KS-7F3K9Q ») ; null si ce n'est pas un code. */
export function normalizeFriendCode(raw: string): string | null {
  const t = raw.toUpperCase().replace(/[\s-]/g, '');
  const m = /^KS([2-9A-HJKMNP-Z]{6})$/.exec(t);
  return m ? `KS-${m[1]}` : null;
}
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export class MemoryStore implements Store {
  private acc = new Map<string, { p: ServerProfile; cred: Credentials }>();
  private tokens = new Map<string, string>();
  private cabins = new Map<string, string>();
  private blk = new Map<string, Set<string>>();
  private rep: Report[] = [];
  private sanc = new Map<string, Sanction>();
  private codes = new Map<string, string>();
  private fr = new Map<string, number>();
  private req: FriendRequest[] = [];
  createAccount(p: ServerProfile, cred: Omit<Credentials, 'id'>): boolean {
    if ([...this.acc.values()].some((a) => a.p.name.toLowerCase() === p.name.toLowerCase())) return false;
    this.acc.set(p.id, { p: structuredClone(p), cred: { id: p.id, ...cred } }); return true;
  }
  credentials(name: string): Credentials | null { return [...this.acc.values()].find((a) => a.p.name.toLowerCase() === name.toLowerCase())?.cred ?? null; }
  profile(id: string): ServerProfile | null { const a = this.acc.get(id); return a ? structuredClone(a.p) : null; }
  save(p: ServerProfile): void { const a = this.acc.get(p.id); if (a) a.p = structuredClone(p); }
  createToken(id: string, token: string): void { this.tokens.set(token, id); }
  tokenAccount(token: string): string | null { return this.tokens.get(token) ?? null; }
  deleteToken(token: string): void { this.tokens.delete(token); }
  cabinOwners(): Map<string, string> { return new Map(this.cabins); }
  setCabin(cabin: string, account: string): boolean { if (this.cabins.has(cabin)) return false; this.cabins.set(cabin, account); return true; }
  blocks(owner: string): string[] { return [...(this.blk.get(owner) ?? [])]; }
  setBlock(owner: string, target: string, on: boolean): void { const s = this.blk.get(owner) ?? new Set(); if (on) s.add(target); else s.delete(target); this.blk.set(owner, s); }
  addReport(r: Omit<Report, 'id'>): number { const id = this.rep.length + 1; this.rep.push({ id, ...r }); return id; }
  reports(limit = 50): Report[] { return this.rep.slice(-limit).reverse(); }
  accountCount(): number { return this.acc.size; }
  deleteAccount(id: string): void {
    this.acc.delete(id);
    for (const [t, a] of this.tokens) if (a === id) this.tokens.delete(t);
    for (const [c, a] of this.cabins) if (a === id) this.cabins.delete(c);
    this.blk.delete(id); for (const s of this.blk.values()) s.delete(id);
    for (const r of this.rep) if (r.reporter === id) r.reporter = 'compte-supprimé';
    this.sanc.delete(id);
    this.codes.delete(id);
    for (const k of [...this.fr.keys()]) if (k.split('|').includes(id)) this.fr.delete(k);
    this.req = this.req.filter((r) => r.from !== id && r.to !== id);
  }
  friendCode(id: string): string {
    let c = this.codes.get(id);
    while (!c) { const n = makeFriendCode(); if (![...this.codes.values()].includes(n)) { c = n; this.codes.set(id, n); } }
    return c;
  }
  accountByCode(code: string): string | null { const n = normalizeFriendCode(code); return n ? [...this.codes].find(([, c]) => c === n)?.[0] ?? null : null; }
  friends(id: string): FriendLink[] { return [...this.fr].filter(([k]) => k.split('|').includes(id)).map(([k, since]) => ({ id: k.split('|').find((x) => x !== id)!, since })); }
  friendRequests(id: string) { return { incoming: this.req.filter((r) => r.to === id).map((r) => ({ ...r })), outgoing: this.req.filter((r) => r.from === id).map((r) => ({ ...r })) }; }
  addFriendRequest(from: string, to: string, at: number): void { if (!this.req.some((r) => r.from === from && r.to === to)) this.req.push({ from, to, at }); }
  deleteFriendRequest(from: string, to: string): void { this.req = this.req.filter((r) => !(r.from === from && r.to === to)); }
  addFriendship(a: string, b: string, at: number): void { this.fr.set(pair(a, b).join('|'), at); this.deleteFriendRequest(a, b); this.deleteFriendRequest(b, a); }
  removeFriendship(a: string, b: string): void { this.fr.delete(pair(a, b).join('|')); }
  setPassword(id: string, cred: Omit<Credentials, 'id'>): void { const a = this.acc.get(id); if (a) a.cred = { id, ...cred }; }
  deleteTokensOf(id: string, keep?: string): void { for (const [t, a] of this.tokens) if (a === id && t !== keep) this.tokens.delete(t); }
  sanction(id: string): Sanction | null { const s = this.sanc.get(id); return s ? { ...s } : null; }
  setSanction(id: string, s: Sanction | null): void { if (s) this.sanc.set(id, { ...s }); else this.sanc.delete(id); }
  purgeReports(before: number): number { const n = this.rep.length; this.rep = this.rep.filter((r) => r.at >= before); return n - this.rep.length; }
}

export async function openSqliteStore(file: string): Promise<Store> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, profile TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, account TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cabins (cabin TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS blocks (owner TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY (owner, target));
    CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT, target TEXT, reason TEXT, context TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS sanctions (account TEXT PRIMARY KEY, ban_until INTEGER NOT NULL, mute_until INTEGER NOT NULL, reason TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS friend_codes (account TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS friendships (a TEXT NOT NULL, b TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY (a, b));
    CREATE INDEX IF NOT EXISTS friendships_b ON friendships (b);
    CREATE TABLE IF NOT EXISTS friend_requests (sender TEXT NOT NULL, recipient TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (sender, recipient));
    CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (recipient);
  `);
  const q = {
    insert: db.prepare('INSERT INTO accounts (id, name, salt, hash, created, profile) VALUES (?, ?, ?, ?, ?, ?)'),
    cred: db.prepare('SELECT id, salt, hash FROM accounts WHERE name = ?'),
    get: db.prepare('SELECT profile FROM accounts WHERE id = ?'),
    save: db.prepare('UPDATE accounts SET profile = ?, name = ? WHERE id = ?'),
    tok: db.prepare('INSERT OR REPLACE INTO tokens (token, account, created) VALUES (?, ?, ?)'),
    tokGet: db.prepare('SELECT account FROM tokens WHERE token = ?'),
    tokDel: db.prepare('DELETE FROM tokens WHERE token = ?'),
    cabins: db.prepare('SELECT cabin, account FROM cabins'),
    cabinSet: db.prepare('INSERT OR IGNORE INTO cabins (cabin, account) VALUES (?, ?)'),
    blocks: db.prepare('SELECT target FROM blocks WHERE owner = ?'),
    blockAdd: db.prepare('INSERT OR IGNORE INTO blocks (owner, target) VALUES (?, ?)'),
    blockDel: db.prepare('DELETE FROM blocks WHERE owner = ? AND target = ?'),
    report: db.prepare('INSERT INTO reports (reporter, target, reason, context, at) VALUES (?, ?, ?, ?, ?)'),
    reports: db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM accounts'),
    delAcc: db.prepare('DELETE FROM accounts WHERE id = ?'),
    delTok: db.prepare('DELETE FROM tokens WHERE account = ?'),
    delTokExcept: db.prepare('DELETE FROM tokens WHERE account = ? AND token != ?'),
    delCabin: db.prepare('DELETE FROM cabins WHERE account = ?'),
    delBlocks: db.prepare('DELETE FROM blocks WHERE owner = ? OR target = ?'),
    anonReports: db.prepare("UPDATE reports SET reporter = 'compte-supprimé' WHERE reporter = ?"),
    delSanction: db.prepare('DELETE FROM sanctions WHERE account = ?'),
    setPw: db.prepare('UPDATE accounts SET salt = ?, hash = ? WHERE id = ?'),
    sanction: db.prepare('SELECT ban_until AS banUntil, mute_until AS muteUntil, reason FROM sanctions WHERE account = ?'),
    purge: db.prepare('DELETE FROM reports WHERE at < ?'),
    setSanction: db.prepare('INSERT OR REPLACE INTO sanctions (account, ban_until, mute_until, reason) VALUES (?, ?, ?, ?)'),
    code: db.prepare('SELECT code FROM friend_codes WHERE account = ?'),
    codeAdd: db.prepare('INSERT OR IGNORE INTO friend_codes (account, code) VALUES (?, ?)'),
    byCode: db.prepare('SELECT account FROM friend_codes WHERE code = ?'),
    friends: db.prepare('SELECT a, b, since FROM friendships WHERE a = ? OR b = ?'),
    frAdd: db.prepare('INSERT OR REPLACE INTO friendships (a, b, since) VALUES (?, ?, ?)'),
    frDel: db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?'),
    reqIn: db.prepare('SELECT sender AS "from", recipient AS "to", at FROM friend_requests WHERE recipient = ? ORDER BY at'),
    reqOut: db.prepare('SELECT sender AS "from", recipient AS "to", at FROM friend_requests WHERE sender = ? ORDER BY at'),
    reqAdd: db.prepare('INSERT OR IGNORE INTO friend_requests (sender, recipient, at) VALUES (?, ?, ?)'),
    reqDel: db.prepare('DELETE FROM friend_requests WHERE sender = ? AND recipient = ?'),
    delCodes: db.prepare('DELETE FROM friend_codes WHERE account = ?'),
    delFriends: db.prepare('DELETE FROM friendships WHERE a = ? OR b = ?'),
    delReqs: db.prepare('DELETE FROM friend_requests WHERE sender = ? OR recipient = ?'),
  };
  return {
    createAccount(p, cred) {
      try { q.insert.run(p.id, p.name, cred.salt, cred.hash, p.created, JSON.stringify(p)); return true; } catch { return false; }
    },
    credentials(name) { const r = q.cred.get(name) as Credentials | undefined; return r ?? null; },
    profile(id) { const r = q.get.get(id) as { profile: string } | undefined; return r ? JSON.parse(r.profile) : null; },
    save(p) { q.save.run(JSON.stringify(p), p.name, p.id); },
    createToken(id, token, now) { q.tok.run(token, id, now); },
    tokenAccount(token) { const r = q.tokGet.get(token) as { account: string } | undefined; return r?.account ?? null; },
    deleteToken(token) { q.tokDel.run(token); },
    cabinOwners() { return new Map((q.cabins.all() as Array<{ cabin: string; account: string }>).map((r) => [r.cabin, r.account])); },
    setCabin(cabin, account) { return Number(q.cabinSet.run(cabin, account).changes) > 0; },
    blocks(owner) { return (q.blocks.all(owner) as Array<{ target: string }>).map((r) => r.target); },
    setBlock(owner, target, on) { if (on) q.blockAdd.run(owner, target); else q.blockDel.run(owner, target); },
    addReport(r) { return Number(q.report.run(r.reporter, r.target, r.reason, r.context, r.at).lastInsertRowid); },
    reports(limit = 50) { return q.reports.all(limit) as unknown as Report[]; },
    accountCount() { return (q.count.get() as { n: number }).n; },
    deleteAccount(id) {
      db.exec('BEGIN');
      try {
        q.delAcc.run(id); q.delTok.run(id); q.delCabin.run(id); q.delBlocks.run(id, id); q.anonReports.run(id); q.delSanction.run(id);
        q.delCodes.run(id); q.delFriends.run(id, id); q.delReqs.run(id, id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    setPassword(id, cred) { q.setPw.run(cred.salt, cred.hash, id); },
    deleteTokensOf(id, keep) { if (keep) q.delTokExcept.run(id, keep); else q.delTok.run(id); },
    sanction(id) { const r = q.sanction.get(id) as Sanction | undefined; return r ? { banUntil: Number(r.banUntil), muteUntil: Number(r.muteUntil), reason: String(r.reason) } : null; },
    purgeReports(before) { return Number(q.purge.run(before).changes); },
    friendCode(id) {
      const r = q.code.get(id) as { code: string } | undefined;
      if (r) return r.code;
      for (;;) { const c = makeFriendCode(); if (Number(q.codeAdd.run(id, c).changes) > 0) return c; const again = q.code.get(id) as { code: string } | undefined; if (again) return again.code; }
    },
    accountByCode(code) { const n = normalizeFriendCode(code); if (!n) return null; const r = q.byCode.get(n) as { account: string } | undefined; return r?.account ?? null; },
    friends(id) { return (q.friends.all(id, id) as Array<{ a: string; b: string; since: number }>).map((r) => ({ id: r.a === id ? r.b : r.a, since: Number(r.since) })); },
    friendRequests(id) {
      const conv = (rows: unknown[]) => (rows as Array<{ from: string; to: string; at: number }>).map((r) => ({ from: String(r.from), to: String(r.to), at: Number(r.at) }));
      return { incoming: conv(q.reqIn.all(id)), outgoing: conv(q.reqOut.all(id)) };
    },
    addFriendRequest(from, to, at) { q.reqAdd.run(from, to, at); },
    deleteFriendRequest(from, to) { q.reqDel.run(from, to); },
    addFriendship(a, b, at) {
      const [x, y] = pair(a, b);
      db.exec('BEGIN');
      try { q.frAdd.run(x, y, at); q.reqDel.run(a, b); q.reqDel.run(b, a); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    removeFriendship(a, b) { const [x, y] = pair(a, b); q.frDel.run(x, y); },
    setSanction(id, s) { if (s) q.setSanction.run(id, Math.min(s.banUntil, 8.64e15), Math.min(s.muteUntil, 8.64e15), s.reason); else q.delSanction.run(id); },
  };
}
