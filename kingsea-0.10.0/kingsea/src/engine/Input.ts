// Gestion unifiée du toucher (multi-doigts), de la souris et du clavier.
// Les scènes et widgets s'abonnent via handlers ; chaque pointeur est "capturé" par
// le premier handler qui l'accepte (ex. le joystick garde son doigt même hors de sa zone).

export interface PointerInfo { id: number; x: number; y: number; startX: number; startY: number; startTime: number; type: string }

export interface PointerHandler {
  /** Retourne true pour capturer ce pointeur. */
  onDown(p: PointerInfo): boolean;
  onMove?(p: PointerInfo): void;
  onUp?(p: PointerInfo, cancelled: boolean): void;
}

export class Input {
  readonly pointers = new Map<number, PointerInfo>();
  private owners = new Map<number, PointerHandler>();
  private handlers: PointerHandler[] = [];
  private keys = new Set<string>();
  private pressed = new Set<string>();
  /** Capture de la prochaine touche (réassignation) : renvoie true si la touche est consommée. */
  onKeyCapture: ((code: string) => boolean) | null = null;
  /** Appelé au premier geste utilisateur (déverrouillage audio). */
  onFirstGesture: (() => void) | null = null;
  /** Dernière action du joueur (pour ralentir l'affichage quand rien ne se passe). */
  lastActivity = performance.now();

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e, false));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      // Saisie de texte (chat, pseudo, code ami…) : le clavier ne pilote pas le jeu
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Réassignation d'une touche en cours (menu des commandes)
      if (this.onKeyCapture?.(e.code)) { e.preventDefault(); return; }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.gesture();
      this.lastActivity = performance.now();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  /** Les handlers ajoutés en dernier sont prioritaires (UI au-dessus du monde). */
  setHandlers(list: PointerHandler[]): void { this.handlers = list; }

  isDown(code: string): boolean { return this.keys.has(code); }
  /** Vrai une seule fois par appui. */
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  endFrame(): void { this.pressed.clear(); }

  reset(): void {
    for (const [id, h] of this.owners) { const p = this.pointers.get(id); if (p) h.onUp?.(p, true); }
    this.owners.clear(); this.pointers.clear(); this.keys.clear();
  }

  private gesture(): void { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.lastActivity = performance.now();
    this.gesture();
    const p: PointerInfo = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now(), type: e.pointerType };
    this.pointers.set(p.id, p);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i].onDown(p)) { this.owners.set(p.id, this.handlers[i]); break; }
    }
  }

  private move(e: PointerEvent): void {
    if (this.pointers.size) this.lastActivity = performance.now();
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    this.owners.get(p.id)?.onMove?.(p);
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    this.owners.get(p.id)?.onUp?.(p, cancelled);
    this.owners.delete(p.id);
    this.pointers.delete(p.id);
  }
}
