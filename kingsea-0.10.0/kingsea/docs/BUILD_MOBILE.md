# Lancer, tester et générer les applications mobiles

## Prérequis
- Node.js 22+ (exigé par Capacitor 8)
- Android : Android Studio Otter (2025.2.1) ou plus récent, SDK 36, JDK 21
- iOS : un Mac avec **Xcode 26+** (exigé par l'App Store depuis le 28/04/2026), compte Apple Developer pour installer sur un iPhone réel

## Installation
```bash
cd kingsea
npm install
```

## Jouer pendant le développement
```bash
npm run dev
```
Ouvre `http://localhost:5173` sur l'ordinateur. Le terminal affiche aussi une adresse `http://192.168.x.x:5173` : ouvre-la **sur ton téléphone connecté au même Wi-Fi** pour tester les vraies commandes tactiles. Le code se recompile à chaque sauvegarde (recharger la page).

Tester le tactile sur ordinateur : Chrome → Outils de développement → icône téléphone (Device Toolbar), choisir un iPhone/Pixel en paysage.

## Tests
```bash
npm test                                   # tests unitaires + intégration du serveur
npm run typecheck
npm run build:single && npm run test:e2e   # scénario tactile complet hors ligne (captures dans e2e-shots/)
npm run build && npm run test:e2e:online   # deux téléphones émulés sur un vrai serveur
```

## Multijoueur
Voir [SERVER.md](SERVER.md). L'application doit joindre le serveur en **HTTPS/WSS** (les boutiques et iOS refusent le trafic non chiffré par défaut) ; en développement, l'adresse `http://<ip>:8787` fonctionne dans le navigateur du téléphone.

## Android
```bash
KS_SERVER_URL=https://votre-serveur npm run build   # adresse du serveur intégrée à l'application
npx cap add android            # une seule fois : crée le projet natif android/
npm run native:setup           # permissions, HTTPS seul, versions, signature (à relancer à chaque version)
npm run assets:native          # icônes et écrans de démarrage natifs depuis assets/
npx cap open android
```
Dans Android Studio : ▶ Run sur un émulateur ou un téléphone (mode développeur + débogage USB). Le jeu tourne en paysage comme en portrait (rotation libre, verrou de rotation du téléphone respecté). Seule permission : Internet.

Publication : créer la clé (voir `android/key.properties.example`), puis Build → Generate Signed App Bundle (.aab).

## iOS (sur Mac)
```bash
npx cap add ios
npm run native:setup           # Info.plist, versions, PrivacyInfo.xcprivacy
npm run assets:native
npx cap open ios
```
Dans Xcode : ajouter une fois `App/PrivacyInfo.xcprivacy` au projet (glisser dans le groupe App, cible App cochée) ; Signing & Capabilities → choisir ton équipe ; Run sur l'iPhone branché. Publication : Product → Archive → Distribute App.

## Modules natifs utilisés (facultatifs pour le jeu web)
`@capacitor/preferences` (sauvegarde doublée), `@capacitor/haptics` (vibrations, iPhone compris), `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/app` (bouton retour). Le code les détecte à l'exécution (`src/platform/native.ts`) ; `npm run test:e2e:native` vérifie ce pont avec des modules simulés.

## Icône et écran de démarrage
`npm run icons` régénère `assets/icon-only.png` (1024, sans transparence), `icon-foreground.png` / `icon-background.png` (icône adaptative Android), `splash.png` / `splash-dark.png` (2732×2732) ; `npm run assets:native` produit toutes les tailles natives.

## Publication
Voir [PUBLISHING.md](PUBLISHING.md) et `npm run release:check`.
