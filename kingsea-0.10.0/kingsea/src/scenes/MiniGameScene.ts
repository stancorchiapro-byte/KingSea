// Scène hôte des mini-jeux : écran KS d'ouverture, en-tête (emblème, titre, niveau, KSCoins, règles, quitter),
// fond, règles, annonces de niveau, retour au navire. Une erreur au chargement d'un jeu ne bloque jamais le joueur.
import { drawKSEmblem, LUXE, spacedCaps } from '../art/brand';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import type { Scene } from '../engine/Scene';
import type { Area, MiniGame, MiniGameHost } from '../games/MiniGame';
import type { Services } from '../systems/Services';
import { InfoDialog, type Modal } from '../ui/Modal';
import { Toasts } from '../ui/Toasts';
import { ButtonLayer, font, Icons, makeButton, type Button } from '../ui/UIKit';
import { BalanceDisplay, LevelDisplay, LevelUpOverlay } from '../ui/Wealth';
import type { ProgressSnapshot } from '../authority/types';

export class MiniGameScene implements Scene, MiniGameHost {
  readonly idleThrottle = false;
  readonly toasts = new Toasts();
  area: Area = { x: 0, y: 0, w: 0, h: 0 };
  private header = new ButtonLayer(8);
  private quitBtn: Button;
  private rulesBtn: Button;
  private modal: Modal | null = null;
  private balance: BalanceDisplay;
  private level = new LevelDisplay();
  private levelUp = new LevelUpOverlay();
  /** Écran KS d'ouverture (logo animé) : disparaît dès que le jeu est prêt, 0,45 s au plus. */
  private intro = 0.45;
  private failed: string | null = null;
  private t = 0;
  private onProgress = (p: ProgressSnapshot) => {
    if (this.s.game.current !== this) return;
    this.level.gain(p.gainedXp);
    if (p.levelUps.length) this.levelUp.show(p.levelUps);
  };

  /** Bilan de la session (jeux du casino) : manches, mises, retours, pourboires, meilleur gain. */
  private session = { rounds: 0, staked: 0, returned: 0, tips: 0, best: 0, open: 0 };
  private onReply = (kind: string, _game: string, action: string, r: { stake: number; payout: number; done: boolean; view: Record<string, unknown> }) => {
    if (kind !== 'casino' || this.s.game.current !== this) return;
    const S = this.session;
    if (action === 'tip') { S.tips += Number(r.view.tip) || 0; return; }
    S.staked += r.stake; S.open += r.stake;
    if (r.done && S.open > 0) { S.rounds++; S.returned += r.payout; S.best = Math.max(S.best, r.payout - S.open); S.open = 0; }
  };

  constructor(readonly s: Services, readonly game: MiniGame, private back: () => Scene) {
    this.header.onTapSound = () => s.audio.tap();
    this.quitBtn = makeButton({ id: 'mg-quit', label: 'Quitter', icon: Icons.close, style: 'secondary', fontSize: 14, onTap: () => this.quit() });
    this.rulesBtn = makeButton({ id: 'mg-rules', label: 'Règles', style: 'ghost', fontSize: 14, onTap: () => this.openRules() });
    this.header.buttons = [this.rulesBtn, this.quitBtn];
    this.balance = new BalanceDisplay(game.currency === 'chips' ? 'chips' : 'coins');
  }

  /** Portefeuille du jeu : jetons au casino, KSCoins ailleurs. */
  private get purse() { return this.game.currency === 'chips' ? this.s.chips : this.s.wallet; }

  get vp() { return this.s.game.viewport; }

  enter(): void {
    this.balance.sync(this.purse.balance);
    this.balance.onDelta = (d) => { if (d > 0) this.s.audio.coin(); };
    this.levelUp.onShow = () => { this.s.audio.jackpot(); this.s.haptic([40, 60, 40, 60, 120]); };
    this.s.progressListeners.add(this.onProgress);
    this.s.replyListeners.add(this.onReply);
    this.layoutAll();
    try {
      this.game.init(this);
      this.game.layout();
    } catch (e) {
      // Chargement impossible : message clair et bouton de retour, jamais d'écran figé
      console.error('[KingSea] mini-jeu', e);
      this.failed = `${this.game.title} n’a pas pu s’ouvrir. Réessaie dans un instant.`;
      this.rulesBtn.visible = false;
      this.quitBtn.label = 'Retour';
      this.intro = 0;
    }
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __ksGame: unknown }).__ksGame = this;
  }

  exit(): void { this.s.progressListeners.delete(this.onProgress); this.s.replyListeners.delete(this.onReply); try { this.game.dispose?.(); } catch (e) { console.error(e); } this.s.save.saveNow(); }

  onResize(): void { this.layoutAll(); if (!this.failed) this.game.layout(); this.modal?.layout(this.vp); }

  private layoutAll(): void {
    const v = this.vp, ui = v.ui;
    const top = v.safe.top + 8 * ui, hh = 46 * ui;
    const right = v.width - v.safe.right - 10 * ui;
    Object.assign(this.quitBtn, { x: right - 120 * ui, y: top, w: 120 * ui, h: hh });
    Object.assign(this.rulesBtn, { x: right - 120 * ui - 10 * ui - 92 * ui, y: top, w: 92 * ui, h: hh });
    const y = top + hh + 8 * ui;
    this.area = { x: v.safe.left + 10 * ui, y, w: v.width - v.safe.left - v.safe.right - 20 * ui, h: v.height - y - v.safe.bottom - 8 * ui };
  }

  pointerHandlers(): PointerHandler[] {
    if (this.modal) return [this.modal.layer];
    if (this.failed) return [this.header];
    return [...this.game.handlers(), this.header];
  }

  refreshHandlers(): void { this.s.game.refreshHandlers(); }

  onBack(): boolean { if (this.modal) { this.modal.close(); return true; } this.quit(); return true; }

  quit(): void {
    const c = this.failed ? { ok: true as const } : this.game.canQuit();
    if (!c.ok) { this.toasts.show(c.reason, 'error'); this.s.audio.error(); return; }
    // Casino : bilan de la session avant de repartir (lisible, sans rien modifier)
    const S = this.session;
    if (this.game.currency === 'chips' && S.rounds > 0 && !this.modal) {
      const net = S.returned - S.staked, f = (v: number) => v.toLocaleString('fr-FR');
      const text = `Manches jouées : ${S.rounds}\nTotal misé : ${f(S.staked)} jetons\nTotal récupéré : ${f(S.returned)} jetons\n` +
        `Résultat : ${net >= 0 ? '+' : '−'}${f(Math.abs(net))} jetons${S.tips ? `\nPourboires offerts : ${f(S.tips)} jetons` : ''}${S.best > 0 ? `\nMeilleur gain sur une manche : +${f(S.best)}` : ''}\n\nSolde actuel : ${f(this.s.chips.balance)} jetons · ${f(this.s.wallet.balance)} KSCoins`;
      const m = new InfoDialog(this.s, `Bilan · ${this.game.title}`, text, [
        { label: 'Continuer à jouer', style: 'secondary', onTap: () => {} },
        { label: 'Retour au navire', style: 'primary', onTap: () => this.s.game.goto(this.back, 3.2, 'iris') },
      ]);
      m.onClosed = () => { this.modal = null; this.refreshHandlers(); };
      m.layout(this.vp);
      this.modal = m;
      this.refreshHandlers();
      return;
    }
    this.s.game.goto(this.back, 3.2, 'iris');
  }

  private openRules(): void {
    const chipsNote = this.game.currency === 'chips' ? '\n\nJetons de casino : on mise et on gagne des jetons, distincts des KSCoins. La caisse du casino les échange (1 jeton = 1 KSCoin, dans les deux sens).' : '';
    const m = new InfoDialog(this.s, `Règles · ${this.game.title}`, this.game.rules + chipsNote);
    m.onClosed = () => { this.modal = null; this.refreshHandlers(); };
    m.layout(this.vp);
    this.modal = m;
    this.refreshHandlers();
  }

  update(dt: number): void {
    this.t += dt;
    this.intro = Math.max(0, this.intro - dt);
    this.toasts.update(dt);
    this.modal?.update(dt);
    this.balance.hold = !!this.game.holdBalance;
    this.balance.update(dt, this.purse.balance);
    this.level.update(dt, this.s.progress.xp);
    this.levelUp.update(dt, this.vp.width, this.vp.height);
    if (this.failed) return;
    // Clavier / manette : « Interagir » déclenche le bouton principal (doré) du jeu, s'il est disponible
    if (!this.modal && this.intro <= 0 && this.s.game.controls.pressed('interact')) {
      for (const h of this.game.handlers()) {
        if (!(h instanceof ButtonLayer)) continue;
        const b = h.buttons.find((x) => x.style === 'gold' && x.visible && x.enabled);
        if (b) { this.s.audio.tap(); b.onTap(); break; }
      }
    }
    try { this.game.update(dt); } catch (e) { console.error('[KingSea] mini-jeu', e); this.failed = 'Une erreur est survenue dans ce jeu. Ta mise éventuelle est conservée par le croupier : reviens au navire.'; this.quitBtn.label = 'Retour'; }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const v = this.vp, ui = v.ui;
    const g = ctx.createLinearGradient(0, 0, 0, v.height);
    g.addColorStop(0, this.game.bg[0]); g.addColorStop(1, this.game.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, v.width, v.height);
    // Vignette chaude (éclairage d'ambiance de salon privé)
    const vg = ctx.createRadialGradient(v.width / 2, v.height * 0.45, Math.min(v.width, v.height) * 0.3, v.width / 2, v.height * 0.5, Math.max(v.width, v.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, v.width, v.height);
    if (this.failed) this.renderFailure(ctx); else this.game.render(ctx);

    // En-tête : emblème, titre, niveau, solde
    const top = v.safe.top + 8 * ui, hh = 46 * ui;
    ctx.save();
    const hg = ctx.createLinearGradient(0, 0, 0, top + hh + 6 * ui);
    hg.addColorStop(0, 'rgba(8,6,10,0.85)'); hg.addColorStop(1, 'rgba(8,6,10,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, v.width, top + hh + 6 * ui);
    const ex = v.safe.left + 14 * ui + 14 * ui;
    drawKSEmblem(ctx, ex, top + hh / 2, 28 * ui, 0, 'small');
    const pillH = hh - 8 * ui;
    ctx.font = font(pillH * 0.45, 800);
    const pw = ctx.measureText(this.balance.shown.toLocaleString('fr-FR')).width + pillH * 1.45;
    const px = this.rulesBtn.visible ? this.rulesBtn.x - pw - 12 * ui : this.quitBtn.x - pw - 12 * ui;
    const showLevel = v.width > 600;
    const levelW = 118 * ui, lx = px - levelW - 12 * ui;
    const titleMax = (showLevel ? lx : px) - (ex + 22 * ui) - 10 * ui;
    if (titleMax > 40 * ui) spacedCaps(ctx, this.game.title, ex + 22 * ui, top + hh / 2, 15 * ui, LUXE.champagne, 'left', 0.08);
    if (showLevel) this.level.render(ctx, lx, top + hh / 2 - 13 * ui, levelW, ui);
    this.balance.render(ctx, px, top + 4 * ui, pillH, ui);
    ctx.restore();
    this.header.render(ctx, ui);
    this.toasts.render(ctx, v);
    this.modal?.render(ctx, v);
    this.levelUp.render(ctx, v.width, v.height, ui);
    // Écran KS d'ouverture
    if (this.intro > 0) {
      const a = Math.min(1, this.intro / 0.2);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = LUXE.black; ctx.fillRect(0, 0, v.width, v.height);
      const size = Math.min(v.width, v.height) * 0.26, k = 1 + (0.45 - this.intro) * 0.15;
      drawKSEmblem(ctx, v.width / 2, v.height * 0.44, size * k, this.t + 0.5, 'small');
      spacedCaps(ctx, this.game.title, v.width / 2, v.height * 0.44 + size * 0.75, 15 * ui, LUXE.champagne, 'center', 0.2);
      ctx.restore();
    }
  }

  private renderFailure(ctx: CanvasRenderingContext2D): void {
    const v = this.vp, ui = v.ui;
    drawKSEmblem(ctx, v.width / 2, v.height * 0.4, 70 * ui, 0, 'small');
    ctx.fillStyle = PAL.text; ctx.font = font(16 * ui, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.failed ?? '', v.width / 2, v.height * 0.4 + 70 * ui, v.width - 40 * ui);
  }
}
