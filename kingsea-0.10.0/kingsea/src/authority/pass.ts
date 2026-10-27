// Passe de croisière (gratuit) : paliers débloqués par l'XP gagnée en jouant (mêmes plafonds quotidiens que les
// niveaux : impossible de « farmer » une action), récompenses réclamées une à une par l'autorité (une seule fois
// chacune : liste des paliers réclamés + transaction `pass:<saison>:<palier>`). Aucun achat, aucune option payante.

export interface PassReward {
  coins?: number;
  chips?: number;
  /** Objet ajouté à l'inventaire (data/items.ts). */
  item?: string;
  /** Déblocage (titre, émote, tenue, accessoire, meuble, accès) : même format que les récompenses de niveau. */
  unlock?: string;
  /** Libellé affiché. */
  label: string;
}

export interface PassState { season: string; xp: number; claimed: number[] }

const T = (label: string, r: Omit<PassReward, 'label'>): PassReward => ({ label, ...r });

/** Saison en cours (une nouvelle saison = nouvel identifiant : la progression repart, les récompenses reçues restent). */
export const PASS = {
  season: 'S1',
  name: 'Saison 1 · Baie Royale',
  /** XP de passe par palier. */
  xpPerTier: 250,
  tiers: [
    T('150 KSCoins', { coins: 150 }),
    T('Émote « Jackpot »', { unlock: 'emote:jackpot' }),
    T('100 jetons', { chips: 100 }),
    T('Canon à confettis', { item: 'use.confetti' }),
    T('Titre « Mousse de la Baie »', { unlock: 'title:Mousse de la Baie' }),
    T('200 KSCoins', { coins: 200 }),
    T('Pluie d’or', { item: 'use.confetti-or' }),
    T('150 jetons', { chips: 150 }),
    T('Feu d’artifice de poche', { item: 'use.fireworks' }),
    T('Lunettes aviateur', { unlock: 'glasses:aviateur' }),
    T('250 KSCoins', { coins: 250 }),
    T('Brume des embruns', { item: 'cos.embruns' }),
    T('200 jetons', { chips: 200 }),
    T('Lampe art déco', { unlock: 'furn:lamp-deco' }),
    T('Titre « Navigateur royal »', { unlock: 'title:Navigateur royal' }),
    T('300 KSCoins', { coins: 300 }),
    T('Bouquet royal', { item: 'use.fireworks-royal' }),
    T('Panama', { unlock: 'hat:panama' }),
    T('250 jetons', { chips: 250 }),
    T('Émote « La houle »', { unlock: 'emote:swell' }),
    T('350 KSCoins', { coins: 350 }),
    T('Eau de parfum KS', { item: 'cos.parfum' }),
    T('300 jetons', { chips: 300 }),
    T('Collier de perles', { unlock: 'jewel:collier' }),
    T('Titre « Corsaire de la Baie »', { unlock: 'title:Corsaire de la Baie' }),
    T('400 KSCoins', { coins: 400 }),
    T('Bouquet royal', { item: 'use.fireworks-royal' }),
    T('400 jetons', { chips: 400 }),
    T('Émote « Salut du capitaine »', { unlock: 'emote:captain' }),
    T('Couvre-chef d’amiral', { unlock: 'hat:amiral' }),
    T('500 KSCoins', { coins: 500 }),
    T('Brume des embruns', { item: 'cos.embruns' }),
    T('500 jetons', { chips: 500 }),
    T('Maquette de yacht', { unlock: 'furn:yacht-model' }),
    T('Titre « Roi de la Baie Royale »', { unlock: 'title:Roi de la Baie Royale' }),
  ] as PassReward[],
};

/** Ajoute de l'XP de passe (saison courante ; une autre saison repart de zéro). */
export function passAddXp(p: { pass?: PassState }, n: number): void {
  if (!p.pass || p.pass.season !== PASS.season) p.pass = { season: PASS.season, xp: 0, claimed: [] };
  if (n > 0) p.pass.xp += Math.floor(n);
}

/** Palier atteint (0 : aucun), plafonné au nombre de paliers. */
export function passTier(xp: number): number { return Math.min(PASS.tiers.length, Math.floor(Math.max(0, xp) / PASS.xpPerTier)); }

/** Progression vers le palier suivant. */
export function passProgress(xp: number): { tier: number; into: number; needed: number; done: boolean } {
  const tier = passTier(xp), done = tier >= PASS.tiers.length;
  return { tier, into: done ? PASS.xpPerTier : Math.max(0, xp) - tier * PASS.xpPerTier, needed: PASS.xpPerTier, done };
}
