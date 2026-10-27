# Règles du casino KingSea (telles qu'implémentées)

Ce document décrit les règles **réellement codées** (sources : `src/games/logic/*.ts`, autorité `src/authority/casino.ts`,
tables partagées `server/tables.ts`). Ce sont des variantes de jeu choisies pour KingSea, pas des règles « officielles »
universelles ; chaque choix est indiqué. Toutes les mises sont en **jetons de casino** (monnaie du jeu, sans valeur réelle).

## Règles communes à tous les jeux (autorité)
- Montant d'une mise : entier strictement positif, au plus `MAX_BET` = 1 000 (ou le maximum de la table au blackjack) ;
  total d'une manche plafonné à `MAX_TOTAL_STAKE` = 5 000 pour la roulette, le baccarat, le craps et les courses (`checkTotal`) ; au blackjack, chaque main est limitée par la table (5 mains au plus). Sont refusés : négatif,
  zéro, décimal, `NaN`, `Infinity`, texte, valeur démesurée — **sans rien prélever** (tests `casino-rules.test.ts`).
- Solde insuffisant : refus avant tout prélèvement.
- Chaque mouvement de jetons porte un identifiant de transaction unique (`…:mise`, `…:gain`, `…:double:…`, `…:split:…`,
  `…:assurance…`) : une requête rejouée (double clic, reconnexion) n'est ni débitée ni payée deux fois.
- Opérations atomiques (`transact`) : en cas d'erreur, l'état est restauré (aucun jeton créé ni perdu).
- Hors ligne, l'autorité tourne dans l'application (LocalBackend) : elle protège contre les erreurs et les doubles
  actions, **pas** contre un joueur qui modifierait son propre appareil. En ligne, le serveur est la seule autorité.
- « Retour » = montant total rendu au joueur (mise comprise) ; « net » = retour − mise. Les deux sont affichés séparément.

## Blackjack (priorité de la refonte)
| Règle | Valeur retenue |
|---|---|
| Sabot | 6 jeux, remélangé quand il reste moins d'un quart environ (coupe à 78 cartes) |
| Mains par manche | **1 à 5 mains principales** (« cases »), mise indépendante pour chacune, entre le min et le max de la table |
| Contrôle du solde | le **total** des mises doit être disponible avant la distribution (sinon refus, rien n'est prélevé) |
| Distribution | 1re carte à chaque case de gauche à droite, carte visible du croupier, 2e carte à chaque case, carte cachée du croupier |
| Croupier | tire jusqu'à 16, **reste sur tous les 17, y compris 17 souple (S17)** |
| Vérification | le croupier vérifie son blackjack s'il montre un As ou une valeur 10 (manche close aussitôt s'il l'a) |
| Assurance | proposée **main par main** quand le croupier montre un As ; coût = moitié de la mise (arrondi inférieur) ; payée 2:1 ; décidée avant toute autre action |
| Blackjack naturel | payé 3:2 (arrondi inférieur) **+ bonus maison KingSea de 50 %** de la mise, affiché séparément |
| 21 après séparation | pas un blackjack : payé 1:1 |
| Doubler | sur deux cartes, y compris après séparation ; une seule carte (face visible ou cachée au choix) ; mise supplémentaire égale prélevée au moment du double |
| Séparer | paires de même rang, **jusqu'à 4 mains par case** ; mise supplémentaire égale prélevée à chaque séparation ; As séparés : une carte chacun, pas de re-séparation |
| Égalité | mise rendue (net 0) |
| Dépassement de 21 | main perdue immédiatement, même si le croupier dépasse ensuite |
| Tables | Débutant 5–100, Standard 25–500, Premium 100–2 000 (niv. 3), VIP 500–5 000 (niv. 5) — limites par main |
| En ligne | 5 places par table ; un joueur peut occuper plusieurs places libres, une place restant gardée pour chaque joueur assis ; 20 s par décision puis « Rester » automatique |

Ordre de jeu : les mains sont jouées de gauche à droite ; une main séparée est jouée entièrement avant de passer à la
suivante. Une action hors tour, sur une main terminée, ou rejouée est refusée par l'autorité. Le règlement est fait main par main ;
le récapitulatif affiche pour chaque main : mise totale (initiale + double/séparations), résultat, gain ou perte nette,
puis le total misé, le total retourné, le bilan net et le solde avant → après.

## Roulette
Roulette européenne (un seul zéro). Plein 35:1, douzaine et colonne 2:1, chances simples (rouge/noir, pair/impair,
manque/passe) 1:1, perdues sur le zéro (pas de « partage » ni « prison » : choix KingSea).

## Baccarat (Punto Banco)
Règles de tirage standard du Punto Banco. Joueur 1:1 ; Banque 0,95:1 (commission de 5 %, **arrondie à l'inférieur** sur
le gain) ; Égalité 8:1 ; sur égalité, les mises Joueur/Banque sont rendues.

## Craps (simplifié, choix KingSea)
Trois paris : Pass Line, Don't Pass, Field (sur le premier lancer). Pass : 7/11 gagne, 2/3/12 perd, sinon point à refaire
avant le 7. Don't Pass : inverse, **12 au premier lancer = mise rendue**. Field : 2 et 12 payés 2:1, 3/4/9/10/11 payés 1:1,
5/6/7/8 perdent. Toute la séquence est tirée au départ ; l'animation la dévoile.

## Keno
80 numéros, 20 tirés, 1 à 10 numéros choisis ; table de gains selon le nombre de numéros trouvés (`KENO_PAY`).

## Courses
6 chevaux, cotes fixes affichées avant le départ (marge ≈ 6 %) ; seul le cheval gagnant paie, à sa cote.

## Plinko
12 rangées, 50/50 à chaque picot ; trois tables de multiplicateurs (faible, moyen, élevé), retour entre 96 et 97 %.

## Crash
Multiplicateur depuis ×1,00, point d'écrasement tiré au départ (P(≥ m) = 0,97 / m, plafond ×100). Encaisser avant
l'écrasement rend mise × multiplicateur ; après : rien.

## Machines à sous
3 rouleaux ; trois symboles identiques paient la table de la machine (`pay`) ; le symbole le plus courant (rang 0) sur les
deux premiers rouleaux rend ×3 (`two`), sur le premier seul ×1 (`one`) (`slotMachines.ts`).

## Poker
- **Valets ou mieux** (vidéo-poker, 5 cartes, un échange) : table **8/5** (full 8, couleur 5 — taux ≈ 97,3 %) ;
  paire de Valets ou mieux remboursée.
- **Direct Poker KS** (variante maison) : 5 cartes, aucun échange, paire de 10 ou mieux payée.
