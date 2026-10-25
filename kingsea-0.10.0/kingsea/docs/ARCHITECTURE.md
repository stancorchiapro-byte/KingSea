# KingSea — Solution technique et architecture

## Étape A — Solution technique

| Sujet | Choix |
|---|---|
| Moteur | Moteur 2D léger écrit pour KingSea (TypeScript + Canvas 2D), sans dépendance d'exécution |
| Langage | TypeScript strict |
| Build | esbuild (bundle ~345 Ko minifié, sans dépendance d'exécution) |
| Plateformes | Android et iOS via **Capacitor** (vraies applications installables, WebView native), + navigateur pour les tests |
| Type de jeu | 2D, vue de dessus en 3/4, exploration libre, orientation **paysage** |
| Multijoueur | Serveur autoritaire Node.js maison (WebSocket `ws` + SQLite `node:sqlite`) : Colyseus n'était pas installable dans l'environnement, et le protocole JSON reste simple à migrer |
| Sauvegarde | Hors ligne : `SaveService` versionné + migration (localStorage, `@capacitor/preferences` à brancher). En ligne : base SQLite du serveur |
| Commandes | Joystick flottant (moitié gauche), bouton Interagir (bas droite), toucher direct des objets, clavier facultatif |

### Pourquoi pas Godot / Unity / Phaser ?

- **Godot** est un excellent choix 2D natif. Mais KingSea est un jeu *social* avec beaucoup d'interfaces (casino, menus, chat), un futur serveur web et 20+ mini-jeux : une base web/TypeScript partage le langage avec le serveur, se teste instantanément sur téléphone via une URL, et se met à jour plus facilement.
- **Unity** apporte un écosystème lourd (taille de build, temps de compilation) pour un jeu 2D à base de menus.
- **Phaser** aurait été un bon intermédiaire. Il n'a pas pu être installé dans l'environnement de développement de cette session (registre npm inaccessible). Le moteur maison couvre les besoins du prototype (boucle, scènes, entrées tactiles, collisions AABB, rendu trié en profondeur, éclairage) en ~1 000 lignes. Si les mini-jeux physiques (billard, flipper) l'exigent, on pourra intégrer une petite lib physique (ex. Matter.js / Planck) sans changer le reste.

### Choix de perspective et d'orientation

- **Vue 3/4 de dessus** : les murs nord montrent leur façade (baies vitrées, ascenseurs, bars), les objets leur face avant ; tout est trié en profondeur par la ligne de base. C'est lisible sur petit écran et naturel à contrôler au pouce.
- **Paysage** : les ponts du navire sont larges ; les deux pouces tiennent le joystick et les actions sans masquer le personnage. Le portrait reste jouable (interface adaptative, conseil affiché). Les mini-jeux pourront imposer le portrait (Plinko, Crash) via Capacitor ScreenOrientation.

### Performance mobile

- Sols et murs pré-rendus une fois par étage dans un seul canevas (1 `drawImage` par image).
- Accessoires mis en cache ; seules les parties animées sont redessinées.
- Éclairage calculé dans un canevas en demi-résolution.
- Densité de pixels plafonnée à 2,5 ; pause complète de la boucle en arrière-plan.
- Option « Effets réduits » (reflets, vapeur, lueurs, particules).
- Audio entièrement synthétisé (Web Audio) : aucun fichier à télécharger.

## Étape B — Arborescence

```
kingsea/
├─ package.json, tsconfig.json, capacitor.config.json
├─ public/index.html            # page hôte (viewport-fit=cover, zones de sécurité)
├─ scripts/
│  ├─ build.mjs                 # build / build single-file / serveur de dev
│  ├─ e2e.mjs                   # test tactile de bout en bout (Chromium mobile)
│  └─ make-icons.mjs            # icônes PNG depuis le SVG
├─ assets/icon/                 # icône KS provisoire (SVG + PNG)
├─ src/
│  ├─ main.ts                   # démarrage, branchement du bouton retour Android
│  ├─ engine/                   # Game (boucle, scènes, fondus, cycle de vie), Input (multi-touch),
│  │                            # Viewport (DPR, encoche), Scene, math
│  ├─ art/                      # palette, personnages, accessoires, sols/murs, logo, océan
│  ├─ world/                    # types, TileMap (collisions), floors/ (6 niveaux)
│  ├─ entities/Player.ts        # déplacement analogique, animation 4 directions
│  ├─ interaction/              # InteractionSystem centralisé
│  ├─ systems/                  # PlayerData, SaveService, Wallet, Audio, Services
│  ├─ ui/                       # UIKit, Hud, VirtualJoystick, Modal, Elevator/Bar/Settings/Emote, Toasts
│  ├─ scenes/                   # BootScene, MenuScene, WorldScene
│  └─ data/                     # contenus (carte du bar…)
├─ tests/                       # tests unitaires (node:test)
└─ docs/                        # cette doc, build mobile, état, feuille de route
```

### Dépendances entre modules

```
main → engine/Game, systems/Services, scenes/*
scenes/WorldScene → world/*, entities, interaction, ui/*, art/*, systems/*
ui/* → engine (Input, Viewport), art/palette, systems/Services
systems/* → (aucune dépendance au rendu)
world/*, systems/Wallet|PlayerData|SaveService, ui/joystickMath, interaction → purs (testés sous Node)
```

### Étages (phase 2)
| Niveau | Fichier | Particularités |
|---|---|---|
| 4 | `floors/rooftop.ts` | extérieur (garde-corps `G`), piscine `p`, piste de danse `f` animée |
| 3 | `floors/cabins.ts` | 20 portes, attribution par `systems/Cabins.ts` |
| 2 | `floors/arcade.ts` | sol néon, éclairage coloré |
| 1 | `floors/casino.ts` | moquette `r`, allées en marbre, éclairage feutré |
| 0 | `floors/hub.ts` | hub, réception, bar |
| -1 | `floors/engineRoom.ts` | éclairage sombre, secret |

Escaliers : `makeStairs()` (types.ts) ouvre le mur latéral ; à gauche on descend, à droite on monte. L'arrivée se fait devant l'escalier opposé de l'étage voisin.

### Mini-jeux (phase 3)
```
src/games/
├─ logic/          # logique pure, testée sous Node : rng, cards, blackjack, roulette, slots, wheel, bowling, physics, rewards
├─ MiniGame.ts     # contrat commun (init, layout, update, render, handlers, canQuit, règles)
├─ widgets.ts      # cartes, jetons, étiquettes
└─ *Game.ts        # une vue tactile par jeu
src/scenes/MiniGameScene.ts  # hôte : en-tête, règles, quitter, retour au navire
```
### Mini-jeux (phase 4)
```
src/games/
├─ casino.ts       # cycle d'une manche payante : beginRound (mise + sauvegarde) → updateRound → endRound (gain, même tx)
├─ arcade.ts       # fin de partie des jeux gratuits (record, récompense plafonnée)
├─ logic/          # + slotMachines, poker, baccarat, craps, keno, races, plinko, crash, pending (reprise),
│                  #   basket, football, skeeball, mole, pinball (physique segments + batteurs)
└─ VideoPoker, Baccarat, Craps, Keno, Races, Plinko, Crash, Basket, Football, SkeeBall, Mole, PinballGame.ts
src/art/props3.ts  # bornes et machines de la phase 4
```
Jeu payant : appeler `beginRound` avant l'animation avec tout ce qu'il faut pour régler la manche, puis ajouter le cas dans `logic/pending.ts` (`resolvePending`) et un test de reprise.

Ajouter un jeu : écrire sa logique dans `logic/` avec ses tests, une vue `XxxGame` qui implémente `MiniGame`, puis un `interact: { id: 'xxx' }` sur l'accessoire et un `case 'xxx'` dans `WorldScene.runInteraction` (`this.openGame(new XxxGame())`).

### Identité visuelle et audio (phase 5)
```
src/art/logo.ts         # logo KS (tracés vectoriels KS_PATHS, réutilisés par scripts/make-icons.mjs)
src/art/characters.ts   # apparences (Look), poses, animations générées à la demande + cache par apparence
src/art/scenery.ts      # décor du menu (paquebot au crépuscule)
src/art/ambientFx.ts    # effets d'ambiance par étage, teinte horaire du rooftop
src/entities/Passengers.ts  # passagers d'ambiance (logique pure, testée)
src/scenes/ProfileScene.ts  # embarquement / garde-robe
src/systems/Music.ts    # moteur de musique : thèmes composés en données, séquenceur à anticipation
src/systems/Audio.ts    # bus effets / ambiance / musique, bruitages
src/ui/TextPrompt.ts    # saisie du pseudo via un vrai champ (clavier du téléphone)
```
Transitions : `game.goto(scène, vitesse, 'wave' | 'iris' | 'doors' | 'fade')`.

### Multijoueur (phase 6)
```
src/authority/      # règles des KSCoins (casino, commissaire de bord) — exécutées hors ligne ET par le serveur
src/net/Backend.ts  # LocalBackend (hors ligne) / interface commune
src/net/Net.ts      # Connection (WebSocket, reconnexion, requêtes) + RemoteBackend
src/net/Presence.ts # autres joueurs, interpolation, chat, emotes (côté téléphone)
src/net/protocol.ts # messages client ↔ serveur (partagés)
src/scenes/ConnectScene.ts  # écran de connexion
server/index.ts     # HTTP (jeu, santé, signalements) + WebSocket /ws
server/game.ts      # comptes, salons par étage, validation, diffusion, chat, cabines
server/store.ts     # SQLite (comptes, jetons, profils, cabines, blocages, signalements)
server/moderation.ts, server/accounts.ts, server/movement.ts
```
Flux d'une mise en ligne : écran de jeu → `s.ask('casino', 'roulette', 'play', {bets})` → `RemoteBackend` → message `req` → serveur → `authority.handle()` sur le profil du joueur → sauvegarde SQLite → réponse `res` (résultat + solde) → animation.

### Ressources et licences
Aucune image, police ni fichier audio externe : tous les graphismes sont dessinés par le code (Canvas 2D / SVG) et toute la musique et les sons sont synthétisés en direct (Web Audio). Ils sont originaux, créés pour KingSea ; il n'y a donc aucune licence tierce à déclarer pour les ressources. La police d'affichage est celle du système du téléphone.

### Ajouter un étage
1. Créer `src/world/floors/<id>.ts` avec `GridBuilder`, `spawn`, `props`, éventuellement `lighting`.
2. L'enregistrer dans `floors/index.ts` avec `available: true`.
3. Ajouter les nouveaux types d'accessoires dans `art/props.ts` (`drawStatic` + `drawPropOverlay` si animé).
4. Les tests `floors.test.ts` vérifient automatiquement carte fermée, apparition libre, ascenseur, interactions atteignables.

### Ajouter une interaction
Déclarer `interact: { id, label }` sur l'accessoire, puis ajouter le `case id` dans `WorldScene.runInteraction`. Le ciblage, le bouton Interagir, le toucher direct et l'étiquette sont automatiques.

## Performance et diagnostic (phase 7)
- `src/systems/Diagnostics.ts` : anneau des 240 dernières images (calcul / intervalle), erreurs (`window.onerror`, promesses rejetées, boucle de jeu), mémoire (`Textures.stats()`, `layerStats()`), latence (ping/pong). Exposé dans Paramètres → Diagnostic.
- `Game` : cadence maximale (`maxFps`), ralenti au repos (`idleAfterMs`, désactivé par `Scene.idleThrottle = false`), surveillance de qualité (`autoLow` → `Services.applySettings()` : densité 1,5 et effets réduits). `Services.lowFx` est l'unique source des « effets réduits » effectifs.
- `Viewport.setMaxDpr()` : la densité de pixels est le premier levier (remplissage des pixels = coût principal sur les appareils modestes).
- Réseau : protocole 2, instantanés `{ t: 'snap', d: [n, x, y, pose, …] }` (`packPose`/`unpackPose`, numéros courts `PublicPlayer.n`).
- Outils : `scripts/audit.mjs` (écrans, boutons, erreurs, fluidité, endurance), `scripts/bench-net.ts`, `tests/fuzz.test.ts`.

## Publication (phase 8)
- `src/legal/texts.ts` : textes légaux uniques (jeu + serveur) ; `src/ui/LegalView.ts` (lecture), `src/ui/AccountForms.ts` (mot de passe, suppression), avertissement d'âge dans `MenuScene`.
- `src/platform/native.ts` : pont Capacitor optionnel (stockage, vibrations, écran de démarrage, barre d'état, bouton retour).
- `server/pages.ts` : `/privacy`, `/terms`, `/delete-account` ; `server/index.ts` : routes d'administration.
- `scripts/native-setup.mjs`, `scripts/make-icons.mjs`, `scripts/store-shots.mjs`, `scripts/release-check.mjs` ; `store/` (fiches, captures, bannière).
