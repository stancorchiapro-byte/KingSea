// Menu de l'ascenseur : les six niveaux du bateau, avec état clair (ici / disponible / en construction).
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { FLOORS } from '../world/floors';
import type { FloorDef } from '../world/types';
import { Modal } from './Modal';
import { makeButton, type Button } from './UIKit';

export function floorLabel(f: FloorDef): string {
  if (f.level === 0) return 'Rez-de-chaussée';
  if (f.level < 0) return 'Sous-sol';
  return `Étage ${f.level}`;
}

export class ElevatorMenu extends Modal {
  private cols = 1;

  constructor(s: Services, private currentId: string, private onSelect: (floorId: string) => void) {
    super(s, 'Ascenseur KingSea');
  }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    const ui = vp.ui, rowH = 58 * ui, gap = 8 * ui;
    this.cols = FLOORS.length * (rowH + gap) > maxH ? 2 : 1;
    const rows = Math.ceil(FLOORS.length / this.cols);
    return { w: Math.min(maxW, (this.cols === 2 ? 640 : 380) * ui), h: rows * (rowH + gap) - gap };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, gap = 8 * ui, rows = Math.ceil(FLOORS.length / this.cols);
    const bw = (this.content.w - gap * (this.cols - 1)) / this.cols;
    const bh = Math.min(58 * ui, (this.content.h - gap * (rows - 1)) / rows);
    return FLOORS.map((f, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const here = f.id === this.currentId;
      const sub = here ? `${floorLabel(f)} · Vous êtes ici` : f.available ? `${floorLabel(f)} · ${f.description}` : `${floorLabel(f)} · En construction (phase ${f.plannedPhase ?? 2})`;
      return makeButton({
        id: `floor-${f.id}`,
        label: `${f.short === 'RDC' ? 'RDC' : f.short}  ${f.name}`,
        sub,
        style: f.available ? 'secondary' : 'disabled',
        enabled: f.available && !here,
        active: here,
        x: this.content.x + col * (bw + gap), y: this.content.y + row * (bh + gap), w: bw, h: bh,
        fontSize: 15,
        onTap: () => { this.close(); this.onSelect(f.id); },
      });
    });
  }
}
