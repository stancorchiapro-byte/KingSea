// Économie du joueur côté autorité (téléphone hors ligne, serveur en ligne) :
// • Jetons de casino : monnaie distincte des KSCoins, utilisée par tous les jeux du casino. On les obtient et on
//   les revend à la caisse du casino, au taux fixé ici (le même partout : autorité, caisse, textes).
// • Inventaire : objets par identifiant stable (data/items.ts), quantités bornées.
// • Besoins : faim et soif de 0 (vide) à 100 (rassasié), qui baissent pendant l'exploration du navire ;
//   à 0 : coma de 15 s, puis réveil au hall (aucune perte d'objet, de monnaie ni de progression).
// Toutes les opérations passent par handle() (authority/index.ts) : en cas de refus, rien n'est modifié.
import { ITEMS_BY_ID, type ItemDef } from '../data/items';
import { AuthError, incStat, ledger, type AuthEnv, type AuthState } from './types';

// ---------------------------------------------------------------- réglages (équilibrage)
/** Taux de la caisse : 1 jeton = `coinsPerChip` KSCoins, à l'achat comme à la revente (aucun écart à exploiter). */
export const CHIP_RATE = { coinsPerChip: 1, minExchange: 1, maxExchange: 100_000 } as const;
/** Jetons offerts une seule fois (nouveau joueur ou sauvegarde d'avant les jetons) pour découvrir le casino. */
export const WELCOME_CHIPS = 100;

export const NEEDS = {
  max: 100,
  /** Baisse par minute d'exploration (le casino, l'arcade, les menus et les chargements la mettent en pause). */
  hungerPerMin: 0.7,
  thirstPerMin: 1.0,
  /** Durée maximale prise en compte par relevé (évite toute chute brutale après une longue absence). */
  maxTickSeconds: 60,
  /** Seuils d'avertissement (rappels progressifs côté interface). */
  thresholds: [50, 25, 10] as const,
  comaMs: 15_000,
  /** Valeurs au réveil (l'équipage vous a remis sur pied). */
  wakeTo: 40,
} as const;

// ---------------------------------------------------------------- état
export interface PurseState { balance: number; processedTx: string[] }
export interface Inventory { items: Record<string, number> }
export interface NeedsState { hunger: number; thirst: number; lastTick: number; coma: { until: number; cause: string } | null }
/**
 * Clé de cabine : objet unique (identifiant propre, cabine, propriétaire, nom). La clé principale est personnelle ;
 * les doubles (serrurier) peuvent être renommés et donnés. `lock` : version de la serrure au moment de la fabrication
 * (un changement de serrure par le propriétaire rend les anciens doubles inutilisables).
 */
export interface KeyItem { uid: string; cabin: string; owner: string; master: boolean; name: string; lock: number }
/** Serrure de la cabine du joueur : version courante et nombre de doubles fabriqués. */
export interface Keyring { lock: number; made: number }
/** Dons envoyés (fenêtre glissante de 24 h) : KSCoins et objets. */
export interface GiftLogEntry { at: number; kind: 'coins' | 'item'; n: number }
export interface EconomyHolder { chips?: PurseState; inventory?: Inventory; needs?: NeedsState; keys?: KeyItem[]; keyring?: Keyring; giftLog?: GiftLogEntry[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

export function newNeeds(): NeedsState { return { hunger: NEEDS.max, thirst: NEEDS.max, lastTick: 0, coma: null }; }

/** Valide/complète les données économiques (anciennes sauvegardes, profils serveur, valeurs abîmées). */
export function normalizeEconomy(h: EconomyHolder): void {
  const c = h.chips as Partial<PurseState> | undefined;
  h.chips = { balance: Math.max(0, Math.floor(num(c?.balance, 0))), processedTx: Array.isArray(c?.processedTx) ? c!.processedTx.filter((x): x is string => typeof x === 'string').slice(-400) : [] };
  const items: Record<string, number> = {};
  const raw = isObj(h.inventory) && isObj(h.inventory.items) ? h.inventory.items : {};
  for (const [k, v] of Object.entries(raw)) {
    const def = ITEMS_BY_ID.get(k);
    const n = Math.floor(num(v, 0));
    if (def && n > 0) items[k] = Math.min(n, def.stack);
  }
  h.inventory = { items };
  const n = h.needs as Partial<NeedsState> | undefined;
  const coma = isObj(n?.coma) && typeof n!.coma!.until === 'number' ? { until: n!.coma!.until, cause: String(n!.coma!.cause ?? 'faim') } : null;
  h.needs = { hunger: clamp(num(n?.hunger, NEEDS.max), 0, NEEDS.max), thirst: clamp(num(n?.thirst, NEEDS.max), 0, NEEDS.max), lastTick: num(n?.lastTick, 0), coma };
  normalizeKeys(h);
}

/** Valide les clés, la serrure et le journal des dons (données abîmées ou anciennes). */
export function normalizeKeys(h: EconomyHolder): void {
  const keys: KeyItem[] = [];
  const seen = new Set<string>();
  for (const k of Array.isArray(h.keys) ? h.keys : []) {
    if (!isObj(k) || typeof k.uid !== 'string' || typeof k.cabin !== 'string' || typeof k.owner !== 'string' || seen.has(k.uid)) continue;
    seen.add(k.uid);
    keys.push({ uid: k.uid.slice(0, 64), cabin: k.cabin.slice(0, 8), owner: k.owner.slice(0, 64), master: k.master === true, name: typeof k.name === 'string' ? k.name.slice(0, 24) : 'Double de clé', lock: Math.max(1, Math.floor(num(k.lock, 1))) });
    if (keys.length >= MAX_KEYS) break;
  }
  h.keys = keys;
  const r = h.keyring as Partial<Keyring> | undefined;
  h.keyring = { lock: Math.max(1, Math.floor(num(r?.lock, 1))), made: Math.max(0, Math.floor(num(r?.made, 0))) };
  h.giftLog = (Array.isArray(h.giftLog) ? h.giftLog : []).filter((g): g is GiftLogEntry => isObj(g) && typeof g.at === 'number' && (g.kind === 'coins' || g.kind === 'item') && typeof g.n === 'number').slice(-200);
}

/** Nombre maximal de clés détenues (principale + doubles reçus ou fabriqués). */
export const MAX_KEYS = 30;

/** Prépare l'économie d'un joueur (appelé avant chaque requête). Les jetons de bienvenue ne sont versés qu'une fois. */
export function ensureEconomy(s: AuthState): asserts s is AuthState & Required<EconomyHolder> {
  if (!s.chips || !s.inventory || !s.needs) normalizeEconomy(s);
  if (!s.keys || !s.keyring || !s.giftLog) normalizeKeys(s);
  // Jetons de bienvenue : une seule fois, mémorisé par un drapeau. L'historique des transactions est une fenêtre
  // glissante (400 entrées) : s'y fier seul faisait reverser 100 jetons dès que « chips:welcome » en sortait.
  if (!s.flags['chips.welcome']) {
    const legacy = s.chips!.processedTx.length > 0; // ancien profil : la bienvenue a déjà été versée
    if (!legacy) chips.earn(s, WELCOME_CHIPS, 'chips:welcome');
    s.flags['chips.welcome'] = true;
  }
  // Téléphone KS : offert une fois à chaque passager (objet personnel)
  if (!s.flags['item.phone']) { s.flags['item.phone'] = true; if (!itemCount(s, 'phone')) s.inventory!.items.phone = 1; }
  // KS Pass Croisière : les passagers qui avaient déjà reçu le cadeau de la réception le reçoivent aussi
  if (s.flags['gift.received'] && !s.flags['item.ks-pass']) { s.flags['item.ks-pass'] = true; if (!itemCount(s, 'ks-pass')) s.inventory!.items['ks-pass'] = 1; }
}

// ---------------------------------------------------------------- jetons
const MAX_TX = 400;
/** Portefeuille de jetons : mêmes garanties que les KSCoins (transaction unique, jamais négatif). */
export const chips = {
  balance(s: AuthState): number { return s.chips?.balance ?? 0; },
  apply(s: AuthState, delta: number, tx: string): boolean {
    const p = s.chips!;
    if (!Number.isInteger(delta) || !tx || p.processedTx.includes(tx) || p.balance + delta < 0) return false;
    p.balance += delta; p.processedTx.push(tx);
    if (p.processedTx.length > MAX_TX) p.processedTx.splice(0, p.processedTx.length - MAX_TX);
    return true;
  },
  spend(s: AuthState, n: number, tx: string): void {
    if (chips.balance(s) < n) throw new AuthError('Pas assez de jetons : passe à la caisse du casino');
    if (!chips.apply(s, -n, tx)) throw new AuthError('Opération déjà effectuée');
  },
  earn(s: AuthState, n: number, tx: string): void { if (n > 0) chips.apply(s, n, tx); },
  /**
   * Verse le gain d'une manche. Contrairement à earn(), un identifiant déjà utilisé n'est jamais ignoré en silence :
   * la manche est refusée (et annulée par transact) plutôt que de garder la mise sans payer le gain.
   */
  credit(s: AuthState, n: number, tx: string): void {
    if (!Number.isInteger(n) || n < 0) throw new AuthError('Gain invalide');
    if (n === 0) return;
    if (!chips.apply(s, n, tx)) throw new AuthError('Gain déjà versé pour cette manche');
  },
  /** Identifiant de manche encore jamais utilisé (ni mise, ni gain, ni remboursement enregistrés). */
  fresh(s: AuthState, tx: string): boolean {
    const p = s.chips!.processedTx;
    return !p.includes(`${tx}:mise`) && !p.includes(`${tx}:gain`) && !p.includes(`${tx}:rembourse`);
  },
};

/** Échange à la caisse. `buy` : KSCoins → jetons ; `sell` : jetons → KSCoins. Les deux soldes changent ensemble. */
export function exchange(s: AuthState, dir: unknown, amount: unknown, reqId: string): { coins: number; chips: number } {
  ensureEconomy(s);
  if (dir !== 'buy' && dir !== 'sell') throw new AuthError('Sens d’échange inconnu');
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < CHIP_RATE.minExchange) throw new AuthError('Montant invalide');
  if (amount > CHIP_RATE.maxExchange) throw new AuthError(`Maximum ${CHIP_RATE.maxExchange} jetons par échange`);
  const coins = amount * CHIP_RATE.coinsPerChip;
  const tx = `cashier:${reqId}`;
  if (dir === 'buy') {
    if (s.wallet.balance < coins) throw new AuthError('Pas assez de KSCoins');
    ledger.spend(s, coins, `${tx}:kscoins`);
    chips.earn(s, amount, `${tx}:jetons`);
  } else {
    if (chips.balance(s) < amount) throw new AuthError('Pas assez de jetons');
    chips.spend(s, amount, `${tx}:jetons`);
    ledger.earn(s, coins, `${tx}:kscoins`);
  }
  incStat(s, dir === 'buy' ? 'cashier.buy' : 'cashier.sell', amount);
  return { coins, chips: amount };
}

// ---------------------------------------------------------------- inventaire
export function itemCount(s: AuthState, id: string): number { return s.inventory?.items[id] ?? 0; }

/** Ajoute des objets (achat, récompense) dans la limite d'empilement. */
export function addItem(s: AuthState, def: ItemDef, n = 1): void {
  ensureEconomy(s);
  const cur = itemCount(s, def.id);
  if (cur + n > def.stack) throw new AuthError(def.stack === 1 ? `Tu possèdes déjà « ${def.name} »` : `Tu ne peux pas porter plus de ${def.stack} « ${def.name} »`);
  s.inventory!.items[def.id] = cur + n;
}

export function removeItem(s: AuthState, id: string, n = 1): void {
  const cur = itemCount(s, id);
  if (cur < n) throw new AuthError('Objet absent de ton inventaire');
  if (cur - n <= 0) delete s.inventory!.items[id]; else s.inventory!.items[id] = cur - n;
}

/** Consomme une nourriture ou une boisson : effets sur les jauges, quantité retirée. */
export function consume(s: AuthState, id: unknown): { item: string; hunger: number; thirst: number } {
  ensureEconomy(s);
  const def = typeof id === 'string' ? ITEMS_BY_ID.get(id) : undefined;
  if (!def) throw new AuthError('Objet inconnu');
  if (def.type !== 'food' && def.type !== 'drink') throw new AuthError('Cet objet ne se consomme pas');
  removeItem(s, def.id, 1);
  const n = s.needs!;
  const h0 = n.hunger, t0 = n.thirst;
  n.hunger = clamp(n.hunger + (def.hunger ?? 0), 0, NEEDS.max);
  n.thirst = clamp(n.thirst + (def.thirst ?? 0), 0, NEEDS.max);
  incStat(s, def.type === 'food' ? 'eaten' : 'drunk');
  return { item: def.id, hunger: Math.round(n.hunger - h0), thirst: Math.round(n.thirst - t0) };
}

/** Utilise un objet (feu d'artifice, confettis, parfum) : retiré de l'inventaire, l'effet est joué par l'interface. */
export function useItem(s: AuthState, id: unknown): { item: string; effect: string } {
  ensureEconomy(s);
  const def = typeof id === 'string' ? ITEMS_BY_ID.get(id) : undefined;
  if (!def || !def.effect) throw new AuthError('Cet objet ne s’utilise pas');
  removeItem(s, def.id, 1);
  incStat(s, `used.${def.effect}`);
  return { item: def.id, effect: def.effect };
}

// ---------------------------------------------------------------- besoins
/** En coma (aucune action de jeu possible tant que le réveil n'a pas eu lieu). */
export function inComa(s: AuthState): boolean { return !!s.needs?.coma; }

/**
 * Relevé périodique des jauges, envoyé par l'interface pendant l'exploration. La durée est bornée par le temps
 * réellement écoulé depuis le relevé précédent (horloge de l'autorité) : pas de chute après une absence ou une reconnexion.
 */
export function tickNeeds(s: AuthState, seconds: unknown, env: AuthEnv): { coma: boolean } {
  ensureEconomy(s);
  const n = s.needs!;
  if (n.coma) return { coma: true };
  let sec = clamp(num(seconds, 0), 0, NEEDS.maxTickSeconds);
  if (n.lastTick > 0) sec = Math.min(sec, Math.max(0, (env.now - n.lastTick) / 1000 + 2));
  n.lastTick = env.now;
  n.hunger = clamp(n.hunger - (NEEDS.hungerPerMin * sec) / 60, 0, NEEDS.max);
  n.thirst = clamp(n.thirst - (NEEDS.thirstPerMin * sec) / 60, 0, NEEDS.max);
  if (n.hunger <= 0 || n.thirst <= 0) {
    const cause = n.hunger <= 0 && n.thirst <= 0 ? 'faim et soif' : n.hunger <= 0 ? 'faim' : 'soif';
    n.coma = { until: env.now + NEEDS.comaMs, cause };
    incStat(s, 'comas');
    return { coma: true };
  }
  return { coma: false };
}

/** Réveil après le coma : jauges remises à un niveau sûr, aucune autre donnée touchée. */
export function wake(s: AuthState, env: AuthEnv): void {
  ensureEconomy(s);
  const n = s.needs!;
  if (!n.coma) return;
  if (env.now < n.coma.until - 1000) throw new AuthError(`Encore ${Math.ceil((n.coma.until - env.now) / 1000)} s`);
  n.coma = null;
  n.hunger = Math.max(n.hunger, NEEDS.wakeTo);
  n.thirst = Math.max(n.thirst, NEEDS.wakeTo);
  n.lastTick = env.now;
}

/** Résumé envoyé au téléphone avec chaque réponse. */
export function economyView(s: AuthState, env?: AuthEnv): { chips: number; inv: Record<string, number>; keys: KeyItem[]; lock: number; needs: { hunger: number; thirst: number; coma: number | null; cause: string | null } } {
  const n = s.needs ?? newNeeds();
  return {
    chips: s.chips?.balance ?? 0,
    inv: { ...(s.inventory?.items ?? {}) },
    keys: (s.keys ?? []).map((k) => ({ ...k })),
    lock: s.keyring?.lock ?? 1,
    needs: { hunger: Math.round(n.hunger * 10) / 10, thirst: Math.round(n.thirst * 10) / 10, coma: n.coma ? Math.max(0, n.coma.until - (env?.now ?? Date.now())) : null, cause: n.coma?.cause ?? null },
  };
}
