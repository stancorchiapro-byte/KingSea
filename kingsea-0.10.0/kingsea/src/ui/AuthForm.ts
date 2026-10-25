// Formulaire de connexion / création de compte : vrais champs HTML (clavier du téléphone, gestionnaire
// de mots de passe, saisie automatique). Le mot de passe n'est jamais affiché ni enregistré par le jeu.
// Inscription : âge et acceptation des conditions / de la politique de confidentialité obligatoires.
import { LEGAL } from '../legal/texts';
import { openLegal } from './LegalView';

export interface AuthFormResult { name: string; password: string }

export function openAuthForm(mode: 'register' | 'login', initialName: string, onSubmit: (r: AuthFormResult) => Promise<string | null>, onCancel: () => void): void {
  if (typeof document === 'undefined') { onCancel(); return; }
  const wrap = document.createElement('div');
  wrap.id = 'ks-auth';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:max(12px,env(safe-area-inset-top)) 12px 12px;background:rgba(6,5,8,0.78);font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
  const field = 'box-sizing:border-box;width:100%;font-size:17px;padding:11px 13px;border-radius:12px;border:1.5px solid #8a6a2b;background:#0e0b10;color:#f6fbff;outline:none;margin:4px 0 10px';
  wrap.innerHTML = `
    <form style="margin-top:4vh;width:min(420px,100%);background:#1a151c;border:1.5px solid rgba(212,175,90,0.6);border-radius:16px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,0.5)">
      <h2 style="margin:0 0 12px;color:#efdcae;font-size:19px">${mode === 'register' ? 'Créer mon compte KingSea' : 'Se connecter'}</h2>
      <label style="color:#cbbfa8;font-size:13px;font-weight:700">Pseudo</label>
      <input name="name" maxlength="16" autocomplete="username" autocapitalize="words" style="${field}">
      <label style="color:#cbbfa8;font-size:13px;font-weight:700">Mot de passe${mode === 'register' ? ' (6 caractères minimum)' : ''}</label>
      <input name="password" type="password" maxlength="64" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" style="${field}">
      ${mode === 'register' ? `<p style="color:#cbbfa8;font-size:12px;margin:0 0 8px">Les KSCoins sont une monnaie de jeu sans valeur réelle. Pas de récupération par e-mail : note ton mot de passe, et ne réutilise pas un mot de passe important.</p>
      <label style="display:flex;gap:10px;align-items:flex-start;color:#e9f2fb;font-size:13px;line-height:1.4;margin:4px 0 6px;min-height:44px">
        <input name="terms" type="checkbox" style="width:24px;height:24px;flex:none;margin:2px 0 0;accent-color:#e5b54a">
        <span>J’ai ${LEGAL.minAge} ans ou plus et j’accepte les <a href="#" data-legal="terms" style="color:#efdcae">conditions d’utilisation</a> et la <a href="#" data-legal="privacy" style="color:#efdcae">politique de confidentialité</a>.</span>
      </label>` : ''}
      <p data-err style="color:#ff8a8a;font-size:13px;min-height:18px;margin:4px 2px"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" data-cancel style="min-height:46px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6fbff;font-size:16px;font-weight:700">Annuler</button>
        <button type="submit" style="min-height:46px;padding:0 22px;border-radius:12px;border:0;background:linear-gradient(#efdcae,#e5b54a);color:#0e0b10;font-size:16px;font-weight:800">${mode === 'register' ? 'Créer' : 'Connexion'}</button>
      </div>
    </form>`;
  const form = wrap.querySelector('form')!, err = wrap.querySelector('[data-err]') as HTMLElement;
  const name = wrap.querySelector('input[name=name]') as HTMLInputElement, pw = wrap.querySelector('input[name=password]') as HTMLInputElement;
  const submit = wrap.querySelector('button[type=submit]') as HTMLButtonElement;
  name.value = initialName;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (name.value.trim().length < 2) { err.textContent = 'Pseudo : 2 caractères minimum'; return; }
    if (pw.value.length < (mode === 'register' ? 6 : 1)) { err.textContent = 'Mot de passe : 6 caractères minimum'; return; }
    const terms = wrap.querySelector('input[name=terms]') as HTMLInputElement | null;
    if (terms && !terms.checked) { err.textContent = `Coche la case (${LEGAL.minAge} ans ou plus, conditions acceptées) pour créer un compte.`; return; }
    submit.disabled = true; err.textContent = 'Connexion…';
    const fail = await onSubmit({ name: name.value.trim(), password: pw.value });
    submit.disabled = false;
    if (fail) { err.textContent = fail; return; }
    wrap.remove();
  });
  for (const a of wrap.querySelectorAll('[data-legal]')) a.addEventListener('click', (e) => { e.preventDefault(); openLegal((a as HTMLElement).dataset.legal as 'terms' | 'privacy'); });
  (wrap.querySelector('[data-cancel]') as HTMLElement).addEventListener('click', () => { wrap.remove(); onCancel(); });
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(wrap);
  setTimeout(() => (initialName ? pw : name).focus(), 30);
}
