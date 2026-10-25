// Réglages des projets natifs KingSea, à lancer APRÈS `npx cap add android` / `npx cap add ios`
// (et à relancer à chaque nouvelle version) : `npm run native:setup`.
// - Android : permissions (Internet seulement), trafic non chiffré interdit, numéros de version tirés de
//   package.json, signature de publication lue dans android/key.properties (jamais dans le dépôt).
// - iOS : nom affiché, versions, plein écran, barre d'état masquée, déclaration de chiffrement (exemptée),
//   orientations, manifeste de confidentialité PrivacyInfo.xcprivacy.
// Chaque modification est idempotente (relancer ne duplique rien). Les fonctions sont testées dans
// tests/native-setup.test.ts sur des extraits des modèles Capacitor.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_NAME = 'KingSea';

/** 0.8.0 → 800 ; 1.2.3 → 10203 (toujours croissant tant que mineur et correctif < 100). */
export function versionCode(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) throw new Error(`version invalide : ${version}`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (min > 99 || pat > 99) throw new Error('mineur et correctif doivent rester < 100');
  return maj * 10000 + min * 100 + pat;
}

// ---------------------------------------------------------------- Android
export function patchManifest(xml) {
  let out = xml;
  // Seule permission : Internet (jeu en ligne). Toute autre permission ajoutée par un module est retirée.
  out = out.replace(/\s*<uses-permission\b(?![^>]*android\.permission\.INTERNET)[^>]*\/>/g, '');
  if (!/android\.permission\.INTERNET/.test(out)) out = out.replace(/(<manifest\b[^>]*>)/, '$1\n    <uses-permission android:name="android.permission.INTERNET" />');
  // Aucun trafic en clair (HTTPS/WSS uniquement)
  if (!/usesCleartextTraffic/.test(out)) out = out.replace(/<application\b/, '<application\n        android:usesCleartextTraffic="false"');
  // Rotation libre (le jeu gère paysage et portrait), en respectant le verrouillage de rotation du téléphone
  out = out.replace(/(<activity\b[^>]*?)\s+android:screenOrientation="[^"]*"/, '$1');
  out = out.replace(/(<activity\b)/, '$1\n            android:screenOrientation="fullUser"');
  return out;
}

export function patchAppGradle(gradle, version) {
  let out = gradle;
  out = out.replace(/versionCode\s+\d+/, `versionCode ${versionCode(version)}`);
  out = out.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  if (!/KINGSEA_SIGNING/.test(out)) {
    const signing = `
    // KINGSEA_SIGNING : clé de publication lue dans android/key.properties (à ne jamais publier)
    def keystorePropertiesFile = rootProject.file("key.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) { keystoreProperties.load(new FileInputStream(keystorePropertiesFile)) }
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }`;
    out = out.replace(/(android\s*\{)/, `$1${signing}`);
    out = out.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : null');
  }
  return out;
}

export const KEY_PROPERTIES_EXAMPLE = `# Copier en android/key.properties (NE PAS publier ce fichier ni la clé).
# Créer la clé une seule fois :
#   keytool -genkeypair -v -keystore kingsea-release.jks -alias kingsea -keyalg RSA -keysize 4096 -validity 10000
# Avec Google Play App Signing, cette clé sert de « clé d'importation » ; garder une sauvegarde hors ligne.
storeFile=../kingsea-release.jks
storePassword=CHANGER
keyAlias=kingsea
keyPassword=CHANGER
`;

// ---------------------------------------------------------------- iOS
function plistSet(xml, key, valueXml) {
  const re = new RegExp(`(<key>${key}</key>\\s*)(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>)`);
  if (re.test(xml)) return xml.replace(re, `$1${valueXml}`);
  return xml.replace(/(<dict>)/, `$1\n\t<key>${key}</key>\n\t${valueXml}`);
}

export function patchInfoPlist(xml) {
  let out = xml;
  out = plistSet(out, 'CFBundleDisplayName', `<string>${APP_NAME}</string>`);
  out = plistSet(out, 'ITSAppUsesNonExemptEncryption', '<false/>'); // HTTPS standard uniquement
  out = plistSet(out, 'UIStatusBarHidden', '<true/>');
  out = plistSet(out, 'UIViewControllerBasedStatusBarAppearance', '<false/>');
  out = plistSet(out, 'UIRequiresFullScreen', '<true/>');
  const all = '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
  out = plistSet(out, 'UISupportedInterfaceOrientations', all);
  out = plistSet(out, 'UISupportedInterfaceOrientations~ipad', all.replace('</array>', '\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t</array>'));
  return out;
}

export function patchPbxproj(pbx, version) {
  return pbx
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode(version)};`);
}

/** Manifeste de confidentialité Apple : aucun pistage ; préférences (UserDefaults) pour la sauvegarde. */
export const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>NSPrivacyTracking</key>
\t<false/>
\t<key>NSPrivacyTrackingDomains</key>
\t<array/>
\t<key>NSPrivacyCollectedDataTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataTypeUserID</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<true/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<false/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
\t\t</dict>
\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataTypeGameplayContent</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<true/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<false/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
\t\t</dict>
\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataTypeOtherUserContent</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<true/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<false/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
\t\t</dict>
\t</array>
\t<key>NSPrivacyAccessedAPITypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array><string>CA92.1</string></array>
\t\t</dict>
\t</array>
</dict>
</plist>
`;

// ---------------------------------------------------------------- exécution
function apply(file, fn, label) {
  if (!existsSync(file)) { console.log(`– ${label} : ${file} absent (plateforme pas encore ajoutée ?)`); return false; }
  const before = readFileSync(file, 'utf8'), after = fn(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`✔ ${label}${after === before ? ' (déjà à jour)' : ''}`);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  console.log(`KingSea ${version} (code ${versionCode(version)})`);
  const a = 'android/app';
  if (apply(join(a, 'src/main/AndroidManifest.xml'), patchManifest, 'Android : permissions, HTTPS seul, rotation')) {
    apply(join(a, 'build.gradle'), (g) => patchAppGradle(g, version), 'Android : versions + signature de publication');
    if (!existsSync('android/key.properties.example')) writeFileSync('android/key.properties.example', KEY_PROPERTIES_EXAMPLE);
    console.log(existsSync('android/key.properties') ? '✔ Android : key.properties présent' : '⚠ Android : créer android/key.properties (voir key.properties.example) avant un build signé');
  }
  const i = 'ios/App/App';
  if (apply(join(i, 'Info.plist'), patchInfoPlist, 'iOS : nom, plein écran, chiffrement, orientations')) {
    apply('ios/App/App.xcodeproj/project.pbxproj', (p) => patchPbxproj(p, version), 'iOS : versions');
    writeFileSync(join(i, 'PrivacyInfo.xcprivacy'), PRIVACY_MANIFEST);
    console.log('✔ iOS : PrivacyInfo.xcprivacy écrit — à ajouter une fois au projet dans Xcode (glisser dans « App », cible App cochée)');
  }
}
