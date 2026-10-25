// Interface en jeu : KSCoins (haut-gauche), étage (haut-centre), Étages & Paramètres (haut-droite),
// bouton Interagir (bas-droite, sous le pouce) et Emotes. Tout respecte les zones de sécurité.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import { ButtonLayer, font, Icons, makeButton, type Button } from './UIKit';
import { BalanceDisplay, LevelDisplay, LevelUpOverlay } from './Wealth';

export interface HudCallbacks { onFloors: () => void; onSettings: () => void; onInteract: () => void; onEmote: () => void; onInventory?: () => void; onChat?: () => void; onPlayers?: () => void; onMissions?: () => void }

export class Hud {
  readonly layer = new ButtonLayer(8);
  readonly interactBtn: Button;
  private floorsBtn: Button;
  private settingsBtn: Button;
  private emoteBtn: Button;
  readonly chatBtn: Button;
  readonly playersBtn: Button;
  readonly missionsBtn: Button;
  readonly balance = new BalanceDisplay();
  /** Jetons de casino (affichés à côté des KSCoins). */
  readonly chips = new BalanceDisplay('chips');
  /** Jauges faim / soif (0–100) et alerte la plus grave en cours. */
  needs: { hunger: number; thirst: number } | null = null;
  readonly invBtn: Button;
  readonly level = new LevelDisplay();
  readonly levelUp = new LevelUpOverlay();
  /** Missions terminées non réclamées (pastille). */
  missionsReady = 0;
  /** État de la connexion (null : partie hors ligne). */
  net: { state: 'online' | 'reconnecting'; others: number; unread: number } | null = null;
  focusLabel: string | null = null;

  constructor(cb: HudCallbacks, tapSound: () => void) {
    this.layer.onTapSound = tapSound;
    this.floorsBtn = makeButton({ id: 'hud-floors', label: 'Étages', icon: Icons.elevator, style: 'round', fontSize: 10, onTap: cb.onFloors });
    this.settingsBtn = makeButton({ id: 'hud-settings', label: '', icon: Icons.gear, style: 'round', onTap: cb.onSettings });
    this.emoteBtn = makeButton({ id: 'hud-emote', label: '', icon: Icons.hand, style: 'round', onTap: cb.onEmote });
    this.interactBtn = makeButton({ id: 'hud-interact', label: 'Interagir', icon: Icons.interact, style: 'round', fontSize: 11, onTap: cb.onInteract });
    this.chatBtn = makeButton({ id: 'hud-chat', label: '', icon: Icons.chat, style: 'round', visible: false, onTap: () => cb.onChat?.() });
    this.playersBtn = makeButton({ id: 'hud-players', label: '', icon: Icons.friends, style: 'round', visible: false, onTap: () => cb.onPlayers?.() });
    this.missionsBtn = makeButton({ id: 'hud-missions', label: '', icon: Icons.missions, style: 'round', onTap: () => cb.onMissions?.() });
    this.invBtn = makeButton({ id: 'hud-inventory', label: '', icon: Icons.bag, style: 'round', onTap: () => cb.onInventory?.() });
    this.layer.buttons = [this.invBtn, this.floorsBtn, this.settingsBtn, this.missionsBtn, this.chatBtn, this.playersBtn, this.emoteBtn, this.interactBtn];
  }

  layout(v: Viewport, scale = 1, mirror = false): void {
    const ui = v.ui, top = v.safe.top + 10 * ui, right = v.width - v.safe.right - 12 * ui;
    const s = 50 * ui;
    Object.assign(this.settingsBtn, { x: right - s, y: top, w: s, h: s });
    Object.assign(this.floorsBtn, { x: right - s * 2 - 10 * ui, y: top, w: s, h: s });
    Object.assign(this.missionsBtn, { x: right - s * 3 - 20 * ui, y: top, w: s, h: s });
    Object.assign(this.playersBtn, { x: right - s * 4 - 30 * ui, y: top, w: s, h: s });
    Object.assign(this.chatBtn, { x: right - s * 5 - 40 * ui, y: top, w: s, h: s });
    const big = 92 * ui * scale;
    const bottom = v.height - v.safe.bottom - 22 * ui;
    Object.assign(this.interactBtn, { x: right - big - 8 * ui, y: bottom - big, w: big, h: big });
    const e = 54 * ui * scale;
    Object.assign(this.emoteBtn, { x: this.interactBtn.x - e - 18 * ui, y: bottom - e + 4 * ui, w: e, h: e });
    Object.assign(this.invBtn, { x: this.interactBtn.x + (this.interactBtn.w - e) / 2 - e * 0.15, y: this.interactBtn.y - e - 14 * ui, w: e, h: e });
    if (mirror) {
      // Mode gaucher : boutons d'action en bas à gauche (miroir)
      for (const b of [this.interactBtn, this.emoteBtn, this.invBtn]) b.x = v.width - b.x - b.w + (v.safe.left - v.safe.right);
    }
  }

  setFocus(label: string | null): void {
    this.focusLabel = label;
    this.interactBtn.enabled = !!label;
    this.interactBtn.active = !!label;
    this.interactBtn.label = label ?? 'Interagir';
  }

  update(dt: number, balance: number, xp = 0, vw = 0, vh = 0, chips = 0): void {
    this.balance.update(dt, balance);
    this.chips.update(dt, chips);
    this.level.update(dt, xp);
    this.levelUp.update(dt, vw, vh);
  }

  syncBalance(b: number): void { this.balance.sync(b); }

  /** Deux jauges (faim : couverts, soif : goutte) ; orange sous 50, rouge clignotant sous 25. */
  private renderNeeds(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ui: number, t: number): void {
    const n = this.needs!;
    const half = (w - 8 * ui) / 2, h = 8 * ui;
    const bar = (bx: number, v: number, icon: 'food' | 'drink') => {
      const ix = bx + 7 * ui, iy = y + h / 2;
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = v < 25 ? PAL.danger : v <= 50 ? '#ffb062' : '#efdcae';
      ctx.lineWidth = 1.6 * ui; ctx.lineCap = 'round';
      if (icon === 'food') { ctx.beginPath(); ctx.moveTo(ix - 3 * ui, iy - 5 * ui); ctx.lineTo(ix - 3 * ui, iy + 5 * ui); ctx.moveTo(ix + 3 * ui, iy - 5 * ui); ctx.lineTo(ix + 3 * ui, iy + 5 * ui); ctx.moveTo(ix - 5 * ui, iy - 5 * ui); ctx.lineTo(ix - 5 * ui, iy - 1 * ui); ctx.moveTo(ix - 1 * ui, iy - 5 * ui); ctx.lineTo(ix - 1 * ui, iy - 1 * ui); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(ix, iy - 6 * ui); ctx.quadraticCurveTo(ix + 5 * ui, iy, ix + 4 * ui, iy + 2 * ui); ctx.arc(ix, iy + 2 * ui, 4 * ui, 0, Math.PI); ctx.quadraticCurveTo(ix - 5 * ui, iy, ix, iy - 6 * ui); ctx.fill(); }
      const gx = bx + 16 * ui, gw = half - 18 * ui;
      roundRect(ctx, gx, y, gw, h, h / 2); ctx.fillStyle = 'rgba(10,8,12,0.75)'; ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,90,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      const blink = v < 25 ? 0.55 + 0.45 * Math.sin(t * 8) : 1;
      ctx.globalAlpha = blink;
      roundRect(ctx, gx + 1, y + 1, Math.max(0, (gw - 2) * Math.max(0, Math.min(1, v / 100))), h - 2, (h - 2) / 2);
      ctx.fillStyle = v < 25 ? PAL.danger : v <= 50 ? '#ffb062' : PAL.gold; ctx.fill();
      ctx.restore();
    };
    bar(x, n.hunger, 'food');
    bar(x + half + 8 * ui, n.thirst, 'drink');
  }

  render(ctx: CanvasRenderingContext2D, v: Viewport, floorShort: string, floorName: string, t: number): void {
    const ui = v.ui, top = v.safe.top + 10 * ui;
    // KSCoins, puis niveau et XP en dessous
    ctx.save();
    const ph = 40 * ui, px = v.safe.left + 12 * ui;
    const bw0 = this.balance.render(ctx, px, top + 5 * ui, ph, ui);
    // Jetons de casino, plus petits, à droite des KSCoins
    const cw = this.chips.render(ctx, px + bw0 + 8 * ui, top + 9 * ui, ph * 0.8, ui);
    const pw = bw0 + 8 * ui + cw;
    this.level.render(ctx, px + 2 * ui, top + ph + 12 * ui, Math.max(bw0, 132 * ui), ui);
    // Jauges faim et soif sous le niveau
    if (this.needs) this.renderNeeds(ctx, px + 2 * ui, top + ph + 36 * ui, Math.max(bw0, 132 * ui), ui, t);

    // Étage courant (centré, raccourci si l'écran est étroit)
    const label = v.width < 520 ? floorShort : `${floorShort} · ${floorName}`;
    ctx.font = font(14 * ui, 800);
    const fw = ctx.measureText(label).width + 32 * ui;
    const fx = v.width / 2 - fw / 2;
    const rightmost = this.chatBtn.visible ? this.chatBtn.x : this.missionsBtn.x;
    if (fx > px + pw + 8 && fx + fw < rightmost - 8) {
      roundRect(ctx, fx, top + 8 * ui, fw, 34 * ui, 17 * ui);
      ctx.fillStyle = 'rgba(14,11,16,0.6)'; ctx.fill();
      ctx.strokeStyle = 'rgba(239,220,174,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = PAL.pearl; ctx.textAlign = 'center';
      ctx.fillText(label, v.width / 2, top + 25 * ui + 1);
    }
    // Connexion : point vert (en ligne) ou orange (reconnexion), nombre d'autres joueurs à l'étage
    if (this.net) {
      const on = this.net.state === 'online', txt2 = on ? `En ligne · ${this.net.others}` : 'Reconnexion…';
      ctx.font = font(11 * ui, 800);
      const w2 = ctx.measureText(txt2).width + 26 * ui, y2 = top + ph + (this.needs ? 66 : 46) * ui;
      roundRect(ctx, px, y2, w2, 22 * ui, 11 * ui); ctx.fillStyle = 'rgba(14,11,16,0.7)'; ctx.fill();
      ctx.fillStyle = on ? PAL.success : PAL.gold; ctx.beginPath(); ctx.arc(px + 11 * ui, y2 + 11 * ui, 4 * ui * (on ? 1 : 0.7 + Math.sin(t * 8) * 0.3), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.text; ctx.textAlign = 'left'; ctx.fillText(txt2, px + 19 * ui, y2 + 11.5 * ui);
      if (this.net.unread > 0 && this.chatBtn.visible) {
        const b = this.chatBtn;
        ctx.fillStyle = PAL.danger; ctx.beginPath(); ctx.arc(b.x + b.w - 6 * ui, b.y + 6 * ui, 9 * ui, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = font(10 * ui, 900); ctx.textAlign = 'center'; ctx.fillText(String(Math.min(9, this.net.unread)), b.x + b.w - 6 * ui, b.y + 6.5 * ui);
      }
    }
    ctx.restore();

    // Halo pulsant sur le bouton Interagir quand un objet est ciblé
    if (this.focusLabel) {
      const b = this.interactBtn, r = b.w / 2 + 4 + Math.sin(t * 5) * 3;
      ctx.save(); ctx.strokeStyle = 'rgba(212,175,90,0.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    this.layer.render(ctx, ui);
    // Pastille : missions à réclamer
    if (this.missionsReady > 0) {
      const b = this.missionsBtn;
      ctx.save(); ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(b.x + b.w - 6 * ui, b.y + 6 * ui, 9 * ui, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1208'; ctx.font = font(10 * ui, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.min(9, this.missionsReady)), b.x + b.w - 6 * ui, b.y + 6.5 * ui); ctx.restore();
    }
    this.levelUp.render(ctx, v.width, v.height, ui);
  }
}
