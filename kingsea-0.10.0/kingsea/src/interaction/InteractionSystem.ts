// Système d'interaction centralisé : bars, portes, ascenseurs, jeux et objets partagent la même mécanique.
// - Le plus proche des objets à portée devient « ciblé » (bouton Interagir + surbrillance).
// - Un toucher direct sur l'objet fonctionne aussi s'il est à portée.

export interface Interactable {
  /** Clé unique dans l'étage (ex. 'bar', 'elevator', 'compass'). */
  key: string;
  /** Gestionnaire à appeler. */
  handler: string;
  label: string;
  x: number; y: number;
  radius: number;
  /** Zone de toucher (monde) pour l'interaction directe. */
  hit: { x: number; y: number; w: number; h: number };
  enabled: boolean;
  /** N'afficher l'étiquette que lorsque l'objet est ciblé. */
  quiet?: boolean;
  /** Référence libre vers l'objet du monde (accessoire). */
  ref?: unknown;
}

export class InteractionSystem {
  items: Interactable[] = [];
  focused: Interactable | null = null;

  set(items: Interactable[]): void { this.items = items; this.focused = null; }

  update(px: number, py: number): Interactable | null {
    let best: Interactable | null = null, bestD = Infinity;
    for (const it of this.items) {
      if (!it.enabled) continue;
      const d = Math.hypot(it.x - px, it.y - py);
      // Petite préférence pour l'objet déjà ciblé : évite d'alterner entre deux objets proches.
      const score = it === this.focused ? d - 6 : d;
      if (d <= it.radius && score < bestD) { best = it; bestD = score; }
    }
    this.focused = best;
    return best;
  }

  /** Objet touché à la position monde (wx, wy), s'il est à portée du joueur. */
  pickAt(wx: number, wy: number, px: number, py: number, slack = 1.35): Interactable | null {
    for (const it of this.items) {
      if (!it.enabled) continue;
      const h = it.hit;
      if (wx >= h.x && wx <= h.x + h.w && wy >= h.y && wy <= h.y + h.h && Math.hypot(it.x - px, it.y - py) <= it.radius * slack) return it;
    }
    return null;
  }

  /** Objet touché, même hors de portée (pour indiquer « approche-toi »). */
  hitTest(wx: number, wy: number): Interactable | null {
    for (const it of this.items) {
      if (!it.enabled) continue;
      const h = it.hit;
      if (wx >= h.x && wx <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) return it;
    }
    return null;
  }
}
