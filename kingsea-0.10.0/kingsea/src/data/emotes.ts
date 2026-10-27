// Catalogue des émotes : chaque émote est reliée à une animation réelle du personnage (art/characters.ts, poseFor)
// et à une icône vectorielle (ui/emoteIcons.ts). Les émotes de base sont libres ; les autres se débloquent par le
// niveau ou le passe de croisière (clé de déblocage `emote:<id>`, vérifiée par le serveur avant diffusion).

export type EmoteCategory = 'social' | 'fun' | 'bravo' | 'oups' | 'detente';
export type EmoteAnim = 'wave' | 'clap' | 'dance' | 'cheer' | 'bow' | 'salute' | 'laugh' | 'surprise' | 'thumbs' | 'facepalm' | 'shrug' | 'think' | 'spyglass' | 'stretch' | 'sigh' | 'love' | 'swell' | 'jump';

export interface EmoteDef {
  id: string;
  label: string;
  category: EmoteCategory;
  anim: EmoteAnim;
  /** Durée (s) ; Infinity : jusqu'au prochain déplacement (danse). */
  duration: number;
  /** Niveau requis (absent : libre ou passe de croisière). */
  level?: number;
  /** Débloquée par le passe de croisière. */
  pass?: boolean;
}

export const EMOTE_CATEGORIES: Array<{ id: EmoteCategory; label: string }> = [
  { id: 'social', label: 'Saluer' },
  { id: 'fun', label: 'Réactions' },
  { id: 'bravo', label: 'Victoire' },
  { id: 'oups', label: 'Défaite' },
  { id: 'detente', label: 'Détente' },
];

export const EMOTES: EmoteDef[] = [
  { id: 'wave', label: 'Saluer', category: 'social', anim: 'wave', duration: 2.2 },
  { id: 'heart', label: 'Cœur', category: 'social', anim: 'love', duration: 2.2 },
  { id: 'bow', label: 'Révérence', category: 'social', anim: 'bow', duration: 2.2, level: 3 },
  { id: 'salute', label: 'Salut marin', category: 'social', anim: 'salute', duration: 2.4, level: 4 },
  { id: 'captain', label: 'Salut du capitaine', category: 'social', anim: 'salute', duration: 3, pass: true },
  { id: 'laugh', label: 'Rire', category: 'fun', anim: 'laugh', duration: 2.4 },
  { id: 'surprise', label: 'Surprise', category: 'fun', anim: 'surprise', duration: 2 },
  { id: 'shrug', label: 'Bof', category: 'fun', anim: 'shrug', duration: 2, level: 6 },
  { id: 'think', label: 'Réfléchir', category: 'fun', anim: 'think', duration: 3, level: 8 },
  { id: 'clap', label: 'Applaudir', category: 'bravo', anim: 'clap', duration: 2.2 },
  { id: 'thumbs', label: 'Bravo', category: 'bravo', anim: 'thumbs', duration: 2 },
  { id: 'cheer', label: 'Victoire !', category: 'bravo', anim: 'cheer', duration: 2.4 },
  { id: 'jackpot', label: 'Jackpot', category: 'bravo', anim: 'jump', duration: 2.6, pass: true },
  { id: 'facepalm', label: 'Oups', category: 'oups', anim: 'facepalm', duration: 2.2 },
  { id: 'sigh', label: 'Soupir', category: 'oups', anim: 'sigh', duration: 2.4, level: 5 },
  { id: 'dance', label: 'Danser', category: 'detente', anim: 'dance', duration: 3 },
  { id: 'stretch', label: 'S’étirer', category: 'detente', anim: 'stretch', duration: 2.6, level: 15 },
  { id: 'spyglass', label: 'Longue-vue', category: 'detente', anim: 'spyglass', duration: 3, level: 12 },
  { id: 'swell', label: 'La houle', category: 'detente', anim: 'swell', duration: 3, pass: true },
];

export const EMOTE_BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

/** Émote disponible pour ce joueur (libre, ou débloquée : clé `emote:<id>` obtenue par le niveau ou le passe). */
export function emoteUnlocked(id: string, unlocks: readonly string[]): boolean {
  const e = EMOTE_BY_ID.get(id);
  if (!e) return false;
  if (!e.level && !e.pass) return true;
  return unlocks.includes(`emote:${id}`);
}
