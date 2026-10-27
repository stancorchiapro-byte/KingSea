// Tables multijoueurs du casino (serveur, source de vérité) :
// • instances indépendantes de 5 places au plus par jeu (une nouvelle instance s'ouvre quand les autres sont pleines),
//   chacune avec ses joueurs, ses mises, son tirage et son état ;
// • manches partagées (roulette, baccarat, craps, keno, courses) : fenêtre de mises, un seul tirage, gains par joueur ;
// • Crash partagé : un vol commun, chacun encaisse quand il veut (heure du serveur) ;
// • blackjack à places : sabot de table, tours de parole avec délai, assurance, séparations, absents gérés ;
// • bancs de machines (machines à sous, Plinko, poker vidéo) : chacun joue pour soi, la table voit ses voisins.
// Les clients n'envoient que des intentions ; toutes les mises et tous les gains passent par l'autorité (transact).
import { BJ_MAX_BOXES, blackjackBets, CRASH_AUTOS, drawRound, openRound, ROUND_GAMES, ROUND_SHOW_MS, settleRound, TABLE_CAPACITY, tablePayout, tableRefund, tableStake, transact, validateRoundBet, type AuthEnv, type AuthReply, type AuthState, type RoundBet, type RoundContext, type RoundGame } from '../src/authority';
import { AuthError, amount, obj } from '../src/authority/types';
import { BJ_TABLES, Blackjack, insuranceCost, type BjTable } from '../src/games/logic/blackjack';
import { hiLo, Shoe, type Card } from '../src/games/logic/cards';
import { randomUUID } from 'node:crypto';
import { crashMultiplier, crashPoint, crashReturn, timeToReach } from '../src/games/logic/crash';
import type { Look } from '../src/art/characters';
import type { ServerMsg, TableSeat, TableState, TableSummary } from '../src/net/protocol';

/** Accès du gestionnaire de tables au serveur (profils, envoi, horloge). */
export interface TableHost {
  env(seed?: string): AuthEnv;
  /** Exécute `fn` sur le profil (en mémoire si le joueur est connecté, sinon chargé puis enregistré). */
  withProfile<T>(id: string, fn: (p: AuthState) => T): T | null;
  send(id: string, m: ServerMsg): void;
  friendsOf(id: string): string[];
  identity(id: string): { name: string; look: Look; level: number } | null;
}

export const BET_WINDOW_MS = 9000;
export const CRASH_WINDOW_MS = 7000;
export const BJ_BET_WINDOW_MS = 12_000;
export const BJ_TURN_MS = 20_000;
export const BJ_INSURANCE_MS = 9000;
export const BJ_SHOW_MS = 5500;
const MAX_INSTANCES = 50;

interface Member { id: string; seat: number; joined: number; connected: boolean }

const HIDDEN: Card = { rank: 0, suit: '♠' };

export abstract class Table {
  readonly members = new Map<string, Member>();
  round = 1;
  /**
   * Identifiant unique de cette instance de table. Les numéros de table et de manche repartent de 1 quand une table
   * est recréée ou que le serveur redémarre : sans cet identifiant, une nouvelle manche reprenait l'identifiant de
   * transaction d'une ancienne (« table:…#1:1:joueur ») et son gain était ignoré comme « déjà versé ».
   */
  readonly uid = randomUUID().replace(/-/g, '').slice(0, 12);
  /** Identifiant de transaction d'une manche pour un joueur (unique : instance, manche, joueur). */
  roundTx(player: string): string { return `table:${this.id}:${this.uid}:${this.round}:${player}`; }
  constructor(readonly mgr: TableManager, readonly game: string, readonly num: number, readonly tier: string | null) {}
  get id(): string { return `${this.game}${this.tier ? `:${this.tier}` : ''}#${this.num}`; }
  get cap(): number { return TABLE_CAPACITY[this.game] ?? 5; }
  get full(): boolean { return this.members.size >= this.cap; }
  freeSeat(): number { for (let i = 0; i < this.cap; i++) if (![...this.members.values()].some((m) => m.seat === i)) return i; return -1; }
  /** La table peut-elle être supprimée (personne, rien en cours) ? */
  abstract get idle(): boolean;
  abstract get phase(): string;
  /** Données publiques propres au jeu (personnalisées pour `viewer`). */
  abstract data(viewer: string): Record<string, unknown>;
  abstract bet(id: string, raw: unknown, req: string): AuthReply;
  act(_id: string, _raw: unknown, _req: string): AuthReply { return this.mgr.refuse(_id, 'Action impossible à cette table'); }
  tick(_now: number): void { /* rien par défaut */ }
  deadline = 0;
  onLeave(_id: string): void { /* rien par défaut */ }
  shutdown(): void { /* rien par défaut */ }

  state(viewer: string): TableState {
    const seats: TableSeat[] = [...this.members.values()].sort((a, b) => a.seat - b.seat).map((m) => {
      const who = this.mgr.host.identity(m.id);
      return { id: m.id, seat: m.seat, name: who?.name ?? 'Passager', look: who?.look, level: who?.level ?? 1, connected: m.connected };
    });
    return { id: this.id, game: this.game, tier: this.tier, num: this.num, cap: this.cap, phase: this.phase, endsIn: this.deadline ? Math.max(0, this.deadline - this.mgr.now()) : 0, round: this.round, you: viewer, seats, data: this.data(viewer) };
  }
  broadcast(): void { for (const m of this.members.values()) this.mgr.host.send(m.id, { t: 'table', state: this.state(m.id) }); }
  summary(viewer: string): TableSummary {
    const friends = new Set(this.mgr.host.friendsOf(viewer));
    return { id: this.id, num: this.num, game: this.game, tier: this.tier, players: this.members.size, cap: this.cap, friends: [...this.members.keys()].filter((id) => friends.has(id)).map((id) => this.mgr.host.identity(id)?.name ?? '?'), phase: this.phase };
  }
}

// ---------------------------------------------------------------- manches partagées
interface RoundEntry { bet: RoundBet; tx: string }

class RoundTable extends Table {
  private stage: 'open' | 'betting' | 'show' = 'open';
  private bets = new Map<string, RoundEntry>();
  private ctx: RoundContext;
  private last: Record<string, unknown> | null = null;
  private showUntil = 0;
  constructor(mgr: TableManager, readonly rg: RoundGame, num: number) {
    super(mgr, rg, num, null);
    this.ctx = openRound(rg, mgr.host.env().rng);
  }
  get phase(): string { return this.stage; }
  get idle(): boolean { return this.members.size === 0 && this.bets.size === 0 && this.stage !== 'show'; }
  data(viewer: string): Record<string, unknown> {
    return {
      field: this.ctx.field ?? null,
      bets: [...this.bets].map(([id, e]) => ({ id, name: this.mgr.host.identity(id)?.name ?? '?', stake: e.bet.stake, bet: e.bet.data, mine: id === viewer })),
      last: this.last,
    };
  }

  bet(id: string, raw: unknown, req: string): AuthReply {
    if (this.stage === 'show') return this.mgr.refuse(id, 'Tirage en cours : attends la prochaine manche');
    if (this.bets.has(id)) return this.mgr.refuse(id, 'Ta mise est déjà posée pour cette manche');
    if (!this.members.has(id)) return this.mgr.refuse(id, 'Tu n’es pas assis à cette table');
    const tx = this.roundTx(id);
    let entry: RoundEntry | null = null;
    const reply = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
      const bet = validateRoundBet(this.rg, obj(raw), this.ctx);
      tableStake(p, tx, bet.stake);
      entry = { bet, tx };
      return { view: { accepted: true, table: this.id, round: this.round, req }, stake: bet.stake, payout: 0, done: false };
    })) ?? this.mgr.refuse(id, 'Profil introuvable');
    if (reply.ok && entry) {
      this.bets.set(id, entry);
      if (this.stage === 'open') { this.stage = 'betting'; this.deadline = this.mgr.now() + BET_WINDOW_MS; }
      // Tous les joueurs assis ont misé : inutile d'attendre la fin du compte à rebours
      if ([...this.members.keys()].every((m) => this.bets.has(m))) this.deadline = this.mgr.now();
      this.broadcast();
    }
    return reply;
  }

  tick(now: number): void {
    if (this.stage === 'betting' && now >= this.deadline) this.resolve();
    else if (this.stage === 'show' && now >= this.showUntil) {
      this.stage = 'open'; this.deadline = 0; this.round++;
      this.bets.clear();
      this.ctx = openRound(this.rg, this.mgr.host.env().rng);
      this.broadcast();
    }
  }

  private resolve(): void {
    const env = this.mgr.host.env();
    const outcome = drawRound(this.rg, env.rng, this.ctx);
    const players: Array<{ id: string; name: string; stake: number; payout: number }> = [];
    const replies = new Map<string, AuthReply>();
    for (const [id, e] of this.bets) {
      const payout = Math.floor(settleRound(this.rg, e.bet, outcome, this.ctx));
      const r = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
        tablePayout(p, this.rg, e.tx, payout, this.mgr.host.env(id));
        return { view: { ...outcome, table: this.id, round: this.round }, stake: 0, payout, done: true };
      }));
      if (r) replies.set(id, r);
      players.push({ id, name: this.mgr.host.identity(id)?.name ?? '?', stake: e.bet.stake, payout });
    }
    this.last = outcome;
    this.stage = 'show'; this.deadline = 0;
    this.showUntil = this.mgr.now() + ROUND_SHOW_MS[this.rg];
    const watchers = new Set([...this.members.keys(), ...this.bets.keys()]);
    for (const id of watchers) this.mgr.host.send(id, { t: 'tableRound', table: this.id, game: this.game, round: this.round, outcome, players, you: replies.get(id) ?? null });
    this.broadcast();
  }

  shutdown(): void {
    // Arrêt du serveur avant le tirage : mises remboursées
    if (this.stage !== 'betting') return;
    for (const [id, e] of this.bets) this.mgr.host.withProfile(id, (p) => tableRefund(p, e.tx, e.bet.stake));
    this.bets.clear();
  }
}

// ---------------------------------------------------------------- Crash partagé
interface CrashBet { bet: number; auto: number | null; tx: string; cashed: number | null }

class CrashTable extends Table {
  private stage: 'open' | 'betting' | 'flying' | 'crashed' = 'open';
  private bets = new Map<string, CrashBet>();
  private point = 0;
  private startedAt = 0;
  private until = 0;
  private history: number[] = [];
  constructor(mgr: TableManager, num: number) { super(mgr, 'crash', num, null); }
  get phase(): string { return this.stage; }
  get idle(): boolean { return this.members.size === 0 && this.bets.size === 0 && this.stage === 'open'; }
  data(viewer: string): Record<string, unknown> {
    const now = this.mgr.now();
    return {
      elapsed: this.stage === 'flying' ? (now - this.startedAt) / 1000 : 0,
      point: this.stage === 'crashed' ? this.point : null,
      history: this.history,
      bets: [...this.bets].map(([id, b]) => ({ id, name: this.mgr.host.identity(id)?.name ?? '?', bet: b.bet, auto: b.auto, cashed: b.cashed, mine: id === viewer })),
    };
  }
  bet(id: string, raw: unknown, req: string): AuthReply {
    if (this.stage === 'flying' || this.stage === 'crashed') return this.mgr.refuse(id, 'Vol en cours : mise pour le prochain départ dans un instant');
    if (this.bets.has(id)) return this.mgr.refuse(id, 'Ta mise est déjà posée pour ce vol');
    const input = obj(raw);
    const tx = this.roundTx(id);
    let bet: CrashBet | null = null;
    const reply = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
      const b = amount(input.bet, 100);
      const auto = input.auto === null || input.auto === undefined ? null : (CRASH_AUTOS.includes(input.auto as number) ? (input.auto as number) : null);
      tableStake(p, tx, b);
      bet = { bet: b, auto, tx, cashed: null };
      return { view: { accepted: true, table: this.id, round: this.round, req }, stake: b, payout: 0, done: false };
    })) ?? this.mgr.refuse(id, 'Profil introuvable');
    if (reply.ok && bet) {
      this.bets.set(id, bet);
      if (this.stage === 'open') { this.stage = 'betting'; this.deadline = this.mgr.now() + CRASH_WINDOW_MS; }
      if ([...this.members.keys()].every((m) => this.bets.has(m))) this.deadline = Math.min(this.deadline, this.mgr.now() + 1500);
      this.broadcast();
    }
    return reply;
  }
  act(id: string, raw: unknown, req: string): AuthReply {
    const b = this.bets.get(id);
    if (obj(raw).move !== 'cashout') return this.mgr.refuse(id, 'Action inconnue');
    if (!b || this.stage !== 'flying' || b.cashed !== null) return this.mgr.refuse(id, 'Rien à encaisser');
    const m = crashMultiplier(Math.max(0, (this.mgr.now() - this.startedAt) / 1000));
    if (m >= this.point) return this.mgr.refuse(id, 'Trop tard : écrasé');
    return this.cash(id, b, m, false, req);
  }
  private cash(id: string, b: CrashBet, m: number, auto: boolean, req = ''): AuthReply {
    b.cashed = m;
    const payout = crashReturn(b.bet, m, this.point);
    const r = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
      tablePayout(p, 'crash', b.tx, payout, this.mgr.host.env(id));
      return { view: { cashedAt: m, auto, table: this.id, round: this.round, req }, stake: 0, payout, done: true };
    })) ?? this.mgr.refuse(id, 'Profil introuvable');
    if (auto) this.mgr.host.send(id, { t: 'tableRound', table: this.id, game: 'crash', round: this.round, outcome: { cashedAt: m, auto: true }, players: [], you: r });
    this.broadcast();
    return r;
  }
  tick(now: number): void {
    if (this.stage === 'betting' && now >= this.deadline) {
      this.point = crashPoint(this.mgr.host.env().rng);
      this.stage = 'flying'; this.startedAt = now; this.deadline = 0;
      this.broadcast();
    } else if (this.stage === 'flying') {
      const t = (now - this.startedAt) / 1000, m = crashMultiplier(t);
      for (const [id, b] of this.bets) if (b.cashed === null && b.auto !== null && b.auto <= this.point && m >= b.auto) this.cash(id, b, b.auto, true);
      if (m >= this.point) {
        this.stage = 'crashed'; this.until = now + 3500;
        this.history.unshift(this.point); this.history = this.history.slice(0, 10);
        const players = [...this.bets].map(([id, b]) => ({ id, name: this.mgr.host.identity(id)?.name ?? '?', stake: b.bet, payout: b.cashed !== null ? crashReturn(b.bet, b.cashed, this.point) : 0 }));
        for (const [id, b] of this.bets) {
          let r: AuthReply | null = null;
          if (b.cashed === null) r = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
            tablePayout(p, 'crash', b.tx, 0, this.mgr.host.env(id));
            return { view: { crashed: true, point: this.point, table: this.id, round: this.round }, stake: 0, payout: 0, done: true };
          }));
          this.mgr.host.send(id, { t: 'tableRound', table: this.id, game: 'crash', round: this.round, outcome: { crashed: true, point: this.point }, players, you: r });
        }
        for (const id of this.members.keys()) if (!this.bets.has(id)) this.mgr.host.send(id, { t: 'tableRound', table: this.id, game: 'crash', round: this.round, outcome: { crashed: true, point: this.point }, players, you: null });
        this.broadcast();
      }
    } else if (this.stage === 'crashed' && now >= this.until) {
      this.stage = 'open'; this.round++; this.bets.clear();
      this.broadcast();
    }
  }
  /** Temps de vol jusqu'à l'écrasement (tests). */
  get flightMs(): number { return timeToReach(this.point) * 1000; }
  shutdown(): void {
    for (const [id, b] of this.bets) if (b.cashed === null && this.stage !== 'crashed') this.mgr.host.withProfile(id, (p) => tableRefund(p, b.tx, b.bet));
    this.bets.clear();
  }
}

// ---------------------------------------------------------------- blackjack à places
interface BjPending { id: string; bets: number[]; tx: string }
interface BjBox { id: string; bet: number; tx: string }

class BlackjackTable extends Table {
  private stage: 'open' | 'betting' | 'insurance' | 'player' | 'show' = 'open';
  private shoe: Shoe;
  private base = 0;
  private g: Blackjack | null = null;
  /** Mises posées pour la prochaine distribution : une à cinq mains principales par joueur. */
  private pending = new Map<string, BjPending>();
  /** Mains principales servies (index de place du moteur → joueur et mise). */
  private boxes: BjBox[] = [];
  private showUntil = 0;
  private result: Array<{ id: string; name: string; stake: number; payout: number }> = [];
  readonly def: BjTable;
  constructor(mgr: TableManager, game: string, num: number, tier: string) {
    super(mgr, game, num, tier);
    this.def = BJ_TABLES.find((t) => t.id === tier) ?? BJ_TABLES[1];
    this.shoe = new Shoe(mgr.host.env().rng, 6);
  }
  get phase(): string { return this.stage; }
  get idle(): boolean { return this.members.size === 0 && !this.g && this.pending.size === 0; }

  private visibleCount(): number {
    const g = this.g;
    if (!g) return this.base;
    const hidden = g.dealerHoleHidden, settled = g.phase === 'settled';
    const cards = [...g.hands.flatMap((h) => (h.hiddenDouble && !settled ? h.cards.slice(0, -1) : h.cards)), ...g.dealer.filter((_, i) => !(hidden && i === 1))];
    return this.base + cards.reduce((a, c) => a + hiLo(c), 0);
  }

  private boxesOf(id: string): number[] { return this.boxes.map((b, i) => (b.id === id ? i : -1)).filter((i) => i >= 0); }
  /** Première main principale du joueur dont l'assurance reste à décider (−1 : aucune). */
  private insureBox(id: string): number { const g = this.g; return g ? this.boxesOf(id).find((i) => g.canInsure(i)) ?? -1 : -1; }
  /** Places encore libres pour un joueur (une place reste réservée à chaque autre joueur assis qui n'a pas misé). */
  private freeBoxes(id: string): number {
    let taken = 0;
    for (const [pid, p] of this.pending) if (pid !== id) taken += p.bets.length;
    const reserved = [...this.members.keys()].filter((m) => m !== id && !this.pending.has(m)).length;
    return Math.max(0, BJ_MAX_BOXES - taken - reserved);
  }

  data(viewer: string): Record<string, unknown> {
    const g = this.g;
    const mine = this.boxesOf(viewer);
    const view = g ? {
      phase: g.phase, active: g.active, activeSeat: g.activeSeat,
      hands: g.hands.map((h) => ({ ...h, cards: h.hiddenDouble && g.phase !== 'settled' ? h.cards.map((c, i) => (i === h.cards.length - 1 ? HIDDEN : c)) : h.cards })),
      dealer: g.dealer.map((c, i) => (g.dealerHoleHidden && i === 1 ? HIDDEN : c)),
      insurance: g.insurance, insureSeat: this.insureBox(viewer), boxes: g.seats,
      can: mine.length ? this.can(viewer) : null,
    } : null;
    return {
      table: this.def.id, min: this.def.min, max: this.def.max,
      seatsOf: this.boxes.map((b) => ({ id: b.id, name: this.mgr.host.identity(b.id)?.name ?? '?', bet: b.bet })),
      pending: [...this.pending.values()].map((p) => ({ id: p.id, name: this.mgr.host.identity(p.id)?.name ?? '?', bets: p.bets, bet: p.bets.reduce((a, b) => a + b, 0) })),
      myBoxes: mine, mySeat: mine.length ? mine[0] : -1, freeBoxes: this.freeBoxes(viewer),
      view, running: this.visibleCount(), remaining: this.shoe.remaining, result: this.stage === 'show' ? this.result : null,
    };
  }

  private can(id: string): Record<string, boolean> {
    const g = this.g;
    if (!g) return {};
    const turn = g.phase === 'player' && this.boxes[g.activeSeat]?.id === id;
    return { hit: turn && g.canHit(), stand: turn && g.canStand(), double: turn && g.canDouble(), split: turn && g.canSplit(), insurance: this.insureBox(id) >= 0 };
  }

  bet(id: string, raw: unknown, req: string): AuthReply {
    if (this.stage !== 'open' && this.stage !== 'betting') return this.mgr.refuse(id, 'Main en cours : mise pour la prochaine distribution');
    if (this.pending.has(id)) return this.mgr.refuse(id, 'Ta mise est déjà posée');
    if (!this.members.has(id)) return this.mgr.refuse(id, 'Tu n’es pas assis à cette table');
    const tx = this.roundTx(id);
    const free = this.freeBoxes(id);
    let placed: BjPending | null = null;
    const reply = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
      const bets = blackjackBets(obj(raw), this.def);
      if (bets.length > free) throw new AuthError(free > 0 ? `Places libres à cette table : ${free} (une est gardée pour chaque joueur assis)` : 'Plus aucune place libre à cette table');
      if (p.progress && p.progress.level < this.def.level && !(this.def.id === 'vip' && p.progress.unlocks.includes('feature:vip-lounge'))) throw new AuthError(`Table ${this.def.name} : niveau ${this.def.level} requis`);
      const total = bets.reduce((a, b) => a + b, 0);
      tableStake(p, tx, total);
      placed = { id, bets, tx };
      return { view: { accepted: true, table: this.id, round: this.round, req, bets }, stake: total, payout: 0, done: false };
    })) ?? this.mgr.refuse(id, 'Profil introuvable');
    if (reply.ok && placed) {
      this.pending.set(id, placed);
      if (this.stage === 'open') { this.stage = 'betting'; this.deadline = this.mgr.now() + BJ_BET_WINDOW_MS; }
      if ([...this.members.keys()].every((m) => this.pending.has(m))) this.deadline = this.mgr.now();
      this.broadcast();
    }
    return reply;
  }

  act(id: string, raw: unknown, req: string): AuthReply {
    const g = this.g;
    const mine = this.boxesOf(id);
    if (!g || !mine.length) return this.mgr.refuse(id, 'Tu ne joues pas cette main');
    const input = obj(raw), move = input.move, tx = this.boxes[mine[0]].tx;
    const turn = g.phase === 'player' && this.boxes[g.activeSeat]?.id === id;
    const r = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
      let stake = 0;
      if (move === 'insurance') {
        const box = input.seat === undefined ? this.insureBox(id) : input.seat;
        if (typeof box !== 'number' || !mine.includes(box) || !g.canInsure(box)) throw new AuthError('Assurance impossible');
        const take = input.take === true, cost = take ? insuranceCost(this.boxes[box].bet) : 0;
        if (cost > 0) { tableStake(p, `${tx}:assurance:${box}`, cost); stake = cost; }
        g.insure(box, cost > 0);
      } else {
        if (!turn) throw new AuthError('Ce n’est pas ton tour');
        if (move === 'hit') { if (!g.canHit()) throw new AuthError('Action impossible'); g.hit(); }
        else if (move === 'stand') { if (!g.canStand()) throw new AuthError('Action impossible'); g.stand(); }
        else if (move === 'double' || move === 'split') {
          if (!(move === 'double' ? g.canDouble() : g.canSplit())) throw new AuthError('Action impossible');
          const extra = g.current!.bet;
          tableStake(p, move === 'double' ? `${tx}:double:${g.active}:${g.hands.length}` : `${tx}:split:${g.hands.length}`, extra);
          stake = extra;
          if (move === 'double') g.double(input.faceDown === true); else g.split();
        } else throw new AuthError('Action inconnue');
      }
      return { view: { accepted: true, table: this.id, round: this.round, req }, stake, payout: 0, done: false };
    })) ?? this.mgr.refuse(id, 'Profil introuvable');
    if (r.ok) this.afterMove();
    return r;
  }

  private afterMove(): void {
    const g = this.g!;
    if (g.phase === 'insurance') this.deadline = this.deadline || this.mgr.now() + BJ_INSURANCE_MS;
    else if (g.phase === 'player') this.deadline = this.mgr.now() + BJ_TURN_MS;
    if (g.phase === 'settled') this.settle();
    else { this.stage = g.phase === 'insurance' ? 'insurance' : 'player'; this.skipAbsent(); }
    this.broadcast();
  }

  /** Joueur déconnecté : ses mains jouent la règle de table immédiatement (pas d'assurance, il reste). */
  private skipAbsent(): void {
    const g = this.g;
    let guard = 80;
    while (g && guard-- > 0 && (g.phase === 'player' || g.phase === 'insurance')) {
      if (g.phase === 'insurance') {
        let changed = false;
        this.boxes.forEach((b, i) => { if (!this.present(b.id) && g.canInsure(i)) { g.insure(i, false); changed = true; } });
        if (!changed) break;
      } else {
        const b = this.boxes[g.activeSeat];
        if (!b || this.present(b.id)) break;
        g.stand();
      }
    }
    if (g && g.phase === 'settled' && this.stage !== 'show') this.settle();
  }

  private present(id: string): boolean { return !!this.members.get(id)?.connected; }

  tick(now: number): void {
    if (this.stage === 'betting' && now >= this.deadline) this.deal();
    else if ((this.stage === 'player' || this.stage === 'insurance') && this.g && now >= this.deadline) {
      // Délai dépassé : règle de table (assurance refusée, rester)
      this.g.autoAct();
      this.deadline = 0;
      this.afterMove();
    } else if (this.stage === 'show' && now >= this.showUntil) {
      this.stage = 'open'; this.round++; this.g = null; this.boxes = []; this.result = []; this.deadline = 0;
      this.broadcast();
    }
  }

  private deal(): void {
    const players = [...this.pending.values()].sort((a, b) => (this.members.get(a.id)?.seat ?? 9) - (this.members.get(b.id)?.seat ?? 9));
    this.boxes = players.flatMap((p) => p.bets.map((bet) => ({ id: p.id, bet, tx: p.tx })));
    this.pending.clear();
    if (!this.boxes.length) { this.stage = 'open'; this.deadline = 0; this.broadcast(); return; }
    const g = new Blackjack(this.mgr.host.env().rng);
    g.shoe.restore(this.shoe.snapshot());
    if (g.shoe.needsShuffle) { g.shoe.shuffle(); this.base = 0; for (const m of this.members.keys()) this.mgr.host.send(m, { t: 'notice', msg: 'Le croupier remélange le sabot.' }); }
    g.deal(this.boxes.map((b) => b.bet));
    this.g = g;
    this.deadline = 0;
    this.afterMove();
  }

  /** Mises et gains d'un joueur : somme de ses mains principales (séparations, doubles, assurances compris). */
  private playerTotals(g: Blackjack, id: string): { stake: number; payout: number } {
    return this.boxesOf(id).reduce((a, i) => ({ stake: a.stake + g.seatStake(i), payout: a.payout + g.seatPayout(i) }), { stake: 0, payout: 0 });
  }

  private settle(): void {
    const g = this.g!;
    this.shoe.restore(g.shoe.snapshot());
    this.base += [...g.hands.flatMap((h) => h.cards), ...g.dealer].reduce((a, c) => a + hiLo(c), 0);
    const ids = [...new Set(this.boxes.map((b) => b.id))];
    this.result = ids.map((id) => ({ id, name: this.mgr.host.identity(id)?.name ?? '?', ...this.playerTotals(g, id) }));
    this.stage = 'show'; this.deadline = 0; this.showUntil = this.mgr.now() + BJ_SHOW_MS;
    const view = this.data('');
    for (const id of ids) {
      const { payout } = this.playerTotals(g, id), tx = this.boxes.find((b) => b.id === id)!.tx;
      const r = this.mgr.host.withProfile(id, (p) => transact(p, this.mgr.host.env(id), () => {
        tablePayout(p, this.game, tx, payout, this.mgr.host.env(id));
        return { view: { table: this.id, round: this.round, settled: true }, stake: 0, payout, done: true };
      }));
      this.mgr.host.send(id, { t: 'tableRound', table: this.id, game: this.game, round: this.round, outcome: { view: view.view, boxes: this.boxesOf(id) }, players: this.result, you: r });
    }
    for (const id of this.members.keys()) if (!ids.includes(id)) this.mgr.host.send(id, { t: 'tableRound', table: this.id, game: this.game, round: this.round, outcome: { view: view.view, boxes: [] }, players: this.result, you: null });
  }

  onLeave(id: string): void {
    // Mises posées mais pas encore distribuées : rendues au joueur qui part
    const p = this.pending.get(id);
    if (p) { this.pending.delete(id); this.mgr.host.withProfile(id, (pr) => tableRefund(pr, p.tx, p.bets.reduce((a, b) => a + b, 0))); }
    if (this.g && (this.stage === 'player' || this.stage === 'insurance')) this.skipAbsent();
  }

  shutdown(): void {
    for (const p of this.pending.values()) this.mgr.host.withProfile(p.id, (pr) => tableRefund(pr, p.tx, p.bets.reduce((a, b) => a + b, 0)));
    this.pending.clear();
    // Main en cours : règle de table pour tous (restent), puis paiement
    if (this.g && this.g.phase !== 'settled') { this.g.autoFinish(); this.settle(); }
  }
}

// ---------------------------------------------------------------- bancs de machines
class BankTable extends Table {
  private feed: Array<{ id: string; name: string; net: number; label: string; at: number }> = [];
  get phase(): string { return 'open'; }
  get idle(): boolean { return this.members.size === 0; }
  data(): Record<string, unknown> { return { feed: this.feed.slice(-8) }; }
  bet(id: string): AuthReply { return this.mgr.refuse(id, 'Joue directement sur ta machine'); }
  record(id: string, net: number, label: string): void {
    const name = this.mgr.host.identity(id)?.name ?? '?';
    this.feed.push({ id, name, net, label, at: this.mgr.now() }); if (this.feed.length > 20) this.feed.shift();
    for (const m of this.members.keys()) if (m !== id) this.mgr.host.send(m, { t: 'tableEvent', table: this.id, id, name, net, label });
  }
}

// ---------------------------------------------------------------- gestionnaire
export class TableManager {
  private tables = new Map<string, Table[]>();
  private where = new Map<string, Table>();
  constructor(readonly host: TableHost, readonly now: () => number) {}

  refuse(_id: string, error: string): AuthReply { return { ok: false, error, balance: 0 }; }

  private key(game: string, tier: string | null): string { return tier ? `${game}:${tier}` : game; }

  private create(game: string, tier: string | null): Table {
    const list = this.tables.get(this.key(game, tier)) ?? [];
    let num = 1; while (list.some((t) => t.num === num)) num++;
    let t: Table;
    if ((ROUND_GAMES as string[]).includes(game)) t = new RoundTable(this, game as RoundGame, num);
    else if (game === 'crash') t = new CrashTable(this, num);
    else if (game === 'blackjack' || game === 'blackjack-hilo') t = new BlackjackTable(this, game, num, tier ?? 'standard');
    else t = new BankTable(this, game, num, null);
    list.push(t); list.sort((a, b) => a.num - b.num);
    this.tables.set(this.key(game, tier), list);
    return t;
  }

  static known(game: string): boolean { return game in TABLE_CAPACITY; }

  /** Rejoint une table : instance précise, celle d'un ami, ou la première avec une place (amis d'abord). */
  join(id: string, game: string, opts: { tier?: unknown; instance?: unknown; friend?: unknown }): { ok: true; table: Table; note?: string } | { ok: false; msg: string } {
    if (!TableManager.known(game)) return { ok: false, msg: 'Jeu inconnu' };
    const bj = game === 'blackjack' || game === 'blackjack-hilo';
    const tier = bj ? (typeof opts.tier === 'string' && BJ_TABLES.some((t) => t.id === opts.tier) ? opts.tier : 'standard') : null;
    const list = this.tables.get(this.key(game, tier)) ?? [];
    let target: Table | undefined;
    let note: string | undefined;
    if (typeof opts.instance === 'string') {
      target = list.find((t) => t.id === opts.instance);
      if (!target) return { ok: false, msg: 'Cette table n’existe plus' };
      if (target.full && !target.members.has(id)) return { ok: false, msg: 'Table complète (5 joueurs)' };
    } else if (typeof opts.friend === 'string') {
      const ft = this.where.get(opts.friend);
      if (ft && ft.game === game && (ft.tier === tier || !bj)) {
        if (!ft.full || ft.members.has(id)) target = ft;
        else note = 'La table de ton ami est complète : une autre table t’a été attribuée.';
      } else note = 'Ton ami n’est plus à cette table.';
    }
    if (!target) {
      const friends = new Set(this.host.friendsOf(id));
      const open = list.filter((t) => !t.full || t.members.has(id));
      target = open.find((t) => [...t.members.keys()].some((m) => friends.has(m))) ?? open[0];
    }
    if (!target) {
      if (list.length >= MAX_INSTANCES) return { ok: false, msg: 'Toutes les tables sont occupées, réessaie dans un instant' };
      target = this.create(game, tier);
    }
    const cur = this.where.get(id);
    if (cur && cur !== target) this.leave(id);
    if (!target.members.has(id)) target.members.set(id, { id, seat: target.freeSeat(), joined: this.now(), connected: true });
    else target.members.get(id)!.connected = true;
    this.where.set(id, target);
    target.broadcast();
    return { ok: true, table: target, note };
  }

  leave(id: string): void {
    const t = this.where.get(id);
    if (!t) return;
    this.where.delete(id);
    t.members.delete(id);
    t.onLeave(id);
    t.broadcast();
    this.gc();
  }

  /** Déconnexion : le joueur quitte la table (ses mises en cours sont réglées normalement). */
  disconnect(id: string): void { this.leave(id); }

  tableOf(id: string): Table | undefined { return this.where.get(id); }

  list(game: string, viewer: string, tier: string | null = null): TableSummary[] {
    const bj = game === 'blackjack' || game === 'blackjack-hilo';
    const keys = bj && !tier ? [...this.tables.keys()].filter((k) => k.startsWith(`${game}:`)) : [this.key(game, bj ? tier : null)];
    return keys.flatMap((k) => (this.tables.get(k) ?? []).map((t) => t.summary(viewer)));
  }

  /** Tables où se trouvent des amis (menu du téléphone, « rejoindre »). */
  friendsTables(viewer: string): Array<{ id: string; name: string; table: string; game: string }> {
    const out: Array<{ id: string; name: string; table: string; game: string }> = [];
    for (const f of this.host.friendsOf(viewer)) { const t = this.where.get(f); if (t) out.push({ id: f, name: this.host.identity(f)?.name ?? '?', table: t.id, game: t.game }); }
    return out;
  }

  bet(id: string, raw: unknown, req: string): AuthReply {
    const t = this.where.get(id);
    if (!t) return this.refuse(id, 'Rejoins d’abord une table');
    return t.bet(id, raw, req);
  }
  act(id: string, raw: unknown, req: string): AuthReply {
    const t = this.where.get(id);
    if (!t) return this.refuse(id, 'Rejoins d’abord une table');
    return t.act(id, raw, req);
  }

  /** Résultat d'une machine (jeu personnel) : montré aux voisins du banc. */
  personalResult(id: string, game: string, net: number, label: string): void {
    const t = this.where.get(id);
    if (t instanceof BankTable && t.game === game) t.record(id, net, label);
  }

  tick(): void {
    const now = this.now();
    for (const list of this.tables.values()) for (const t of list) t.tick(now);
    this.gc();
  }

  private gc(): void {
    for (const [k, list] of this.tables) {
      const keep = list.filter((t) => !t.idle || t.num === 1);
      if (keep.length !== list.length) this.tables.set(k, keep);
      if (!keep.length || (keep.length === 1 && keep[0].idle && keep[0].members.size === 0 && !this.where.size)) { /* conservée : table n° 1 */ }
    }
  }

  shutdown(): void { for (const list of this.tables.values()) for (const t of list) t.shutdown(); }

  /** Nombre d'instances d'un jeu (tests, modération). */
  count(game: string, tier: string | null = null): number { return (this.tables.get(this.key(game, tier)) ?? []).length; }
}
