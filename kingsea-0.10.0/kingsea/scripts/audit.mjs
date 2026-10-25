// Audit multi-écrans et appareils lents (phase 7), dans Chromium mobile émulé (pas de vrais téléphones).
// Pour chaque profil d'écran (petits/grands téléphones, tablette, paysage/portrait, encoche simulée) :
// menu, chaque étage, chaque mini-jeu, modales principales → vérifie que chaque bouton visible est dans
// la zone sûre, assez grand (≥ 44 px CSS), sans chevauchement, et qu'aucune erreur JS n'apparaît.
// Puis mesure la fluidité par étage avec le processeur ralenti (×4, ×6), avec et sans effets réduits.
// Usage : node scripts/build.mjs --single && node scripts/audit.mjs [--quick]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const quick = process.argv.includes('--quick');
const html = readFileSync('dist-single/kingsea.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/?debug=1`;
mkdirSync('audit-shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Encoches simulées (valeurs typiques d'env(safe-area-inset-*) en CSS px)
const NOTCH_L = { top: 0, right: 47, bottom: 21, left: 47 };
const NOTCH_P = { top: 47, right: 0, bottom: 34, left: 0 };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const PROFILES = [
  { id: 'iphone-se-l', w: 667, h: 375, dpr: 2, safe: NONE },
  { id: 'iphone-14-l', w: 844, h: 390, dpr: 3, safe: NOTCH_L },
  { id: 'pixel-7-l', w: 915, h: 412, dpr: 2.625, safe: { top: 0, right: 0, bottom: 0, left: 32 } },
  { id: 'iphone-pro-max-l', w: 932, h: 430, dpr: 3, safe: NOTCH_L },
  { id: 'small-android-l', w: 640, h: 360, dpr: 2, safe: NONE },
  { id: 'tablet-l', w: 1180, h: 820, dpr: 2, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: 'iphone-14-p', w: 390, h: 844, dpr: 3, safe: NOTCH_P },
  { id: 'iphone-se-p', w: 375, h: 667, dpr: 2, safe: NONE },
];
const perfOnly = process.argv.includes('--perf');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const skipPerf = process.argv.includes('--no-perf');
const profiles = perfOnly ? [] : only ? PROFILES.filter((p) => only.includes(p.id)) : quick ? PROFILES.filter((p) => ['iphone-se-l', 'iphone-14-l', 'iphone-14-p'].includes(p.id)) : PROFILES;

const issues = [];
const summary = [];
const issue = (prof, where, msg) => { issues.push({ prof, where, msg }); };

// Collecte des boutons visibles via les gestionnaires tactiles actifs de la scène (ce que le joueur peut toucher)
const COLLECT = `(() => {
  const g = window.__ksApp.game, v = g.viewport;
  const out = [];
  for (const h of g.input.handlers ?? []) {
    if (!h || !Array.isArray(h.buttons)) continue;
    const layer = out.length;
    for (const b of h.buttons) if (b.visible !== false && b.w > 0 && b.h > 0) out.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, enabled: b.enabled !== false, layer: h.modal ? 'modal' : 'l' + layer, label: b.label || '' });
  }
  return { buttons: out, vw: v.width, vh: v.height, safe: v.safe, };
})()`;

function checkButtons(prof, where, snap) {
  const { buttons, vw, vh, safe } = snap;
  const tol = 1.5;
  // Seule la couche la plus haute est touchable quand une modale est ouverte
  const modal = buttons.some((b) => b.layer === 'modal');
  const live = modal ? buttons.filter((b) => b.layer === 'modal') : buttons;
  for (const b of live) {
    if (b.x < safe.left - tol || b.y < safe.top - tol || b.x + b.w > vw - safe.right + tol || b.y + b.h > vh - safe.bottom + tol)
      issue(prof.id, where, `bouton « ${b.id} » hors zone sûre (${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}×${b.h.toFixed(0)})`);
    if (Math.min(b.w, b.h) < 40) issue(prof.id, where, `bouton « ${b.id} » trop petit (${b.w.toFixed(0)}×${b.h.toFixed(0)})`);
  }
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 2 && iy > 2 && ix * iy > 0.08 * Math.min(a.w * a.h, b.w * b.h)) issue(prof.id, where, `boutons « ${a.id} » et « ${b.id} » se chevauchent`);
  }
  return live.length;
}

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });

for (const prof of profiles) {
  const ctx = await browser.newContext({ viewport: { width: prof.w, height: prof.h }, deviceScaleFactor: prof.dpr, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('kingsea.ageOk', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ev = (e) => page.evaluate(e);
  const shot = async (name) => { if (!quick) await page.screenshot({ path: `audit-shots/${prof.id}-${name}.png` }); };
  let screens = 0, buttonsChecked = 0;
  const audit = async (where) => { const snap = await ev(COLLECT); buttonsChecked += checkButtons(prof, where, snap); screens++; };
  const SCENES = { MenuScene: 'window.__ksMenu', WorldScene: 'window.__ks?.scene', MiniGameScene: 'window.__ksGame' };
  const waitScene = async (name, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(`(() => { const g = window.__ksApp?.game; return !!g && !!g.current && g.current === ${SCENES[name]} && !g.transitioning; })()`)) return true; await sleep(100); } return false; };
  const sceneIs = (name) => ev(`window.__ksApp.game.current === ${SCENES[name]}`);

  try {
    await page.goto(url);
    // Encoche simulée : la sonde CSS reçoit les marges qu'iOS/Android donneraient
    await page.addStyleTag({ content: `#safe-probe{padding:${prof.safe.top}px ${prof.safe.right}px ${prof.safe.bottom}px ${prof.safe.left}px !important}` });
    await page.waitForFunction(() => window.__ksApp);
    await ev('window.__ksApp.game.viewport.update()');
    if (!(await waitScene('MenuScene', 8000))) issue(prof.id, 'démarrage', 'le menu n’apparaît pas');
    await sleep(300);
    await audit('menu'); await shot('menu');
    // Paramètres depuis le menu
    await ev(`window.__ksMenu.layer.buttons.find((b) => b.id === 'settings').onTap()`); await sleep(300);
    await audit('menu/paramètres'); await shot('parametres');
    await ev(`(() => { const m = window.__ksMenu; const st = m.modal ?? null; const h = window.__ksApp.game.input.handlers; const lay = h.find((x) => x.modal); lay.buttons.find((b) => b.id === 'Diagnostic').onTap(); })()`); await sleep(1200);
    await audit('menu/diagnostic'); await shot('diagnostic');
    await ev(`window.__ksApp.game.input.handlers.find((x) => x.modal).buttons.find((b) => b.id === 'close').onTap()`); await sleep(300);
    // Infos / compte (textes légaux) et avertissement d'âge
    await ev(`window.__ksMenu.layer.buttons.find((b) => b.id === 'settings').onTap()`); await sleep(300);
    await ev(`window.__ksApp.game.input.handlers.find((x) => x.modal).buttons.find((b) => b.id === 'more').onTap()`); await sleep(300);
    await audit('menu/infos'); await shot('infos');
    await ev(`window.__ksApp.game.input.handlers.find((x) => x.modal).buttons.find((b) => b.id === 'close').onTap()`); await sleep(300);
    await ev(`(() => { localStorage.removeItem('kingsea.ageOk'); window.__ksMenu.layer.buttons.find((b) => b.id === 'play').onTap(); })()`); await sleep(400);
    await audit('avertissement d’âge'); await shot('age');
    await ev(`(() => { localStorage.setItem('kingsea.ageOk', '1'); window.__ksMenu.modal?.close(); })()`); await sleep(300);
    // Profil prêt, puis jeu hors ligne
    await ev(`(() => { const s = window.__ksApp.services; s.data.name = 'Audit'; s.data.flags['profile.done'] = true; })()`);
    await ev(`window.__ksMenu.layer.buttons.find((b) => b.id === 'play').onTap()`);
    if (!(await waitScene('WorldScene'))) throw new Error('monde non chargé');
    await sleep(500);
    for (const f of ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine']) {
      await ev(`window.__ks.scene.loadFloor('${f}', true)`); await sleep(500);
      await audit(`étage ${f}`); await shot(`etage-${f}`);
    }
    // Modales du monde
    await ev(`window.__ks.scene.loadFloor('hub', true)`); await sleep(300);
    await ev(`window.__ks.scene.openElevator()`); await sleep(400); await audit('ascenseur'); await shot('ascenseur');
    await ev(`window.__ks.scene.modal?.close()`); await sleep(300);
    const hud = await ev(`Object.keys(window.__ks.scene.hud).filter((k) => /Btn$/.test(k))`);
    if (hud.includes('settingsBtn')) { await ev(`window.__ks.scene.hud.settingsBtn.onTap()`); await sleep(400); await audit('monde/paramètres'); await ev(`window.__ks.scene.modal?.close()`); await sleep(300); }
    // Chaque mini-jeu (une fois par type), lancé comme si le joueur interagissait
    const gameFloors = { casino: true, arcade: true, rooftop: true, hub: true, cabins: true };
    const seen = new Set();
    for (const f of Object.keys(gameFloors)) {
      await ev(`window.__ks.scene.loadFloor('${f}', true)`); await sleep(400);
      const items = await ev(`window.__ks.scene.interactions.items.map((it) => ({ h: it.handler, key: it.key, label: it.label }))`);
      for (const it of items) {
        if (['stairs-up', 'stairs-down', 'elevator', 'cabin-door', 'cabin-exit', 'slide', 'bed', 'sit', 'compass', 'engine-panel', 'cabin-lamp'].includes(it.h)) continue; // déplacements et bascules : hors sujet ici
        const key = it.h === 'slots' ? `slots-${it.label}` : it.h;
        if (seen.has(key) || seen.has(it.h) && it.h !== 'slots') continue;
        const before = (await sceneIs('WorldScene')) ? 'WorldScene' : '?';
        const found = await ev(`(() => { const s = window.__ks.scene; const x = s.interactions.items.find((q) => q.key === ${JSON.stringify(it.key)}); if (!x) return false; s.runInteraction(x); return true; })()`);
        if (!found) continue;
        await sleep(200);
        if (await waitScene('MiniGameScene', 2500)) {
          seen.add(key);
          await sleep(500);
          await audit(`jeu ${key}`); await shot(`jeu-${key}`);
          await ev(`window.__ksGame.quitBtn.onTap()`);
          if (!(await waitScene('WorldScene'))) { issue(prof.id, `jeu ${key}`, 'impossible de revenir au monde'); break; }
          await sleep(300);
        } else {
          // Pas un mini-jeu : fermer une éventuelle modale
          if (before === 'WorldScene' && (await ev('!!window.__ks.scene.modal'))) {
            if (!seen.has('modal:' + it.h)) { seen.add('modal:' + it.h); await audit(`modale ${it.h}`); }
            await ev('window.__ks.scene.modal?.close()'); await sleep(250);
          }
          await waitScene('WorldScene', 2500);
        }
      }
    }
    summary.push({ prof: prof.id, screens, buttons: buttonsChecked, games: [...seen].filter((k) => !k.startsWith('modal:')).length, gameList: [...seen].filter((k) => !k.startsWith('modal:')), errors: errors.length });
    for (const e of errors) issue(prof.id, 'console', e.slice(0, 200));
  } catch (e) {
    issue(prof.id, 'audit', `échec : ${String(e).slice(0, 200)}`);
    summary.push({ prof: prof.id, screens, buttons: buttonsChecked, games: 0, errors: errors.length });
  }
  await ctx.close();
}

// Performance avec processeur ralenti (Chromium logiciel : ordres de grandeur seulement)
const perf = [];
if (!skipPerf) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('kingsea.ageOk', '1'); } catch {} });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const ev = (e) => page.evaluate(e);
  await page.goto(url);
  await page.waitForFunction(() => window.__ksApp && window.__ksMenu);
  await sleep(2500);
  await ev(`(() => { const s = window.__ksApp.services; s.data.name = 'Perf'; s.data.flags['profile.done'] = true; s.data.settings.autoQuality = false; s.applySettings(); window.__ksMenu.layer.buttons.find((b) => b.id === 'play').onTap(); })()`);
  await page.waitForFunction(() => window.__ks?.scene?.floor, null, { timeout: 8000 });
  await sleep(1500);
  const rates = quick ? [1, 6] : [1, 4, 6];
  for (const rate of rates) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const mode of ['normal', 'lowFx', 'dpr1.5']) {
      const low = mode === 'lowFx';
      await ev(`(() => { const s = window.__ksApp.services; s.data.settings.lowFx = ${low}; s.applySettings(); if (${mode === 'dpr1.5'}) s.game.viewport.setMaxDpr(1.5); })()`);
      for (const f of quick ? ['hub', 'casino'] : ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine']) {
        await ev(`window.__ks.scene.loadFloor('${f}', true)`);
        await sleep(1200);
        // Le joueur bouge (sinon l'affichage passerait à 30 im/s après 20 s d'inactivité)
        await ev(`(() => { window.__ksApp.game.input.lastActivity = performance.now(); window.__ksApp.diag.resetFrames(); })()`);
        await sleep(3000);
        const fs = await page.evaluate(() => {
          // Diagnostics n'est pas exposé globalement : lecture via le rapport du panneau
          return window.__ksApp.diag ? window.__ksApp.diag.frameStats() : null;
        });
        perf.push({ rate, mode, floor: f, ...(fs ?? {}) });
      }
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // Endurance : 4 tours complets (tous les étages, un mini-jeu ouvert/fermé sur chacun) → la mémoire doit se stabiliser
  const cycles = [];
  for (let k = 0; k < (quick ? 2 : 4); k++) {
    for (const f of ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine']) {
      await ev(`window.__ks.scene.loadFloor('${f}', true)`); await sleep(250);
      const opened = await ev(`(() => { const s = window.__ks.scene; const games = ['roulette','blackjack','plinko','crash','bowling','basket','pinball','wheel','slots','mole']; const it = s.interactions.items.find((q) => games.includes(q.handler)); if (!it) return false; s.runInteraction(it); return true; })()`);
      if (opened) {
        await page.waitForFunction(() => window.__ksGame && window.__ksApp.game.current === window.__ksGame && !window.__ksApp.game.transitioning, null, { timeout: 5000 }).catch(() => {});
        await sleep(400);
        await ev(`window.__ksGame?.quitBtn.onTap()`);
        await page.waitForFunction(() => window.__ks && window.__ksApp.game.current === window.__ks.scene && !window.__ksApp.game.transitioning, null, { timeout: 5000 }).catch(() => {});
        await sleep(200);
      }
    }
    await page.evaluate(() => { try { window.gc?.(); } catch {} });
    cycles.push(await page.evaluate(() => window.__ksApp.diag.memory()));
  }
  perf.push({ memory: cycles.at(-1), cycles });
  await ctx.close();
}

await browser.close();
server.close();

const report = { date: new Date().toISOString(), quick, summary, issues, perf };
writeFileSync('audit-report.json', JSON.stringify(report, null, 2));
console.log('\n=== Écrans audités ===');
for (const s of summary) console.log(`${s.prof.padEnd(18)} écrans ${String(s.screens).padStart(3)} · boutons ${String(s.buttons).padStart(4)} · mini-jeux ${s.games} · erreurs ${s.errors}${process.argv.includes('--list') ? `\n   ${(s.gameList ?? []).join(', ')}` : ''}`);
console.log(`\n=== Problèmes (${issues.length}) ===`);
const grouped = new Map();
for (const i of issues) { const k = `${i.where} — ${i.msg}`; grouped.set(k, [...(grouped.get(k) ?? []), i.prof]); }
for (const [k, ps] of grouped) console.log(`• ${k}  [${ps.join(', ')}]`);
console.log('\n=== Fluidité (processeur ralenti, Chromium sans GPU : seul le temps de calcul du jeu est significatif) ===');
for (const p of perf) if (p.floor) console.log(`×${p.rate} ${p.mode.padEnd(7)} ${p.floor.padEnd(8)} ${p.fps?.toFixed(0) ?? '?'} im/s · calcul moy ${p.workAvg?.toFixed(1)} ms · p95 ${p.workP95?.toFixed(1)} ms`);
const m = perf.find((p) => p.memory)?.memory;
const cyc = perf.find((p) => p.cycles)?.cycles ?? [];
cyc.forEach((c, k) => console.log(`Tour ${k + 1} : textures ${c.texturesMB.toFixed(1)} Mo (${c.textures}) · étages ${c.layersMB.toFixed(1)} Mo · tas JS ${c.heapMB?.toFixed(1) ?? 'n/d'} Mo`));
if (cyc.length >= 2) {
  const a = cyc[1], z = cyc.at(-1);
  const stable = z.textures <= a.textures + 2 && (z.heapMB ?? 0) <= (a.heapMB ?? 0) * 1.3 + 2;
  console.log(stable ? '✔ Mémoire stable d’un tour à l’autre (pas de fuite détectée)' : '✘ La mémoire continue de grandir : fuite probable');
}
if (m) console.log(`Mémoire : textures ${m.texturesMB.toFixed(1)} Mo (${m.textures}) · étages ${m.layersMB.toFixed(1)} Mo · tas JS ${m.heapMB?.toFixed(1) ?? 'n/d'} Mo`);
