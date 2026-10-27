// Règles du casino exécutées par l'autorité (téléphone hors ligne, serveur en ligne). Toutes les mises et tous les
// gains sont en JETONS de casino (authority/economy.ts), distincts des KSCoins.
// Jeux en un coup (roulette, machines, baccarat, craps, keno, Plinko, Direct Poker) : mise et gain réglés
// dans la même opération, l'animation du téléphone ne fait que montrer le résultat.
// Jeux en plusieurs étapes (blackjack, poker, courses, Crash) : une « session » secrète est conservée ;
// si le joueur disparaît, abandonSession() la termine selon la règle de table.
import { bacSettle, playBaccarat, type BacBet } from '../games/logic/baccarat';
import { BJ_TABLES, Blackjack, handState, insuranceCost, type BjTable, type Hand } from '../games/logic/blackjack';
import { hiLo, Shoe, type Card } from '../games/logic/cards';
import { crapsSettle, playCraps, type CrapsBet } from '../games/logic/craps';
import { crashMultiplier, crashPoint, crashReturn, timeToReach } from '../games/logic/crash';
import { drawKeno, kenoReturn } from '../games/logic/keno';
import { isPlinkoRisk, plinkoPath, plinkoReturn } from '../games/logic/plinko';
import { DIRECT_POKER, evaluate, JACKS_OR_BETTER, payout as pokerPayout } from '../games/logic/poker';
import { makeField, raceOrder, raceReturn, type Horse } from '../games/logic/races';
import { settleBets, spinWheel, type Bet, type BetKind } from '../games/logic/roulette';
import { lineReturnStops, SLOT_MACHINES, spinStops } from '../games/logic/slotMachines';
import { onRound } from './progress';
import { amount, AuthError, incStat, MAX_BET, MAX_TOTAL_STAKE, obj, type AuthEnv, type AuthState, type Session } from './types';
import { chips, ensureEconomy } from './economy';

export interface CasinoResult { view: Record<string, unknown>; stake: number; payout: number; done: boolean }

export const CASINO_GAMES = ['roulette', 'slots', 'baccarat', 'craps', 'keno', 'plinko', 'direct-poker', 'poker', 'races', 'crash', 'blackjack', 'blackjack-hilo'] as const;

// ---------------------------------------------------------------- outils
function settleNow(s: AuthState, game: string, reqId: string, stake: number, payout: number, env: AuthEnv): string {
  const tx = `${game}:${reqId}`;
  if (!chips.fresh(s, tx)) throw new AuthError('Requête déjà traitée');
  chips.spend(s, stake, `${tx}:mise`);
  chips.credit(s, Math.floor(payout), `${tx}:gain`);
  incStat(s, `plays.${game}`);
  onRound(s, game, env); // XP et missions (manche terminée)
  return tx;
}

function open(s: AuthState, game: string, reqId: string, stake: number, data: Record<string, unknown>, env: AuthEnv): Session {
  if (s.sessions[game] && s.sessions[game].stake > 0) throw new AuthError('Une manche est déjà en cours');
  const tx = `${game}:${reqId}`;
  // Identifiant neuf obligatoire : une mise acceptée doit toujours pouvoir recevoir son gain
  if (!chips.fresh(s, tx)) throw new AuthError('Requête déjà traitée');
  if (stake > 0) chips.spend(s, stake, `${tx}:mise`);
  const sess: Session = { game, tx, stake, at: env.now, data };
  s.sessions[game] = sess;
  if (stake > 0) incStat(s, `plays.${game}`);
  return sess;
}

function close(s: AuthState, game: string, payout: number, env: AuthEnv): void {
  const sess = s.sessions[game];
  if (!sess) return;
  chips.credit(s, Math.floor(payout), `${sess.tx}:gain`);
  delete s.sessions[game];
  if (sess.stake > 0) onRound(s, game, env); // XP et missions (manche terminée)
}

function need(s: AuthState, game: string): Session {
  const sess = s.sessions[game];
  if (!sess) throw new AuthError('Aucune manche en cours');
  return sess;
}

const BET_KINDS = new Set(['red', 'black', 'odd', 'even', 'low', 'high']);
export function rouletteBets(v: unknown): Bet[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 60) throw new AuthError('Mises invalides');
  return v.map((b) => {
    const o = obj(b), k = obj(o.kind);
    let kind: BetKind;
    if (k.type === 'number' && Number.isInteger(k.n) && (k.n as number) >= 0 && (k.n as number) <= 36) kind = { type: 'number', n: k.n as number };
    else if (k.type === 'dozen' && [1, 2, 3].includes(k.d as number)) kind = { type: 'dozen', d: k.d as 1 | 2 | 3 };
    else if (k.type === 'column' && [1, 2, 3].includes(k.c as number)) kind = { type: 'column', c: k.c as 1 | 2 | 3 };
    else if (typeof k.type === 'string' && BET_KINDS.has(k.type)) kind = { type: k.type } as BetKind;
    else throw new AuthError('Mise de roulette inconnue');
    return { kind, amount: amount(o.amount) };
  });
}

export function namedBets<K extends string>(v: unknown, keys: readonly K[]): Partial<Record<K, number>> {
  const o = obj(v), out: Partial<Record<K, number>> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!keys.includes(k as K)) throw new AuthError('Mise inconnue');
    out[k as K] = amount(val);
  }
  if (!Object.keys(out).length) throw new AuthError('Aucune mise');
  return out;
}

export const total = (bets: Record<string, number | undefined>) => Object.values(bets).reduce<number>((a, b) => a + (b ?? 0), 0);
export function checkTotal(n: number): number { if (n <= 0 || n > MAX_TOTAL_STAKE) throw new AuthError('Mise totale invalide'); return n; }

// ---------------------------------------------------------------- blackjack
interface ShoeState { cards: Card[]; shuffles: number; base: number }
const HIDDEN: Card = { rank: 0, suit: '♠' };

function loadShoe(s: AuthState, game: string, env: AuthEnv): ShoeState {
  const raw = s.sessions[`shoe:${game}`]?.data as unknown as ShoeState | undefined;
  if (raw && Array.isArray(raw.cards) && raw.cards.length > 20) return raw;
  const shoe = new Shoe(env.rng, 6);
  return { cards: shoe.snapshot(), shuffles: 1, base: 0 };
}
function saveShoe(s: AuthState, game: string, st: ShoeState, env: AuthEnv): void {
  s.sessions[`shoe:${game}`] = { game, tx: '', stake: 0, at: env.now, data: st as unknown as Record<string, unknown> };
}

function engineFrom(snapshot: unknown, shoe: ShoeState, env: AuthEnv): Blackjack {
  const g = Blackjack.restore(snapshot as ReturnType<Blackjack['snapshot']>, env.rng);
  g.shoe.shuffles = shoe.shuffles;
  return g;
}

/** Carte d'une main visible du joueur (la carte d'un double « face cachée » reste retournée jusqu'au règlement). */
const handCardsShown = (h: Hand, settled: boolean): Hand['cards'] => (h.hiddenDouble && !settled ? h.cards.map((c, i) => (i === h.cards.length - 1 ? HIDDEN : c)) : h.cards);

/** Vue publique : la carte cachée du croupier, celle d'un double face cachée et le sabot ne sont jamais envoyés. */
export function blackjackView(g: Blackjack, shoe: ShoeState, hilo: boolean): Record<string, unknown> {
  const hidden = g.dealerHoleHidden, settled = g.phase === 'settled';
  const hands = g.hands.map((h) => ({ ...h, cards: handCardsShown(h, settled), state: handState(h, g.phase) }));
  const visible = [...hands.flatMap((h) => h.cards).filter((c) => c.rank > 0), ...g.dealer.filter((_, i) => !(hidden && i === 1))];
  return {
    phase: g.phase, active: g.active, hands,
    dealer: g.dealer.map((c, i) => (hidden && i === 1 ? HIDDEN : c)),
    can: { hit: g.canHit(), stand: g.canStand(), double: g.canDouble(), split: g.canSplit(), insurance: insureSeat(g) >= 0 },
    // Assurance par main principale (place) : décisions prises, et prochaine place à décider (−1 : aucune)
    insurance: g.insurance, insureSeat: insureSeat(g), boxes: g.seats,
    remaining: g.shoe.remaining, shuffles: shoe.shuffles,
    // Comptage Hi-Lo des cartes visibles (outil facultatif, affiché à la demande ; toujours fourni depuis la refonte)
    running: shoe.base + visible.reduce((a, c) => a + hiLo(c), 0),
    hilo,
  };
}

/** Première main principale dont l'assurance reste à décider (−1 : aucune). */
export function insureSeat(g: Blackjack): number { for (let i = 0; i < g.seats; i++) if (g.canInsure(i)) return i; return -1; }

/** Nombre maximal de mains principales jouées en même temps par un joueur (chacune avec sa mise). */
export const BJ_MAX_BOXES = 5;

/**
 * Mises d'une manche de blackjack : `bets` (1 à 5 mains principales, une mise par main) ou `bet` (une main).
 * Chaque mise respecte le minimum et le maximum de la table ; le total doit être couvert par le solde.
 */
export function blackjackBets(input: Record<string, unknown>, table: BjTable | undefined): number[] {
  const raw = input.bets !== undefined ? input.bets : [input.bet];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > BJ_MAX_BOXES) throw new AuthError(`De 1 à ${BJ_MAX_BOXES} mains par manche`);
  return raw.map((v) => {
    const b = amount(v, table?.max ?? MAX_BET);
    if (table && b < table.min) throw new AuthError(`Mise minimale à cette table : ${table.min} jetons`);
    return b;
  });
}

function blackjack(s: AuthState, game: string, action: string, input: Record<string, unknown>, reqId: string, env: AuthEnv): CasinoResult {
  const hilo = game === 'blackjack-hilo';
  const shoe = loadShoe(s, game, env);
  let g: Blackjack;
  let stake = 0;
  if (action === 'tip') {
    // Pourboire au croupier : jetons retirés (jamais rendus), autorisé entre les manches comme pendant une manche
    const tip = amount(input.amount, 1000);
    if (chips.balance(s) < tip) throw new AuthError('Pas assez de jetons pour ce pourboire');
    chips.spend(s, tip, `${game}:tip:${reqId}`);
    incStat(s, 'tips'); incStat(s, 'tips.total', tip);
    return { view: { tip }, stake: 0, payout: 0, done: false };
  }
  if (action === 'deal') {
    // Table choisie : mise initiale entre le minimum et le maximum, niveau requis (ancienne version : limites d'origine)
    const table = typeof input.table === 'string' ? BJ_TABLES.find((t) => t.id === input.table) : undefined;
    if (input.table !== undefined && !table) throw new AuthError('Table inconnue');
    const bets = blackjackBets(input, table);
    const bet = bets.reduce((a, b) => a + b, 0);
    if (table && s.progress && s.progress.level < table.level && !(table.id === 'vip' && s.progress.unlocks.includes('feature:vip-lounge'))) throw new AuthError(`Table ${table.name} : niveau ${table.level} requis`);
    if (chips.balance(s) < bet) throw new AuthError(bets.length > 1 ? `Pas assez de jetons pour ${bets.length} mains (${bet} jetons)` : 'Pas assez de jetons : passe à la caisse du casino');
    g = new Blackjack(env.rng);
    g.shoe.restore(shoe.cards);
    if (g.shoe.needsShuffle) { g.shoe.shuffle(); shoe.shuffles++; shoe.base = 0; }
    g.deal(bets);
    open(s, game, reqId, bet, { snapshot: g.snapshot(), table: table?.id ?? null }, env);
    stake = bet;
  } else if (action === 'act') {
    const sess = need(s, game);
    g = engineFrom(sess.data.snapshot, shoe, env);
    const move = input.move;
    if (move === 'insurance') {
      // Assurance (croupier As) : moitié de la mise au plus, payée 2:1 si le croupier a un blackjack
      // Une décision par main principale, dans l'ordre (identifiant de transaction propre à chaque main)
      const seat = input.seat === undefined ? insureSeat(g) : input.seat;
      if (typeof seat !== 'number' || !Number.isInteger(seat) || !g.canInsure(seat)) throw new AuthError('Assurance impossible');
      const take = input.take === true;
      const cost = take ? insuranceCost(g.hands.find((h) => (h.seat ?? 0) === seat)!.bet) : 0;
      if (cost > 0) { chips.spend(s, cost, `${sess.tx}:assurance${seat ? `:${seat}` : ''}`); sess.stake += cost; stake = cost; }
      g.insure(seat, take && cost > 0);
    } else if (move === 'double' || move === 'split') {
      if (!(move === 'double' ? g.canDouble() : g.canSplit())) throw new AuthError('Action impossible');
      const extra = g.current!.bet;
      // Identifiant unique : une main ne double qu'une fois ; chaque séparation crée une nouvelle main
      chips.spend(s, extra, move === 'double' ? `${sess.tx}:double:${g.active}:${g.hands.length}` : `${sess.tx}:split:${g.hands.length}`);
      sess.stake += extra; stake = extra;
      if (move === 'double') g.double(input.faceDown === true); else g.split();
    } else if (move === 'hit') { if (!g.canHit()) throw new AuthError('Action impossible'); g.hit(); }
    else if (move === 'stand') { if (!g.canStand()) throw new AuthError('Action impossible'); g.stand(); }
    else throw new AuthError('Action inconnue');
    sess.data = { ...sess.data, snapshot: g.snapshot() };
  } else throw new AuthError('Action inconnue');
  const view = blackjackView(g, shoe, hilo);
  shoe.cards = g.shoe.snapshot();
  let payout = 0;
  if (g.phase === 'settled') {
    payout = g.totalPayout;
    shoe.base += [...g.hands.flatMap((h) => h.cards), ...g.dealer].reduce((a, c) => a + hiLo(c), 0);
    close(s, game, payout, env);
    view.running = shoe.base;
    view.totalStake = g.totalStake;
  }
  saveShoe(s, game, shoe, env);
  return { view, stake, payout, done: g.phase === 'settled' };
}

// ---------------------------------------------------------------- Crash
export const CRASH_AUTOS = [1.5, 2, 3, 5, 10];

function crashEval(s: AuthState, env: AuthEnv, cashout: boolean): CasinoResult {
  const sess = need(s, 'crash'), d = sess.data;
  const bet = d.bet as number, point = d.point as number, auto = d.auto as number | null;
  const t = (env.now - (d.startedAt as number)) / 1000;
  const m = crashMultiplier(Math.max(0, t));
  // Encaissement automatique déjà atteint
  if (auto !== null && auto <= point && m >= auto) {
    const pay = crashReturn(bet, auto, point); close(s, 'crash', pay, env);
    return { view: { cashedAt: auto, point, auto: true }, stake: 0, payout: pay, done: true };
  }
  if (m >= point) { close(s, 'crash', 0, env); return { view: { crashed: true, point }, stake: 0, payout: 0, done: true }; }
  if (cashout) {
    const pay = crashReturn(bet, m, point); close(s, 'crash', pay, env);
    return { view: { cashedAt: m, point }, stake: 0, payout: pay, done: true };
  }
  return { view: { running: true, multiplier: m }, stake: 0, payout: 0, done: false };
}

// ---------------------------------------------------------------- point d'entrée
export function casinoAction(s: AuthState, game: string, action: string, rawInput: unknown, reqId: string, env: AuthEnv): CasinoResult {
  ensureEconomy(s);
  const input = obj(rawInput);
  const rng = env.rng;
  switch (game) {
    case 'roulette': {
      if (action !== 'play') break;
      const bets = rouletteBets(input.bets);
      const stake = checkTotal(bets.reduce((a, b) => a + b.amount, 0));
      const result = spinWheel(rng), payout = settleBets(bets, result);
      settleNow(s, game, reqId, stake, payout, env);
      return { view: { result }, stake, payout, done: true };
    }
    case 'slots': {
      if (action !== 'play') break;
      const def = SLOT_MACHINES.find((m) => m.id === input.machine);
      if (!def) throw new AuthError('Machine inconnue');
      const bet = amount(input.bet, 100);
      const stops = spinStops(rng), payout = Math.floor(lineReturnStops(def, stops) * bet);
      settleNow(s, game, reqId, bet, payout, env);
      return { view: { stops }, stake: bet, payout, done: true };
    }
    case 'baccarat': {
      if (action !== 'play') break;
      const bets = namedBets<BacBet>(input.bets, ['player', 'banker', 'tie']);
      const stake = checkTotal(total(bets));
      const shoe = new Shoe(rng, 8);
      const round = playBaccarat(() => shoe.draw()), payout = bacSettle(bets, round.winner);
      settleNow(s, game, reqId, stake, payout, env);
      return { view: { player: round.player, banker: round.banker, winner: round.winner }, stake, payout, done: true };
    }
    case 'craps': {
      if (action !== 'play') break;
      const bets = namedBets<CrapsBet>(input.bets, ['pass', 'dontpass', 'field']);
      const stake = checkTotal(total(bets));
      const round = playCraps(rng), payout = crapsSettle(bets, round);
      settleNow(s, game, reqId, stake, payout, env);
      return { view: { round }, stake, payout, done: true };
    }
    case 'keno': {
      if (action !== 'play') break;
      const picks = input.picks;
      if (!Array.isArray(picks) || picks.length < 1 || picks.length > 10 || new Set(picks).size !== picks.length || !picks.every((n) => Number.isInteger(n) && n >= 1 && n <= 80)) throw new AuthError('Numéros invalides');
      const bet = amount(input.bet, 100);
      const drawn = drawKeno(rng), payout = kenoReturn(picks as number[], drawn, bet);
      settleNow(s, game, reqId, bet, payout, env);
      return { view: { drawn }, stake: bet, payout, done: true };
    }
    case 'plinko': {
      if (action !== 'play') break;
      const bet = amount(input.bet, 100);
      // Niveau de risque (absent : risque moyen, table d'origine)
      if (input.risk !== undefined && !isPlinkoRisk(input.risk)) throw new AuthError('Niveau de risque inconnu');
      const risk = isPlinkoRisk(input.risk) ? input.risk : 'medium';
      const path = plinkoPath(rng), payout = plinkoReturn(path, bet, risk);
      settleNow(s, game, reqId, bet, payout, env);
      return { view: { path, risk }, stake: bet, payout, done: true };
    }
    case 'direct-poker': {
      if (action !== 'play') break;
      const bet = amount(input.bet, 100);
      const shoe = new Shoe(rng, 1), hand = [0, 1, 2, 3, 4].map(() => shoe.draw());
      const payout = pokerPayout(DIRECT_POKER, evaluate(hand)) * bet;
      settleNow(s, game, reqId, bet, payout, env);
      return { view: { hand }, stake: bet, payout, done: true };
    }
    case 'poker': {
      if (action === 'deal') {
        const bet = amount(input.bet, 100);
        const shoe = new Shoe(rng, 1), hand = [0, 1, 2, 3, 4].map(() => shoe.draw());
        open(s, game, reqId, bet, { hand, deck: shoe.snapshot(), bet }, env);
        return { view: { hand }, stake: bet, payout: 0, done: false };
      }
      if (action === 'draw') {
        const sess = need(s, game), held = input.held;
        if (!Array.isArray(held) || held.length !== 5) throw new AuthError('Choix invalide');
        const deck = (sess.data.deck as Card[]).slice(), hand = (sess.data.hand as Card[]).map((c, i) => (held[i] === true ? c : deck.pop()!));
        const payout = pokerPayout(JACKS_OR_BETTER, evaluate(hand)) * (sess.data.bet as number);
        close(s, game, payout, env);
        return { view: { hand }, stake: 0, payout, done: true };
      }
      break;
    }
    case 'races': {
      if (action === 'field') {
        if (s.sessions.races && s.sessions.races.stake > 0) delete s.sessions.races;
        const field = makeField(rng);
        s.sessions.races = { game, tx: '', stake: 0, at: env.now, data: { field } };
        return { view: { field }, stake: 0, payout: 0, done: false };
      }
      if (action === 'run') {
        const sess = need(s, game), field = sess.data.field as Horse[];
        const raw = obj(input.bets), bets: Record<number, number> = {};
        for (const [k, v] of Object.entries(raw)) { const i = Number(k); if (!Number.isInteger(i) || i < 0 || i >= field.length) throw new AuthError('Cheval inconnu'); bets[i] = amount(v); }
        const stake = checkTotal(total(bets));
        delete s.sessions.races;
        const order = raceOrder(field, rng), payout = raceReturn(field, bets, order[0]);
        settleNow(s, game, reqId, stake, payout, env);
        return { view: { order, field }, stake, payout, done: true };
      }
      break;
    }
    case 'crash': {
      if (action === 'start') {
        const bet = amount(input.bet, 100);
        const auto = input.auto === null || input.auto === undefined ? null : (CRASH_AUTOS.includes(input.auto as number) ? (input.auto as number) : null);
        open(s, game, reqId, bet, { bet, point: crashPoint(rng), auto, startedAt: env.now }, env);
        return { view: { startedAt: env.now }, stake: bet, payout: 0, done: false };
      }
      if (action === 'status') return crashEval(s, env, false);
      if (action === 'cashout') return crashEval(s, env, true);
      break;
    }
    case 'blackjack': case 'blackjack-hilo':
      return blackjack(s, game, action, input, reqId, env);
  }
  throw new AuthError('Jeu ou action inconnus');
}

/** Termine une manche abandonnée selon la règle de table. Renvoie le gain versé. */
export function abandonSession(s: AuthState, game: string, env: AuthEnv): number {
  ensureEconomy(s);
  const sess = s.sessions[game];
  if (!sess || game.startsWith('shoe:')) return 0;
  let payout = 0;
  try {
    switch (game) {
      case 'blackjack': case 'blackjack-hilo': {
        const shoe = loadShoe(s, game, env);
        const g = engineFrom(sess.data.snapshot, shoe, env);
        g.autoFinish(); payout = g.totalPayout;
        shoe.cards = g.shoe.snapshot(); saveShoe(s, game, shoe, env);
        break;
      }
      case 'poker': payout = pokerPayout(JACKS_OR_BETTER, evaluate(sess.data.hand as Card[])) * (sess.data.bet as number); break;
      case 'crash': {
        const d = sess.data, auto = d.auto as number | null, point = d.point as number;
        payout = crashReturn(d.bet as number, auto !== null && auto <= point ? auto : null, point);
        break;
      }
      default: payout = 0;
    }
  } catch { payout = sess.stake; } // état illisible : mise rendue
  // Appelé hors transaction (démarrage, déconnexion) : jamais d'exception, et le gain dû est toujours versé
  try { close(s, game, payout, env); } catch (e) {
    console.error('[KingSea] règlement de manche interrompue', e);
    chips.earn(s, Math.floor(payout), `${sess.tx}:gain:reprise`);
  }
  delete s.sessions[game];
  return Math.floor(payout);
}

/** Sessions de jeu actives (hors sabots persistants). */
export function activeSessions(s: AuthState): Session[] {
  return Object.entries(s.sessions).filter(([k, v]) => !k.startsWith('shoe:') && v.stake > 0).map(([, v]) => v);
}

/** Durée minimale d'une manche de Crash avant écrasement (utile aux tests). */
export const crashDuration = (point: number): number => timeToReach(point) * 1000;
