// Textes légaux de KingSea, partagés par le jeu (écrans « Confidentialité » et « Conditions ») et par le
// serveur (pages /privacy, /terms, /delete-account exigées par les boutiques).
// Éditeur : Stan. ⚠ À COMPLÉTER AVANT PUBLICATION : adresse de contact, adresse du serveur (voir docs/PUBLISHING.md).
// `npm run release:check` refuse de valider tant que ces valeurs contiennent « [À RENSEIGNER ».

export const LEGAL = {
  appName: 'KingSea',
  publisher: 'Stan',
  contactEmail: '[À RENSEIGNER : adresse e-mail de contact]',
  /** Adresse publique du serveur (HTTPS), où sont publiées ces pages. */
  website: '[À RENSEIGNER : https://votre-serveur]',
  updated: '24 octobre 2026',
  minAge: 18,
};

export interface LegalSection { title: string; body: string[] }

export const PRIVACY: LegalSection[] = [
  { title: 'En bref', body: [
    `${LEGAL.appName} ne contient ni publicité, ni achat, ni outil de mesure d’audience, ni traceur. Aucune donnée n’est vendue ni partagée avec des tiers.`,
    'Hors ligne, rien ne quitte ton téléphone : ta partie est enregistrée uniquement sur l’appareil.',
  ] },
  { title: 'Données traitées en ligne', body: [
    'Seulement si tu crées un compte pour jouer en ligne :',
    '• ton pseudo et ton mot de passe (conservé sous forme d’empreinte chiffrée scrypt, jamais en clair) ;',
    '• ta partie : KSCoins et jetons de casino (monnaies virtuelles sans valeur réelle), inventaire (objets, vêtements, provisions), jauges de faim et de soif, niveau et missions, records, apparence, cabine et son aménagement, étage, jeux en cours ;',
    '• tes amis : ton code ami, ta liste d’amis et les demandes envoyées ou reçues ; tes amis voient si tu es en ligne et à quel étage ;',
    '• tes listes de blocage et les signalements que tu envoies ou qui te visent (avec au plus 10 de tes derniers messages pour la modération) ;',
    '• un jeton de session aléatoire pour rester connecté ;',
    '• ton adresse IP, utilisée uniquement en mémoire pour limiter les abus (tentatives de connexion), jamais enregistrée.',
    'Les messages du chat ne sont pas enregistrés : seuls les 40 derniers par étage et les 40 derniers du chat global restent en mémoire du serveur, et disparaissent à son redémarrage, sauf s’ils sont joints à un signalement.',
  ] },
  { title: 'Pourquoi', body: [
    'Faire fonctionner le jeu en ligne (compte, partie, présence des autres joueurs, chat) et protéger les joueurs (anti-spam, blocage, signalements, sanctions). Base légale : l’exécution du service que tu demandes et notre intérêt légitime à assurer la sécurité.',
  ] },
  { title: 'Durée de conservation', body: [
    'Tant que ton compte existe. Les signalements sont conservés 12 mois au plus. Les sessions sont révoquées à la déconnexion, au changement de mot de passe et à la suppression du compte.',
  ] },
  { title: 'Supprimer ton compte', body: [
    'Dans le jeu : Paramètres → Mon compte → Supprimer mon compte (mot de passe demandé). C’est immédiat et définitif : compte, partie, cabine, amis et demandes d’amis, code ami, blocages et sessions sont effacés.',
    `Sans le jeu : page « Supprimer mon compte » sur ${LEGAL.website}/delete-account, ou par e-mail à ${LEGAL.contactEmail}.`,
    'Les signalements que tu as envoyés sont conservés sans ton identifiant ; ceux qui te visent peuvent être gardés 12 mois pour la sécurité des joueurs.',
  ] },
  { title: 'Tes droits', body: [
    `Accès, rectification, effacement, opposition, portabilité : écris à ${LEGAL.contactEmail}. Tu peux aussi saisir l’autorité de protection des données de ton pays (en France : la CNIL).`,
  ] },
  { title: 'Hébergement et sécurité', body: [
    'Les données en ligne sont stockées sur le serveur de l’éditeur. Les échanges entre le jeu et le serveur sont chiffrés (HTTPS/WSS).',
  ] },
  { title: 'Permissions du téléphone', body: [
    'Accès à Internet uniquement (jeu en ligne). Pas de caméra, micro, localisation, contacts ni photos. Les vibrations sont désactivables dans les paramètres.',
  ] },
];

export const TERMS: LegalSection[] = [
  { title: 'Âge', body: [`${LEGAL.appName} est réservé aux personnes de ${LEGAL.minAge} ans et plus : il contient des jeux de casino simulés.`] },
  { title: 'Aucun argent réel', body: [
    'Les KSCoins et les jetons de casino sont des monnaies virtuelles sans aucune valeur : ils ne s’achètent pas avec de l’argent réel, ne se vendent pas, ne s’échangent pas contre de l’argent ou des biens réels, et ne donnent droit à aucun gain réel. Les jetons s’obtiennent uniquement à la caisse du casino, contre des KSCoins du jeu.',
    'Réussir aux jeux de casino simulés ne présage en rien d’un succès aux jeux d’argent réels. Si le jeu d’argent devient un problème pour toi ou un proche : Joueurs Info Service, 09 74 75 13 13 (France, appel non surtaxé).',
  ] },
  { title: 'Comportement en ligne', body: [
    'Sont interdits : insultes, harcèlement, propos haineux, contenus sexuels, partage d’informations personnelles, usurpation (équipe, modérateurs), triche ou exploitation de failles, publicité et spam.',
    'Tu peux bloquer et signaler un joueur depuis la liste des joueurs. Un filtre masque les insultes et liens. La modération examine les signalements et peut rendre muet, suspendre ou supprimer un compte, temporairement ou définitivement.',
  ] },
  { title: 'Ton compte', body: [
    'Choisis un mot de passe propre à ce jeu et garde-le secret. Il n’existe pas de récupération par e-mail : note-le. Tu peux le changer dans Paramètres → Mon compte, et supprimer ton compte à tout moment.',
  ] },
  { title: 'Service', body: [
    'Le jeu est fourni tel quel ; le service en ligne peut être interrompu pour maintenance. Ta partie hors ligne reste indépendante du service en ligne.',
  ] },
  { title: 'Contact', body: [`${LEGAL.publisher} — ${LEGAL.contactEmail}`] },
];

/** Version texte (pour les tests, les pages web et le contrôle avant publication). */
export function legalText(sections: LegalSection[]): string {
  return sections.map((s) => `${s.title}\n${s.body.join('\n')}`).join('\n\n');
}

/** Vrai si un champ obligatoire n'a pas été renseigné. */
export function legalPlaceholders(): string[] {
  return Object.entries(LEGAL).filter(([, v]) => typeof v === 'string' && v.includes('[À RENSEIGNER')).map(([k]) => k);
}
