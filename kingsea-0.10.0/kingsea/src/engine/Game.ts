// Boucle de jeu, gestion des scènes, transitions et cycle de vie mobile.
import { Diagnostics } from '../systems/Diagnostics';
import { Input } from './Input';
import { Controls } from './Controls';
import type { Scene } from './Scene';
import { Viewport } from './Viewport';
import { drawKSEmblem, LUXE } from '../art/brand';

/**
 * Styles de transition : fondu, vague qui monte (scènes), portes d'ascenseur, écran de chargement de l'ascenseur
 * (logo KS animé, indicateur d'étage, barre de chargement), iris (mini-jeux).
 */
export type TransitionStyle = 'fade' | 'wave' | 'doors' | 'elevator' | 'iris';

/** Trajet d'ascenseur affiché pendant le chargement : arrêts (du bas vers le haut), départ, arrivée. */
export interface ElevatorRide { stops: string[]; from: number; to: number; label: string }

/** Durée minimale de l'écran de chargement d'étage (un chargement très rapide ne fait pas « clignoter » l'écran). */
const ELEVATOR_MIN_HOLD = 0.9;

export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: Viewport;
  readonly input: Input;
  readonly controls: Controls;
  private scene: Scene | null = null;
  private last = 0;
  private running = false;
  private rafId = 0;
  private fade = { alpha: 1, target: 0, speed: 3, pending: null as null | (() => void), style: 'fade' as TransitionStyle, t: 0, hold: 0, holdMax: 0, start: 0 };
  /** Texte affiché pendant une transition (étage d'arrivée…). */
  transitionLabel: string | null = null;
  /** Trajet d'ascenseur (écran de chargement « elevator »). */
  elevatorRide: ElevatorRide | null = null;
  /** Problème survenu pendant le chargement (affiché, puis on rouvre sur la scène courante : jamais d'écran figé). */
  private transitionError: string | null = null;
  /** Effets réduits : les transitions deviennent de simples fondus. */
  lowFx = false;
  /** Cadence maximale (30 en économie d'énergie). */
  maxFps = 60;
  /** Après ce délai sans action du joueur, l'affichage passe à 30 images/s (batterie). */
  idleAfterMs = 20_000;
  /** Qualité abaissée automatiquement (appareil qui peine). */
  autoLow = false;
  autoQuality = true;
  onAutoLow: Array<() => void> = [];
  private slowAcc = { frames: 0, slow: 0, since: 0 };
  private lastDrawn = 0;
  /** Mesures de diagnostic (fps). */
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  /** Hooks de cycle de vie (sauvegarde, audio). */
  onPause: Array<() => void> = [];
  onResume: Array<() => void> = [];

  constructor(readonly canvas: HTMLCanvasElement, probe: HTMLElement | null) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible sur cet appareil.');
    this.ctx = ctx;
    this.viewport = new Viewport(canvas, probe);
    this.input = new Input(canvas);
    this.controls = new Controls(this.input);
    this.viewport.onResize(() => this.scene?.onResize?.());

    // Cycle de vie : mise en arrière-plan / retour (navigateur et WebView Capacitor).
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.resume()));
    window.addEventListener('pagehide', () => this.pause());
    window.addEventListener('pageshow', () => this.resume());
  }

  get current(): Scene | null { return this.scene; }

  start(first: Scene): void {
    this.setScene(first);
    this.fade.alpha = 1; this.fade.target = 0;
    this.resume();
  }

  /** Change de scène avec un fondu au noir. */
  goto(next: Scene | (() => Scene), speed = 3.2, style: TransitionStyle = 'wave'): void {
    if (this.fade.pending) return; // transition déjà en cours : on ignore les doubles appuis
    this.fade.speed = speed; this.fade.style = style;
    this.fade.target = 1;
    this.fade.pending = () => this.setScene(typeof next === 'function' ? next() : next);
  }

  /** Fondu sans changement de scène (ex. ascenseur). */
  fadeThrough(midway: () => void, speed = 3.2, style: TransitionStyle = 'fade'): void {
    if (this.fade.pending) return;
    this.fade.speed = speed; this.fade.style = style; this.fade.target = 1; this.fade.pending = midway; this.fade.start = this.fade.t;
    this.transitionError = null;
  }

  get transitioning(): boolean { return this.fade.pending !== null || this.fade.alpha > 0.02 || this.fade.hold > 0; }

  back(): void { this.scene?.onBack?.(); }

  private setScene(s: Scene): void {
    this.input.reset();
    this.scene?.exit();
    this.scene = s;
    s.enter();
    this.resetQualityWatch();
    this.input.setHandlers(s.pointerHandlers());
  }

  /** À rappeler quand une scène modifie sa liste de handlers (ouverture d'un menu). */
  refreshHandlers(): void { if (this.scene) this.input.setHandlers(this.scene.pointerHandlers()); }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.reset();
    for (const f of this.onPause) { try { f(); } catch (e) { console.error(e); } }
  }

  resume(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now(); this.lastDrawn = 0;
    this.slowAcc = { frames: 0, slow: 0, since: this.last + 3000 };
    for (const f of this.onResume) { try { f(); } catch (e) { console.error(e); } }
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    if (!this.running) return;
    // Limitation de cadence : 30 images/s en économie d'énergie ou après un moment sans action
    // (écrans 120 Hz : limités à 60). Les images sautées ne calculent ni ne dessinent rien.
    const idle = now - this.input.lastActivity > this.idleAfterMs && !this.transitioning && this.scene?.idleThrottle !== false;
    const cap = idle ? Math.min(30, this.maxFps) : this.maxFps;
    if (this.lastDrawn && now - this.lastDrawn < 1000 / cap - 3) { this.rafId = requestAnimationFrame((t) => this.frame(t)); return; }
    const interval = this.lastDrawn ? now - this.lastDrawn : 16.7;
    this.lastDrawn = now;
    const t0 = performance.now();
    // dt borné : évite les "téléportations" après un ralentissement ou un retour d'arrière-plan.
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }

    this.controls.poll();
    if (this.controls.pressed('back')) this.back();

    try {
      this.scene?.update(dt);
      this.updateFade(dt);
      const { ctx, viewport: v } = this;
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      this.scene?.render(ctx);
      if (this.fade.alpha > 0.001) this.renderTransition(ctx, v.width, v.height);
    } catch (err) {
      console.error('[KingSea] erreur dans la boucle de jeu', err);
      Diagnostics.recordError(err);
    }
    this.input.endFrame();
    const work = performance.now() - t0;
    Diagnostics.recordFrame(work, interval);
    if (cap >= 60) this.watchQuality(now, interval, work);
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  /** Si plus de la moitié des images sont lentes pendant 4 s, la qualité baisse d'elle-même (une fois). */
  private watchQuality(now: number, interval: number, work: number): void {
    if (!this.autoQuality || this.autoLow || this.transitioning || now < this.slowAcc.since) return;
    const a = this.slowAcc;
    a.frames++; if (interval > 26 || work > 20) a.slow++;
    if (a.frames >= 240) {
      if (a.slow / a.frames > 0.5) {
        this.autoLow = true;
        for (const f of this.onAutoLow) { try { f(); } catch (e) { console.error(e); } }
      }
      a.frames = 0; a.slow = 0;
    }
  }

  /** Nouvelle scène ou réglage changé : la mesure reprend après un temps de chauffe. */
  resetQualityWatch(): void { this.slowAcc = { frames: 0, slow: 0, since: performance.now() + 3000 }; }

  private renderTransition(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const f = this.fade, a = f.alpha, k = a * a * (3 - 2 * a); // adouci
    const style = this.lowFx && f.style !== 'elevator' ? 'fade' : f.style;
    if (style === 'fade') { ctx.fillStyle = `rgba(8,6,10,${a})`; ctx.fillRect(0, 0, w, h); if (this.transitionError) this.renderLoadError(ctx, w, h, a); }
    else if (style === 'elevator') this.renderElevator(ctx, w, h, k);
    else if (style === 'wave') {
      // L'eau monte et recouvre l'écran, avec une crête ondulante et des bulles
      const top = h * (1 - k * 1.15);
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, '#1fc7c1'); g.addColorStop(0.08, '#0b5ea8'); g.addColorStop(1, '#030e1e');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, top + Math.sin(x / 70 + f.t * 6) * 10 + Math.sin(x / 23 - f.t * 4) * 3);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, top + Math.sin(x / 70 + f.t * 6) * 10 + Math.sin(x / 23 - f.t * 4) * 3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,245,255,0.5)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) { const bx = ((i * 0.37) % 1) * w, by = top + 20 + ((i * 53 + f.t * 160) % Math.max(1, h - top)); if (by < h) { ctx.beginPath(); ctx.arc(bx + Math.sin(f.t * 3 + i) * 8, by, 2 + (i % 4), 0, Math.PI * 2); ctx.stroke(); } }
    } else if (style === 'doors') {
      // Portes d'ascenseur dorées qui se referment, numéro d'étage au centre
      const half = (w / 2) * k;
      for (const side of [0, 1]) {
        const x = side ? w - half : 0;
        const g = ctx.createLinearGradient(x, 0, x + half, 0);
        g.addColorStop(0, '#2a3f5c'); g.addColorStop(0.5, '#4d6a8d'); g.addColorStop(1, '#2a3f5c');
        ctx.fillStyle = g; ctx.fillRect(x, 0, half, h);
        ctx.fillStyle = '#e5b54a'; ctx.fillRect(side ? x : x + half - 4, 0, 4, h);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + half * 0.2, 0, 3, h);
      }
      if (k > 0.85 && this.transitionLabel) {
        ctx.globalAlpha = (k - 0.85) / 0.15;
        ctx.fillStyle = 'rgba(8,6,10,0.75)'; const bw = Math.min(w * 0.7, 360), bh = 64;
        ctx.beginPath(); ctx.roundRect?.(w / 2 - bw / 2, h / 2 - bh / 2, bw, bh, 16); ctx.fill();
        ctx.fillStyle = '#ffe29a'; ctx.font = '800 22px "Avenir Next", "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.transitionLabel, w / 2, h / 2, bw - 20);
        ctx.globalAlpha = 1;
      }
    } else {
      // Iris : un cercle se referme sur le centre
      const r = Math.hypot(w, h) * 0.55 * (1 - k);
      ctx.fillStyle = '#030e1e'; ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2, true); ctx.fill();
      ctx.strokeStyle = '#e5b54a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2); ctx.stroke();
    }
  }

  /**
   * Écran de chargement de l'ascenseur : les portes dorées se ferment, puis le logo KS animé apparaît avec
   * l'étage d'arrivée, l'indicateur lumineux qui défile d'un étage à l'autre et une barre de chargement.
   */
  private renderElevator(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
    const f = this.fade, ride = this.elevatorRide, low = this.lowFx;
    // Portes (simple fondu avec « Effets réduits »)
    if (low) { ctx.fillStyle = `rgba(11,10,13,${k})`; ctx.fillRect(0, 0, w, h); }
    else {
      const half = (w / 2) * k;
      for (const side of [0, 1]) {
        const x = side ? w - half : 0;
        const g = ctx.createLinearGradient(x, 0, x + half, 0);
        g.addColorStop(0, '#16131a'); g.addColorStop(0.5, '#2a2430'); g.addColorStop(1, '#16131a');
        ctx.fillStyle = g; ctx.fillRect(x, 0, half, h);
        ctx.fillStyle = LUXE.gold; ctx.fillRect(side ? x : x + half - 3, 0, 3, h);
        // Motif art déco gravé sur les portes
        ctx.strokeStyle = 'rgba(212,175,90,0.18)'; ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) { const yy = (h / 6) * i; ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + half - 8, yy); ctx.stroke(); }
      }
    }
    if (k < 0.55) return;
    const a = Math.min(1, (k - 0.55) / 0.4);
    const ui = Math.max(0.8, Math.min(1.6, Math.min(w, h) / 420));
    const cx = w / 2, cy = h * 0.42, size = Math.min(h * 0.34, w * 0.5, 230);
    ctx.save();
    ctx.globalAlpha = a;
    // Plaque centrale (cache la jonction des portes derrière le logo et les textes)
    const pw = Math.min(w - 24, 460 * ui), top = cy - size * 0.62, bottom = h * 0.42 + size * 0.5 + 112 * ui;
    ctx.fillStyle = 'rgba(11,10,13,0.94)'; ctx.beginPath(); ctx.roundRect?.(cx - pw / 2, top, pw, bottom - top, 22 * ui); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    // Halo et emblème KS (reflet animé)
    const halo = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 1.1);
    halo.addColorStop(0, 'rgba(212,175,90,0.22)'); halo.addColorStop(1, 'rgba(212,175,90,0)');
    ctx.fillStyle = halo; ctx.fillRect(cx - size * 1.2, cy - size * 1.2, size * 2.4, size * 2.4);
    const pulse = low ? 1 : 1 + Math.sin(f.t * 2.4) * 0.015;
    drawKSEmblem(ctx, cx, cy, size * 0.62 * pulse, low ? 0 : f.t, 'full', false);
    // Étage d'arrivée
    const label = ride?.label ?? this.transitionLabel ?? '';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(20 * ui)}px "Avenir Next", "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = LUXE.champagne;
    if (label) ctx.fillText(label, cx, cy + size * 0.5, w - 40);
    // Indicateur d'étages (comme au-dessus des portes) : la lumière défile du départ à l'arrivée
    const prog = f.holdMax > 0 ? 1 - f.hold / f.holdMax : 0;
    if (ride && ride.stops.length > 1) {
      const n = ride.stops.length, gap = Math.min(46 * ui, (w - 60) / n), y = cy + size * 0.5 + 40 * ui;
      const pos = ride.from + (ride.to - ride.from) * Math.min(1, (f.hold > 0 || f.alpha < 1 ? prog : 0) * 1.15);
      ride.stops.forEach((s, i) => {
        const x = cx + (i - (n - 1) / 2) * gap, lit = Math.max(0, 1 - Math.abs(pos - i) * 1.4);
        ctx.fillStyle = `rgba(255,214,120,${0.12 + lit * 0.88})`;
        ctx.beginPath(); ctx.arc(x, y, 13 * ui, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = i === ride.to ? LUXE.gold : 'rgba(212,175,90,0.4)'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = lit > 0.5 ? '#1a1208' : 'rgba(239,220,174,0.75)';
        ctx.font = `800 ${Math.round((s.length > 2 ? 9 : 11) * ui)}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(s, x, y + 0.5);
      });
      ctx.fillStyle = 'rgba(239,220,174,0.85)'; ctx.font = `700 ${Math.round(14 * ui)}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(ride.to > ride.from ? '▲' : '▼', cx - (n / 2 + 0.6) * gap, y);
    }
    // Barre de chargement (ou message d'erreur)
    const bw = Math.min(260 * ui, w * 0.6), bh = 6 * ui, by = h * 0.42 + size * 0.5 + 76 * ui;
    if (this.transitionError) {
      ctx.fillStyle = '#ff8a8a'; ctx.font = `700 ${Math.round(14 * ui)}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(this.transitionError, cx, by, w - 40);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.roundRect?.(cx - bw / 2, by, bw, bh, bh / 2); ctx.fill();
      // Avant la fin du chargement : segment qui va et vient ; ensuite : remplissage jusqu'au bout
      const loaded = f.pending === null;
      const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0); g.addColorStop(0, '#1fc7c1'); g.addColorStop(1, LUXE.gold);
      ctx.fillStyle = g; ctx.beginPath();
      if (loaded) ctx.roundRect?.(cx - bw / 2, by, Math.max(bh, bw * Math.min(1, 0.35 + prog * 0.65)), bh, bh / 2);
      else { const u = (Math.sin(f.t * 5) + 1) / 2; ctx.roundRect?.(cx - bw / 2 + u * bw * 0.65, by, bw * 0.35, bh, bh / 2); }
      ctx.fill();
      ctx.fillStyle = 'rgba(239,220,174,0.7)'; ctx.font = `600 ${Math.round(12 * ui)}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(loaded && prog > 0.92 ? 'Arrivée' : 'Chargement de l’étage…', cx, by + 20 * ui);
    }
    ctx.restore();
  }

  private renderLoadError(ctx: CanvasRenderingContext2D, w: number, h: number, a: number): void {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ff8a8a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 16px "Avenir Next", "Segoe UI", system-ui, sans-serif'; ctx.fillText(this.transitionError ?? '', w / 2, h / 2, w - 40);
    ctx.restore();
  }

  private updateFade(dt: number): void {
    const f = this.fade;
    f.t += dt;
    if (f.alpha < f.target) {
      f.alpha = Math.min(f.target, f.alpha + dt * f.speed);
      if (f.alpha >= 1 && f.pending) {
        const p = f.pending; f.pending = null;
        // Le chargement ne peut jamais laisser l'écran noir : en cas d'erreur, message puis réouverture
        try { p(); }
        catch (e) { console.error('[KingSea] chargement', e); Diagnostics.recordError(e); this.transitionError = 'Chargement impossible : retour à ta position.'; }
        f.target = 0;
        if (f.style === 'elevator' || this.transitionError) { f.hold = this.transitionError ? 1.8 : ELEVATOR_MIN_HOLD; f.holdMax = f.hold; }
      }
    } else if (f.hold > 0) {
      f.hold = Math.max(0, f.hold - dt); // écran de chargement maintenu (durée minimale)
    } else if (f.alpha > f.target) {
      f.alpha = Math.max(f.target, f.alpha - dt * f.speed);
      if (f.alpha <= 0) { this.transitionLabel = null; this.elevatorRide = null; this.transitionError = null; }
    }
  }
}
