# État du projet — version 0.15 (mise à jour complète, éditeur : Stan)

> **Non publié.** Tout ce qui pouvait être préparé sans appareils, sans SDK natifs et sans comptes développeur l'est ; le reste est listé dans [PUBLISHING.md](PUBLISHING.md).

## Mise à jour complète (version 0.15, éditeur Stan)
- **Gains du casino non crédités : cause trouvée et corrigée.** Aux tables partagées, l'identifiant de transaction
  d'une manche (`table:<table>#<n>:<manche>:<joueur>`) repartait de la manche 1 quand une table était recréée ou que
  le serveur redémarrait. L'historique des transactions étant une fenêtre glissante (400), la mise ancienne en sortait
  avant le gain : la nouvelle mise était acceptée, puis son gain ignoré comme « déjà versé ». Corrigé à la source
  (identifiant unique par instance de table) et par deux gardes de l'autorité (identifiant de manche neuf exigé,
  crédit qui refuse au lieu d'ignorer). Même fenêtre glissante : jetons de bienvenue et cadeau de la réception
  pouvaient être reversés — désormais mémorisés par drapeau. Reproduit par un test qui échouait avant la correction.
- **Blackjack** : cartes A, 2–10, J, Q, K définies une seule fois (rang, libellé, nom, valeur) ; séparation des 13
  paires et de deux cartes valant 10 de rangs différents (règle documentée) ; état explicite des mains ; règlement
  unique ; tests de règles et de soldes à chaque étape.
- **Téléphone KS** façon smartphone, en ligne comme hors ligne (touche P) : barre d'état (heure du téléphone, réseau
  du navire), écran d'accueil à 11 applications, retour « ‹ », barre d'accueil, animations. Messages, Contacts,
  Cadeaux (serveur), Ma cabine, Plan du navire (déplacement réel), Portefeuille (soldes de l'autorité, relevé des
  jetons de la session), Clés & pass, et Inventaire / Missions / Niveaux / Réglages (menus du jeu, retour au téléphone).
- **Réception** : la clé de la cabine est remise avec le KS Pass et les KSCoins (une seule fois chacun ; cabine
  attribuée au besoin ; clé manquante récupérable au même comptoir) ; sa propre cabine ne s'ouvre qu'avec la clé
  (vérifié aussi par le serveur). Les clés déjà détenues par les profils existants sont conservées.
- **Lisibilité** : texte jamais sous 11 px, libellés de boutons réduits ou sur deux lignes au lieu d'être écrasés,
  réglages en portrait aérés (deux options par ligne), cartes du passe sans chevauchement, notifications sous le HUD,
  bouton de tri de l'inventaire à 44 px ; l'audit couvre maintenant le téléphone, les niveaux, l'inventaire, les
  missions et, avec le KS Pass, tous les mini-jeux des ponts.

## Refonte du casino (version 0.14, éditeur Stan)
- **Blackjack multi-mains** : 1 à 5 mains principales par manche (boutons 1–5), mise indépendante par main (bornes de la table vérifiées main par main), total vérifié avant la distribution, une seule opération de mise ; assurance proposée main par main ; séparations jusqu'à 4 mains par case ; récapitulatif par main (mise totale, résultat, net) + total misé / retourné / bilan net / solde avant → après. Tables partagées en ligne : plusieurs places par joueur dans la limite des 5 places (une place gardée par joueur assis). Règles détaillées : [CASINO_RULES.md](CASINO_RULES.md).
- **Menu « Jeux »** dans l'en-tête de chaque jeu du casino : passage direct d'un jeu à l'autre (le jeu en cours doit être terminé ; le solde de jetons est commun).
- **Affichage** : bandeau central du compteur remplacé, pour le blackjack, par le bilan du jeu ; ailleurs il indique « +N jetons crédités » (montant rendu) pour ne pas le confondre avec le gain net ; messages longs coupés sur plusieurs lignes ; disposition multi-mains vérifiée en portrait et paysage (captures).
- **Tests ajoutés** : `tests/blackjack-multi.test.ts` (10 scénarios à sabot imposé), `tests/casino-rules.test.ts` (8 tests : paiements de chaque jeu sur résultats imposés, mises invalides et solde insuffisant pour tous les jeux), test de table partagée multi-mains ; e2e : manche à 3 mains jouée par l'interface et menu Jeux.
- Résultats : 274/274 tests unitaires et d'intégration, 100/100 vérifications hors ligne, 27/27 en ligne, 7/7 pont natif simulé, audit rapide 0 problème.

## Refonte intégrale (version 0.13, éditeur Stan)
- **Casino multijoueur** (en ligne) : chaque jeu ouvre une table de 5 places gérée par le serveur ; bandeau de table (numéro d'instance, places occupées et libres, phase, compte à rebours, avatars), liste des tables avec amis présents, « Rejoindre un ami », nouvelle instance automatique quand tout est plein. Roulette, baccarat, craps, keno et courses : manche commune (mises de chacun, un seul tirage). Crash : vol commun, encaissement à l'heure du serveur. Blackjack : jusqu'à 5 joueurs servis ensemble, tour de parole avec délai, assurance, séparations, absents joués selon la règle. Machines (sous, Plinko, poker) : banc partagé, gains des voisins affichés. Hors ligne, tous les jeux restent jouables en solo (aucun faux joueur).
- **Blackjack classique** : sabot de 6 jeux, croupier reste sur 17 souple, blackjack 3:2 + bonus maison 50 % (affiché), vérification du blackjack du croupier, **assurance** 2:1 (moitié de la mise), double sur deux cartes y compris après séparation, **séparations jusqu'à 4 mains**, As séparés une carte chacun (pas de re-séparation d'As), égalité remboursée, mises vérifiées et uniques. Comptage Hi-Lo devenu un outil facultatif (bouton « Hi-Lo »), sans effet sur les règles.
- **Téléphone KS** (inventaire, bouton du HUD avec pastille) : conversations privées persistées, non-lus, contacts (surnom, favori), statut en ligne, cadeaux, sonnette de visite, porte de cabine, visiteurs ; hors ligne, il l'indique.
- **Cadeaux entre amis** : KSCoins (1 000 par 24 h glissantes, plusieurs petits dons possibles, capacité restante et délai affichés), jetons (réels, sans conversion), objets (2 par 24 h, valeur ≤ 100, objets personnels bloqués), confirmation explicite, historique ; tout est vérifié par le serveur.
- **Visites et clés** : sonnette, accepter / refuser, entrée dans la bonne cabine, « raccompagner », porte fermée à clé ; clé principale personnelle ; serrurier (couloir des logements) : doubles à 40 KSCoins, renommables, transférables (règles des objets), changement de serrure à 80 KSCoins qui désactive les doubles donnés.
- **KS Pass Croisière** remis à la réception avec les KSCoins de bienvenue (une seule fois, non transférable), exigé pour quitter le hall.
- **Niveaux sans limite** (courbe progressive, paliers, prestige tous les 25 niveaux à partir de 75), panneau Niveaux & Passe (touche sur la barre d'XP) ; **passe de croisière gratuit** (35 paliers, réclamation unique par palier, « Tout réclamer ») ; nouvelles récompenses dessinées : bicorne d'amiral, couronne, médaille.
- **19 émotes** en 5 catégories (Saluer, Réactions, Victoire, Défaite, Détente), animations réelles du personnage, icônes vectorielles, récentes en tête, verrouillage niveau / passe, diffusées aux autres joueurs (vérifiées par le serveur).
- **Décors** : nouvel écran de chargement (paquebot à la ligne de flottaison, crépuscule et vie sous-marine) ; **pont Panorama** (niveau 10 : baies vitrées, carte du ciel interactive avec secret, globe animé, fauteuils club, piano, longues-vues) ; fontaine de l'atrium (vœu), évents de vapeur en salle des machines, serrurier et tableau d'annonces aux logements.
- **Plus aucune heure d'horloge affichée** (écran du hall, messages de modération : durées seulement).
- **Limites connues** : pas de mesure de performance sur téléphone réel ; les tables partagées n'existent qu'en ligne ; les animations des émotes sont des poses dessinées (2 à 4 images), pas une capture de mouvement ; le passe n'a qu'une saison.

## Refonte du casino (version 0.12, éditeur Stan)
- **Commun** : présentation des résultats partagée par tous les jeux (bannière dont l'intensité suit le gain net — gain, beau gain, gros gain, jackpot —, montant qui défile, pluie de jetons, pastille discrète pour une mise rendue ou une perte) ; cartes à enseignes vectorielles avec la vraie disposition des points (2 à 10) et ombre pré-rendue ; dés laqués ; nouveaux sons synthétisés (rouleaux, butées, suspense, bille, dés, battage, cliquet, boulier, explosion, encaissement, pluie de jetons, notes du Plinko) avec anti-superposition ; fond des jeux pré-rendu.
- **Salle** : moquette à treillis doré, rosaces et perles ; projecteurs dorés qui balaient la salle ; machines à sous du décor détaillées en mode démonstration (vrais symboles, lignes gagnantes) ; étiquettes au-dessus des objets hauts ; ambiance sonore enrichie.
- **Jeux** : machines à sous (élan, flou de mouvement, rebond à l'arrêt, suspense quand deux symboles sont alignés, cases et ligne de la table des gains illuminées, levier, vitre) ; roulette (roue pré-rendue détaillée, bille suivie dans le repère de la roue jusqu'à la case exacte, rebonds sonorisés, mises gagnantes illuminées, marqueur sur le numéro) ; craps (lancer physique, bande à pyramides, palet ON/OFF) ; keno (boulier animé, grille pré-rendue) ; courses (chevaux articulés au galop, poussière, sabots, clameur, podium) ; Plinko (plateau pré-rendu, notes montantes) ; Crash (ciel qui change avec l'altitude, fusée, explosion) ; blackjack (récapitulatif qui se replie, battage au remélange) ; baccarat (naturel annoncé) ; poker (cartes gagnantes soulignées) ; roue du jour (languette, cliquet).
- **Performances** (Chromium sans GPU, processeur ralenti ×4, moyenne de 3 mesures avant/après, `dev/casino-perf.mjs`) : étage casino 13,3 → 11,8 ms de calcul par image ; keno 3,8 → 1,5 ; Plinko 3,1 → 2,2 ; Hi-Lo 3,2 → 1,6 ; courses, craps et Crash légèrement plus coûteux (nouveaux effets, +0,4 à +1 ms). Mesures bruitées : ordres de grandeur seulement, pas de mesure sur téléphone.

## Refonte « Baie Royale » (version 0.11, éditeur Stan)
- **En ligne (priorité)** : icônes du HUD qui se chevauchaient en portrait (chat/joueurs passaient sur les soldes) → pile verticale automatique ; icônes web réellement servies (favicon, apple-touch, manifeste) et 404 pour une ressource absente au lieu de la page HTML ; avatars dans les listes d'amis et de joueurs ; session refusée pendant une reconnexion → retour au menu au lieu d'un « Reconnexion… » infini ; réponses arrivées après le délai réalignées sur les soldes ; message de reconnexion détaillé (essai N, délai).
- **Animations de gains** : pièces vers le compteur de KSCoins, jetons vers le compteur de jetons, compteur qui avance à chaque arrivée à partir des soldes renvoyés par l'autorité, intensité selon le montant, aucun double crédit.
- **Circuit KS « Baie Royale »** (arcade, simulateur au fond à droite) : 3 tours contre 3 pilotes de l'équipage gérés par l'ordinateur, piste fermée avec barrières, vibreurs, ligne damier et arche KS, décor marin, dérive, collisions voiture/barrière/voiture, flaques d'huile, vagues turbo, détection de tours (pas de raccourci ni de marche arrière), chrono, meilleur tour, classement, commandes tactiles/clavier/manette, accélération auto. Temps validé par l'autorité (bornes, plafond quotidien). **Course locale uniquement** : l'architecture (logique pure, pas de temps fixe) est prête pour du multijoueur mais aucune course en ligne n'existe.
- **Écrans de chargement** : fond sous-marin animé, progression réelle par étape, astuces, erreur lisible avec « toucher pour réessayer ».
- **Inventaire** refait : cartes avec rareté, quantités, état porté/placé, fiche détaillée, tri, compteurs par catégorie, animations ; mêmes données et mêmes actions qu'avant.
- **Hall** : reflets d'eau au sol, vasques de coraux, totem d'orientation (ascenseur, casino, machines) ; boutons ronds modernisés (enfoncement, halo).
- **Jeux** : passe visuelle sur les 20 jeux en portrait et paysage — bowling à piste verticale en portrait, flipper plein écran en portrait, cartes d'accueil d'arcade opaques, tables de gains du poker lisibles (colonne en paysage, grandes cartes), cotes des courses sur deux lignes, croupier du craps sous l'en-tête, Plinko et consignes ajustées.

## Mise à jour « Croisière » (version 0.10, éditeur Stan)
- **Jetons de casino** distincts des KSCoins : caisse du casino (achat/revente au taux unique 1 jeton = 1 KSCoin, aperçu, deux soldes, annulation, échange atomique et idempotent, anti double toucher), 100 jetons de bienvenue une seule fois ; tous les jeux du casino misent des jetons ; sauvegarde version 3 (migration sans perte).
- **Blackjack** : tables Débutant 5–100, Standard 25–500, Premium 100–2 000 (niveau 3), VIP 500–5 000 (niveau 5) validées par l'autorité ; bonus de blackjack naturel (+50 % de la mise initiale, affiché séparément) ; double face visible ou face cachée (carte masquée jusqu'au règlement, même pour le serveur→client) ; pourboires au croupier ; distribution carte par carte, révélation puis tirage du croupier ; récapitulatif (solde avant/après, mise initiale, suppléments, retour, bonus, pourboires, résultat par main).
- **Casino** : Plinko à trois niveaux de risque (96,4 à 96,9 % de retour), bilan de session à la sortie des jeux du casino (manches, misé, récupéré, résultat, pourboires, meilleur gain).
- **Inventaire central** (bouton sac, touche I, LT) : provisions, garde-robe, objets, décorations, jetons ; consommer, porter/retirer, utiliser, placer (depuis la cabine). Le don d'objets entre joueurs n'est **pas** proposé (aucun système d'échange sûr entre joueurs).
- **Boutique KS** (hall) : tenues, pantalons, chaussures, couvre-chefs, lunettes, bijoux (aperçu sur ton personnage), objets à effets (feu d'artifice, confettis, parfum).
- **Faim et soif** (0–100) : baissent seulement pendant l'exploration (pas en mini-jeu, menu, chargement ni hors ligne) ; alertes à 50 / 25 / 10 sans répétition ; coma à 0 : 15 s, actions bloquées par l'autorité, réveil au hall, rien n'est perdu.
- **Identité** : « KingSea · Croisière » (plus « Casino »), « Un jeu de Stan » au démarrage, au menu et dans « À propos » ; écran de chargement d'ascenseur animé (logo KS, indicateur d'étages, durée minimale, erreurs gérées).
- **Arcade** : carte d'accueil (aide, record, paliers de médailles), compte à rebours, bilan avec médaille ; série au basket.
- **Décors interactifs** : hall (Boutique KS, aquarium au poisson doré secret, piano jouable, écran d'infos, coin photo), casino (tableau des joueurs), arcade (records et médailles), couloir des cabines (plan), rooftop (longue-vue, étoile filante secrète).

## Mise à jour KS Casino (version 0.9)
- **Identité luxe** : noir, champagne, or, bordeaux, vert casino, ivoire ; emblème KS (grand et petit), icônes et écrans de démarrage régénérés.
- **KSCoins** remplacent les Perles : migration de sauvegarde (version 2), conversion 1 pour 1, pièce animée, solde animé.
- **Menu principal** refait (portrait/paysage, mode hors ligne/en ligne, destinations, missions, amis, profil, réglages).
- **Casino** : contrôle de mise commun (jetons, montant libre, −/+, ×2, rejouer, total engagé), croupiers 2D, écran KS à l'ouverture des jeux, **table de poker** interactive à la place de la borne (on s'assoit, la croupière distribue, « Valets ou mieux » inchangé), on s'assoit aussi aux tables de blackjack, baccarat, craps et roulette.
- **Billard** : 8 américain à deux (règles, fautes, bille en main), effets, visée assistée, sons, table verticale en portrait.
- **Progression** : niveaux/XP (plafonds quotidiens), récompenses (KSCoins, meubles, titres, haut-de-forme, smoking, salon VIP, styles), missions quotidiennes et hebdomadaires.
- **Cabine aménageable** : catalogue de meubles, boutique, éditeur sur plan (pose, déplacement, rotation, rangement), styles, disposition validée par l'autorité.
- **Rooftop** : salon VIP (niveau 5), bar à champagne, brasero, guirlandes, soirée à l'heure locale.
- **Social** : chat de proximité et chat global (niveau 2, délai, historique), amis (code ami, demandes, statut, rejoindre) persistés en SQLite.
- **Audio** : volume général, jazz lounge (menu), deep house (rooftop la nuit, salon VIP), lounge lo-fi (cabine), jetons/cartes/billard réalistes — tout est synthétisé (aucun fichier son tiers).
- **Commandes** : clavier réassignable, manette (Gamepad API), raccourcis, saisie de texte protégée, panneau d'aide.

## Terminé et vérifié
### Phases 1 à 3
Prototype mobile, six niveaux reliés par ascenseur et escaliers, décors complets, bar et snack, cabine personnalisable, piscine, toboggan, boîte de nuit avec DJ, socle des mini-jeux, roue du jour, blackjack, roulette, machine à sous, bowling, billard.

### Phase 4 — toutes les activités
**Casino (1er étage)** — chaque jeu a ses règles (bouton « Règles »), son interface tactile et sa logique testée :
| Jeu | Où | Points clés |
|---|---|---|
| Blackjack Hi-Lo | table au tapis bleu (rangée du bas, 2e à gauche) | même blackjack + compte courant / compte réel affichés et expliqués, remis à zéro au mélange du sabot |
| Table de poker | table verte à gauche de l'ascenseur (on s'assoit, croupière Léa) | « Valets ou mieux », toucher les cartes à garder puis « Tirer » ; retour ≈ 97,3 % en jeu optimal |
| Direct Poker | borne « DIRECT » à droite de l'ascenseur | **variante maison documentée** : 5 cartes payées immédiatement, paire de 10 ou mieux ; table configurable dans `logic/poker.ts` ; retour **exact 96,68 %** (calculé sur les 2 598 960 mains) |
| 5 autres machines à sous | rangée du haut (14 machines, 6 thèmes) | Pirates, Créatures marines, KSCoins et coraux, Richesses des profondeurs, Aventures sous-marines ; retours 93,6 à 94,9 % calculés exactement |
| Craps | table de craps (rangée du milieu, à droite de l’allée) | Pass Line, Don't Pass, Field ; les dés de toute la manche sont tirés au départ |
| Keno | grand tableau mural à gauche | 1 à 10 numéros, 20 tirés sur 80, tables 90 à 93 % |
| Courses de chevaux | écran mural à droite | 6 chevaux, cotes fixes (marge ≈ 6 %), plusieurs chevaux possibles, course animée qui respecte l'ordre tiré |
| Baccarat | table au tapis rouge (rangée du bas, 3e) | Punto Banco officiel (3e carte automatique), Banque −5 %, Égalité 8:1 |
| Plinko | borne violette près de la caisse | 12 rangées, multiplicateurs ×0,5 à ×16, retour ≈ 96,8 % |
| Crash | borne bleue près de la caisse | multiplicateur montant, « Encaisser » au toucher, encaissement auto optionnel, retour 97 % |

**Arcade (2e étage)** — jeux gratuits, records et récompense plafonnée (120 KSCoins/jour/jeu) :
| Jeu | Commandes |
|---|---|
| Basket-ball | 45 s, glisser vers le panier ; physique arceau + panneau ; tir à 3 points |
| Tirs au but | 10 tirs ; direction du geste = côté, longueur = hauteur ; gardien qui lit de mieux en mieux |
| Skee-Ball (2 pistes) | 9 boules ; longueur du geste = force, inclinaison = visée ; trous à 100 |
| Tape-crabe | 30 s ; crabes +1, crabe doré +3, méduse −2 ; rythme qui accélère |
| Flipper maritime (3 machines) | ressort (appui long), batteurs moitié gauche / droite (multi-touch), champignons, lance-balles, couloirs et multiplicateur |

### Phase 5 — identité visuelle et audio
- **Logo KS final** : initiales dessinées en tracés vectoriels (identiques sur tous les téléphones, sans police), remplies d'eau dont la ligne de flottaison ondule, reflet qui balaie, médaillon océan cerclé d'or avec KSCoins et couronne. Lisible jusqu'à 30 px. **Icône d'application** régénérée avec les mêmes tracés (`scripts/make-icons.mjs` → SVG + PNG 1024/512/192/48).
- **Écrans** : chargement (vraie progression + roue de navire qui tourne), **menu** au crépuscule avec le paquebot illuminé qui croise, lune, reflets et mouettes, carte du profil avec ton personnage animé.
- **Embarquement / garde-robe** (profil local) : pseudo saisi avec le clavier du téléphone (champ natif, nettoyé), teint (6), coiffure (7) et couleur (9), tenue (6 styles × 10 couleurs), chapeau (5), lunettes, couleur des détails ; aperçu en grand qu'on fait tourner et qui joue les animations. Au premier lancement le pseudo est obligatoire ; ensuite, la garde-robe de la cabine rouvre l'éditeur.
- **Personnages redessinés** : contours, ombrages, yeux, sourcils, bouche, tenues détaillées ; uniformes propres à l'équipage (barman, croupier, accueil, cuisinier, DJ, arcade). **Animations** : marche (6 images × 4 directions), attente (respiration, clignement), geste d'interaction, assis, danse (8 images), saluer, applaudir, joie.
- **Passagers d'ambiance** (personnages non joueurs, *pas* d'autres joueurs) : 2 à 7 par étage, ils se promènent sans traverser murs, meubles ni piscine, s'arrêtent, laissent passer, dansent sur la piste et **répondent quand tu les salues**.
- **Décors vivants** (désactivés par « Effets réduits ») : rais de lumière des baies vitrées et poussières dorées (hall, logements), scintillements au casino, pixels néon à l'arcade, vapeur et étincelles en salle des machines, confettis sur le temps fort, faisceaux du DJ, reflets du soleil sur la piscine et ombres de mouettes au rooftop. Le **rooftop suit l'heure du téléphone** (journée, coucher du soleil, nuit).
- **Transitions** : vague qui monte entre les écrans, **portes d'ascenseur dorées avec le nom de l'étage**, iris à l'ouverture des mini-jeux (fondu simple avec « Effets réduits »).
- **Musique originale** générée en direct, un thème par lieu : menu (ouverture calme), hall (bossa lounge), casino (swing feutré), arcade (chiptune), logements (harpe), rooftop (tropical, steel-drum), salle des machines (nappe sombre). La musique de la boîte de nuit monte et celle du pont s'efface quand on s'approche de la piste. **Volume de la musique réglable séparément** des effets et de l'ambiance.
- **Sons** : bruits de pas selon le sol (bois, pierre, moquette, métal, eau), portes d'ascenseur, fanfare de gain et de record, brouhaha du casino, bornes de l'arcade, mouettes, cliquetis des machines ; compresseur pour éviter la saturation.
- **Commandes configurables** : mode gaucher (joystick à droite, boutons à gauche), taille des commandes (joystick et boutons), **vibrations** (gains, records) activables.
- **Optimisation** : animations des personnages générées à la demande et mises en cache ; celles des passagers préparées pendant la transition d'étage et libérées en quittant l'étage ; effets plafonnés à 70 particules.

### Phase 6 — multijoueur
- **Serveur autoritaire** (`server/`, voir [SERVER.md](SERVER.md)) : Node.js + WebSocket + SQLite intégré. Lancement : `npm run build && npm run server`.
- **Autorité partagée** (`src/authority/`) : toutes les règles qui touchent aux KSCoins (15 jeux du casino, roue du jour, bar, cadeau, objets trouvés, récompenses d'arcade) sont dans un seul module, exécuté sur le téléphone hors ligne et **sur le serveur en ligne**. En ligne, le téléphone n'envoie que des intentions ; la carte cachée du croupier, l'ordre du sabot et le point du Crash ne quittent jamais le serveur. Requête renvoyée après une coupure = même réponse, jamais rejouée.
- **Écran de connexion** : créer un compte (pseudo + mot de passe), se connecter, « Continuer · pseudo » (jeton de session), jouer hors ligne ; adresse du serveur détectée ou réglable. Le profil en ligne (KSCoins, records, cabine, apparence) est sur le serveur ; la partie hors ligne reste séparée sur le téléphone.
- **Présence** : les autres joueurs de l'étage apparaissent avec leur apparence et leur pseudo ; déplacements diffusés 10 fois par seconde et lissés ; assis, allongé, nage, danse, saluts visibles par tous ; changement de tenue visible immédiatement.
- **Chat par étage** : barre de saisie avec le clavier du téléphone, bulles au-dessus des têtes, fil des messages, filtrage (insultes, liens), anti-spam avec sourdine.
- **Liste des joueurs en ligne** (étage de chacun), **bloquer / débloquer**, **signaler** (raison + derniers messages conservés pour la modération).
- **Fiabilité** : déplacements trop rapides ou dans un mur refusés (joueur replacé), une seule connexion par compte, cabines uniques en base, manches abandonnées réglées selon la règle de table.
- **Coupures** : reconnexion automatique (1, 2, 4, 8 puis 15 s), retour dans l'étage, indicateur « En ligne · n » / « Reconnexion… » ; reprise de session après fermeture de l'application.

### Phase 8 — préparation à la publication
- **Exigences des boutiques dans le jeu** : suppression du compte (Paramètres → Compte et infos, mot de passe demandé, effacement immédiat), changement de mot de passe (autres appareils déconnectés), conditions d'utilisation et politique de confidentialité lisibles dans le jeu, acceptation obligatoire à l'inscription (avec « 18 ans ou plus »), avertissement 18+ au premier lancement, écran « À propos ».
- **Serveur** : pages `/privacy`, `/terms`, `/delete-account` (suppression sans l'application, exigée par Google), outils de modération protégés (`/api/admin/account`, `/api/admin/sanction` : sourdine, bannissement temporaire ou définitif, levée ; `/api/admin/delete`), signalements purgés après 12 mois, protocole 3.
- **Pont natif** (`src/platform/native.ts`, sans dépendance obligatoire) : sauvegarde doublée dans le stockage natif et restaurée si la WebView la perd, vibrations natives (iPhone compris), écran de démarrage masqué à la première image, plein écran, bouton retour Android ; adresse du serveur intégrée au build (`KS_SERVER_URL`).
- **Projets natifs** : `npm run native:setup` (Internet seule permission, HTTPS seul, versions dérivées de `package.json`, signature Android via `key.properties`, Info.plist, manifeste de confidentialité Apple). Passage à **Capacitor 8** (API Android 36, exigée par Google Play depuis le 31/08/2026 ; Xcode 26, exigé par Apple depuis le 28/04/2026).
- **Éléments graphiques** : icône sans transparence, icône adaptative, écrans de démarrage clair/sombre, **18 captures** (iPhone 6,9", iPad 13", téléphone Android) prises dans le vrai jeu, bannière Google Play, icône 512.
- **Fiches** FR/EN (`store/listing.json`) aux limites des boutiques, réponses de classification (Apple 18+) et des formulaires de confidentialité (`PUBLISHING.md`).
- **Contrôle avant envoi** : `npm run release:check` (bloque tant qu'il manque l'éditeur, le contact, le serveur HTTPS, les projets natifs, la clé de signature…).

### Phase 7 — tests et optimisation
- **Diagnostic intégré** (Paramètres → Diagnostic) : images/s, temps de calcul par image (moyenne et 95ᵉ centile), images lentes, mémoire des textures et des étages, mémoire JavaScript, latence réseau, erreurs d'exécution regroupées, appareil. Bouton **« Copier le rapport »** pour les tests sur vrais téléphones. Rien n'est envoyé nulle part.
- **Économie d'énergie** (réglage) : 30 images/s, résolution plafonnée, effets réduits.
- **Qualité automatique** (réglage, activé par défaut) : si plus de la moitié des images sont lentes pendant 4 s, la résolution et les effets baissent d'eux-mêmes (une fois, avec un message).
- **Ralenti au repos** : après 20 s sans toucher l'écran, l'affichage passe à 30 images/s (sauf dans les mini-jeux) ; écrans 120 Hz limités à 60.
- **Éclairage** (casino, arcade, logements, machines) : lumières hors écran ignorées, lueurs colorées peintes en basse résolution dans le même calque → une seule copie plein écran par image (casino : ~31 → ~48 images/s dans le test sans GPU).
- **Mémoire** : le décor de chaque étage n'est plus préparé au démarrage mais pendant la première transition d'ascenseur (démarrage plus court) ; 2 étages gardés en mémoire au lieu de 3 sur les appareils modestes ou en effets réduits.
- **Réseau (protocole 2)** : instantanés compacts (numéro court + position + pose codée en un nombre) → **15,5 Ko/s par joueur avec 120 joueurs dans le même étage** (contre ~50 Ko/s), 0,17 ms de calcul serveur par diffusion (`npm run bench:net`).
- **Écrans** : audit de 8 tailles (voir plus bas) → corrigés : barre de commandes des jeux de casino qui se chevauchait en portrait (jetons et boutons maintenant sur deux lignes si nécessaire), Keno en portrait (grille pleine largeur), boutons des paramètres trop petits ou superposés sur les petits téléphones en paysage, boutons du menu et croix de fermeture < 44 px.
- **Robustesse** : le test à données aléatoires du serveur a trouvé un plantage sur message non textuel → corrigé.

### Manche en cours sauvegardée (tous les jeux payants)
- À chaque mise, la manche est enregistrée immédiatement (`data.pending`).
- Si l'application est fermée ou tuée en pleine manche, elle est **réglée au démarrage suivant**, avec le même identifiant de gain (jamais payée deux fois) : blackjack (le joueur absent « reste », le croupier finit), roulette, machines, baccarat, craps, keno, courses, Plinko, poker (main en l'état), Crash (encaissement auto s'il était réglé, sinon mise perdue). Un message l'annonce au retour.

## Économie (KSCoins, sans valeur réelle)
- Identifiant de transaction unique pour chaque mouvement ; doubles crédits impossibles.
- Résultat tiré **avant** l'animation par un générateur cryptographique ; l'animation le montre seulement.
- Taux de retour de chaque jeu affiché dans ses règles et vérifié par les tests.
- On ne peut pas quitter au milieu d'une main, d'un tirage, d'une course ou d'un vol de Crash.

## Fonctionnel mais provisoire
- Hors ligne, l'autorité tourne sur le téléphone (un joueur peut modifier sa propre partie solo) ; en ligne, le serveur décide de tout.
- Les jeux d'arcade se jouent sur l'appareil : le serveur borne les scores et les récompenses, mais ne peut pas prouver un score plausible.
- Pas de récupération de mot de passe par e-mail (aucune adresse n'est demandée) : suppression sur demande par e-mail au contact de l'éditeur ; pas encore d'hébergement HTTPS.
- Le multijoueur n'est **pas** disponible dans la page publiée en ligne (page statique, sans serveur) : il faut lancer le serveur.
- Hors ligne, la roue du jour dépend de la date du téléphone ; en ligne, de celle du serveur.
- Vibrations : module natif Haptics dans l'application (iPhone compris) ; dans un navigateur, Android uniquement.
- Les passagers sont des personnages d'ambiance, pas des joueurs.
- Flipper : table unique, pas de « tilt » ni de sauvetage de balle.

## Testé
- **Sur ordinateur uniquement** (Chromium en émulation mobile tactile) :
  - **151 tests unitaires et d'intégration**, dont l'autorité (mises, tirages, idempotence, secrets du blackjack, Crash à l'horloge du serveur, plafonds d'arcade) et le serveur avec de vrais WebSockets (comptes, présence, téléportation refusée, chat filtré, anti-spam, blocage, signalement, cabines, déconnexion en pleine main, une connexion par compte, persistance SQLite après redémarrage) ;
  - **80 vérifications de bout en bout hors ligne** (tous les jeux refaits sur l'autorité, toujours verts) ;
  - **14 vérifications multijoueur** avec un vrai serveur et deux téléphones émulés : comptes, présence mutuelle, déplacement synchronisé, chat avec bulle et filtrage, anti-spam, emote, roue et roulette payées par le serveur, liste des joueurs, blocage, signalement, coupure réseau et reconnexion, reprise de session, mauvais mot de passe. Aucune erreur JavaScript.
  - **Phase 8** : 170 tests (dont comptes : conditions obligatoires, mot de passe, suppression complète en SQLite et en mémoire, pages web, sourdine/bannissement ; réglages natifs sur extraits de modèles Capacitor ; limites des fiches) ; 81 vérifications hors ligne (avec l'avertissement d'âge) ; **17 vérifications en ligne** (dont changement de mot de passe et suppression du compte depuis le jeu, puis via la page web) ; **7 vérifications du pont natif avec un faux Capacitor** (modules simulés, pas un vrai téléphone) ; audit des écrans refait (0 problème).
  - **Phase 7** : 157 tests (dont tests à données aléatoires : 20 000 requêtes à l'autorité, 6 000 messages malformés au serveur) ; **audit de 8 écrans** (iPhone SE, iPhone 14 / Pro Max avec encoche simulée, Pixel 7, petit Android 640×360, tablette, deux portraits) : menu, paramètres, diagnostic, 6 étages, ascenseur, **les 25 mini-jeux** → 0 bouton hors zone sûre, 0 bouton < 44 px, 0 chevauchement, 0 erreur JS ; fluidité avec processeur ralenti ×4 et ×6 ; mémoire sur 4 tours complets (voir [TESTING.md](TESTING.md)).
  - Limite : Chromium sans carte graphique ne reproduit ni le GPU, ni la batterie, ni la chaleur d'un téléphone ; ces mesures comparent des réglages entre eux.
- **Aucun test sur téléphone réel ni sur un vrai réseau mobile (4G, Wi-Fi instable)** n'a été fait par moi : la liste de vérification est prête dans [TESTING.md](TESTING.md).

## Avant publication
Voir [PUBLISHING.md](PUBLISHING.md) : renseigner éditeur/contact/serveur, héberger le serveur en HTTPS, générer et compiler les projets natifs (Android Studio, Xcode 26 sur Mac), créer la clé de signature, **tester sur vrais téléphones**, remplir les questionnaires des consoles.
