// Captures pour les fiches des boutiques, prises dans le vrai jeu (Chromium, rendu identique au téléphone)
// aux tailles exigées : iPhone 6,9" (2868×1320), iPad 13" (2752×2064), téléphone Google Play (1920×1080),
// + bannière Google Play 1024×500. Sans transparence (exigence des boutiques).
// Usage : node scripts/build.mjs --single && node scripts/store-shots.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const html = readFileSync('dist-single/kingsea.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/?debug=1&night=1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  { dir: 'ios-6.9', w: 956, h: 440, dpr: 3 },     // 2868 × 1320
  { dir: 'ipad-13', w: 1376, h: 1032, dpr: 2 },   // 2752 × 2064
  { dir: 'play-phone', w: 960, h: 540, dpr: 2 },  // 1920 × 1080
];

const LOOK = { skin: '#e0a77e', hair: '#3b2516', hairStyle: 'long', outfit: 'robe', color: '#1fc7c1', accent: '#e5b54a', hat: 'capitaine', glasses: true };

const browser = await chromium.launch();
for (const t of TARGETS) {
  const out = `store/screenshots/${t.dir}`;
  mkdirSync(out, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: t.dpr, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.addInitScript(() => { try { localStorage.setItem('kingsea.ageOk', '1'); } catch {} });
  const page = await ctx.newPage();
  const ev = (e) => page.evaluate(e);
  const snap = async (name) => {
    const buf = await page.screenshot();
    await sharp(buf).flatten({ background: '#0b0a0d' }).removeAlpha().png().toFile(`${out}/${name}.png`);
  };
  const waitWorld = () => page.waitForFunction(() => window.__ks?.scene && window.__ksApp.game.current === window.__ks.scene && !window.__ksApp.game.transitioning, null, { timeout: 10000 });
  await page.goto(url);
  await page.waitForFunction(() => window.__ksMenu && !window.__ksApp.game.transitioning, null, { timeout: 10000 });
  await ev(`(() => { const s = window.__ksApp.services; s.data.name = 'Capitaine Léa'; s.data.appearance = Object.assign(s.data.appearance, ${JSON.stringify(LOOK)}); s.data.flags['profile.done'] = true; s.save.saveNow(); window.__ksMenu.layout(); })()`);
  await sleep(800);
  await snap('01-menu');
  await ev(`window.__ksMenu.layer.buttons.find((b) => b.id === 'play').onTap()`);
  await waitWorld(); await sleep(1500);
  const place = async (floor, x, y, name, wait = 1800) => {
    await ev(`window.__ks.scene.loadFloor('${floor}', true, 'elevator', { x: ${x}, y: ${y} })`);
    await ev('window.__ksApp.game.input.lastActivity = performance.now() + 1e9');
    await sleep(wait);
    await ev('window.__ks.scene.hud.levelUp.clear()'); await sleep(300);
    await snap(name);
  };
  await place('hub', 16, 9, '02-hall');
  await place('casino', 17, 9, '03-casino');
  await place('rooftop', 27, 13.6, '04-rooftop');
  await place('arcade', 12, 11, '05-arcade');
  // Mini-jeu : la table de poker, une main distribuée par la croupière
  await ev(`(() => { const s = window.__ks.scene; s.loadFloor('casino', true); const it = s.interactions.items.find((q) => q.handler === 'poker'); s.runInteraction(it); })()`);
  await page.waitForFunction(() => window.__ksGame && window.__ksApp.game.current === window.__ksGame && !window.__ksApp.game.transitioning, null, { timeout: 8000 });
  await sleep(800);
  await ev(`window.__ksGame.game.dealBtn.onTap()`);
  await sleep(2500); await snap('06-poker');
  await ev('window.__ksGame.quitBtn.onTap()'); await waitWorld().catch(() => {});
  await ctx.close();
  console.log(`✔ ${out}`);
}
await browser.close(); server.close();

// Bannière Google Play (1024×500) : capture du rooftop assombrie + médaillon + nom du jeu
mkdirSync('store/graphics', { recursive: true });
const bg = await sharp('store/screenshots/play-phone/04-rooftop.png').resize(1024, 500, { fit: 'cover' }).modulate({ brightness: 0.55 }).blur(1.2).toBuffer();
const icon = await sharp('assets/icon/icon-512.png').resize(300, 300).toBuffer();
const mask = Buffer.from('<svg width="300" height="300"><circle cx="150" cy="150" r="150"/></svg>');
const round = await sharp(icon).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
const text = Buffer.from(`<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efdcae"/><stop offset="1" stop-color="#d4af5a"/></linearGradient></defs>
  <text x="400" y="235" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="104" fill="url(#g)" stroke="#0b0a0d" stroke-width="4" paint-order="stroke">KingSea</text>
  <text x="404" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#f6f0e3">La croisière sociale de luxe</text>
  <text x="404" y="345" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#cbbfa8">Casino simulé · Salon VIP · Amis en ligne</text>
</svg>`);
await sharp(bg).composite([{ input: round, left: 64, top: 100 }, { input: text, left: 0, top: 0 }]).flatten({ background: '#0b0a0d' }).removeAlpha().png().toFile('store/graphics/play-feature-1024x500.png');
await sharp('assets/icon-only.png').resize(512, 512).png().toFile('store/graphics/play-icon-512.png');
console.log('✔ store/graphics');
