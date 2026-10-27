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
  readonly tableGame = 'crash';
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
  /** Éclats de l'explosion et fumée du réacteur (réutilisés). */
  private bits: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number }> = [];
  private flash = 0;
  private shake = 0;
  private tip = { x: 0, y: 0, a: 0 };

  /** Table partagée (en ligne) : manche suivie, mise posée pour le prochain départ. */
  private tableRound = -1;
  private tableBet = 0;

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
  canQuit() { return this.tableBet > 0 ? { ok: false as const, reason: 'Ta mise est posée : attends le départ et le vol' } : this.run && !this.run.crashed && this.run.cashed === null && this.run.bet > 0 ? { ok: false as const, reason: 'Encaisse ou attends la fin du vol' } : { ok: true as const }; }

  private cycleAuto(): void {
    if (this.run && !this.run.crashed) return;
    this.auto = AUTOS[(AUTOS.indexOf(this.auto) + 1) % AUTOS.length];
  }

  /** Vol commun d'une table en ligne : départ, altitude et écrasement suivent l'état diffusé par le serveur. */
  private syncTable(): void {
    const t = this.host.table, st = t?.state;
    if (!t || !st) return;
    const data = st.data as { elapsed: number; point: number | null; history: number[]; bets: Array<{ id: string; bet: number; cashed: number | null; mine: boolean }> };
    if (data.history?.length) this.history = data.history.slice(0, 10);
    const mine = data.bets?.find((b) => b.mine);
    if (st.phase === 'flying' && this.tableRound !== st.round) {
      this.tableRound = st.round;
      this.run = { t: data.elapsed, point: Infinity, bet: mine?.bet ?? 0, cashed: null, crashed: false, settled: false, poll: 0 };
      this.message = mine ? '' : 'Vol en cours : mise pour le prochain départ.';
      this.tableBet = 0;
    }
    if (st.phase === 'crashed' && this.run && this.tableRound === st.round && typeof data.point === 'number') this.run.point = data.point;
    if (mine?.cashed !== null && mine?.cashed !== undefined && this.run && this.run.cashed === null && this.tableRound === st.round) {
      const payout = Math.floor(mine.bet * mine.cashed);
      this.apply({ cashedAt: mine.cashed }, payout);
    }
  }

  private async main(): Promise<void> {
    const s = this.host.s;
    if (this.waiting) return;
    const table = this.host.table;
    if (table) {
      const flying = this.run && !this.run.crashed && table.state?.phase === 'flying';
      this.waiting = true;
      if (flying) {
        if (this.run!.bet <= 0 || this.run!.cashed !== null) { this.waiting = false; return; }
        const r = s.absorb('casino', 'crash', 'cashout', await table.act({ move: 'cashout' }));
        this.waiting = false;
        if (r.ok) this.apply(r.view, r.payout); else this.host.toasts.show(r.error, 'error');
        return;
      }
      const r = s.absorb('casino', 'crash', 'bet', await table.bet({ bet: this.betCtl.amount, auto: this.auto }));
      this.waiting = false;
      if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
      this.tableBet = this.betCtl.amount;
      this.message = 'Mise posée : départ commun à la fin du compte à rebours.';
      return;
    }
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
      s.audio.cashout();
      this.host.celebrate(payout - run.bet, run.bet, `Encaissé à ×${run.cashed.toFixed(2).replace('.', ',')}${view.auto ? ' (auto)' : ''}`);
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
    const s = this.host.s;
    if (this.host.table) this.syncTable();
    const r = this.run, shared = !!this.host.table;
    if (r && !r.crashed) {
      r.t += dt;
      // Interroge l'autorité 4 fois par seconde tant que le vol n'est pas réglé (en solo ; à une table, le serveur diffuse)
      r.poll += dt;
      if (!shared && !r.settled && !this.waiting && r.poll > 0.25) {
        r.poll = 0; this.waiting = true;
        void s.ask('casino', 'crash', 'status', {}).then((rep) => { this.waiting = false; if (rep.ok) this.apply(rep.view, rep.payout); });
      }
      if (r.cashed !== null && crashMultiplier(r.t) < r.cashed && r.settled) r.t = Math.max(r.t, timeToReach(r.cashed)); // affichage aligné sur l'encaissement
      if (crashMultiplier(r.t) >= r.point) {
        r.crashed = true;
        s.audio.boom(); this.explode();
        if (r.cashed === null && r.bet > 0) { this.message = `Écrasé à ×${r.point.toFixed(2).replace('.', ',')} : mise perdue`; this.host.celebrate(-r.bet, r.bet, `Écrasé à ×${r.point.toFixed(2).replace('.', ',')}`); }
        else if (r.bet <= 0) this.message = `Écrasé à ×${r.point.toFixed(2).replace('.', ',')}`;
        if (!shared) { this.history.unshift(r.point); this.history = this.history.slice(0, 10); }
      }
    }
    // Particules : fumée du réacteur pendant le vol, éclats après l'explosion
    if (r && !r.crashed && !s.lowFx && Math.random() < dt * 40) {
      const a = this.tip.a + Math.PI + (Math.random() - 0.5) * 0.4;
      this.bits.push({ x: this.tip.x, y: this.tip.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.7, max: 0.7, c: 'rgba(230,236,242,', r: 3 });
    }
    for (const b of this.bits) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 30 * dt; b.vx *= 0.98; }
    this.bits = this.bits.filter((b) => b.life > 0);
    this.flash = Math.max(0, this.flash - dt * 2.5); this.shake = Math.max(0, this.shake - dt * 2);
    // À une table : on ne peut encaisser que si l'on a misé sur ce vol ; spectateur, on prépare la mise suivante
    const flying = !!r && !r.crashed && (!shared || r.bet > 0);
    this.betCtl.locked = flying || this.tableBet > 0;
    this.betCtl.sync();
    const shown = r ? Math.min(crashMultiplier(r.t), r.point) : 1;
    const secs = Math.ceil((this.host.table?.endsIn ?? 0) / 1000);
    this.goBtn.label = flying ? (r!.cashed === null ? `Encaisser ×${shown.toFixed(2).replace('.', ',')}` : 'Encaissé ✓')
      : this.tableBet > 0 ? `Mise posée${secs > 0 ? ` · ${secs} s` : ''}` : shared ? `Miser · ${this.betCtl.amount}` : `Partir · ${this.betCtl.amount}`;
    this.goBtn.style = flying && r!.cashed === null ? 'primary' : 'gold';
    const tablePhase = this.host.table?.state?.phase;
    this.goBtn.enabled = flying ? r!.cashed === null && !r!.settled
      : this.tableBet > 0 ? false : !this.waiting && s.chips.canAfford(this.betCtl.amount) && (!shared || tablePhase === 'open' || tablePhase === 'betting');
    this.autoBtn.label = `Auto : ${this.auto === null ? 'non' : `×${String(this.auto).replace('.', ',')}`}`;
    this.autoBtn.enabled = !flying;
  }

  private explode(): void {
    const { x, y } = this.tip, n = this.host.s.lowFx ? 14 : 34;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
      this.bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.6 + Math.random() * 0.6, max: 1.2, c: Math.random() < 0.5 ? 'rgba(255,170,60,' : 'rgba(255,90,60,', r: 2 + Math.random() * 3 });
    }
    this.flash = 1; this.shake = 1;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, G = this.graph, r = this.run;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * this.shake * ui, (Math.random() - 0.5) * 8 * this.shake * ui);
    const mNow = r ? (r.crashed ? r.point : crashMultiplier(r.t)) : 1;
    // Ciel qui s'assombrit avec l'altitude : mer au crépuscule à ×1, nuit étoilée au-delà de ×5
    const alt = Math.min(1, Math.log(mNow) / Math.log(8));
    ctx.save();
    roundRect(ctx, G.x, G.y, G.w, G.h, 14 * ui); ctx.clip();
    const sky = ctx.createLinearGradient(0, G.y, 0, G.y + G.h);
    sky.addColorStop(0, alt > 0.5 ? '#050a1c' : '#0d1b3a'); sky.addColorStop(0.7, alt > 0.5 ? '#0d1b3a' : '#3a2a4a'); sky.addColorStop(1, alt > 0.5 ? '#1a1e3a' : '#8a4a3a');
    ctx.fillStyle = sky; ctx.fillRect(G.x, G.y, G.w, G.h);
    // Étoiles (apparaissent avec l'altitude), défilement lent
    ctx.fillStyle = `rgba(255,255,255,${0.2 + alt * 0.7})`;
    for (let i = 0; i < 40; i++) {
      const sx = G.x + ((i * 97 + (r ? r.t * 18 : 0) * (1 + (i % 3))) % G.w), sy = G.y + ((i * 53) % (G.h * 0.7));
      ctx.fillRect(G.w + G.x - (sx - G.x), sy, 1.5, 1.5);
    }
    // Mer au pied du graphique (descend quand on monte)
    const seaY = G.y + G.h - 18 * ui + alt * 30 * ui;
    ctx.fillStyle = '#0b3a5a'; ctx.beginPath(); ctx.moveTo(G.x, G.y + G.h);
    for (let x = G.x; x <= G.x + G.w; x += 12) ctx.lineTo(x, seaY + Math.sin(x / 30 + this.t * 2) * 3);
    ctx.lineTo(G.x + G.w, G.y + G.h); ctx.fill();
    ctx.restore();
    const tMax = Math.max(8, (r ? r.t : 0) + 1), mMax = Math.max(2, r ? crashMultiplier(r.t) * 1.15 : 2);
    const X = (t: number) => G.x + 40 * ui + (t / tMax) * (G.w - 60 * ui);
    const Y = (m: number) => G.y + G.h - 24 * ui - ((m - 1) / (mMax - 1)) * (G.h - 50 * ui);
    // Grille
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { const m = 1 + ((mMax - 1) * k) / 4; ctx.beginPath(); ctx.moveTo(G.x + 36 * ui, Y(m)); ctx.lineTo(G.x + G.w - 10 * ui, Y(m)); ctx.stroke(); drawLabel(ctx, `×${m.toFixed(1)}`, G.x + 30 * ui, Y(m), 10 * ui, PAL.textDim, 'right', 600); }
    if (r) {
      const end = r.crashed ? timeToReach(r.point) : r.t;
      const lost = r.crashed && r.cashed === null;
      // Surface sous la courbe, puis la courbe
      const pts: Array<[number, number]> = [];
      for (let t = 0; t <= end; t += end / 60 || 1) pts.push([X(t), Y(crashMultiplier(t))]);
      pts.push([X(end), Y(Math.min(crashMultiplier(end), r.point))]);
      const area = ctx.createLinearGradient(0, G.y, 0, G.y + G.h);
      area.addColorStop(0, lost ? 'rgba(255,107,107,0.35)' : 'rgba(31,199,193,0.35)'); area.addColorStop(1, 'rgba(31,199,193,0)');
      ctx.fillStyle = area; ctx.beginPath(); ctx.moveTo(pts[0][0], Y(1)); for (const [px, py] of pts) ctx.lineTo(px, py); ctx.lineTo(pts[pts.length - 1][0], Y(1)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = lost ? PAL.danger : PAL.turquoise; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); for (const [px, py] of pts) ctx.lineTo(px, py); ctx.stroke();
      // Bateau-fusée KS au bout de la courbe, orienté selon la pente
      const [bx, by] = pts[pts.length - 1], [qx, qy] = pts[Math.max(0, pts.length - 4)];
      const ang = Math.atan2(by - qy, bx - qx || 1);
      this.tip = { x: bx, y: by, a: ang };
      if (!r.crashed) drawRocket(ctx, bx, by, ang, 10 * ui, this.t);
      if (r.cashed !== null) {
        const ct = timeToReach(r.cashed);
        ctx.fillStyle = PAL.success; ctx.beginPath(); ctx.arc(X(ct), Y(r.cashed), 6 * ui, 0, Math.PI * 2); ctx.fill();
        drawPill(ctx, `Encaissé ×${r.cashed.toFixed(2).replace('.', ',')}`, X(ct), Y(r.cashed) - 18 * ui, 10 * ui, 'rgba(46,139,87,0.9)', '#fff');
      }
      // Multiplicateur : du blanc à l'or puis à l'orange quand il grimpe
      const m = mNow, hot = Math.min(1, (m - 1) / 9);
      const col = lost ? PAL.danger : hot < 0.3 ? PAL.text : hot < 0.7 ? '#ffd27a' : '#ff9a4a';
      const pulse = r.crashed ? 1 : 1 + Math.sin(this.t * 10) * 0.02 * Math.min(1, m / 3);
      ctx.save(); ctx.translate(G.x + G.w / 2, G.y + G.h * 0.32); ctx.scale(pulse, pulse);
      drawLabel(ctx, `×${m.toFixed(2).replace('.', ',')}`, 0, 0, 44 * ui, col, 'center', 900);
      ctx.restore();
      if (r.crashed) drawLabel(ctx, r.cashed === null ? 'ÉCRASÉ' : 'Écrasé — tu avais encaissé', G.x + G.w / 2, G.y + G.h * 0.32 + 36 * ui, 14 * ui, PAL.textDim);
    } else drawLabel(ctx, '×1,00', G.x + G.w / 2, G.y + G.h * 0.32, 44 * ui, PAL.textDim, 'center', 900);
    for (const b of this.bits) { ctx.fillStyle = `${b.c}${Math.max(0, b.life / b.max)})`; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * ui * (b.c.startsWith('rgba(230') ? 1 + (1 - b.life / b.max) * 2 : 1), 0, Math.PI * 2); ctx.fill(); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,200,120,${this.flash * 0.35})`; ctx.fillRect(G.x, G.y, G.w, G.h); }
    ctx.restore();
    this.history.forEach((m, i) => drawPill(ctx, `×${m.toFixed(2).replace('.', ',')}`, G.x + G.w - 40 * ui - i * 64 * ui, G.y + 16 * ui, 10 * ui, m >= 2 ? 'rgba(89,227,167,0.3)' : 'rgba(255,107,107,0.3)', PAL.text));
    if (this.message && !this.host.result.active) drawPill(ctx, this.message, G.x + G.w / 2, G.y + G.h - 40 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text, G.w - 20 * ui);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}

/** Petite fusée KS (coque blanche, hublot, ailerons dorés, flamme qui vacille). */
function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, s: number, t: number): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const fl = 0.8 + Math.sin(t * 40) * 0.2;
  const fg = ctx.createLinearGradient(-s * 2.6, 0, -s, 0); fg.addColorStop(0, 'rgba(255,120,40,0)'); fg.addColorStop(1, 'rgba(255,220,120,0.95)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-s, -s * 0.35); ctx.lineTo(-s * (1.6 + fl), 0); ctx.lineTo(-s, s * 0.35); ctx.fill();
  ctx.fillStyle = '#d4af5a'; ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.4); ctx.lineTo(-s * 1.1, -s * 0.85); ctx.lineTo(-s * 0.2, -s * 0.4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.4); ctx.lineTo(-s * 1.1, s * 0.85); ctx.lineTo(-s * 0.2, s * 0.4); ctx.fill();
  const body = ctx.createLinearGradient(0, -s * 0.45, 0, s * 0.45); body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#b8c2cc');
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(s * 1.1, 0); ctx.quadraticCurveTo(s * 0.5, -s * 0.5, -s, -s * 0.42); ctx.lineTo(-s, s * 0.42); ctx.quadraticCurveTo(s * 0.5, s * 0.5, s * 1.1, 0); ctx.fill();
  ctx.fillStyle = '#1fc7c1'; ctx.beginPath(); ctx.arc(s * 0.2, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
