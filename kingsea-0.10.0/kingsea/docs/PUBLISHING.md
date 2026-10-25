# Publication sur Google Play et l'App Store — état et marche à suivre

> **KingSea n'est pas publié et n'est pas encore prêt à être envoyé aux boutiques.** Les projets natifs n'ont jamais été générés ni compilés, aucun test sur vrai téléphone n'a été fait, et l'éditeur, le contact et le serveur ne sont pas renseignés. `npm run release:check` le confirme (code de sortie 1 tant qu'un point bloquant reste ouvert).

## État par exigence de la phase 8
| Exigence | État | Où |
|---|---|---|
| Création des builds | **Préparé, non exécuté** : scripts de build, synchronisation Capacitor et réglages natifs automatiques. Le SDK Android et Xcode ne sont pas disponibles ici. | `npm run build:release`, `scripts/native-setup.mjs` |
| Icône et nom | **Fait** : « KingSea », icône 1024 sans transparence, icône adaptative Android, tailles natives générées par `@capacitor/assets` | `assets/`, `npm run icons`, `npm run assets:native` |
| Écran de démarrage | **Fait** : clair/sombre 2732×2732 ; masqué par le jeu à sa première image (pas d'écran noir) | `assets/splash*.png`, `src/platform/native.ts` |
| Permissions | **Fait (vérifié sur modèles)** : Internet uniquement ; trafic non chiffré interdit ; vibrations par le module natif (aucune permission) | `patchManifest` + `tests/native-setup.test.ts` |
| Tests sur appareils réels | **Non fait** | `docs/TESTING.md` |
| Signatures | **Préparé** : signature Android lue dans `android/key.properties` (exclu du dépôt) ; iOS : signature automatique Xcode | `android/key.properties.example`, ci-dessous |
| Exigences des boutiques | **Fait côté jeu et serveur** (voir tableau suivant) ; **reste** les formulaires à remplir dans les consoles | ci-dessous |
| Éléments graphiques et description | **Fait** : 6 captures × 3 formats, bannière Play, textes FR/EN aux limites des boutiques | `store/` |

## Exigences des boutiques couvertes par le code
| Exigence | Boutique | Réalisation |
|---|---|---|
| Suppression du compte **dans l'application** | Apple 5.1.1(v), Google | Paramètres → Compte et infos → Supprimer mon compte (mot de passe), effacement immédiat ; testé |
| Suppression **sans l'application** (lien web) | Google | page `/delete-account` du serveur ; testé |
| Politique de confidentialité accessible dans l'app et en ligne | les deux | écran « Confidentialité » + `/privacy` |
| Contenu généré par les joueurs (chat) : filtre, signalement, blocage, **sanctions**, conditions acceptées, contact | Apple 1.2 | filtre + anti-spam, signaler / bloquer, sourdine et bannissement (`/api/admin/sanction`), case à cocher à l'inscription, e-mail de contact dans l'app |
| Jeux de hasard **simulés** : aucune valeur réelle, rien à acheter | Apple 5.3, Google « Jeux d'argent simulés » | KSCoins non achetables, sans échange ; mention dans le jeu, les conditions et la fiche |
| Âge | les deux | avertissement 18+ au premier lancement ; case « 18 ans ou plus » à l'inscription |
| Manifeste de confidentialité | Apple | `PrivacyInfo.xcprivacy` (aucun pistage ; identifiant, contenu de jeu et messages liés au compte, pour le fonctionnement) |
| Chiffrement | Apple (export) | `ITSAppUsesNonExemptEncryption = false` (HTTPS standard uniquement) |
| API cible | Google : **36 depuis le 31/08/2026** | Capacitor 8 (cible 36) ; vérifié par `release:check` |
| SDK de build | Apple : **Xcode 26 depuis le 28/04/2026** | Capacitor 8 exige Xcode 26 |

## Classification et formulaires (à remplir dans les consoles)
**App Store Connect → Classification par âge** : « Jeux de hasard simulés : fréquent » → **18+**. Australie : R18+ dès le moindre jeu simulé. Corée : un numéro de classification (RCN) est exigé pour ce contenu → exclure la Corée tant qu'il n'est pas obtenu. Autres réponses : contenu généré par les utilisateurs/chat = oui ; accès web libre = non ; achats = non.

**App Store Connect → Confidentialité de l'app** (« Données collectées », liées à l'identité, sans pistage, pour le fonctionnement de l'app) : identifiant utilisateur (pseudo/ID de compte), contenu de jeu, autres contenus de l'utilisateur (messages joints aux signalements). Pas de données de contact, de localisation, d'identifiants publicitaires ni de diagnostics.

**Google Play → Questionnaire de classification (IARC)** : jeux d'argent simulés = oui ; interactions entre utilisateurs = oui ; partage de position = non ; achats numériques = non. La classification est attribuée par IARC à la fin du questionnaire.

**Google Play → Sécurité des données** : données collectées = identifiants (ID utilisateur), activité dans l'app (progression du jeu), messages (signalements) ; chiffrées en transit ; suppression possible (lien : `https://<serveur>/delete-account`) ; aucune donnée partagée ; aucune publicité.

**Public cible** (Google) : 18 ans et plus. **Publicités** : non.

## Marche à suivre (dans l'ordre)
1. **Renseigner** éditeur, e-mail et site dans `src/legal/texts.ts`, et l'identifiant d'application dans `capacitor.config.json` (`appId`, définitif).
2. **Héberger le serveur** en HTTPS (voir `SERVER.md`), avec `KS_ADMIN_TOKEN` secret et une sauvegarde quotidienne de la base. Vérifier `https://<serveur>/privacy` et `/delete-account`.
3. **Installer** (Node 22+) : `npm install`.
4. **Construire** : `KS_SERVER_URL=https://<serveur> npm run build`, puis `npx cap add android` et, sur Mac, `npx cap add ios`.
5. **Réglages natifs** : `npm run native:setup` (relancer à chaque version) ; dans Xcode, ajouter une fois `App/PrivacyInfo.xcprivacy` au projet.
6. **Icônes et écrans natifs** : `npm run assets:native`.
7. **Clé Android** : `keytool -genkeypair -v -keystore kingsea-release.jks -alias kingsea -keyalg RSA -keysize 4096 -validity 10000`, puis `android/key.properties` d'après l'exemple. **Sauvegarder la clé hors ligne** (avec Google Play App Signing, c'est la clé d'importation).
8. **Tester sur vrais appareils** avec `docs/TESTING.md` (rapport de diagnostic à joindre).
9. `KS_SERVER_URL=https://<serveur> npm run release:check` → plus aucun point bloquant.
10. **Android** : Android Studio → Build → Generate Signed App Bundle (.aab) → Play Console : test interne, puis fermé, puis production. **iOS** : Xcode → Product → Archive → Distribute → App Store Connect → TestFlight, puis soumission.
11. **Fiches** : textes de `store/listing.json`, captures de `store/screenshots/`, bannière et icône de `store/graphics/`, liens confidentialité / suppression ; notes pour la revue Apple : créer un compte de démonstration et donner pseudo + mot de passe.

Comptes nécessaires : Apple Developer Program (99 $/an), Google Play Console (25 $, une fois). Les nouveaux comptes Google personnels doivent faire un test fermé avec des testeurs pendant une période avant de pouvoir publier en production : à prévoir dans le calendrier.

## Après publication
Chaque mise à jour : augmenter `version` dans `package.json` (le numéro de build en est déduit), `npm run build:release`, `release:check`, nouveaux tests sur appareils.
