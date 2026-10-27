// Clés de cabine et serrurier, exécutés par l'autorité (téléphone hors ligne, serveur en ligne).
// • Clé principale : remise automatiquement avec la cabine, personnelle (jamais donnée, vendue ni échangée).
// • Doubles : fabriqués chez le serrurier (payants, en KSCoins), renommables, transférables entre amis (comme un objet).
// • Changer la serrure : rend inutilisables tous les doubles en circulation (le propriétaire garde le contrôle).
// La vérification d'accès compare la version de serrure de la clé à celle du propriétaire (serveur, en ligne).
import { ensureEconomy, MAX_KEYS, type KeyItem } from './economy';
import { AuthError, incStat, ledger, type AuthEnv, type AuthState } from './types';

/** Prix d'un double (KSCoins). Reste ≤ 100 : un double peut donc être donné à un ami. */
export const KEY_COPY_PRICE = 40;
/** Prix d'un changement de serrure (KSCoins). */
export const LOCK_CHANGE_PRICE = 80;
/** Doubles de sa propre cabine détenus en même temps (hors clés données). */
export const MAX_OWN_COPIES = 5;
/** Doubles fabriqués au total pour une même serrure (protection contre la fabrication en masse). */
export const MAX_COPIES_PER_LOCK = 20;

const NAME_RE = /^[\p{L}\p{N} '’.-]{1,24}$/u;

/** Nom de clé nettoyé (lettres, chiffres, espaces, apostrophes, tirets ; 1 à 24 caractères). */
export function cleanKeyName(raw: unknown): string {
  const t = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!NAME_RE.test(t)) throw new AuthError('Nom de clé invalide (1 à 24 lettres ou chiffres)');
  return t;
}

/** Garantit la clé principale de la cabine actuelle (et met à jour sa version de serrure). */
export function ensureMasterKey(s: AuthState, ownerId: string | undefined): void {
  ensureEconomy(s);
  const cabin = s.cabin?.id ?? null;
  const keys = s.keys!;
  // Ancienne cabine : la clé principale correspondante disparaît (une seule cabine par passager)
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i].master && keys[i].cabin !== cabin) keys.splice(i, 1);
  if (!cabin || !ownerId) return;
  const master = keys.find((k) => k.master);
  if (master) { master.lock = s.keyring!.lock; master.owner = ownerId; return; }
  keys.unshift({ uid: `master-${ownerId}-${cabin}`, cabin, owner: ownerId, master: true, name: `Clé de la cabine ${cabin}`, lock: s.keyring!.lock });
}

/** Une clé ouvre-t-elle la cabine (même cabine, même propriétaire, serrure à jour) ? */
export function keyOpens(key: KeyItem, cabin: string, ownerId: string, ownerLock: number): boolean {
  return key.cabin === cabin && key.owner === ownerId && key.lock === ownerLock;
}

export function keyCopy(s: AuthState, reqId: string, env: AuthEnv): KeyItem {
  ensureMasterKey(s, env.seed);
  const master = s.keys!.find((k) => k.master);
  if (!master) throw new AuthError('Il te faut une cabine (et sa clé principale) pour faire un double');
  const own = s.keys!.filter((k) => !k.master && k.cabin === master.cabin && k.owner === master.owner && k.lock === master.lock).length;
  if (own >= MAX_OWN_COPIES) throw new AuthError(`Tu as déjà ${MAX_OWN_COPIES} doubles : donne-en avant d’en refaire`);
  if (s.keyring!.made >= MAX_COPIES_PER_LOCK) throw new AuthError('Trop de doubles pour cette serrure : fais changer la serrure');
  if (s.keys!.length >= MAX_KEYS) throw new AuthError('Trousseau plein');
  ledger.spend(s, KEY_COPY_PRICE, `locksmith:copy:${reqId}`);
  s.keyring!.made++;
  const key: KeyItem = { uid: `copy-${master.owner}-${master.lock}-${s.keyring!.made}`, cabin: master.cabin, owner: master.owner, master: false, name: `Double n° ${s.keyring!.made}`, lock: master.lock };
  s.keys!.push(key);
  incStat(s, 'locksmith.copies');
  return key;
}

export function keyRename(s: AuthState, uid: unknown, name: unknown): KeyItem {
  ensureEconomy(s);
  const key = s.keys!.find((k) => k.uid === uid);
  if (!key) throw new AuthError('Clé absente de ton trousseau');
  if (key.master) throw new AuthError('La clé principale ne se renomme pas');
  key.name = cleanKeyName(name);
  return key;
}

export function lockChange(s: AuthState, reqId: string, env: AuthEnv): number {
  ensureMasterKey(s, env.seed);
  const master = s.keys!.find((k) => k.master);
  if (!master) throw new AuthError('Tu n’as pas de cabine');
  ledger.spend(s, LOCK_CHANGE_PRICE, `locksmith:lock:${reqId}`);
  const kr = s.keyring!;
  kr.lock++; kr.made = 0;
  // Les doubles encore en ta possession sont refaits à la nouvelle serrure ; ceux donnés ne fonctionnent plus
  for (const k of s.keys!) if (k.cabin === master.cabin && k.owner === master.owner) k.lock = kr.lock;
  incStat(s, 'locksmith.locks');
  return kr.lock;
}
