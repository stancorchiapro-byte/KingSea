# Tests — ce qui est automatisé, et ce qu'il reste à vérifier sur de vrais téléphones

## Automatisé (lancé sur ordinateur)
| Commande | Ce qu'elle vérifie |
|---|---|
| `npm test` | tests unitaires et d'intégration : règles de tous les jeux, autorité (KSCoins), sauvegarde, serveur WebSocket réel, **tests à données aléatoires** (20 000 requêtes absurdes à l'autorité, 6 000 messages malformés au serveur) |
| `npm run test:e2e` | parcours complet hors ligne dans Chromium mobile émulé (tactile) |
| `npm run test:e2e:online` | deux téléphones émulés + vrai serveur |
| `npm run test:e2e:native` | pont natif avec un **faux** Capacitor : écran de démarrage, barre d'état, bouton retour, vibrations, sauvegarde doublée et restaurée |
| `npm run release:check` | contrôle avant envoi aux boutiques (bloque tant qu'il manque quelque chose) |
| `npm run audit` | **8 tailles d'écran** (petits/grands téléphones, tablette, paysage/portrait, encoches simulées) : chaque bouton de chaque écran (menu, 6 étages, mini-jeux, modales) est dans la zone sûre, fait au moins 44 px, ne chevauche pas un autre ; aucune erreur JS ; fluidité avec processeur ralenti ×4/×6 ; mémoire sur 4 tours complets (fuites) |
| `npm run bench:net` | charge réseau du serveur (120 joueurs dans un étage) |

Limite : Chromium sans carte graphique ne reproduit ni le GPU, ni la batterie, ni la mémoire d'un vrai téléphone. Les mesures de fluidité servent à comparer des réglages entre eux, pas à prédire les images/s d'un modèle précis.

## À faire sur de vrais appareils (non fait à ce jour)
Appareils conseillés : un iPhone récent, un iPhone ancien (SE 2ᵉ gén. ou 8), un Android milieu de gamme, un Android d'entrée de gamme (2–3 Go de mémoire), une tablette.

Sur chaque appareil, ouvrir **Paramètres → Diagnostic → Copier le rapport** après chaque série et le coller dans le compte rendu.

### 1. Démarrage et écran
- [ ] Le jeu démarre en moins de 5 s ; logo net, pas d'écran blanc.
- [ ] Paysage et portrait : rien n'est caché par l'encoche, la barre d'accueil ou les coins arrondis.
- [ ] Rotation de l'écran en cours de partie : l'affichage se replace.

### 2. Commandes tactiles
- [ ] Joystick : le personnage suit le pouce sans retard, s'arrête au relâchement.
- [ ] Joystick + bouton « Interagir » en même temps (deux doigts).
- [ ] Mode gaucher et « Taille des commandes » : chaque taille reste confortable.
- [ ] Collisions : impossible de traverser murs, meubles, piscine ; pas de blocage dans un coin.
- [ ] Ascenseur et escaliers : chaque étage, arrivée au bon endroit.

### 3. Mini-jeux
- [ ] Chaque jeu du casino : miser, jouer, gain correct affiché, règles lisibles.
- [ ] Chaque jeu de l'arcade : gestes reconnus (glisser, appui long du flipper, multi-touch des batteurs).
- [ ] Fermer l'application en pleine manche, la rouvrir : manche réglée une seule fois, message affiché.

### 4. Économie et récompenses
- [ ] Roue du jour : une fois par jour ; le lendemain (changer la date du téléphone hors ligne) elle revient.
- [ ] Aucun moyen de payer de l'argent réel ; les KSCoins ne quittent pas le jeu.

### 5. Sauvegarde et cycle de vie
- [ ] Mettre en arrière-plan puis revenir : son coupé puis rétabli, partie intacte.
- [ ] Tuer l'application, la relancer : position, KSCoins, tenue, cabine conservées.
- [ ] Mode économie de batterie du téléphone activé : le jeu reste jouable.

### 6. Performance, batterie, mémoire
- [ ] 15 minutes de jeu au casino puis au rooftop : rapport de diagnostic (images/s, images lentes, mémoire).
- [ ] « Économie d'énergie » activée : 30 images/s, téléphone moins chaud (noter le % de batterie sur 15 min, avec et sans).
- [ ] Sur l'appareil d'entrée de gamme : la qualité baisse-t-elle d'elle-même ? (message « Qualité réduite automatiquement »)
- [ ] Après 20 s sans toucher l'écran, l'affichage ralentit (30 images/s) puis redevient fluide au premier toucher.

### 7. Application native
- [ ] Icône nette sur l'écran d'accueil (Android : formes rondes/carrées) ; écran de démarrage sans flash noir ou blanc.
- [ ] Barre d'état masquée ; bouton retour Android ferme les fenêtres puis ne quitte pas le jeu par erreur.
- [ ] Vibrations sur iPhone (module natif).
- [ ] Forcer l'arrêt de l'application après une partie : la progression revient.

### 8. Compte en ligne
- [ ] Inscription impossible sans cocher la case ; liens Conditions / Confidentialité lisibles.
- [ ] Changer le mot de passe ; l'autre appareil est déconnecté.
- [ ] Supprimer le compte depuis le jeu ; puis vérifier que la connexion échoue ; essayer aussi la page web `/delete-account`.

### 9. Multijoueur (serveur lancé, vrais réseaux)
- [ ] Wi-Fi puis 4G : déplacements des autres fluides, chat, emotes.
- [ ] Passer en mode avion 10 s puis revenir : « Reconnexion… » puis retour dans l'étage, aucune mise perdue ni payée deux fois.
- [ ] Deux téléphones dans le même compte : l'ancien est déconnecté proprement.

### Compte rendu
Pour chaque problème : appareil, système, étape, ce qui était attendu, ce qui s'est passé, capture d'écran, rapport de diagnostic.

### Version 0.13 — à vérifier à plusieurs, sur de vrais téléphones (non fait)
- [ ] Deux à six joueurs à la même roulette : places affichées, sixième joueur envoyé sur une deuxième table, tirage identique pour tous.
- [ ] Blackjack à trois : tour de parole, délai de 20 s, assurance, séparations jusqu'à 4 mains, coupure réseau d'un joueur en pleine main.
- [ ] Crash à plusieurs : encaissements à des multiplicateurs différents, encaissement automatique.
- [ ] Téléphone : messages entre deux appareils, pastille de non-lus, conversation effacée d'un seul côté.
- [ ] Cadeaux : KSCoins (limite de 1 000 sur 24 h), jetons, objets (2 sur 24 h), clé ; affichage du délai de renouvellement.
- [ ] Visites : sonnette, refus, acceptation, raccompagner, porte fermée, double de clé, changement de serrure.
- [ ] Émotes : les 19 animations vues par un autre joueur ; le déplacement interrompt l'émote.
- [ ] Pont Panorama (niveau 10) et écran de chargement en portrait / paysage.
