// Circuit KS « Baie Royale » : course automobile de 3 tours contre trois pilotes de l'équipage (IA locale).
// Piste sur une île, entourée de lagons : bandes de sable, jardins de palmiers, dégagements, barrières de pneus,
// vibreurs rouge et blanc dans les virages, ligne de départ en damier sous une arche KS, tribune, phare,
// yachts dans la baie. Vues de dessus ; caméra qui suit la voiture et s'éloigne avec la vitesse.
// Commandes : ◀ ▶ (direction) à gauche, accélérateur et frein à droite (accélération automatique au choix),
// clavier (flèches / ZQSD / WASD), manette (stick, A pour accélérer).
// Score = temps total ; récompense et record validés par l'autorité (arcade, plafond quotidien commun).
import { drawKSEmblem, LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, font, makeButton, type Button } from '../ui/UIKit';
import { ARCADE_INFO, medalFor, submitArcade, type ArcadeResult } from './arcade';
import {
  aiInputs, buildTrack, collideCars, HALF_W, LAPS, makeCars, makeObstacles, MAX_SPEED, pointAt, raceScore, RUNOFF, standings, stepCar, WORLD,
  type Car, type Obstacle, type Track,
} from './logic/racing';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawPill } from './widgets';

type Phase = 'ready' | 'countdown' | 'race' | 'finish' | 'results';
interface Zone { id: 'left' | 'right' | 'gas' | 'brake'; x: number; y: number; w: number; h: number }
interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }
interface Mark { x1: number; y1: number; x2: number; y2: number; a: number }

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`.replace('.', ',');
const MEDALS = ['Bronze', 'Argent', 'Or'];

/** Préférence de session : accélération automatique (mémorisée tant que l'application est ouverte). */
let autoGasPref = true;

export class RacingGame implements MiniGame {
  readonly id = 'racing';
  readonly title = 'Circuit KS · Baie Royale';
  readonly bg: [string, string] = ['#0a2a44', '#03101e'];
  readonly rules =
    `Course de ${LAPS} tours contre trois pilotes de l’équipage, sur le circuit de la Baie Royale.\n` +
    '• Direction : boutons ◀ ▶ à gauche (ou flèches / Q D / A D, ou stick de la manette).\n' +
    '• Accélérer : bouton doré à droite (ou ↑ / Z / W, bouton A) ; Freiner : bouton rouge (ou ↓ / S).\n' +
    '• « Accélération auto » : la voiture accélère seule, tu ne gères que la direction et le frein.\n' +
    '• Reste sur l’asphalte : le sable ralentit, les barrières et les bouées te freinent net.\n' +
    '• Taches d’huile : la voiture glisse. Vagues turbo (chevrons turquoise) : accélération.\n' +
    '• Un tour ne compte que si tu passes par la moitié du circuit (pas de raccourci, pas de marche arrière).\n' +
    'Course locale contre l’ordinateur (pas une course en ligne). Ton temps total est enregistré ; récompense en KSCoins plafonnée par jour.';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private track: Track = buildTrack();
  private obstacles: Obstacle[] = makeObstacles(this.track);
  private cars: Car[] = [];
  private phase: Phase = 'ready';
  private time = 0;
  private countdown = 0;
  private finishT = 0;
  private cam = { x: 0, y: 0, z: 1, shake: 0 };
  private zones: Zone[] = [];
  private held = new Map<number, Zone['id']>();
  private autoGas = autoGasPref;
  private puffs: Puff[] = [];
  private marks: Mark[] = [];
  private result: ArcadeResult | null = null;
  private lapFlash = 0;
  private lapMsg = '';
  private lastPlace = 0;
  private startBtn!: Button;
  private panel = { x: 0, y: 0, w: 0, h: 0 };
  private gasBtn!: Button;
  private t = 0;
  private accum = 0;
  private paths!: { center: Path2D; outer: Path2D; inner: Path2D; edgeL: Path2D; edgeR: Path2D; kerbL: Path2D; kerbR: Path2D };
  private decor: Array<{ kind: 'palm' | 'light' | 'stand' | 'yacht' | 'lighthouse' | 'buoyline' | 'flag'; x: number; y: number; a: number; s: number }> = [];
  private engineOn = false;
  private handler: PointerHandler = {
    onDown: (p) => this.down(p),
    onMove: (p) => this.move(p),
    onUp: (p) => { this.held.delete(p.id); },
  };

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.startBtn = makeButton({ id: 'start', label: 'Prendre le départ', style: 'gold', fontSize: 18, onTap: () => this.start() });
    this.gasBtn = makeButton({ id: 'autogas', label: '', style: 'secondary', fontSize: 14, onTap: () => { this.autoGas = !this.autoGas; autoGasPref = this.autoGas; this.syncGasLabel(); } });
    this.syncGasLabel();
    this.layer.buttons = [this.startBtn, this.gasBtn];
    this.buildPaths();
    this.buildDecor();
    this.reset();
  }

  private syncGasLabel(): void { this.gasBtn.label = `Accél. auto : ${this.autoGas ? 'oui' : 'non'}`; this.gasBtn.active = this.autoGas; }

  private reset(): void {
    this.cars = makeCars(this.track, this.host.s.data.name?.trim() || 'Toi');
    this.time = 0; this.result = null; this.puffs = []; this.marks = []; this.lastPlace = 0;
    const p = this.cars[0];
    this.cam = { x: p.x, y: p.y, z: this.baseZoom(), shake: 0 };
  }

  // ---------------------------------------------------------------- géométrie dessinée une fois
  private offsetPath(off: number): Path2D {
    const t = this.track, p = new Path2D();
    t.pts.forEach((q, i) => { const x = q.x + t.nx[i] * off, y = q.y + t.ny[i] * off; if (i) p.lineTo(x, y); else p.moveTo(x, y); });
    p.closePath();
    return p;
  }

  private buildPaths(): void {
    const t = this.track;
    // Vibreurs : seulement dans les portions courbes (bord extérieur et intérieur)
    const kerb = (side: number) => {
      const p = new Path2D();
      let on = false;
      t.pts.forEach((q, i) => {
        const curvy = t.curv[i] > 0.05;
        const x = q.x + t.nx[i] * side * (HALF_W + 5), y = q.y + t.ny[i] * side * (HALF_W + 5);
        if (curvy) { if (on) p.lineTo(x, y); else { p.moveTo(x, y); on = true; } } else on = false;
      });
      return p;
    };
    this.paths = {
      center: this.offsetPath(0), outer: this.offsetPath(HALF_W + RUNOFF), inner: this.offsetPath(-(HALF_W + RUNOFF)),
      edgeL: this.offsetPath(-(HALF_W - 7)), edgeR: this.offsetPath(HALF_W - 7), kerbL: kerb(-1), kerbR: kerb(1),
    };
  }

  private buildDecor(): void {
    const t = this.track, d = this.decor;
    // Palmiers et lampadaires le long des jardins, des deux côtés, en évitant de chevaucher une autre portion de piste
    const clear = (x: number, y: number, r: number) => { for (let i = 0; i < t.n; i += 2) if (Math.hypot(t.pts[i].x - x, t.pts[i].y - y) < r) return false; return true; };
    for (let s = 60; s < t.length; s += 210) {
      for (const side of [-1, 1]) {
        const p = pointAt(t, s + side * 50, side * (HALF_W + RUNOFF + 60));
        if (clear(p.x, p.y, HALF_W + RUNOFF + 40)) d.push({ kind: 'palm', x: p.x, y: p.y, a: s * 0.013, s: 0.9 + ((s * 7) % 5) / 10 });
      }
      const lp = pointAt(t, s + 105, (s % 420 < 210 ? 1 : -1) * (HALF_W + RUNOFF + 22));
      if (clear(lp.x, lp.y, HALF_W + RUNOFF + 10)) d.push({ kind: 'light', x: lp.x, y: lp.y, a: lp.heading, s: 1 });
    }
    // Tribune le long de la ligne droite des stands, drapeaux, phare, yachts et lignes de bouées dans la baie
    const st = pointAt(t, t.length * 0.04, -(HALF_W + RUNOFF + 95));
    d.push({ kind: 'stand', x: st.x, y: st.y, a: st.heading, s: 1 });
    for (let k = 0; k < 5; k++) { const f = pointAt(t, t.length * 0.012 + k * 70, -(HALF_W + RUNOFF + 20)); d.push({ kind: 'flag', x: f.x, y: f.y, a: k, s: 1 }); }
    d.push({ kind: 'lighthouse', x: 3180, y: 230, a: 0, s: 1 });
    for (const [x, y, a] of [[1300, 90, 0.1], [2050, 120, -0.2], [3200, 1500, 1.4], [200, 2500, 0.6], [1700, 2760, 0.05], [1500, 1900, 0.8]] as const) d.push({ kind: 'yacht', x, y, a, s: 1 });
    for (const [x, y] of [[1500, 900], [2450, 2150], [380, 1500]] as const) d.push({ kind: 'buoyline', x, y, a: 0, s: 1 });
  }

  // ---------------------------------------------------------------- mise en page et commandes
  private baseZoom(): number { const a = this.host.area; return Math.max(0.55, Math.min(1.25, Math.min(a.w, a.h) / 560)); }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const b = Math.max(64, 78 * ui), pad = 10 * ui, by = a.y + a.h - b - pad;
    this.zones = [
      { id: 'left', x: a.x + pad, y: by, w: b, h: b },
      { id: 'right', x: a.x + pad * 2 + b, y: by, w: b, h: b },
      { id: 'gas', x: a.x + a.w - pad - b, y: by - b * 0.35, w: b, h: b * 1.35 },
      { id: 'brake', x: a.x + a.w - pad * 2 - b * 1.85, y: by + b * 0.15, w: b * 0.85, h: b * 0.85 },
    ];
    // Panneau central (accueil et résultats) : s'adapte à la hauteur disponible, boutons dans sa partie basse
    const pw = Math.min(a.w - 20 * ui, 480 * ui), ph = Math.min(a.h - 16 * ui, 330 * ui);
    this.panel = { x: a.x + (a.w - pw) / 2, y: a.y + (a.h - ph) / 2, w: pw, h: ph };
    const bw = (pw - 36 * ui) / 2, byy = this.panel.y + ph - 62 * ui;
    Object.assign(this.startBtn, { x: this.panel.x + 12 * ui, y: byy, w: bw, h: 50 * ui });
    Object.assign(this.gasBtn, { x: this.panel.x + 24 * ui + bw, y: byy, w: bw, h: 50 * ui });
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }

  canQuit() { return this.phase === 'race' || this.phase === 'countdown' ? { ok: false as const, reason: 'Termine la course avant de quitter (ou attends l’arrivée)' } : { ok: true as const }; }

  dispose(): void { this.host.s.audio.engineStop(); }

  private zoneAt(x: number, y: number): Zone | null {
    for (const z of this.zones) if (x >= z.x - 8 && x <= z.x + z.w + 8 && y >= z.y - 8 && y <= z.y + z.h + 8) return z;
    return null;
  }

  private down(p: PointerInfo): boolean {
    if (this.phase !== 'race' && this.phase !== 'countdown') return false;
    const z = this.zoneAt(p.x, p.y);
    if (!z) return false;
    this.held.set(p.id, z.id);
    return true;
  }

  /** Glisser le pouce d'un bouton de direction à l'autre change de côté sans relâcher. */
  private move(p: PointerInfo): void {
    if (!this.held.has(p.id)) return;
    const z = this.zoneAt(p.x, p.y);
    if (z && (z.id === 'left' || z.id === 'right') && (this.held.get(p.id) === 'left' || this.held.get(p.id) === 'right')) this.held.set(p.id, z.id);
  }

  private isHeld(id: Zone['id']): boolean { for (const v of this.held.values()) if (v === id) return true; return false; }

  private start(): void {
    if (this.phase !== 'ready' && this.phase !== 'results') return;
    this.reset();
    this.phase = 'countdown'; this.countdown = 3.2;
    this.startBtn.visible = false; this.gasBtn.visible = false;
    this.held.clear();
    this.host.s.audio.engineStart(); this.engineOn = true;
  }

  // ---------------------------------------------------------------- simulation
  private playerInputs(): { steer: number; throttle: number; brake: number } {
    const c = this.host.s.game.controls;
    const ax = c.axis();
    let steer = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    if (Math.abs(ax.x) > 0.1) steer = ax.x;
    const brake = this.isHeld('brake') || c.down('down') ? 1 : 0;
    const gasKey = this.isHeld('gas') || c.down('up') || c.down('interact');
    const throttle = brake ? 0 : gasKey || this.autoGas ? 1 : 0;
    return { steer, throttle, brake };
  }

  update(dt: number): void {
    const s = this.host.s;
    this.t += dt;
    this.lapFlash = Math.max(0, this.lapFlash - dt);
    for (const p of this.puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 3);
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown - 0.2);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown - 0.2);
      if (now !== before && now >= 1 && now <= 3) s.audio.startBeep(false);
      if (this.countdown <= 0.2) { this.phase = 'race'; s.audio.startBeep(true); s.haptic(30); }
      s.audio.engineSet(0.05, this.playerInputs().throttle * 0.6);
    }
    if (this.phase === 'race' || this.phase === 'finish') {
      // Pas fixe (1/120 s) : même comportement quelle que soit la fréquence d'affichage
      this.accum = Math.min(this.accum + dt, 0.1);
      while (this.accum >= 1 / 120) { this.accum -= 1 / 120; this.step(1 / 120); }
      const me = this.cars[0], sp = Math.hypot(me.vx, me.vy);
      s.audio.engineSet(Math.min(1, sp / MAX_SPEED), me.finished ? 0 : this.playerInputs().throttle);
      if (this.phase === 'finish') { this.finishT += dt; if (this.finishT > 3) this.phase = 'results'; }
    }
    if (this.phase === 'results' && this.engineOn) { s.audio.engineStop(); this.engineOn = false; this.startBtn.visible = true; this.gasBtn.visible = true; this.startBtn.label = 'Nouvelle course'; }
    // Caméra : suit la voiture, regarde devant elle, s'éloigne avec la vitesse
    const me = this.cars[0], sp = Math.hypot(me.vx, me.vy);
    const lead = Math.min(140, sp * 0.28);
    const tx = me.x + Math.cos(me.heading) * lead, ty = me.y + Math.sin(me.heading) * lead;
    const k = Math.min(1, dt * 5);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    const zt = this.baseZoom() * (1 - 0.22 * Math.min(1, sp / MAX_SPEED));
    this.cam.z += (zt - this.cam.z) * Math.min(1, dt * 2);
  }

  private step(dt: number): void {
    const s = this.host.s, t = this.track;
    if (this.phase === 'race' || this.phase === 'finish') this.time += dt;
    for (const c of this.cars) {
      const inp = c.ai || c.finished ? aiInputs(c, t) : this.playerInputs();
      if (c.finished && !c.ai) { inp.throttle = 0; inp.brake = 0.4; } // tour de décélération après l'arrivée
      const lap = stepCar(c, inp, t, this.obstacles, dt, this.time);
      // Effets : traces de pneus, fumée, sable, étincelles
      const sp = Math.hypot(c.vx, c.vy);
      if (c.skid > 0.2 && Math.random() < 0.5) {
        const bx = c.x - Math.cos(c.heading) * 14, by = c.y - Math.sin(c.heading) * 14;
        this.marks.push({ x1: bx, y1: by, x2: bx - c.vx * dt * 3, y2: by - c.vy * dt * 3, a: 0.35 * c.skid });
        if (this.marks.length > 260) this.marks.shift();
        if (!c.ai && Math.random() < 0.15) s.audio.skid(c.skid);
      }
      if (c.offTrack && sp > 120 && Math.random() < 0.35 && !s.lowFx) this.puffs.push({ x: c.x, y: c.y, vx: -c.vx * 0.2 + (Math.random() - 0.5) * 40, vy: -c.vy * 0.2 + (Math.random() - 0.5) * 40, t: 0, life: 0.7, color: 'rgba(233,210,160,0.7)', size: 10 });
      if (c.hit > 0.2) {
        for (let i = 0; i < (s.lowFx ? 3 : 8); i++) this.puffs.push({ x: c.x, y: c.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, t: 0, life: 0.35, color: '#ffd166', size: 2.5 });
        if (!c.ai) { s.audio.crash(c.hit); this.cam.shake = Math.min(1, this.cam.shake + c.hit * 0.8); s.haptic(Math.round(20 + c.hit * 40)); }
      }
      if (c.boosted && !c.ai) { s.audio.boost(); s.haptic(20); }
      if (c.boost > 0 && !s.lowFx && Math.random() < 0.6) this.puffs.push({ x: c.x - Math.cos(c.heading) * 20, y: c.y - Math.sin(c.heading) * 20, vx: -c.vx * 0.3, vy: -c.vy * 0.3, t: 0, life: 0.3, color: 'rgba(31,199,193,0.8)', size: 6 });
      if (lap && !c.ai) this.onPlayerLap(c);
    }
    if (collideCars(this.cars) && Math.random() < 0.1) s.audio.crash(0.2);
  }

  private onPlayerLap(c: Car): void {
    const s = this.host.s, lt = c.lapTimes[c.lapTimes.length - 1];
    const best = c.bestLap === lt && c.lapTimes.length > 1;
    if (c.finished) {
      this.phase = 'finish'; this.finishT = 0;
      const place = standings(this.cars).indexOf(c) + 1;
      this.lastPlace = place;
      this.lapMsg = place === 1 ? 'Victoire !' : `Arrivée : ${place}e`;
      this.lapFlash = 3;
      if (place === 1) { s.audio.jackpot(); s.haptic([40, 60, 40, 60, 120]); } else s.audio.win();
      // Temps total envoyé à l'autorité (record et récompense)
      submitArcade(s, 'racing', raceScore(c.finishTime!), 'dixièmes', (r) => (this.result = r));
      return;
    }
    this.lapMsg = `Tour ${c.lap + 1} / ${LAPS} · ${fmtTime(lt)}${best ? ' · meilleur tour !' : ''}${c.lap + 1 === LAPS ? ' · dernier tour' : ''}`;
    this.lapFlash = 2.2;
    s.audio.ding();
  }

  // ---------------------------------------------------------------- dessin
  render(ctx: CanvasRenderingContext2D): void {
    const a = this.host.area, ui = this.host.vp.ui, s = this.host.s, low = s.lowFx;
    ctx.save();
    ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    const z = this.cam.z, sh = this.cam.shake * 6;
    const ox = a.x + a.w / 2 - this.cam.x * z + (Math.random() - 0.5) * sh, oy = a.y + a.h / 2 - this.cam.y * z + (Math.random() - 0.5) * sh;
    // Mer (dégradé, reflets qui ondulent)
    const sea = ctx.createLinearGradient(a.x, a.y, a.x, a.y + a.h);
    sea.addColorStop(0, '#0b4f7a'); sea.addColorStop(1, '#073656');
    ctx.fillStyle = sea; ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(z, z);
    const view = { x0: (a.x - ox) / z, y0: (a.y - oy) / z, x1: (a.x + a.w - ox) / z, y1: (a.y + a.h - oy) / z };
    if (!low) {
      ctx.strokeStyle = 'rgba(160,230,255,0.13)'; ctx.lineWidth = 3;
      const step = 90, sx = Math.floor(view.x0 / step) * step, sy = Math.floor(view.y0 / step) * step;
      for (let y = sy; y < view.y1 + step; y += step) {
        ctx.beginPath();
        for (let x = sx; x < view.x1 + step; x += 30) ctx.lineTo(x, y + Math.sin(x * 0.02 + this.t * 1.4 + y) * 6);
        ctx.stroke();
      }
    }
    this.renderTrack(ctx, view);
    this.renderDecor(ctx, view, false);
    // Traces de pneus
    ctx.lineCap = 'round';
    for (const m of this.marks) { ctx.strokeStyle = `rgba(20,20,24,${m.a})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke(); }
    this.renderObstacles(ctx);
    for (const p of this.puffs) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    // Voitures (la tienne par-dessus)
    for (const c of [...this.cars].reverse()) this.renderCar(ctx, c);
    this.renderDecor(ctx, view, true); // arche et éléments en hauteur, au-dessus des voitures
    ctx.restore();
    // Lignes de vitesse sur les bords (turbo, pleine vitesse)
    const me = this.cars[0], sp = Math.hypot(me.vx, me.vy);
    if (!low && (me.boost > 0 || sp > MAX_SPEED * 0.85) && this.phase === 'race') {
      ctx.strokeStyle = me.boost > 0 ? 'rgba(160,255,250,0.35)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + this.t * 0.3, r0 = Math.max(a.w, a.h) * 0.42, r1 = r0 + 30 + ((this.t * 400 + i * 37) % 60);
        const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.stroke();
      }
    }
    ctx.restore();
    this.renderHud(ctx, ui);
    this.layer.render(ctx, ui);
  }

  private renderTrack(ctx: CanvasRenderingContext2D, _view: { x0: number; y0: number; x1: number; y1: number }): void {
    const P = this.paths, wall = (HALF_W + RUNOFF) * 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    // Plage, jardins (pelouse), dégagement de sable
    ctx.strokeStyle = '#e9d6a6'; ctx.lineWidth = wall + 300; ctx.stroke(P.center);
    ctx.strokeStyle = '#2f8a57'; ctx.lineWidth = wall + 170; ctx.stroke(P.center);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = wall + 120; ctx.stroke(P.center);
    ctx.strokeStyle = '#e2c88f'; ctx.lineWidth = wall; ctx.stroke(P.center);
    // Barrières de pneus (rouge et blanc) des deux côtés
    for (const b of [P.outer, P.inner]) {
      ctx.lineWidth = 12; ctx.strokeStyle = '#1b1b20'; ctx.setLineDash([]); ctx.stroke(b);
      ctx.lineWidth = 8; ctx.strokeStyle = '#f2f2f2'; ctx.setLineDash([22, 22]); ctx.stroke(b);
      ctx.strokeStyle = '#c0392b'; ctx.lineDashOffset = 22; ctx.stroke(b); ctx.lineDashOffset = 0;
    }
    ctx.setLineDash([]);
    // Asphalte (léger dégradé de teinte) et lignes blanches de bord
    ctx.strokeStyle = '#3b3f48'; ctx.lineWidth = HALF_W * 2; ctx.stroke(P.center);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = HALF_W * 1.2; ctx.stroke(P.center);
    // Vibreurs rouge et blanc dans les courbes
    for (const k of [P.kerbL, P.kerbR]) {
      ctx.lineWidth = 12; ctx.strokeStyle = '#f5f5f5'; ctx.setLineDash([18, 18]); ctx.stroke(k);
      ctx.strokeStyle = '#d23a3a'; ctx.lineDashOffset = 18; ctx.stroke(k); ctx.lineDashOffset = 0;
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.stroke(P.edgeL); ctx.stroke(P.edgeR);
    // Ligne de départ / d'arrivée en damier, cases de la grille
    const t = this.track, i0 = 0, p0 = t.pts[i0], nx = t.nx[i0], ny = t.ny[i0];
    const tx = -ny, ty = nx; // direction de la piste
    const sq = 15, rows = 2, cols = Math.round((HALF_W * 2) / sq);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#111' : '#fafafa';
      const l = -HALF_W + c * sq, f = -sq + r * sq;
      const x = p0.x + nx * l + tx * f, y = p0.y + ny * l + ty * f;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(ty, tx)); ctx.fillRect(0, 0, sq + 0.5, sq + 0.5); ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const g = pointAt(t, t.length - 70 - k * 70, k % 2 ? 40 : -40);
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.heading);
      ctx.beginPath(); ctx.moveTo(20, -20); ctx.lineTo(-10, -20); ctx.moveTo(20, 20); ctx.lineTo(-10, 20); ctx.moveTo(20, -20); ctx.lineTo(20, 20); ctx.stroke();
      ctx.restore();
    }
    // Logo KS peint sur la ligne droite
    const lg = pointAt(t, t.length * 0.05, 0);
    ctx.save(); ctx.translate(lg.x, lg.y); ctx.rotate(lg.heading + Math.PI / 2); ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff'; ctx.font = '900 70px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', 0, 0);
    ctx.restore();
  }

  private renderObstacles(ctx: CanvasRenderingContext2D): void {
    for (const o of this.obstacles) {
      ctx.save(); ctx.translate(o.x, o.y);
      if (o.kind === 'oil') {
        ctx.fillStyle = 'rgba(12,10,16,0.85)'; ctx.beginPath(); ctx.ellipse(0, 0, o.r, o.r * 0.7, o.heading, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r); g.addColorStop(0, 'rgba(255,100,200,0.25)'); g.addColorStop(0.5, 'rgba(100,200,255,0.25)'); g.addColorStop(1, 'rgba(255,230,120,0.25)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-4, -3, o.r * 0.6, o.r * 0.35, o.heading, 0, Math.PI * 2); ctx.fill();
      } else if (o.kind === 'boost') {
        ctx.rotate(o.heading);
        const pulse = 0.55 + 0.45 * Math.sin(this.t * 8);
        ctx.fillStyle = `rgba(31,199,193,${0.25 + pulse * 0.2})`; roundRect(ctx, -o.r, -o.r * 0.8, o.r * 2, o.r * 1.6, 8); ctx.fill();
        ctx.strokeStyle = `rgba(200,255,250,${0.6 + pulse * 0.4})`; ctx.lineWidth = 5; ctx.lineJoin = 'round';
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 14 - 6, -14); ctx.lineTo(k * 14 + 6, 0); ctx.lineTo(k * 14 - 6, 14); ctx.stroke(); }
      } else {
        // Bouée orange et blanche
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(3, 4, o.r, o.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.25, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderDecor(ctx: CanvasRenderingContext2D, v: { x0: number; y0: number; x1: number; y1: number }, overlay: boolean): void {
    const inView = (x: number, y: number, r: number) => x > v.x0 - r && x < v.x1 + r && y > v.y0 - r && y < v.y1 + r;
    if (overlay) {
      // Arche KS au-dessus de la ligne de départ
      const t = this.track, p = t.pts[0], nx = t.nx[0], ny = t.ny[0], half = HALF_W + RUNOFF;
      if (!inView(p.x, p.y, half + 60)) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(p.x - nx * half + 10, p.y - ny * half + 14); ctx.lineTo(p.x + nx * half + 10, p.y + ny * half + 14); ctx.stroke();
      const g = ctx.createLinearGradient(p.x - nx * half, p.y - ny * half, p.x + nx * half, p.y + ny * half);
      g.addColorStop(0, '#8a6a2b'); g.addColorStop(0.5, '#efdcae'); g.addColorStop(1, '#8a6a2b');
      ctx.strokeStyle = g; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(p.x - nx * half, p.y - ny * half); ctx.lineTo(p.x + nx * half, p.y + ny * half); ctx.stroke();
      drawKSEmblem(ctx, p.x, p.y, 46, this.t, 'small', false);
      for (const sd of [-1, 1]) { ctx.fillStyle = '#16131a'; ctx.beginPath(); ctx.arc(p.x + nx * half * sd, p.y + ny * half * sd, 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = LUXE.gold; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.restore();
      return;
    }
    for (const d of this.decor) {
      if (!inView(d.x, d.y, d.kind === 'yacht' ? 160 : d.kind === 'stand' ? 260 : 80)) continue;
      ctx.save(); ctx.translate(d.x, d.y);
      switch (d.kind) {
        case 'palm': {
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(10, 10, 30 * d.s, 18 * d.s, 0.5, 0, Math.PI * 2); ctx.fill();
          for (let k = 0; k < 6; k++) {
            const ang = d.a + (k / 6) * Math.PI * 2 + Math.sin(this.t * 1.2 + d.x) * 0.05;
            ctx.fillStyle = k % 2 ? '#2fae6b' : '#23824f';
            ctx.beginPath(); ctx.ellipse(Math.cos(ang) * 16 * d.s, Math.sin(ang) * 16 * d.s, 20 * d.s, 7 * d.s, ang, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#7a5432'; ctx.beginPath(); ctx.arc(0, 0, 6 * d.s, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'light': {
          ctx.fillStyle = '#c9ccd3'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
          const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 46); glow.addColorStop(0, 'rgba(255,240,200,0.45)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'flag': {
          ctx.fillStyle = '#c9ccd3'; ctx.fillRect(-1.5, -26, 3, 26);
          const wave = Math.sin(this.t * 6 + d.a) * 3;
          ctx.fillStyle = d.a % 2 ? LUXE.gold : '#1fc7c1';
          ctx.beginPath(); ctx.moveTo(1.5, -26); ctx.quadraticCurveTo(12, -24 + wave, 22, -22); ctx.lineTo(1.5, -16); ctx.closePath(); ctx.fill();
          break;
        }
        case 'stand': {
          ctx.rotate(d.a);
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-240, -50, 480, 104);
          ctx.fillStyle = '#123a68'; ctx.fillRect(-240, -60, 480, 100);
          const cols = ['#ff6f91', '#ffd166', '#1fc7c1', '#f6f0e3', '#8fb6ff', '#c38bff'];
          for (let r = 0; r < 4; r++) for (let k = 0; k < 30; k++) {
            ctx.fillStyle = cols[(k * 7 + r * 3) % cols.length];
            ctx.beginPath(); ctx.arc(-228 + k * 15.7, -48 + r * 22 + Math.sin(this.t * 5 + k + r) * (this.phase === 'race' ? 1.5 : 0.3), 5, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = LUXE.gold; ctx.fillRect(-240, 38, 480, 5);
          ctx.fillStyle = '#0b0a0d'; ctx.font = '800 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          break;
        }
        case 'lighthouse': {
          ctx.fillStyle = '#e9d6a6'; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f6f0e3'; ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
          const ang = this.t * 1.5;
          const beam = ctx.createRadialGradient(0, 0, 10, 0, 0, 420); beam.addColorStop(0, 'rgba(255,240,180,0.35)'); beam.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 420, ang - 0.18, ang + 0.18); ctx.closePath(); ctx.fill();
          break;
        }
        case 'yacht': {
          ctx.rotate(d.a + Math.sin(this.t * 0.8 + d.x) * 0.03);
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(-130, 0, 60, 14, 0, 0, Math.PI * 2); ctx.fill(); // sillage
          ctx.fillStyle = '#f6f6f6'; ctx.beginPath(); ctx.moveTo(-80, -22); ctx.lineTo(60, -22); ctx.quadraticCurveTo(110, 0, 60, 22); ctx.lineTo(-80, 22); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#123a68'; ctx.beginPath(); ctx.moveTo(-60, -13); ctx.lineTo(30, -13); ctx.quadraticCurveTo(55, 0, 30, 13); ctx.lineTo(-60, 13); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#9fd8ee'; ctx.fillRect(-40, -7, 50, 14);
          ctx.fillStyle = LUXE.gold; ctx.fillRect(-80, -2, 140, 4);
          break;
        }
        case 'buoyline': {
          for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? '#ffd166' : '#ff6f91'; ctx.beginPath(); ctx.arc(k * 34 - 102, Math.sin(this.t * 2 + k) * 3, 7, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
      }
      ctx.restore();
    }
  }

  private renderCar(ctx: CanvasRenderingContext2D, c: Car): void {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.heading);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, -22, -11, 48, 26, 9); ctx.fill(); // ombre
    // Roues
    ctx.fillStyle = '#111';
    for (const [x, y] of [[-14, -13], [-14, 9], [12, -13], [12, 9]] as const) roundRect(ctx, x, y, 10, 5, 2), ctx.fill();
    // Carrosserie
    const g = ctx.createLinearGradient(0, -12, 0, 12); g.addColorStop(0, c.color); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.55, c.color); g.addColorStop(1, shade(c.color));
    ctx.fillStyle = g; roundRect(ctx, -22, -10, 46, 20, 8); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, -6, -7, 15, 14, 4); ctx.fill(); // cockpit
    ctx.fillStyle = 'rgba(160,220,255,0.6)'; roundRect(ctx, 4, -6, 5, 12, 2); ctx.fill(); // pare-brise
    ctx.fillStyle = shade(c.color); ctx.fillRect(-23, -11, 4, 22); // aileron
    ctx.fillStyle = '#fff'; ctx.font = '900 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(c.id + 1), -13, 0.5);
    // Feux : stop au freinage, flamme au turbo
    const braking = !c.ai && this.phase === 'race' && (this.isHeld('brake') || this.host.s.game.controls.down('down'));
    if (braking) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-23, -9, 2, 4); ctx.fillRect(-23, 5, 2, 4); }
    if (c.boost > 0) { ctx.fillStyle = `rgba(120,255,245,${0.6 + Math.random() * 0.4})`; ctx.beginPath(); ctx.moveTo(-23, -5); ctx.lineTo(-38 - Math.random() * 10, 0); ctx.lineTo(-23, 5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // Repère au-dessus de ta voiture
    if (!c.ai) { ctx.fillStyle = LUXE.champagne; ctx.beginPath(); ctx.moveTo(c.x, c.y - 30); ctx.lineTo(c.x - 7, c.y - 41); ctx.lineTo(c.x + 7, c.y - 41); ctx.closePath(); ctx.fill(); }
  }

  private renderHud(ctx: CanvasRenderingContext2D, ui: number): void {
    const a = this.host.area, me = this.cars[0], st = standings(this.cars), place = st.indexOf(me) + 1;
    ctx.save();
    if (this.phase !== 'ready') {
      // Tour, position, chrono, vitesse
      const box = (x: number, y: number, label: string, value: string, w = 92 * ui) => {
        roundRect(ctx, x, y, w, 46 * ui, 10 * ui); ctx.fillStyle = 'rgba(8,16,30,0.78)'; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.6)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = font(10 * ui, 700); ctx.fillStyle = PAL.textDim; ctx.fillText(label, x + 9 * ui, y + 13 * ui);
        ctx.font = font(17 * ui, 900); ctx.fillStyle = PAL.text; ctx.fillText(value, x + 9 * ui, y + 31 * ui, w - 14 * ui);
      };
      const lap = Math.min(LAPS, me.lap + 1);
      box(a.x + 8 * ui, a.y + 8 * ui, 'TOUR', `${me.finished ? LAPS : lap} / ${LAPS}`, 80 * ui);
      box(a.x + 96 * ui, a.y + 8 * ui, 'POSITION', `${place} / ${this.cars.length}`, 86 * ui);
      box(a.x + 190 * ui, a.y + 8 * ui, 'CHRONO', fmtTime(me.finishTime ?? this.time), 96 * ui);
      if (a.w > 560 * ui) box(a.x + 294 * ui, a.y + 8 * ui, 'MEILLEUR TOUR', me.bestLap ? fmtTime(me.bestLap) : '—', 112 * ui);
      // Compteur de vitesse (km/h fictifs)
      const kmh = Math.round(Math.hypot(me.vx, me.vy) * 0.42);
      const cx = a.x + a.w - 62 * ui, cy = a.y + 60 * ui, r = 46 * ui;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,16,30,0.78)'; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.6)'; ctx.stroke();
      ctx.lineWidth = 6 * ui; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, r - 9 * ui, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      const f = Math.min(1, kmh / 330);
      ctx.strokeStyle = me.boost > 0 ? '#1fc7c1' : LUXE.gold; ctx.beginPath(); ctx.arc(cx, cy, r - 9 * ui, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * f)); ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = font(19 * ui, 900); ctx.fillStyle = PAL.text; ctx.fillText(String(kmh), cx, cy + 1 * ui);
      ctx.font = font(9 * ui, 700); ctx.fillStyle = PAL.textDim; ctx.fillText('km/h', cx, cy + 17 * ui);
      this.renderMinimap(ctx, a.x + a.w - 132 * ui, cy + r + 10 * ui, 120 * ui);
    }
    // Feux de départ
    if (this.phase === 'countdown') {
      const lit = Math.max(0, Math.min(3, 3 - Math.ceil(this.countdown - 0.2) + 1));
      const w = 170 * ui, x = a.x + a.w / 2 - w / 2, y = a.y + a.h * 0.28;
      roundRect(ctx, x, y, w, 60 * ui, 14 * ui); ctx.fillStyle = 'rgba(10,8,12,0.9)'; ctx.fill();
      for (let k = 0; k < 3; k++) { ctx.fillStyle = k < lit ? '#ff3b3b' : '#3a1414'; ctx.beginPath(); ctx.arc(x + 32 * ui + k * 53 * ui, y + 30 * ui, 18 * ui, 0, Math.PI * 2); ctx.fill(); }
    } else if (this.phase === 'race' && this.time < 1.2) {
      drawPill(ctx, 'PARTEZ !', a.x + a.w / 2, a.y + a.h * 0.32, 26 * ui, 'rgba(47,174,107,0.92)', '#fff');
    }
    if (this.lapFlash > 0 && this.phase !== 'results') {
      ctx.globalAlpha = Math.min(1, this.lapFlash);
      drawPill(ctx, this.lapMsg, a.x + a.w / 2, a.y + a.h * 0.22, 15 * ui, 'rgba(10,8,12,0.88)', LUXE.champagne);
      ctx.globalAlpha = 1;
    }
    if (me.wrongWay > 0.8 && this.phase === 'race') drawPill(ctx, '⟲ Mauvais sens !', a.x + a.w / 2, a.y + a.h * 0.4, 18 * ui, 'rgba(192,57,43,0.92)', '#fff');
    // Commandes tactiles
    if (this.phase === 'race' || this.phase === 'countdown') {
      for (const z of this.zones) {
        if (z.id === 'gas' && this.autoGas) continue;
        const on = this.isHeld(z.id);
        roundRect(ctx, z.x, z.y, z.w, z.h, 18 * ui);
        ctx.fillStyle = z.id === 'gas' ? (on ? 'rgba(239,220,174,0.85)' : 'rgba(212,175,90,0.55)') : z.id === 'brake' ? (on ? 'rgba(220,60,60,0.85)' : 'rgba(170,40,40,0.55)') : on ? 'rgba(255,255,255,0.35)' : 'rgba(8,16,30,0.55)';
        ctx.fill(); ctx.strokeStyle = 'rgba(239,220,174,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
        const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
        ctx.fillStyle = z.id === 'gas' ? '#1a1208' : '#fff';
        if (z.id === 'left' || z.id === 'right') {
          const d = z.id === 'left' ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(cx + d * 16 * ui, cy); ctx.lineTo(cx - d * 10 * ui, cy - 16 * ui); ctx.lineTo(cx - d * 10 * ui, cy + 16 * ui); ctx.closePath(); ctx.fill();
        } else {
          ctx.font = font(13 * ui, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(z.id === 'gas' ? 'GAZ' : 'FREIN', cx, cy);
        }
      }
      if (this.autoGas) {
        const z = this.zones.find((q) => q.id === 'gas')!;
        ctx.font = font(10 * ui, 700); ctx.fillStyle = PAL.textDim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Accélération', z.x + z.w / 2, z.y + z.h / 2 - 7 * ui, z.w + 10 * ui);
        ctx.fillText('auto', z.x + z.w / 2, z.y + z.h / 2 + 7 * ui, z.w);
      }
    }
    if (this.phase === 'ready') this.renderCard(ctx, ui);
    if (this.phase === 'results') this.renderResults(ctx, ui, st);
    ctx.restore();
  }

  private renderMinimap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    const k = w / WORLD.w, h = WORLD.h * k;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8); ctx.fillStyle = 'rgba(8,16,30,0.7)'; ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.strokeStyle = 'rgba(239,220,174,0.85)'; ctx.lineWidth = 60; ctx.stroke(this.paths.center);
    for (const c of this.cars) { ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(c.x, c.y, c.ai ? 70 : 100, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  /** Fond commun des panneaux (accueil, résultats). */
  private panelBg(ctx: CanvasRenderingContext2D, ui: number): void {
    const P = this.panel;
    roundRect(ctx, P.x, P.y, P.w, P.h, 16 * ui); ctx.fillStyle = 'rgba(8,16,30,0.93)'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
  }

  private renderCard(ctx: CanvasRenderingContext2D, ui: number): void {
    const P = this.panel, cx = P.x + P.w / 2;
    // Lignes réparties dans la hauteur du panneau (au-dessus des boutons)
    const top = P.y + 24 * ui, bottom = P.y + P.h - 74 * ui, lh = Math.min(22 * ui, (bottom - top) / 6.5);
    this.panelBg(ctx, ui);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(19 * ui, 900); ctx.fillStyle = LUXE.champagne; ctx.fillText('Circuit KS · Baie Royale', cx, top, P.w - 20 * ui);
    ctx.font = font(13 * ui, 600); ctx.fillStyle = PAL.text;
    const lines = [`${LAPS} tours contre 3 pilotes de l’équipage (ordinateur)`, '◀ ▶ pour tourner · GAZ / FREIN à droite', 'Sable : ralenti · huile : glisse · vague turbo : accélère'];
    lines.forEach((l, i) => ctx.fillText(l, cx, top + lh * (1.4 + i), P.w - 24 * ui));
    const best = this.host.s.data.stats['best.racing'];
    ctx.font = font(12.5 * ui, 700); ctx.fillStyle = PAL.textDim;
    ctx.fillText(best !== undefined ? `Ton record : ${fmtTime(best / 10)}` : 'Première course : à toi de fixer le record !', cx, top + lh * 4.7, P.w - 24 * ui);
    const info = ARCADE_INFO.racing;
    if (info) info.medals.forEach((m, i) => {
      const mx = cx + (i - 1) * Math.min(110 * ui, P.w / 3.2), my = top + lh * 5.9;
      ctx.fillStyle = ['#c98d62', '#c9ccd3', LUXE.gold][i]; ctx.beginPath(); ctx.arc(mx - 34 * ui, my, 7 * ui, 0, Math.PI * 2); ctx.fill();
      ctx.font = font(11.5 * ui, 700); ctx.fillStyle = PAL.text; ctx.textAlign = 'left'; ctx.fillText(`≤ ${fmtTime(m / 10)}`, mx - 24 * ui, my); ctx.textAlign = 'center';
    });
  }

  private renderResults(ctx: CanvasRenderingContext2D, ui: number, st: Car[]): void {
    const P = this.panel, cx = P.x + P.w / 2;
    const top = P.y + 22 * ui, bottom = P.y + P.h - 70 * ui, lh = Math.min(24 * ui, (bottom - top) / 8.4);
    this.panelBg(ctx, ui);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(19 * ui, 900); ctx.fillStyle = this.lastPlace === 1 ? LUXE.champagne : PAL.text;
    ctx.fillText(this.lastPlace === 1 ? 'Victoire !' : `Arrivée : ${this.lastPlace}e place`, cx, top);
    // Classement : position, pilote, temps ou écart
    const me = this.cars[0], leader = st[0];
    st.forEach((c, i) => {
      const ry = top + lh * (1.3 + i);
      if (!c.ai) { roundRect(ctx, P.x + 12 * ui, ry - lh * 0.45, P.w - 24 * ui, lh * 0.9, 8 * ui); ctx.fillStyle = 'rgba(212,175,90,0.18)'; ctx.fill(); }
      ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(P.x + 30 * ui, ry, 6 * ui, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = font(13.5 * ui, c.ai ? 700 : 900); ctx.fillStyle = PAL.text;
      ctx.fillText(`${i + 1}. ${c.name}`, P.x + 44 * ui, ry, P.w * 0.5);
      ctx.textAlign = 'right'; ctx.fillStyle = PAL.textDim;
      const txt = c.finished && c.finishTime !== null ? (i === 0 ? fmtTime(c.finishTime) : `+${(c.finishTime - (leader.finishTime ?? 0)).toFixed(1).replace('.', ',')} s`)
        : `à ${Math.max(0, Math.round(((me.progress - c.progress) / this.track.length) * 100))} % d’un tour`;
      ctx.fillText(txt, P.x + P.w - 20 * ui, ry, P.w * 0.4);
    });
    ctx.textAlign = 'center';
    const ty = top + lh * 5.6;
    ctx.font = font(13 * ui, 700); ctx.fillStyle = PAL.text;
    ctx.fillText(`Ton temps : ${fmtTime(me.finishTime ?? 0)} · meilleur tour ${me.bestLap ? fmtTime(me.bestLap) : '—'}`, cx, ty, P.w - 24 * ui);
    const medal = medalFor('racing', raceScore(me.finishTime ?? 9999));
    ctx.fillStyle = medal >= 0 ? ['#c98d62', '#c9ccd3', LUXE.gold][medal] : PAL.textDim;
    ctx.fillText(medal >= 0 ? `Médaille ${MEDALS[medal]}` : 'Pas de médaille cette fois', cx, ty + lh);
    const r = this.result;
    ctx.fillStyle = !r || r.pending ? PAL.textDim : r.error ? PAL.danger : r.granted > 0 ? PAL.success : PAL.textDim;
    ctx.fillText(!r || r.pending ? 'Enregistrement du temps…' : r.error ? r.error : `${r.newBest ? 'Nouveau record ! · ' : ''}${r.granted > 0 ? `+${r.granted} KSCoins` : r.capReached ? 'Plafond de KSCoins du jour atteint' : 'Pas de KSCoins pour ce temps'}`, cx, ty + lh * 2, P.w - 24 * ui);
  }
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)})`;
}

