// Comptes : pseudo + mot de passe (haché avec scrypt et un sel par compte), jetons de session aléatoires.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cleanName } from '../src/ui/TextPrompt';

const KEYLEN = 32;
const RESERVED = ['admin', 'administrateur', 'moderateur', 'modérateur', 'kingsea', 'capitaine officiel', 'equipage', 'équipage', 'support', 'staff', 'serveur'];

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
  return { salt, hash: scryptSync(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }).toString('hex') };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const h = scryptSync(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hash, 'hex');
  return ref.length === h.length && timingSafeEqual(h, ref);
}

export const newToken = (): string => randomBytes(32).toString('hex');
export const newAccountId = (): string => `ks-${randomBytes(9).toString('base64url')}`;

/** Pseudo valide (2 à 16 caractères, non réservé) ou message d'erreur. */
export function checkName(raw: unknown): { ok: true; name: string } | { ok: false; msg: string } {
  if (typeof raw !== 'string') return { ok: false, msg: 'Pseudo invalide' };
  const name = cleanName(raw);
  if (!name) return { ok: false, msg: 'Pseudo : 2 à 16 caractères (lettres, chiffres, espace, - _ . \')' };
  const low = name.toLowerCase();
  if (RESERVED.some((r) => low === r || low.startsWith(`${r} `))) return { ok: false, msg: 'Ce pseudo est réservé' };
  return { ok: true, name };
}

export function checkPassword(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 6) return 'Mot de passe : 6 caractères minimum';
  if (raw.length > 64) return 'Mot de passe trop long';
  return null;
}
