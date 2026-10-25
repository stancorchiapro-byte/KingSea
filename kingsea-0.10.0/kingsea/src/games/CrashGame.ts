// Crash : mise, le multiplicateur grimpe… encaisse avant qu'il ne s'écrase !
// Le point d'écrasement est tiré par l'autorité au départ et reste secret ; le téléphone interroge l'autorité
// pendant le vol (« status ») et lui demande d'encaisser : c'est elle qui décide de l'heure exacte.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { crashMultiplier, timeToReach } from './logic/crash';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';
import { BetControl } from './casinoKit';

const AUTOS: Array<number | null> = [null, 1.5, 2, 3, 5, 10];

export class CrashGame implements MiniGame {
  readonly id = 'crash';
  readonly title = 'Crash';
  readonly bg: [string, string] = ['#12100f', '#050404'];
  readonly currency = 'chips' as const;
  readonly rules =
    'Mise puis « Partir » : le multiplicateur monte depuis ×1,00. Touche « Encaisser » avant qu’il ne s’écrase pour gagner mise × multiplicateur.\n' +
    'S’il s’écrase avant, la mise est perdue. Option : encaissement automatique à un multiplicateur choisi (utile aussi si l’application est fermée).\nTaux de retour théorique : 97 %, quelle que soit ta stratégie.';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private auto: number | null = null;
  /** Vol en cours. point = Infinity tant que l'autorité ne l'a pas révélé. */
  private run: { t: number; point: number; bet: number; cashed: number | null; crashed: boolean; settled: boolean; poll: number } | null = null;
  private waiting = false;
  private history: number[] = [];
  private message = 'Choisis ta mise, puis « Partir ».';
  private graph = { x: 0, y: 0, w: 0, h: 0 };
  private goBtn!: Button;
  private autoBtn!: Button;
  private t = 0;

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [5, 10, 25, 100], min: 1, initial: 10 });
    this.goBtn = makeButton({ id: 'go', label: 'Partir', style: 'gold', fontSize: 18, onTap: () => this.main() });
    this.autoBtn = makeButton({ id: 'auto', label: 'Auto : non', style: 'secondary', fontSize: 14, onTap: () => this.cycleAuto() });
    this.layer.buttons = [...this.betCtl.buttons, this.autoBtn, this.goBtn];
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui, ctrlH = this.betCtl.layout(a, ui, [[this.autoBtn, 120], [this.goBtn, 200]]);
    this.graph = { x: a.x, y: a.y, w: a.w, h: a.h - ctrlH - 12 * ui };
  }

  handlers(): PointerHandler[] { return [this.layer]; }
  canQuit() { return this.run && !this.run.crashed && this.run.cashed === null ? { ok: false as const, reason: 'Encaisse ou attends la fin du vol' } : { ok: true as const }; }

  private cycleAuto(): void {
    if (this.run && !this.run.crashed) return;
    this.auto = AUTOS[(AUTOS.indexOf(this.auto) + 1) % AUTOS.length];
  }

  private async main(): Promise<void> {
    const s = this.host.s;
    if (this.waiting) return;
    if (this.run && !this.run.crashed) { if (this.run.cashed === null && !this.run.settled) void this.cashOut(); return; }
    this.waiting = true;
    const r = await s.ask('casino', 'crash', 'start', { bet: this.betCtl.amount, auto: this.auto });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    this.run = { t: 0, point: Infinity, bet: r.stake, cashed: null, crashed: false, settled: false, poll: 0 };
    this.message = '';
  }

  /** Applique une réponse de l'autorité (état du vol, encaissement, écrasement). */
  private apply(view: Record<string, unknown>, payout: number): void {
    const run = this.run, s = this.host.s;
    if (!run) return;
    if (typeof view.point === 'number') run.point = view.point;
    if (typeof view.cashedAt === 'number' && run.cashed === null) {
      run.cashed = view.cashedAt; run.settled = true;
      this.message = `Encaissé à ×${run.cashed.toFixed(2).replace('.', ',')}${view.auto ? ' (auto)' : ''} : +${payout} jetons`;
      s.audio.win();
    }
    if (view.crashed) run.settled = true;
  }

  private async cashOut(): Promise<void> {
    const run = this.run;
    if (!run || this.waiting) return;
    this.waiting = true;
    const r = await this.host.s.ask('casino', 'crash', 'cashout', {});
    this.waiting = false;
    if (r.ok) this.apply(r.view, r.payout);
    else this.host.toasts.show(r.error, 'error');
  }

  update(dt: number): void {
    this.t += dt;
    const s = this.host.s, r = this.run;
    if (r && !r.crashed) {
      r.t += dt;
      // Interroge l'autorité 4 fois par seconde tant que le vol n'est pas réglé
      r.poll += dt;
      if (!r.settled && !this.waiting && r.poll > 0.25) {
        r.poll = 0; this.waiting = true;
        void s.ask('casino', 'crash', 'status', {}).then((rep) => { this.waiting = false; if (rep.ok) this.apply(rep.view, rep.payout); });
      }
      if (r.cashed !== null && crashMultiplier(r.t) < r.cashed && r.settled) r.t = Math.max(r.t, timeToReach(r.cashed)); // affichage aligné sur l'encaissement
      if (crashMultiplier(r.t) >= r.point) {
        r.crashed = true;
        if (r.cashed === null) { this.message = `Écrasé à ×${r.point.toFixed(2).replace('.', ',')} : mise perdue`; s.audio.lose(); }
        this.history.unshift(r.point); this.history = this.history.slice(0, 10);
      }
    }
    const flying = !!r && !r.crashed;
    this.betCtl.locked = flying;
    this.betCtl.sync();
    const shown = r ? Math.min(crashMultiplier(r.t), r.point) : 1;
    this.goBtn.label = flying ? (r!.cashed === null ? `Encaisser ×${shown.toFixed(2).replace('.', ',')}` : 'Encaissé ✓') : `Partir · ${this.betCtl.amount}`;
    this.goBtn.style = flying && r!.cashed === null ? 'primary' : 'gold';
    this.goBtn.enabled = flying ? r!.cashed === null && !r!.settled : !this.waiting && s.chips.canAfford(this.betCtl.amount);
    this.autoBtn.label = `Auto : ${this.auto === null ? 'non' : `×${String(this.auto).replace('.', ',')}`}`;
    this.autoBtn.enabled = !flying;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, G = this.graph, r = this.run;
    roundRect(ctx, G.x, G.y, G.w, G.h, 14 * ui); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    const tMax = Math.max(8, (r ? r.t : 0) + 1), mMax = Math.max(2, r ? crashMultiplier(r.t) * 1.15 : 2);
    const X = (t: number) => G.x + 40 * ui + (t / tMax) * (G.w - 60 * ui);
    const Y = (m: number) => G.y + G.h - 24 * ui - ((m - 1) / (mMax - 1)) * (G.h - 50 * ui);
    // Grille
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { const m = 1 + ((mMax - 1) * k) / 4; ctx.beginPath(); ctx.moveTo(G.x + 36 * ui, Y(m)); ctx.lineTo(G.x + G.w - 10 * ui, Y(m)); ctx.stroke(); drawLabel(ctx, `×${m.toFixed(1)}`, G.x + 30 * ui, Y(m), 10 * ui, PAL.textDim, 'right', 600); }
    if (r) {
      const end = r.crashed ? timeToReach(r.point) : r.t;
      ctx.strokeStyle = r.crashed && r.cashed === null ? PAL.danger : PAL.turquoise; ctx.lineWidth = 3;
      ctx.beginPath(); for (let t = 0; t <= end; t += end / 60 || 1) ctx.lineTo(X(t), Y(crashMultiplier(t))); ctx.lineTo(X(end), Y(Math.min(crashMultiplier(end), r.point))); ctx.stroke();
      // Bateau-fusée KS au bout de la courbe
      const bx = X(end), by = Y(Math.min(crashMultiplier(end), r.point));
      ctx.fillStyle = r.crashed && r.cashed === null ? PAL.danger : PAL.gold; ctx.beginPath(); ctx.arc(bx, by, 7 * ui, 0, Math.PI * 2); ctx.fill();
      if (r.cashed !== null) { const ct = timeToReach(r.cashed); ctx.fillStyle = PAL.success; ctx.beginPath(); ctx.arc(X(ct), Y(r.cashed), 6 * ui, 0, Math.PI * 2); ctx.fill(); }
      const m = r.crashed ? r.point : crashMultiplier(r.t);
      drawLabel(ctx, `×${m.toFixed(2).replace('.', ',')}`, G.x + G.w / 2, G.y + G.h * 0.32, 44 * ui, r.crashed && r.cashed === null ? PAL.danger : PAL.text, 'center', 900);
      if (r.crashed) drawLabel(ctx, r.cashed === null ? 'ÉCRASÉ' : 'Écrasé — tu avais encaissé', G.x + G.w / 2, G.y + G.h * 0.32 + 36 * ui, 14 * ui, PAL.textDim);
    } else drawLabel(ctx, '×1,00', G.x + G.w / 2, G.y + G.h * 0.32, 44 * ui, PAL.textDim, 'center', 900);
    this.history.forEach((m, i) => drawPill(ctx, `×${m.toFixed(2).replace('.', ',')}`, G.x + G.w - 40 * ui - i * 64 * ui, G.y + 16 * ui, 10 * ui, m >= 2 ? 'rgba(89,227,167,0.3)' : 'rgba(255,107,107,0.3)', PAL.text));
    if (this.message) drawPill(ctx, this.message, G.x + G.w / 2, G.y + G.h - 40 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
