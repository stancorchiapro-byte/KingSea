# Serveur multijoueur KingSea

Serveur **autoritaire** en Node.js (TypeScript), sans dépendance lourde : `ws` pour les WebSockets,
SQLite intégré à Node (`node:sqlite`) pour les données. Il sert aussi le jeu (`dist/`).

## Lancer en local
```bash
npm install
npm run build        # construit le jeu dans dist/
npm run server       # http://localhost:8787  (WebSocket : /ws)
```
Sur un téléphone du même Wi-Fi : ouvrir `http://<ip-de-l-ordinateur>:8787`, puis **Jouer en ligne** :
l'adresse du serveur est détectée automatiquement. Dans l'application Capacitor, régler l'adresse
dans l'écran de connexion (« Serveur : … ✎ »).

Variables d'environnement :
| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port HTTP/WebSocket | 8787 |
| `KS_DB` | fichier SQLite (`:memory:` pour un essai) | `server/data/kingsea.db` |
| `KS_ADMIN_TOKEN` | jeton d'accès à `/api/reports` (signalements) | vide = désactivé |
| `KS_NAME` | nom affiché du serveur | KingSea |

`GET /api/health` → état (joueurs en ligne, comptes, cabines libres).
`GET /api/reports` avec `Authorization: Bearer <KS_ADMIN_TOKEN>` → 100 derniers signalements, avec les derniers messages du joueur signalé.

## Ce que le serveur décide seul
- **Comptes** : pseudo unique (insensible à la casse, noms réservés refusés) + mot de passe haché (scrypt, sel par compte), jetons de session aléatoires de 256 bits ; limitation des tentatives (12/min par adresse et par pseudo). Une seule connexion par compte (l'ancienne est fermée).
- **KSCoins et jeux** : chaque mise, tirage, gain, achat, cadeau, objet trouvé, roue du jour et récompense d'arcade est calculé par l'autorité partagée (`src/authority/`) exécutée sur le serveur. Le téléphone n'envoie que des intentions. Chaque requête a un identifiant : renvoyée après une coupure, elle reçoit la même réponse et n'est jamais rejouée. Les secrets (carte cachée du croupier, ordre du sabot, point du Crash) ne quittent jamais le serveur.
- **Jeux d'arcade** : ils se jouent sur le téléphone ; le serveur calcule la récompense à partir du score, applique le plafond quotidien et **refuse les scores impossibles** (bornes par jeu). Un tricheur peut encore envoyer un score plausible mais faux : c'est la limite des jeux d'adresse joués sur l'appareil.
- **Déplacements** : vitesse maximale (avec marge pour la latence), positions hors de l'étage ou dans un mur refusées → le joueur est replacé.
- **Cabines** : attribution unique en base (contrainte d'unicité), intérieur privé (chacun seul dans sa cabine).
- **Manches abandonnées** (application fermée en pleine main) : réglées selon la règle de table à la reconnexion, ou 60 s après la déconnexion.

## Réseau (protocole 2)
- Le téléphone et le serveur doivent avoir la même version de protocole (sinon : « mets l'application à jour »).
- Diffusion 10 fois/s des seuls joueurs qui ont bougé, en format compact `[numéro, x, y, pose]`.
- Charge mesurée (`npm run bench:net`, sans réseau réel) : 120 joueurs dans un étage, tous en mouvement → **15,5 Ko/s reçus par joueur**, 0,17 ms de calcul par diffusion ; 30 joueurs → 3,9 Ko/s.
- Messages non textuels, JSON invalide, trop longs ou absurdes : ignorés (vérifié par un test à données aléatoires de 6 000 messages).

## Chat et sécurité des joueurs
- Chat par étage, 140 caractères, filtré : liens masqués, insultes courantes masquées, caractères de contrôle retirés, répétitions réduites.
- Anti-spam : 0,8 s minimum entre deux messages, 5 messages / 10 s, pas de message identique sous 30 s ; 3 fautes en 30 s → sourdine 60 s.
- **Bloquer** un joueur : ses messages et emotes ne sont plus envoyés (enregistré en base).
- **Signaler** : raison au choix + derniers messages du joueur conservés pour la modération (5 signalements / 10 min maximum par joueur).
- La liste d'insultes est volontairement courte : à compléter et à faire relire avant publication.

## Pages publiques et modération
- `/privacy`, `/terms` : textes de `src/legal/texts.ts` (les mêmes que dans le jeu). `/delete-account` : suppression d'un compte par pseudo + mot de passe, sans l'application (exigé par Google Play).
- Outils de modération, protégés par `Authorization: Bearer $KS_ADMIN_TOKEN` :
  - `GET /api/reports` — derniers signalements (avec au plus 10 messages de la personne signalée) ;
  - `GET /api/admin/account?name=Pseudo` — fiche du compte (en ligne, sanction, nombre de signalements) ;
  - `POST /api/admin/sanction` `{"name":"Pseudo","muteMinutes":60,"banMinutes":1440,"reason":"insultes"}` — sourdine et/ou bannissement (0 = lever ; le joueur banni est expulsé et ses sessions révoquées) ;
  - `POST /api/admin/delete` `{"name":"Pseudo"}` — suppression demandée par e-mail (mot de passe oublié), après vérification de l'identité.
- Les signalements sont supprimés après 12 mois.

## Mise en production (non faite)
- Héberger derrière un proxy **HTTPS/WSS** (obligatoire pour les applications des boutiques) : Caddy ou Nginx + certificat.
- Sauvegarder `kingsea.db` (et le fichier `-wal`) régulièrement ; un seul processus serveur par base.
- Au-delà de quelques centaines de joueurs simultanés : zones d'intérêt (n'envoyer que les joueurs proches), plusieurs instances par étage, stockage dédié (PostgreSQL). Mesure actuelle : 120 joueurs dans le même étage = 0,3 ms de calcul par diffusion, mais ~50 Ko/s de données par joueur, à réduire avant un lancement public.
- Prévoir : récupération de mot de passe (e-mail), suppression de compte (RGPD), outil de modération (sourdine/bannissement), politique de confidentialité.
