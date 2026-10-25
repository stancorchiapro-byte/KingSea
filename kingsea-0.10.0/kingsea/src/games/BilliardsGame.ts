// Billard, deux modes :
// • « Défi des 15 billes » (solo) : vider la table en un minimum de coups (récompense et record).
// • « 8 américain à deux » (même appareil) : pleines contre rayées, fautes, bille en main, la 8 pour finir
//   (règles : logic/billiards.ts). Pas de récompense en KSCoins dans ce mode (partie entre amis).
// Viser : glisser le doigt sur la table (affinage ◀ ▶). Effet : centre, coulé, rétro. Force : curseur. Tirer : bouton.
// Visée assistée : bille fantôme au point de contact, trajectoire de la bille visée et déviation de la blanche.
// En portrait, la table est affichée à la verticale pour occuper l'écran.
import { LUXE } from '../art/brand';
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { clamp } from '../engine/math';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { finishArcade } from './arcade';
import { applySpin, groupOf, judgeShot, newEightBall, remainingOf, type EightBallState, type Spin } from './logic/billiards';
import { allStopped, stepWorld, type Disc } from './logic/physics';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';

const TW = 560, TH = 280, R = 8, POCKET_R = 15;
/** Couleurs officielles : 1 jaune, 2 bleu, 3 rouge, 4 violet, 5 orange, 6 vert, 7 bordeaux, 8 noire ; 9–15 rayées. */
const COLORS = ['#f2c230', '#1f4fbf', '#c62828', '#5b2c8f', '#ef7d1a', '#1f7a3e', '#7a1c22', '#111111'];
const colorOf = (id: number) => COLORS[(id - 1) % 8];
const POCKETS = [
  { x: 0, y: 0, r: POCKET_R }, { x: TW / 2, y: -3, r: POCKET_R - 1 }, { x: TW, y: 0, r: POCKET_R },
  { x: 0, y: TH, r: POCKET_R }, { x: TW / 2, y: TH + 3, r: POCKET_R - 1 }, { x: TW, y: TH, r: POCKET_R },
];
const HEAD = { x: 140, y: TH / 2 };
/** Ordre du triangle du 8 américain : la 8 au centre (3e rangée), une pleine et une rayée aux coins arrière. */
const RACK_8 = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];

export function rackBalls(order: number[] = Array.from({ length: 15 }, (_, i) => i + 1)): Disc[] {
  const balls: Disc[] = [];
  let i = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) {
    const id = order[i++];
    balls.push({ id, x: 400 + row * R * 1.75, y: TH / 2 + (k - row / 2) * (R * 2 + 0.5), vx: 0, vy: 0, r: R, m: 1, active: true, tag: colorOf(id) });
  }
  return balls;
}

type Mode = 'solo' | 'duo';
interface Drop { id: number; x: number; y: number; px: number; py: number; t: number }

export class BilliardsGame implements MiniGame {
  readonly id = 'billiards';
  readonly title = 'Billard';
  readonly bg: [string, string] = ['#14100c', '#060403'];
  readonly rules =
    'Deux modes (bouton « Mode ») :\n' +
    '• Défi des 15 billes (solo) : empoche toutes les billes en un minimum de coups. Blanche empochée : +1 coup.\n' +
    '  Récompense : de 10 à 60 KSCoins selon ton nombre de coups (plafond quotidien commun aux mini-jeux).\n' +
    '• 8 américain à deux (même appareil) : la première bille empochée après la casse attribue les pleines (1–7) ou les rayées (9–15). ' +
    'On rejoue tant qu’on empoche une de ses billes. Faute (blanche empochée, aucune bille touchée, mauvaise bille touchée en premier) : bille en main pour l’adversaire, qui la pose où il veut. ' +
    'La 8 se joue en dernier : l’empocher trop tôt ou sur une faute fait perdre.\n' +
    'Commandes : glisse le doigt sur la table pour viser (◀ ▶ pour affiner), choisis l’effet (centre, coulé : la blanche suit ; rétro : elle revient), règle la force, puis « Tirer ».';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private btn: Record<string, Button> = {};
  private balls: Disc[] = [];
  private cue!: Disc;
  private angle = 0;
  private power = 0.55;
  private spin: Spin = 'centre';
  private mode: Mode = 'solo';
  private shots = 0;
  private moving = false;
  private pottedThisShot: Disc[] = [];
  private firstHit: number | null = null;
  private shotDir = { x: 1, y: 0 };
  private spinDone = false;
  private drops: Drop[] = [];
  private eight: EightBallState = newEightBall();
  private placing = false;
  private view = { x: 0, y: 0, s: 1, rot: false };
  private slider = { x: 0, y: 0, w: 0, h: 0, vertical: true };
  private message = 'Vise en glissant le doigt sur la table.';
  private over: string | null = null;
  private handler: PointerHandler;
  private drag: { id: number; mode: 'aim' | 'power' } | null = null;
  private soundCd = 0;
  private t = 0;

  constructor() {
    this.handler = { onDown: (p) => this.down(p), onMove: (p) => this.move(p), onUp: (p) => { if (this.drag?.id === p.id) this.drag = null; } };
  }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    const mk = (id: string, label: string, style: Button['style'], onTap: () => void, fontSize = 15) => (this.btn[id] = makeButton({ id, label, style, fontSize, onTap }));
    mk('shoot', 'Tirer', 'gold', () => this.shoot(), 17);
    mk('again', 'Rejouer', 'gold', () => this.reset(), 17);
    mk('mode', 'Mode : solo', 'secondary', () => { this.mode = this.mode === 'solo' ? 'duo' : 'solo'; this.reset(); });
    mk('left', '◀', 'secondary', () => this.nudge(-1), 18);
    mk('right', '▶', 'secondary', () => this.nudge(1), 18);
    for (const sp of ['centre', 'coulé', 'rétro'] as Spin[]) {
      const b = mk(`spin-${sp}`, '', 'round', () => { this.spin = sp; host.s.audio.tap(); });
      b.icon = (ctx, cx, cy, s) => {
        ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(cx, cy + (sp === 'coulé' ? -s * 0.22 : sp === 'rétro' ? s * 0.22 : 0), s * 0.1, 0, Math.PI * 2); ctx.fill();
      };
    }
    this.layer.buttons = Object.values(this.btn);
    this.reset();
  }

  private reset(): void {
    this.balls = rackBalls(this.mode === 'duo' ? RACK_8 : undefined);
    this.cue = { id: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, r: R, m: 1, active: true, tag: '#fbfaf7' };
    this.balls.unshift(this.cue);
    this.shots = 0; this.over = null; this.moving = false; this.angle = 0; this.placing = false; this.drops = [];
    this.eight = newEightBall();
    this.btn.again.visible = false; this.btn.shoot.visible = true;
    this.btn.mode.label = this.mode === 'solo' ? 'Mode : défi solo' : 'Mode : 8 à deux';
    this.message = this.mode === 'solo' ? 'Vise en glissant le doigt sur la table.' : 'Joueur 1 : à toi la casse !';
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui;
    const bh = Math.max(44, 48 * ui), gap = 8 * ui;
    const portrait = a.h > a.w * 1.1;
    if (portrait) {
      // Table verticale ; dessous : force (horizontale) + Tirer, puis effets, affinage et mode
      const controlsH = bh * 2 + gap * 3 + 60 * ui;
      const s = Math.min((a.w - 40 * ui) / (TH + 44), (a.h - controlsH - 40 * ui) / (TW + 44));
      const w = (TH + 44) * s;
      this.view = { x: a.x + (a.w - w) / 2 + 22 * s, y: a.y + 22 * s + 4 * ui, s, rot: true };
      const y1 = this.view.y + (TW + 22) * s + 44 * ui;
      const sw = a.w - 150 * ui - gap;
      this.slider = { x: a.x, y: y1 + 8 * ui, w: sw, h: bh - 16 * ui, vertical: false };
      Object.assign(this.btn.shoot, { x: a.x + a.w - 150 * ui, y: y1, w: 150 * ui, h: bh });
      this.row2(a.x, y1 + bh + gap + 18 * ui, a.w, bh, gap, ui);
    } else {
      const side = 96 * ui;
      const s = Math.min((a.w - side - 40 * ui) / (TW + 44), (a.h - bh - 40 * ui) / (TH + 44));
      this.view = { x: a.x + 22 * s + 10 * ui, y: a.y + 22 * s + 4 * ui, s, rot: false };
      this.slider = { x: a.x + a.w - side + 20 * ui, y: a.y + 10 * ui, w: side - 40 * ui, h: Math.max(80 * ui, a.h - bh - 50 * ui), vertical: true };
      Object.assign(this.btn.shoot, { x: a.x + a.w - side, y: a.y + a.h - bh, w: side, h: bh });
      this.row2(a.x, a.y + a.h - bh, a.w - side - gap, bh, gap, ui);
    }
    Object.assign(this.btn.again, { x: a.x + a.w / 2 - 100 * ui, y: this.btn.shoot.y, w: 200 * ui, h: bh });
  }

  /** Ligne : effets (3 billes), affinage ◀ ▶, mode. */
  private row2(x: number, y: number, w: number, bh: number, gap: number, ui: number): void {
    const round = Math.max(40, Math.min(bh, (w - 120 * ui - gap * 9) / 5));
    let cx = x;
    for (const sp of ['centre', 'coulé', 'rétro']) { Object.assign(this.btn[`spin-${sp}`], { x: cx, y, w: round, h: round }); cx += round + gap; }
    cx += gap;
    Object.assign(this.btn.left, { x: cx, y, w: round, h: round }); cx += round + gap;
    Object.assign(this.btn.right, { x: cx, y, w: round, h: round }); cx += round + gap * 2;
    Object.assign(this.btn.mode, { x: cx, y, w: Math.max(120 * ui, x + w - cx), h: bh });
  }

  handlers(): PointerHandler[] { return [this.layer, this.handler]; }
  canQuit() { return { ok: true as const }; }

  private toWorld(px: number, py: number) {
    const v = this.view;
    return v.rot ? { x: (py - v.y) / v.s, y: TH - (px - v.x) / v.s } : { x: (px - v.x) / v.s, y: (py - v.y) / v.s };
  }

  private down(p: PointerInfo): boolean {
    const S = this.slider;
    if (p.x >= S.x - 10 && p.x <= S.x + S.w + 10 && p.y >= S.y - 10 && p.y <= S.y + S.h + 10) { this.drag = { id: p.id, mode: 'power' }; this.move(p); return true; }
    const w = this.toWorld(p.x, p.y);
    if (w.x < -30 || w.x > TW + 30 || w.y < -30 || w.y > TH + 30) return false;
    if (this.moving || this.over) return true;
    if (this.placing) { this.placeCue(w.x, w.y); return true; }
    this.drag = { id: p.id, mode: 'aim' }; this.move(p);
    return true;
  }

  private move(p: PointerInfo): void {
    if (!this.drag || this.drag.id !== p.id) return;
    if (this.drag.mode === 'power') {
      const S = this.slider;
      this.power = clamp(S.vertical ? 1 - (p.y - S.y) / S.h : (p.x - S.x) / S.w, 0.05, 1);
    } else if (!this.moving) {
      const w = this.toWorld(p.x, p.y);
      if (Math.hypot(w.x - this.cue.x, w.y - this.cue.y) > 4) this.angle = Math.atan2(w.y - this.cue.y, w.x - this.cue.x);
    }
  }

  private nudge(dir: number): void { if (!this.moving && !this.over) this.angle += dir * (Math.PI / 450); }

  /** Bille en main : pose la blanche sur une case libre de la table. */
  private placeCue(x: number, y: number): void {
    const cx = clamp(x, R + 1, TW - R - 1), cy = clamp(y, R + 1, TH - R - 1);
    const free = this.balls.every((b) => b === this.cue || !b.active || Math.hypot(b.x - cx, b.y - cy) > R * 2 + 1) && POCKETS.every((pk) => Math.hypot(pk.x - cx, pk.y - cy) > pk.r + R);
    if (!free) { this.message = 'Place libre requise (pas sur une bille ni une poche)'; this.host.s.audio.error(); return; }
    this.cue.x = cx; this.cue.y = cy; this.cue.active = true;
    this.placing = false;
    this.message = 'Blanche posée : vise et tire.';
    this.host.s.audio.chip();
  }

  private shoot(): void {
    if (this.moving || this.over) return;
    if (this.placing) { this.placing = false; } // garde la position actuelle
    const v = 140 + this.power * 820;
    this.shotDir = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    this.cue.vx = this.shotDir.x * v; this.cue.vy = this.shotDir.y * v;
    this.moving = true; this.shots++; this.pottedThisShot = []; this.firstHit = null; this.spinDone = false;
    this.message = '';
    this.host.s.audio.cueStrike(this.power);
  }

  update(dt: number): void {
    this.t += dt;
    const free = !this.moving && !this.over;
    this.btn.shoot.enabled = free;
    this.btn.shoot.label = this.placing ? 'Tirer d’ici' : 'Tirer';
    this.btn.left.enabled = this.btn.right.enabled = free;
    for (const sp of ['centre', 'coulé', 'rétro']) { const b = this.btn[`spin-${sp}`]; b.active = this.spin === sp; b.enabled = free; }
    this.btn.mode.enabled = !this.moving;
    this.drops = this.drops.filter((d) => (d.t += dt) < 0.35);
    this.soundCd -= dt;
    if (!this.moving) return;
    const audio = this.host.s.audio;
    const potted = stepWorld(this.balls, dt, {
      friction: 75, restitution: 0.95, wallRestitution: 0.78, bounds: { x: 0, y: 0, w: TW, h: TH }, pockets: POCKETS,
      onHit: (a, b, rel) => {
        const cueHit = a === this.cue ? b : b === this.cue ? a : null;
        if (cueHit && this.firstHit === null) this.firstHit = cueHit.id;
        // Effet appliqué au premier contact de la blanche
        if (cueHit && !this.spinDone) { this.spinDone = true; applySpin(this.cue, this.shotDir, rel, this.spin); }
        if (this.soundCd <= 0 && rel > 25) { audio.ballClick(Math.min(1.5, rel / 500)); this.soundCd = 0.03; }
      },
      onWall: (_d, v) => { if (this.soundCd <= 0 && v > 60) { audio.cushion(Math.min(1.2, v / 600)); this.soundCd = 0.03; } },
    }, 8);
    for (const b of potted) {
      const pk = POCKETS.reduce((best, p) => (Math.hypot(p.x - b.x, p.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? p : best));
      this.drops.push({ id: b.id, x: b.x, y: b.y, px: pk.x, py: pk.y, t: 0 });
      audio.pocket();
    }
    if (potted.length) this.pottedThisShot.push(...potted);
    if (allStopped(this.balls, 3)) {
      for (const b of this.balls) { b.vx = 0; b.vy = 0; }
      this.moving = false;
      if (this.mode === 'solo') this.endSolo(); else this.endDuo();
    }
  }

  private endSolo(): void {
    const scratch = this.pottedThisShot.includes(this.cue);
    const n = this.pottedThisShot.filter((b) => b !== this.cue).length;
    if (scratch) {
      this.shots++;
      const spot = this.freeSpot();
      this.cue.active = true; this.cue.x = spot.x; this.cue.y = spot.y;
      this.message = 'Bille blanche empochée : +1 coup de pénalité';
      this.host.s.audio.error();
    } else this.message = n > 0 ? `${n} bille${n > 1 ? 's' : ''} empochée${n > 1 ? 's' : ''} !` : '';
    if (this.remaining === 0) {
      const s = this.host.s;
      this.over = `Table vidée : ${finishArcade(s, 'billiards', this.shots, 'coups', (m) => (this.over = `Table vidée : ${m}`))}`;
      this.btn.again.visible = true; this.btn.shoot.visible = false;
    }
  }

  private endDuo(): void {
    const scratch = this.pottedThisShot.includes(this.cue);
    const v = judgeShot(this.eight, { firstHit: this.firstHit, potted: this.pottedThisShot.map((b) => b.id), scratch });
    if (v.respot8) {
      const eight = this.balls.find((b) => b.id === 8)!;
      const spot = this.freeSpot({ x: 420, y: TH / 2 }, 1);
      eight.active = true; eight.x = spot.x; eight.y = spot.y;
    }
    if (scratch) { const spot = this.freeSpot(); this.cue.active = true; this.cue.x = spot.x; this.cue.y = spot.y; }
    this.message = v.message;
    if (this.eight.winner !== null) {
      this.over = `Joueur ${this.eight.winner + 1} gagne la partie`;
      this.btn.again.visible = true; this.btn.shoot.visible = false;
      this.host.s.audio.win();
      return;
    }
    if (v.foul) { this.host.s.audio.error(); this.placing = this.eight.ballInHand; }
    else if (!v.again) this.host.s.audio.tap();
  }

  private get remaining(): number { return this.balls.filter((b) => b !== this.cue && b.active).length; }

  private freeSpot(from = HEAD, dirX = -1): { x: number; y: number } {
    for (let dx = 0; dx < 220; dx += 6) for (const dy of [0, 20, -20, 40, -40]) {
      const x = from.x + dirX * dx, y = from.y + dy;
      if (x < R || x > TW - R) continue;
      if (this.balls.every((b) => !b.active || (b === this.cue && from === HEAD) || Math.hypot(b.x - x, b.y - y) > R * 2 + 1)) return { x, y };
    }
    return { ...from };
  }

  /** Visée : premier obstacle (bille ou bande) sur la trajectoire de la blanche. */
  private aim(): { x: number; y: number; hit: Disc | null } {
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    let best = Infinity, hit: Disc | null = null;
    for (const b of this.balls) {
      if (b === this.cue || !b.active) continue;
      const fx = b.x - this.cue.x, fy = b.y - this.cue.y;
      const proj = fx * dx + fy * dy;
      if (proj <= 0) continue;
      const perp2 = fx * fx + fy * fy - proj * proj, rr = (R * 2) ** 2;
      if (perp2 > rr) continue;
      const t = proj - Math.sqrt(rr - perp2);
      if (t < best) { best = t; hit = b; }
    }
    const tx = dx > 0 ? (TW - R - this.cue.x) / dx : dx < 0 ? (R - this.cue.x) / dx : Infinity;
    const ty = dy > 0 ? (TH - R - this.cue.y) / dy : dy < 0 ? (R - this.cue.y) / dy : Infinity;
    const wall = Math.min(tx, ty), t = Math.min(best, wall);
    return { x: this.cue.x + dx * t, y: this.cue.y + dy * t, hit: best <= wall ? hit : null };
  }

  private drawBall(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, scale = 1): void {
    const r = R * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.arc(x + 1.6, y + 1.8, r, 0, Math.PI * 2); ctx.fill();
    if (id === 0) { ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    else {
      const c = colorOf(id);
      if (id > 8) {
        ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = c; ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1); ctx.restore();
      } else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `800 ${r * 0.62}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Le chiffre reste droit même table tournée
      ctx.save(); ctx.translate(x, y + r * 0.04); if (this.view.rot) ctx.rotate(-Math.PI / 2); ctx.fillText(String(id), 0, 0); ctx.restore();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.35, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, v = this.view, s = v.s;
    // ---- Table, en coordonnées monde
    ctx.save();
    ctx.translate(v.x, v.y);
    if (v.rot) { ctx.translate(TH * s, 0); ctx.rotate(Math.PI / 2); }
    ctx.scale(s, s);
    // Cadre en bois laqué, liseré doré, tapis vert casino
    roundRect(ctx, -24, -24, TW + 48, TH + 48, 16);
    const wood = ctx.createLinearGradient(0, -24, 0, TH + 24); wood.addColorStop(0, '#5b2a14'); wood.addColorStop(0.5, '#3a180a'); wood.addColorStop(1, '#5b2a14');
    ctx.fillStyle = wood; ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.8)'; ctx.lineWidth = 1.4; roundRect(ctx, -19, -19, TW + 38, TH + 38, 12); ctx.stroke();
    for (const [mx, my] of [[TW * 0.25, -12], [TW * 0.75, -12], [TW * 0.25, TH + 12], [TW * 0.75, TH + 12], [-12, TH / 2], [TW + 12, TH / 2]]) { ctx.fillStyle = '#efdcae'; ctx.beginPath(); ctx.arc(mx, my, 1.8, 0, Math.PI * 2); ctx.fill(); }
    const felt = ctx.createRadialGradient(TW / 2, TH / 2, 20, TW / 2, TH / 2, TW * 0.6); felt.addColorStop(0, '#1a7a4a'); felt.addColorStop(1, '#0d4f2f');
    ctx.fillStyle = felt; ctx.fillRect(0, 0, TW, TH);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, TW - 6, TH - 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(HEAD.x, 0); ctx.lineTo(HEAD.x, TH); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(HEAD.x, HEAD.y, 2, 0, Math.PI * 2); ctx.arc(420, TH / 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.font = '900 18px Georgia, serif'; ctx.fillStyle = 'rgba(212,175,90,0.18)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KS', TW / 2, TH / 2);
    for (const p of POCKETS) {
      ctx.fillStyle = '#d4af5a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#050304'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    // Visée assistée
    if (!this.moving && !this.over) {
      const e = this.aim(), c = this.cue;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, Math.PI * 2); ctx.stroke();
      if (e.hit) {
        // Bille visée : part dans l'axe centre fantôme → centre de la bille ; la blanche dévie à 90°
        const nx = e.hit.x - e.x, ny = e.hit.y - e.y, n = Math.hypot(nx, ny) || 1;
        const ux = nx / n, uy = ny / n;
        ctx.strokeStyle = 'rgba(239,220,174,0.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(e.hit.x, e.hit.y); ctx.lineTo(e.hit.x + ux * 70, e.hit.y + uy * 70); ctx.stroke();
        const dx = Math.cos(this.angle), dy = Math.sin(this.angle), dot = dx * ux + dy * uy;
        const tx = dx - dot * ux, ty = dy - dot * uy, tn = Math.hypot(tx, ty);
        if (tn > 0.05) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + (tx / tn) * 45, e.y + (ty / tn) * 45); ctx.stroke(); ctx.setLineDash([]); }
        // Mauvaise bille (8 américain) : visée en rouge
        if (this.mode === 'duo') {
          const g = this.eight.groups[this.eight.turn], grp = groupOf(e.hit.id);
          const bad = (g && grp !== g && !(grp === 'noire' && remainingOf(this.eight, this.eight.turn) === 0)) || (!g && grp === 'noire');
          if (bad) { ctx.strokeStyle = 'rgba(255,90,90,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.hit.x, e.hit.y, R + 3, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
      // Queue (recule selon la force)
      const back = 14 + this.power * 36;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(c.x - Math.cos(this.angle) * (R + back + 120), c.y - Math.sin(this.angle) * (R + back + 120)); ctx.lineTo(c.x - Math.cos(this.angle) * (R + back + 230), c.y - Math.sin(this.angle) * (R + back + 230)); ctx.stroke();
      ctx.strokeStyle = '#e8d2a8'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(c.x - Math.cos(this.angle) * (R + back), c.y - Math.sin(this.angle) * (R + back)); ctx.lineTo(c.x - Math.cos(this.angle) * (R + back + 120), c.y - Math.sin(this.angle) * (R + back + 120)); ctx.stroke();
      ctx.strokeStyle = '#3a6ea5'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(c.x - Math.cos(this.angle) * (R + back), c.y - Math.sin(this.angle) * (R + back)); ctx.lineTo(c.x - Math.cos(this.angle) * (R + back + 2), c.y - Math.sin(this.angle) * (R + back + 2)); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // Billes, puis billes qui tombent dans les poches
    for (const b of this.balls) if (b.active) this.drawBall(ctx, b.id, b.x, b.y);
    for (const d of this.drops) {
      const k = d.t / 0.35;
      ctx.globalAlpha = 1 - k; this.drawBall(ctx, d.id, d.x + (d.px - d.x) * k, d.y + (d.py - d.y) * k, 1 - k * 0.5); ctx.globalAlpha = 1;
    }
    if (this.placing) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
      ctx.strokeStyle = `rgba(239,220,174,${0.4 + pulse * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.cue.x, this.cue.y, R + 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // ---- Curseur de force
    const S = this.slider;
    const vert = S.vertical;
    const trackW = 16 * ui;
    if (vert) roundRect(ctx, S.x + S.w / 2 - trackW / 2, S.y, trackW, S.h, 8 * ui); else roundRect(ctx, S.x, S.y + S.h / 2 - trackW / 2, S.w, trackW, 8 * ui);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    const g = vert ? ctx.createLinearGradient(0, S.y + S.h, 0, S.y) : ctx.createLinearGradient(S.x, 0, S.x + S.w, 0);
    g.addColorStop(0, '#59e3a7'); g.addColorStop(0.6, '#ffd166'); g.addColorStop(1, '#ff5c5c');
    if (vert) { const fh = S.h * this.power; roundRect(ctx, S.x + S.w / 2 - trackW / 2, S.y + S.h - fh, trackW, fh, 8 * ui); }
    else { const fw = S.w * this.power; roundRect(ctx, S.x, S.y + S.h / 2 - trackW / 2, fw, trackW, 8 * ui); }
    ctx.fillStyle = g; ctx.fill();
    const kx = vert ? S.x + S.w / 2 : S.x + S.w * this.power, ky = vert ? S.y + S.h * (1 - this.power) : S.y + S.h / 2;
    ctx.fillStyle = LUXE.ivory; ctx.beginPath(); ctx.arc(kx, ky, 13 * ui, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.stroke();
    drawLabel(ctx, `Force ${Math.round(this.power * 100)} %`, vert ? S.x + S.w / 2 : S.x + 4 * ui, vert ? S.y + S.h + 14 * ui : S.y - 8 * ui, 11 * ui, PAL.textDim, vert ? 'center' : 'left', 700);

    // ---- Informations
    const a = this.host.area;
    const infoY = v.rot ? this.btn.shoot.y - 26 * ui : a.y + a.h - this.btn.shoot.h - 18 * ui;
    const infoX = v.rot ? a.x : v.x - 20 * s;
    let info: string;
    if (this.mode === 'solo') info = `Coups : ${this.shots}  ·  Billes restantes : ${this.remaining}`;
    else {
      const e = this.eight, gname = (p: 0 | 1) => (e.groups[p] ? `${e.groups[p]} (${remainingOf(e, p)})` : 'table ouverte');
      info = `▶ Joueur ${e.turn + 1}  ·  J1 : ${gname(0)}  ·  J2 : ${gname(1)}`;
    }
    if (!v.rot) drawLabel(ctx, info, infoX, infoY, 13 * ui, this.mode === 'duo' ? LUXE.champagne : PAL.text, 'left', 800);
    else drawLabel(ctx, info, infoX, this.view.y + (TW + 22) * s + 18 * ui, 12 * ui, this.mode === 'duo' ? LUXE.champagne : PAL.text, 'left', 800);
    const msg = this.placing ? 'Bille en main : touche la table pour poser la blanche' : this.message;
    if (this.over) drawPill(ctx, this.over, a.x + a.w / 2, this.btn.again.y - 30 * ui, 14 * ui, 'rgba(14,11,16,0.92)', PAL.gold);
    else if (msg) drawPill(ctx, msg, v.rot ? a.x + a.w / 2 : v.x + (TW * s) / 2, v.rot ? v.y - 10 * ui + 4 * ui : v.y + (TH * s) + 14 * s, 12 * ui, 'rgba(14,11,16,0.85)', PAL.text);
    this.layer.render(ctx, ui);
  }
}
