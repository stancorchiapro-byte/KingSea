// Schéma des données joueur (version locale). Toute évolution passe par une migration.

import { normalizeMissions, normalizeProgress, normalizeRoom, type MissionsState, type ProgressState, type RoomState } from '../authority/progress';
import { normalizeEconomy, type EconomyHolder, type Inventory, type NeedsState, type PurseState } from '../authority/economy';
import { isPendingRound, type PendingRound } from '../games/logic/pending';
import { DEFAULT_LOOK, sanitizeLook, type Look } from '../art/characters';
import type { Session } from '../authority/types';

/** 2 : mise à jour KS Casino (KSCoins, progression, missions, cabine, raccourcis). */
export const SAVE_VERSION = 3;
export const STARTING_COINS = 500;

export interface Settings {
  masterVolume: number;   // 0..1 (volume général, appliqué à tout)
  sfxVolume: number;      // 0..1
  ambientVolume: number;  // 0..1 (ambiance : océan, machines, foule)
  musicVolume: number;    // 0..1 (musique, réglable indépendamment)
  haptics: boolean;       // vibrations (si l'appareil le permet)
  leftHanded: boolean;    // commandes inversées (joystick à droite)
  joystickScale: number;  // 0.8 | 1 | 1.25
  lowFx: boolean;         // effets réduits pour appareils modestes
  showFps: boolean;
  powerSaver: boolean;    // économie d'énergie : 30 images/s, résolution réduite, effets réduits
  autoQuality: boolean;   // baisse automatique de la qualité si l'appareil peine
  /** Touches personnalisées (action → code de touche). */
  keymap: Record<string, string>;
}

export type Appearance = Look;

export interface PlayerData {
  version: number;
  playerId: string;
  name: string;
  createdAt: number;
  appearance: Appearance;
  wallet: { balance: number; processedTx: string[] };
  location: { floorId: string };
  /** Drapeaux de progression (objets trouvés, secrets…). */
  flags: Record<string, boolean>;
  dailyRewards: { lastWheelDay: string | null };
  /** Logement : attribué localement pour l'instant ; le serveur fera autorité en multijoueur. */
  cabin: { id: string | null; wallColor: number };
  stats: Record<string, number>;
  settings: Settings;
  /** Manche de jeu en cours (réglée au démarrage si l'application a été fermée). */
  pending: PendingRound | null;
  /** Manches en cours et sabots (autorité locale, mode hors ligne). */
  sessions: Record<string, Session>;
  /** Monnaie : KSCoins (1 perle d'avant la mise à jour = 1 KSCoin ; migratedFromPearls l'indique). */
  economy: { currency: 'KSCoin'; migratedFromPearls: boolean };
  /** Progression, missions et cabine (gérées par l'autorité : authority/progress.ts, room.ts). */
  progress?: ProgressState;
  missions?: MissionsState;
  room?: RoomState;
  /** Jetons de casino, inventaire et jauges faim/soif (version 3, gérés par l'autorité : authority/economy.ts). */
  chips?: PurseState;
  inventory?: Inventory;
  needs?: NeedsState;
}

export function defaultSettings(): Settings {
  return { masterVolume: 1, sfxVolume: 0.8, ambientVolume: 0.6, musicVolume: 0.5, haptics: true, leftHanded: false, joystickScale: 1, lowFx: false, showFps: false, powerSaver: false, autoQuality: true, keymap: {} };
}

export function newPlayerId(rand: () => number = Math.random): string {
  let s = 'ks-';
  for (let i = 0; i < 12; i++) s += Math.floor(rand() * 36).toString(36);
  return s;
}

export function createDefaultPlayer(now = Date.now(), rand: () => number = Math.random): PlayerData {
  return {
    version: SAVE_VERSION,
    playerId: newPlayerId(rand),
    name: 'Passager',
    createdAt: now,
    appearance: { ...DEFAULT_LOOK },
    wallet: { balance: STARTING_COINS, processedTx: [] },
    location: { floorId: 'hub' },
    flags: {},
    dailyRewards: { lastWheelDay: null },
    cabin: { id: null, wallColor: 0 },
    stats: {},
    settings: defaultSettings(),
    pending: null,
    sessions: {},
    economy: { currency: 'KSCoin', migratedFromPearls: false },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valide et complète des données chargées (anciennes versions, champs manquants, valeurs corrompues).
 * Lève une erreur si les données sont inutilisables.
 */
export function migrate(raw: unknown, now = Date.now()): PlayerData {
  if (!isObj(raw)) throw new Error('Sauvegarde invalide');
  const base = createDefaultPlayer(now);
  const d = raw as Partial<PlayerData>;
  const num = (v: unknown, fb: number, min = -Infinity, max = Infinity) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb;

  const wallet = isObj(d.wallet) ? d.wallet : base.wallet;
  const settings = isObj(d.settings) ? (d.settings as Partial<Settings>) : {};
  return {
    version: SAVE_VERSION,
    playerId: typeof d.playerId === 'string' && d.playerId ? d.playerId : base.playerId,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.slice(0, 20) : base.name,
    createdAt: num(d.createdAt, now),
    appearance: sanitizeLook(d.appearance),
    wallet: {
      balance: Math.floor(num(wallet.balance, STARTING_COINS, 0)),
      processedTx: Array.isArray(wallet.processedTx) ? wallet.processedTx.filter((t) => typeof t === 'string').slice(-200) : [],
    },
    location: { floorId: isObj(d.location) && typeof d.location.floorId === 'string' ? d.location.floorId : 'hub' },
    flags: isObj(d.flags) ? Object.fromEntries(Object.entries(d.flags).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean> : {},
    dailyRewards: { lastWheelDay: isObj(d.dailyRewards) && typeof d.dailyRewards.lastWheelDay === 'string' ? d.dailyRewards.lastWheelDay : null },
    cabin: {
      id: isObj(d.cabin) && typeof d.cabin.id === 'string' ? d.cabin.id : null,
      wallColor: isObj(d.cabin) ? Math.floor(num(d.cabin.wallColor, 0, 0, 3)) : 0,
    },
    stats: isObj(d.stats) ? Object.fromEntries(Object.entries(d.stats).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number> : {},
    pending: isPendingRound(d.pending) ? d.pending : null,
    economy: { currency: 'KSCoin', migratedFromPearls: typeof d.version !== 'number' || d.version < 2 || (isObj(d.economy) && d.economy.migratedFromPearls === true) },
    progress: d.progress === undefined ? undefined : normalizeProgress(d.progress),
    missions: normalizeMissions(d.missions),
    room: d.room === undefined ? undefined : normalizeRoom(d.room),
    // Version 3 : jetons, inventaire et besoins ; valeurs sûres par défaut (rien d'existant n'est retiré)
    ...(() => { const e: EconomyHolder = { chips: d.chips, inventory: d.inventory, needs: d.needs }; normalizeEconomy(e); return e; })(),
    sessions: isObj(d.sessions) ? Object.fromEntries(Object.entries(d.sessions).filter(([, v]) => isObj(v) && typeof v.game === 'string' && typeof v.stake === 'number' && isObj(v.data))) as Record<string, Session> : {},
    settings: {
      masterVolume: num(settings.masterVolume, 1, 0, 1),
      sfxVolume: num(settings.sfxVolume, base.settings.sfxVolume, 0, 1),
      ambientVolume: num(settings.ambientVolume, base.settings.ambientVolume, 0, 1),
      musicVolume: num(settings.musicVolume, base.settings.musicVolume, 0, 1),
      haptics: typeof settings.haptics === 'boolean' ? settings.haptics : true,
      leftHanded: typeof settings.leftHanded === 'boolean' ? settings.leftHanded : false,
      joystickScale: num(settings.joystickScale, 1, 0.7, 1.5),
      lowFx: typeof settings.lowFx === 'boolean' ? settings.lowFx : false,
      showFps: typeof settings.showFps === 'boolean' ? settings.showFps : false,
      powerSaver: typeof settings.powerSaver === 'boolean' ? settings.powerSaver : false,
      autoQuality: typeof settings.autoQuality === 'boolean' ? settings.autoQuality : true,
      keymap: isObj(settings.keymap) ? Object.fromEntries(Object.entries(settings.keymap).filter(([k, v]) => /^[a-z]{2,10}$/.test(k) && typeof v === 'string' && /^[A-Za-z0-9]{2,20}$/.test(v)).slice(0, 20)) as Record<string, string> : {},
    },
  };
}
