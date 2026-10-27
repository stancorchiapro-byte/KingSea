// Progression du joueur, exécutée par l'autorité (téléphone hors ligne, serveur en ligne) :
// expérience (XP) et niveaux, récompenses de niveau (KSCoins, meubles, titres, badges, tenues, accès),
// découvertes des lieux, missions quotidiennes et hebdomadaires. Toutes les attributions sont idempotentes
// (identifiants de transaction) et plafonnées : impossible de « farmer » l'XP en répétant une action triviale.
import { FURNITURE_BY_ID, STARTER_FURNITURE, STARTER_LAYOUT } from '../data/furniture';
import { AuthError, ledger, type AuthEnv, type AuthState } from './types';
import { chips as chipLedger } from './economy';
import { PASS, passAddXp, type PassState } from './pass';

// ---------------------------------------------------------------- état
export interface ProgressState {
  xp: number;
  level: number;
  /** XP d'activité gagnée aujourd'hui (plafonnée) et jour correspondant. */
  xpDay: string; xpToday: number;
  /** XP par jeu aujourd'hui (plafond par jeu). */
  gameXpToday: Record<string, number>;
  /** Lieux découverts et jeux essayés (récompenses uniques). */
  discovered: string[];
  tried: string[];
  /** Déblocages : 'furn:<id>', 'title:<nom>', 'badge:<nom>', 'hat:<id>', 'outfit:<id>', 'feature:<id>', 'style:<id>'. */
  unlocks: string[];
  title: string | null;
  /** Passe de croisière gratuit (saison, XP de passe, paliers réclamés). */
  pass?: PassState;
}

export interface MissionProgress { id: string; progress: number; distinct?: string[]; claimed: boolean }
export interface MissionsState { day: string; week: string; daily: MissionProgress[]; weekly: MissionProgress[] }

export interface RoomItem { uid: string; item: string; x: number; y: number; rot: 0 | 1 }
export interface RoomState { owned: Record<string, number>; placed: RoomItem[]; style: string; nextUid: number }

/** État de progression d'un joueur (ajouté à AuthState). */
export interface ProgressHolder { progress?: ProgressState; missions?: MissionsState; room?: RoomState }

export function newProgress(): ProgressState {
  return { xp: 0, level: 1, xpDay: '', xpToday: 0, gameXpToday: {}, discovered: [], tried: [], unlocks: [], title: null };
}
export function newRoom(): RoomState {
  return { owned: Object.fromEntries(STARTER_FURNITURE.map((id) => [id, 1])), placed: STARTER_LAYOUT.map((p, i) => ({ uid: `r${i + 1}`, item: p.item, x: p.x, y: p.y, rot: 0 as const })), style: 'marin', nextUid: STARTER_LAYOUT.length + 1 };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strArr = (v: unknown, max = 200): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
const int = (v: unknown, fb: number, min = 0, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : fb);

/** Valide/complète l'état de progression (sauvegardes anciennes ou abîmées). */
export function normalizeProgress(raw: unknown): ProgressState {
  const b = newProgress();
  if (!isObj(raw)) return b;
  const xp = int(raw.xp, 0);
  const games: Record<string, number> = {};
  if (isObj(raw.gameXpToday)) for (const [k, v] of Object.entries(raw.gameXpToday)) if (typeof v === 'number') games[k] = int(v, 0);
  return {
    xp, level: levelForXp(xp),
    xpDay: typeof raw.xpDay === 'string' ? raw.xpDay : '', xpToday: int(raw.xpToday, 0), gameXpToday: games,
    discovered: strArr(raw.discovered), tried: strArr(raw.tried), unlocks: strArr(raw.unlocks, 500),
    title: typeof raw.title === 'string' ? raw.title : null,
    pass: normalizePass(raw.pass),
  };
}

function normalizePass(raw: unknown): PassState {
  if (!isObj(raw) || raw.season !== PASS.season) return { season: PASS.season, xp: 0, claimed: [] };
  const claimed = Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter((x): x is number => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= PASS.tiers.length))] : [];
  return { season: PASS.season, xp: int(raw.xp, 0), claimed };
}
export function normalizeMissions(raw: unknown): MissionsState | undefined {
  if (!isObj(raw)) return undefined;
  const list = (v: unknown): MissionProgress[] => (Array.isArray(v) ? v.filter(isObj).map((m) => ({ id: String(m.id), progress: int(m.progress, 0), distinct: m.distinct ? strArr(m.distinct, 50) : undefined, claimed: m.claimed === true })).slice(0, 6) : []);
  return { day: String(raw.day ?? ''), week: String(raw.week ?? ''), daily: list(raw.daily), weekly: list(raw.weekly) };
}
export function normalizeRoom(raw: unknown): RoomState {
  const b = newRoom();
  if (!isObj(raw)) return b;
  const owned: Record<string, number> = {};
  if (isObj(raw.owned)) for (const [k, v] of Object.entries(raw.owned)) if (FURNITURE_BY_ID.has(k)) owned[k] = int(v, 0, 0, 20);
  for (const id of STARTER_FURNITURE) owned[id] = Math.max(1, owned[id] ?? 0);
  const placed: RoomItem[] = Array.isArray(raw.placed) ? raw.placed.filter(isObj).filter((p) => FURNITURE_BY_ID.has(String(p.item))).slice(0, 60)
    .map((p, i) => ({ uid: typeof p.uid === 'string' ? p.uid : `r${i + 100}`, item: String(p.item), x: int(p.x, 1, 0, 40), y: int(p.y, 1, 0, 40), rot: p.rot === 1 ? 1 : 0 })) : b.placed;
  return { owned, placed, style: typeof raw.style === 'string' ? raw.style : 'marin', nextUid: int(raw.nextUid, placed.length + 2, 1) };
}

/** XP d'ancienneté accordée une fois aux joueurs d'avant la mise à jour : 5 XP par manche déjà jouée (1 000 max). */
export function legacyXp(stats: Record<string, number>): number {
  let plays = 0;
  for (const [k, v] of Object.entries(stats)) if (k.startsWith('plays.') && Number.isFinite(v)) plays += Math.max(0, v);
  return Math.min(1000, Math.floor(plays) * 5);
}

/** Garantit la présence des champs de progression (anciens profils, tests). */
export function ensureProgress(s: AuthState): asserts s is AuthState & Required<ProgressHolder> {
  const h = s as AuthState & ProgressHolder;
  const p = h.progress as Partial<ProgressState> | undefined;
  if (!p || typeof p.xp !== 'number' || !Array.isArray(p.unlocks) || !Array.isArray(p.tried) || typeof p.gameXpToday !== 'object') h.progress = normalizeProgress(p);
  const r = h.room as Partial<RoomState> | undefined;
  if (!r || typeof r.owned !== 'object' || !Array.isArray(r.placed)) h.room = normalizeRoom(r);
  if (h.missions && (!Array.isArray(h.missions.daily) || !Array.isArray(h.missions.weekly))) h.missions = normalizeMissions(h.missions);
}

// ---------------------------------------------------------------- niveaux (sans limite)
/** Aucun niveau maximal : la progression continue indéfiniment (les grands niveaux demandent beaucoup d'XP). */
export const MAX_LEVEL = Number.POSITIVE_INFINITY;
/** Garde-fou de calcul : niveau au-delà duquel on ne cherche plus (inatteignable en pratique : > 10¹² XP). */
const LEVEL_SEARCH_CAP = 100_000;
/**
 * XP nécessaire pour passer du niveau L au niveau L+1.
 * Jusqu'au niveau 10 : 80 + 40 × L (inchangé) ; ensuite + 3 × (L − 10)² : la courbe s'accentue sans devenir
 * exponentielle (niveau 20 ≈ 1 180 XP par niveau, niveau 50 ≈ 6 900, niveau 100 ≈ 28 400).
 */
export const xpToNext = (level: number): number => 80 + 40 * level + 3 * Math.max(0, level - 10) ** 2;
/** XP totale nécessaire pour atteindre le niveau L (forme close, exacte pour les entiers). */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.min(Math.floor(level), LEVEL_SEARCH_CAP));
  const n = L - 1; // somme de l = 1 à n
  let t = 80 * n + 40 * (n * (n + 1)) / 2;
  const m = Math.max(0, n - 10); // somme de 3 × k² pour k = 1..m
  t += 3 * (m * (m + 1) * (2 * m + 1)) / 6;
  return t;
}
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  // Recherche dichotomique (xpForLevel est croissante)
  let lo = 1, hi = LEVEL_SEARCH_CAP;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (xpForLevel(mid) <= xp) lo = mid; else hi = mid - 1; }
  return lo;
}
/** Progression vers le niveau suivant (pour la barre d'XP). */
export function levelProgress(xp: number): { level: number; into: number; needed: number; ratio: number } {
  const level = levelForXp(xp);
  const into = xp - xpForLevel(level), needed = xpToNext(level);
  return { level, into, needed, ratio: Math.max(0, Math.min(1, into / needed)) };
}

export interface LevelReward { coins?: number; chips?: number; unlocks?: string[] }
/** Niveau auquel une clé de déblocage est obtenue (null : pas une récompense de niveau). */
export function unlockLevel(key: string): number | null {
  for (const [lv, r] of Object.entries(LEVEL_REWARDS)) if (r.unlocks?.includes(key)) return Number(lv);
  return null;
}

/**
 * Paliers de récompenses. Au-delà, chaque niveau rapporte 50 KSCoins ; tous les 5 niveaux, 150 KSCoins et
 * 100 jetons ; tous les 25 niveaux à partir de 50, un badge de prestige.
 */
export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2: { coins: 100, unlocks: ['furn:lamp-deco', 'style:moderne'] },
  3: { chips: 100, unlocks: ['title:Matelot', 'furn:plant-palm', 'style:minimaliste', 'emote:bow'] },
  4: { coins: 150, unlocks: ['hat:hautdeforme', 'emote:salute'] },
  5: { unlocks: ['feature:vip-lounge', 'badge:VIP', 'style:luxe', 'emote:sigh'] },
  6: { chips: 150, unlocks: ['furn:sofa-velvet', 'emote:shrug'] },
  7: { coins: 200, unlocks: ['title:Habitué du casino'] },
  8: { unlocks: ['furn:aquarium', 'style:futuriste', 'emote:think'] },
  9: { chips: 200, unlocks: ['outfit:smoking'] },
  10: { coins: 300, unlocks: ['title:Officier', 'furn:piano', 'feature:panorama'] },
  12: { unlocks: ['furn:chandelier', 'emote:spyglass'] },
  14: { unlocks: ['title:Capitaine de soirée', 'hat:amiral'] },
  15: { coins: 500, chips: 300, unlocks: ['furn:statue-gold', 'emote:stretch'] },
  18: { unlocks: ['jewel:medaille'] },
  20: { coins: 300, unlocks: ['title:Amiral', 'furn:yacht-model'] },
  25: { coins: 1000, unlocks: ['badge:Légende'] },
  30: { chips: 500, unlocks: ['title:Légende des mers', 'hat:couronne'] },
  40: { coins: 600, unlocks: ['title:Seigneur des océans'] },
  50: { coins: 1000, chips: 1000, unlocks: ['title:Grand Amiral', 'badge:Prestige I'] },
};
export function rewardFor(level: number): LevelReward {
  const fixed = LEVEL_REWARDS[level];
  if (fixed) return fixed;
  if (level <= 10) return {};
  // Prestige : un badge tous les 25 niveaux à partir de 75 (Prestige II, III…)
  if (level >= 75 && level % 25 === 0) return { coins: 1000, chips: 500, unlocks: [`badge:Prestige ${roman(level / 25 - 1)}`] };
  if (level % 5 === 0) return { coins: 150, chips: 100 };
  return { coins: 50 };
}

function roman(n: number): string {
  const v: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '', k = Math.max(1, Math.floor(n));
  for (const [x, r] of v) while (k >= x) { out += r; k -= x; }
  return out;
}

/** Déblocages acquis par le seul niveau (pour l'affichage et les vérifications). */
export function unlocksUpTo(level: number): string[] {
  const out: string[] = [];
  for (let l = 2; l <= Math.min(level, LEVEL_SEARCH_CAP); l++) out.push(...(rewardFor(l).unlocks ?? []));
  return out;
}

export function hasUnlock(s: AuthState, key: string): boolean {
  const p = (s as AuthState & ProgressHolder).progress;
  return !!p && p.unlocks.includes(key);
}

export function unlock(s: AuthState & Required<ProgressHolder>, key: string): void {
  if (!s.progress.unlocks.includes(key)) s.progress.unlocks.push(key);
  if (key.startsWith('furn:')) { const id = key.slice(5); s.room.owned[id] = Math.max(1, s.room.owned[id] ?? 0); }
}

export interface XpGain { gained: number; levelUps: Array<{ level: number; reward: LevelReward }> }

/** Plafonds anti-répétition : 400 XP d'activité par jour, 120 par jeu et par jour. */
export const DAILY_ACTIVITY_XP = 400;
export const DAILY_GAME_XP = 120;

/**
 * Ajoute de l'XP. capped : XP d'activité (soumise aux plafonds quotidiens) ; game : plafond par jeu.
 * Gère les montées de niveau et leurs récompenses (une seule fois chacune : transaction `level:N`).
 */
export function grantXp(s: AuthState, amountXp: number, env: AuthEnv, opts: { capped?: boolean; game?: string } = {}): XpGain {
  ensureProgress(s);
  const p = s.progress;
  let n = Math.max(0, Math.floor(amountXp));
  if (opts.capped) {
    if (p.xpDay !== env.day) { p.xpDay = env.day; p.xpToday = 0; p.gameXpToday = {}; }
    n = Math.min(n, Math.max(0, DAILY_ACTIVITY_XP - p.xpToday));
    if (opts.game) { const g = p.gameXpToday[opts.game] ?? 0; n = Math.min(n, Math.max(0, DAILY_GAME_XP - g)); p.gameXpToday[opts.game] = g + n; }
    p.xpToday += n;
  }
  const out: XpGain = { gained: n, levelUps: [] };
  if (n <= 0) return out;
  const before = p.level;
  p.xp += n;
  p.level = levelForXp(p.xp);
  // L'XP alimente aussi le passe de croisière (mêmes plafonds anti-répétition)
  passAddXp(p, n);
  for (let l = before + 1; l <= p.level; l++) {
    const reward = rewardFor(l);
    if (reward.coins) ledger.earn(s, reward.coins, `level:${l}`);
    if (reward.chips && s.chips) chipLedger.earn(s, reward.chips, `level:${l}:jetons`);
    for (const u of reward.unlocks ?? []) unlock(s, u);
    out.levelUps.push({ level: l, reward });
    missionEvent(s, 'levelup', env);
  }
  return out;
}

// ---------------------------------------------------------------- événements et découvertes
export const PLACES = ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine', 'cabin-interior', 'vip-lounge', 'panorama'] as const;
export const DISCOVERY_XP = 50;
export const FIRST_TRY_XP = 30;
export const ROUND_XP = 10;
export const ARCADE_XP = 15;

export type MissionEventKind = 'round' | 'arcade' | 'record' | 'visit' | 'buy' | 'wheel' | 'emote' | 'chat' | 'room' | 'friend' | 'levelup' | 'swim';

/** Manche de casino terminée (quelle que soit la mise : la progression récompense la découverte, pas les gros paris). */
export function onRound(s: AuthState, game: string, env: AuthEnv): XpGain {
  ensureProgress(s);
  const base = baseGame(game);
  const first = !s.progress.tried.includes(base);
  if (first) s.progress.tried.push(base);
  missionEvent(s, 'round', env, 1, base);
  const g = grantXp(s, ROUND_XP, env, { capped: true, game: base });
  if (first) { const f = grantXp(s, FIRST_TRY_XP, env); g.gained += f.gained; g.levelUps.push(...f.levelUps); }
  return g;
}

export function onArcade(s: AuthState, game: string, newBest: boolean, env: AuthEnv): XpGain {
  ensureProgress(s);
  const first = !s.progress.tried.includes(game);
  if (first) s.progress.tried.push(game);
  missionEvent(s, 'arcade', env, 1, game);
  if (newBest) missionEvent(s, 'record', env, 1, game);
  const g = grantXp(s, ARCADE_XP + (newBest ? 10 : 0), env, { capped: true, game });
  if (first) { const f = grantXp(s, FIRST_TRY_XP, env); g.gained += f.gained; g.levelUps.push(...f.levelUps); }
  return g;
}

/** Premier passage dans un lieu : XP de découverte (une fois). */
export function onVisit(s: AuthState, place: string, env: AuthEnv): XpGain & { first: boolean } {
  ensureProgress(s);
  if (!(PLACES as readonly string[]).includes(place)) throw new AuthError('Lieu inconnu');
  missionEvent(s, 'visit', env, 1, place);
  if (s.progress.discovered.includes(place)) return { gained: 0, levelUps: [], first: false };
  s.progress.discovered.push(place);
  return { ...grantXp(s, DISCOVERY_XP, env), first: true };
}

/** Les deux tables de blackjack comptent comme un même jeu pour la variété ; les machines aussi. */
export function baseGame(game: string): string { return game.startsWith('blackjack') ? 'blackjack' : game.startsWith('slots') ? 'slots' : game; }

// ---------------------------------------------------------------- missions
export interface MissionDef {
  id: string; period: 'daily' | 'weekly'; label: string; event: MissionEventKind; target: number;
  /** Compter des valeurs différentes (jeux, lieux) plutôt que des occurrences. */
  distinct?: boolean;
  /** Ne compter que ces valeurs (ex. jeux de blackjack). */
  only?: string[];
  /** Mission sociale (seulement en ligne). */
  online?: boolean;
  coins: number; xp: number;
  /** Objet de collection offert en plus. */
  item?: string;
}

export const MISSIONS: MissionDef[] = [
  { id: 'd.rounds', period: 'daily', label: 'Joue 5 manches au casino', event: 'round', target: 5, coins: 60, xp: 60 },
  { id: 'd.variety', period: 'daily', label: 'Essaie 3 jeux différents', event: 'round', target: 3, distinct: true, coins: 80, xp: 80 },
  { id: 'd.arcade', period: 'daily', label: 'Termine 2 parties à l’arcade', event: 'arcade', target: 2, coins: 50, xp: 60 },
  { id: 'd.rooftop', period: 'daily', label: 'Monte prendre l’air au rooftop', event: 'visit', target: 1, only: ['rooftop'], coins: 30, xp: 40 },
  { id: 'd.bar', period: 'daily', label: 'Commande une boisson ou un en-cas', event: 'buy', target: 1, coins: 40, xp: 40 },
  { id: 'd.wheel', period: 'daily', label: 'Fais tourner la roue du jour', event: 'wheel', target: 1, coins: 20, xp: 40 },
  { id: 'd.emote', period: 'daily', label: 'Salue, applaudis ou danse 3 fois', event: 'emote', target: 3, coins: 30, xp: 40 },
  { id: 'd.blackjack', period: 'daily', label: 'Joue 3 mains de blackjack', event: 'round', target: 3, only: ['blackjack'], coins: 50, xp: 60 },
  { id: 'd.room', period: 'daily', label: 'Arrange un meuble dans ta cabine', event: 'room', target: 1, coins: 40, xp: 50 },
  { id: 'd.swim', period: 'daily', label: 'Fais quelques brasses dans la piscine', event: 'swim', target: 1, coins: 30, xp: 40 },
  { id: 'd.chat', period: 'daily', label: 'Envoie 2 messages dans le chat', event: 'chat', target: 2, online: true, coins: 40, xp: 50 },
  { id: 'w.rounds', period: 'weekly', label: 'Joue 40 manches au casino', event: 'round', target: 40, coins: 400, xp: 400 },
  { id: 'w.variety', period: 'weekly', label: 'Essaie 8 jeux différents', event: 'round', target: 8, distinct: true, coins: 500, xp: 500, item: 'trophy-casino' },
  { id: 'w.records', period: 'weekly', label: 'Bats 3 records à l’arcade', event: 'record', target: 3, coins: 300, xp: 350 },
  { id: 'w.explore', period: 'weekly', label: 'Visite 6 lieux différents du navire', event: 'visit', target: 6, distinct: true, coins: 300, xp: 350, item: 'globe-antique' },
  { id: 'w.room', period: 'weekly', label: 'Fais 5 changements dans ta cabine', event: 'room', target: 5, coins: 300, xp: 300 },
  { id: 'w.level', period: 'weekly', label: 'Gagne un niveau', event: 'levelup', target: 1, coins: 300, xp: 0, item: 'telescope' },
  { id: 'w.social', period: 'weekly', label: 'Envoie 15 messages dans le chat', event: 'chat', target: 15, online: true, coins: 300, xp: 300 },
  { id: 'w.friend', period: 'weekly', label: 'Ajoute un ami', event: 'friend', target: 1, online: true, coins: 250, xp: 300 },
];
export const MISSION_BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
export const DAILY_COUNT = 3, WEEKLY_COUNT = 3;

/** Semaine ISO (AAAA-Wnn) d'un jour AAAA-MM-JJ. */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = (date.getUTCDay() + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - dow + 3);
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hash(str: string): number { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Tirage déterministe de missions pour une période (même joueur + même période = mêmes missions). */
export function pickMissions(period: 'daily' | 'weekly', key: string, seed: string, online: boolean): string[] {
  const pool = MISSIONS.filter((m) => m.period === period && (online || !m.online));
  const order = pool.map((m) => ({ id: m.id, k: hash(`${seed}|${key}|${m.id}`) })).sort((a, b) => a.k - b.k);
  return order.slice(0, period === 'daily' ? DAILY_COUNT : WEEKLY_COUNT).map((o) => o.id);
}

/** Met à jour (ou renouvelle) les missions du jour et de la semaine. */
export function refreshMissions(s: AuthState, env: AuthEnv, seed = 'ks', online = false): MissionsState {
  ensureProgress(s);
  const h = s as AuthState & Required<ProgressHolder>;
  const week = isoWeek(env.day);
  const m = h.missions ?? { day: '', week: '', daily: [], weekly: [] };
  if (m.day !== env.day) { m.day = env.day; m.daily = pickMissions('daily', env.day, seed, online).map((id) => ({ id, progress: 0, claimed: false })); }
  if (m.week !== week) { m.week = week; m.weekly = pickMissions('weekly', week, seed, online).map((id) => ({ id, progress: 0, claimed: false })); }
  h.missions = m;
  return m;
}

/** Enregistre un événement pour les missions en cours (sans effet si aucune mission ne le concerne). */
export function missionEvent(s: AuthState, kind: MissionEventKind, env: AuthEnv, n = 1, value?: string): void {
  const h = s as AuthState & ProgressHolder;
  const m = h.missions;
  if (!m || (m.day !== env.day && m.week !== isoWeek(env.day))) return;
  for (const list of [m.day === env.day ? m.daily : [], m.week === isoWeek(env.day) ? m.weekly : []]) {
    for (const mp of list) {
      const def = MISSION_BY_ID.get(mp.id);
      if (!def || def.event !== kind || mp.claimed) continue;
      if (def.only && (!value || !def.only.includes(value))) continue;
      if (def.distinct) {
        if (!value) continue;
        mp.distinct ??= [];
        if (!mp.distinct.includes(value)) { mp.distinct.push(value); mp.progress = Math.min(def.target, mp.distinct.length); }
      } else mp.progress = Math.min(def.target, mp.progress + Math.max(1, Math.floor(n)));
    }
  }
}

export type MissionStatus = 'en cours' | 'terminée' | 'réclamée';
export function missionStatus(mp: MissionProgress): MissionStatus {
  const def = MISSION_BY_ID.get(mp.id);
  if (mp.claimed) return 'réclamée';
  return def && mp.progress >= def.target ? 'terminée' : 'en cours';
}

/** Réclame la récompense d'une mission terminée (une seule fois : transaction `mission:<période>:<id>`). */
export function claimMission(s: AuthState, id: string, env: AuthEnv): { coins: number; xp: XpGain; item?: string } {
  ensureProgress(s);
  const h = s as AuthState & Required<ProgressHolder>;
  const m = h.missions;
  const def = MISSION_BY_ID.get(id);
  if (!m || !def) throw new AuthError('Mission inconnue');
  const period = def.period === 'daily' ? m.day : m.week;
  if ((def.period === 'daily' && period !== env.day) || (def.period === 'weekly' && period !== isoWeek(env.day))) throw new AuthError('Mission expirée');
  const mp = (def.period === 'daily' ? m.daily : m.weekly).find((x) => x.id === id);
  if (!mp) throw new AuthError('Mission non proposée cette période');
  if (mp.claimed) throw new AuthError('Récompense déjà reçue');
  if (mp.progress < def.target) throw new AuthError('Mission pas encore terminée');
  mp.claimed = true;
  ledger.earn(s, def.coins, `mission:${period}:${id}`);
  if (def.item) unlock(h, `furn:${def.item}`);
  const xp = grantXp(s, def.xp, env);
  return { coins: def.coins, xp, item: def.item };
}

/** Vue publique de la progression (pour l'interface). */
export function progressView(s: AuthState): Record<string, unknown> {
  ensureProgress(s);
  const h = s as AuthState & Required<ProgressHolder>;
  return { progress: h.progress, missions: h.missions ?? null, room: h.room };
}
