// Écran de chargement : la barre reflète de vraies étapes (génération des textures du navire),
// une étape par image pour garder l'animation fluide. Aucune progression simulée.
import { LEGAL } from '../legal/texts';
import { NPC_LOOKS, warmLook } from '../art/characters';
import { getStaticLayer } from '../art/floorRenderer';
import { drawKSLogo } from '../art/logo';
import { drawOceanBackground } from '../art/ocean';
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
  pointerHandlers(): PointerHandler[] { return []; }

  get progress(): number { return this.steps.length ? this.done / this.steps.length : 1; }

  update(dt: number): void {
    this.t += dt;
    if (this.error || this.finished) return;
    if (this.done < this.steps.length) {
      try { this.steps[this.done].run(); this.done++; }
      catch (e) { this.error = `Erreur de chargement : ${String(e)}`; console.error(e); }
    } else if (this.t > 0.6) {
      this.finished = true;
      this.s.game.goto(this.next, 2.6);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const v = this.s.game.viewport, ui = v.ui;
    drawOceanBackground(ctx, v.width, v.height, this.t);
    const logoSize = Math.min(v.height * 0.3, v.width * 0.42, 220);
    const cy = v.safe.top + (v.height - v.safe.top - v.safe.bottom) * 0.38;
    drawKSLogo(ctx, v.width / 2, cy, logoSize, this.t);

    const bw = Math.min(320 * ui, v.width * 0.6), bh = 10 * ui;
    const bx = v.width / 2 - bw / 2, by = Math.min(v.height - v.safe.bottom - 40 * ui, cy + logoSize * 1.32);
    roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    if (this.progress > 0) {
      roundRect(ctx, bx, by, Math.max(bh, bw * this.progress), bh, bh / 2);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, PAL.turquoise); g.addColorStop(1, PAL.gold);
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.fillStyle = this.error ? PAL.danger : PAL.textDim; ctx.font = font(13 * ui, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = this.steps[Math.min(this.done, this.steps.length - 1)];
    const label = this.error ?? (this.done >= this.steps.length ? 'Embarquement !' : `${step?.label ?? ''}…`);
    ctx.fillText(`${label}  ${Math.round(this.progress * 100)} %`, v.width / 2, by + bh + 10 * ui, v.width - 32);
    ctx.fillStyle = 'rgba(239,220,174,0.7)'; ctx.font = font(12 * ui, 700);
    ctx.fillText(`Un jeu de ${LEGAL.publisher}`, v.width / 2, by + bh + 32 * ui, v.width - 32);
    // Indicateur d'activité : petite barre à roue de navire qui tourne
    if (!this.error) {
      const wx = bx - 18 * ui, wy = by + bh / 2, wr = 9 * ui;
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(this.t * 3);
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2 * ui;
      ctx.beginPath(); ctx.arc(0, 0, wr * 0.6, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * wr * 0.2, Math.sin(a) * wr * 0.2); ctx.lineTo(Math.cos(a) * wr, Math.sin(a) * wr); ctx.stroke(); }
      ctx.restore();
    }
  }
}
