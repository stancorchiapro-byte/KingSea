// Icônes et écrans de démarrage de l'application, dessinés par le code du jeu (art/brand.ts) dans Chromium
// puis enregistrés en PNG : assets/icon-only.png (1024, opaque : l'App Store refuse la transparence),
// icon-foreground.png / icon-background.png (icône adaptative Android), splash.png / splash-dark.png (2732),
// et assets/icon/icon-{1024,512,192,48}.png. Toutes les tailles natives : `npm run assets:native`.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const bundle = await build({ entryPoints: ['scripts/icon-src/render.ts'], bundle: true, write: false, format: 'iife', define: { __KS_VERSION__: '"icons"', __KS_SERVER__: '""' } });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });
const images = await page.evaluate(() => window.__render());
await browser.close();
mkdirSync('assets/icon', { recursive: true });
const png = (name) => Buffer.from(images[name].split(',')[1], 'base64');
await sharp(png('icon-only')).flatten({ background: '#0b0a0d' }).removeAlpha().png().toFile('assets/icon-only.png');
await sharp(png('icon-foreground')).png().toFile('assets/icon-foreground.png');
await sharp(png('icon-background')).flatten({ background: '#0b0a0d' }).removeAlpha().png().toFile('assets/icon-background.png');
for (const n of ['splash', 'splash-dark']) await sharp(png(n)).flatten({ background: '#0b0a0d' }).removeAlpha().png().toFile(`assets/${n}.png`);
for (const size of [1024, 512, 192, 48]) await sharp(png('icon-only')).resize(size, size).flatten({ background: '#0b0a0d' }).removeAlpha().png().toFile(`assets/icon/icon-${size}.png`);
console.log('✔ assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png, icon/icon-*.png');
