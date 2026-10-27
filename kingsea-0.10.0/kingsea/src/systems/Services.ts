// Conteneur des services partagés (injection simple, pas de variables globales cachées).
import { setLayerCacheSize } from '../art/floorRenderer';
import { vibrate } from '../platform/native';
import { newProgress, type ProgressState } from '../authority/progress';
import type { ProgressSnapshot } from '../authority/types';
import type { Game } from '../engine/Game';
import { AudioSystem } from './Audio';
import { detectStorage, SaveService } from './SaveService';
import { Wallet } from './Wallet';
import { enforceUnlocks, releaseLook, type Look } from '../art/characters';
import { ownsWear, type WearSlot } from '../data/items';
import { NeedsController } from './Needs';
import { GAME_LABELS, resolvePending } from '../games/logic/pending';
import { LocalBackend, type AskKind, type Backend } from '../net/Backend';
import type { AuthReply, EcoSnapshot } from '../authority/types';
import { RemoteBackend, type Connection } from '../net/Net';
import type { OwnProfile } from '../net/protocol';
import { createDefaultPlayer } from './PlayerData';
import { EMOTE_BY_ID } from '../data/emotes';
import { floorAccess } from '../authority/access';
import { SAVE_KEY } from './SaveService';

/** Téléphone à mémoire réduite (≤ 2 Go annoncés par le navigateur, quand il le dit). */
function lowMemoryDevice(): boolean {
  const m = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof m === 'number' && m <= 2;
}

/** Lieu choisi dans le menu principal, rejoint dès l'arrivée à bord. */
export type Destination = 'casino' | 'arcade' | 'cabin' | 'rooftop' | 'friends';

export class Services {
  destination: Destination | null = null;
  readonly save: SaveService;
  readonly audio = new AudioSystem();
  readonly persistent: boolean;
  wallet: Wallet;
  /** Jetons de casino (monnaie distincte des KSCoins, échangée à la caisse). */
  chips!: Wallet;
  /** Autorité du jeu : locale (hors ligne) ou serveur (en ligne). */
  backend: Backend;
  readonly local: LocalBackend;

  constructor(readonly game: Game) {
    const { adapter, persistent } = detectStorage();
    this.persistent = persistent;
    this.save = new SaveService(adapter);
    this.wallet = this.makeWallet(); this.chips = this.makeChips();
    this.applySettings();
    this.local = new LocalBackend(() => this.save.data, () => this.save.saveNow());
    this.backend = this.local;
    this.settlePending();
    const settled = this.local.settleAbandoned();
    if (settled.length) {
      const s0 = settled[0], label = GAME_LABELS[s0.game] ?? s0.game;
      this.notice = `Partie de ${label} interrompue terminée : ${s0.payout > 0 ? `+${s0.payout} jetons` : 'mise perdue'}.`;
    }

    game.input.onFirstGesture = () => this.audio.unlock();
    // L'appareil peine : résolution et effets réduits automatiquement (désactivable dans les paramètres).
    game.onAutoLow.push(() => { this.applySettings(); this.notice = 'Qualité réduite automatiquement pour garder le jeu fluide.'; });
    // Cycle de vie mobile : sauvegarde immédiate et audio coupé en arrière-plan.
    game.onPause.push(() => { this.save.saveNow(); this.audio.suspend(); });
    game.onResume.push(() => this.audio.resume());
    window.addEventListener('beforeunload', () => this.save.saveNow());
  }

  /** Message à afficher au joueur au démarrage (manche interrompue réglée…). */
  notice: string | null = null;

  /** Règle une manche interrompue par la fermeture de l'application. */
  settlePending(): void {
    const p = this.save.data.pending;
    if (!p) return;
    let ret = 0;
    try { ret = resolvePending(p); } catch (e) { console.error('[KingSea] manche illisible, mise rendue', e); ret = p.stake; }
    ret = Math.max(0, Math.floor(ret));
    const r = ret > 0 ? this.wallet.earn(ret, `${p.tx}:gain`) : null;
    this.save.data.pending = null;
    this.save.saveNow();
    const label = GAME_LABELS[p.game] ?? p.game;
    this.notice = r && !r.ok ? `Partie de ${label} déjà réglée.` : `Partie de ${label} interrompue terminée : ${ret > 0 ? `+${ret} KSCoins` : 'mise perdue'}.`;
  }

  /** Demande à l'autorité (locale ou serveur). Ne lève jamais d'exception : en cas de problème, ok = false. */
  async ask(kind: AskKind, game: string, action: string, input?: unknown): Promise<AuthReply> {
    try {
      const r = await this.backend.request(kind, game, action, input);
      return this.absorb(kind, game, action, r);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Connexion perdue', balance: this.wallet.balance };
    }
  }

  /**
   * Applique une réponse de l'autorité (soldes, inventaire, progression) et prévient les écouteurs. Utilisé par
   * ask() et pour les réponses poussées par le serveur (manches de table, cadeaux reçus).
   */
  absorb(kind: AskKind, game: string, action: string, r: AuthReply): AuthReply {
    this.wallet.syncFrom(r.balance);
    if (r.eco) this.applyEco(r.eco);
    if (r.ok && r.prog) this.applyProgress(r.prog);
    if (r.ok) for (const f of this.replyListeners) { try { f(kind, game, action, r); } catch (e) { console.error(e); } }
    if (r.ok && r.done && r.payout > r.stake * 10 && r.stake > 0) this.haptic([40, 60, 40, 60, 120]);
    else if (r.ok && r.done && r.payout > r.stake && r.stake > 0) this.haptic(35);
    return r;
  }

  /** Écouteurs des réponses acceptées par l'autorité (bilan de session des jeux du casino). */
  readonly replyListeners = new Set<(kind: AskKind, game: string, action: string, r: AuthReply & { ok: true }) => void>();

  /** Écouteurs des jetons, de l'inventaire et des jauges (HUD, menus, coma). */
  readonly ecoListeners = new Set<(e: EcoSnapshot) => void>();
  /** Faim, soif et coma (relevés, alertes, réveil). Déclaré après ecoListeners (ordre d'initialisation). */
  readonly needs = new NeedsController(this);
  /** Dernier état connu des jauges (affichage) et du coma (ms restantes, null : éveillé). */
  eco: EcoSnapshot | null = null;

  /** Recopie jetons, inventaire et jauges renvoyés par l'autorité (en ligne : le serveur fait foi). */
  private applyEco(e: EcoSnapshot): void {
    const d = this.save.data;
    d.chips ??= { balance: 0, processedTx: [] };
    this.chips.syncFrom(e.chips);
    d.inventory = { items: { ...e.inv } };
    d.needs ??= { hunger: 100, thirst: 100, lastTick: 0, coma: null };
    d.needs.hunger = e.needs.hunger; d.needs.thirst = e.needs.thirst;
    if (e.keys) d.keys = e.keys.map((k) => ({ ...k }));
    if (e.lock !== undefined) { d.keyring ??= { lock: 1, made: 0 }; d.keyring.lock = e.lock; }
    this.eco = e;
    this.save.markDirty();
    for (const f of this.ecoListeners) { try { f(e); } catch (err) { console.error(err); } }
  }

  /**
   * Porte (ou retire, `value` = null) un vêtement ou un accessoire. Vérifie qu'il est possédé, enregistre
   * l'apparence et la transmet au serveur en ligne (qui vérifie à nouveau). Renvoie un message d'erreur ou null.
   */
  wear(slot: WearSlot, value: string | null): string | null {
    const d = this.save.data, look = { ...d.appearance };
    const owned = [...this.progress.unlocks, ...Object.keys(d.inventory?.items ?? {})];
    if (value !== null && !ownsWear(slot, value, d.inventory?.items ?? {}, this.progress.unlocks)) return 'Objet non possédé';
    switch (slot) {
      case 'outfit': look.outfit = (value ?? 'costume') as Look['outfit']; break;
      case 'pants': look.pants = (value ?? 'auto') as Look['pants']; break;
      case 'shoes': look.shoes = (value ?? 'auto') as Look['shoes']; break;
      case 'hat': look.hat = (value ?? 'aucun') as Look['hat']; break;
      case 'glasses': look.glasses = value !== null; look.glassesStyle = (value ?? look.glassesStyle ?? 'soleil') as Look['glassesStyle']; break;
      case 'jewel': look.jewel = (value ?? 'aucun') as Look['jewel']; break;
    }
    const next = enforceUnlocks(look, owned);
    releaseLook(d.appearance);
    d.appearance = next;
    this.save.saveNow();
    this.net?.send({ t: 'look', look: next });
    return null;
  }

  /** L'élément est-il porté en ce moment ? */
  wearing(slot: WearSlot, value: string): boolean {
    const l = this.save.data.appearance;
    switch (slot) {
      case 'outfit': return l.outfit === value;
      case 'pants': return (l.pants ?? 'auto') === value;
      case 'shoes': return (l.shoes ?? 'auto') === value;
      case 'hat': return l.hat === value;
      case 'glasses': return l.glasses && (l.glassesStyle ?? 'soleil') === value;
      case 'jewel': return (l.jewel ?? 'aucun') === value;
    }
  }

  /**
   * Accès à un pont (même règle que le serveur). Un passager qui a déjà reçu le cadeau de la réception a son
   * KS Pass (remis par l'autorité à la prochaine requête si la sauvegarde date d'avant le pass).
   */
  floorAccess(id: string) {
    const items = { ...(this.save.data.inventory?.items ?? {}) };
    if (this.save.data.flags['gift.received']) items['ks-pass'] = Math.max(1, items['ks-pass'] ?? 0);
    return floorAccess(id, items, this.progress.unlocks);
  }

  /** Quantité d'un objet de l'inventaire (dernier état reçu de l'autorité). */
  itemCount(id: string): number { return this.save.data.inventory?.items[id] ?? 0; }

  /** Rafraîchit jetons, inventaire et jauges sans rien modifier (relevé de 0 s). */
  async refreshEco(): Promise<void> {
    await this.ask('purser', 'purser', 'needs', { seconds: 0 });
  }

  /** Écouteurs de progression (XP gagnée, montée de niveau) : affichage dans le monde et les mini-jeux. */
  readonly progressListeners = new Set<(p: ProgressSnapshot) => void>();

  /** Recopie la progression renvoyée par l'autorité (en ligne : le serveur fait foi) et prévient l'interface. */
  private applyProgress(p: ProgressSnapshot): void {
    const d = this.save.data;
    d.progress ??= newProgress();
    d.progress.xp = p.xp; d.progress.level = p.level; d.progress.title = p.title;
    d.progress.unlocks.splice(0, d.progress.unlocks.length, ...p.unlocks);
    if (p.missions) d.missions = p.missions;
    if (p.pass) d.progress.pass = p.pass;
    if (p.room) d.room = p.room;
    this.save.markDirty();
    if (p.gainedXp > 0 || p.levelUps.length) for (const f of this.progressListeners) { try { f(p); } catch (e) { console.error(e); } }
  }

  /** Niveau et progression courants (affichage). */
  get progress(): ProgressState { return (this.save.data.progress ??= newProgress()); }

  /** Connexion en ligne active (null : hors ligne). */
  net: Connection | null = null;

  /** Passe en ligne : le profil vient du serveur, qui devient seul juge des KSCoins et des récompenses. */
  goOnline(conn: Connection, p: OwnProfile): void {
    const settings = { ...this.save.data.settings };
    const d = createDefaultPlayer();
    Object.assign(d, {
      playerId: p.id, name: p.name, appearance: p.look, wallet: { balance: p.wallet.balance, processedTx: [] },
      stats: { ...p.stats }, flags: { ...p.flags, 'profile.done': true }, dailyRewards: { ...p.dailyRewards },
      cabin: { ...p.cabin }, location: { floorId: p.location.floorId }, settings,
      progress: p.progress, missions: p.missions ?? undefined, room: p.room,
      chips: { balance: p.chips ?? 0, processedTx: [] }, inventory: { items: { ...(p.inventory ?? {}) } }, needs: p.needs ? { ...p.needs, lastTick: 0, coma: null } : undefined,
      keys: (p.keys ?? []).map((k) => ({ ...k })), keyring: { lock: Math.max(1, p.lock ?? 1), made: 0 },
    });
    this.save.switchTo(`kingsea.online.${p.id}`, d);
    this.wallet = this.makeWallet(); this.chips = this.makeChips();
    this.net = conn;
    this.backend = new RemoteBackend(conn);
    // Réponse tardive (après le délai d'attente) : soldes, inventaire et jauges réalignés sur le serveur
    conn.onLateReply = (r) => { this.wallet.syncFrom(r.balance); if (r.eco) this.applyEco(r.eco); };
  }

  /** Revient à la partie hors ligne (sauvegarde locale, autorité sur le téléphone). */
  goOffline(): void {
    const settings = { ...this.save.data.settings };
    this.net?.close();
    this.net = null;
    this.save.switchTo(SAVE_KEY);
    this.save.data.settings = settings;
    this.wallet = this.makeWallet(); this.chips = this.makeChips();
    this.backend = this.local;
  }

  get online(): boolean { return this.net !== null; }

  private makeWallet(): Wallet { return new Wallet(this.save.data.wallet, () => this.save.markDirty()); }
  private makeChips(): Wallet { return new Wallet((this.save.data.chips ??= { balance: 0, processedTx: [] }), () => this.save.markDirty()); }

  get data() { return this.save.data; }

  applySettings(): void {
    const s = this.save.data.settings;
    this.audio.setVolumes(s.sfxVolume, s.ambientVolume, s.musicVolume, s.masterVolume);
    const g = this.game;
    g.controls.custom = { ...s.keymap };
    g.autoQuality = s.autoQuality;
    if (!s.autoQuality) g.autoLow = false;
    g.maxFps = s.powerSaver ? 30 : 60;
    g.viewport.setMaxDpr(s.powerSaver || g.autoLow ? 1.5 : 2.5);
    g.lowFx = this.lowFx;
    setLayerCacheSize(this.lowFx || lowMemoryDevice() ? 2 : 3);
    g.resetQualityWatch();
  }

  /** Effets réduits effectifs : choisis, imposés par l'économie d'énergie ou par la qualité automatique. */
  get lowFx(): boolean { const s = this.save.data.settings; return s.lowFx || s.powerSaver || this.game.autoLow; }

  /** Retour haptique (vibration) si l'appareil le permet et si le joueur l'a laissé activé. */
  haptic(pattern: number | number[]): void {
    if (!this.save.data.settings.haptics) return;
    vibrate(pattern);
  }

  setFlag(key: string, value = true): void {
    this.save.data.flags[key] = value; this.save.markDirty();
    if (this.backend.online && ['engine.lights', 'cabin.dim', 'profile.done'].includes(key)) void this.ask('purser', 'purser', 'flag', { key, value });
  }
  flag(key: string): boolean { return !!this.save.data.flags[key]; }

  incStat(key: string, by = 1): void {
    // Statistiques qui comptent pour les missions : passent par l'autorité (en ligne comme hors ligne)
    if (/^(greetings|naps|slides|swims)$/.test(key) || (key.startsWith('emote.') && EMOTE_BY_ID.has(key.slice(6)))) { void this.ask('purser', 'purser', 'stat', { key, by: Math.min(20, by) }); return; }
    this.save.data.stats[key] = (this.save.data.stats[key] ?? 0) + by; this.save.markDirty();
  }

  resetProgress(): void {
    this.save.resetAll();
    this.wallet = this.makeWallet(); this.chips = this.makeChips();
    this.applySettings();
  }
}
