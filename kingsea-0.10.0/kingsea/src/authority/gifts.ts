// Dons entre amis, exécutés par l'autorité du serveur (deux profils modifiés ensemble, ou aucun).
// • KSCoins : 1 000 au plus donnés par période glissante de 24 h (plusieurs petits dons possibles).
// • Jetons de casino : restent des jetons (aucune conversion) ; seules limites : le solde et la validité du montant.
// • Objets : 2 au plus par période glissante de 24 h, valeur ≤ 100 KSCoins chacun, objets personnels exclus.
//   Un double de clé compte comme un objet (valeur : prix du serrurier).
// L'appelant vérifie l'amitié ; ici : montants, propriété, limites, idempotence (identifiant de requête), atomicité
// (toutes les vérifications avant la première modification).
import { giftable, ITEMS_BY_ID } from '../data/items';
import { chips, ensureEconomy, itemCount, MAX_KEYS, type KeyItem } from './economy';
import { KEY_COPY_PRICE } from './keys';
import { AuthError, ledger, obj, type AuthState } from './types';

export const GIFT_RULES = { coinsPerWindow: 1000, itemsPerWindow: 2, windowMs: 24 * 3600_000, maxChips: 100_000 } as const;

export type GiftKind = 'coins' | 'chips' | 'item' | 'key';
export interface GiftResult { kind: GiftKind; amount: number; item?: string; key?: KeyItem; label: string }

/** Capacité restante et prochaine libération (fenêtre glissante). */
export function giftAllowance(s: AuthState, now: number): { coinsLeft: number; itemsLeft: number; coinsFreeAt: number | null; itemsFreeAt: number | null } {
  const log = (s.giftLog ?? []).filter((g) => now - g.at < GIFT_RULES.windowMs);
  const coins = log.filter((g) => g.kind === 'coins'), items = log.filter((g) => g.kind === 'item');
  const coinsUsed = coins.reduce((a, g) => a + g.n, 0), itemsUsed = items.reduce((a, g) => a + g.n, 0);
  const first = (l: typeof log) => (l.length ? Math.min(...l.map((g) => g.at)) + GIFT_RULES.windowMs : null);
  return { coinsLeft: Math.max(0, GIFT_RULES.coinsPerWindow - coinsUsed), itemsLeft: Math.max(0, GIFT_RULES.itemsPerWindow - itemsUsed), coinsFreeAt: coinsUsed > 0 ? first(coins) : null, itemsFreeAt: itemsUsed > 0 ? first(items) : null };
}

const intAmount = (v: unknown, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > max) throw new AuthError('Montant invalide');
  return v;
};

/**
 * Transfère un don de `from` vers `to`. `txId` : identifiant unique de la requête (une requête rejouée est refusée).
 * Lève AuthError sans rien modifier si une règle est violée.
 */
export function giveGift(from: AuthState, to: AuthState, raw: unknown, txId: string, now: number): GiftResult {
  ensureEconomy(from); ensureEconomy(to);
  const input = obj(raw);
  const tx = `gift:${txId}`;
  if (ledger.has(from, `${tx}:out`)) throw new AuthError('Don déjà effectué');
  const allow = giftAllowance(from, now);
  const kind = input.kind;
  let result: GiftResult;
  if (kind === 'coins') {
    const n = intAmount(input.amount, GIFT_RULES.coinsPerWindow);
    if (n > allow.coinsLeft) throw new AuthError(allow.coinsLeft > 0 ? `Tu peux encore donner ${allow.coinsLeft} KSCoins sur 24 h` : 'Limite de dons de KSCoins atteinte pour 24 h');
    if (from.wallet.balance < n) throw new AuthError('Pas assez de KSCoins');
    // Modifications (plus aucune vérification ne peut échouer)
    ledger.apply(from, -n, `${tx}:out`); ledger.apply(to, n, `${tx}:in`);
    from.giftLog!.push({ at: now, kind: 'coins', n });
    result = { kind: 'coins', amount: n, label: `${n} KSCoins` };
  } else if (kind === 'chips') {
    const n = intAmount(input.amount, GIFT_RULES.maxChips);
    if (chips.balance(from) < n) throw new AuthError('Pas assez de jetons');
    if (!chips.apply(from, -n, `${tx}:out`)) throw new AuthError('Don déjà effectué');
    chips.apply(to, n, `${tx}:in`);
    ledger.apply(from, 0, `${tx}:out`);
    result = { kind: 'chips', amount: n, label: `${n} jetons` };
  } else if (kind === 'item') {
    const id = typeof input.item === 'string' ? input.item : '';
    const def = ITEMS_BY_ID.get(id);
    const g = giftable(def);
    if (!g.ok) throw new AuthError(g.why);
    if (allow.itemsLeft <= 0) throw new AuthError('Limite de 2 objets donnés par 24 h atteinte');
    if (itemCount(from, id) < 1) throw new AuthError('Objet absent de ton inventaire');
    if (itemCount(to, id) + 1 > def!.stack) throw new AuthError('Ton ami ne peut pas en recevoir davantage');
    // Modifications
    const left = itemCount(from, id) - 1;
    if (left <= 0) delete from.inventory!.items[id]; else from.inventory!.items[id] = left;
    to.inventory!.items[id] = itemCount(to, id) + 1;
    from.giftLog!.push({ at: now, kind: 'item', n: 1 });
    ledger.apply(from, 0, `${tx}:out`);
    result = { kind: 'item', amount: 1, item: id, label: def!.name };
  } else if (kind === 'key') {
    const uid = typeof input.uid === 'string' ? input.uid : '';
    const key = from.keys!.find((k) => k.uid === uid);
    if (!key) throw new AuthError('Clé absente de ton trousseau');
    if (key.master) throw new AuthError('La clé principale est personnelle : fais faire un double chez le serrurier');
    if (KEY_COPY_PRICE > 100) throw new AuthError('Clé trop précieuse');
    if (allow.itemsLeft <= 0) throw new AuthError('Limite de 2 objets donnés par 24 h atteinte');
    if (to.keys!.length >= MAX_KEYS) throw new AuthError('Le trousseau de ton ami est plein');
    if (to.keys!.some((k) => k.uid === uid)) throw new AuthError('Ton ami a déjà cette clé');
    // Modifications : la même clé (identifiant, cabine, nom) change de main
    from.keys!.splice(from.keys!.indexOf(key), 1);
    to.keys!.push({ ...key });
    from.giftLog!.push({ at: now, kind: 'item', n: 1 });
    ledger.apply(from, 0, `${tx}:out`);
    result = { kind: 'key', amount: 1, key: { ...key }, label: `clé « ${key.name} »` };
  } else throw new AuthError('Type de don inconnu');
  // Journal borné (seules les 24 dernières heures comptent)
  from.giftLog = from.giftLog!.filter((g) => now - g.at < GIFT_RULES.windowMs).slice(-200);
  return result;
}
