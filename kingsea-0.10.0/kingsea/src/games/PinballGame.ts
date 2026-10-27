// Flipper maritime : 3 balles. Touche la moitié gauche ou droite de l'écran pour actionner les batteurs
// (les deux à la fois possible). Balle sur le ressort : garde le doigt appuyé pour charger, relâche pour lancer.
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { ArcadeCard } from './arcade';
import { flipperTip, LANES, LANE_Y, launch, newPinState, PB, resetBall, stepPinball, WALLS, type PinState } from './logic/pinball';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const BALLS = 3;

export class PinballGame implements MiniGame {
  readonly id = 'pinball';
  readonly title = 'Flipper maritime';
  readonly bg: [string, string] = ['#04203a', '#010812'];
  readonly rules =
    '3 balles. Ne laisse pas la balle tomber entre les batteurs !\n• Lancer : garde le doigt appuyé n’importe où pour comprimer le ressort, relâche pour lancer.\n' +
    '• Batteurs : touche la moitié gauche ou droite de l’écran (les deux en même temps si besoin).\n' +
    '• Champignons : 100 · lance-balles : 10 · couloirs du haut : 50 ; allume les trois pour +500 et augmenter le multiplicateur (×5 max).\nRécompense : 1 KSCoin pour 500 points (plafond quotidien commun).';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private startBtn!: Button;
  private card!: ArcadeCard;
  private st: PinState = newPinState();
  private phase: 'ready' | 'play' | 'over' = 'ready';
  private balls = BALLS;
  private charge: { id: number; t: number } | null = null;
  private presses = new Map<number, 'left' | 'right'>();
  private view = { x: 0, y: 0, s: 1 };
  private drainT = 0;
  private compact = false;
  private acc = 0;
  private handler: PointerHandler = { onDown: (p) => this.down(p), onUp: (p) => this.up(p) };

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.startBtn = makeButton({ id: 'start', label: 'Commencer', style: 'gold', fontSize: 18, onTap: () => this.start() });
    this.layer.buttons = [this.startBtn];
    this.card = new ArcadeCard(host.s, 'pinball', this.title);
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    // Portrait : le plateau prend toute la largeur, scores et consignes dans une bande au-dessus
    this.compact = a.w < a.h * 1.1;
    if (this.compact) {
      const top = 64 * ui, s = Math.min((a.h - top - 6 * ui) / PB.H, (a.w - 16 * ui) / PB.W);
      this.view = { x: a.x + (a.w - PB.W * s) / 2, y: a.y + top + (a.h - top - PB.H * s) / 2, s };
    } else {
      const s = Math.min((a.h - 6 * ui) / PB.H, (a.w * 0.6) / PB.W);
      this.view = { x: a.x + (a.w - PB.W * s) / 2, y: a.y + (a.h - PB.H * s) / 2, s };
    }
    this.card.place(a, ui, this.startBtn);
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }
  canQuit() { return { ok: true as const }; }

  private start(): void { this.st = newPinState(); this.balls = BALLS; this.phase = 'play'; this.startBtn.visible = false; }

  private get onPlunger(): boolean { return this.phase === 'play' && !this.st.inPlay && !this.st.drained; }

  private down(p: PointerInfo): boolean {
    if (this.phase !== 'play') return false;
    if (this.onPlunger) { if (!this.charge) this.charge = { id: p.id, t: 0 }; return true; }
    const a = this.host.area;
    this.presses.set(p.id, p.x < a.x + a.w / 2 ? 'left' : 'right');
    this.syncFlippers();
    return true;
  }
  private up(p: PointerInfo): void {
    if (this.charge && this.charge.id === p.id) {
      if (this.onPlunger) { launch(this.st, this.power); this.host.s.audio.roll(); }
      this.charge = null;
    }
    if (this.presses.delete(p.id)) this.syncFlippers();
  }
  private syncFlippers(): void {
    const sides = new Set(this.presses.values());
    for (const f of this.st.flippers) {
      const was = f.pressed; f.pressed = sides.has(f.side);
      if (f.pressed && !was) this.host.s.audio.knock(0.6);
    }
  }
  /** Force du lanceur : monte en 1,2 s puis reste au maximum. */
  private get power(): number { return this.charge ? Math.min(1, this.charge.t / 1.2) : 0; }

  update(dt: number): void {
    const s = this.host.s;
    if (this.charge) this.charge.t += dt;
    if (this.phase !== 'play') return;
    // Pas fixe de 1/120 s pour une physique identique quelle que soit la cadence d'affichage
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= 1 / 120) {
      this.acc -= 1 / 120;
      const ev = stepPinball(this.st, 1 / 120, 4);
      if (ev.bumper) s.audio.coin();
      if (ev.sling) s.audio.knock(1);
      if (ev.lane) s.audio.ding();
    }
    if (this.st.drained) {
      this.drainT += dt;
      if (this.drainT === dt) s.audio.lose();
      if (this.drainT > 1.1) {
        this.drainT = 0; this.balls--;
        if (this.balls <= 0) {
          this.phase = 'over'; this.presses.clear(); this.syncFlippers();
          this.card.finish(this.st.score, 'points');
          this.startBtn.label = 'Rejouer'; this.startBtn.visible = true;
        } else { resetBall(this.st); this.st.multiplier = 1; }
      }
    }
  }

  private X(x: number) { return this.view.x + x * this.view.s; }
  private Y(y: number) { return this.view.y + y * this.view.s; }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, s = this.view.s, st = this.st, a = this.host.area;
    // Plateau
    const g = ctx.createLinearGradient(0, this.Y(0), 0, this.Y(PB.H));
    g.addColorStop(0, '#0b4f6c'); g.addColorStop(1, '#06243a');
    ctx.fillStyle = g; ctx.fillRect(this.X(10), this.Y(0), (PB.W - 10) * s, PB.H * s);
    // Décor : vagues et pieuvre stylisée
    ctx.strokeStyle = 'rgba(111,243,255,0.12)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); for (let x = 12; x < 268; x += 6) ctx.lineTo(this.X(x), this.Y(290 + i * 14 + Math.sin(x / 14 + i) * 4)); ctx.stroke(); }
    drawLabel(ctx, 'KS', this.X(150), this.Y(300), 30 * s, 'rgba(229,181,74,0.25)', 'center', 900);
    // Murs
    ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = Math.max(2, 3 * s); ctx.lineCap = 'round';
    for (const w of WALLS) {
      ctx.strokeStyle = w.kick ? '#ff3fa4' : '#6ff3ff';
      ctx.lineWidth = Math.max(2, (w.thick ?? 1) * 2 * s + (w.kick ? 2 : 0));
      ctx.beginPath(); ctx.moveTo(this.X(w.ax), this.Y(w.ay)); ctx.lineTo(this.X(w.bx), this.Y(w.by)); ctx.stroke();
    }
    // Couloirs du haut
    LANES.forEach((x, i) => {
      ctx.fillStyle = st.lanes[i] ? PAL.goldLight : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(this.X(x), this.Y(LANE_Y + 10), 5 * s, 0, Math.PI * 2); ctx.fill();
    });
    // Champignons
    for (const b of st.bumpers) {
      const k = b.flash > 0 ? 1 : 0;
      ctx.fillStyle = k ? '#fff6c2' : '#ff6f91'; ctx.beginPath(); ctx.arc(this.X(b.x), this.Y(b.y), b.r * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3 * s; ctx.stroke();
      ctx.fillStyle = '#7b2d5c'; ctx.beginPath(); ctx.arc(this.X(b.x), this.Y(b.y), b.r * s * 0.45, 0, Math.PI * 2); ctx.fill();
      drawLabel(ctx, '100', this.X(b.x), this.Y(b.y), 6 * s * 1.4, '#fff');
    }
    // Batteurs
    for (const f of st.flippers) {
      const t = flipperTip(f);
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 11 * s;
      ctx.beginPath(); ctx.moveTo(this.X(f.px), this.Y(f.py)); ctx.lineTo(this.X(t.x), this.Y(t.y)); ctx.stroke();
      ctx.fillStyle = PAL.goldDark; ctx.beginPath(); ctx.arc(this.X(f.px), this.Y(f.py), 4 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = 'butt';
    // Ressort du lanceur
    const comp = this.power * 22;
    ctx.strokeStyle = '#9aa6b2'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = 0; i <= 8; i++) ctx.lineTo(this.X(285 + (i % 2 ? 7 : -7)), this.Y(510 + comp + i * ((28 - comp) / 8))); ctx.stroke();
    // Balle
    if (!st.drained) {
      const by = this.onPlunger ? 500 + comp : st.ball.y;
      const gr = ctx.createRadialGradient(this.X(st.ball.x) - 2, this.Y(by) - 2, 1, this.X(st.ball.x), this.Y(by), PB.R * s);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8a96a6');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(this.X(st.ball.x), this.Y(by), PB.R * s, 0, Math.PI * 2); ctx.fill();
    }
    // Panneau des scores : à gauche du plateau (paysage) ou en bande au-dessus (portrait)
    if (this.compact) {
      const y1 = a.y + 18 * ui, y2 = a.y + 44 * ui;
      drawLabel(ctx, `SCORE ${st.score.toLocaleString('fr-FR')}`, a.x + 12 * ui, y1, 17 * ui, PAL.goldLight, 'left', 900);
      drawLabel(ctx, `Balles ${'●'.repeat(Math.max(0, this.balls))}`, a.x + a.w - 12 * ui, y1, 14 * ui, PAL.text, 'right');
      const hint = this.onPlunger ? (this.charge ? 'Relâche pour lancer' : 'Appuie et garde le doigt') : this.phase === 'play' ? '◀ gauche  |  droite ▶' : '';
      drawLabel(ctx, `×${st.multiplier}`, a.x + 12 * ui, y2, 13 * ui, st.multiplier > 1 ? PAL.success : PAL.textDim, 'left');
      if (hint) drawLabel(ctx, hint, a.x + a.w / 2, y2, 12.5 * ui, PAL.text, 'center');
      if (this.onPlunger) {
        const bw = 70 * ui, bx = a.x + a.w - 12 * ui - bw;
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx, y2 - 5 * ui, bw, 10 * ui);
        ctx.fillStyle = PAL.goldLight; ctx.fillRect(bx, y2 - 5 * ui, bw * this.power, 10 * ui);
      }
    } else {
      const px = this.X(0) - 12 * ui;
      drawLabel(ctx, 'SCORE', px, a.y + 22 * ui, 12 * ui, PAL.textDim, 'right');
      drawLabel(ctx, st.score.toLocaleString('fr-FR'), px, a.y + 44 * ui, 22 * ui, PAL.goldLight, 'right', 900);
      drawLabel(ctx, `Balles : ${'●'.repeat(Math.max(0, this.balls))}`, px, a.y + 74 * ui, 14 * ui, PAL.text, 'right');
      drawLabel(ctx, `Multiplicateur ×${st.multiplier}`, px, a.y + 98 * ui, 13 * ui, st.multiplier > 1 ? PAL.success : PAL.textDim, 'right');
      const rx = this.X(PB.W) + 12 * ui;
      if (this.onPlunger) {
        drawLabel(ctx, this.charge ? 'Relâche pour lancer' : 'Appuie et garde le doigt', rx, a.y + a.h * 0.7, 13 * ui, PAL.text, 'left');
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(rx, a.y + a.h * 0.75, 100 * ui, 12 * ui);
        ctx.fillStyle = PAL.goldLight; ctx.fillRect(rx, a.y + a.h * 0.75, 100 * ui * this.power, 12 * ui);
      } else if (this.phase === 'play') {
        drawLabel(ctx, '◀ gauche  |  droite ▶', rx, a.y + a.h * 0.85, 12 * ui, PAL.textDim, 'left');
      }
    }
    if (this.phase === 'ready' || this.phase === 'over') this.card.render(ctx, ui, this.phase === 'over');
    if (st.drained && this.phase === 'play') drawPill(ctx, this.balls > 1 ? 'Balle perdue !' : 'Dernière balle perdue', a.x + a.w / 2, a.y + a.h * 0.42, 15 * ui, 'rgba(192,57,43,0.85)', '#fff');
    this.layer.render(ctx, ui);
  }
}
