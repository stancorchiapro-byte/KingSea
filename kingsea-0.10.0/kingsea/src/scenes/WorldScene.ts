// Monde explorable : étage courant, personnage, PNJ, interactions, ascenseur, HUD et menus.
import { ANIMS, drawLook, EMOTE_ANIMS, NPC_LOOKS, releaseLook, warmLook, type Anim, type Dir } from '../art/characters';
import { Crowd, type Passenger } from '../entities/Passengers';
import { findTiles, getStaticLayer, type StaticLayer } from '../art/floorRenderer';
import { makeCanvas, roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { CHARACTER_PROPS, drawPropOverlay, getPropVisual, hasOverlay, propExtraTop, WALL_PROPS, type PropAnimState } from '../art/props';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { clamp } from '../engine/math';
import type { Scene } from '../engine/Scene';
import { Player, FOOT_H, FOOT_W } from '../entities/Player';
import { InteractionSystem, type Interactable } from '../interaction/InteractionSystem';
import { HUB_BAR_DRINKS, ROOFTOP_BAR_DRINKS, SNACK_ITEMS, VIP_DRINKS, type Drink } from '../data/drinks';
import { activityList, ARCADE_GAMES } from '../data/activities';
import type { Ambient } from '../systems/Audio';
import type { MusicTheme } from '../systems/Music';
import { CabinRegistry } from '../systems/Cabins';
import { BilliardsGame } from '../games/BilliardsGame';
import { BlackjackGame } from '../games/BlackjackGame';
import { BowlingGame } from '../games/BowlingGame';
import { BaccaratGame } from '../games/BaccaratGame';
import { BasketGame } from '../games/BasketGame';
import { FootballGame } from '../games/FootballGame';
import { MoleGame } from '../games/MoleGame';
import { PinballGame } from '../games/PinballGame';
import { SkeeBallGame } from '../games/SkeeBallGame';
import { CrapsGame } from '../games/CrapsGame';
import { CrashGame } from '../games/CrashGame';
import { KenoGame } from '../games/KenoGame';
import { PlinkoGame } from '../games/PlinkoGame';
import { RacesGame } from '../games/RacesGame';
import { VideoPokerGame } from '../games/VideoPokerGame';
import { dayKey } from '../games/logic/rng';
import { canSpinToday } from '../games/logic/wheel';
import type { MiniGame } from '../games/MiniGame';
import type { RoomState } from '../authority/progress';
import { RouletteGame } from '../games/RouletteGame';
import { SlotsGame } from '../games/SlotsGame';
import { SLOT_MACHINES } from '../games/logic/slotMachines';
import { variantOf } from '../art/props2';
import { WheelGame } from '../games/WheelGame';
import { MiniGameScene } from './MiniGameScene';
import { RacingGame } from '../games/RacingGame';
import { ProfileScene } from './ProfileScene';
import type { Services } from '../systems/Services';
import { BarMenu } from '../ui/BarMenu';
import { ElevatorMenu } from '../ui/ElevatorMenu';
import { EmoteMenu, type EmoteId } from '../ui/EmoteMenu';
import { drawEmoteIcon } from '../ui/emoteIcons';
import { EMOTE_BY_ID, emoteUnlocked } from '../data/emotes';
import { Hud } from '../ui/Hud';
import { InfoDialog, type Modal } from '../ui/Modal';
import { SettingsMenu } from '../ui/SettingsMenu';
import { MissionsMenu } from '../ui/MissionsMenu';
import { missionStatus } from '../authority/progress';
import { Toasts } from '../ui/Toasts';
import { font } from '../ui/UIKit';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { adjacentFloor, FLOORS, getFloor, getPlayableFloor, HUB_ID, setCabinRoom, setCabinWallColor } from '../world/floors';
import { RoomEditor } from '../ui/RoomEditor';
import { FriendsMenu } from '../ui/FriendsMenu';
import { ControlsMenu } from '../ui/ControlsMenu';
import { CashierMenu } from '../ui/CashierMenu';
import { InventoryMenu } from '../ui/InventoryMenu';
import { ARCADE_INFO, medalFor } from '../games/arcade';
import { GAME_LABELS } from '../games/logic/pending';
import { ShopMenu } from '../ui/ShopMenu';
import { VIP_LOUNGE } from '../world/floors/rooftop';
import { FURNITURE_BY_ID } from '../data/furniture';
import { DANCE_FLOOR } from '../world/floors/rooftop';
import { AmbientFx, skyTint, type FxContext } from '../art/ambientFx';
import { Presence, type ChatLine, type Remote } from '../net/Presence';
import { PhoneState } from '../net/Phone';
import { PhoneMenu } from '../ui/PhoneMenu';
import { LevelsMenu, passClaimable } from '../ui/LevelsMenu';
import { LocksmithMenu } from '../ui/LocksmithMenu';
import type { NetAnim } from '../net/protocol';
import { ChatInput } from '../ui/ChatInput';
import { PlayersMenu } from '../ui/PlayersMenu';
import { wrapText } from '../ui/UIKit';
import { propActive, propInteractPoint, TileMap } from '../world/TileMap';
import { isWaterChar, stairsArrival, TILE, type FloorDef, type LightDef, type PropDef } from '../world/types';
import { CABIN_WALL_COLORS } from '../art/palette';
import { AudioSystem } from '../systems/Audio';

const AMBIENTS: Record<string, Ambient> = { cabinRoom: 'cabins', panorama: 'cabins', hub: 'hub', engine: 'engine', casino: 'casino', arcade: 'arcade', cabins: 'cabins', rooftop: 'rooftop' };
type Arrival = 'elevator' | 'up' | 'down';
/** Musique par lieu : lounge bossa (hall), jazz (casino), chiptune (arcade), harpe (logements), lounge lo-fi (cabine),
 * tropical le jour / deep house la nuit (rooftop), deep house au salon VIP. */
const MUSIC: Record<string, MusicTheme> = { panorama: 'lounge', hub: 'hub', engine: 'engine', casino: 'casino', arcade: 'arcade', cabins: 'cabins', rooftop: 'rooftop', cabinRoom: 'lounge' };

interface Npc { prop: PropDef; look: (typeof NPC_LOOKS)[string]; x: number; y: number; dir: Dir; busy: number; lookT: number }

/** Passagers d'ambiance par étage (réduits de moitié avec « Effets réduits »). */
const CROWD: Record<string, number> = { panorama: 2, hub: 5, casino: 5, arcade: 4, cabins: 2, rooftop: 7, engine: 0 };
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; kind: 'spark' | 'bubble' | 'text' | 'confetti' | 'glint'; text?: string }

const RECEPTION_GIFT = 100;
const COMPASS_REWARD = 75;

export class WorldScene implements Scene {
  floor!: FloorDef;
  map!: TileMap;
  private layer!: StaticLayer;
  player!: Player;
  private npcs: Npc[] = [];
  crowd: Crowd | null = null;
  readonly interactions = new InteractionSystem();
  readonly joystick: VirtualJoystick;
  private hud: Hud;
  private toasts = new Toasts();
  modal: Modal | null = null;
  private cam = { x: 0, y: 0, zoom: 1 };
  private t = 0;
  private elevatorOpen = 0;
  private particles: Particle[] = [];
  private emote: { id: EmoteId; t: number } | null = null;
  private lightCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private portraitHinted = false;
  private travelling = false;
  private animTiles: Array<{ x: number; y: number; c: string }> = [];
  private seatHinted = false;
  private started = false;
  private swimming = false;
  private lastSwimStat = -99;
  /** Ouvrir la liste d'amis dès que la connexion est prête (choisi dans le menu). */
  private pendingFriends = false;
  private onDanceFloor = false;
  private danceHinted = false;
  /** Glissade du toboggan : trajectoire de Bézier en unités monde. */
  private ride: { t: number; dur: number; p: Array<{ x: number; y: number }> } | null = null;
  private lastStep = 0;
  private fx = new AmbientFx();
  private fxCtx: FxContext | null = null;
  private poolTiles: Array<{ x: number; y: number }> = [];
  /** Multijoueur : autres joueurs, chat (null hors ligne). */
  presence: Presence | null = null;
  /** Téléphone KS (en ligne) : messages, contacts, cadeaux, visites. */
  phone: PhoneState | null = null;
  /** Cabine d'un autre joueur visitée (null : chez soi ou ailleurs). */
  private visit: { owner: string; name: string; cabin: string | null } | null = null;
  private chatInput = new ChatInput();
  private unread = 0;
  private chatShowT = 0;

  constructor(private s: Services, private toMenu: () => Scene) {
    const vp = s.game.viewport;
    this.joystick = new VirtualJoystick(vp);
    this.hud = new Hud({
      onFloors: () => this.openElevator(),
      onSettings: () => this.openSettings(),
      onInteract: () => this.interactFocused(),
      onEmote: () => this.openModal(new EmoteMenu(this.s, (e) => this.playEmote(e))),
      onInventory: () => this.openInventory(),
      onChat: () => this.openChat(),
      onPlayers: () => this.openFriends(),
      onMissions: () => this.openMissions(),
      onPhone: () => this.openPhone(),
      onLevels: () => this.openModal(new LevelsMenu(this.s)),
    }, () => s.audio.tap());
    // Arrivée des pièces / jetons dans les compteurs : petits sons discrets, plus marqués à la dernière
    this.hud.balance.onArrive = (i, n) => { if (i === n) { this.s.audio.coin(); this.s.haptic(15); } else if (i % 3 === 1) this.s.audio.tick(); };
    this.hud.chips.onArrive = (i, n) => { if (i === n) { this.s.audio.chip(); this.s.haptic(15); } else if (i % 3 === 1) this.s.audio.tick(); };
    this.hud.levelUp.onShow = () => { this.s.audio.jackpot(); this.s.haptic([40, 60, 40, 60, 120]); };
    // XP et montées de niveau renvoyées par l'autorité (seulement quand le navire est à l'écran)
    s.progressListeners.add((p) => {
      if (this.s.game.current !== this) return;
      this.hud.level.gain(p.gainedXp);
      if (p.levelUps.length) this.hud.levelUp.show(p.levelUps);
    });
  }

  // ---------------------------------------------------------------- cycle de vie
  enter(): void {
    setCabinWallColor(this.s.data.cabin.wallColor);
    setCabinRoom(this.s.data.room);
    if (this.started) {
      // Retour d'un mini-jeu : on reprend exactement où l'on était (étage, position, ambiance).
      this.onResize();
      this.s.audio.setAmbient(AMBIENTS[this.floor.theme] ?? 'hub');
      this.s.audio.setMusic(this.musicFor());
      this.refreshInteractables();
      this.player.frozen = false;
      this.travelling = false;
      if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __ks: unknown }).__ks = { scene: this, services: this.s };
      return;
    }
    this.started = true;
    // Faim et soif : alertes, coma, réveil (le relevé initial ne fait pas baisser les jauges)
    const nd = this.s.needs;
    nd.onAlert = (a) => {
      if (this.s.game.current !== this) return;
      this.toasts.show(a.text, a.level >= 3 ? 'error' : 'info', a.level >= 2 ? 5 : 3.5);
      if (a.level >= 3) { this.s.audio.error(); this.s.haptic([60, 40, 60]); } else this.s.audio.tick();
    };
    nd.onComa = (cause) => this.enterComa(cause);
    nd.onWake = () => this.wakeUp();
    void nd.prime();
    this.startPresence();
    if (this.s.notice) { this.toasts.show(this.s.notice, 'reward', 6); this.s.notice = null; }
    const dest = this.s.destination;
    this.s.destination = null;
    this.loadFloor(dest === 'casino' || dest === 'arcade' || dest === 'rooftop' ? dest : dest === 'cabin' ? 'cabins' : this.s.data.location.floorId, true);
    // « Ma chambre » : entrée directe dans la cabine si elle est attribuée (hors ligne : attribuée à l'arrivée)
    if (dest === 'cabin') {
      if (this.s.data.cabin.id) this.loadFloor('cabin-interior', false);
      else this.toasts.show('Ta cabine t’attend : porte à plaque dorée.', 'info', 4);
    }
    if (dest === 'friends') this.pendingFriends = true;
    this.onResize();
    this.hud.syncBalance(this.s.wallet.balance);
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __ks: unknown }).__ks = { scene: this, services: this.s };
  }

  exit(): void { this.s.save.saveNow(); this.chatInput.hide(); }

  /** Branche le multijoueur si la partie est en ligne. */
  private startPresence(): void {
    const conn = this.s.net;
    if (!conn || !conn.profile) return;
    this.hud.chatBtn.visible = this.hud.playersBtn.visible = true;
    this.hud.phoneBtn.visible = true;
    this.startPhone(conn);
    this.presence = new Presence(conn, conn.profile.id, {
      onCorrect: (x, y) => { this.player.x = x; this.player.y = y; },
      onCabin: (id, wallColor) => {
        const d = this.s.data, fresh = !d.cabin.id && !!id;
        d.cabin.id = id; d.cabin.wallColor = wallColor; this.s.save.markDirty();
        setCabinWallColor(wallColor);
        this.refreshInteractables();
        if (fresh) this.toasts.show(`Ta cabine : n°${id} (porte dorée)`, 'reward', 4);
      },
      onNotice: (msg) => this.toasts.show(msg, 'info', 3.5),
      onKicked: (msg) => { this.toasts.show(msg, 'error', 5); this.s.game.goto(this.toMenu); },
      onDisconnected: () => this.toasts.show('Connexion perdue… reconnexion en cours', 'error', 3),
      onReconnected: () => this.toasts.show('Reconnecté', 'success', 2),
      onChat: (line) => { if (!this.chatInput.open && !line.mine) this.unread++; this.chatShowT = 12; if (!line.mine) this.s.audio.tick(); },
      onChatError: (msg) => this.toasts.show(msg, 'error', 3),
      onVisit: (v) => {
        // Cabine d'un ami : son aménagement et sa couleur, envoyés par le serveur (instance privée de sa cabine)
        this.visit = { owner: v.owner, name: v.name, cabin: v.cabin };
        setCabinRoom(v.room); setCabinWallColor(v.wallColor);
        this.loadFloor('cabin-interior', false, 'elevator', { x: this.player.x / TILE, y: this.player.y / TILE }, false);
        this.toasts.show(`Bienvenue chez ${v.name}`, 'success', 2.6);
      },
      onEvict: (msg) => {
        this.toasts.show(msg, 'info', 3.5);
        if (this.floor.id === 'cabin-interior' && (this.visit || !this.s.data.cabin.id)) this.leaveVisit();
        else if (this.visit) this.visit = null;
      },
      onPlayers: (list) => this.openModal(new PlayersMenu(this.s, list, conn.profile!.id, this.presence!.blocked, {
        block: (id, on) => this.presence?.block(id, on),
        report: (id, reason) => this.presence?.report(id, reason),
        addFriend: (name) => { conn.send({ t: 'friendAdd', query: name }); this.openFriends(); },
      })),
    });
  }

  /** Téléphone KS : en ligne, branché au serveur ; hors ligne, il l'indique simplement. */
  private openPhone(opts?: { giftKey?: string; chat?: string }): void {
    this.openModal(new PhoneMenu(this.s, this.phone, opts));
  }

  private startPhone(conn: NonNullable<Services['net']>): void {
    this.phone?.dispose();
    this.phone = new PhoneState(conn, {
      notify: (text, kind) => { this.toasts.show(text, kind, 3.6); if (kind !== 'error') this.s.audio.tick(); },
      ring: (from, name) => {
        this.s.audio.ding(); this.s.haptic([40, 80, 40]);
        const m = new InfoDialog(this.s, 'On sonne à ta porte !', `${name} aimerait te rendre visite dans ta cabine.`, [
          { label: 'Pas maintenant', style: 'ghost', onTap: () => this.phone?.answerRing(from, false) },
          { label: 'Ouvrir la porte', style: 'gold', onTap: () => this.phone?.answerRing(from, true) },
        ]);
        this.openModal(m);
      },
      visitAccepted: (owner, name) => this.visitCabin(owner, name),
      reply: (r) => { this.s.absorb('purser', 'purser', 'gift', r); },
    });
  }

  /** Entrer dans la cabine d'un ami (invitation acceptée ou double de clé) : le serveur vérifie l'accès. */
  visitCabin(owner: string, name: string): void {
    if (!this.presence || this.travelling) return;
    this.visit = { owner, name, cabin: null };
    this.travelling = true; this.player.frozen = true; this.joystick.release();
    this.s.audio.tap();
    this.s.game.fadeThrough(() => {
      try {
        // On reste dans le couloir tant que le serveur n'a pas ouvert la porte (aménagement reçu → onVisit)
        this.presence?.join('cabin-interior', 7 * TILE, 8.4 * TILE, owner);
      } finally { this.travelling = false; this.player.frozen = false; }
    }, 3.2);
  }

  /** Quitte la cabine visitée : retour au couloir devant sa porte, aménagement de sa propre cabine rétabli. */
  private leaveVisit(): void {
    const cabin = this.visit?.cabin;
    this.visit = null;
    setCabinRoom(this.s.data.room); setCabinWallColor(this.s.data.cabin.wallColor);
    const door = getFloor('cabins')?.props?.find((p) => p.kind === 'cabinDoor' && p.id === (cabin ?? this.s.data.cabin.id));
    this.goInterior('cabins', door ? { x: door.tx + 0.5, y: door.ty + 2.7 } : undefined);
  }

  private openChat(): void {
    if (!this.presence) return;
    this.unread = 0; this.chatShowT = 30;
    this.joystick.release();
    this.chatInput.onScope = () => { this.chatShowT = 30; };
    this.chatInput.show((text, scope) => this.presence?.say(text, scope), () => { this.chatShowT = 8; });
  }

  onResize(): void {
    const v = this.s.game.viewport;
    const set = this.s.data.settings;
    this.joystick.scale = set.joystickScale; this.joystick.mirror = set.leftHanded;
    this.joystick.layout();
    this.hud.layout(v, set.joystickScale, set.leftHanded);
    this.modal?.layout(v);
    // Zoom : ~10,5 tuiles de haut en paysage ; reste lisible en portrait.
    this.cam.zoom = clamp(Math.min(v.height, v.width * 0.75) / (TILE * 10.5), 0.8, 3);
    if (v.isPortrait && !this.portraitHinted) { this.portraitHinted = true; this.toasts.show('Astuce : le jeu est plus confortable en paysage', 'info', 4); }
  }

  onBack(): boolean {
    if (this.modal) { this.modal.close(); return true; }
    this.openSettings();
    return true;
  }

  // ---------------------------------------------------------------- étages
  loadFloor(id: string, initial = false, via: Arrival = 'elevator', at?: { x: number; y: number }, join = true): void {
    // Ponts réservés (KS Pass Croisière, niveau) : même règle que le serveur ; sinon retour au hall
    const acc = this.s.floorAccess(id);
    if (!acc.ok && id !== HUB_ID) {
      this.toasts.show(acc.reason, 'info', 4.5);
      if (this.floor && this.map) { this.travelling = false; this.player.frozen = false; return; }
      id = HUB_ID; at = undefined;
    }
    // Quitter la cabine visitée : son aménagement laisse place au sien
    if (id !== 'cabin-interior' && this.visit) { this.visit = null; setCabinRoom(this.s.data.room); setCabinWallColor(this.s.data.cabin.wallColor); }
    if (id === 'cabin-interior' && !this.visit) { setCabinRoom(this.s.data.room); setCabinWallColor(this.s.data.cabin.wallColor); }
    const f0 = getPlayableFloor(id);
    const f = this.visit && id === 'cabin-interior' ? { ...f0, name: `Cabine de ${this.visit.name}`, description: `Cabine de ${this.visit.name} (invité)` } : f0;
    this.floor = f;
    this.map = TileMap.fromFloor(f, this.s.data.flags);
    this.layer = getStaticLayer(f);
    for (const p of f.props ?? []) getPropVisual(p); // décor préparé pendant la transition, pas à la première image
    this.animTiles = findTiles(f, 'pf');
    // Arrivée : devant l'ascenseur, ou devant l'escalier opposé quand on vient d'un étage voisin.
    const fromStairs = via === 'up' ? stairsArrival(f, 'stairsDown') : via === 'down' ? stairsArrival(f, 'stairsUp') : null;
    const spawn = at ?? fromStairs ?? f.spawn ?? { x: 2, y: 2 };
    const free = this.map.findFreeSpot(spawn.x * TILE, spawn.y * TILE, FOOT_W, FOOT_H) ?? { x: spawn.x * TILE, y: spawn.y * TILE };
    this.player = new Player(free.x, free.y);
    this.player.dir = fromStairs ? (spawn.x < 5 ? 'right' : 'left') : 'down';
    this.swimming = false; this.ride = null; this.onDanceFloor = false;
    this.npcs = (f.props ?? []).filter((p) => CHARACTER_PROPS.has(p.kind)).map((p) => ({
      prop: p, look: NPC_LOOKS[p.kind],
      x: (p.tx + 0.5) * TILE, y: (p.ty + p.h) * TILE - 2, dir: 'down' as Dir, busy: 0, lookT: Math.random() * 3,
    }));
    this.refreshInteractables();
    // Libère les animations des passagers de l'étage précédent (mémoire des téléphones)
    for (const p of this.crowd?.list ?? []) releaseLook(p.look);
    // Rooftop : la nuit tombe à l'heure locale (19 h – 6 h) ; « ?night=1 » / « ?night=0 » pour forcer
    if (f.id === 'rooftop') {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('night') : null;
      const h = new Date().getHours();
      this.s.data.flags['rooftop.night'] = q === '1' ? true : q === '0' ? false : h >= 19 || h < 6;
    }
    const n = Math.ceil((CROWD[f.id] ?? 0) * (this.s.online ? 0.5 : 1)); // en ligne, place aux vrais joueurs
    const danceTiles = f.id === 'rooftop' ? findTiles(f, 'f').map((t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.8) * TILE })) : [];
    this.crowd = n > 0 ? new Crowd(this.map, { count: this.s.lowFx ? Math.ceil(n / 2) : n, danceTiles, dancers: danceTiles.length ? 3 : 0 }, Math.random, this.player) : null;
    // Animations des passagers et de l'équipage préparées pendant la transition (pas d'à-coup à leur apparition)
    for (const p of this.crowd?.list ?? []) warmLook(p.look, p.dancer ? ['dance', 'wave'] : ['walk', 'idle', 'wave']);
    for (const npc of this.npcs) warmLook(npc.look, npc.prop.kind === 'dj' ? ['dance'] : ['idle', 'interact']);
    this.elevatorOpen = via === 'elevator' ? 1 : 0; // on sort de l'ascenseur
    this.particles = [];
    this.timed = [];
    this.fx.reset();
    this.poolTiles = findTiles(f, 'p');
    this.cam.x = this.player.x; this.cam.y = this.player.y - TILE;
    this.s.data.location.floorId = f.id;
    this.s.save.markDirty();
    this.s.audio.setAmbient(AMBIENTS[f.theme] ?? 'hub');
    this.s.audio.setMusic(this.musicFor());
    this.s.audio.setClubLevel(0);
    if (f.id === 'cabins') this.ensureCabin();
    if (join) this.presence?.join(f.id, this.player.x, this.player.y, f.id === 'cabin-interior' ? this.visit?.owner : undefined);
    this.s.audio.setEngineBoost(this.s.flag('engine.lights'));
    // Découverte du lieu (XP la première fois) et missions d'exploration
    void this.s.ask('purser', 'purser', 'visit', { place: f.id });
    void initial; // le badge du HUD affiche déjà l'étage : pas de message en double
  }

  private refreshInteractables(): void {
    const flags = this.s.data.flags;
    this.map.rebuildSolids(this.floor.props ?? [], flags);
    const items: Interactable[] = [];
    for (const p of this.floor.props ?? []) {
      if (!p.interact) continue;
      const pt = propInteractPoint(p);
      const extraTop = WALL_PROPS.has(p.kind) ? 0 : TILE * 0.8;
      items.push({
        key: `${p.interact.id}@${p.tx},${p.ty}`, handler: p.interact.id, label: p.interact.label,
        x: pt.x, y: pt.y, radius: (p.interact.radius ?? 1.6) * TILE,
        hit: { x: p.tx * TILE - 6, y: p.ty * TILE - extraTop - 6, w: p.w * TILE + 12, h: p.h * TILE + extraTop + 12 },
        enabled: propActive(p, flags),
        quiet: p.interact.quietLabel,
        ref: p,
      });
      const it = items[items.length - 1];
      if (p.kind === 'cabinDoor' && p.id === this.s.data.cabin.id) { it.label = `Ma cabine ${p.id}`; it.quiet = false; }
      if (p.interact.id === 'wheel' && canSpinToday(this.s.data.dailyRewards.lastWheelDay, dayKey())) it.label = 'Roue du jour · prête !';
    }
    this.interactions.set(items);
  }

  travel(floorId: string): void {
    const f = getFloor(floorId);
    if (!f || !f.available) { this.toasts.show('Cet étage est encore en construction', 'error'); this.s.audio.error(); return; }
    if (f.id === this.floor.id || this.travelling) return;
    this.travelling = true;
    this.player.frozen = true;
    this.joystick.release();
    this.s.audio.whoosh();
    this.s.game.transitionLabel = `${f.short} · ${f.name}`;
    // Écran de chargement de l'ascenseur : logo KS animé, étage d'arrivée, indicateur d'étages
    const stops = [...FLOORS].sort((x, y) => x.level - y.level);
    const fromLvl = this.floor.id === 'cabin-interior' ? 'cabins' : this.floor.id;
    this.s.game.elevatorRide = {
      stops: stops.map((x) => x.short),
      from: Math.max(0, stops.findIndex((x) => x.id === fromLvl)), to: stops.findIndex((x) => x.id === f.id), label: `${f.short} · ${f.name}`,
    };
    this.s.game.fadeThrough(() => {
      try { this.loadFloor(f.id); this.s.audio.ding(); this.s.audio.whoosh(); }
      finally { this.travelling = false; this.player.frozen = false; } // jamais bloqué, même si l'étage ne charge pas
    }, 1.6, 'elevator');
  }

  /** Escaliers : vers l'étage voisin, arrivée devant l'escalier opposé. */
  climb(dir: 1 | -1): void {
    const f = adjacentFloor(this.floor, dir);
    if (!f || this.travelling) return;
    this.travelling = true;
    this.player.frozen = true;
    this.joystick.release();
    this.s.audio.tap();
    this.s.game.fadeThrough(() => { this.loadFloor(f.id, false, dir === 1 ? 'up' : 'down'); this.travelling = false; }, 3);
  }

  /** Attribue une cabine au joueur s'il n'en a pas encore (une seule, jamais partagée). */
  private ensureCabin(): void {
    const d = this.s.data;
    if (this.presence) { if (!d.cabin.id) this.presence.requestCabin(); return; } // en ligne : le serveur attribue
    const reg = new CabinRegistry();
    if (d.cabin.id && reg.restore(d.playerId, d.cabin.id)) return;
    const id = reg.assign(d.playerId);
    if (!id) return;
    d.cabin.id = id;
    this.s.save.saveNow();
    this.refreshInteractables();
    this.toasts.show(`Ta cabine : n°${id} (porte dorée)`, 'reward', 4);
  }

  // ---------------------------------------------------------------- menus
  private openModal(m: Modal): void {
    if (this.comaCause) return; // aucun menu pendant un coma
    this.modal?.close();
    m.onClosed = () => { if (this.modal === m) { this.modal = null; this.s.game.refreshHandlers(); } };
    m.layout(this.s.game.viewport);
    this.modal = m;
    this.joystick.release();
    this.s.game.refreshHandlers();
  }

  /** Amis : en ligne uniquement (liste, demandes et codes gardés par le serveur). */
  openFriends(): void {
    const conn = this.s.net;
    if (!conn || !this.presence) {
      this.openModal(new InfoDialog(this.s, 'Amis', 'Les amis, le chat global et les codes amis fonctionnent en ligne. Reviens au menu et choisis « En ligne » pour te connecter.'));
      return;
    }
    this.openModal(new FriendsMenu(this.s, conn, {
      join: (floor, name) => {
        if (floor === this.floor.id) { this.toasts.show(`${name} est à cet étage`, 'info', 2.4); return; }
        this.toasts.show(`Direction : ${name}`, 'info', 2);
        this.travel(floor);
      },
      players: () => this.presence?.requestPlayers(),
      dialog: (d) => this.openModal(d),
    }));
  }

  openMissions(): void {
    const m = new MissionsMenu(this.s);
    this.openModal(m);
  }

  /** Inventaire (bouton sac du HUD, touche I) : consommer, porter, utiliser, placer. */
  openInventory(): void {
    const inCabin = this.floor.id === 'cabin-interior';
    this.openModal(new InventoryMenu(this.s, {
      consumed: (d, eff) => this.showConsumed(d.type === 'food' ? 'food' : 'drink', d.colors[0], d.name, eff),
      used: (d, effect) => this.playItemEffect(effect, d.name),
      phone: () => this.openPhone(),
      giftKey: (uid) => this.openPhone({ giftKey: uid }),
      placeDecor: inCabin && !this.visit ? () => this.openModal(new RoomEditor(this.s, this.s.data.cabin.wallColor, (room) => this.roomSaved(room), (i) => this.setWallColor(i))) : null,
      toast: (m, k) => this.toasts.show(m, k, 2.4),
    }));
  }

  /** Effets des objets utilisables (visibles à l'écran du joueur). */
  private playItemEffect(effect: string, name: string): void {
    const px = this.player.x, py = this.player.y;
    if (effect === 'fireworks') {
      const colors = ['#ffd166', '#ff3fa4', '#1fc7c1', '#efdcae', '#8fb6ff'];
      for (let i = 0; i < 5; i++) {
        this.s.audio.firework(i * 0.35);
        this.later(0.5 + i * 0.35, () => this.burst(px + (Math.random() - 0.5) * 90, py - 70 - Math.random() * 50, colors[i % colors.length], 30));
      }
      this.s.haptic([30, 300, 30, 300, 30]);
    } else if (effect === 'confetti') {
      const colors = ['#1fc7c1', '#ff6f91', '#ffd166', '#c38bff', '#7bd389', '#ffffff'];
      const n = this.s.lowFx ? 30 : 90;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 120 + Math.random() * 140;
        this.particles.push({ x: px, y: py - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2.2 + Math.random(), max: 3.2, color: colors[i % colors.length], size: 2.5 + Math.random() * 2, kind: 'confetti' });
      }
      this.s.audio.cheer();
    } else if (effect === 'aura') {
      this.auraUntil = this.t + 180;
      this.s.audio.discover();
    }
    this.toasts.show(`${name} : ${effect === 'aura' ? 'un sillage scintillant te suit pendant 3 minutes' : 'effet garanti !'}`, 'reward', 2.6);
  }
  private auraUntil = 0;
  private timed: Array<{ at: number; fn: () => void }> = [];
  /** Exécute `fn` dans `sec` secondes (temps du jeu : suspendu avec lui, annulé au changement d'étage). */
  private later(sec: number, fn: () => void): void { this.timed.push({ at: this.t + sec, fn }); }

  openElevator(): void {
    this.openModal(new ElevatorMenu(this.s, this.floor.id, (id) => this.travel(id)));
  }

  private openSettings(): void {
    this.openModal(new SettingsMenu(this.s, {
      onChanged: () => this.onResize(),
      onControls: () => this.openModal(new ControlsMenu(this.s)),
      onQuitToMenu: () => { this.presence?.dispose(); this.presence = null; this.chatInput.hide(); this.s.game.goto(this.toMenu); },
      onLogout: this.s.online ? () => { this.presence?.dispose(); this.presence = null; this.chatInput.hide(); this.s.net?.logout(); this.s.game.goto(this.toMenu); } : undefined,
      onAccountDeleted: () => { this.presence?.dispose(); this.presence = null; this.chatInput.hide(); this.s.notice = 'Compte supprimé. Tu peux continuer hors ligne.'; this.s.game.goto(this.toMenu); },
      onReset: () => { this.s.resetProgress(); this.hud.syncBalance(this.s.wallet.balance); this.loadFloor(HUB_ID); this.toasts.show('Nouvelle partie', 'info'); },
    }));
  }

  // ---------------------------------------------------------------- interactions
  interactFocused(): void {
    if (this.comaCause) return;
    const it = this.interactions.focused;
    if (it) this.runInteraction(it);
  }

  runInteraction(it: Interactable): void {
    if (this.modal || this.s.game.transitioning) return;
    // Le personnage se tourne vers l'objet
    const dx = it.x - this.player.x, dy = it.y - this.player.y;
    this.player.actT = 0.45;
    this.player.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    switch (it.handler) {
      case 'elevator': this.openElevator(); break;
      case 'bar': this.openModal(new BarMenu(this.s, 'Bar KS · Hall', HUB_BAR_DRINKS, (d, now) => this.buyItem(d, now, 'bartender'))); break;
      case 'reception': this.reception(); break;
      case 'engine-panel': this.togglePanel(); break;
      case 'logbook': this.openModal(new InfoDialog(this.s, 'Journal du mécanicien',
        'Jour 12 — Les moteurs ronronnent. J’ai encore égaré ma boussole dorée quelque part au fond, près des caisses… Sans l’éclairage de maintenance, impossible d’y voir quoi que ce soit.\n\nNote : l’interrupteur est sur le panneau de contrôle, à droite de l’ascenseur.')); break;
      case 'compass': this.pickCompass(it); break;
      case 'stairs-up': this.climb(1); break;
      case 'stairs-down': this.climb(-1); break;
      case 'sit': this.sit(it); break;
      case 'vip-gate': this.vipGate(); break;
      case 'vip-bar': this.openModal(new BarMenu(this.s, 'Bar à champagne · VIP', VIP_DRINKS, (d, now) => this.buyItem(d, now, 'bartender'))); break;
      case 'rooftop-bar': this.openModal(new BarMenu(this.s, 'Bar du Rooftop', ROOFTOP_BAR_DRINKS, (d, now) => this.buyItem(d, now, 'bartender'))); break;
      case 'snack': this.openModal(new BarMenu(this.s, 'Snack du Rooftop', SNACK_ITEMS, (d, now) => this.buyItem(d, now, 'cook'))); break;
      case 'cashier': this.openModal(new CashierMenu(this.s, (msg) => this.toasts.show(msg, 'success', 2.4))); break;
      case 'shop': this.openModal(new ShopMenu(this.s, (m, k) => this.toasts.show(m, k, 2.6))); break;
      case 'aquarium': this.aquarium(); break;
      case 'piano': this.s.audio.piano(); this.s.incStat('piano'); this.spawnText(this.player.x, this.player.y - 60, '♪ ♫', PAL.goldLight); break;
      case 'info-screen': this.infoScreen(); break;
      case 'photo': this.photo(); break;
      case 'arcade-board': this.arcadeBoard(); break;
      case 'casino-board': this.casinoBoard(); break;
      case 'cabins-board': this.cabinsBoard(); break;
      case 'telescope': this.telescope(); break;
      case 'star-map': this.starMap(); break;
      case 'fountain': {
        // Vœu gratuit : quelques éclaboussures dorées et un souhait au hasard (aucun coût, aucune promesse de gain)
        const wishes = ['Que la mer reste calme…', 'Une croisière inoubliable !', 'Un jackpot au casino ?', 'Des amis dans chaque port.', 'Une cabine digne d’un amiral.'];
        this.s.audio.splash(); this.burst(this.player.x, this.player.y - 40, PAL.goldLight, 18); this.s.incStat('wishes');
        this.toasts.show(`Vœu : ${wishes[Math.floor(Math.random() * wishes.length)]}`, 'info', 2.8);
        break;
      }
      case 'notice-board': this.openModal(new InfoDialog(this.s, 'Petites annonces du bord',
        '• Rendre visite à un ami : téléphone KS › Contacts › « Sonner ». Ton ami t’ouvre (ou non) sa porte.\n• Un double de clé ouvre la cabine d’un ami sans sonner : demande-le-lui (serrurier, au bout du couloir).\n• Fermer ta porte à clé : téléphone › Ma cabine.\n• Cadeaux entre amis : 1 000 KSCoins et 2 objets par 24 heures.')); break;
      case 'globe': this.globe(); break;
      case 'cabin-door': this.cabinDoor(it); break;
      case 'wheel': this.openGame(new WheelGame()); break;
      case 'cabin-exit': this.exitCabin(); break;
      case 'wardrobe': if (this.visit) { this.toasts.show('La garde-robe est celle de ton hôte : change de tenue dans ta cabine', 'info', 2.6); break; } this.wardrobe(); break;
      case 'locksmith': this.openModal(new LocksmithMenu(this.s, (m, k) => this.toasts.show(m, k, 2.6))); break;
      case 'logbook-cabin': this.cabinLog(); break;
      case 'cabin-lamp': this.s.setFlag('cabin.dim', !this.s.flag('cabin.dim')); this.s.audio.switchOn(); this.toasts.show(this.s.flag('cabin.dim') ? 'Ambiance tamisée' : 'Lumière allumée', 'info', 1.6); break;
      case 'bed': this.s.game.fadeThrough(() => { this.toasts.show('Petite sieste… te voilà reposé !', 'success'); this.s.incStat('naps'); }, 1.2); break;
      case 'decorate': if (this.visit) { this.toasts.show(`Seul(e) ${this.visit.name} peut aménager sa cabine`, 'info', 2.6); break; } this.openModal(new RoomEditor(this.s, this.s.data.cabin.wallColor, (room) => this.roomSaved(room), (i) => this.setWallColor(i))); break;
      case 'admire': {
        const f = FURNITURE_BY_ID.get(String((it.ref as PropDef | undefined)?.id ?? '').split('|')[0]);
        if (f) this.toasts.show(`${f.name} · pièce de ta collection`, 'reward', 2.4);
        break;
      }
      case 'slide': this.startSlide(); break;
      case 'dj': {
        this.s.audio.clubStyle = (this.s.audio.clubStyle + 1) % AudioSystem.CLUB_STYLES.length;
        this.toasts.show(`Le DJ passe : ${AudioSystem.CLUB_STYLES[this.s.audio.clubStyle]}`, 'success');
        const dj = this.npcs.find((n) => n.prop.kind === 'dj'); if (dj) dj.busy = 1.2;
        break;
      }
      case 'blackjack': this.atTable(it, () => new BlackjackGame()); break;
      case 'blackjack-hilo': this.atTable(it, () => new BlackjackGame(true)); break;
      case 'poker': this.atTable(it, () => new VideoPokerGame('classic')); break;
      case 'direct-poker': this.openGame(new VideoPokerGame('direct')); break;
      case 'baccarat': this.atTable(it, () => new BaccaratGame()); break;
      case 'craps': this.atTable(it, () => new CrapsGame()); break;
      case 'keno': this.openGame(new KenoGame()); break;
      case 'races': this.openGame(new RacesGame()); break;
      case 'plinko': this.openGame(new PlinkoGame()); break;
      case 'crash': this.openGame(new CrashGame()); break;
      case 'roulette': this.atTable(it, () => new RouletteGame()); break;
      case 'slots': this.openGame(new SlotsGame(SLOT_MACHINES[variantOf(it.ref as PropDef)] ?? SLOT_MACHINES[0])); break;
      case 'bowling': this.openGame(new BowlingGame()); break;
      case 'basket': this.openGame(new BasketGame()); break;
      case 'football': this.openGame(new FootballGame()); break;
      case 'skeeball': this.openGame(new SkeeBallGame()); break;
      case 'mole': this.openGame(new MoleGame()); break;
      case 'pinball': this.openGame(new PinballGame()); break;
      case 'billiards': this.openGame(new BilliardsGame()); break;
      case 'racing': this.openGame(new RacingGame()); break;
      default: console.warn('[KingSea] interaction sans gestionnaire :', it.handler);
    }
  }

  /** Thème musical du lieu courant (rooftop : deep house la nuit et dans le salon VIP). */
  private musicFor(): MusicTheme {
    if (this.floor.id === 'rooftop' && (this.s.flag('rooftop.night') || this.inVip())) return 'deephouse';
    return MUSIC[this.floor.theme] ?? 'hub';
  }
  private inVip(): boolean { return this.floor.id === 'rooftop' && this.player.x / TILE > 11.5 && this.player.x / TILE < 24 && this.player.y / TILE > 17.6; }

  /** Salon VIP du rooftop : entrée réservée (niveau 5, déblocage « feature:vip-lounge »), sortie libre. */
  private vipGate(): void {
    const inside = this.player.x / TILE > 11.5;
    if (!inside && !this.s.progress.unlocks.includes('feature:vip-lounge')) {
      this.s.audio.error();
      this.toasts.show(`Salon VIP : niveau ${VIP_LOUNGE.level} requis (tu es niveau ${this.s.progress.level})`, 'info', 3);
      return;
    }
    const to = inside ? VIP_LOUNGE.outside : VIP_LOUNGE.inside;
    this.player.held = null;
    this.s.game.fadeThrough(() => {
      this.player.seat = null;
      this.player.x = to.x * TILE; this.player.y = to.y * TILE;
      this.player.dir = inside ? 'left' : 'right';
      this.refreshInteractables();
      this.s.audio.setMusic(this.musicFor());
      if (!inside) {
        this.toasts.show('Bienvenue au salon VIP', 'reward', 2.4);
        void this.s.ask('purser', 'purser', 'visit', { place: 'vip-lounge' });
      }
    }, 3);
  }

  /** Disposition enregistrée par l'autorité : la cabine est reconstruite avec les nouveaux meubles. */
  private roomSaved(room: RoomState): void {
    setCabinRoom(room);
    const pos = { x: 10.5, y: 3.7 }; // devant l'établi (case toujours libre)
    this.s.game.fadeThrough(() => { this.loadFloor('cabin-interior', false, 'elevator', pos); this.elevatorOpen = 0; }, 4);
    this.toasts.show('Cabine aménagée', 'success');
  }

  private setWallColor(i: number): void {
    const d = this.s.data;
    if (i === d.cabin.wallColor) return;
    d.cabin.wallColor = i;
    this.s.save.saveNow();
    this.presence?.setCabinColor(i);
    setCabinWallColor(i);
    const pos = { x: this.player.x / TILE, y: this.player.y / TILE };
    this.s.game.fadeThrough(() => { this.loadFloor('cabin-interior', false, 'elevator', pos); this.elevatorOpen = 0; }, 4);
    this.toasts.show(`Murs : ${CABIN_WALL_COLORS[i].name}`, 'success');
  }

  /** Ouvre un mini-jeu dans sa scène dédiée ; « Quitter » ramène ici, au même endroit. */
  openGame(game: MiniGame): void {
    if (this.s.game.transitioning) return;
    this.joystick.release();
    this.player.held = null;
    this.s.game.goto(() => new MiniGameScene(this.s, game, () => this), 3.2, 'iris');
  }

  /**
   * Tables de casino : le joueur s'assoit d'abord à la table (comme sur un banc : même mécanisme de siège,
   * visible des autres joueurs), puis la partie s'ouvre. En revenant, il est toujours assis ; pousser le
   * joystick (ou une touche de direction) le relève et il quitte la table.
   */
  private atTable(it: Interactable, make: () => MiniGame): void {
    const p = it.ref as PropDef | undefined;
    if (!p) { this.openGame(make()); return; }
    if (!this.player.seat) {
      const x = clamp(this.player.x, p.tx * TILE + 14, (p.tx + p.w) * TILE - 14);
      this.player.sitAt(x, (p.ty + p.h) * TILE + 2, 'sit');
      this.player.dir = 'up'; // dos à la caméra, face au croupier
      this.emote = null;
      this.s.audio.tap();
    }
    setTimeout(() => this.openGame(make()), 380);
  }

  private sit(it: Interactable): void {
    const p = it.ref as PropDef | undefined;
    if (!p || this.player.seat) return;
    const lie = p.kind === 'transat';
    const x = lie ? (p.tx + 0.5) * TILE : clamp(this.player.x, p.tx * TILE + 12, (p.tx + p.w) * TILE - 12);
    this.player.sitAt(x, (p.ty + p.h) * TILE + 1, lie ? 'lie' : 'sit');
    this.emote = null;
    if (!this.seatHinted) { this.seatHinted = true; this.toasts.show('Pousse le joystick pour te relever', 'info', 3); }
  }

  private cabinDoor(it: Interactable): void {
    const p = it.ref as PropDef | undefined;
    const num = p?.id ?? '?';
    const mine = num === this.s.data.cabin.id;
    if (mine) { this.goInterior('cabin-interior'); return; }
    // Double de clé d'un ami pour cette porte : la serrure (vérifiée par le serveur) décide
    const key = (this.s.data.keys ?? []).find((k) => !k.master && k.cabin === num && k.owner !== this.s.data.playerId);
    if (key && this.presence) {
      this.openModal(new InfoDialog(this.s, `Cabine ${num}`, `Tu as un double de cette porte : « ${key.name} ».`, [
        { label: 'Fermer', style: 'ghost', onTap: () => {} },
        { label: 'Ouvrir avec la clé', style: 'gold', onTap: () => this.visitCabin(key.owner, `la cabine ${num}`) },
      ]));
      return;
    }
    this.openModal(new InfoDialog(this.s, `Cabine ${num}`, this.presence
      ? 'Cabine privée d’un autre passager. Pour rendre visite à un ami, sonne chez lui depuis ton téléphone (onglet Contacts) ou utilise un double de sa clé.'
      : 'Cabine privée d’un autre passager. Ta cabine est celle qui porte la plaque dorée.'));
  }

  /** Entrer / sortir d'un intérieur avec un fondu (porte). */
  private goInterior(id: string, at?: { x: number; y: number }): void {
    if (this.travelling) return;
    this.travelling = true; this.player.frozen = true; this.joystick.release();
    this.s.audio.tap();
    this.s.game.fadeThrough(() => {
      try { this.loadFloor(id, false, 'elevator', at); this.elevatorOpen = 0; }
      finally { this.travelling = false; } // jamais bloqué, même si l'intérieur ne charge pas
    }, 3.2);
  }

  private exitCabin(): void {
    if (this.visit) { this.presence?.join('cabins', 0, 0); this.leaveVisit(); return; }
    const door = getFloor('cabins')?.props?.find((p) => p.kind === 'cabinDoor' && p.id === this.s.data.cabin.id);
    this.goInterior('cabins', door ? { x: door.tx + 0.5, y: door.ty + 2.7 } : undefined);
  }

  /** Aquarium du hall : le poisson doré n'apparaît que de temps en temps (secret noté dans le journal). */
  private aquarium(): void {
    const golden = Math.sin(this.t * 0.21) > 0.93; // même horloge que l'animation (art/props5.ts)
    if (golden && !this.s.data.flags['found.golden-fish']) {
      this.s.setFlag('found.golden-fish', true); this.s.audio.discover(); this.s.incStat('secrets');
      this.toasts.show('Le poisson doré ! Peu de passagers l’ont vu… (noté dans ton journal de cabine)', 'reward', 4.5);
      this.burst(this.player.x, this.player.y - 50, PAL.goldLight, 18);
      return;
    }
    this.toasts.show(golden ? 'Le poisson doré est de retour !' : 'Des poissons tropicaux… On raconte qu’un poisson doré passe parfois.', 'info', 3);
  }

  /** Écran d'infos du hall : programme des étages, état du joueur, joueurs en ligne. */
  private infoScreen(): void {
    // Aucune heure d'horloge affichée dans le jeu : seulement l'ambiance du moment (soirée ou journée)
    const nd = this.s.needs.values, online = this.presence ? `\n\nPassagers en ligne autour de toi : ${this.presence.remotes.size}` : '';
    const night = !!this.s.data.flags['rooftop.night'];
    this.openModal(new InfoDialog(this.s, 'KingSea · Programme à bord',
      `Programme à bord :\n• Casino (1er) : jetons à la caisse, 13 jeux\n• Arcade (2e) : bowling, billard, flipper…\n• Cabines (3e) : ta chambre à décorer\n• Rooftop (4e) : piscine, snack, ${night ? 'soirée DJ en cours' : 'soirée DJ à la tombée de la nuit'}\n• Hall : bar, Boutique KS, roue du jour\n\n` +
      `Toi : faim ${Math.round(nd.hunger)} / 100 · soif ${Math.round(nd.thirst)} / 100 · ${this.s.chips.balance.toLocaleString('fr-FR')} jetons${online}`));
  }

  /** Programme de l'arcade, avec tes records et tes médailles. */
  private arcadeBoard(): void {
    const st = this.s.data.stats;
    const names: Record<string, string> = { bowling: 'Bowling', billiards: 'Billard (coups)', basket: 'Basket', football: 'Tirs au but', skeeball: 'Skee-Ball', mole: 'Tape-crabe', pinball: 'Flipper', racing: 'Circuit KS' };
    const medal = ['🥉', '🥈', '🥇'];
    const lines = Object.keys(ARCADE_INFO).map((g) => {
      const best = st[`best.${g}`];
      const m = best === undefined ? -1 : medalFor(g, best);
      const shown = best === undefined ? '' : g === 'racing' ? `${(best / 10).toFixed(1).replace('.', ',')} s` : String(best);
      return `• ${names[g] ?? g} : ${best === undefined ? 'pas encore joué' : `record ${shown}${m >= 0 ? ` ${medal[m]}` : ''}`}`;
    });
    this.openModal(new InfoDialog(this.s, 'Programme de l’arcade', `${activityList(ARCADE_GAMES)}\n\nTes records :\n${lines.join('\n')}`));
  }

  /** Tableau du casino : tes manches par jeu, tes jetons, tes pourboires. */
  private casinoBoard(): void {
    const st = this.s.data.stats;
    const rows = Object.entries(GAME_LABELS).map(([g, label]) => [label, st[`plays.${g}`] ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((a, [, n]) => a + n, 0);
    this.openModal(new InfoDialog(this.s, 'Tableau des joueurs',
      `Tes jetons : ${this.s.chips.balance.toLocaleString('fr-FR')} · tes KSCoins : ${this.s.wallet.balance.toLocaleString('fr-FR')}\n` +
      `Manches jouées au casino : ${total}${st['tips.total'] ? ` · pourboires offerts : ${st['tips.total']} jetons` : ''}\n\n` +
      (rows.length ? rows.slice(0, 8).map(([l, n]) => `• ${l.charAt(0).toUpperCase() + l.slice(1)} : ${n} manche${n > 1 ? 's' : ''}`).join('\n') : 'Aucune manche jouée pour l’instant. La caisse échange tes KSCoins contre des jetons.') +
      '\n\nJoue avec modération : jetons et KSCoins n’ont aucune valeur réelle.'));
  }

  /** Écran du couloir des cabines : ta cabine et sa décoration. */
  private cabinsBoard(): void {
    const d = this.s.data, room = d.room;
    const placed = room?.placed.length ?? 0, owned = room ? Object.values(room.owned).reduce((a, n) => a + n, 0) : 0;
    this.openModal(new InfoDialog(this.s, 'Plan des cabines',
      d.cabin.id ? `Ta cabine : n°${d.cabin.id}, porte à plaque dorée.\nDécoration : ${placed} meuble${placed > 1 ? 's' : ''} placé${placed > 1 ? 's' : ''} sur ${owned} possédé${owned > 1 ? 's' : ''}.\n\nDans ta cabine : le bureau de décoration pour acheter et placer des meubles, l’armoire pour changer de tenue, le lit pour une sieste.`
        : 'Ta cabine n’est pas encore attribuée : approche-toi d’une porte libre ou passe à la réception.',
      d.cabin.id ? [{ label: 'Fermer', style: 'secondary', onTap: () => {} }, { label: 'Aller à ma cabine', style: 'primary', onTap: () => this.goInterior('cabin-interior') }] : undefined));
  }

  /** Longue-vue du rooftop : l'horizon le jour ; la nuit, parfois une étoile filante (secret). */
  /** Carte du ciel du pont Panorama : constellations du bord ; relever l'étoile du Roi (secret, une seule fois). */
  private starMap(): void {
    const found = !!this.s.data.flags['found.star-chart'];
    const night = !!this.s.data.flags['rooftop.night'];
    this.openModal(new InfoDialog(this.s, 'Carte du ciel',
      'Constellations visibles depuis le pont :\n• La Grande Ourse, pour trouver le nord\n• Cassiopée, le « W » des navigateurs\n• Orion et sa ceinture de trois étoiles\n\n' +
      (found ? 'Tu as déjà relevé la position de l’étoile du Roi : elle est notée dans ton journal de cabine.' : `Au centre de la carte brille l’étoile du Roi, le repère des capitaines du KingSea.${night ? ' Cette nuit, elle est parfaitement visible.' : ''}`),
      found ? undefined : [
        { label: 'Fermer', style: 'ghost', onTap: () => {} },
        { label: 'Relever sa position', style: 'gold', onTap: () => {
          void this.s.ask('purser', 'purser', 'find', { id: 'star-chart' }).then((r) => {
            if (!r.ok) { this.toasts.show(r.error, 'error'); return; }
            this.s.data.flags['found.star-chart'] = true; this.s.incStat('secrets');
            const n = Number(r.view.granted) || 0;
            this.s.audio.discover(); this.burst(this.player.x, this.player.y - 30, PAL.goldLight, 24);
            this.toasts.show(n > 0 ? `Étoile du Roi relevée : +${n} KSCoins` : 'Étoile du Roi relevée', 'reward', 3.5);
          });
        } },
      ]));
  }

  /** Globe du pont Panorama : l'itinéraire de la croisière (escales) et la position du navire. */
  private globe(): void {
    this.s.audio.whoosh();
    const stops = ['Port de départ · Baie Royale', 'Îles de Corail', 'Cap des Alizés', 'Lagon d’Émeraude', 'Retour · Baie Royale'];
    const k = (this.s.progress.level + Object.keys(this.s.data.stats).length) % (stops.length - 1);
    this.openModal(new InfoDialog(this.s, 'Itinéraire de la croisière', `${stops.map((st, i) => `${i === k ? '▶ ' : '   '}${st}`).join('\n')}\n\nLe KingSea navigue entre ${stops[k].split(' · ')[0]} et ${stops[k + 1].split(' · ')[0]}.`));
  }

  private telescope(): void {
    this.s.audio.whoosh();
    const night = !!this.s.data.flags['rooftop.night'];
    if (night && Math.random() < 0.34) {
      if (!this.s.data.flags['found.shooting-star']) { this.s.setFlag('found.shooting-star', true); this.s.incStat('secrets'); this.s.audio.discover(); this.toasts.show('Une étoile filante ! Fais un vœu… (noté dans ton journal de cabine)', 'reward', 4.5); }
      else this.toasts.show('Encore une étoile filante !', 'success', 2.6);
      return;
    }
    this.toasts.show(night ? 'Le ciel est criblé d’étoiles… reviens jeter un œil, les étoiles filantes passent vite.' : 'À l’horizon : un voilier et quelques mouettes. La nuit, le ciel réserve des surprises.', 'info', 3.2);
  }

  /** Coin photo : pose, flash et souvenir compté dans le journal de cabine. */
  private photo(): void {
    this.playEmote('wave');
    this.s.audio.shutter();
    this.flashT = 0.35;
    this.s.incStat('photos');
    const n = this.s.data.stats['photos'] ?? 1;
    this.toasts.show(n === 1 ? 'Première photo souvenir à bord !' : `Photo souvenir n°${n}`, 'success', 2.4);
  }
  private flashT = 0;

  /** Garde-robe : changer de tenue (éditeur de personnage), puis retour dans la cabine. */
  private wardrobe(): void {
    this.s.game.goto(() => new ProfileScene(this.s, () => this, 'edit'));
  }

  /** Journal de bord de la cabine : souvenirs, records et statistiques. */
  private cabinLog(): void {
    const d = this.s.data, st = d.stats;
    const souvenirs = [d.flags['found.golden-compass'] ? '• Boussole dorée du mécanicien' : null, d.flags['found.golden-fish'] ? '• Poisson doré de l’aquarium aperçu' : null,
      d.flags['found.shooting-star'] ? '• Étoile filante vue à la longue-vue' : null,
      st['photos'] ? `• ${st['photos']} photo${st['photos'] > 1 ? 's' : ''} souvenir au coin photo` : null].filter(Boolean);
    const best = (k: string, unit: string) => (st[`best.${k}`] !== undefined ? `${st[`best.${k}`]} ${unit}` : '—');
    const casinoPlays = Object.entries(st).filter(([k]) => k.startsWith('plays.') && !/plays\.(bowling|billiards|basket|football|skeeball|mole|pinball|racing)$/.test(k)).reduce((a, [, v]) => a + v, 0);
    this.openModal(new InfoDialog(this.s, `Journal de bord · ${d.name}`,
      `Souvenirs :\n${souvenirs.length ? souvenirs.join('\n') : '• Aucun pour l’instant (le navire cache des secrets…)'}\n\n` +
      `Records : bowling ${best('bowling', 'pts')} · billard ${best('billiards', 'coups')} · basket ${best('basket', 'pts')} · tirs au but ${best('football', 'buts')} · Skee-Ball ${best('skeeball', 'pts')} · tape-crabe ${best('mole', 'pts')} · flipper ${best('pinball', 'pts')}${st['best.racing'] !== undefined ? ` · Circuit KS ${(st['best.racing'] / 10).toFixed(1).replace('.', ',')} s` : ''}\n` +
      `Parties de casino : ${casinoPlays} · passagers salués : ${st.greetings ?? 0}\n` +
      `Boissons commandées : ${st.drinksOrdered ?? 0} · snacks : ${st.snacksOrdered ?? 0}`));
  }

  private startSlide(): void {
    if (this.ride || this.player.seat) return;
    const T = TILE;
    this.ride = { t: 0, dur: 1.7, p: [{ x: 27.6 * T, y: 4.4 * T }, { x: 31 * T, y: 7.5 * T }, { x: 25 * T, y: 11 * T }, { x: 21 * T, y: 9.2 * T }] };
    this.player.frozen = true; this.emote = null; this.joystick.release();
    this.s.audio.roll();
  }

  private buying = false;
  private buyCool = 0;
  /** Commande au bar / snack : consommée aussitôt (`now`) ou rangée dans l'inventaire. */
  private async buyItem(d: Drink, now: boolean, npcKind: string): Promise<void> {
    // Un double toucher ne commande jamais deux fois (demande en cours ou commande à l'instant)
    if (this.buying || performance.now() < this.buyCool) return;
    const menu = SNACK_ITEMS.includes(d) ? 'snack' : ROOFTOP_BAR_DRINKS.includes(d) ? 'rooftop' : VIP_DRINKS.includes(d) ? 'vip' : 'hub';
    this.buying = true;
    const r = await this.s.ask('purser', 'purser', 'buy', { menu, id: d.id, consume: now });
    this.buying = false; this.buyCool = performance.now() + 450;
    if (!r.ok) { this.s.audio.error(); this.toasts.show(r.error, 'error'); return; }
    const npc = this.npcs.find((n) => n.prop.kind === npcKind);
    if (npc) { npc.busy = 1.1; npc.dir = 'down'; }
    this.spawnText(this.player.x, this.player.y - 56, `−${d.price}`, PAL.cyan);
    if (!now) { this.s.audio.chip(); this.toasts.show(`${d.name} rangé dans ton sac (−${d.price} KSCoins)`, 'success', 2.4); return; }
    this.modal?.close();
    this.showConsumed(d.kind, d.color, d.name, r.view.consumed as { hunger: number; thirst: number } | null);
  }

  /** Retour visuel d'une consommation : verre ou assiette en main, gain des jauges. */
  private showConsumed(kind: 'drink' | 'food', color: string, name: string, eff: { hunger: number; thirst: number } | null): void {
    this.s.audio.pour();
    this.player.held = { kind, color, t: 9 };
    const parts = eff ? [eff.thirst ? `soif +${eff.thirst}` : '', eff.hunger ? `faim +${eff.hunger}` : ''].filter(Boolean).join(' · ') : '';
    this.toasts.show(`${name} ${kind === 'drink' ? 'bu' : 'mangé'} !${parts ? ` ${parts}` : ''}`, 'success', 2.6);
    if (eff?.thirst) this.spawnText(this.player.x - 14, this.player.y - 70, `+${eff.thirst} 💧`, '#9fe7ff');
    if (eff?.hunger) this.spawnText(this.player.x + 14, this.player.y - 70, `+${eff.hunger} 🍴`, '#ffd166');
  }

  private reception(): void {
    const gift = 'gift:welcome';
    const already = this.s.wallet.hasProcessed(gift) || !!this.s.data.flags['gift.received'];
    const text = already
      ? 'Bon retour à bord ! Casino au 1er, arcade au 2e, ta cabine au 3e et la piscine sur le rooftop. Et la salle des machines (sous-sol) cache peut-être quelque chose…'
      : `Bienvenue sur KingSea ! Voici ton KS Pass Croisière (accès à tous les ponts) et ${RECEPTION_GIFT} KSCoins de bienvenue pour commencer la croisière.\n\nLe pass est rangé dans ton inventaire. Prends l’ascenseur pour explorer le navire ; le bar est juste à gauche.`;
    this.openModal(new InfoDialog(this.s, 'Réception', text, [{
      label: already ? 'Merci !' : `Recevoir le KS Pass et ${RECEPTION_GIFT} KSCoins`, style: already ? 'primary' : 'gold',
      onTap: () => {
        if (already) return;
        // Identifiant fixe côté autorité : impossible de le recevoir deux fois
        void this.s.ask('purser', 'purser', 'gift', {}).then((r) => {
          this.s.data.flags['gift.received'] = true; this.s.save.markDirty();
          if (r.ok && (r.view.granted as number) > 0) { this.s.audio.coin(); this.burst(this.player.x, this.player.y - 30, PAL.gold); this.toasts.show(`KS Pass Croisière + ${RECEPTION_GIFT} KSCoins de bienvenue`, 'reward', 4); }
          else if (!r.ok) this.toasts.show(r.error, 'error');
        });
      },
    }]));
  }

  private togglePanel(): void {
    const on = !this.s.flag('engine.lights');
    this.s.setFlag('engine.lights', on);
    this.s.audio.switchOn();
    this.s.audio.setEngineBoost(on);
    this.refreshInteractables();
    this.toasts.show(on ? 'Éclairage de maintenance : ACTIVÉ' : 'Éclairage de maintenance : coupé', on ? 'success' : 'info');
  }

  private pickCompass(it: Interactable): void {
    const id = 'golden-compass';
    if (this.s.flag(`found.${id}`) || this.finding) return;
    this.finding = true;
    void this.s.ask('purser', 'purser', 'find', { id }).then((r) => {
      this.finding = false;
      if (!r.ok) { this.toasts.show(r.error, 'error'); return; }
      this.s.data.flags[`found.${id}`] = true; this.s.save.markDirty();
      this.refreshInteractables();
      this.foundDialog(it, (r.view.granted as number) > 0);
    });
  }
  private finding = false;

  private foundDialog(it: Interactable, paid: boolean): void {
    const r = { ok: paid };
    this.s.audio.discover();
    this.burst(it.x, it.y - 12, PAL.goldLight, 26);
    this.openModal(new InfoDialog(this.s, 'Objet rare trouvé !',
      `La boussole dorée du mécanicien ! ${r.ok ? `Tu gagnes ${COMPASS_REWARD} KSCoins.` : ''}\n\nD’autres secrets seront cachés à bord au fil des mises à jour.`,
      [{ label: 'Super !', style: 'gold', onTap: () => {} }]));
  }

  private playEmote(id: EmoteId): void {
    if (this.swimming || this.ride) return;
    const def = EMOTE_BY_ID.get(id);
    if (!def || !emoteUnlocked(id, this.s.progress.unlocks)) { this.toasts.show('Émote pas encore débloquée', 'error', 2); return; }
    // L'émote ne bloque pas le déplacement : bouger l'interrompt (sauf la danse sur la piste)
    this.emote = { id, t: id === 'dance' && this.onDanceFloor ? Infinity : def.duration };
    this.s.incStat(`emote.${id}`);
    if (id === 'clap') this.s.audio.tap();
    this.presence?.emote(id);
    if ((id === 'wave' || id === 'heart') && this.crowd) {
      const n = this.crowd.greet(this.player.x, this.player.y);
      if (n > 0) { this.s.incStat('greetings', n); this.s.audio.discover(); }
    }
  }

  /** Nature du sol sous un point (bruits de pas). */
  private surfaceAt(x: number, y: number): 'wood' | 'stone' | 'carpet' | 'metal' {
    const c = this.map.charAt(Math.floor(x / TILE), Math.floor((y - 3) / TILE));
    if (c === 'g' || c === 'm' || c === 'y') return 'metal';
    if (c === 'r' || c === 'c' || c === 'b') return 'carpet';
    if (c === 'd' || c === 'f') return 'wood';
    return 'stone';
  }

  // ---------------------------------------------------------------- pointeurs
  pointerHandlers(): PointerHandler[] {
    // Coma : tout toucher est absorbé (aucune action de jeu possible pendant le compte à rebours)
    if (this.comaCause) return [{ onDown: () => true }];
    if (this.modal) return [this.modal.layer];
    const worldHint: PointerHandler = { onDown: (p) => this.tapHint(p) };
    const worldPick: PointerHandler = { onDown: (p) => this.tapPick(p) };
    return [worldHint, this.joystick, worldPick, this.hud.layer];
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const v = this.s.game.viewport, z = this.cam.zoom;
    return { x: (sx - v.width / 2) / z + this.cam.x, y: (sy - v.height / 2) / z + this.cam.y };
  }

  private tapPick(p: PointerInfo): boolean {
    if (this.s.game.transitioning) return false;
    const w = this.screenToWorld(p.x, p.y);
    const it = this.interactions.pickAt(w.x, w.y, this.player.x, this.player.y);
    if (!it) return false;
    this.s.audio.tap();
    this.runInteraction(it);
    return true;
  }

  private tapHint(p: PointerInfo): boolean {
    const w = this.screenToWorld(p.x, p.y);
    const it = this.interactions.hitTest(w.x, w.y);
    if (it) this.toasts.show(`Approche-toi : ${it.label}`, 'info', 1.6);
    return !!it;
  }

  // ---------------------------------------------------------------- mise à jour
  update(dt: number): void {
    this.t += dt;
    const g = this.s.game;
    this.toasts.update(dt);
    // Gains : pièces et jetons partent du personnage (position à l'écran) vers leurs compteurs
    {
      const v = g.viewport, z = this.cam.zoom;
      const home = { x: v.width / 2 + (this.player.x - this.cam.x) * z, y: v.height / 2 + (this.player.y - 30 - this.cam.y) * z };
      this.hud.balance.home = home; this.hud.chips.home = home;
      this.hud.balance.lowFx = this.hud.chips.lowFx = this.s.lowFx;
      this.fx.lowFx = this.s.lowFx;
    }
    this.hud.update(dt, this.s.wallet.balance, this.s.progress.xp, this.s.game.viewport.width, this.s.game.viewport.height, this.s.chips.balance);
    this.hud.phoneUnread = this.phone?.unread ?? 0;
    this.hud.passReady = passClaimable(this.s);
    this.hud.missionsReady = (this.s.data.missions ? [...this.s.data.missions.daily, ...this.s.data.missions.weekly] : []).filter((m) => missionStatus(m) === 'terminée').length;
    if (this.presence) {
      this.presence.update(dt, { x: this.player.x, y: this.player.y, dir: this.player.dir, anim: this.netAnim() });
      const cn = this.s.net;
      this.hud.net = { state: this.presence.online ? 'online' : 'reconnecting', others: this.presence.count, unread: this.unread,
        attempts: cn?.attempts ?? 0, nextIn: cn && cn.nextRetryAt ? Math.max(0, Math.ceil((cn.nextRetryAt - Date.now()) / 1000)) : 0 };
      this.chatShowT = Math.max(0, this.chatShowT - dt);
    }
    this.joystick.update(dt);
    // Jauges : baissent seulement pendant l'exploration (pas dans un menu, une transition ou un coma)
    this.s.needs.update(dt, !this.modal && !g.transitioning && !this.travelling && !this.comaCause);
    this.hud.needs = this.s.needs.values;
    if (this.comaCause) { this.comaT += dt; this.player.frozen = true; this.joystick.release(); }
    if (this.pendingFriends && this.presence?.online && !this.modal && !this.s.game.transitioning) { this.pendingFriends = false; this.openFriends(); }
    if (this.modal) this.modal.update(dt);

    // Entrées : joystick tactile prioritaire, clavier en option (tests sur ordinateur).
    let ix = this.joystick.value.x, iy = this.joystick.value.y;
    const c = g.controls;
    if (!this.joystick.active && !this.modal && !this.chatInput.typing && !this.comaCause) {
      // Clavier et manette : déplacement, interaction et raccourcis (réglables dans Paramètres › Commandes)
      const a = c.axis();
      if (a.x || a.y) { ix = a.x; iy = a.y; }
      if (c.pressed('interact')) this.interactFocused();
      else if (c.pressed('chat') && this.presence) this.openChat();
      else if (c.pressed('emote')) this.openModal(new EmoteMenu(this.s, (e) => this.playEmote(e)));
      else if (c.pressed('missions')) this.openMissions();
      else if (c.pressed('friends')) this.openFriends();
      else if (c.pressed('floors')) this.openElevator();
      else if (c.pressed('inventory')) this.openInventory();
      else if (c.pressed('help')) this.openModal(new ControlsMenu(this.s));
      else if (c.startPressed) this.openSettings();
    } else if (this.modal && c.startPressed) this.modal.close();
    const blocked = !!this.modal || g.transitioning || !!this.ride || !!this.comaCause;
    this.player.frozen = blocked || this.travelling;
    if (blocked) { ix = 0; iy = 0; }
    if (this.emote?.id === 'dance' && Math.hypot(ix, iy) < 0.05) { /* danse sur place */ } else if (Math.hypot(ix, iy) > 0.05 && this.emote) this.emote = null;
    this.player.update(dt, ix, iy, this.map);
    if (this.emote) { this.emote.t -= dt; if (this.emote.t <= 0) this.emote = null; }
    this.updateRide(dt);
    this.updateSurface();

    const focused = blocked || this.player.seat ? null : this.interactions.update(this.player.x, this.player.y);
    if (!focused) this.interactions.focused = null;
    this.hud.setFocus(focused?.label ?? null);

    // Portes de l'ascenseur : s'ouvrent quand on s'en approche.
    const elev = this.interactions.items.find((i) => i.handler === 'elevator');
    const near = elev ? Math.hypot(elev.x - this.player.x, elev.y - this.player.y) < TILE * 2.4 : false;
    const target = near || this.travelling ? 1 : 0;
    this.elevatorOpen += (target - this.elevatorOpen) * Math.min(1, dt * 5);

    // PNJ : regardent le joueur s'il est proche, sinon jettent un œil autour.
    for (const n of this.npcs) {
      n.busy = Math.max(0, n.busy - dt);
      const d = Math.hypot(n.x - this.player.x, n.y - this.player.y);
      if (n.busy > 0) continue;
      if (d < TILE * 4) {
        const dx = this.player.x - n.x, dy = this.player.y - n.y;
        n.dir = Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 'left' : 'right') : 'down';
      } else if ((n.lookT -= dt) <= 0) {
        n.lookT = 2 + Math.random() * 3;
        n.dir = (['down', 'left', 'right', 'down'] as Dir[])[Math.floor(Math.random() * 4)];
      }
    }

    this.crowd?.update(dt, this.player);

    // Effets d'ambiance (désactivés avec « Effets réduits »)
    if (!this.s.lowFx) {
      const vw = g.viewport.width / this.cam.zoom, vh = g.viewport.height / this.cam.zoom;
      this.fxCtx = {
        floorId: this.floor.id, props: this.floor.props ?? [], windows: this.layer.windows,
        view: { x: this.cam.x - vw / 2, y: this.cam.y - vh / 2, w: vw, h: vh }, beat: this.beat, t: this.t, poolTiles: this.poolTiles, bounds: { w: this.map.pixelWidth, h: this.map.pixelHeight },
        danceRect: this.floor.id === 'rooftop' ? { x: DANCE_FLOOR.x * TILE, y: DANCE_FLOOR.y * TILE, w: DANCE_FLOOR.w * TILE, h: DANCE_FLOOR.h * TILE } : null,
      };
      this.fx.update(dt, this.fxCtx);
    } else this.fxCtx = null;

    // Bruits de pas selon le sol
    if (this.player.stepCount !== this.lastStep) { this.lastStep = this.player.stepCount; this.s.audio.footstep(this.surfaceAt(this.player.x, this.player.y), this.swimming); }

    // Musique de la boîte de nuit : plus forte en s'approchant de la piste
    if (this.floor.id === 'rooftop') {
      const cx = (DANCE_FLOOR.x + DANCE_FLOOR.w / 2) * TILE, cy = (DANCE_FLOOR.y + DANCE_FLOOR.h / 2) * TILE;
      const d = Math.hypot(this.player.x - cx, this.player.y - cy) / TILE;
      this.s.audio.setClubLevel(clamp(1.25 - d / 9, 0, 1));
    }

    // Particules
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'spark') p.vy += 160 * dt;
      else if (p.kind === 'confetti') { p.vy = Math.min(p.vy + 260 * dt, 42); p.vx *= 1 - dt * 1.8; p.x += Math.sin(p.life * 7 + p.size) * 12 * dt; }
    }
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    // Effets programmés (feu d'artifice en plusieurs gerbes)
    if (this.timed.length) { const due = this.timed.filter((e) => e.at <= this.t); this.timed = this.timed.filter((e) => e.at > this.t); for (const e of due) e.fn(); }
    // Parfum : sillage scintillant
    if (this.auraUntil > this.t && Math.random() < dt * (this.s.lowFx ? 4 : 12)) {
      this.particles.push({ x: this.player.x + (Math.random() - 0.5) * 22, y: this.player.y - 6 - Math.random() * 40, vx: (Math.random() - 0.5) * 8, vy: -14, life: 1.1, max: 1.1, color: Math.random() < 0.5 ? '#efdcae' : '#ffd6f0', size: 2.2, kind: 'glint' });
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.player.held && !this.s.lowFx && Math.random() < dt * 4) {
      this.particles.push({ x: this.player.x + 10, y: this.player.y - 30, vx: (Math.random() - 0.5) * 6, vy: -18, life: 1, max: 1, color: 'rgba(255,255,255,0.7)', size: 1.4, kind: 'bubble' });
    }

    // Caméra : suit le joueur en douceur, bornée aux limites de l'étage.
    const v = g.viewport, z = this.cam.zoom;
    const halfW = v.width / 2 / z, halfH = v.height / 2 / z;
    const tx = this.player.x, ty = this.player.y - TILE * 0.6;
    const k = Math.min(1, dt * 8);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    const mw = this.map.pixelWidth, mh = this.map.pixelHeight;
    this.cam.x = mw <= halfW * 2 ? mw / 2 : clamp(this.cam.x, halfW, mw - halfW);
    this.cam.y = mh <= halfH * 2 ? mh / 2 : clamp(this.cam.y, halfH - TILE * 0.5, mh - halfH);
  }

  /** Glissade : position imposée le long de la courbe, arrivée dans l'eau. */
  private updateRide(dt: number): void {
    const r = this.ride;
    if (!r) return;
    r.t += dt;
    const u = Math.min(1, r.t / r.dur), k = u * u * (3 - 2 * u);
    const [a, b, c, d] = r.p, m = 1 - k;
    const nx = m * m * m * a.x + 3 * m * m * k * b.x + 3 * m * k * k * c.x + k * k * k * d.x;
    const ny = m * m * m * a.y + 3 * m * m * k * b.y + 3 * m * k * k * c.y + k * k * k * d.y;
    this.player.dir = nx < this.player.x - 0.5 ? 'left' : nx > this.player.x + 0.5 ? 'right' : 'down';
    this.player.x = nx; this.player.y = ny;
    if (!this.s.lowFx && Math.random() < dt * 30) this.particles.push({ x: nx, y: ny - 6, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.5, max: 0.5, color: 'rgba(200,245,255,0.8)', size: 1.6, kind: 'bubble' });
    if (u >= 1) { this.ride = null; this.player.frozen = false; this.s.incStat('slides'); }
  }

  /** Nage dans la piscine et piste de danse : selon la tuile sous les pieds. */
  private updateSurface(): void {
    const c = this.map.charAt(Math.floor(this.player.x / TILE), Math.floor((this.player.y - 3) / TILE));
    const swim = isWaterChar(c) && !this.ride;
    if (swim !== this.swimming) {
      this.swimming = swim;
      this.player.speedFactor = swim ? 0.6 : 1;
      if (swim) {
        this.s.audio.splash(); this.splash(this.player.x, this.player.y - 6); this.emote = null;
        if (this.t - this.lastSwimStat > 20) { this.lastSwimStat = this.t; this.s.incStat('swims'); } // missions
      }
    }
    const dance = c === 'f';
    if (dance && !this.onDanceFloor && !this.danceHinted) { this.danceHinted = true; this.toasts.show('Piste de danse ! Touche 👋 puis « Danser »', 'info', 3.5); }
    this.onDanceFloor = dance;
  }

  private splash(x: number, y: number): void {
    const n = this.s.lowFx ? 6 : 18;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + Math.random() * 0.8), sp = 40 + Math.random() * 70;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, max: 0.7, color: 'rgba(210,248,255,0.95)', size: 1.8 + Math.random() * 1.5, kind: 'spark' });
    }
  }

  // ---------------------------------------------------------------- effets
  private burst(x: number, y: number, color: string, n = 16): void {
    const count = this.s.lowFx ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.9, max: 0.9, color, size: 1.5 + Math.random() * 2, kind: 'spark' });
    }
  }
  private spawnText(x: number, y: number, text: string, color: string): void {
    this.particles.push({ x, y, vx: 0, vy: -26, life: 1.3, max: 1.3, color, size: 1, kind: 'text', text });
  }

  // ---------------------------------------------------------------- rendu
  render(ctx: CanvasRenderingContext2D): void {
    const v = this.s.game.viewport, z = this.cam.zoom, lowFx = this.s.lowFx;
    ctx.fillStyle = PAL.abyss; ctx.fillRect(0, 0, v.width, v.height);

    ctx.save();
    // Alignement sur la grille des pixels physiques : évite le scintillement des bords.
    const ox = Math.round((v.width / 2 - this.cam.x * z) * v.dpr) / v.dpr;
    const oy = Math.round((v.height / 2 - this.cam.y * z) * v.dpr) / v.dpr;
    ctx.translate(ox, oy); ctx.scale(z, z);

    const mw = this.map.pixelWidth, mh = this.map.pixelHeight;
    ctx.drawImage(this.layer.canvas, 0, 0, mw, mh);
    this.renderWindows(ctx, lowFx);
    this.renderFloorFx(ctx, lowFx);
    if (this.fxCtx) this.fx.renderUnder(ctx, this.fxCtx);

    const flags = this.s.data.flags;
    const anim: PropAnimState = { t: this.t, elevatorOpen: this.elevatorOpen, panelOn: !!flags['engine.lights'], floorShort: this.floor.short, lowFx, myCabin: this.s.data.cabin.id, beat: this.beat };
    const props = (this.floor.props ?? []).filter((p) => propActive(p, flags));

    // 1) Accessoires muraux
    for (const p of props) if (WALL_PROPS.has(p.kind)) this.drawProp(ctx, p, anim);

    // 2) Repère au sol de l'objet ciblé
    const f = this.interactions.focused;
    if (f && !this.modal) {
      ctx.save(); ctx.strokeStyle = `rgba(229,181,74,${0.55 + Math.sin(this.t * 5) * 0.25})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 14, 6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }

    // 3) Entités triées par profondeur (ligne de base = bas de l'emprise / pieds)
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    for (const p of props) if (!WALL_PROPS.has(p.kind) && !CHARACTER_PROPS.has(p.kind)) list.push({ y: (p.ty + p.h) * TILE - (p.kind === 'logbook' ? -1 : 0), draw: () => this.drawProp(ctx, p, anim) });
    for (const n of this.npcs) list.push({ y: n.y, draw: () => this.drawNpc(ctx, n) });
    for (const p of this.crowd?.list ?? []) if (Math.abs(p.x - this.cam.x) < v.width / z && Math.abs(p.y - this.cam.y) < v.height / z) list.push({ y: p.y, draw: () => this.drawPassenger(ctx, p) });
    for (const r of this.presence?.remotes.values() ?? []) list.push({ y: r.y, draw: () => this.drawRemote(ctx, r) });
    list.push({ y: this.player.y, draw: () => this.drawPlayer(ctx) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // 4) Particules
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'text') { ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.font = font(11, 800); ctx.textAlign = 'center'; ctx.fillText(p.text ?? '', p.x, p.y); ctx.globalAlpha = 1; continue; }
      ctx.fillStyle = p.color; ctx.globalAlpha = a;
      if (p.kind === 'bubble') { ctx.strokeStyle = p.color; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke(); }
      else if (p.kind === 'confetti') { const k = Math.abs(Math.sin(p.life * 9 + p.size)); ctx.fillRect(p.x - p.size / 2, p.y - (p.size * k) / 2, p.size, Math.max(0.6, p.size * k * 0.6)); }
      else if (p.kind === 'glint') { const r = p.size * (0.5 + a * 0.5); ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 1.6); ctx.lineTo(p.x + r * 0.4, p.y); ctx.lineTo(p.x, p.y + r * 1.6); ctx.lineTo(p.x - r * 0.4, p.y); ctx.closePath(); ctx.fill(); ctx.fillRect(p.x - r * 1.2, p.y - 0.4, r * 2.4, 0.8); }
      else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }

    if (this.fxCtx) this.fx.renderOver(ctx, this.fxCtx);

    // Pseudos et bulles des autres joueurs (au-dessus de tout le décor)
    for (const r of this.presence?.remotes.values() ?? []) this.drawRemoteLabels(ctx, r);

    // 5) Étiquettes des objets interactifs proches (identifiables sans viser)
    this.renderInteractMarkers(ctx);
    ctx.restore();

    // Pont supérieur : lumière selon l'heure locale (journée, coucher du soleil, nuit étoilée)
    if (this.floor.id === 'rooftop') {
      const tint = skyTint(new Date().getHours());
      if (tint.alpha > 0) { ctx.fillStyle = `rgba(${tint.color},${tint.alpha})`; ctx.fillRect(0, 0, v.width, v.height); }
    }

    // 6) Éclairage dynamique (étages sombres)
    if (this.floor.lighting) this.renderLighting(ctx, lowFx);

    // 7) Interface
    this.joystick.render(ctx);
    this.hud.render(ctx, v, this.floor.short, this.floor.name, this.t);
    this.renderChatLog(ctx, v);
    this.toasts.render(ctx, v);
    if (this.s.data.settings.showFps) {
      ctx.fillStyle = PAL.success; ctx.font = font(12, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${this.s.game.fps} FPS · zoom ${z.toFixed(2)} · dpr ${v.dpr}`, v.safe.left + 12, v.safe.top + 62 * v.ui);
    }
    this.modal?.render(ctx, v);
    if (this.flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${(this.flashT / 0.35) * 0.85})`; ctx.fillRect(0, 0, v.width, v.height); }
    if (this.comaCause) this.renderComa(ctx, v);
  }

  // ---------------------------------------------------------------- coma (faim ou soif à zéro)
  private comaCause: string | null = null;
  private comaT = 0;

  /** Évanouissement : menus fermés, commandes bloquées, compte à rebours de 15 s (Services.needs). */
  private enterComa(cause: string): void {
    if (this.comaCause) return; // un seul coma à la fois
    this.comaCause = cause; this.comaT = 0;
    this.modal?.close(); this.modal = null;
    this.chatInput.hide();
    this.joystick.release();
    this.player.seat = null; this.player.held = null; this.emote = null; this.ride = null;
    this.s.audio.lose(); this.s.haptic([200, 100, 200]);
    this.s.game.refreshHandlers();
  }

  /** Réveil confirmé par l'autorité : retour au hall (près de la réception), commandes rendues. */
  private wakeUp(): void {
    const finish = () => {
      this.comaCause = null;
      this.player.frozen = false;
      this.s.game.refreshHandlers();
      this.toasts.show('Tu te réveilles au hall, près de la réception. Mange et bois pour garder des forces !', 'success', 5);
      this.s.audio.ding();
    };
    const spot = { x: 26.5, y: 8.4 };
    if (this.floor.id === 'hub') {
      // Déjà au hall : pas de voyage, juste un fondu et la position de la réception
      this.s.game.fadeThrough(() => { const f = this.map.findFreeSpot(spot.x * TILE, spot.y * TILE, FOOT_W, FOOT_H) ?? { x: spot.x * TILE, y: spot.y * TILE }; this.player.x = f.x; this.player.y = f.y; this.cam.x = this.player.x; this.cam.y = this.player.y - TILE; finish(); }, 3);
    } else {
      this.travelling = true;
      this.s.game.fadeThrough(() => { this.loadFloor(HUB_ID, false, 'elevator', spot); this.travelling = false; finish(); }, 3);
    }
  }

  private renderComa(ctx: CanvasRenderingContext2D, v: { width: number; height: number; ui: number }): void {
    const ui = v.ui, k = Math.min(1, this.comaT / 1.2);
    const beat = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(this.t * 5.5)), 8);
    ctx.save();
    const g = ctx.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * (0.15 + beat * 0.05), v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.7);
    g.addColorStop(0, `rgba(30,0,6,${0.55 * k})`); g.addColorStop(1, `rgba(0,0,0,${0.95 * k})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, v.width, v.height);
    ctx.globalAlpha = k;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6f0e3'; ctx.font = font(26 * ui, 900);
    ctx.fillText('Tu t’es évanoui…', v.width / 2, v.height * 0.36);
    ctx.font = font(15 * ui, 600); ctx.fillStyle = '#cbbfa8';
    ctx.fillText(`Cause : ${this.comaCause}. L’équipage te ramène au hall.`, v.width / 2, v.height * 0.36 + 34 * ui, v.width - 40 * ui);
    const left = this.s.needs.comaLeft;
    ctx.font = font(64 * ui * (1 + beat * 0.06), 900); ctx.fillStyle = PAL.gold;
    ctx.fillText(left > 0 ? String(left) : '…', v.width / 2, v.height * 0.58);
    ctx.font = font(13 * ui, 600); ctx.fillStyle = '#cbbfa8';
    ctx.fillText('Tes KSCoins, jetons, objets et ta progression sont conservés.', v.width / 2, v.height * 0.58 + 52 * ui, v.width - 40 * ui);
    ctx.restore();
  }

  private drawProp(ctx: CanvasRenderingContext2D, p: PropDef, anim: PropAnimState): void {
    const vis = getPropVisual(p);
    const x = p.tx * TILE, y = p.ty * TILE;
    if (vis) ctx.drawImage(vis.img, x + vis.ox, y + vis.oy, vis.w, vis.h);
    if (hasOverlay(p.kind)) { ctx.save(); ctx.translate(x, y); drawPropOverlay(ctx, p, anim); ctx.restore(); }
  }

  private drawNpc(ctx: CanvasRenderingContext2D, n: Npc): void {
    const jitter = n.busy > 0 ? Math.sin(this.t * 40) * 1.2 : 0; // le barman secoue le shaker
    if (n.prop.kind === 'dj') drawLook(ctx, n.look, 'dance', 'down', Math.floor(this.t * 4) % 2 ? 1 : 3, n.x, n.y);
    else drawLook(ctx, n.look, n.busy > 0 ? 'interact' : 'idle', n.dir, n.busy > 0 ? Math.floor(this.t * 8) : Math.floor(this.t * ANIMS.idle.fps + n.x), n.x + jitter, n.y);
    if (n.busy > 0) { ctx.fillStyle = '#c9ccd3'; ctx.fillRect(n.x + 8 + jitter * 2, n.y - 30, 4, 8); }
  }

  private drawPassenger(ctx: CanvasRenderingContext2D, p: Passenger): void {
    const anim: Anim = p.state === 'walk' ? 'walk' : p.state === 'dance' ? 'dance' : p.state === 'wave' ? 'wave' : 'idle';
    const fps = ANIMS[anim].fps * (anim === 'walk' ? 0.8 : 1);
    // Danseurs calés sur le tempo de la musique (120 BPM) ; légère variation d'un passager à l'autre
    const frame = anim === 'dance' ? Math.floor(this.t * 4 + (p.look.skin.length + p.x) % 3) : Math.floor(p.animT * fps);
    drawLook(ctx, p.look, anim, p.dir, frame, p.x, p.y);
  }

  /** État public envoyé aux autres joueurs. */
  private netAnim(): NetAnim {
    const pl = this.player;
    if (this.ride) return 'ride';
    if (this.swimming) return 'swim';
    if (pl.seat) return pl.seat.kind === 'lie' ? 'lie' : 'sit';
    return this.playerAnim().anim as NetAnim;
  }

  private drawRemote(ctx: CanvasRenderingContext2D, r: Remote): void {
    const t = r.animT;
    switch (r.anim) {
      case 'swim': {
        const wl = r.y - 14 + Math.sin(this.t * 3 + r.x) * 1.2;
        ctx.save(); ctx.beginPath(); ctx.rect(r.x - 24, r.y - 80, 48, wl - (r.y - 80)); ctx.clip();
        drawLook(ctx, r.look, 'walk', r.dir, Math.floor(t * 8), r.x, r.y + 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(r.x, wl, 12, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
        return;
      }
      case 'lie':
        drawLook(ctx, r.look, 'idle', 'down', 0, r.x, r.y - 6);
        ctx.fillStyle = '#7bd3f7'; ctx.fillRect(r.x - 9, r.y - 18, 18, 10);
        return;
      case 'sit': drawLook(ctx, r.look, 'sit', 'down', Math.floor(t * ANIMS.sit.fps), r.x, r.y + 2); return;
      case 'walk': case 'ride': drawLook(ctx, r.look, 'walk', r.dir, Math.floor(t * 10), r.x, r.y); return;
      case 'dance': drawLook(ctx, r.look, 'dance', 'down', Math.floor(this.t * 4), r.x, r.y); return;
      case 'interact': drawLook(ctx, r.look, 'interact', r.dir, Math.floor(t * ANIMS.interact.fps), r.x, r.y); return;
      default:
        // Émotes : même animation que chez l'émetteur (synchronisée par les instantanés de pose)
        if (EMOTE_ANIMS.has(r.anim as Anim)) { drawLook(ctx, r.look, r.anim as Anim, 'down', Math.floor(t * ANIMS[r.anim as Anim].fps), r.x, r.y); return; }
        drawLook(ctx, r.look, 'idle', r.dir, Math.floor(t * ANIMS.idle.fps), r.x, r.y);
    }
  }

  /** Pseudo, bulle d'emote et bulle de chat d'un autre joueur. */
  private drawRemoteLabels(ctx: CanvasRenderingContext2D, r: Remote): void {
    const top = r.y - (r.anim === 'lie' ? 40 : r.anim === 'swim' ? 34 : 52);
    ctx.save();
    ctx.font = font(8.5, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(r.name).width + 10;
    roundRect(ctx, r.x - w / 2, top - 6, w, 12, 6); ctx.fillStyle = 'rgba(14,11,16,0.75)'; ctx.fill();
    ctx.fillStyle = this.presence?.blocked.has(r.id) ? PAL.textDim : PAL.goldLight; ctx.fillText(r.name, r.x, top + 0.5);
    if (r.emote) {
      const e = EMOTE_BY_ID.get(r.emote!.e);
      if (e) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(r.x + 14, top - 14, 9, 0, Math.PI * 2); ctx.fill(); drawEmoteIcon(ctx, e.id, r.x + 14, top - 14, 14); }
    }
    if (r.bubble) {
      ctx.font = font(8.5, 600);
      const lines = wrapText(ctx, r.bubble.text, 110).slice(0, 3);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12, bh = lines.length * 11 + 8;
      const bx = r.x - bw / 2, by = top - 10 - bh;
      ctx.globalAlpha = Math.min(1, r.bubble.t * 2);
      roundRect(ctx, bx, by, bw, bh, 6); ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(r.x - 4, by + bh); ctx.lineTo(r.x + 4, by + bh); ctx.lineTo(r.x, by + bh + 5); ctx.fill();
      ctx.fillStyle = PAL.deepNavy; ctx.textAlign = 'left';
      lines.forEach((l, i) => ctx.fillText(l, bx + 6, by + 9.5 + i * 11));
    }
    ctx.restore();
  }

  /** Fil du chat de l'étage (coin gauche, s'efface après quelques secondes). */
  private renderChatLog(ctx: CanvasRenderingContext2D, v: { width: number; height: number; ui: number; safe: { left: number; top: number } }): void {
    const P = this.presence;
    if (!P || (!this.chatInput.open && this.chatShowT <= 0)) return;
    // Fil du canal choisi dans la barre de saisie (proximité ou global)
    const scope = this.chatInput.scope;
    const lines: ChatLine[] = P.chat.filter((l) => l.scope === scope).slice(-6);
    if (!lines.length && !this.chatInput.open) return;
    const ui = v.ui;
    const x = v.safe.left + 12 * ui, w = Math.min(330 * ui, v.width * 0.42), lh = 17 * ui;
    const top = v.safe.top + 92 * ui;
    ctx.save();
    ctx.globalAlpha = this.chatInput.open ? 1 : Math.min(1, this.chatShowT / 2);
    const head = 18 * ui, rows = Math.max(1, lines.length);
    roundRect(ctx, x, top, w, rows * lh + 10 * ui + head, 10 * ui); ctx.fillStyle = 'rgba(10,8,12,0.78)'; ctx.fill();
    ctx.font = font(10.5 * ui, 800); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = PAL.gold;
    ctx.fillText(scope === 'near' ? 'CHAT · À PROXIMITÉ' : 'CHAT · TOUT LE NAVIRE', x + 8 * ui, top + 4 * ui + head / 2);
    ctx.font = font(12 * ui, 600);
    if (!lines.length) { ctx.fillStyle = PAL.textDim; ctx.fillText(scope === 'near' ? 'Personne n’a parlé près de toi.' : 'Aucun message pour l’instant.', x + 8 * ui, top + head + 5 * ui + lh / 2, w - 16 * ui); }
    lines.forEach((l, i) => {
      const y = top + head + 5 * ui + lh * (i + 0.5);
      ctx.fillStyle = l.mine ? PAL.cyan : PAL.goldLight;
      const name = `${l.name} : `;
      ctx.fillText(name, x + 8 * ui, y);
      const nw = ctx.measureText(name).width;
      ctx.fillStyle = PAL.text; ctx.fillText(l.text, x + 8 * ui + nw, y, w - nw - 16 * ui);
    });
    ctx.restore();
  }

  /** Animation du joueur selon son état (marche, attente, geste, assis, emote). */
  private playerAnim(): { anim: Anim; dir: Dir; frame: number; bob: number } {
    const pl = this.player;
    if (pl.moving) return { anim: 'walk', dir: pl.dir, frame: pl.frame, bob: 0 };
    if (this.emote) {
      const anim = (EMOTE_BY_ID.get(this.emote.id)?.anim ?? 'cheer') as Anim;
      if (anim === 'dance') return { anim: 'dance', dir: 'down', frame: Math.floor(this.t * 4), bob: 0 };
      return { anim, dir: 'down', frame: Math.floor(this.t * ANIMS[anim].fps), bob: 0 };
    }
    if (pl.actT > 0) return { anim: 'interact', dir: pl.dir, frame: pl.actT > 0.2 ? 1 : 0, bob: 0 };
    return { anim: 'idle', dir: pl.dir, frame: Math.floor(pl.idleT * ANIMS.idle.fps), bob: 0 };
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const pl = this.player, look = this.s.data.appearance;
    const st = this.playerAnim();
    let dir = st.dir; const bob = st.bob;
    if (this.swimming) {
      // Nage : seul le haut du corps dépasse, vaguelettes autour
      const wl = pl.y - 14 + Math.sin(this.t * 3) * 1.2;
      ctx.save(); ctx.beginPath(); ctx.rect(pl.x - 24, pl.y - 80, 48, wl - (pl.y - 80)); ctx.clip();
      drawLook(ctx, look, pl.moving ? 'walk' : 'idle', pl.dir, pl.moving ? pl.frame : Math.floor(pl.idleT * 2), pl.x, pl.y + 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(pl.x, wl, 12 + Math.sin(this.t * 4) * 1.5, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      if (pl.moving) { ctx.beginPath(); ctx.ellipse(pl.x, wl, 17, 5, 0, 0, Math.PI * 2); ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; }
      return;
    }
    if (pl.seat?.kind === 'sit') {
      dir = 'down';
      drawLook(ctx, look, 'sit', 'down', Math.floor(pl.idleT * ANIMS.sit.fps), pl.x, pl.y + 2);
    } else if (pl.seat?.kind === 'lie') {
      // Allongé sur le transat (vue de dessus), serviette sur les jambes
      dir = 'down';
      drawLook(ctx, look, 'idle', 'down', pl.idleT % 5 < 0.25 ? 3 : 0, pl.x, pl.y - 6);
      ctx.fillStyle = '#ff6f91'; ctx.fillRect(pl.x - 9, pl.y - 18, 18, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(pl.x - 9, pl.y - 15, 18, 1.5);
    } else drawLook(ctx, look, st.anim, dir, st.frame, pl.x, pl.y + bob);
    // Boisson en main
    if (pl.held && dir !== 'up' && pl.seat?.kind !== 'lie') {
      const hx = pl.x + (dir === 'left' ? -12 : 10), hy = pl.y - 22 + bob - (pl.seat ? 2 : 0);
      if (pl.held.kind === 'food') {
        ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.ellipse(hx, hy - 1, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pl.held.color; ctx.beginPath(); ctx.arc(hx, hy - 4, 3.6, Math.PI, 0); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(220,245,255,0.6)'; ctx.fillRect(hx - 3, hy - 8, 6, 9);
        ctx.fillStyle = pl.held.color; ctx.fillRect(hx - 2.5, hy - 5, 5, 6);
        ctx.fillStyle = PAL.gold; ctx.fillRect(hx + 1, hy - 12, 1, 6);
      }
    }
    // Bulle d'emote
    if (this.emote) {
      const e = EMOTE_BY_ID.get(this.emote!.id)!;
      const a = Math.min(1, this.emote.t * 4);
      const by = pl.y - 62 - (1 - a) * 6 + Math.sin(this.t * 6) * 1.5;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(pl.x, by, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(pl.x - 4, by + 9); ctx.lineTo(pl.x + 2, by + 9); ctx.lineTo(pl.x - 3, by + 15); ctx.fill();
      if (e) drawEmoteIcon(ctx, e.id, pl.x, by, 16);
      ctx.restore();
    }
  }

  /** Pulsation à 120 BPM (piste de danse, enceintes) — synchronisée sur le temps du jeu. */
  private get beat(): number { return Math.max(0, 1 - ((this.t * 2) % 1) * 3.5); }

  /** Eau de la piscine (reflets mouvants) et piste de danse (dalles lumineuses). */
  private renderFloorFx(ctx: CanvasRenderingContext2D, lowFx: boolean): void {
    if (!this.animTiles.length) return;
    const t = this.t, beat = this.beat;
    const danceCols = ['255,63,164', '111,243,255', '123,77,255', '255,209,102'];
    for (const tile of this.animTiles) {
      const px = tile.x * TILE, py = tile.y * TILE;
      if (tile.c === 'p') {
        if (lowFx) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
          const yy = py + 8 + i * 14 + Math.sin(t * 1.6 + tile.x * 0.9 + i) * 3;
          ctx.beginPath(); ctx.moveTo(px + 3, yy); ctx.quadraticCurveTo(px + 16, yy + Math.sin(t * 2 + tile.y) * 4, px + TILE - 3, yy); ctx.stroke();
        }
      } else if (tile.c === 'f') {
        const k = (tile.x * 3 + tile.y * 5 + Math.floor(t * 2)) % 4;
        const on = lowFx ? 0.35 : 0.25 + 0.55 * (((tile.x + tile.y + Math.floor(t * 2)) % 3 === 0) ? beat : 0.15);
        ctx.fillStyle = `rgba(${danceCols[k]},${on})`;
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      }
    }
  }

  private renderWindows(ctx: CanvasRenderingContext2D, lowFx: boolean): void {
    if (lowFx) return;
    ctx.save();
    for (const w of this.layer.windows) {
      ctx.save(); ctx.beginPath(); ctx.rect(w.x + 2, w.y + 3, w.w - 4, w.h - 7); ctx.clip();
      // Reflets mouvants sur l'océan
      ctx.strokeStyle = 'rgba(200,245,255,0.35)'; ctx.lineWidth = 1;
      const horizon = w.y + w.h * 0.46;
      for (let i = 0; i < 5; i++) {
        const yy = horizon + 5 + i * 6;
        const off = ((this.t * (8 + i * 3) + i * 37) % (w.w + 40)) - 20;
        ctx.beginPath(); ctx.moveTo(w.x + off, yy); ctx.lineTo(w.x + off + 10 + i * 2, yy); ctx.stroke();
      }
      // Nuage lent
      const cx = w.x + (((this.t * 3 + w.x) % (w.w + 60)) - 30);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(cx, w.y + 12, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private renderInteractMarkers(ctx: CanvasRenderingContext2D): void {
    if (this.modal) return;
    for (const it of this.interactions.items) {
      if (!it.enabled) continue;
      const d = Math.hypot(it.x - this.player.x, it.y - this.player.y);
      if (d > TILE * 6) continue;
      const focused = it === this.interactions.focused;
      if (it.quiet && !focused) continue;
      const wallMounted = it.hit.y < TILE; // objets muraux : étiquette sur la porte plutôt qu'au ras de l'écran
      // Objets hauts (écrans, bornes) : étiquette au-dessus du dessin, pas sur l'écran
      const ref = it.ref as PropDef | undefined, ex = ref?.kind ? propExtraTop(ref.kind) : 0;
      const baseTop = wallMounted ? it.y - TILE * 1.1 : ex >= 1 && ref ? ref.ty * TILE - ex * TILE - 2 : it.hit.y + 2;
      const top = baseTop + Math.sin(this.t * 3 + it.x) * 1.5;
      let cx = it.hit.x + it.hit.w / 2;
      ctx.save();
      ctx.font = font(focused ? 9 : 8, 800);
      const label = focused ? `${it.label} · toucher` : it.label;
      const tw = ctx.measureText(label).width + 12, th = focused ? 14 : 12;
      cx = clamp(cx, tw / 2 + 4, this.map.pixelWidth - tw / 2 - 4); // étiquette jamais coupée par le bord
      ctx.globalAlpha = focused ? 1 : clamp(1.6 - d / (TILE * 4), 0.25, 0.85);
      ctx.fillStyle = focused ? 'rgba(229,181,74,0.95)' : 'rgba(14,11,16,0.8)';
      ctx.beginPath(); ctx.roundRect?.(cx - tw / 2, top - th, tw, th, th / 2); ctx.fill();
      ctx.fillStyle = focused ? PAL.deepNavy : PAL.pearl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, top - th / 2 + 0.5);
      ctx.restore();
    }
  }

  /**
   * Lumières fixes pré-rendues une fois par étage dans deux textures « monde » en basse résolution :
   * masque (zones éclairées) et lueurs colorées. Avant : 2 dégradés radiaux recalculés par lumière et par
   * image (≈ 7,5 ms/image au casino avec un processeur ralenti ×4, mesuré par dev/drawtime.mjs).
   */
  private lightCache: { floor: FloorDef; key: string; k: number; pad: number; mask: ReturnType<typeof makeCanvas>; glow: ReturnType<typeof makeCanvas> } | null = null;

  private staticLights(lights: LightDef[], key: string) {
    if (this.lightCache?.key === key && this.lightCache.floor === this.floor) return this.lightCache;
    const k = 0.25, pad = TILE * 6;
    const W = Math.ceil((this.map.pixelWidth + pad * 2) * k), H = Math.ceil((this.map.pixelHeight + pad * 2) * k);
    const mask = makeCanvas(W, H), glow = makeCanvas(W, H);
    for (const l of lights) {
      const x = (l.x * TILE + pad) * k, y = (l.y * TILE + pad) * k, r = l.radius * TILE * k;
      const g = mask.ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      mask.ctx.fillStyle = g; mask.ctx.beginPath(); mask.ctx.arc(x, y, r, 0, Math.PI * 2); mask.ctx.fill();
      if (l.color === '255,255,255') continue;
      const rg = r * 0.8, gg = glow.ctx.createRadialGradient(x, y, 0, x, y, rg);
      gg.addColorStop(0, `rgba(${l.color},0.2)`); gg.addColorStop(1, `rgba(${l.color},0)`);
      glow.ctx.fillStyle = gg; glow.ctx.fillRect(x - rg, y - rg, rg * 2, rg * 2);
    }
    this.lightCache = { floor: this.floor, key, k, pad, mask, glow };
    return this.lightCache;
  }

  private renderLighting(ctx: CanvasRenderingContext2D, lowFx: boolean): void {
    const L = this.floor.lighting!, v = this.s.game.viewport, z = this.cam.zoom;
    // Canevas d'éclairage en basse résolution (moitié) : très économe, le flou est naturel.
    const sc = 0.5;
    const lw = Math.ceil(v.width * sc), lh = Math.ceil(v.height * sc);
    if (!this.lightCanvas || this.lightCanvas.canvas.width !== lw || this.lightCanvas.canvas.height !== lh) this.lightCanvas = makeCanvas(lw, lh);
    const lc = this.lightCanvas.ctx;
    const toS = (wx: number, wy: number) => ({ x: ((wx - this.cam.x) * z + v.width / 2) * sc, y: ((wy - this.cam.y) * z + v.height / 2) * sc });
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, lw, lh);
    let dark = L.darkness;
    if (this.floor.id === 'engine' && this.s.flag('engine.lights')) dark *= 0.7;
    if (L.dimFlag && this.s.flag(L.dimFlag)) dark = L.dimDarkness ?? dark;
    lc.fillStyle = `rgba(2,6,14,${dark})`;
    lc.fillRect(0, 0, lw, lh);
    const flags = this.s.data.flags;
    const on = L.lights.filter((l) => !l.flag || flags[l.flag]);
    const fixed = on.filter((l) => !l.flicker), live = on.filter((l) => l.flicker);
    const C = this.staticLights(fixed, `${on.length}|${this.map.pixelWidth}x${this.map.pixelHeight}`);
    // Zone du monde visible → rectangle source dans les textures pré-rendues
    const wx0 = this.cam.x - v.width / 2 / z, wy0 = this.cam.y - v.height / 2 / z, ww = v.width / z, wh = v.height / z;
    const src = [(wx0 + C.pad) * C.k, (wy0 + C.pad) * C.k, ww * C.k, wh * C.k] as const;
    lc.globalCompositeOperation = 'destination-out';
    lc.drawImage(C.mask.canvas, src[0], src[1], src[2], src[3], 0, 0, lw, lh);
    // Lumières animées (vacillantes) et lumière du joueur : dessinées à chaque image
    const dyn = [...live, { x: this.player.x / TILE, y: (this.player.y - 16) / TILE, radius: 2.6, color: '255,255,255', flicker: false }];
    const visible = dyn.filter((l) => { const p = toS(l.x * TILE, l.y * TILE), r = l.radius * TILE * z * sc; return p.x + r > 0 && p.y + r > 0 && p.x - r < lw && p.y - r < lh; });
    for (const l of visible) {
      const p = toS(l.x * TILE, l.y * TILE), r = l.radius * TILE * z * sc;
      const flick = l.flicker && !lowFx ? 0.85 + Math.sin(this.t * 13 + l.x) * 0.08 + Math.sin(this.t * 31) * 0.05 : 1;
      const g = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * flick);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g; lc.beginPath(); lc.arc(p.x, p.y, r * flick, 0, Math.PI * 2); lc.fill();
    }
    // Lueurs colorées peintes dans le même canevas (une seule copie plein écran par image)
    if (!lowFx) {
      lc.globalCompositeOperation = 'source-over';
      lc.drawImage(C.glow.canvas, src[0], src[1], src[2], src[3], 0, 0, lw, lh);
      // Casino : deux projecteurs dorés qui balaient lentement la salle (peints dans le canevas d'éclairage
      // en demi-résolution : quasiment gratuit, contrairement à un remplissage additif plein écran)
      if (this.floor.id === 'casino') {
        const B = { w: this.map.pixelWidth, h: this.map.pixelHeight };
        for (let i = 0; i < 2; i++) {
          const p = toS(B.w * (0.5 + 0.38 * Math.sin(this.t * 0.13 + i * 2.6)), B.h * (0.5 + 0.3 * Math.sin(this.t * 0.17 + i * 1.3)));
          const r = TILE * 4.5 * z * sc;
          if (p.x + r < 0 || p.y + r < 0 || p.x - r > lw || p.y - r > lh) continue;
          const g = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, 'rgba(255,214,140,0.16)'); g.addColorStop(1, 'rgba(255,214,140,0)');
          lc.fillStyle = g; lc.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }
      }
      for (const l of visible) {
        if (l.color === '255,255,255') continue;
        const p = toS(l.x * TILE, l.y * TILE), r = l.radius * TILE * z * 0.8 * sc;
        const g = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(${l.color},0.2)`); g.addColorStop(1, `rgba(${l.color},0)`);
        lc.fillStyle = g; lc.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.drawImage(this.lightCanvas.canvas, 0, 0, v.width, v.height);
  }
}
