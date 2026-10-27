// Machines à sous (6 thèmes) : 3 rouleaux animés, ligne centrale, table des gains et taux de retour affichés.
import { makeCanvas, roundRect } from '../art/canvas';
import { LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import type { PointerHandler } from '../engine/Input';
import { easeOutCubic } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { machineRtp, rankAt, slotStrip, STRIP_PATTERN, type SlotDef } from './logic/slotMachines';
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

/** Symboles pré-rendus (dessin vectoriel coûteux : une seule fois par taille et par symbole). */
const symCache = new Map<string, ReturnType<typeof makeCanvas>>();
export function symbolSprite(sym: string, px: number): ReturnType<typeof makeCanvas> {
  const k = `${sym}:${px}`;
  let c = symCache.get(k);
  if (!c) {
    c = makeCanvas(px, px);
    drawSymbol(c.ctx, sym, px / 2, px / 2, px);
    symCache.set(k, c);
    if (symCache.size > 120) symCache.delete(symCache.keys().next().value as string);
  }
  return c;
}

/** Durées d'arrêt des rouleaux (s) ; le dernier tourne plus longtemps quand deux symboles identiques sont déjà alignés. */
const DURS = [1.0, 1.45, 1.9];
const ANTICIPATION = 1.1;
const SETTLE = 0.22;

export class SlotsGame implements MiniGame {
  readonly id: string;
  /** En ligne : banc de machines partagé (voisins et leurs gains visibles), chacun joue sur sa machine. */
  readonly tableGame = 'slots';
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
  /** Vitesse de chaque rouleau (cases/s) : sert au flou de mouvement. */
  private speed = [0, 0, 0];
  private anim: { start: number; from: number[]; to: number[]; durs: number[]; stops: number[]; win: number; bet: number; stopped: boolean[]; antic: boolean } | null = null;
  /** Fin de rebond de chaque rouleau (temps) : petit dépassement puis retour, comme une vraie butée. */
  private settle = [-1, -1, -1];
  /** Cases gagnantes de la ligne centrale (0 à 3 rouleaux, à partir de la gauche) et rang du symbole. */
  /** Gain affiché de la dernière partie (celui renvoyé par l'autorité). */
  lastWin = 0;
  private winCells = 0;
  private winRow = -1;
  private winAt = 0;
  private message = 'Choisis ta mise et tente ta chance.';
  private t = 0;
  private spinBtn!: Button;
  private machine = { x: 0, y: 0, w: 0, h: 0 };
  private table = { x: 0, y: 0, w: 0, h: 0 };
  private ticks = [0, 0, 0];
  private leverT = -10;

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
    // Bannière de gain sous la ligne centrale : les symboles gagnants restent visibles
    this.host.result.anchorY = portrait ? 0.5 : 0.74;
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
    // Suspense honnête : le dernier rouleau ralentit plus longtemps seulement si les deux premiers affichent déjà le même symbole
    const antic = rankAt(stops[0]) === rankAt(stops[1]);
    const durs = [DURS[0], DURS[1], DURS[2] + (antic ? ANTICIPATION : 0)];
    const from = this.pos.map((p) => p % N);
    const to = stops.map((st, i) => { let target = st; while (target < from[i] + N * (3 + i + (i === 2 && antic ? 2 : 0))) target += N; return target; });
    this.anim = { start: this.t, from, to, durs, stops, win: r.payout, bet: r.stake, stopped: [false, false, false], antic };
    this.settle = [-1, -1, -1];
    this.lastWin = 0; this.winCells = 0; this.winRow = -1;
    this.message = '';
    this.leverT = this.t;
    this.host.result.clear();
    s.audio.reelStart();
  }

  /** Cases gagnantes de la ligne (même règle que l'autorité : 3 identiques, ou 1–2 symboles de rang 0 en tête). */
  private winningCells(stops: number[]): { n: number; row: number } {
    const [a, b, c] = stops.map((x) => rankAt(x));
    if (a === b && b === c) return { n: 3, row: a };
    if (a === 0 && b === 0) return { n: 2, row: -2 };
    if (a === 0) return { n: 1, row: -1 };
    return { n: 0, row: -3 };
  }

  update(dt: number): void {
    this.t += dt;
    const s = this.host.s;
    if (this.anim) {
      const an = this.anim;
      let done = true;
      for (let i = 0; i < 3; i++) {
        const p = Math.min(1, (this.t - an.start) / an.durs[i]);
        // Démarrage franc (élan) puis long ralentissement
        const e = p < 0.08 ? 0.5 * (p / 0.08) * (p / 0.08) * 0.08 : 0.04 + 0.96 * easeOutCubic((p - 0.08) / 0.92);
        const np = an.from[i] + (an.to[i] - an.from[i]) * e;
        this.speed[i] = dt > 0 ? Math.abs(np - this.pos[i]) / dt : 0;
        if (Math.floor(np) !== Math.floor(this.pos[i]) && p < 1) { this.ticks[i]++; if (this.ticks[i] % 3 === 0) s.audio.tick(); }
        this.pos[i] = np;
        if (p >= 1 && !an.stopped[i]) {
          an.stopped[i] = true; this.settle[i] = this.t + SETTLE; this.speed[i] = 0;
          s.audio.reelStop(i === 2);
          if (i === 1 && an.antic) s.audio.anticipation(ANTICIPATION + 0.4);
        }
        if (p < 1) done = false;
      }
      if (done) {
        this.pos = an.stops.slice();
        const win = an.win, net = win - an.bet;
        this.lastWin = win;
        const wc = this.winningCells(an.stops);
        this.winCells = win > 0 ? wc.n : 0; this.winRow = wc.row; this.winAt = this.t;
        this.message = win === 0 ? 'Pas de gain cette fois.' : net > 0 ? `Gagné ${win} jetons !` : 'Mise rendue.';
        this.host.celebrate(net, an.bet, win > 0 ? `${this.winCells} symbole${this.winCells > 1 ? 's' : ''} · ×${Math.round((win / an.bet) * 10) / 10}` : '');
        this.anim = null;
      }
    }
    this.betCtl.locked = !!this.anim || this.waiting;
    this.betCtl.sync();
    this.spinBtn.enabled = !this.anim && !this.waiting && s.chips.canAfford(this.betCtl.amount);
    this.spinBtn.label = `Tourner · ${this.betCtl.amount}`;
  }

  /** Caisson, fenêtre et tambours (dessous) puis ombres et vitre (dessus) : pré-rendus, redessinés seulement si la taille change. */
  private cab: { key: string; under: ReturnType<typeof makeCanvas>; over: ReturnType<typeof makeCanvas>; x: number; y: number; w: number; h: number } | null = null;

  private cabinet(mx: number, my: number, mw: number, mh: number, top: number, rh: number, rw: number, gap: number, ui: number, dpr: number) {
    const key = `${mx},${my},${mw},${mh},${dpr}`;
    if (this.cab?.key === key) return this.cab;
    const col = this.def.colors, pad = 24 * ui;
    const x0 = mx - pad, y0 = my - pad, W = mw + pad * 2, H = mh + pad * 2;
    const mk = () => { const c = makeCanvas(Math.ceil(W * dpr), Math.ceil(H * dpr)); c.ctx.scale(dpr, dpr); c.ctx.translate(-x0, -y0); return c; };
    const under = mk(), over = mk(), g = under.ctx, o = over.ctx;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 18 * ui; g.shadowOffsetY = 6 * ui;
    roundRect(g, mx, my, mw, mh, 24 * ui);
    const body = g.createLinearGradient(mx, my, mx + mw, my + mh);
    body.addColorStop(0, col.body); body.addColorStop(0.55, '#1a120c'); body.addColorStop(1, '#0c0806');
    g.fillStyle = body; g.fill();
    g.restore();
    roundRect(g, mx, my, mw, mh, 24 * ui); g.strokeStyle = this.chrome(g, mx, my, mw, mh); g.lineWidth = 3.5 * ui; g.stroke();
    // Nom du thème en néon (halo cuit dans l'image)
    g.save(); g.shadowColor = col.light; g.shadowBlur = 10 * ui;
    drawLabel(g, this.def.name.toUpperCase(), mx + mw / 2, my + 22 * ui, 15 * ui, col.light, 'center', 900);
    g.restore();
    roundRect(g, mx + 14 * ui, top - 6 * ui, mw - 28 * ui, rh + 12 * ui, 14 * ui); g.fillStyle = '#07060a'; g.fill();
    for (let i = 0; i < 3; i++) {
      const rx = mx + 20 * ui + i * (rw + gap);
      roundRect(g, rx, top, rw, rh, 10 * ui);
      const drum = g.createLinearGradient(0, top, 0, top + rh);
      drum.addColorStop(0, '#d9d0bd'); drum.addColorStop(0.5, '#fffaf0'); drum.addColorStop(1, '#d9d0bd');
      g.fillStyle = drum; g.fill();
      // Ombre de courbure du tambour (dessus)
      o.save(); roundRect(o, rx, top, rw, rh, 10 * ui); o.clip();
      const shade = o.createLinearGradient(0, top, 0, top + rh);
      shade.addColorStop(0, 'rgba(0,0,0,0.5)'); shade.addColorStop(0.22, 'rgba(0,0,0,0)'); shade.addColorStop(0.78, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.5)');
      o.fillStyle = shade; o.fillRect(rx, top, rw, rh); o.restore();
    }
    // Flèches de la ligne de paiement et reflet de la vitre (dessus)
    for (const side of [-1, 1]) {
      const ax = side < 0 ? mx + 10 * ui : mx + mw - 10 * ui;
      o.fillStyle = PAL.gold; o.beginPath(); o.moveTo(ax, top + rh / 2 - 7 * ui); o.lineTo(ax + side * -9 * ui, top + rh / 2); o.lineTo(ax, top + rh / 2 + 7 * ui); o.fill();
    }
    o.save(); roundRect(o, mx + 14 * ui, top - 6 * ui, mw - 28 * ui, rh + 12 * ui, 14 * ui); o.clip();
    const gl = o.createLinearGradient(mx, top, mx + mw * 0.6, top + rh);
    gl.addColorStop(0, 'rgba(255,255,255,0.14)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.02)'); gl.addColorStop(0.36, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    o.fillStyle = gl; o.fillRect(mx, top - 6 * ui, mw, rh + 12 * ui); o.restore();
    this.cab = { key, under, over, x: x0, y: y0, w: W, h: H };
    return this.cab;
  }

  private chrome(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): CanvasGradient {
    const c = ctx.createLinearGradient(x, y, x + w, y + h);
    c.addColorStop(0, '#f4f1ea'); c.addColorStop(0.3, '#8d8a85'); c.addColorStop(0.5, '#e6e2d8'); c.addColorStop(0.75, '#6c6a66'); c.addColorStop(1, '#cfcbc2');
    return c;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, m = this.machine, lowFx = this.host.s.lowFx;
    const mw = Math.min(m.w - 30 * ui, m.h * 1.35), mx = m.x + (m.w - mw) / 2 - 8 * ui;
    const top = m.y + 56 * ui, rh = m.h - 80 * ui, gap = 10 * ui;
    const rw = (mw - 40 * ui - gap * 2) / 3, cell = rh / 3;
    const dpr = Math.max(1, Math.abs(ctx.getTransform().a));
    const C = this.cabinet(mx, m.y, mw, m.h, top, rh, rw, gap, ui, dpr);
    ctx.drawImage(C.under.canvas as CanvasImageSource, C.x, C.y, C.w, C.h);
    // Fronton : le néon s'emballe en cas de gain
    if (this.winCells > 0 && this.t - this.winAt < 3) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin((this.t - this.winAt) * 10);
      drawLabel(ctx, this.def.name.toUpperCase(), mx + mw / 2, m.y + 22 * ui, 15 * ui, '#ffffff', 'center', 900);
      ctx.globalAlpha = 1;
    }
    // Rampe d'ampoules : chenillard (rapide pendant la rotation, alterné en cas de gain)
    const bulbs = 14, spinning = !!this.anim, winning = this.winCells > 0 && this.t - this.winAt < 3;
    for (let i = 0; i < bulbs; i++) {
      const on = winning ? (i + Math.floor(this.t * 8)) % 2 === 0 : (i + Math.floor(this.t * (spinning ? 14 : 3))) % 3 === 0;
      const bx = mx + 20 * ui + i * ((mw - 40 * ui) / (bulbs - 1)), by = m.y + 42 * ui;
      if (on && !lowFx) { ctx.fillStyle = 'rgba(255,240,180,0.25)'; ctx.beginPath(); ctx.arc(bx, by, 7 * ui, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = on ? '#fff6c2' : 'rgba(255,240,180,0.25)';
      ctx.beginPath(); ctx.arc(bx, by, 3 * ui, 0, Math.PI * 2); ctx.fill();
    }
    const symPx = Math.round(Math.min(cell, rw) * 0.95 * dpr), symS = symPx / dpr;
    for (let i = 0; i < 3; i++) {
      const rx = mx + 20 * ui + i * (rw + gap);
      ctx.save();
      ctx.beginPath(); ctx.rect(rx, top, rw, rh); ctx.clip();
      // Petit rebond à l'arrêt : le rouleau dépasse légèrement puis revient
      let p = this.pos[i];
      if (this.settle[i] > this.t) { const k = 1 - (this.settle[i] - this.t) / SETTLE; p += Math.sin(k * Math.PI) * 0.12 * (1 - k * 0.5); }
      const base = Math.floor(p), frac = p - base;
      const blur = Math.min(1, Math.max(0, (this.speed[i] - 4) / 14));
      for (let k = -2; k <= 2; k++) {
        const sym = this.strip[((base + k) % N + N) % N];
        const cy = top + rh / 2 - k * cell + frac * cell;
        const img = symbolSprite(sym, symPx).canvas as CanvasImageSource;
        if (blur > 0.15 && !lowFx) {
          // Flou de mouvement : traînée verticale du symbole
          ctx.globalAlpha = 0.35 * blur;
          ctx.drawImage(img, rx + rw / 2 - symS / 2, cy - symS / 2 - cell * 0.18 * blur, symS, symS);
          ctx.globalAlpha = 1 - 0.45 * blur;
        }
        ctx.drawImage(img, rx + rw / 2 - symS / 2, cy - symS / 2, symS, symS);
        ctx.globalAlpha = 1;
      }
      // Suspense : le dernier rouleau s'illumine pendant qu'il tourne encore
      if (i === 2 && this.anim?.antic && this.anim.stopped[1] && !this.anim.stopped[2]) {
        ctx.fillStyle = `rgba(255,214,120,${0.12 + 0.1 * Math.sin(this.t * 16)})`; ctx.fillRect(rx, top, rw, rh);
      }
      ctx.restore();
    }
    ctx.drawImage(C.over.canvas as CanvasImageSource, C.x, C.y, C.w, C.h);
    for (let i = 0; i < 3; i++) {
      const rx = mx + 20 * ui + i * (rw + gap);
      if (i === 2 && this.anim?.antic && this.anim.stopped[1] && !this.anim.stopped[2]) {
        ctx.strokeStyle = `rgba(255,214,120,${0.6 + 0.4 * Math.sin(this.t * 16)})`; ctx.lineWidth = 3 * ui;
        roundRect(ctx, rx - 2, top - 2, rw + 4, rh + 4, 11 * ui); ctx.stroke();
      }
      // Case gagnante : cadre doré qui pulse
      if (i < this.winCells) {
        const k = this.t - this.winAt, pulse = 0.5 + 0.5 * Math.sin(k * 8);
        if (!lowFx) { ctx.strokeStyle = `rgba(255,214,120,${0.25 * pulse})`; ctx.lineWidth = 9 * ui; roundRect(ctx, rx + 3 * ui, top + rh / 2 - cell / 2 + 2 * ui, rw - 6 * ui, cell - 4 * ui, 8 * ui); ctx.stroke(); }
        ctx.strokeStyle = `rgba(255,214,120,${0.65 + 0.35 * pulse})`; ctx.lineWidth = 3 * ui;
        roundRect(ctx, rx + 3 * ui, top + rh / 2 - cell / 2 + 2 * ui, rw - 6 * ui, cell - 4 * ui, 8 * ui); ctx.stroke();
      }
    }
    // Ligne de paiement
    ctx.strokeStyle = this.winCells > 0 ? `rgba(255,214,120,${0.6 + Math.sin(this.t * 8) * 0.4})` : 'rgba(255,80,80,0.6)';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mx + 12 * ui, top + rh / 2); ctx.lineTo(mx + mw - 12 * ui, top + rh / 2); ctx.stroke();
    const chrome = '#d8d4cc';
    // Levier (s'abaisse au lancement)
    const lk = this.t - this.leverT, down = lk < 0.5 ? Math.sin(Math.min(1, lk / 0.5) * Math.PI) : 0;
    const lx = mx + mw + 10 * ui, ly0 = m.y + m.h * 0.3, len = m.h * 0.28;
    ctx.fillStyle = chrome; roundRect(ctx, lx - 5 * ui, ly0 + len * 0.9, 12 * ui, 26 * ui, 4 * ui); ctx.fill();
    const tipY = ly0 + len * 0.9 - len * (1 - down * 1.6) ;
    ctx.strokeStyle = chrome; ctx.lineWidth = 5 * ui; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx + 1 * ui, ly0 + len * 0.95); ctx.lineTo(lx + 1 * ui, tipY); ctx.stroke();
    const bg = ctx.createRadialGradient(lx - 3 * ui, tipY - 3 * ui, 1, lx + 1 * ui, tipY, 9 * ui);
    bg.addColorStop(0, '#ff9a9a'); bg.addColorStop(1, '#8a1020');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(lx + 1 * ui, tipY, 8 * ui, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'butt';
    if (this.message && !this.host.result.active && !this.anim) drawPill(ctx, this.message, mx + mw / 2, m.y + m.h - 4 * ui, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text, mw - 20 * ui);

    // Table des gains (la ligne gagnée s'illumine)
    const T = this.table, d = this.def;
    roundRect(ctx, T.x, T.y, T.w, T.h, 14 * ui); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.strokeStyle = 'rgba(239,220,174,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    drawLabel(ctx, 'Table des gains (× mise)', T.x + T.w / 2, T.y + 18 * ui, 13 * ui, PAL.gold);
    const rows: Array<[string[], string, number]> = [5, 4, 3, 2, 1, 0].map((r) => [[d.symbols[r], d.symbols[r], d.symbols[r]], `×${d.pay[r]}`, r]);
    rows.push([[d.symbols[0], d.symbols[0]], `×${d.two}`, -2], [[d.symbols[0]], `×${d.one}`, -1]);
    const lh = Math.min(30 * ui, (T.h - 54 * ui) / rows.length);
    const tPx = Math.round(lh * 0.95 * dpr), tS = tPx / dpr;
    rows.forEach(([syms, txt, id], i) => {
      const y = T.y + 40 * ui + i * lh + lh / 2;
      const hot = this.winCells > 0 && id === this.winRow;
      if (hot) {
        roundRect(ctx, T.x + 6 * ui, y - lh / 2 + 1, T.w - 12 * ui, lh - 2, 6 * ui);
        ctx.fillStyle = `rgba(212,175,90,${0.25 + 0.15 * Math.sin((this.t - this.winAt) * 8)})`; ctx.fill();
      }
      syms.forEach((sy, k) => ctx.drawImage(symbolSprite(sy, tPx).canvas as CanvasImageSource, T.x + 22 * ui + k * lh * 0.95 - tS / 2, y - tS / 2, tS, tS));
      drawLabel(ctx, txt, T.x + T.w - 14 * ui, y, 13 * ui, hot ? LUXE.champagne : PAL.text, 'right');
    });
    drawLabel(ctx, `Taux de retour théorique ${(machineRtp(d) * 100).toFixed(1).replace('.', ',')} %`, T.x + T.w / 2, T.y + T.h - 12 * ui, 10 * ui, PAL.textDim, 'center', 600);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}

const SYMBOL_NAMES: Record<string, string> = { perle: 'perles', piece: 'pièces', poisson: 'poissons' };
