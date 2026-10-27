// Menu « Jeux » du casino : tous les jeux disponibles, le jeu en cours signalé ; un toucher ouvre le jeu choisi
// (la partie en cours doit d'abord être terminée : vérifié par la scène).
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import { CASINO_LOBBY, type CasinoEntry } from '../games/casinoLobby';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

export class CasinoLobbyMenu extends Modal {
  private gridBottom = 0;
  constructor(s: Services, private current: string, private pick: (e: CasinoEntry) => void) { super(s, 'Jeux du casino'); }

  protected measure(vp: Viewport, maxW: number, maxH: number) { return { w: Math.min(maxW, 720 * vp.ui), h: Math.min(maxH, (vp.height > vp.width ? 540 : 470) * vp.ui) }; }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, C = this.content, gap = 8 * ui;
    // Colonnes : le moins possible tant que chaque bouton garde 44 px de haut et que tout tient (note comprise)
    const n = CASINO_LOBBY.length, avail = C.h - 22 * ui;
    let cols = C.w > 560 * ui ? 3 : 2;
    while (cols < 4 && (avail - gap * (Math.ceil(n / cols) - 1)) / Math.ceil(n / cols) < 44 && (C.w - gap * cols) / (cols + 1) >= 130) cols++;
    const rows = Math.ceil(n / cols);
    const bw = (C.w - gap * (cols - 1)) / cols, bh = Math.max(44, Math.min(58 * ui, (avail - gap * (rows - 1)) / rows));
    this.gridBottom = C.y + rows * bh + (rows - 1) * gap;
    return CASINO_LOBBY.map((e, i) => makeButton({
      id: `lobby-${e.id}`, label: e.title, sub: e.id === this.current ? 'Jeu en cours' : e.kind, style: 'secondary', active: e.id === this.current, enabled: e.id !== this.current, fontSize: 14,
      x: C.x + (i % cols) * (bw + gap), y: C.y + Math.floor(i / cols) * (bh + gap), w: bw, h: bh,
      onTap: () => { this.close(); this.pick(e); },
    }));
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui, C = this.content;
    // Note affichée seulement si elle ne recouvre aucun bouton
    if (this.gridBottom > C.y + C.h - 16 * ui) return;
    ctx.fillStyle = PAL.textDim; ctx.font = font(11.5 * ui, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Mises et gains en jetons de casino · ton solde reste le même d’un jeu à l’autre', C.x + C.w / 2, C.y + C.h - 8 * ui, C.w);
  }
}
