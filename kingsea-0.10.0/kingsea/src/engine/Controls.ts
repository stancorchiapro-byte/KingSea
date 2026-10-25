// Commandes : actions nommées (se déplacer, interagir, chat, emotes, missions…) liées au clavier — touches
// par défaut + une touche personnalisable par action — et à la manette (API Gamepad, disposition standard).
// Les scènes demandent « l'action X vient-elle d'être déclenchée ? » au lieu de lire des touches.
// Pendant la saisie de texte (chat, pseudo…), le clavier ne pilote plus le jeu (filtré par Input).
import type { Input } from './Input';

export type Action = 'up' | 'down' | 'left' | 'right' | 'interact' | 'chat' | 'emote' | 'missions' | 'friends' | 'floors' | 'inventory' | 'help' | 'back';

export interface ActionDef { id: Action; label: string; keys: string[]; pad: string }

/** Touches par défaut (codes physiques : W/Z et A/Q couvrent QWERTY et AZERTY). */
export const ACTIONS: ActionDef[] = [
  { id: 'up', label: 'Avancer', keys: ['ArrowUp', 'KeyW', 'KeyZ'], pad: 'Stick gauche / croix ↑' },
  { id: 'down', label: 'Reculer', keys: ['ArrowDown', 'KeyS'], pad: 'Stick gauche / croix ↓' },
  { id: 'left', label: 'Gauche', keys: ['ArrowLeft', 'KeyA', 'KeyQ'], pad: 'Stick gauche / croix ←' },
  { id: 'right', label: 'Droite', keys: ['ArrowRight', 'KeyD'], pad: 'Stick gauche / croix →' },
  { id: 'interact', label: 'Interagir / jouer', keys: ['KeyE', 'Enter', 'Space'], pad: 'A' },
  { id: 'chat', label: 'Ouvrir le chat', keys: ['KeyT'], pad: 'LB' },
  { id: 'emote', label: 'Emotes', keys: ['KeyG'], pad: 'X' },
  { id: 'missions', label: 'Missions', keys: ['KeyM'], pad: 'Y' },
  { id: 'friends', label: 'Amis', keys: ['KeyF'], pad: 'RB' },
  { id: 'floors', label: 'Étages (ascenseur)', keys: ['KeyL'], pad: 'Select' },
  { id: 'inventory', label: 'Inventaire', keys: ['KeyI'], pad: 'LT' },
  { id: 'help', label: 'Aide des commandes', keys: ['F1', 'KeyH'], pad: '—' },
  { id: 'back', label: 'Retour / fermer', keys: ['Escape'], pad: 'B' },
];

/** Boutons de manette (disposition « standard ») → action. */
const PAD_BUTTONS: Partial<Record<Action, number>> = { interact: 0, back: 1, emote: 2, missions: 3, chat: 4, friends: 5, inventory: 6, floors: 8, up: 12, down: 13, left: 14, right: 15 };
const START = 9;

/** Nom lisible d'une touche (codes KeyboardEvent.code). */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espace', Enter: 'Entrée', Escape: 'Échap', ShiftLeft: 'Maj', ShiftRight: 'Maj d.', Tab: 'Tab', Backspace: 'Retour', ControlLeft: 'Ctrl' };
  return names[code] ?? code;
}

export class Controls {
  /** Touche personnalisée par action (en plus des touches par défaut), sauvegardée dans les paramètres. */
  custom: Partial<Record<Action, string>> = {};
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  private padAxes = { x: 0, y: 0 };
  /** Nom de la manette branchée (null : aucune). */
  padName: string | null = null;
  /** Attente d'une touche pour réassigner une action (menu des commandes). */
  private capture: ((code: string) => void) | null = null;

  constructor(private input: Input) {
    input.onKeyCapture = (code) => {
      if (!this.capture) return false;
      const f = this.capture; this.capture = null; f(code);
      return true;
    };
  }

  /** Touches effectives d'une action : touche personnalisée d'abord, puis celles par défaut. */
  keysOf(a: Action): string[] {
    const def = ACTIONS.find((x) => x.id === a)!.keys;
    const c = this.custom[a];
    return c ? [c, ...def.filter((k) => k !== c)] : def;
  }

  /** Une touche personnalisée ne doit pas déclencher aussi une autre action par défaut. */
  private conflicts(code: string, a: Action): boolean {
    for (const [other, k] of Object.entries(this.custom)) if (other !== a && k === code) return true;
    return false;
  }

  down(a: Action): boolean {
    if (this.keysOf(a).some((k) => this.input.isDown(k) && !this.conflicts(k, a))) return true;
    const b = PAD_BUTTONS[a];
    return b !== undefined && !!this.padNow[b];
  }

  pressed(a: Action): boolean {
    if (this.keysOf(a).some((k) => this.input.wasPressed(k) && !this.conflicts(k, a))) return true;
    const b = PAD_BUTTONS[a];
    return b !== undefined && !!this.padNow[b] && !this.padPrev[b];
  }

  /** Bouton Start de la manette (paramètres). */
  get startPressed(): boolean { return !!this.padNow[START] && !this.padPrev[START]; }

  /** Direction de déplacement (clavier + stick), normalisée. */
  axis(): { x: number; y: number } {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
    if (Math.hypot(this.padAxes.x, this.padAxes.y) > 0.25) { x = this.padAxes.x; y = this.padAxes.y; }
    const n = Math.hypot(x, y);
    return n > 1 ? { x: x / n, y: y / n } : { x, y };
  }

  /** À appeler une fois par image, avant la mise à jour de la scène. */
  poll(): void {
    this.padPrev = this.padNow;
    this.padNow = [];
    this.padAxes = { x: 0, y: 0 };
    this.padName = null;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads ?? []) {
      if (!p || !p.connected) continue;
      this.padName = p.id.replace(/\s*\(.*\)\s*/g, ' ').trim() || 'Manette';
      this.padNow = p.buttons.map((b) => b.pressed || b.value > 0.5);
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      this.padAxes = { x: Math.abs(ax) > 0.2 ? ax : 0, y: Math.abs(ay) > 0.2 ? ay : 0 };
      if (this.padNow.some(Boolean) || this.padAxes.x || this.padAxes.y) this.input.lastActivity = performance.now();
      break;
    }
  }

  /** Attend la prochaine touche (réassignation) ; Échap annule (null). */
  captureNext(done: (code: string | null) => void): void {
    this.capture = (code) => done(code === 'Escape' ? null : code);
  }
  cancelCapture(): void { this.capture = null; }
  get capturing(): boolean { return this.capture !== null; }
}
