// Réglages des projets natifs, vérifiés sur des extraits des modèles générés par Capacitor
// (pas sur un vrai projet Android Studio / Xcode : à confirmer après `npx cap add`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error module JavaScript sans déclarations
import { patchAppGradle, patchInfoPlist, patchManifest, patchPbxproj, versionCode, PRIVACY_MANIFEST } from '../scripts/native-setup.mjs';

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">
        </activity>
    </application>
    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
</manifest>`;

const GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "com.kingsea.game"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.kingsea.game"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}`;

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>App</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>
</dict>
</plist>`;

test('numéro de version des boutiques : croissant et dérivé de package.json', () => {
  assert.equal(versionCode('0.8.0'), 800);
  assert.equal(versionCode('1.2.3'), 10203);
  assert.ok(versionCode('1.0.0') > versionCode('0.99.99'));
  assert.throws(() => versionCode('abc'));
});

test('Android : Internet seulement, HTTPS seul, rotation libre ; idempotent', () => {
  const out = patchManifest(MANIFEST);
  assert.match(out, /android\.permission\.INTERNET/);
  assert.doesNotMatch(out, /ACCESS_FINE_LOCATION|VIBRATE/, 'permissions inutiles retirées (la vibration native passe par le module Haptics)');
  assert.match(out, /usesCleartextTraffic="false"/);
  assert.equal((out.match(/screenOrientation/g) ?? []).length, 1);
  assert.equal(patchManifest(out), out, 'relancer ne change rien');
});

test('Android : versions et signature de publication lue dans key.properties ; idempotent', () => {
  const out = patchAppGradle(GRADLE, '0.8.0');
  assert.match(out, /versionCode 800/);
  assert.match(out, /versionName "0\.8\.0"/);
  assert.match(out, /rootProject\.file\("key\.properties"\)/);
  assert.match(out, /release \{\n\s+signingConfig keystorePropertiesFile\.exists\(\) \? signingConfigs\.release : null/);
  assert.equal(patchAppGradle(out, '0.8.0'), out);
  assert.match(patchAppGradle(out, '0.9.1'), /versionCode 901/);
});

test('iOS : nom, plein écran, barre d’état, chiffrement exempté, orientations ; versions ; manifeste', () => {
  const out = patchInfoPlist(PLIST);
  assert.match(out, /<key>CFBundleDisplayName<\/key>\s*<string>KingSea<\/string>/);
  assert.match(out, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  assert.match(out, /<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/);
  assert.match(out, /UIInterfaceOrientationLandscapeLeft/);
  assert.match(out, /UISupportedInterfaceOrientations~ipad/);
  assert.equal(patchInfoPlist(out), out);
  const pbx = patchPbxproj('MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\nMARKETING_VERSION = 1.0;', '0.8.0');
  assert.equal(pbx, 'MARKETING_VERSION = 0.8.0;\nCURRENT_PROJECT_VERSION = 800;\nMARKETING_VERSION = 0.8.0;');
  assert.match(PRIVACY_MANIFEST, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(PRIVACY_MANIFEST, /CA92\.1/);
});
