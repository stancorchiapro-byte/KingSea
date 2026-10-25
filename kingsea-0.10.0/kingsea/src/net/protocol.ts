// Protocole réseau KingSea (JSON sur WebSocket), partagé par le jeu et le serveur.
// Le serveur fait autorité : le téléphone envoie des intentions et des positions, le serveur valide,
// diffuse aux autres joueurs, et décide seul de tout ce qui touche aux KSCoins.
import type { Look } from '../art/characters';
import type { AuthReply, AuthRequest } from '../authority/types';
import type { MissionsState, ProgressState, RoomState } from '../authority/progress';

export const PROTOCOL_VERSION = 3;
/** Version des conditions d'utilisation (à augmenter si le texte change de façon importante). */
export const TERMS_VERSION = 1;
export const SNAPSHOT_HZ = 10;
export const MOVE_HZ = 10;
export const CHAT_MAX = 140;

/** Animation publique d'un joueur (ce que les autres voient). */
export type NetAnim = 'idle' | 'walk' | 'sit' | 'lie' | 'swim' | 'dance' | 'wave' | 'clap' | 'cheer' | 'interact' | 'ride';
export const NET_ANIMS: NetAnim[] = ['idle', 'walk', 'sit', 'lie', 'swim', 'dance', 'wave', 'clap', 'cheer', 'interact', 'ride'];
export type NetDir = 'down' | 'up' | 'left' | 'right';
export const NET_DIRS: NetDir[] = ['down', 'up', 'left', 'right'];

/** Direction + animation dans un seul petit nombre (instantanés compacts). */
export function packPose(dir: NetDir, anim: NetAnim): number { return Math.max(0, NET_DIRS.indexOf(dir)) | (Math.max(0, NET_ANIMS.indexOf(anim)) << 2); }
export function unpackPose(code: number): { dir: NetDir; anim: NetAnim } { return { dir: NET_DIRS[code & 3] ?? 'down', anim: NET_ANIMS[code >> 2] ?? 'idle' }; }

/** `n` : petit numéro attribué par le serveur, utilisé dans les instantanés à la place de l'identifiant. */
export interface PublicPlayer { id: string; n: number; name: string; look: Look; x: number; y: number; dir: NetDir; anim: NetAnim }

/** Profil complet du joueur connecté (sans les secrets des manches en cours). */
export interface OwnProfile {
  id: string; name: string; look: Look;
  wallet: { balance: number };
  stats: Record<string, number>;
  flags: Record<string, boolean>;
  dailyRewards: { lastWheelDay: string | null };
  cabin: { id: string | null; wallColor: number };
  location: { floorId: string };
  blocked: string[];
  progress: ProgressState;
  missions: MissionsState | null;
  room: RoomState;
  /** Jetons de casino, inventaire (identifiant → quantité) et jauges (version 0.10). */
  chips: number;
  inventory: Record<string, number>;
  needs: { hunger: number; thirst: number };
}

export type ClientMsg =
  | { t: 'hello'; v: number; token?: string }
  | { t: 'register'; name: string; password: string; look: Look; terms: number }
  | { t: 'login'; name: string; password: string }
  | { t: 'logout' }
  | { t: 'look'; look: Look }
  | { t: 'join'; floor: string; x: number; y: number }
  | { t: 'move'; x: number; y: number; dir: NetDir; anim: NetAnim }
  | { t: 'emote'; e: 'wave' | 'clap' | 'dance' | 'heart' }
  /** Chat : « near » = joueurs proches sur l'étage (bulles), « global » = tout le navire. */
  | { t: 'chat'; text: string; scope?: ChatScope }
  | { t: 'req'; req: AuthRequest }
  | { t: 'cabin' }
  | { t: 'cabinColor'; color: number }
  | { t: 'players' }
  /** Amis : liste (et code ami), demande par code ou pseudo, réponse, retrait. */
  | { t: 'friends' }
  | { t: 'friendAdd'; query: string }
  | { t: 'friendAnswer'; id: string; accept: boolean }
  | { t: 'friendCancel'; id: string }
  | { t: 'friendRemove'; id: string }
  | { t: 'block'; id: string; on: boolean }
  | { t: 'report'; id: string; reason: string }
  | { t: 'ping' }
  /** Suppression définitive du compte (mot de passe demandé). */
  | { t: 'deleteAccount'; password: string }
  | { t: 'password'; old: string; next: string };

export type ChatScope = 'near' | 'global';
/** Portée du chat de proximité (px monde : 10 cases). */
export const CHAT_NEAR_RADIUS = 320;
/** Niveau minimal pour écrire dans le chat global (anti-spam). */
export const GLOBAL_CHAT_LEVEL = 2;
/** Délai minimal entre deux messages globaux (ms). */
export const GLOBAL_CHAT_COOLDOWN = 5000;

/** Ami ou demande d'ami tel que vu par le joueur. */
export interface FriendEntry { id: string; name: string; level: number; title: string | null; online: boolean; floor: string | null; since: number }
export interface FriendsData { code: string; friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] }
/** Limites du système d'amis. */
export const MAX_FRIENDS = 100;
export const MAX_PENDING = 30;

export interface OnlineEntry { id: string; name: string; floor: string }

export type ServerMsg =
  | { t: 'hello'; v: number; server: string; needAuth: boolean }
  | { t: 'auth'; token: string; profile: OwnProfile; notice?: string }
  | { t: 'authError'; msg: string }
  | { t: 'room'; floor: string; players: PublicPlayer[] }
  | { t: 'enter'; p: PublicPlayer }
  | { t: 'leave'; id: string }
  /** Instantané compact (protocole 2) : suite plate [n, x, y, pose, n, x, y, pose…] des joueurs qui ont bougé. */
  | { t: 'snap'; d: number[] }
  | { t: 'look'; id: string; look: Look; name: string }
  | { t: 'emote'; id: string; e: string }
  | { t: 'chat'; id: string; name: string; text: string; at: number; scope: ChatScope }
  /** Derniers messages du chat global (à la connexion). */
  | { t: 'chatLog'; lines: Array<{ id: string; name: string; text: string; at: number }> }
  | { t: 'chatError'; msg: string }
  | { t: 'res'; id: string; reply: AuthReply }
  | { t: 'cabin'; id: string | null; wallColor: number }
  | { t: 'players'; list: OnlineEntry[] }
  | { t: 'friends'; data: FriendsData }
  /** Résultat d'une action d'amitié (message à afficher). */
  | { t: 'friendResult'; ok: boolean; msg: string }
  | { t: 'correct'; x: number; y: number }
  | { t: 'kicked'; msg: string }
  | { t: 'notice'; msg: string }
  | { t: 'pong' }
  /** Réponse aux opérations de compte (mot de passe, suppression). */
  | { t: 'account'; op: 'password' | 'delete'; ok: boolean; msg: string };
