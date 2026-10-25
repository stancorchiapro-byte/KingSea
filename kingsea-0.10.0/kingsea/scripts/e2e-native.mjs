// Vérifie le pont natif dans Chromium avec un faux Capacitor (modules simulés, PAS un vrai téléphone) :
// écran de démarrage natif masqué, barre d'état cachée, bouton retour Android branché, vibrations via le module
// natif, sauvegarde doublée dans les préférences natives et restaurée si la WebView a perdu son stockage,
// pas d'adresse de serveur devinée à partir de l'origine locale de l'application.
// Usage : node scripts/build.mjs --single && node scripts/e2e-native.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const html = readFileSync('dist-single/kingsea.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/?debug=1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };

// Faux Capacitor : les préférences natives survivent dans une clé à part (hors « kingsea. »)
const FAKE = () => {
  const P = '__native_prefs__';
  const load = () => JSON.parse(Storage.prototype.getItem.call(localStorage, P) ?? '{}');
  const save = (o) => Storage.prototype.setItem.call(localStorage, P, JSON.stringify(o));
  window.__calls = [];
  const log = (n, a) => { window.__calls.push([n, a ?? null]); return Promise.resolve(); };
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => 'android',
    Plugins: {
      Preferences: {
        get: async ({ key }) => ({ value: load()[key] ?? null }),
        set: async ({ key, value }) => { const o = load(); o[key] = value; save(o); },
        remove: async ({ key }) => { const o = load(); delete o[key]; save(o); },
        keys: async () => ({ keys: Object.keys(load()) }),
      },
      Haptics: { impact: (o) => log('impact', o), vibrate: (o) => log('vibrate', o) },
      SplashScreen: { hide: (o) => log('splash.hide', o) },
      StatusBar: { hide: () => log('status.hide'), setOverlaysWebView: (o) => log('status.overlay', o) },
      App: { addListener: (e, cb) => { if (e === 'backButton') window.__back = cb; log('listen', e); } },
    },
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
await ctx.addInitScript(FAKE);
await ctx.addInitScript(() => { try { localStorage.setItem('kingsea.ageOk', '1'); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const ev = (e) => page.evaluate(e);
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__ksMenu, null, { timeout: 10000 });
  const calls = await ev('window.__calls.map((c) => c[0])');
  check('Écran de démarrage natif masqué, barre d’état cachée, bouton retour branché', calls.includes('splash.hide') && calls.includes('status.hide') && calls.includes('listen'), calls.join(', '));
  // Partie : pseudo + quelques KSCoins, puis sauvegarde
  await ev(`(() => { const s = window.__ksApp.services; s.data.name = 'Natif'; s.data.flags['profile.done'] = true; s.wallet.balance; s.save.saveNow(); })()`);
  await sleep(300);
  const mirrored = await ev(`JSON.parse(Storage.prototype.getItem.call(localStorage, '__native_prefs__'))['kingsea.save.v1'] ?? ''`);
  check('Sauvegarde doublée dans les préférences natives', mirrored.includes('"Natif"'));
  // Vibration via le module natif (réglage « Vibrations » actif par défaut)
  await ev(`window.__ksApp.services.haptic([30, 40, 30])`);
  const hap = await ev(`window.__calls.filter((c) => c[0] === 'impact' || c[0] === 'vibrate')`);
  check('Vibration envoyée au module natif (aussi sur iPhone)', hap.length === 1, JSON.stringify(hap));
  // Bouton retour Android : ferme la modale ouverte
  await ev(`window.__ksMenu.layer.buttons.find((b) => b.id === 'settings').onTap()`); await sleep(200);
  await ev('window.__back()'); await sleep(300);
  check('Bouton retour Android ferme les paramètres', await ev('!window.__ksMenu.modal'));
  // La WebView perd son stockage (iOS sous pression mémoire) : la partie revient des préférences natives
  await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('kingsea.')) Storage.prototype.removeItem.call(localStorage, k); })()`);
  await page.reload();
  await page.waitForFunction(() => window.__ksApp && window.__ksMenu, null, { timeout: 10000 });
  await sleep(500);
  check('Stockage de la WebView effacé → partie restaurée depuis le natif', (await ev('window.__ksApp.services.data.name')) === 'Natif');
  // Adresse du serveur : rien de deviné à partir de l'origine locale (https://localhost en natif)
  await ev(`window.__ksMenu.layer.buttons.find((b) => b.id === 'online').onTap()`);
  await page.waitForFunction(() => window.__ksConnect?.probe?.state && window.__ksConnect.probe.state !== 'checking', null, { timeout: 8000 }).catch(() => {});
  const probe = await ev('JSON.stringify(window.__ksConnect?.probe ?? null)');
  check('Application native sans adresse intégrée : « aucun serveur configuré » (pas d’adresse devinée)', /Aucun serveur/.test(probe), probe);
  check('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('Scénario natif', false, String(e));
}
await browser.close(); server.close();
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} vérifications réussies (modules natifs simulés)`);
process.exit(ok === results.length ? 0 : 1);
