// Courses de chevaux : mise sur un ou plusieurs chevaux à cote fixe, puis course animée.
// L'ordre d'arrivée est tiré au départ selon les probabilités affichées ; l'animation le respecte.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { clamp } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { type Horse } from './logic/races';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawChip, drawLabel, drawPill } from './widgets';
import { BetControl } from './casinoKit';

const RACE_TIME = 7;

export class RacesGame implements MiniGame {
  readonly id = 'races';
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
    const r = await s.ask('casino', 'races', 'run', { bets: { ...this.bets } });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    const order = r.view.order as number[];
    this.settled = { stake: r.stake, payout: r.payout }; this.order = order;
    // Temps d'arrivée croissants selon la place, avec un peu de suspense
    this.finishTimes = new Array(6).fill(0);
    order.forEach((h, place) => { this.finishTimes[h] = RACE_TIME + place * 0.28 + Math.random() * 0.12; });
    this.raceT = 0; this.phase = 'race'; this.message = 'Et ils sont partis !';
    s.audio.ding();
  }

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
      if (Math.floor(this.raceT * 4) !== Math.floor((this.raceT - dt) * 4)) s.audio.knock(0.2);
      if (this.raceT > Math.max(...this.finishTimes) + 0.6) {
        const w = this.order[0], ret = this.settled.payout, net = ret - this.settled.stake;
        this.message = `${this.field[w].name} gagne (cote ${this.field[w].odds}) · ${net > 0 ? `+${net}` : net} jetons`;
        if (net > 0) s.audio.win(); else s.audio.lose();
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
      drawLabel(ctx, h.name, r.x + 32 * ui, r.y + r.h / 2, Math.min(14 * ui, r.h * 0.4), PAL.text, 'left', 800);
      drawLabel(ctx, `cote ${String(h.odds).replace('.', ',')}`, r.x + r.w - (this.bets[i] ? 52 : 10) * ui, r.y + r.h / 2, 12 * ui, PAL.gold, 'right', 800);
      if (this.bets[i]) { drawChip(ctx, r.x + r.w - 22 * ui, r.y + r.h / 2, Math.min(r.h * 0.38, 14 * ui), Math.min(100, this.bets[i])); }
    });
    // Piste
    const T = this.track;
    roundRect(ctx, T.x, T.y, T.w, T.h, 14 * ui); ctx.fillStyle = '#2f7a3a'; ctx.fill();
    const lane = T.h / 6;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(T.x, T.y + i * lane, T.w, lane);
    }
    const finishX = T.x + T.w - 28 * ui, startX = T.x + 26 * (lane / 40);
    for (let y = T.y; y < T.y + T.h; y += 8) { ctx.fillStyle = Math.floor((y - T.y) / 8) % 2 ? '#fff' : '#111'; ctx.fillRect(finishX, y, 6, 8); }
    this.field.forEach((h, i) => {
      const p = this.phase === 'bet' ? 0 : this.progress(i);
      const x = startX + (finishX - startX - 10 * ui) * p, y = T.y + i * lane + lane / 2;
      const gallop = this.phase === 'race' && p < 1 ? Math.sin(this.t * 18 + i) * 2 : 0;
      // Cheval stylisé (taille relative au couloir)
      const k = lane / 40;
      ctx.fillStyle = '#3a2414'; for (const dx of [-8, -4, 6, 10]) ctx.fillRect(x + dx * k, y + 3 * k, 2.2 * k, 9 * k - Math.abs(gallop) * (dx > 0 ? 1 : -0.5));
      ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.ellipse(x, y + gallop, 14 * k, 7 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 9 * k, y - 3 * k + gallop); ctx.lineTo(x + 15 * k, y - 12 * k + gallop); ctx.lineTo(x + 19 * k, y - 9 * k + gallop); ctx.lineTo(x + 13 * k, y + gallop); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 19 * k, y - 10 * k + gallop, 6 * k, 3.2 * k, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a170b'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(x - 13 * k, y - 2 * k + gallop); ctx.lineTo(x - 19 * k, y + 4 * k + gallop); ctx.stroke();
      ctx.fillStyle = h.color; roundRect(ctx, x - 6 * k, y - 15 * k + gallop, 11 * k, 9 * k, 2 * k); ctx.fill(); // casaque du jockey
      ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(x + 1 * k, y - 18 * k + gallop, 3 * k, 0, Math.PI * 2); ctx.fill();
      drawLabel(ctx, String(i + 1), x - 0.5 * k, y - 10.5 * k + gallop, 7 * k, '#fff', 'center', 900);
    });
    if (this.message) drawPill(ctx, this.message, this.track.x + this.track.w / 2, this.track.y + this.track.h - 14 * ui, 12 * ui, 'rgba(14,11,16,0.9)', PAL.text);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
