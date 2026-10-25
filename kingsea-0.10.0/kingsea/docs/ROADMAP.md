# Feuille de route — ordonnée par priorité

## Fait
- Phase 1 : prototype mobile jouable.
- Phase 2 : les six niveaux, escaliers, décors, cabines attribuées.
- Phase 3 : socle mini-jeux, roue du jour, blackjack, roulette, machine à sous, bowling, billard, cabine personnalisable, piscine, toboggan, boîte de nuit.

- Phase 4 : manche en cours sauvegardée, tous les jeux du casino (Hi-Lo, poker, Direct Poker, 6 machines, craps, keno, courses, baccarat, Plinko, Crash) et de l'arcade (basket, tirs au but, Skee-Ball, tape-crabe, flipper).

- Phase 5 : logo et icône finaux, écrans (chargement, menu, embarquement), personnages personnalisables et animés, passagers d'ambiance, décors vivants, transitions, musique originale par lieu, sons, commandes configurables, vibrations.

- Phase 6 : serveur autoritaire, comptes, présence et déplacements synchronisés, chat modéré, liste des joueurs, blocage, signalement, économie validée côté serveur, reconnexion.

- Phase 7 : diagnostic intégré, économie d'énergie, qualité automatique, ralenti au repos, éclairage optimisé, mémoire réduite, protocole réseau compact, audit de 8 écrans (25 mini-jeux), tests à données aléatoires, corrections d'interface.

- Phase 8 : exigences des boutiques (suppression de compte dans le jeu et sur le web, mot de passe, conditions, âge, modération), pont natif, réglages natifs, Capacitor 8, icônes/écrans de démarrage, captures et fiches, contrôle avant envoi.

## Reste à faire pour publier (ordre de priorité, détails dans PUBLISHING.md)
1. Renseigner éditeur, contact, site ; choisir l'identifiant d'application définitif.
2. Héberger le serveur en HTTPS/WSS avec sauvegardes.
3. `npm install`, générer les projets natifs, compiler (Android Studio ; Xcode 26 sur Mac), créer la clé de signature.
4. **Tests sur vrais téléphones** (docs/TESTING.md), corrections.
5. Comptes développeur, questionnaires (classification, confidentialité, sécurité des données), tests internes / TestFlight, soumission.

## Plus tard
Récupération de mot de passe par e-mail (facultative), instances d'étage au-delà d'environ 60 joueurs, traduction anglaise du jeu.
