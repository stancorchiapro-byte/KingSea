// Craps : Pass Line, Don't Pass et Field. Le joueur lance les dés lui-même, coup après coup.
// La séquence complète est tirée au départ (logic/craps.ts) ; chaque lancer la dévoile.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { fieldReturn, type CrapsBet, type CrapsRound } from './logic/craps';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawDie, drawLabel, drawPill } from './widgets';
import { BetControl, Dealer, drawTable } from './casinoKit';
import { drawChipStack, LUXE } from '../art/brand';

const ZONES: Array<{ bet: CrapsBet; label: string; sub: string; color: string }> = [
  { bet: 'pass', label: 'PASS LINE', sub: '7 ou 11 au premier lancer, puis refaire le point', color: '#2e8b57' },
  { bet: 'dontpass', label: 'DON’T PASS', sub: 'l’inverse ; 12 au premier lancer : mise rendue', color: '#8a1c1c' },
  { bet: 'field', label: 'FIELD', sub: '2·3·4·9·10·11·12 au 1er lancer · 2 et 12 paient 2:1', color: '#1f6fd1' },
];

export class CrapsGame implements MiniGame {
  readonly id = 'craps';
  readonly title = 'Craps';
  readonly bg: [string, string] = ['#062a18', '#020c07'];
  readonly currency = 'chips' as const;
  readonly rules =
    'Pose tes jetons puis lance les deux dés.\n• Pass Line : 7 ou 11 au premier lancer gagne, 2, 3 ou 12 perd. Sinon le total devient « le point » : il faut le refaire avant un 7.\n' +
    '• Don’t Pass : l’inverse (12 au premier lancer : mise rendue).\n• Field : un seul lancer ; 3, 4, 9, 10, 11 paient 1:1, 2 et 12 paient 2:1.\nGains 1:1 sur Pass et Don’t Pass.';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private bets: Partial<Record<CrapsBet, number>> = {};
  private round: CrapsRound | null = null;
  private settled = { stake: 0, payout: 0 };
  private waiting = false;
  private revealed = 0;
  private rolling = 0;
  private phase: 'bet' | 'play' | 'done' = 'bet';
  private message = 'Pose tes jetons, puis lance les dés.';
  private zones: Array<{ bet: CrapsBet; x: number; y: number; w: number; h: number }> = [];
  private rollBtn!: Button;
  private table = { x: 0, y: 0, w: 0, h: 0 };
  private dealer = new Dealer('Bâtonnier · Hugo', { skin: '#a8714a', hair: '#1c1412', hairStyle: 'court', outfit: 'croupier', color: '#0f3a2a', accent: '#d4af5a', hat: 'aucun', glasses: false });
  private dealerPos = { x: 0, y: 0, k: 1.2 };
  private zoneHandler: PointerHandler = { onDown: (p) => this.tapZone(p) };
  private dice = { cx: 0, cy: 0, s: 40 };
  private t = 0;

  get holdBalance(): boolean { return this.phase === 'play' || this.waiting; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [1, 5, 25, 100], min: 1, initial: 5, mode: 'chip', onDouble: () => this.doubleBets() });
    this.rollBtn = makeButton({ id: 'roll', label: 'Lancer les dés', style: 'gold', fontSize: 17, onTap: () => this.roll() });
    this.clearBtn = makeButton({ id: 'clear', label: 'Effacer', style: 'secondary', fontSize: 15, onTap: () => { if (this.phase !== 'play' && this.rolling === 0) this.bets = {}; } });
    this.rebetBtn = makeButton({ id: 'rebet', label: 'Rejouer', style: 'secondary', fontSize: 15, onTap: () => { const t = Object.values(this.lastBets).reduce((a, b) => a + (b ?? 0), 0); if (this.phase !== 'play' && this.staked === 0 && t > 0 && t <= host.s.chips.balance) { this.bets = { ...this.lastBets }; host.s.audio.chip(); } } });
    this.layer.buttons = [...this.betCtl.buttons, this.clearBtn, this.rebetBtn, this.rollBtn];
  }

  private clearBtn!: Button;
  private rebetBtn!: Button;
  private lastBets: Partial<Record<CrapsBet, number>> = {};

  /** ×2 : double toutes les mises posées (si le solde le permet). */
  private doubleBets(): void {
    if (this.staked <= 0) return;
    if (this.staked * 2 > this.host.s.chips.balance) { this.host.toasts.show('Pas assez de jetons pour doubler', 'error'); return; }
    for (const k of Object.keys(this.bets) as Array<keyof typeof this.bets>) this.bets[k] = (this.bets[k] ?? 0) * 2;
    this.host.s.audio.chip();
  }

  private get staked(): number { return (this.bets.pass ?? 0) + (this.bets.dontpass ?? 0) + (this.bets.field ?? 0); }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui, ctrlH = this.betCtl.layout(a, ui, [[this.clearBtn, 96], [this.rebetBtn, 100], [this.rollBtn, 150]]);
    // Table de craps : zones imprimées sur le tapis à gauche, piste des dés et bâtonnier (croupier) à droite
    this.table = { x: a.x, y: a.y + 4 * ui, w: a.w, h: a.h - ctrlH - 10 * ui };
    const rail = 14 * ui, F = { x: this.table.x + rail, y: this.table.y + rail, w: this.table.w - rail * 2, h: this.table.h - rail * 2 };
    const portrait = a.h > a.w;
    const zw = portrait ? F.w - 16 * ui : F.w * 0.56, zh = portrait ? Math.min(78 * ui, (F.h * 0.55 - 24 * ui) / 3) : (F.h - 24 * ui) / 3;
    this.zones = ZONES.map((z, i) => ({ bet: z.bet, x: F.x + 8 * ui, y: F.y + 8 * ui + i * (zh + 4 * ui), w: zw, h: zh }));
    const dx = portrait ? F.x + F.w / 2 : F.x + zw + (F.w - zw) / 2, dy0 = portrait ? F.y + 3 * (zh + 4 * ui) + 16 * ui : F.y;
    const dh = portrait ? F.y + F.h - dy0 : F.h;
    this.dealerPos = { x: dx, y: dy0 + dh * 0.32, k: Math.max(1, Math.min(1.6, dh / 140)) };
    this.dice = { cx: dx, cy: dy0 + dh * 0.62, s: Math.min(56 * ui, (portrait ? F.w : F.w - zw) * 0.22, dh * 0.22) };
  }

  handlers(): PointerHandler[] { return [this.zoneHandler, this.layer]; }
  canQuit() { return this.phase === 'play' ? { ok: false as const, reason: 'Termine la manche (lance les dés jusqu’au résultat)' } : { ok: true as const }; }

  private tapZone(p: PointerInfo): boolean {
    const z = this.zones.find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
    if (!z) return false;
    if (this.phase === 'play') return true;
    if (this.phase === 'done') { this.phase = 'bet'; this.round = null; this.revealed = 0; }
    if (this.staked + this.betCtl.amount > this.host.s.chips.balance) { this.host.toasts.show('Mises supérieures à ton solde', 'error'); return true; }
    this.bets[z.bet] = (this.bets[z.bet] ?? 0) + this.betCtl.amount;
    this.host.s.audio.chip();
    return true;
  }

  private async roll(): Promise<void> {
    const s = this.host.s;
    if (this.rolling > 0 || this.waiting) return;
    if (this.phase !== 'play') {
      if (this.staked <= 0) return;
      // Tous les lancers de la manche sont tirés par l'autorité ; chaque toucher en révèle un.
      this.waiting = true;
      this.lastBets = { ...this.bets };
      const r = await s.ask('casino', 'craps', 'play', { bets: { ...this.bets } });
      this.waiting = false;
      if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
      this.settled = { stake: r.stake, payout: r.payout };
      this.round = r.view.round as CrapsRound; this.revealed = 0; this.phase = 'play';
    }
    this.rolling = 0.8; this.dealer.play('deal', 0.8);
    s.audio.roll();
  }

  private afterRoll(): void {
    const r = this.round!, s = this.host.s;
    this.revealed++;
    const [a, b] = r.rolls[this.revealed - 1], sum = a + b;
    if (this.revealed === 1 && this.bets.field) this.message = `${sum} : Field ${fieldReturn(sum) > 0 ? 'gagnant' : 'perdant'}`;
    if (this.revealed < r.rolls.length) {
      this.message = this.revealed === 1 ? `Le point est ${r.point}. Relance pour le refaire avant un 7 !` : `${sum} · le point reste ${r.point}`;
      s.audio.knock(0.5);
      return;
    }
    const ret = this.settled.payout, net = ret - this.settled.stake;
    const what = r.outcome === 'pass' ? (r.point ? `Point ${r.point} refait` : `${sum} : naturel`) : r.outcome === 'push12' ? '12 : Pass perd, Don’t Pass rendu' : r.point ? '7 avant le point' : `${sum} : craps`;
    this.message = `${what} · ${net > 0 ? `+${net}` : net === 0 ? 'mise rendue' : net} jetons`;
    if (net > 0) s.audio.win(); else if (net < 0) s.audio.lose();
    this.dealer.play(net > 0 ? 'congrats' : net < 0 ? 'collect' : 'pay', 1.4);
    this.bets = {};
    this.phase = 'done';
  }

  update(dt: number): void {
    this.t += dt;
    this.dealer.update(dt);
    if (this.rolling > 0) { this.rolling -= dt; if (this.rolling <= 0) { this.rolling = 0; this.afterRoll(); } }
    this.betCtl.locked = this.phase === 'play';
    this.betCtl.engaged = this.staked;
    this.betCtl.sync();
    this.clearBtn.enabled = this.phase !== 'play' && this.rolling === 0 && this.staked > 0;
    this.rebetBtn.enabled = this.phase !== 'play' && this.rolling === 0 && this.staked === 0 && Object.keys(this.lastBets).length > 0;
    this.rollBtn.enabled = this.rolling === 0 && !this.waiting && (this.phase === 'play' || this.staked > 0);
    this.rollBtn.label = this.phase === 'play' ? 'Relancer les dés' : this.staked > 0 ? `Lancer · ${this.staked}` : 'Lancer les dés';
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, P = this.dealerPos;
    // Le bâtonnier derrière la piste des dés (dessiné avant la table : seul son buste dépasse)
    this.dealer.render(ctx, P.x, Math.min(P.y, this.table.y + 2 * ui), P.k, ui);
    drawTable(ctx, this.table, ui, 'green', 'rect');
    this.zones.forEach((z, i) => {
      const Z = ZONES[i];
      roundRect(ctx, z.x, z.y, z.w, z.h, 10 * ui); ctx.fillStyle = Z.color; ctx.globalAlpha = 0.32; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(239,220,174,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      drawLabel(ctx, Z.label, z.x + 12 * ui, z.y + z.h * 0.36, 15 * ui, LUXE.ivory, 'left');
      drawLabel(ctx, Z.sub, z.x + 12 * ui, z.y + z.h * 0.7, 10 * ui, 'rgba(239,220,174,0.85)', 'left', 600);
      const amt = this.bets[z.bet] ?? (this.phase === 'play' || this.rolling > 0 ? this.lastBets[z.bet] : undefined);
      if (amt) { drawChipStack(ctx, z.x + z.w - 26 * ui, z.y + z.h * 0.72, Math.min(z.h * 0.26, 15 * ui), amt, 6); drawLabel(ctx, String(amt), z.x + z.w - 50 * ui, z.y + z.h / 2, 12 * ui, LUXE.champagne, 'right'); }
    });
    // Dés
    const D = this.dice;
    let v1 = 1, v2 = 1, a1 = 0, a2 = 0;
    if (this.rolling > 0) { v1 = 1 + Math.floor((this.t * 17) % 6); v2 = 1 + Math.floor((this.t * 13 + 3) % 6); a1 = this.t * 9; a2 = -this.t * 7; }
    else if (this.round && this.revealed > 0) [v1, v2] = this.round.rolls[this.revealed - 1];
    const off = this.rolling > 0 ? Math.sin(this.t * 30) * 6 : 0;
    drawDie(ctx, v1, D.cx - D.s * 0.65, D.cy + off, D.s, a1);
    drawDie(ctx, v2, D.cx + D.s * 0.65, D.cy - off, D.s, a2);
    if (this.round?.point && this.phase === 'play' && this.revealed > 0) drawPill(ctx, `POINT ${this.round.point}`, D.cx, D.cy - D.s - 20 * ui, 14 * ui, '#fbfaf7', '#111827');
    if (this.round && this.revealed > 0 && this.rolling === 0) drawLabel(ctx, `Total ${v1 + v2}`, D.cx, D.cy + D.s, 15 * ui, PAL.text);
    if (this.message) drawPill(ctx, this.message, D.cx, D.cy + D.s + 34 * ui, 12 * ui, 'rgba(14,11,16,0.9)', PAL.text);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
