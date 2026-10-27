// Stockage persistant du serveur : comptes, jetons de session, profils (KSCoins, records, cabine…),
// blocages et signalements. SQLite intégré à Node (node:sqlite), sans dépendance externe.
// MemoryStore : même interface, pour les tests.
import type { Look } from '../src/art/characters';
import type { Session } from '../src/authority/types';
import type { MissionsState, ProgressState, RoomState } from '../src/authority/progress';
import type { EconomyHolder, Inventory, NeedsState, PurseState } from '../src/authority/economy';

export interface ServerProfile extends EconomyHolder {
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
  // ---- Téléphone, dons (protocole 4)
  /** Enregistre plusieurs profils dans une seule transaction (dons : expéditeur et destinataire ensemble). */
  saveMany(ps: ServerProfile[], transfer?: Omit<TransferRow, 'id'>): void;
  addMessage(from: string, to: string, text: string, at: number): DmRow;
  /** Messages entre `a` et `b` vus par `a` (sans ceux qu'il a effacés), du plus ancien au plus récent. */
  messages(a: string, b: string, before: number | null, limit: number): DmRow[];
  /** Dernier message et non-lus de chaque conversation de `id`. */
  conversations(id: string): Array<{ with: string; last: DmRow; unread: number }>;
  markRead(id: string, from: string): void;
  /** Efface la conversation pour `id` seulement (l'autre garde son historique). */
  clearConversation(id: string, other: string): void;
  contacts(id: string): Array<{ id: string; nick: string | null; fav: boolean }>;
  setContact(owner: string, target: string, nick: string | null, fav: boolean): void;
  transfers(id: string, limit: number): TransferRow[];
}

export interface DmRow { id: number; from: string; to: string; text: string; at: number; read: boolean }
export interface TransferRow { id: number; from: string; to: string; kind: string; amount: number; item: string | null; label: string; tx: string; at: number }

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
  private dms: DmRow[] = [];
  private cleared = new Map<string, number>();
  private cts = new Map<string, Map<string, { nick: string | null; fav: boolean }>>();
  private trs: TransferRow[] = [];
  saveMany(ps: ServerProfile[], transfer?: Omit<TransferRow, 'id'>): void {
    if (transfer && this.trs.some((t) => t.tx === transfer.tx)) throw new Error('transfert déjà enregistré');
    for (const p of ps) this.save(p);
    if (transfer) this.trs.push({ id: this.trs.length + 1, ...transfer });
  }
  addMessage(from: string, to: string, text: string, at: number): DmRow { const m = { id: this.dms.length + 1, from, to, text, at, read: false }; this.dms.push(m); return { ...m }; }
  messages(a: string, b: string, before: number | null, limit: number): DmRow[] {
    const cut = this.cleared.get(`${a}|${b}`) ?? 0;
    return this.dms.filter((m) => ((m.from === a && m.to === b) || (m.from === b && m.to === a)) && m.id > cut && (before === null || m.id < before)).slice(-limit).map((m) => ({ ...m }));
  }
  conversations(id: string) {
    const by = new Map<string, { with: string; last: DmRow; unread: number }>();
    for (const m of this.dms) {
      if (m.from !== id && m.to !== id) continue;
      const other = m.from === id ? m.to : m.from;
      if (m.id <= (this.cleared.get(`${id}|${other}`) ?? 0)) continue;
      const e = by.get(other) ?? { with: other, last: m, unread: 0 };
      e.last = { ...m };
      if (m.to === id && !m.read) e.unread++;
      by.set(other, e);
    }
    return [...by.values()].sort((x, y) => y.last.id - x.last.id);
  }
  markRead(id: string, from: string): void { for (const m of this.dms) if (m.to === id && m.from === from) m.read = true; }
  clearConversation(id: string, other: string): void { this.markRead(id, other); this.cleared.set(`${id}|${other}`, this.dms.length); }
  contacts(id: string) { return [...(this.cts.get(id) ?? new Map())].map(([k, v]) => ({ id: k, ...v })); }
  setContact(owner: string, target: string, nick: string | null, fav: boolean): void {
    const m = this.cts.get(owner) ?? new Map(); if (!nick && !fav) m.delete(target); else m.set(target, { nick, fav }); this.cts.set(owner, m);
  }
  transfers(id: string, limit: number): TransferRow[] { return this.trs.filter((t) => t.from === id || t.to === id).slice(-limit).reverse().map((t) => ({ ...t })); }
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
    this.dms = this.dms.filter((m) => m.from !== id && m.to !== id);
    this.cts.delete(id); for (const m of this.cts.values()) m.delete(id);
    for (const t of this.trs) { if (t.from === id) t.from = 'compte-supprimé'; if (t.to === id) t.to = 'compte-supprimé'; }
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
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL, recipient TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS messages_pair ON messages (sender, recipient, id);
    CREATE INDEX IF NOT EXISTS messages_to ON messages (recipient, read);
    CREATE TABLE IF NOT EXISTS dm_cleared (owner TEXT NOT NULL, other TEXT NOT NULL, upto INTEGER NOT NULL, PRIMARY KEY (owner, other));
    CREATE TABLE IF NOT EXISTS contacts (owner TEXT NOT NULL, target TEXT NOT NULL, nick TEXT, fav INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (owner, target));
    CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL, recipient TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, item TEXT, label TEXT NOT NULL, tx TEXT NOT NULL UNIQUE, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS transfers_from ON transfers (sender);
    CREATE INDEX IF NOT EXISTS transfers_to ON transfers (recipient);
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
    dmAdd: db.prepare('INSERT INTO messages (sender, recipient, text, at) VALUES (?, ?, ?, ?)'),
    dmPair: db.prepare('SELECT id, sender AS "from", recipient AS "to", text, at, read FROM messages WHERE ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)) AND id > ? AND id < ? ORDER BY id DESC LIMIT ?'),
    dmConvs: db.prepare(`SELECT m.id, m.sender AS "from", m.recipient AS "to", m.text, m.at, m.read, x.other,
        (SELECT COUNT(*) FROM messages u WHERE u.recipient = ? AND u.sender = x.other AND u.read = 0 AND u.id > COALESCE((SELECT upto FROM dm_cleared WHERE owner = ? AND other = x.other), 0)) AS unread
      FROM (SELECT CASE WHEN sender = ? THEN recipient ELSE sender END AS other, MAX(id) AS mid FROM messages WHERE sender = ? OR recipient = ? GROUP BY other) x
      JOIN messages m ON m.id = x.mid
      WHERE m.id > COALESCE((SELECT upto FROM dm_cleared WHERE owner = ? AND other = x.other), 0)
      ORDER BY m.id DESC LIMIT 200`),
    dmCut: db.prepare('SELECT upto FROM dm_cleared WHERE owner = ? AND other = ?'),
    dmRead: db.prepare('UPDATE messages SET read = 1 WHERE recipient = ? AND sender = ? AND read = 0'),
    dmMax: db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM messages'),
    dmClear: db.prepare('INSERT OR REPLACE INTO dm_cleared (owner, other, upto) VALUES (?, ?, ?)'),
    ctList: db.prepare('SELECT target AS id, nick, fav FROM contacts WHERE owner = ?'),
    ctSet: db.prepare('INSERT OR REPLACE INTO contacts (owner, target, nick, fav) VALUES (?, ?, ?, ?)'),
    ctDel: db.prepare('DELETE FROM contacts WHERE owner = ? AND target = ?'),
    trAdd: db.prepare('INSERT INTO transfers (sender, recipient, kind, amount, item, label, tx, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    trList: db.prepare('SELECT id, sender AS "from", recipient AS "to", kind, amount, item, label, tx, at FROM transfers WHERE sender = ? OR recipient = ? ORDER BY id DESC LIMIT ?'),
    delDms: db.prepare('DELETE FROM messages WHERE sender = ? OR recipient = ?'),
    delCleared: db.prepare('DELETE FROM dm_cleared WHERE owner = ? OR other = ?'),
    delContacts: db.prepare('DELETE FROM contacts WHERE owner = ? OR target = ?'),
    anonTrFrom: db.prepare("UPDATE transfers SET sender = 'compte-supprimé' WHERE sender = ?"),
    anonTrTo: db.prepare("UPDATE transfers SET recipient = 'compte-supprimé' WHERE recipient = ?"),
  };
  const dm = (r: Record<string, unknown>): DmRow => ({ id: Number(r.id), from: String(r.from), to: String(r.to), text: String(r.text), at: Number(r.at), read: Number(r.read) === 1 });
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
        q.delDms.run(id, id); q.delCleared.run(id, id); q.delContacts.run(id, id); q.anonTrFrom.run(id); q.anonTrTo.run(id);
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
    saveMany(ps, transfer) {
      db.exec('BEGIN');
      try {
        if (transfer) q.trAdd.run(transfer.from, transfer.to, transfer.kind, transfer.amount, transfer.item, transfer.label, transfer.tx, transfer.at);
        for (const p of ps) q.save.run(JSON.stringify(p), p.name, p.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    addMessage(from, to, text, at) { const id = Number(q.dmAdd.run(from, to, text, at).lastInsertRowid); return { id, from, to, text, at, read: false }; },
    messages(a, b, before, limit) {
      const cut = Number((q.dmCut.get(a, b) as { upto: number } | undefined)?.upto ?? 0);
      return (q.dmPair.all(a, b, b, a, cut, before ?? Number.MAX_SAFE_INTEGER, limit) as Array<Record<string, unknown>>).map(dm).reverse();
    },
    conversations(id) {
      return (q.dmConvs.all(id, id, id, id, id, id) as Array<Record<string, unknown>>).map((r) => ({ with: String(r.other), last: dm(r), unread: Number(r.unread) }));
    },
    markRead(id, from) { q.dmRead.run(id, from); },
    clearConversation(id, other) { q.dmRead.run(id, other); q.dmClear.run(id, other, Number((q.dmMax.get() as { n: number }).n)); },
    contacts(id) { return (q.ctList.all(id) as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), nick: r.nick === null ? null : String(r.nick), fav: Number(r.fav) === 1 })); },
    setContact(owner, target, nick, fav) { if (!nick && !fav) q.ctDel.run(owner, target); else q.ctSet.run(owner, target, nick, fav ? 1 : 0); },
    transfers(id, limit) { return (q.trList.all(id, id, limit) as Array<Record<string, unknown>>).map((r) => ({ id: Number(r.id), from: String(r.from), to: String(r.to), kind: String(r.kind), amount: Number(r.amount), item: r.item === null ? null : String(r.item), label: String(r.label), tx: String(r.tx), at: Number(r.at) })); },
    setSanction(id, s) { if (s) q.setSanction.run(id, Math.min(s.banUntil, 8.64e15), Math.min(s.muteUntil, 8.64e15), s.reason); else q.delSanction.run(id); },
  };
}
