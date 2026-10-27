// Écran de chargement : la barre reflète de vraies étapes (génération des textures du navire),
// une étape par image pour garder l'animation fluide. Aucune progression simulée.
import { LEGAL } from '../legal/texts';
import { NPC_LOOKS, warmLook } from '../art/characters';
import { getStaticLayer } from '../art/floorRenderer';
import { drawKSLogo } from '../art/logo';
import { drawLoadingSea, shipLayout, WATERLINE } from '../art/loadingSea';
import { PAL } from '../art/palette';
import { getPropVisual } from '../art/props';
import type { PointerHandler } from '../engine/Input';
import type { Scene } from '../engine/Scene';
import type { Services } from '../systems/Services';
import { roundRect } from '../art/canvas';
import { font } from '../ui/UIKit';
import { getPlayableFloor, setCabinRoom, setCabinWallColor } from '../world/floors';

interface Step { label: string; run: () => void }

export class BootScene implements Scene {
  private steps: Step[] = [];
  private done = 0;
  private t = 0;
  private finished = false;
  private error: string | null = null;

  constructor(private s: Services, private next: () => Scene) {}

  enter(): void {
    const s = this.s;
    this.steps = [
      { label: 'Ouverture des écoutilles', run: () => {} }, // laisse le logo s'afficher avant le travail
      { label: 'Préparation de ton personnage', run: () => { warmLook(s.data.appearance, ['walk', 'idle', 'interact']); } },
      { label: 'Arrivée de l’équipage', run: () => { for (const l of Object.values(NPC_LOOKS)) warmLook(l, ['idle']); } },
    ];
    // Seul l'étage de départ est préparé maintenant (décor et sol) ; les autres le sont à la première visite,
    // pendant la transition d'ascenseur : démarrage plus rapide et mémoire limitée (audit phase 7).
    setCabinWallColor(s.data.cabin.wallColor);
    setCabinRoom(s.data.room);
    const start = getPlayableFloor(s.data.location.floorId);
    this.steps.push({ label: `Décor : ${start.name}`, run: () => { for (const p of start.props ?? []) getPropVisual(p); } });
    this.steps.push({ label: `Construction : ${start.name}`, run: () => { getStaticLayer(start); } });
  }

  exit(): void {}
  /** En cas d'erreur : un toucher relance l'étape qui a échoué (jamais d'écran bloqué). */
  pointerHandlers(): PointerHandler[] { return [{ onDown: () => { if (!this.error) return false; this.error = null; this.retries++; return true; } }]; }
  private retries = 0;

  get progress(): number { return this.steps.length ? this.done / this.steps.length : 1; }

  update(dt: number): void {
    this.t += dt;
    if (this.error || this.finished) return;
    if (this.done < this.steps.length) {
      try { this.steps[this.done].run(); this.done++; }
      catch (e) {
        console.error('[KingSea] démarrage', e);
        // Après deux essais, on continue sans cette préparation (elle sera refaite à la demande) : pas de blocage
        if (this.retries >= 2) { this.done++; return; }
        this.error = `Chargement interrompu (${this.steps[this.done].label.toLowerCase()})`;
        this.s.game.refreshHandlers();
      }
    } else if (this.t > 0.6) {
      this.finished = true;
      this.s.game.goto(this.next, 2.6);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const v = this.s.game.viewport, ui = v.ui;
    drawLoadingSea(ctx, v.width, v.height, this.t, this.s.lowFx);
    // Mise en page selon le navire : logo dans le ciel (portrait) ou à gauche du navire (paysage), plaque sous l'eau
    const wl = v.height * WATERLINE, lay = shipLayout(v.width, v.height), wide = v.width > v.height * 1.2;
    const shipTop = wl - lay.width * 0.36 * 0.86;
    const lx = wide ? Math.max(v.safe.left + 120 * ui, (lay.cx - lay.width / 2) / 2 + v.safe.left / 2) : v.width / 2;
    const room = wide ? wl - v.safe.top - 10 * ui : shipTop - v.safe.top - 12 * ui;
    const logoSize = Math.max(40, Math.min(room / (wide ? 2.6 : 2.95), (wide ? (lay.cx - lay.width / 2) * 0.55 : v.width * 0.4), 190));
    const cy = v.safe.top + 8 * ui + logoSize * 1.05;
    const halo = ctx.createRadialGradient(lx, cy, logoSize * 0.2, lx, cy, logoSize * 1.3);
    halo.addColorStop(0, 'rgba(255,226,170,0.25)'); halo.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.fillStyle = halo; ctx.fillRect(lx - logoSize * 1.4, cy - logoSize * 1.4, logoSize * 2.8, logoSize * 2.8);
    drawKSLogo(ctx, lx, cy + Math.sin(this.t * 1.2) * 2 * ui, logoSize, this.t);

    // Plaque de chargement : barre dorée avec une perle qui avance (progression réelle des étapes)
    const pw0 = Math.min(360 * ui, v.width - 40 * ui), bh = 8 * ui;
    const pcx = wide ? lx : v.width / 2;
    const pw = wide ? Math.min(pw0, 2 * (lx - v.safe.left - 24 * ui)) : pw0;
    const px = pcx - pw / 2, py = Math.min(v.height - v.safe.bottom - 112 * ui, Math.max(wl + 40 * ui, (wl + v.height - v.safe.bottom) / 2 - 30 * ui));
    roundRect(ctx, px - 16 * ui, py - 18 * ui, pw + 32 * ui, 100 * ui, 16 * ui);
    ctx.fillStyle = 'rgba(6,14,28,0.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(212,175,90,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    roundRect(ctx, px, py, pw, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    const p = this.progress;
    if (p > 0) {
      roundRect(ctx, px, py, Math.max(bh, pw * p), bh, bh / 2);
      const g = ctx.createLinearGradient(px, 0, px + pw, 0); g.addColorStop(0, PAL.turquoise); g.addColorStop(1, PAL.gold);
      ctx.fillStyle = g; ctx.fill();
      // Reflet qui glisse sur la partie remplie
      if (!this.s.lowFx) {
        const sx = px + ((this.t * 0.6) % 1) * pw * p;
        const sg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.45)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); roundRect(ctx, px, py, Math.max(bh, pw * p), bh, bh / 2); ctx.clip(); ctx.fillStyle = sg; ctx.fillRect(sx - 30, py, 60, bh); ctx.restore();
      }
    }
    // Perle au bout de la progression
    const pxp = px + Math.max(bh / 2, pw * p), pr = 8 * ui;
    const pg = ctx.createRadialGradient(pxp - pr * 0.3, py + bh / 2 - pr * 0.3, 1, pxp, py + bh / 2, pr);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.7, '#f1e9ff'); pg.addColorStop(1, '#bfaee0');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(pxp, py + bh / 2, pr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = this.steps[Math.min(this.done, this.steps.length - 1)];
    const label = this.error ?? (this.done >= this.steps.length ? 'Embarquement !' : `${step?.label ?? ''}…`);
    ctx.fillStyle = this.error ? '#ff9b9b' : PAL.text; ctx.font = font(13.5 * ui, 700);
    ctx.fillText(this.error ? label : `${label}  ${Math.round(p * 100)} %`, pcx, py + 28 * ui, pw);
    ctx.font = font(12 * ui, 600); ctx.fillStyle = 'rgba(239,220,174,0.75)';
    ctx.fillText(this.error ? 'Touche l’écran pour réessayer' : `Un jeu de ${LEGAL.publisher} · v${typeof __KS_VERSION__ !== 'undefined' ? __KS_VERSION__ : ''}`, pcx, py + 52 * ui, pw);
    // Astuce (change toutes les 3 s)
    if (!this.error) {
      const tip = TIPS[Math.floor(this.t / 3) % TIPS.length];
      ctx.font = font(11.5 * ui, 600); ctx.fillStyle = 'rgba(200,230,255,0.7)';
      ctx.fillText(tip, pcx, Math.min(v.height - v.safe.bottom - 14 * ui, py + 96 * ui), wide ? Math.min(v.width - 30 * ui, (lay.cx - lay.width / 2) * 2 - 20 * ui) : v.width - 30 * ui);
    }
  }
}

const TIPS = [
  'Astuce : la caisse du casino échange tes KSCoins contre des jetons, et inversement.',
  'Astuce : surveille la faim et la soif, le bar du hall est juste à gauche.',
  'Astuce : le Circuit KS t’attend au 2e étage, à l’arcade.',
  'Astuce : la Boutique KS du hall habille ton personnage.',
  'Astuce : un poisson doré passe parfois dans l’aquarium du hall…',
];
