// Menu principal KingSea : nuit en mer et paquebot illuminé, emblème KS, carte du joueur (personnage
// animé, titre, niveau et XP, KSCoins), choix du mode (hors ligne / en ligne), bouton Embarquer et accès directs
// au casino, aux mini-jeux, à la chambre, au rooftop, aux missions et aux amis, puis personnage et paramètres.
// Chaque bouton mène à la fonctionnalité réelle (destination transmise au navire, ou fenêtre ouverte ici).
import { drawLook } from '../art/characters';
import { drawKSEmblem, goldGradient, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import { drawMenuBackdrop } from '../art/scenery';
import { levelProgress } from '../authority/progress';
import type { PointerHandler } from '../engine/Input';
import type { Scene } from '../engine/Scene';
import { LEGAL } from '../legal/texts';
import type { Destination, Services } from '../systems/Services';
import { openLegal } from '../ui/LegalView';
import { MissionsMenu } from '../ui/MissionsMenu';
import { InfoDialog, type Modal } from '../ui/Modal';
import { SettingsMenu } from '../ui/SettingsMenu';
import { ControlsMenu } from '../ui/ControlsMenu';
import { ButtonLayer, font, Icons, makeButton, type Button } from '../ui/UIKit';
import { BalanceDisplay, drawLevelBadge, drawXpBar } from '../ui/Wealth';
import { ConnectScene } from './ConnectScene';
import { ProfileScene } from './ProfileScene';

const AGE_KEY = 'kingsea.ageOk';
const MODE_KEY = 'kingsea.mode';

type Mode = 'offline' | 'online';
const storage = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* indisponible */ } },
};

export class MenuScene implements Scene {
  private t = 0;
  readonly layer = new ButtonLayer();
  private modal: Modal | null = null;
  private card = { x: 0, y: 0, w: 0, h: 0 };
  private panel = { x: 0, y: 0, w: 0, h: 0 };
  private emblem = { cx: 0, cy: 0, size: 0 };
  private mode: Mode = storage.get(MODE_KEY) === 'online' ? 'online' : 'offline';
  private balance = new BalanceDisplay();
  private sparks: Array<{ x: number; y: number; v: number; s: number }> = [];
  private readonly btn: Record<string, Button> = {};

  constructor(private s: Services, private play: () => Scene) {
    this.layer.onTapSound = () => s.audio.tap();
    const mk = (id: string, label: string, onTap: () => void, extra: Partial<Button> = {}) => (this.btn[id] = makeButton({ id, label, onTap, style: 'secondary', fontSize: 14, ...extra }));
    mk('mode-offline', 'Hors ligne', () => this.setMode('offline'), { style: 'ghost', fontSize: 13 });
    mk('mode-online', 'En ligne', () => this.setMode('online'), { style: 'ghost', fontSize: 13 });
    mk('play', 'Embarquer', () => this.start(null), { style: 'gold', fontSize: 19 });
    mk('dest-casino', 'Casino', () => this.start('casino'), { icon: Icons.chip, sub: 'Tables et machines' });
    mk('dest-arcade', 'Mini-jeux', () => this.start('arcade'), { icon: Icons.pad, sub: 'Arcade et billard' });
    mk('dest-cabin', 'Ma chambre', () => this.start('cabin'), { icon: Icons.home, sub: 'Décorer, se reposer' });
    mk('dest-rooftop', 'Rooftop', () => this.start('rooftop'), { icon: Icons.sunset, sub: 'Piscine et club' });
    mk('missions', 'Missions', () => this.openMissions(), { icon: Icons.missions, sub: 'Jour et semaine' });
    mk('friends', 'Amis', () => this.openFriends(), { icon: Icons.friends, sub: 'En ligne' });
    mk('profile', 'Mon personnage', () => this.ageGate(() => this.s.game.goto(() => new ProfileScene(this.s, () => this, this.s.flag('profile.done') ? 'edit' : 'first'))), { style: 'ghost', fontSize: 13 });
    mk('settings', 'Paramètres', () => this.openSettings(), { style: 'ghost', fontSize: 13, icon: Icons.gear });
    // Ancien identifiant conservé (tests et raccourcis) : jouer hors ligne directement
    mk('online', 'Jouer en ligne', () => { this.setMode('online'); this.start(null); }, { visible: false });
    this.layer.buttons = Object.values(this.btn);
    for (let i = 0; i < 26; i++) this.sparks.push({ x: Math.random(), y: Math.random(), v: 0.01 + Math.random() * 0.03, s: Math.random() });
  }

  // ---------------------------------------------------------------- navigation
  private setMode(m: Mode): void { this.mode = m; storage.set(MODE_KEY, m); this.layout(); }

  /** Lance la partie (mode choisi) en direction d'un lieu, ou là où le joueur s'était arrêté. */
  private start(dest: Destination | null): void {
    this.ageGate(() => {
      this.s.destination = dest;
      if (this.mode === 'online') this.s.game.goto(() => new ConnectScene(this.s, this.play, () => this, () => this.playOffline()));
      else this.playOffline();
    });
  }

  /** Partie solo sur ce téléphone (sans compte ni serveur). */
  private playOffline(): void { this.s.game.goto(this.s.flag('profile.done') ? this.play : () => new ProfileScene(this.s, this.play, 'first')); }

  private openFriends(): void {
    this.openModal(new InfoDialog(this.s, 'Amis',
      'La liste d’amis, les demandes et le code joueur fonctionnent en ligne : ils sont enregistrés sur le serveur du jeu.\n\nConnecte-toi pour retrouver tes amis ; tu arriveras directement sur ta liste.',
      [{ label: 'Plus tard', style: 'ghost', onTap: () => {} }, { label: 'Se connecter', style: 'gold', onTap: () => { this.setMode('online'); setTimeout(() => this.start('friends'), 0); } }]));
  }

  private openMissions(): void {
    const m = new MissionsMenu(this.s);
    m.title = this.s.online ? 'Missions' : 'Missions · partie hors ligne';
    this.openModal(m);
  }

  /**
   * Avertissement d'âge (jeux de casino simulés, classification 18+) : demandé une fois sur ce téléphone,
   * avant toute partie. Sans confirmation, on ne peut pas jouer.
   */
  private ageGate(then: () => void): void {
    if (storage.get(AGE_KEY) === '1') { then(); return; }
    this.openModal(new InfoDialog(this.s, 'Avant d’embarquer',
      `KingSea contient des jeux de casino simulés (roulette, blackjack, machines…). Les KSCoins n’ont aucune valeur réelle : rien ne s’achète, rien ne se gagne.\n\nCe jeu est réservé aux personnes de ${LEGAL.minAge} ans et plus.`,
      [
        { label: 'Conditions', style: 'ghost', keepOpen: true, onTap: () => openLegal('terms') },
        { label: `J’ai moins de ${LEGAL.minAge} ans`, style: 'secondary', onTap: () => { this.s.notice = `KingSea est réservé aux ${LEGAL.minAge} ans et plus.`; } },
        { label: `J’ai ${LEGAL.minAge} ans ou plus`, style: 'gold', onTap: () => { storage.set(AGE_KEY, '1'); setTimeout(then, 0); } },
      ]));
  }

  private openModal(m: Modal): void {
    m.onClosed = () => { this.modal = null; this.s.game.refreshHandlers(); };
    m.layout(this.s.game.viewport);
    this.modal = m;
    this.s.game.refreshHandlers();
  }

  private openSettings(): void {
    this.openModal(new SettingsMenu(this.s, { onChanged: () => {}, onControls: () => this.openModal(new ControlsMenu(this.s)), onReset: () => { this.s.resetProgress(); this.balance.sync(this.s.wallet.balance); } }));
  }

  // ---------------------------------------------------------------- scène
  enter(): void {
    if (this.s.online) this.s.goOffline(); // retour au menu : on quitte la session en ligne
    this.s.destination = null;
    this.balance.sync(this.s.wallet.balance);
    this.layout(); this.s.audio.setAmbient('hub'); this.s.audio.setMusic('menu');
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __ksMenu: unknown }).__ksMenu = this;
  }
  exit(): void {}
  onResize(): void { this.layout(); this.modal?.layout(this.s.game.viewport); }
  pointerHandlers(): PointerHandler[] { return this.modal ? [this.modal.layer] : [this.layer]; }
  onBack(): boolean { if (this.modal) { this.modal.close(); return true; } return false; }

  private layout(): void {
    const v = this.s.game.viewport, ui = v.ui, b = this.btn;
    const L = v.safe.left, R = v.width - v.safe.right, T = v.safe.top, B = v.height - v.safe.bottom;
    const gap = 8 * ui, bh = Math.max(46, 50 * ui), sh = Math.max(44, 44 * ui);
    let px: number, py: number, pw: number;
    if (v.isPortrait) {
      const size = Math.min(v.width * 0.34, (B - T) * 0.17);
      this.emblem = { cx: v.width / 2, cy: T + size * 0.95, size };
      pw = Math.min(v.width - 32, 440 * ui); px = v.width / 2 - pw / 2; py = this.emblem.cy + size * 1.25;
    } else {
      pw = Math.min(430 * ui, (R - L) * 0.52); px = R - pw - 16 * ui; py = T + 10 * ui;
      const size = Math.min((px - L) * 0.5, (B - T) * 0.42);
      this.emblem = { cx: L + (px - L) / 2, cy: T + (B - T) * 0.43, size };
    }
    const inner = 14 * ui, x = px + inner, w = pw - inner * 2;
    let y = py + inner;
    // Carte du joueur
    const cardH = 74 * ui;
    this.card = { x, y, w, h: cardH }; y += cardH + gap;
    const half = (w - gap) / 2, mh = Math.max(44, 36 * ui);
    const dests = ['dest-casino', 'dest-arcade', 'dest-cabin', 'dest-rooftop', 'missions', 'friends'];
    const subs: Record<string, string> = { 'dest-casino': 'Tables et machines', 'dest-arcade': 'Arcade et billard', 'dest-cabin': 'Décorer, se reposer', 'dest-rooftop': 'Piscine et club', missions: 'Jour et semaine', friends: 'En ligne' };
    const modeStyle = (m: Mode) => ({ active: this.mode === m, style: (this.mode === m ? 'secondary' : 'ghost') as Button['style'] });
    b.play.label = this.s.flag('profile.done') ? (this.mode === 'online' ? 'Embarquer en ligne' : 'Embarquer') : 'Créer mon personnage';
    if (v.isPortrait) {
      Object.assign(b['mode-offline'], { x, y, w: half, h: mh, ...modeStyle('offline') });
      Object.assign(b['mode-online'], { x: x + half + gap, y, w: half, h: mh, ...modeStyle('online') });
      y += mh + gap;
      Object.assign(b.play, { x, y, w, h: bh }); y += bh + gap;
      const avail = B - 12 * ui - y - sh - gap * 2;
      const dh = Math.max(46, Math.min(56 * ui, (avail - gap * 2) / 3));
      dests.forEach((id, i) => Object.assign(b[id], { x: x + (i % 2) * (half + gap), y: y + Math.floor(i / 2) * (dh + gap), w: half, h: dh, fontSize: 14.5, sub: dh >= 52 * ui && half > 150 * ui ? subs[id] : undefined }));
      y += 3 * dh + 3 * gap;
      b.profile.label = 'Mon personnage'; b.settings.icon = Icons.gear;
      Object.assign(b.profile, { x, y, w: half, h: sh });
      Object.assign(b.settings, { x: x + half + gap, y, w: half, h: sh });
      y += sh + inner;
    } else {
      // Paysage (hauteur limitée) : mode + personnage + paramètres sur une ligne, destinations en 3 colonnes
      const q = (w - gap * 3) / 4;
      b.profile.label = 'Personnage'; b.settings.icon = undefined;
      Object.assign(b['mode-offline'], { x, y, w: q, h: mh, ...modeStyle('offline') });
      Object.assign(b['mode-online'], { x: x + (q + gap), y, w: q, h: mh, ...modeStyle('online') });
      Object.assign(b.profile, { x: x + (q + gap) * 2, y, w: q, h: mh });
      Object.assign(b.settings, { x: x + (q + gap) * 3, y, w: q, h: mh });
      y += mh + gap;
      Object.assign(b.play, { x, y, w, h: bh }); y += bh + gap;
      const third = (w - gap * 2) / 3;
      const avail = B - 10 * ui - inner - y;
      const dh = Math.max(46, Math.min(58 * ui, (avail - gap) / 2));
      dests.forEach((id, i) => Object.assign(b[id], { x: x + (i % 3) * (third + gap), y: y + Math.floor(i / 3) * (dh + gap), w: third, h: dh, fontSize: 13.5, sub: dh >= 54 * ui && third > 150 * ui ? subs[id] : undefined }));
      y += 2 * dh + gap + inner;
    }
    this.panel = { x: px, y: py, w: pw, h: y - py };
  }

  update(dt: number): void {
    this.t += dt; this.modal?.update(dt);
    this.balance.update(dt, this.s.wallet.balance);
    for (const p of this.sparks) { p.y -= p.v * dt; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); } }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const v = this.s.game.viewport, ui = v.ui, lowFx = this.s.lowFx, d = this.s.data;
    // Nuit en mer : le crépuscule d'origine passe en ambiance nocturne chaude (noir, bordeaux, or)
    drawMenuBackdrop(ctx, v.width, v.height, this.t, lowFx);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const grade = ctx.createLinearGradient(0, 0, 0, v.height);
    grade.addColorStop(0, '#3a2a3a'); grade.addColorStop(0.55, '#7a4a52'); grade.addColorStop(1, '#2a2228');
    ctx.fillStyle = grade; ctx.fillRect(0, 0, v.width, v.height);
    ctx.restore();
    const shade = ctx.createLinearGradient(0, 0, v.width, 0);
    shade.addColorStop(0, 'rgba(8,6,10,0.25)'); shade.addColorStop(1, 'rgba(8,6,10,0.55)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, v.width, v.height);
    // Poussières dorées qui montent
    if (!lowFx) {
      for (const p of this.sparks) {
        ctx.fillStyle = `rgba(239,220,174,${0.15 + 0.35 * Math.abs(Math.sin(this.t * 1.5 + p.s * 10))})`;
        ctx.beginPath(); ctx.arc(p.x * v.width, p.y * v.height, (1 + p.s * 1.6) * ui, 0, Math.PI * 2); ctx.fill();
      }
    }
    const e = this.emblem;
    drawKSEmblem(ctx, e.cx, e.cy, e.size, this.t, 'full', true);

    // Panneau principal
    const P = this.panel;
    ctx.save();
    roundRect(ctx, P.x, P.y, P.w, P.h, 18 * ui);
    const pg = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
    pg.addColorStop(0, 'rgba(30,24,32,0.9)'); pg.addColorStop(1, 'rgba(10,8,12,0.92)');
    ctx.fillStyle = pg; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = goldGradient(ctx, P.x, P.y, P.x + P.w, P.y + P.h); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();

    // Carte du joueur
    const c = this.card, done = this.s.flag('profile.done');
    const prog = levelProgress(this.s.progress.xp);
    ctx.save();
    const av = c.h;
    roundRect(ctx, c.x, c.y, av, av, 12 * ui); ctx.save(); ctx.clip();
    const ag = ctx.createRadialGradient(c.x + av / 2, c.y + av * 0.35, 2, c.x + av / 2, c.y + av / 2, av);
    ag.addColorStop(0, '#4a2a35'); ag.addColorStop(1, LUXE.onyx);
    ctx.fillStyle = ag; ctx.fillRect(c.x, c.y, av, av);
    drawLook(ctx, d.appearance, 'idle', 'down', Math.floor(this.t * 2.5), c.x + av / 2, c.y + av * 1.05, (av * 0.95) / 48 * 1.15);
    ctx.restore();
    ctx.strokeStyle = 'rgba(212,175,90,0.7)'; ctx.lineWidth = 1.2; roundRect(ctx, c.x, c.y, av, av, 12 * ui); ctx.stroke();
    const tx = c.x + av + 12 * ui, tw = c.w - av - 12 * ui;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = PAL.text; ctx.font = font(17 * ui, 800);
    ctx.fillText(done ? d.name : 'Nouveau passager', tx, c.y + 13 * ui, tw);
    const title = this.s.progress.title;
    ctx.fillStyle = LUXE.champagne; ctx.font = font(11.5 * ui, 600);
    ctx.fillText(title ? `« ${title} »` : done && d.cabin.id ? `Cabine ${d.cabin.id}` : 'Passager du KingSea', tx, c.y + 31 * ui, tw);
    drawLevelBadge(ctx, tx + 11 * ui, c.y + 52 * ui, 22 * ui, prog.level);
    const barW = Math.max(40, tw * 0.42);
    drawXpBar(ctx, tx + 27 * ui, c.y + 49 * ui, barW, 7 * ui, prog.ratio);
    ctx.fillStyle = PAL.textDim; ctx.font = font(10 * ui, 700);
    ctx.fillText(prog.needed ? `${prog.into}/${prog.needed} XP` : 'Niveau max.', tx + 27 * ui, c.y + 64 * ui, barW);
    ctx.restore();
    // Solde (à droite de la barre)
    ctx.save(); ctx.font = font(30 * ui * 0.45, 800);
    const bw = ctx.measureText(this.balance.shown.toLocaleString('fr-FR')).width + 30 * ui * 1.45;
    ctx.restore();
    this.balance.render(ctx, c.x + c.w - bw, c.y + 40 * ui, 30 * ui, ui);

    this.layer.render(ctx, ui);

    // Pied de page
    ctx.font = font(10.5 * ui, 500); ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(239,220,174,0.6)';
    const footer = `v${__KS_VERSION__} · Un jeu de ${LEGAL.publisher} · 18+ · KSCoins sans valeur réelle`;
    if (v.isPortrait) { ctx.textAlign = 'center'; ctx.fillText(footer, v.width / 2, v.height - v.safe.bottom - 4, v.width - 24); }
    else { ctx.textAlign = 'left'; ctx.fillText(footer, v.safe.left + 14, v.height - v.safe.bottom - 8); }
    if (this.s.notice) {
      ctx.fillStyle = PAL.gold; ctx.font = font(13 * ui, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(this.s.notice, v.width / 2, v.safe.top + 8, v.width - 24);
    }
    if (this.s.save.recoveredFromCorruption) {
      ctx.fillStyle = PAL.danger; ctx.font = font(11 * ui, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('Sauvegarde illisible : nouvelle partie créée (copie conservée).', v.safe.left + 14, v.height - v.safe.bottom - 24);
    }
    this.modal?.render(ctx, v);
  }
}
