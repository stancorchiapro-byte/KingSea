// Barre de saisie du chat : vrai champ HTML en bas de l'écran (clavier du téléphone), reste ouverte
// pour enchaîner les messages ; « ✕ » ou Échap la ferme. Deux canaux : « Proximité » (joueurs proches, bulles
// au-dessus des personnages) et « Global » (tout le navire, à partir du niveau 2). Pendant la saisie, les
// touches ne pilotent plus le personnage (le champ garde le focus clavier). Le texte est filtré par le serveur.
import { CHAT_MAX, type ChatScope } from '../net/protocol';

const SCOPE_LABEL: Record<ChatScope, string> = { near: 'Proximité', global: 'Global' };

export class ChatInput {
  private el: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  scope: ChatScope = 'near';
  /** Prévenu quand le canal change (le fil affiché suit). */
  onScope: ((s: ChatScope) => void) | null = null;
  get open(): boolean { return this.el !== null; }

  show(onSend: (text: string, scope: ChatScope) => void, onClose: () => void): void {
    if (this.el || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'ks-chat';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9;display:flex;gap:8px;padding:8px max(10px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:rgba(10,8,12,0.94);border-top:1px solid rgba(239,220,174,0.35);font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
    el.innerHTML = `
      <button type="button" data-scope aria-label="Canal du chat" style="min-width:96px;min-height:44px;border-radius:12px;border:1.5px solid #8a6a2b;background:#1a1418;color:#efdcae;font-size:14px;font-weight:800"></button>
      <form style="display:flex;gap:8px;flex:1">
        <input maxlength="${CHAT_MAX}" enterkeyhint="send" autocomplete="off"
          style="flex:1;min-width:0;font-size:16px;padding:10px 12px;border-radius:12px;border:1.5px solid #8a6a2b;background:#0e0b10;color:#f6f0e3;outline:none">
        <button type="submit" style="min-width:84px;min-height:44px;border-radius:12px;border:0;background:linear-gradient(#efdcae,#d4af5a);color:#0e0b10;font-size:15px;font-weight:800">Envoyer</button>
      </form>
      <button type="button" data-close aria-label="Fermer" style="min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6f0e3;font-size:18px">✕</button>`;
    const form = el.querySelector('form')!, input = el.querySelector('input')!, scopeBtn = el.querySelector('[data-scope]') as HTMLButtonElement;
    const paint = () => {
      scopeBtn.textContent = this.scope === 'near' ? '◉ Proximité' : '◎ Global';
      input.placeholder = this.scope === 'near' ? 'Message aux joueurs proches…' : 'Message à tout le navire…';
    };
    paint();
    scopeBtn.addEventListener('click', () => { this.scope = this.scope === 'near' ? 'global' : 'near'; paint(); this.onScope?.(this.scope); input.focus(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) onSend(t, this.scope); input.value = ''; input.focus(); });
    const close = () => { this.hide(); onClose(); };
    (el.querySelector('[data-close]') as HTMLElement).addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      // Tab : changer de canal sans quitter le clavier
      if (e.key === 'Tab') { e.preventDefault(); scopeBtn.click(); }
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    this.el = el; this.input = input;
    setTimeout(() => input.focus(), 30);
  }

  /** Libellé du canal courant. */
  get scopeLabel(): string { return SCOPE_LABEL[this.scope]; }

  /** Le champ a le focus clavier (les raccourcis du jeu sont alors ignorés). */
  get typing(): boolean { return !!this.input && typeof document !== 'undefined' && document.activeElement === this.input; }

  hide(): void { this.el?.remove(); this.el = null; this.input = null; }
}
