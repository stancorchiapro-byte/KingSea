# KingSea (KS)

Jeu social mobile 2D à bord d'un bateau de croisière de luxe. Android & iOS (Capacitor), TypeScript.

```bash
npm install
npm run dev        # jouer (ordinateur ou téléphone sur le même Wi-Fi)
npm test           # tests unitaires et serveur
npm run build && npm run server   # serveur multijoueur + jeu sur http://localhost:8787
```

- Serveur multijoueur : [docs/SERVER.md](docs/SERVER.md)
- **Publication (état, marche à suivre, formulaires des boutiques)** : [docs/PUBLISHING.md](docs/PUBLISHING.md) — `npm run release:check`
- Tests sur ordinateur et sur vrais téléphones : [docs/TESTING.md](docs/TESTING.md)
- Choix techniques et arborescence : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Android / iOS : [docs/BUILD_MOBILE.md](docs/BUILD_MOBILE.md)
- État du projet (v0.8, non publié) : [docs/STATUS.md](docs/STATUS.md)
- Prochaines étapes : [docs/ROADMAP.md](docs/ROADMAP.md)

Commandes : joystick (moitié gauche de l'écran), bouton Interagir (bas droite) ou toucher directement un objet proche, bouton Étages (haut droite).
Clavier pour tests : ZQSD / WASD / flèches, E pour interagir, Échap pour le menu.

Les KSCoins sont une monnaie virtuelle sans valeur réelle : aucun dépôt, aucun retrait. Jeu réservé aux 18 ans et plus (casino simulé).
