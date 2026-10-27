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
  readonly tableGame = 'craps';
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
  /** Piste des dés (zone où ils roulent) et trajectoires du lancer en cours. */
  private pit = { x: 0, y: 0, w: 0, h: 0 };
  private throwT = -1;
  private paths: Array<{ sx: number; sy: number; wx: number; wy: number; ex: number; ey: number; spin: number; rest: number; hit: boolean; faces: number[] }> = [];
  private static readonly THROW = 1.05;
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
    const head = 34 * ui;   // place pour le buste du bâtonnier au-dessus du tapis (sans chevaucher l'en-tête)
    this.table = { x: a.x, y: a.y + head, w: a.w, h: a.h - ctrlH - 6 * ui - head };
    const rail = 14 * ui, F = { x: this.table.x + rail, y: this.table.y + rail, w: this.table.w - rail * 2, h: this.table.h - rail * 2 };
    const portrait = a.h > a.w;
    const zw = portrait ? F.w - 16 * ui : F.w * 0.56, zh = portrait ? Math.min(78 * ui, (F.h * 0.55 - 24 * ui) / 3) : (F.h - 24 * ui) / 3;
    this.zones = ZONES.map((z, i) => ({ bet: z.bet, x: F.x + 8 * ui, y: F.y + 8 * ui + i * (zh + 4 * ui), w: zw, h: zh }));
    const dx = portrait ? F.x + F.w / 2 : F.x + zw + (F.w - zw) / 2, dy0 = portrait ? F.y + 3 * (zh + 4 * ui) + 16 * ui : F.y;
    const dh = portrait ? F.y + F.h - dy0 : F.h;
    this.dealerPos = { x: dx, y: dy0 + dh * 0.32, k: Math.max(1, Math.min(1.6, dh / 140)) };
    this.dice = { cx: dx, cy: dy0 + dh * 0.62, s: Math.min(56 * ui, (portrait ? F.w : F.w - zw) * 0.22, dh * 0.22) };
    this.pit = portrait
      ? { x: F.x + 10 * ui, y: dy0 + dh * 0.3, w: F.w - 20 * ui, h: dh * 0.62 }
      : { x: F.x + zw + 22 * ui, y: F.y + dh * 0.3, w: F.w - zw - 32 * ui, h: dh * 0.62 };
    this.host.result.anchorX = (dx - a.x) / a.w; this.host.result.anchorY = (this.dice.cy - a.y) / a.h - 0.06;
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
      const r = await this.host.playRound('craps', 'play', { bets: { ...this.bets } }, this.staked, () => this.host.toasts.show('Mise acceptée : tirage commun à la fin du compte à rebours'));
      this.waiting = false;
      if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
      this.settled = { stake: r.stake, payout: r.payout };
      this.round = r.view.round as CrapsRound; this.revealed = 0; this.phase = 'play';
    }
    this.rolling = CrapsGame.THROW; this.dealer.play('deal', 0.8);
    this.startThrow();
    s.audio.diceShake();
  }

  private afterRoll(): void {
    const r = this.round!;
    this.revealed++;
    const [a, b] = r.rolls[this.revealed - 1], sum = a + b;
    if (this.revealed === 1 && this.bets.field) this.message = `${sum} : Field ${fieldReturn(sum) > 0 ? 'gagnant' : 'perdant'}`;
    if (this.revealed < r.rolls.length) {
      this.message = this.revealed === 1 ? `Le point est ${r.point}. Relance pour le refaire avant un 7 !` : `${sum} · le point reste ${r.point}`;
      return;
    }
    const ret = this.settled.payout, net = ret - this.settled.stake;
    const what = r.outcome === 'pass' ? (r.point ? `Point ${r.point} refait` : `${sum} : naturel`) : r.outcome === 'push12' ? '12 : Pass perd, Don’t Pass rendu' : r.point ? '7 avant le point' : `${sum} : craps`;
    this.message = `${what} · ${net > 0 ? `+${net}` : net === 0 ? 'mise rendue' : net} jetons`;
    this.host.celebrate(net, this.settled.stake, what);
    this.dealer.play(net > 0 ? 'congrats' : net < 0 ? 'collect' : 'pay', 1.4);
    this.bets = {};
    this.phase = 'done';
  }

  /** Prépare les trajectoires des deux dés (purement visuelles : les valeurs viennent de l'autorité). */
  private startThrow(): void {
    const P = this.pit, D = this.dice;
    this.throwT = this.t;
    this.paths = [0, 1].map((i) => {
      const side = i === 0 ? -1 : 1;
      const ex = D.cx + side * D.s * (0.55 + Math.random() * 0.35), ey = D.cy + (Math.random() - 0.5) * D.s * 0.5;
      const faces = Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * 6));
      return {
        sx: P.x + P.w * (0.65 + i * 0.2), sy: P.y + P.h + D.s * 0.4,
        wx: P.x + P.w * (0.35 + i * 0.25 + (Math.random() - 0.5) * 0.1), wy: P.y + D.s * 0.6,
        ex: Math.max(P.x + D.s, Math.min(P.x + P.w - D.s, ex)), ey,
        spin: (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 8), rest: (Math.random() - 0.5) * 0.5, hit: false, faces,
      };
    });
  }

  update(dt: number): void {
    this.t += dt;
    this.dealer.update(dt);
    if (this.rolling > 0) {
      this.rolling -= dt;
      // Choc contre la bande du fond, puis petits rebonds sur le tapis : sons synchronisés avec les trajectoires
      const k = this.t - this.throwT;
      for (const p of this.paths) if (!p.hit && k >= CrapsGame.THROW * 0.32) { p.hit = true; this.host.s.audio.diceHit(1); }
      if (Math.floor(k / 0.13) !== Math.floor((k - dt) / 0.13) && k > CrapsGame.THROW * 0.4 && k < CrapsGame.THROW * 0.85) this.host.s.audio.diceHit(0.35);
      if (this.rolling <= 0) { this.rolling = 0; this.afterRoll(); }
    }
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
    this.dealer.render(ctx, P.x, this.table.y + 2 * ui, Math.min(P.k, 1.2), ui);
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
    // Piste des dés : bande du fond à pyramides (comme sur une vraie table de craps)
    const Pt = this.pit;
    ctx.save();
    ctx.strokeStyle = 'rgba(239,220,174,0.35)'; ctx.lineWidth = 1.2; ctx.setLineDash([6 * ui, 5 * ui]);
    roundRect(ctx, Pt.x, Pt.y, Pt.w, Pt.h, 10 * ui); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = Pt.x + 4 * ui; x < Pt.x + Pt.w - 8 * ui; x += 12 * ui) { ctx.beginPath(); ctx.moveTo(x, Pt.y + 2); ctx.lineTo(x + 6 * ui, Pt.y + 8 * ui); ctx.lineTo(x + 12 * ui, Pt.y + 2); ctx.fill(); }
    ctx.restore();
    // Dés : lancés depuis le bord du joueur, rebond sur la bande du fond, roulent puis s'immobilisent sur leur valeur
    const D = this.dice;
    const final = this.round && this.revealed > 0 ? this.round.rolls[this.revealed - 1] : [1, 1];
    let v1 = final[0], v2 = final[1];
    if (this.rolling > 0 && this.round) [v1, v2] = this.round.rolls[this.revealed];
    for (let i = 0; i < 2; i++) {
      const fv = i === 0 ? v1 : v2;
      let x = D.cx + (i === 0 ? -1 : 1) * D.s * 0.65, y = D.cy, ang = i === 0 ? -0.15 : 0.2, val = fv, lift = 0;
      const p = this.paths[i];
      if (this.rolling > 0 && p) {
        const k = Math.min(1, (this.t - this.throwT) / CrapsGame.THROW), hitK = 0.32;
        if (k < hitK) {
          const q = k / hitK;
          x = p.sx + (p.wx - p.sx) * q; y = p.sy + (p.wy - p.sy) * q; lift = Math.sin(q * Math.PI) * 0.35;
        } else {
          const q = (k - hitK) / (1 - hitK), e = 1 - Math.pow(1 - q, 3);
          x = p.wx + (p.ex - p.wx) * e; y = p.wy + (p.ey - p.wy) * e; lift = Math.abs(Math.sin(q * Math.PI * 3)) * 0.12 * (1 - q);
        }
        ang = p.rest + p.spin * (1 - k) * (1 - k);
        // Faces qui défilent pendant la course, valeur définitive sur la fin
        val = k > 0.82 ? fv : p.faces[Math.floor(k * 18) % p.faces.length];
      } else if (p && this.revealed > 0) { x = p.ex; y = p.ey; ang = p.rest; }
      const sz = D.s * (1 + lift);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + 3, y + D.s * 0.55 + lift * D.s * 0.6, D.s * 0.5, D.s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      drawDie(ctx, val, x, y - lift * D.s * 0.8, sz, ang);
    }
    // Palet ON/OFF du point (blanc sur le numéro du point, noir quand il n'y en a pas)
    const puckOn = !!(this.round?.point && this.phase === 'play' && this.revealed > 0 && this.rolling === 0);
    const px = Pt.x + Pt.w - 22 * ui, py = Pt.y + 22 * ui, pr = 15 * ui;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(px + 2, py + 3, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = puckOn ? '#fbfaf7' : '#141218'; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = puckOn ? '#111827' : 'rgba(239,220,174,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    drawLabel(ctx, puckOn ? 'ON' : 'OFF', px, py, 10 * ui, puckOn ? '#111827' : LUXE.ivory, 'center', 900);
    if (this.round?.point && this.phase === 'play' && this.revealed > 0) drawPill(ctx, `POINT ${this.round.point}`, D.cx, D.cy - D.s - 20 * ui, 14 * ui, '#fbfaf7', '#111827');
    if (this.round && this.revealed > 0 && this.rolling === 0) drawPill(ctx, `Total ${v1 + v2}`, D.cx, D.cy + D.s + 6 * ui, 13 * ui, 'rgba(0,0,0,0.55)', LUXE.champagne);
    if (this.message && !this.host.result.active) drawPill(ctx, this.message, D.cx, D.cy + D.s + 38 * ui, 12 * ui, 'rgba(14,11,16,0.9)', PAL.text, Pt.w + 40 * ui);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
