// Pages web publiques exigées par les boutiques : politique de confidentialité, conditions d'utilisation,
// suppression de compte sans l'application (Google Play). Générées depuis les mêmes textes que le jeu.
import { LEGAL, PRIVACY, TERMS, type LegalSection } from '../src/legal/texts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(LEGAL.appName)}</title>
<style>
:root{--bg:#0b0a0d;--card:#1a1418;--text:#f6f0e3;--muted:#cbbfa8;--gold:#d4af5a;--danger:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 60px}h1{color:var(--gold);font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 6px}
p{margin:6px 0;color:var(--text)}.muted{color:var(--muted);font-size:.9rem}nav a{color:var(--gold);margin-right:14px}
form{background:var(--card);padding:18px;border-radius:14px;margin-top:18px}label{display:block;margin:10px 0 4px;color:var(--muted)}
input{width:100%;padding:12px;border-radius:10px;border:1px solid #2c5884;background:#041a31;color:var(--text);font-size:16px}
button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:12px;background:var(--danger);color:#fff;font-weight:700;font-size:16px}
#msg{margin-top:12px;font-weight:600}
</style></head><body><main><nav><a href="/privacy">Confidentialité</a><a href="/terms">Conditions</a><a href="/delete-account">Supprimer mon compte</a></nav>${body}</main></body></html>`;
}

function sections(list: LegalSection[]): string {
  return list.map((s) => `<h2 id="${esc(s.title.toLowerCase().replace(/[^a-z]+/g, '-'))}">${esc(s.title)}</h2>${s.body.map((b) => `<p>${esc(b)}</p>`).join('')}`).join('');
}

export const privacyPage = () => page('Politique de confidentialité', `<h1>Politique de confidentialité</h1><p class="muted">${esc(LEGAL.appName)} · ${esc(LEGAL.publisher)} · mise à jour le ${esc(LEGAL.updated)}</p>${sections(PRIVACY)}`);
export const termsPage = () => page('Conditions d’utilisation', `<h1>Conditions d’utilisation</h1><p class="muted">${esc(LEGAL.appName)} · ${esc(LEGAL.publisher)} · mise à jour le ${esc(LEGAL.updated)}</p>${sections(TERMS)}`);
export const deletePage = () => page('Supprimer mon compte', `<h1>Supprimer mon compte ${esc(LEGAL.appName)}</h1>
<p>La suppression est <strong>immédiate et définitive</strong> : compte, partie en ligne (KSCoins, records, apparence, cabine), blocages et sessions sont effacés. Ta partie hors ligne, enregistrée sur ton téléphone, n’est pas concernée.</p>
<p class="muted">Tu peux aussi le faire dans le jeu (Paramètres → Mon compte) ou écrire à ${esc(LEGAL.contactEmail)} si tu as oublié ton mot de passe.</p>
<form id="f"><label for="n">Pseudo</label><input id="n" autocomplete="username" required maxlength="16">
<label for="p">Mot de passe</label><input id="p" type="password" autocomplete="current-password" required maxlength="64">
<button type="submit">Supprimer définitivement mon compte</button><div id="msg" role="status"></div></form>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  if (!confirm('Supprimer définitivement ce compte ?')) return;
  msg.textContent = '…';
  try {
    const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('n').value, password: document.getElementById('p').value }) });
    const j = await r.json(); msg.textContent = j.msg; msg.style.color = j.ok ? '#7dffb2' : '#ff9b9b';
  } catch { msg.textContent = 'Serveur injoignable.'; }
});
</script>`);
