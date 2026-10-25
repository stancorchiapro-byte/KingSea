// Gestion du compte en ligne (exigences des boutiques) : changer le mot de passe, supprimer le compte.
// Vrais champs HTML (clavier du téléphone, gestionnaire de mots de passe). Rien n'est enregistré par le jeu.
import { LEGAL } from '../legal/texts';

type Submit = (values: Record<string, string>) => Promise<{ ok: boolean; msg: string }>;

function form(id: string, title: string, intro: string, fields: Array<{ name: string; label: string; auto: string }>, action: string, danger: boolean, onSubmit: Submit, onDone: (ok: boolean) => void): void {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.remove();
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.style.cssText = 'position:fixed;inset:0;z-index:15;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:max(12px,env(safe-area-inset-top)) 12px 12px;background:rgba(6,5,8,0.8);font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
  const field = 'box-sizing:border-box;width:100%;font-size:17px;padding:11px 13px;border-radius:12px;border:1.5px solid #8a6a2b;background:#0e0b10;color:#f6fbff;outline:none;margin:4px 0 10px';
  wrap.innerHTML = `
    <form style="margin-top:4vh;width:min(440px,100%);background:#1a151c;border:1.5px solid ${danger ? '#ff6b6b' : 'rgba(212,175,90,0.6)'};border-radius:16px;padding:16px">
      <h2 style="margin:0 0 8px;color:${danger ? '#ff9b9b' : '#efdcae'};font-size:19px">${title}</h2>
      <p style="color:#d6e4f2;font-size:14px;line-height:1.45;margin:0 0 12px">${intro}</p>
      ${fields.map((f) => `<label style="color:#cbbfa8;font-size:13px;font-weight:700">${f.label}</label><input name="${f.name}" type="password" maxlength="64" autocomplete="${f.auto}" style="${field}">`).join('')}
      <p data-msg role="status" style="font-size:13px;min-height:18px;margin:4px 2px;color:#ff8a8a"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" data-cancel style="min-height:46px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6fbff;font-size:16px;font-weight:700">Annuler</button>
        <button type="submit" style="min-height:46px;padding:0 20px;border-radius:12px;border:0;background:${danger ? '#d64545' : 'linear-gradient(#efdcae,#e5b54a)'};color:${danger ? '#fff' : '#0e0b10'};font-size:16px;font-weight:800">${action}</button>
      </div>
    </form>`;
  const f = wrap.querySelector('form')!, msg = wrap.querySelector('[data-msg]') as HTMLElement, btn = wrap.querySelector('button[type=submit]') as HTMLButtonElement;
  let finished = false;
  const close = (ok: boolean) => { if (finished) return; finished = true; wrap.remove(); onDone(ok); };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values: Record<string, string> = {};
    for (const x of fields) values[x.name] = (wrap.querySelector(`input[name=${x.name}]`) as HTMLInputElement).value;
    if (Object.values(values).some((v) => !v)) { msg.textContent = 'Remplis tous les champs.'; return; }
    btn.disabled = true; msg.style.color = '#cbbfa8'; msg.textContent = 'Envoi…';
    const r = await onSubmit(values);
    btn.disabled = false; msg.style.color = r.ok ? '#7dffb2' : '#ff8a8a'; msg.textContent = r.msg;
    if (r.ok) setTimeout(() => close(true), 1600);
  });
  (wrap.querySelector('[data-cancel]') as HTMLElement).addEventListener('click', () => close(false));
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(wrap);
  setTimeout(() => (wrap.querySelector('input') as HTMLInputElement | null)?.focus(), 30);
}

export function openPasswordForm(change: (old: string, next: string) => Promise<{ ok: boolean; msg: string }>, onDone: (ok: boolean) => void): void {
  form('ks-password', 'Changer mon mot de passe', 'Les autres appareils connectés à ce compte devront se reconnecter.',
    [{ name: 'old', label: 'Mot de passe actuel', auto: 'current-password' }, { name: 'next', label: 'Nouveau mot de passe (6 caractères minimum)', auto: 'new-password' }, { name: 'again', label: 'Nouveau mot de passe, encore', auto: 'new-password' }],
    'Modifier', false,
    async (v) => {
      if (v.next !== v.again) return { ok: false, msg: 'Les deux nouveaux mots de passe sont différents.' };
      if (v.next.length < 6) return { ok: false, msg: 'Nouveau mot de passe : 6 caractères minimum.' };
      return change(v.old, v.next);
    }, onDone);
}

export function openDeleteForm(name: string, del: (password: string) => Promise<{ ok: boolean; msg: string }>, onDone: (ok: boolean) => void): void {
  form('ks-delete', 'Supprimer mon compte', `Le compte <b>${name.replace(/[<>&]/g, '')}</b> sera supprimé <b>immédiatement et définitivement</b> : KSCoins, records, apparence, cabine, blocages. Ta partie hors ligne sur ce téléphone n’est pas concernée. Mot de passe oublié ? Écris à ${LEGAL.contactEmail}.`,
    [{ name: 'password', label: 'Mot de passe pour confirmer', auto: 'current-password' }],
    'Supprimer définitivement', true, (v) => del(v.password), onDone);
}
