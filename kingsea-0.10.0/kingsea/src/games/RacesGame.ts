// Courses de chevaux : mise sur un ou plusieurs chevaux à cote fixe, puis course animée.
// L'ordre d'arrivée est tiré au départ selon les probabilités affichées ; l'animation le respecte.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { clamp } from '../engine/math';
import { ButtonLayer, font, makeButton, type Button } from '../ui/UIKit';
import { type Horse } from './logic/races';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawChip, drawLabel, drawPill } from './widgets';
import { BetControl } from './casinoKit';

const RACE_TIME = 7;

export class RacesGame implements MiniGame {
  readonly id = 'races';
  readonly tableGame = 'races';
  readonly title = 'Courses de chevaux';
  readonly bg: [string, string] = ['#0f3a1a', '#041008'];
  readonly currency = 'chips' as const;
  readonly rules =
    'Six chevaux, cotes fixes affichées avant le départ (gain = mise × cote si ton cheval gagne).\nTouche un cheval pour poser le jeton choisi, plusieurs chevaux possibles, puis « Départ ».\n' +
    'Les favoris (petite cote) gagnent plus souvent ; les cotes intègrent une marge de la maison d’environ 6 %.';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private field: Horse[] = [];
  private bets: Record<number, number> = {};
  private order: number[] = [];
  private finishTimes: number[] = [];
  private t = 0;
  private raceT = 0;
  private phase: 'bet' | 'race' | 'done' = 'bet';
  private settled = { stake: 0, payout: 0 };
  private waiting = false;
  private message = 'Touche un cheval pour miser.';
  private rows: Array<{ x: number; y: number; w: number; h: number }> = [];
  private track = { x: 0, y: 0, w: 0, h: 0 };
  private startBtn!: Button;
  private rowHandler: PointerHandler = { onDown: (p) => this.tapRow(p) };

  get holdBalance(): boolean { return this.phase === 'race' || this.waiting; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [5, 10, 25, 100], min: 1, initial: 10, mode: 'chip', onDouble: () => this.doubleBets() });
    this.startBtn = makeButton({ id: 'start', label: 'Départ', style: 'gold', fontSize: 17, onTap: () => this.start() });
    this.clearBtn = makeButton({ id: 'clear', label: 'Effacer', style: 'secondary', fontSize: 14, onTap: () => { if (this.phase === 'bet') { this.bets = {}; host.s.audio.back(); } } });
    this.rebetBtn = makeButton({ id: 'rebet', label: 'Rejouer', style: 'secondary', fontSize: 14, onTap: () => this.rebet() });
    this.layer.buttons = [...this.betCtl.buttons, this.clearBtn, this.rebetBtn, this.startBtn];
    void this.newRace();
  }

  private clearBtn!: Button;
  private rebetBtn!: Button;
  private lastBets: Record<number, number> = {};

  private doubleBets(): void {
    if (this.phase !== 'bet' || this.staked <= 0) return;
    if (this.staked * 2 > this.host.s.chips.balance) { this.host.toasts.show('Pas assez de jetons pour doubler', 'error'); return; }
    for (const k of Object.keys(this.bets)) this.bets[+k] *= 2;
    this.host.s.audio.chip();
  }

  /** Remet les mêmes montants sur les mêmes numéros de couloir que la course précédente. */
  private rebet(): void {
    if (this.phase !== 'bet') return;
    const total = Object.values(this.lastBets).reduce((a, b) => a + b, 0);
    if (!total) return;
    if (total > this.host.s.chips.balance) { this.host.toasts.show('Pas assez de jetons', 'error'); return; }
    this.bets = { ...this.lastBets };
    this.host.s.audio.chip();
  }

  private get staked(): number { return Object.values(this.bets).reduce((a, b) => a + b, 0); }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui, ctrlH = this.betCtl.layout(a, ui, [[this.clearBtn, 96], [this.rebetBtn, 100], [this.startBtn, 150]]);
    const listW = Math.min(300 * ui, a.w * 0.38), h = a.h - ctrlH - 10 * ui;
    const rh = h / 6;
    this.rows = this.field.map((_, i) => ({ x: a.x, y: a.y + i * rh, w: listW, h: rh - 4 * ui }));
    this.track = { x: a.x + listW + 12 * ui, y: a.y, w: a.w - listW - 12 * ui, h };
  }

  handlers(): PointerHandler[] { return [this.rowHandler, this.layer]; }
  canQuit() { return this.phase === 'race' ? { ok: false as const, reason: 'La course est partie !' } : { ok: true as const }; }

  private tapRow(p: PointerInfo): boolean {
    const i = this.rows.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (i < 0) return false;
    if (this.phase === 'race' || this.waiting || !this.field.length) return true;
    if (this.phase === 'done') { void this.newRace(); return true; }
    if (this.staked + this.betCtl.amount > this.host.s.chips.balance) { this.host.toasts.show('Mises supérieures à ton solde', 'error'); return true; }
    this.bets[i] = (this.bets[i] ?? 0) + this.betCtl.amount;
    this.host.s.audio.chip();
    return true;
  }

  /** Partants et cotes fixés par l'autorité (impossible de modifier les cotes depuis le téléphone). */
  private async newRace(): Promise<void> {
    if (this.waiting) return;
    // Table en ligne : les partants sont ceux de la manche commune (fixés par le serveur)
    const t = this.host.table;
    if (t) {
      const tf = t.state?.phase !== 'show' ? t.state?.data.field as Horse[] | null | undefined : null;
      if (!tf) { this.message = 'Course en cours à la table : les prochains partants arrivent…'; setTimeout(() => void this.newRace(), 1200); return; }
      const first = this.field.length === 0;
      this.field = tf; this.bets = {}; this.order = []; this.phase = 'bet'; this.raceT = 0;
      this.message = first ? 'Touche un cheval pour miser (course commune à la table).' : 'Nouvelle course commune : touche un cheval pour miser.';
      this.layout();
      return;
    }
    this.waiting = true;
    const r = await this.host.s.ask('casino', 'races', 'field', {});
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); return; }
    const first = this.field.length === 0;
    this.field = r.view.field as Horse[]; this.bets = {}; this.order = []; this.phase = 'bet'; this.raceT = 0;
    this.message = first ? 'Touche un cheval pour miser.' : 'Nouvelle course : touche un cheval pour miser.';
    this.layout();
  }

  private async start(): Promise<void> {
    const s = this.host.s;
    if (this.waiting) return;
    if (this.phase === 'done') { void this.newRace(); return; }
    if (this.phase !== 'bet' || this.staked <= 0) return;
    this.waiting = true;
    this.lastBets = { ...this.bets };
    const r = await this.host.playRound('races', 'run', { bets: { ...this.bets } }, this.staked, () => { this.message = 'Mise acceptée : départ commun à la fin du compte à rebours.'; });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    const order = r.view.order as number[];
    this.settled = { stake: r.stake, payout: r.payout }; this.order = order;
    // Temps d'arrivée croissants selon la place, avec un peu de suspense
    this.finishTimes = new Array(6).fill(0);
    order.forEach((h, place) => { this.finishTimes[h] = RACE_TIME + place * 0.28 + Math.random() * 0.12; });
    this.raceT = 0; this.phase = 'race'; this.message = 'Et ils sont partis !'; this.cheered = false;
    s.audio.ding();
  }

  private cheered = false;

  /** Progression 0..1 d'un cheval : allure irrégulière, mais arrivée au temps prévu. */
  private progress(h: number): number {
    const T = this.finishTimes[h] ?? RACE_TIME, t = this.raceT;
    const base = clamp(t / T, 0, 1);
    const wob = Math.sin(t * (1.3 + h * 0.37) + h * 2) * 0.035 * Math.sin(Math.PI * base);
    return clamp(base + wob, 0, 1);
  }

  update(dt: number): void {
    this.t += dt;
    const s = this.host.s;
    if (this.phase === 'race') {
      this.raceT += dt;
      // Battement des sabots (galop à quatre temps), plus fort à l'approche de l'arrivée
      if (Math.floor(this.raceT * 7) !== Math.floor((this.raceT - dt) * 7)) s.audio.knock(0.12 + 0.2 * Math.min(1, this.raceT / RACE_TIME));
      if (!this.cheered && this.raceT > RACE_TIME * 0.85) { this.cheered = true; s.audio.cheer(); }
      if (this.raceT > Math.max(...this.finishTimes) + 0.6) {
        const w = this.order[0], ret = this.settled.payout, net = ret - this.settled.stake;
        this.message = `${this.field[w].name} gagne (cote ${this.field[w].odds}) · ${net > 0 ? `+${net}` : net} jetons`;
        this.host.celebrate(net, this.settled.stake, `${this.field[w].name} gagne · cote ${String(this.field[w].odds).replace('.', ',')}`);
        this.phase = 'done';
      }
    }
    this.betCtl.locked = this.phase === 'race';
    this.betCtl.engaged = this.phase === 'bet' ? this.staked : 0;
    this.betCtl.sync();
    this.clearBtn.enabled = this.phase === 'bet' && this.staked > 0;
    this.rebetBtn.enabled = this.phase === 'bet' && this.staked === 0 && Object.keys(this.lastBets).length > 0;
    this.startBtn.enabled = !this.waiting && this.field.length > 0 && (this.phase === 'done' || (this.phase === 'bet' && this.staked > 0));
    this.startBtn.label = this.phase === 'done' ? 'Nouvelle course' : this.staked > 0 ? `Départ · ${this.staked}` : 'Départ';
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui;
    // Liste des partants
    this.field.forEach((h, i) => {
      const r = this.rows[i], won = this.phase === 'done' && this.order[0] === i;
      roundRect(ctx, r.x, r.y, r.w, r.h, 10 * ui); ctx.fillStyle = won ? 'rgba(229,181,74,0.35)' : 'rgba(255,255,255,0.07)'; ctx.fill();
      ctx.strokeStyle = h.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = h.color; ctx.beginPath(); ctx.arc(r.x + 16 * ui, r.y + r.h / 2, 8 * ui, 0, Math.PI * 2); ctx.fill();
      drawLabel(ctx, String(i + 1), r.x + 16 * ui, r.y + r.h / 2, 10 * ui, '#fff');
      // Nom et cote sur une ligne si la place suffit, sinon sur deux lignes (portrait)
      const nameFs = Math.min(14 * ui, r.h * 0.4), odds = `cote ${String(h.odds).replace('.', ',')}`;
      ctx.font = font(nameFs, 800); const nw = ctx.measureText(h.name).width;
      ctx.font = font(12 * ui, 800); const ow = ctx.measureText(odds).width;
      const right = r.w - (this.bets[i] ? 52 : 10) * ui;
      if (32 * ui + nw + 10 * ui + ow <= right || r.h < 40 * ui) {
        drawLabel(ctx, h.name, r.x + 32 * ui, r.y + r.h / 2, nameFs, PAL.text, 'left', 800);
        drawLabel(ctx, odds, r.x + right, r.y + r.h / 2, 12 * ui, PAL.gold, 'right', 800);
      } else {
        drawLabel(ctx, h.name, r.x + 32 * ui, r.y + r.h / 2 - 9 * ui, Math.min(nameFs, ((right - 36 * ui) / Math.max(1, nw)) * nameFs), PAL.text, 'left', 800);
        drawLabel(ctx, odds, r.x + 32 * ui, r.y + r.h / 2 + 10 * ui, 12 * ui, PAL.gold, 'left', 800);
      }
      if (this.bets[i]) { drawChip(ctx, r.x + r.w - 22 * ui, r.y + r.h / 2, Math.min(r.h * 0.38, 14 * ui), Math.min(100, this.bets[i])); }
    });
    // Piste : gazon tondu en bandes, lices blanches, poteaux de distance, poteau d'arrivée
    const T = this.track;
    ctx.save();
    roundRect(ctx, T.x, T.y, T.w, T.h, 14 * ui); ctx.clip();
    const turf = ctx.createLinearGradient(0, T.y, 0, T.y + T.h); turf.addColorStop(0, '#2d7a3a'); turf.addColorStop(1, '#246630');
    ctx.fillStyle = turf; ctx.fillRect(T.x, T.y, T.w, T.h);
    const lane = T.h / 6;
    const stripe = Math.max(18 * ui, T.w / 14);
    for (let x = T.x - stripe; x < T.x + T.w; x += stripe * 2) { ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(x, T.y, stripe, T.h); }
    for (let i = 1; i < 6; i++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(T.x, T.y + i * lane - 0.5, T.w, 1); }
    const finishX = T.x + T.w - 28 * ui, startX = T.x + 26 * (lane / 40);
    // Poteaux de distance
    for (let k = 1; k <= 3; k++) { const x = startX + (finishX - startX) * (k / 4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 1, T.y, 2, 6 * ui); ctx.fillRect(x - 1, T.y + T.h - 6 * ui, 2, 6 * ui); }
    // Ligne d'arrivée en damier et poteau rouge et blanc
    for (let y = T.y; y < T.y + T.h; y += 8) { ctx.fillStyle = Math.floor((y - T.y) / 8) % 2 ? '#fff' : '#111'; ctx.fillRect(finishX, y, 6, 8); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; roundRect(ctx, T.x, T.y, T.w, T.h, 14 * ui); ctx.stroke();
    // Classement en direct (ordre des positions à l'écran)
    const live = this.field.map((_, i) => i).sort((a, b) => this.progress(b) - this.progress(a));
    this.field.forEach((h, i) => {
      const p = this.phase === 'bet' ? 0 : this.progress(i);
      const x = startX + (finishX - startX - 10 * ui) * p, y = T.y + i * lane + lane * 0.62;
      const k = Math.min(lane / 40, T.w / 240) * 1.1;
      const running = this.phase === 'race' && p < 1;
      // Poussière soulevée derrière le cheval
      if (running && !this.host.s.lowFx) for (let d = 0; d < 3; d++) {
        const age = (this.t * 3 + d / 3 + i * 0.13) % 1;
        ctx.fillStyle = `rgba(214,190,140,${0.25 * (1 - age)})`; ctx.beginPath(); ctx.arc(x - (16 + age * 22) * k, y + 9 * k - age * 5 * k, (2 + age * 4) * k, 0, Math.PI * 2); ctx.fill();
      }
      drawHorse(ctx, x, y, k, h.color, i + 1, running ? this.t * (9 + i * 0.4) + i : 0, running);
      if (this.phase !== 'bet') {
        const place = live.indexOf(i) + 1;
        if (this.phase === 'done' && place <= 3) drawPill(ctx, ['1er', '2e', '3e'][place - 1], x + 2 * k, y - 30 * k, 9 * ui, ['#d4af5a', '#c0c6cc', '#c88a4a'][place - 1], '#1a1208');
      }
    });
    if (this.message && !this.host.result.active) drawPill(ctx, this.message, this.track.x + this.track.w / 2, this.track.y + this.track.h - 14 * ui, 12 * ui, 'rgba(14,11,16,0.9)', PAL.text, this.track.w - 10 * ui);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}

/**
 * Cheval de course au galop vu de profil : quatre jambes articulées en cycle de galop, encolure, crinière et
 * queue qui flottent, jockey en casaque aux couleurs du cheval, tapis de selle numéroté.
 */
function drawHorse(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, silk: string, num: number, phase: number, running: boolean): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const bob = running ? Math.sin(phase * 2) * 1.6 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 13, 17, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, bob);
  const coat = '#6b4226', dark = '#3a2414';
  // Jambes : angles du galop (antérieures et postérieures décalées)
  const leg = (hx: number, hy: number, ph: number, back: boolean) => {
    const sw = running ? Math.sin(phase + ph) : 0.15;
    const a1 = sw * 0.75 + (back ? 0.15 : -0.1), a2 = a1 + (running ? Math.max(0, Math.cos(phase + ph)) * 1.2 : 0.2) * (back ? -1 : 1);
    const kx = hx + Math.sin(a1) * 6, ky = hy + Math.cos(a1) * 6;
    const fx = kx + Math.sin(a2) * 6, fy = ky + Math.cos(a2) * 6;
    ctx.strokeStyle = dark; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = '#1a1008'; ctx.fillRect(fx - 1.4, fy - 0.5, 2.8, 1.6);
  };
  leg(-9, 2, Math.PI, true); leg(8, 2, 0.6, false);
  // Queue
  const tw = running ? Math.sin(phase * 2) * 3 : 0;
  ctx.strokeStyle = '#2a170b'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-14, -3); ctx.quadraticCurveTo(-20, -2 + tw, -23, 4 + tw); ctx.stroke();
  // Corps
  const g = ctx.createLinearGradient(0, -8, 0, 8); g.addColorStop(0, '#8a5634'); g.addColorStop(1, coat);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-1, 0, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
  // Encolure et tête
  ctx.beginPath(); ctx.moveTo(9, -4); ctx.quadraticCurveTo(13, -14, 17, -15); ctx.lineTo(21, -11); ctx.quadraticCurveTo(17, -6, 14, 1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(21, -12, 6, 3.2, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1008'; ctx.beginPath(); ctx.arc(19.5, -13.5, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a170b'; ctx.beginPath(); ctx.moveTo(13, -13); ctx.lineTo(10 - (running ? Math.sin(phase * 2) : 0), -9); ctx.lineTo(12, -6); ctx.fill(); // crinière
  // Jambes du côté visible (par-dessus le corps)
  leg(-7, 3, Math.PI + 0.7, true); leg(10, 3, 1.3, false);
  // Tapis de selle numéroté
  ctx.fillStyle = '#f4efe6'; ctx.fillRect(-6, -6, 9, 7);
  ctx.fillStyle = '#111827'; ctx.font = '900 5.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), -1.5, -2.5);
  // Jockey penché en avant
  ctx.fillStyle = silk; ctx.beginPath(); ctx.ellipse(1, -11, 4.5, 3.4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = silk; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(3, -10); ctx.lineTo(9, -8); ctx.stroke();
  ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(5, -15, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = silk; ctx.beginPath(); ctx.arc(5, -15.8, 2.5, Math.PI, 0); ctx.fill(); // bombe
  ctx.restore();
}
