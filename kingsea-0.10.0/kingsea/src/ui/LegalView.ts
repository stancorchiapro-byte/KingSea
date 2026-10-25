// Lecture des textes légaux dans le jeu (politique de confidentialité, conditions d'utilisation, à propos) :
// vraie page HTML défilante par-dessus le jeu (texte long, taille de police du système, lecteur d'écran).
import { LEGAL, PRIVACY, TERMS, type LegalSection } from '../legal/texts';

export type LegalKind = 'privacy' | 'terms' | 'about';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function aboutSections(version: string): LegalSection[] {
  return [
    { title: LEGAL.appName, body: [`Version ${version}`, `Éditeur : ${LEGAL.publisher}`, `Contact : ${LEGAL.contactEmail}`] },
    { title: 'Crédits', body: [`Conception, direction et édition : ${LEGAL.publisher}.`] },
    { title: 'Création', body: ['Graphismes, musiques et sons originaux, générés par le code du jeu (aucune ressource tierce sous licence).', 'Moteur : TypeScript + Canvas 2D ; application : Capacitor ; serveur : Node.js, ws, SQLite.'] },
    { title: 'Jeu responsable', body: ['Les KSCoins et les jetons de casino n’ont aucune valeur réelle. Aide en cas de problème avec les jeux d’argent : Joueurs Info Service, 09 74 75 13 13 (France).'] },
  ];
}

export function openLegal(kind: LegalKind, version = typeof __KS_VERSION__ !== 'undefined' ? __KS_VERSION__ : '?', onClose?: () => void): void {
  if (typeof document === 'undefined') return;
  document.getElementById('ks-legal')?.remove();
  const title = kind === 'privacy' ? 'Politique de confidentialité' : kind === 'terms' ? 'Conditions d’utilisation' : 'À propos';
  const list = kind === 'privacy' ? PRIVACY : kind === 'terms' ? TERMS : aboutSections(version);
  const wrap = document.createElement('div');
  wrap.id = 'ks-legal';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', title);
  wrap.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;justify-content:center;background:rgba(6,5,8,0.85);padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;width:min(720px,100%);max-height:100%;background:#1a151c;border:1.5px solid rgba(212,175,90,0.6);border-radius:16px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px 10px 18px;border-bottom:1px solid rgba(255,255,255,0.1)">
        <h2 style="flex:1;margin:0;color:#efdcae;font-size:18px">${esc(title)}</h2>
        <button data-close aria-label="Fermer" style="min-width:46px;min-height:46px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6fbff;font-size:20px;font-weight:800">✕</button>
      </div>
      <div data-body style="overflow:auto;padding:4px 18px 18px;color:#e9f2fb;font-size:15px;line-height:1.5;-webkit-overflow-scrolling:touch">
        ${kind !== 'about' ? `<p style="color:#cbbfa8;font-size:13px">${esc(LEGAL.appName)} · mise à jour le ${esc(LEGAL.updated)}</p>` : ''}
        ${list.map((s) => `<h3 style="color:#efdcae;font-size:16px;margin:16px 0 4px">${esc(s.title)}</h3>${s.body.map((b) => `<p style="margin:4px 0">${esc(b)}</p>`).join('')}`).join('')}
      </div>
    </div>`;
  const close = () => { wrap.remove(); onClose?.(); };
  (wrap.querySelector('[data-close]') as HTMLElement).addEventListener('click', close);
  wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === wrap) close(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.appendChild(wrap);
}
