// Contrôle avant publication : liste ce qui est prêt, ce qui manque, et refuse (code 1) tant qu'un point
// bloquant reste ouvert. Ne remplace pas les tests sur vrais téléphones ni la revue des boutiques.
// Usage : KS_SERVER_URL=https://... npm run release:check
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const rows = [];
const add = (level, label, ok, hint = '') => rows.push({ level, label, ok, hint });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const legal = readFileSync('src/legal/texts.ts', 'utf8');
const cap = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));

// Identité et textes
add('bloquant', 'Éditeur, e-mail de contact et site renseignés (src/legal/texts.ts)', !legal.includes('[À RENSEIGNER'), 'remplacer les « [À RENSEIGNER … ] »');
const server = process.env.KS_SERVER_URL ?? '';
add('bloquant', 'Adresse du serveur intégrée au build (KS_SERVER_URL en https://)', /^https:\/\//.test(server), 'KS_SERVER_URL=https://votre-serveur npm run build');
add('bloquant', `Identifiant d'application définitif (${cap.appId})`, cap.appId && !/example|test/.test(cap.appId), 'à choisir une fois pour toutes : il ne pourra plus changer');
add('info', `Version ${pkg.version}`, /^\d+\.\d+\.\d+$/.test(pkg.version));

// Éléments graphiques
const img = async (f, w, h, noAlpha) => {
  if (!existsSync(f)) return false;
  const m = await sharp(f).metadata();
  return m.width === w && m.height === h && (!noAlpha || !m.hasAlpha);
};
add('bloquant', 'Icône 1024×1024 sans transparence (assets/icon-only.png)', await img('assets/icon-only.png', 1024, 1024, true), 'npm run icons');
add('bloquant', 'Icône adaptative Android (avant-plan + fond)', existsSync('assets/icon-foreground.png') && existsSync('assets/icon-background.png'), 'npm run icons');
add('bloquant', 'Écrans de démarrage 2732×2732 (clair et sombre)', (await img('assets/splash.png', 2732, 2732)) && (await img('assets/splash-dark.png', 2732, 2732)), 'npm run icons');
for (const [dir, w, h] of [['ios-6.9', 2868, 1320], ['ipad-13', 2752, 2064], ['play-phone', 1920, 1080]]) {
  const files = ['01-menu', '02-hall', '03-casino', '04-rooftop', '05-arcade', '06-poker'].map((n) => `store/screenshots/${dir}/${n}.png`);
  const ok = (await Promise.all(files.map((f) => img(f, w, h, true)))).every(Boolean);
  add('bloquant', `Captures ${dir} (${w}×${h}, 6, sans transparence)`, ok, 'npm run store:shots');
}
add('bloquant', 'Bannière Google Play 1024×500', await img('store/graphics/play-feature-1024x500.png', 1024, 500, true), 'npm run store:shots');

// Projets natifs et signature
const android = existsSync('android/app/build.gradle'), ios = existsSync('ios/App/App/Info.plist');
add('bloquant', 'Projet Android généré (npx cap add android)', android, 'nécessite les modules Capacitor installés (npm install)');
add('bloquant', 'Projet iOS généré (npx cap add ios, sur Mac)', ios, 'nécessite un Mac avec Xcode 26 ou plus (obligatoire pour l’App Store depuis le 28/04/2026)');
if (android) {
  const g = readFileSync('android/app/build.gradle', 'utf8');
  add('bloquant', 'Android : réglages appliqués (npm run native:setup)', g.includes('KINGSEA_SIGNING'), 'npm run native:setup');
  const vars = existsSync('android/variables.gradle') ? readFileSync('android/variables.gradle', 'utf8') : '';
  const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(vars)?.[1] ?? 0);
  add('bloquant', `Android : API cible ≥ 36 (Google Play, depuis le 31/08/2026) — actuelle : ${target || '?'}`, target >= 36, 'Capacitor 8 (cible 36 par défaut)');
  add('bloquant', 'Android : android/key.properties + clé de publication', existsSync('android/key.properties'), 'voir android/key.properties.example');
}
if (ios) {
  add('bloquant', 'iOS : manifeste de confidentialité présent', existsSync('ios/App/App/PrivacyInfo.xcprivacy'), 'npm run native:setup puis l’ajouter au projet dans Xcode');
}

// Ce qu'aucun script ne peut vérifier ici
add('manuel', 'Tests sur vrais téléphones (docs/TESTING.md) faits et sans défaut bloquant', false, 'à cocher à la main dans docs/PUBLISHING.md');
add('manuel', 'Serveur en production : HTTPS/WSS, sauvegarde de la base, KS_ADMIN_TOKEN secret', false, 'docs/SERVER.md');
add('manuel', 'Comptes développeur Apple (99 $/an) et Google Play (25 $) ouverts', false, '');

const icon = { true: '✔', false: '✘' };
let blocking = 0;
for (const r of rows) {
  if (!r.ok && r.level === 'bloquant') blocking++;
  console.log(`${r.level === 'manuel' ? '☐' : icon[r.ok]} [${r.level}] ${r.label}${!r.ok && r.hint ? ` — ${r.hint}` : ''}`);
}
console.log(`\n${blocking ? `${blocking} point(s) bloquant(s) : pas prêt pour l’envoi aux boutiques.` : 'Aucun point bloquant détecté par le script (restent les vérifications manuelles ci-dessus).'}`);
process.exit(blocking ? 1 : 0);
