// Machines à sous (6 thèmes) : 3 rouleaux animés, ligne centrale, table des gains et taux de retour affichés.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import { easeOutCubic } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { machineRtp, slotStrip, STRIP_PATTERN, type SlotDef } from './logic/slotMachines';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';
import { BetControl } from './casinoKit';

const N = STRIP_PATTERN.length;

/** Symboles dessinés en vectoriel (aucune police emoji requise). */
export function drawSymbol(ctx: CanvasRenderingContext2D, sym: string, cx: number, cy: number, s: number): void {
  ctx.save(); ctx.translate(cx, cy);
  switch (sym) {
    case 'perle': {
      const g = ctx.createRadialGradient(-s * 0.12, -s * 0.12, s * 0.03, 0, 0, s * 0.3);
      g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#e7e0f2'); g.addColorStop(1, '#a99ec4');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'coquillage': {
      ctx.fillStyle = '#ffb3c7';
      ctx.beginPath(); ctx.moveTo(0, s * 0.3);
      for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * Math.PI; ctx.lineTo(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.32 + s * 0.04); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e07a96'; ctx.lineWidth = s * 0.03;
      for (let i = 1; i < 6; i++) { const a = Math.PI + (i / 6) * Math.PI; ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.lineTo(Math.cos(a) * s * 0.33, Math.sin(a) * s * 0.29 + s * 0.04); ctx.stroke(); }
      break;
    }
    case 'ancre': {
      ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -s * 0.27, s * 0.07, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, s * 0.3); ctx.moveTo(-s * 0.15, -s * 0.1); ctx.lineTo(s * 0.15, -s * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.24, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      break;
    }
    case 'coffre': {
      ctx.fillStyle = '#8a5a2e'; roundRect(ctx, -s * 0.3, -s * 0.12, s * 0.6, s * 0.36, s * 0.04); ctx.fill();
      ctx.fillStyle = '#a06a35'; ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.3, s * 0.14, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = PAL.gold; ctx.fillRect(-s * 0.3, -s * 0.04, s * 0.6, s * 0.05); ctx.fillRect(-s * 0.05, -s * 0.08, s * 0.1, s * 0.14);
      break;
    }
    case 'couronne': {
      ctx.fillStyle = PAL.gold;
      ctx.beginPath(); ctx.moveTo(-s * 0.32, s * 0.2); ctx.lineTo(-s * 0.32, -s * 0.15); ctx.lineTo(-s * 0.16, s * 0.02); ctx.lineTo(0, -s * 0.25); ctx.lineTo(s * 0.16, s * 0.02); ctx.lineTo(s * 0.32, -s * 0.15); ctx.lineTo(s * 0.32, s * 0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6ff3ff'; for (const x of [-0.32, 0, 0.32]) { ctx.beginPath(); ctx.arc(x * s, x === 0 ? -s * 0.25 : -s * 0.15, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'piece': {
      const g = ctx.createRadialGradient(-s * 0.08, -s * 0.08, s * 0.02, 0, 0, s * 0.3);
      g.addColorStop(0, '#fff2b3'); g.addColorStop(1, PAL.goldDark);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PAL.goldDark; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = PAL.goldDark; ctx.font = `900 ${s * 0.2}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, s * 0.01);
      break;
    }
    case 'sabre': {
      ctx.strokeStyle = '#d9dee4'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.24); ctx.quadraticCurveTo(s * 0.05, -s * 0.05, s * 0.28, -s * 0.3); ctx.stroke();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.12); ctx.lineTo(-s * 0.1, s * 0.32); ctx.stroke();
      break;
    }
    case 'carte': {
      ctx.fillStyle = '#f2e2b6'; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.22); ctx.lineTo(s * 0.3, -s * 0.26); ctx.lineTo(s * 0.28, s * 0.24); ctx.lineTo(-s * 0.32, s * 0.26); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a0784a'; ctx.lineWidth = s * 0.02; ctx.setLineDash([s * 0.05, s * 0.04]); ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.12); ctx.quadraticCurveTo(0, -s * 0.2, s * 0.12, s * 0.02); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(s * 0.08, -s * 0.03); ctx.lineTo(s * 0.17, s * 0.07); ctx.moveTo(s * 0.17, -s * 0.03); ctx.lineTo(s * 0.08, s * 0.07); ctx.stroke();
      break;
    }
    case 'drapeau': {
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-s * 0.26, -s * 0.32, s * 0.05, s * 0.64);
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.moveTo(-s * 0.21, -s * 0.3); ctx.lineTo(s * 0.3, -s * 0.24); ctx.lineTo(s * 0.26, s * 0.06); ctx.lineTo(-s * 0.21, s * 0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 0.04, -s * 0.13, s * 0.07, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'crane': {
      ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-s * 0.13, s * 0.1, s * 0.26, s * 0.14);
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(-s * 0.09, -s * 0.05, s * 0.06, 0, Math.PI * 2); ctx.arc(s * 0.09, -s * 0.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-s * 0.08, s * 0.14, s * 0.03, s * 0.08); ctx.fillRect(-s * 0.015, s * 0.14, s * 0.03, s * 0.08); ctx.fillRect(s * 0.05, s * 0.14, s * 0.03, s * 0.08);
      break;
    }
    case 'poisson': {
      ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.ellipse(-s * 0.03, 0, s * 0.23, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.17, 0); ctx.lineTo(s * 0.32, -s * 0.13); ctx.lineTo(s * 0.32, s * 0.13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.05, -s * 0.13, s * 0.05, s * 0.26);
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(-s * 0.15, -s * 0.03, s * 0.03, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'etoile': {
      ctx.fillStyle = '#ff6f61'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.12 : s * 0.3, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.15, Math.sin(a) * s * 0.15, s * 0.025, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'tortue': {
      ctx.fillStyle = '#5fbf6f'; for (const [x, y] of [[-0.2, -0.17], [0.2, -0.17], [-0.2, 0.17], [0.2, 0.17], [0, -0.3]] as const) { ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.07, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#2e7d4f'; ctx.beginPath(); ctx.ellipse(0, s * 0.02, s * 0.22, s * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9be0a5'; ctx.lineWidth = s * 0.025; ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, s * 0.24); ctx.moveTo(-s * 0.2, s * 0.02); ctx.lineTo(s * 0.2, s * 0.02); ctx.stroke();
      break;
    }
    case 'pieuvre': {
      ctx.fillStyle = '#b05bd6';
      ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.2, Math.PI, 0); ctx.lineTo(s * 0.2, s * 0.02); ctx.lineTo(-s * 0.2, s * 0.02); ctx.fill();
      ctx.strokeStyle = '#b05bd6'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const x = -s * 0.15 + i * s * 0.1; ctx.beginPath(); ctx.moveTo(x, s * 0.02); ctx.quadraticCurveTo(x + (i % 2 ? s * 0.08 : -s * 0.08), s * 0.16, x, s * 0.28); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * 0.07, -s * 0.1, s * 0.045, 0, Math.PI * 2); ctx.arc(s * 0.07, -s * 0.1, s * 0.045, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'requin': {
      ctx.fillStyle = '#7d93a8';
      ctx.beginPath(); ctx.moveTo(-s * 0.32, s * 0.05); ctx.quadraticCurveTo(0, -s * 0.16, s * 0.24, 0); ctx.lineTo(s * 0.34, -s * 0.12); ctx.lineTo(s * 0.32, s * 0.12); ctx.lineTo(s * 0.24, s * 0.06); ctx.quadraticCurveTo(0, s * 0.16, -s * 0.32, s * 0.05); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.04, -s * 0.08); ctx.lineTo(s * 0.04, -s * 0.3); ctx.lineTo(s * 0.1, -s * 0.06); ctx.fill();
      ctx.fillStyle = '#e8eef3'; ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.06); ctx.quadraticCurveTo(0, s * 0.13, s * 0.2, s * 0.06); ctx.lineTo(-s * 0.3, s * 0.06); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(-s * 0.2, 0, s * 0.025, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'corail': {
      ctx.strokeStyle = '#ff6f91'; ctx.lineCap = 'round';
      const branch = (x: number, y: number, a: number, len: number, w: number, d: number): void => {
        if (d === 0) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        branch(x2, y2, a - 0.5, len * 0.7, w * 0.7, d - 1); branch(x2, y2, a + 0.5, len * 0.7, w * 0.7, d - 1);
      };
      branch(0, s * 0.3, -Math.PI / 2, s * 0.22, s * 0.08, 3);
      break;
    }
    case 'hippocampe': {
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * 0.02, -s * 0.24); ctx.quadraticCurveTo(-s * 0.16, -s * 0.05, s * 0.02, s * 0.08); ctx.quadraticCurveTo(s * 0.14, s * 0.22, -s * 0.04, s * 0.28); ctx.stroke();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(s * 0.1, -s * 0.24, s * 0.12, s * 0.06, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.26, s * 0.025, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'huitre': {
      ctx.fillStyle = '#9c8a78'; ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.3, s * 0.16, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#c9b8a6'; ctx.beginPath(); ctx.ellipse(0, -s * 0.02, s * 0.28, s * 0.14, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffe6f0'; ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.24, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(-s * 0.03, 0, s * 0.01, 0, s * 0.03, s * 0.09); g.addColorStop(0, '#fff'); g.addColorStop(1, '#c9bde0');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, s * 0.03, s * 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'boussole': {
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(0, -s * 0.18); ctx.lineTo(s * 0.05, 0); ctx.lineTo(-s * 0.05, 0); ctx.fill();
      ctx.fillStyle = '#123d6e'; ctx.beginPath(); ctx.moveTo(0, s * 0.18); ctx.lineTo(s * 0.05, 0); ctx.lineTo(-s * 0.05, 0); ctx.fill();
      break;
    }
    case 'trident': {
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, s * 0.32); ctx.lineTo(0, -s * 0.28); ctx.moveTo(-s * 0.18, -s * 0.24); ctx.lineTo(-s * 0.18, -s * 0.06); ctx.quadraticCurveTo(0, s * 0.06, s * 0.18, -s * 0.06); ctx.lineTo(s * 0.18, -s * 0.24); ctx.stroke();
      break;
    }
    case 'baleine': {
      ctx.fillStyle = '#3b6fb6'; ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.04, s * 0.27, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.2, 0); ctx.lineTo(s * 0.34, -s * 0.16); ctx.lineTo(s * 0.3, s * 0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cfe0f5'; ctx.beginPath(); ctx.ellipse(-s * 0.06, s * 0.12, s * 0.18, s * 0.06, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = '#9fd9f5'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.12); ctx.quadraticCurveTo(-s * 0.2, -s * 0.3, -s * 0.26, -s * 0.24); ctx.moveTo(-s * 0.12, -s * 0.12); ctx.quadraticCurveTo(-s * 0.04, -s * 0.3, s * 0.02, -s * 0.26); ctx.stroke();
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(-s * 0.18, s * 0.02, s * 0.025, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'scaphandre': {
      ctx.fillStyle = '#c48a4a'; ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.27, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9fd9f5'; ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = s * 0.04; ctx.stroke();
      ctx.fillStyle = '#8a5a2e'; ctx.fillRect(-s * 0.24, s * 0.2, s * 0.48, s * 0.08);
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.2, -s * 0.02 + Math.sin(a) * s * 0.2, s * 0.025, 0, Math.PI * 2); ctx.fillStyle = PAL.goldLight; ctx.fill(); }
      break;
    }
    case 'ks': {
      ctx.fillStyle = '#0b5ea8'; ctx.beginPath(); ctx.arc(0, 0, s * 0.33, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = s * 0.05; ctx.stroke();
      ctx.font = `900 ${s * 0.3}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', 0, s * 0.02);
      break;
    }
  }
  ctx.restore();
}

export class SlotsGame implements MiniGame {
  readonly id: string;
  readonly title: string;
  readonly bg: [string, string];
  readonly currency = 'chips' as const;
  readonly rules: string;
  private strip: string[];

  constructor(private def: SlotDef) {
    this.id = `slots-${def.id}`;
    this.title = def.name;
    this.bg = def.colors.bg;
    this.strip = slotStrip(def);
    const [low] = def.symbols;
    this.rules =
      'Choisis ta mise puis touche « Tourner ». Seule la ligne centrale compte.\n' +
      `• 3 symboles identiques : gain selon la table.\n• Deux « ${SYMBOL_NAMES[low] ?? low} » à gauche : ×${def.two}. Un seul sur le premier rouleau : ×${def.one} (mise rendue).\n` +
      `Taux de retour théorique : ${(machineRtp(def) * 100).toFixed(1).replace('.', ',')} % (sur un très grand nombre de parties ; chaque tirage reste aléatoire).`;
  }

  private host!: MiniGameHost;
  get holdBalance(): boolean { return this.anim !== null || this.waiting; }
  private waiting = false;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private pos = [0, 7, 15];
  private anim: { start: number; from: number[]; to: number[]; durs: number[]; stops: number[]; win: number; bet: number } | null = null;
  private lastWin = 0;
  private message = 'Choisis ta mise et tente ta chance.';
  private t = 0;
  private spinBtn!: Button;
  private machine = { x: 0, y: 0, w: 0, h: 0 };
  private table = { x: 0, y: 0, w: 0, h: 0 };
  private ticks = [0, 0, 0];

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [5, 10, 25, 100], min: 1, initial: 10 });
    this.spinBtn = makeButton({ id: 'spin', label: 'Tourner', style: 'gold', fontSize: 18, onTap: () => this.spin() });
    this.layer.buttons = [...this.betCtl.buttons, this.spinBtn];
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const portrait = a.h > a.w;
    const ctrlH = this.betCtl.layout(a, ui, [[this.spinBtn, 200]]);
    if (portrait) {
      this.machine = { x: a.x, y: a.y, w: a.w, h: Math.min(a.h * 0.45, a.w * 0.75) };
      this.table = { x: a.x, y: a.y + this.machine.h + 10 * ui, w: a.w, h: a.h - this.machine.h - ctrlH - 20 * ui };
    } else {
      this.machine = { x: a.x, y: a.y, w: a.w * 0.6, h: a.h - ctrlH - 10 * ui };
      this.table = { x: a.x + a.w * 0.63, y: a.y, w: a.w * 0.37, h: a.h - ctrlH - 10 * ui };
    }
  }

  handlers(): PointerHandler[] { return [this.layer]; }
  canQuit() { return this.anim || this.waiting ? { ok: false as const, reason: 'Attends l’arrêt des rouleaux' } : { ok: true as const }; }

  private async spin(): Promise<void> {
    const s = this.host.s;
    if (this.anim || this.waiting) return;
    // Résultat décidé par l'autorité avant l'animation
    this.waiting = true;
    const r = await s.ask('casino', 'slots', 'play', { machine: this.def.id, bet: this.betCtl.amount });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    const stops = r.view.stops as number[];
    const from = this.pos.map((p) => p % N);
    const to = stops.map((st, i) => { let target = st; while (target < from[i] + N * (2 + i)) target += N; return target; });
    this.anim = { start: this.t, from, to, durs: [1.1, 1.5, 1.9], stops, win: r.payout, bet: r.stake };
    this.lastWin = 0;
    this.message = '';
  }

  update(dt: number): void {
    this.t += dt;
    const s = this.host.s;
    if (this.anim) {
      const an = this.anim;
      let done = true;
      for (let i = 0; i < 3; i++) {
        const p = Math.min(1, (this.t - an.start) / an.durs[i]);
        const np = an.from[i] + (an.to[i] - an.from[i]) * easeOutCubic(p);
        if (Math.floor(np) !== Math.floor(this.pos[i]) && p < 1) { this.ticks[i]++; if (this.ticks[i] % 2 === 0) s.audio.tick(); }
        this.pos[i] = np;
        if (p < 1) done = false;
      }
      if (done) {
        this.pos = an.stops.slice();
        const win = an.win;
        this.lastWin = win;
        const net = win - an.bet;
        this.message = win === 0 ? 'Pas de gain cette fois.' : net > 0 ? `Gagné ${win} jetons !` : 'Mise rendue.';
        if (net > 0) s.audio.win(); else if (win === 0) s.audio.lose();
        this.anim = null;
      }
    }
    this.betCtl.locked = !!this.anim || this.waiting;
    this.betCtl.sync();
    this.spinBtn.enabled = !this.anim && !this.waiting && s.chips.canAfford(this.betCtl.amount);
    this.spinBtn.label = `Tourner · ${this.betCtl.amount}`;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, m = this.machine, col = this.def.colors;
    const mw = Math.min(m.w, m.h * 1.35), mx = m.x + (m.w - mw) / 2;
    roundRect(ctx, mx, m.y, mw, m.h, 24 * ui);
    const body = ctx.createLinearGradient(0, m.y, 0, m.y + m.h);
    body.addColorStop(0, col.body); body.addColorStop(1, '#14100a');
    ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = col.light; ctx.lineWidth = 3; ctx.stroke();
    drawLabel(ctx, this.def.name.toUpperCase(), mx + mw / 2, m.y + 22 * ui, 15 * ui, col.light, 'center', 900);
    for (let i = 0; i < 14; i++) {
      const on = (i + Math.floor(this.t * (this.anim ? 12 : 3))) % 3 === 0;
      ctx.fillStyle = on ? '#fff6c2' : 'rgba(255,240,180,0.3)';
      ctx.beginPath(); ctx.arc(mx + 20 * ui + i * ((mw - 40 * ui) / 13), m.y + 42 * ui, 3 * ui, 0, Math.PI * 2); ctx.fill();
    }
    const top = m.y + 56 * ui, rh = m.h - 76 * ui, gap = 10 * ui;
    const rw = (mw - 40 * ui - gap * 2) / 3, cell = rh / 3;
    for (let i = 0; i < 3; i++) {
      const rx = mx + 20 * ui + i * (rw + gap);
      ctx.save();
      roundRect(ctx, rx, top, rw, rh, 10 * ui); ctx.fillStyle = '#fbf6ea'; ctx.fill(); ctx.clip();
      const p = this.pos[i], base = Math.floor(p), frac = p - base;
      for (let k = -2; k <= 2; k++) {
        const sym = this.strip[((base + k) % N + N) % N];
        drawSymbol(ctx, sym, rx + rw / 2, top + rh / 2 - k * cell + frac * cell, Math.min(cell, rw) * 0.95);
      }
      const shade = ctx.createLinearGradient(0, top, 0, top + rh);
      shade.addColorStop(0, 'rgba(0,0,0,0.35)'); shade.addColorStop(0.25, 'rgba(0,0,0,0)'); shade.addColorStop(0.75, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = shade; ctx.fillRect(rx, top, rw, rh);
      ctx.restore();
    }
    ctx.strokeStyle = this.lastWin > 0 ? `rgba(255,80,80,${0.6 + Math.sin(this.t * 8) * 0.4})` : 'rgba(255,80,80,0.6)';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mx + 12 * ui, top + rh / 2); ctx.lineTo(mx + mw - 12 * ui, top + rh / 2); ctx.stroke();
    if (this.message) drawPill(ctx, this.message, mx + mw / 2, m.y + m.h - 2 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text);

    const T = this.table, d = this.def;
    roundRect(ctx, T.x, T.y, T.w, T.h, 14 * ui); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    drawLabel(ctx, 'Table des gains (× mise)', T.x + T.w / 2, T.y + 18 * ui, 13 * ui, PAL.gold);
    const rows: Array<[string[], string]> = [5, 4, 3, 2, 1, 0].map((r) => [[d.symbols[r], d.symbols[r], d.symbols[r]], `×${d.pay[r]}`]);
    rows.push([[d.symbols[0], d.symbols[0]], `×${d.two}`], [[d.symbols[0]], `×${d.one}`]);
    const lh = Math.min(30 * ui, (T.h - 54 * ui) / rows.length);
    rows.forEach(([syms, txt], i) => {
      const y = T.y + 40 * ui + i * lh + lh / 2;
      syms.forEach((sy, k) => drawSymbol(ctx, sy, T.x + 22 * ui + k * lh * 0.95, y, lh * 0.95));
      drawLabel(ctx, txt, T.x + T.w - 14 * ui, y, 13 * ui, PAL.text, 'right');
    });
    drawLabel(ctx, `Taux de retour théorique ${(machineRtp(d) * 100).toFixed(1).replace('.', ',')} %`, T.x + T.w / 2, T.y + T.h - 12 * ui, 10 * ui, PAL.textDim, 'center', 600);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}

const SYMBOL_NAMES: Record<string, string> = { perle: 'perles', piece: 'pièces', poisson: 'poissons' };
