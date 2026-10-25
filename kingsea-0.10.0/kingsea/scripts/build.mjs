// Build KingSea avec esbuild.
//   node scripts/build.mjs            -> dist/ (index.html + main.js) pour Capacitor
//   node scripts/build.mjs --single   -> dist-single/kingsea.html (un seul fichier, test navigateur)
//   node scripts/build.mjs --serve    -> serveur de dev http://localhost:5173 (accessible depuis le téléphone sur le même Wi-Fi)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const args = new Set(process.argv.slice(2));
const single = args.has('--single');
const serve = args.has('--serve');
const template = readFileSync('public/index.html', 'utf8');

const common = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15', 'chrome90'],
  // KS_SERVER_URL : adresse HTTPS du serveur intégrée à l'application native (sinon : réglable dans le jeu)
  define: { __KS_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version), __KS_SERVER__: JSON.stringify(process.env.KS_SERVER_URL ?? '') },
  logLevel: 'info',
};

if (serve) {
  mkdirSync('dev', { recursive: true });
  writeFileSync('dev/index.html', template.replace('<!--KS_SCRIPT-->', '<script src="main.js"></script>'));
  const ctx = await esbuild.context({ ...common, outfile: 'dev/main.js', sourcemap: true });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dev', host: '0.0.0.0', port: 5173 });
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\nKingSea dev : http://localhost:${port}`);
  for (const ip of ips) console.log(`Sur le téléphone (même Wi-Fi) : http://${ip}:${port}`);
} else if (single) {
  const out = await esbuild.build({ ...common, write: false, minify: true, outfile: 'out.js' });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  mkdirSync('dist-single', { recursive: true });
  // Remplacement par fonction : le code peut contenir « $' » ou « $& », motifs spéciaux de String.replace
  writeFileSync('dist-single/kingsea.html', template.replace('<!--KS_SCRIPT-->', () => `<script>${js}</script>`));
  console.log('-> dist-single/kingsea.html');
} else {
  rmSync('dist', { recursive: true, force: true });
  mkdirSync('dist', { recursive: true });
  await esbuild.build({ ...common, outfile: 'dist/main.js', minify: true, sourcemap: true });
  writeFileSync('dist/index.html', template.replace('<!--KS_SCRIPT-->', '<script src="main.js"></script>'));
  console.log('-> dist/ prêt pour `npx cap sync`');
}
