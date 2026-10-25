// Saisie de texte (pseudo) : un vrai champ HTML par-dessus le canevas, pour profiter du clavier virtuel
// du téléphone (correction, accents, collage). Fermé par « OK », Entrée, ou « Annuler ».

/** Nettoie un pseudo : lettres (accents compris), chiffres, espace, - _ . ' ; 2 à 16 caractères. */
export function cleanName(raw: string): string | null {
  const s = raw.normalize('NFC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s.length >= 2 ? s : null;
}

export function promptText(title: string, initial: string, onDone: (value: string | null) => void): void {
  if (typeof document === 'undefined') { onDone(null); return; }
  const wrap = document.createElement('div');
  wrap.id = 'ks-prompt';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10;display:flex;align-items:flex-start;justify-content:center;padding-top:max(16px,env(safe-area-inset-top));background:rgba(6,5,8,0.7);font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
  wrap.innerHTML = `
    <form style="margin-top:8vh;width:min(420px,calc(100vw - 32px));background:#1a151c;border:1.5px solid rgba(239,220,174,0.4);border-radius:16px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,0.5)">
      <label style="display:block;color:#f6fbff;font-weight:800;font-size:17px;margin-bottom:10px"></label>
      <input name="v" maxlength="16" autocomplete="nickname" enterkeyhint="done"
        style="box-sizing:border-box;width:100%;font-size:18px;padding:12px 14px;border-radius:12px;border:1.5px solid #8a6a2b;background:#0e0b10;color:#f6fbff;outline:none">
      <p data-err style="color:#ff8a8a;font-size:13px;min-height:18px;margin:6px 2px"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" data-cancel style="min-height:46px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6fbff;font-size:16px;font-weight:700">Annuler</button>
        <button type="submit" style="min-height:46px;padding:0 22px;border-radius:12px;border:0;background:linear-gradient(#efdcae,#e5b54a);color:#0e0b10;font-size:16px;font-weight:800">OK</button>
      </div>
    </form>`;
  const form = wrap.querySelector('form')!, input = wrap.querySelector('input')!, err = wrap.querySelector('[data-err]') as HTMLElement;
  (wrap.querySelector('label') as HTMLElement).textContent = title;
  input.value = initial;
  const finish = (v: string | null) => { wrap.remove(); onDone(v); };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = cleanName(input.value);
    if (!v) { err.textContent = '2 à 16 caractères : lettres, chiffres, espace, - _ . \''; return; }
    finish(v);
  });
  (wrap.querySelector('[data-cancel]') as HTMLElement).addEventListener('click', () => finish(null));
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(wrap);
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

/** Saisie de l'adresse du serveur (http(s)://hôte:port). */
export function promptServer(initial: string, onDone: (value: string | null) => void): void {
  if (typeof document === 'undefined') { onDone(null); return; }
  const wrap = document.createElement('div');
  wrap.id = 'ks-prompt';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10;display:flex;align-items:flex-start;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 12px;background:rgba(6,5,8,0.7);font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
  wrap.innerHTML = `
    <form style="margin-top:8vh;width:min(440px,100%);background:#1a151c;border:1.5px solid rgba(239,220,174,0.4);border-radius:16px;padding:16px">
      <label style="display:block;color:#f6fbff;font-weight:800;font-size:17px;margin-bottom:6px">Adresse du serveur KingSea</label>
      <p style="color:#cbbfa8;font-size:12px;margin:0 0 8px">Exemple : http://192.168.1.20:8787 (serveur lancé avec « npm run server »)</p>
      <input name="v" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false" style="box-sizing:border-box;width:100%;font-size:17px;padding:11px 13px;border-radius:12px;border:1.5px solid #8a6a2b;background:#0e0b10;color:#f6fbff;outline:none">
      <p data-err style="color:#ff8a8a;font-size:13px;min-height:18px;margin:6px 2px"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" data-cancel style="min-height:46px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6fbff;font-size:16px;font-weight:700">Annuler</button>
        <button type="submit" style="min-height:46px;padding:0 22px;border-radius:12px;border:0;background:linear-gradient(#efdcae,#e5b54a);color:#0e0b10;font-size:16px;font-weight:800">OK</button>
      </div>
    </form>`;
  const form = wrap.querySelector('form')!, input = wrap.querySelector('input')!, err = wrap.querySelector('[data-err]') as HTMLElement;
  input.value = initial;
  const finish = (v: string | null) => { wrap.remove(); onDone(v); };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let v = input.value.trim();
    if (v && !/^https?:\/\//i.test(v)) v = `http://${v}`;
    try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw new Error(); finish(`${u.protocol}//${u.host}`); }
    catch { err.textContent = 'Adresse invalide'; }
  });
  (wrap.querySelector('[data-cancel]') as HTMLElement).addEventListener('click', () => finish(null));
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(wrap);
  setTimeout(() => input.focus(), 30);
}

/** Saisie d'un montant entier (clavier numérique du téléphone), borné entre min et max. */
export function promptNumber(title: string, initial: number, min: number, max: number, onDone: (value: number | null) => void): void {
  if (typeof document === 'undefined') { onDone(null); return; }
  document.getElementById('ks-prompt')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'ks-prompt';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10;display:flex;align-items:flex-start;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 12px;background:rgba(6,5,8,0.7);font-family:"Avenir Next","Segoe UI",Roboto,system-ui,sans-serif';
  wrap.innerHTML = `
    <form style="margin-top:8vh;width:min(380px,100%);background:#1a151c;border:1.5px solid rgba(239,220,174,0.45);border-radius:16px;padding:16px">
      <label style="display:block;color:#f6f0e3;font-weight:800;font-size:17px;margin-bottom:6px"></label>
      <p data-range style="color:#cbbfa8;font-size:12px;margin:0 0 8px"></p>
      <input name="v" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" enterkeyhint="done"
        style="box-sizing:border-box;width:100%;font-size:22px;font-weight:800;padding:11px 13px;border-radius:12px;border:1.5px solid #8a6a2b;background:#0e0b10;color:#efdcae;outline:none;text-align:center">
      <p data-err style="color:#ff8a8a;font-size:13px;min-height:18px;margin:6px 2px"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" data-cancel style="min-height:46px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#f6f0e3;font-size:16px;font-weight:700">Annuler</button>
        <button type="submit" style="min-height:46px;padding:0 22px;border-radius:12px;border:0;background:linear-gradient(#efdcae,#d4af5a);color:#0e0b10;font-size:16px;font-weight:800">Valider</button>
      </div>
    </form>`;
  const form = wrap.querySelector('form')!, input = wrap.querySelector('input')!, err = wrap.querySelector('[data-err]') as HTMLElement;
  (wrap.querySelector('label') as HTMLElement).textContent = title;
  (wrap.querySelector('[data-range]') as HTMLElement).textContent = `Entre ${min} et ${max} KSCoins`;
  input.value = String(initial);
  const finish = (v: number | null) => { wrap.remove(); onDone(v); };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.replace(/\s/g, '');
    if (!/^\d+$/.test(raw)) { err.textContent = 'Nombre entier uniquement'; return; }
    const v = Number(raw);
    if (v < min || v > max) { err.textContent = `Entre ${min} et ${max}`; return; }
    finish(v);
  });
  (wrap.querySelector('[data-cancel]') as HTMLElement).addEventListener('click', () => finish(null));
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(wrap);
  setTimeout(() => { input.focus(); input.select(); }, 30);
}
