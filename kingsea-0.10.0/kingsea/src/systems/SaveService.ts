// Persistance des données joueur, découplée du support de stockage.
// - Navigateur / prototype : localStorage.
// - Application Capacitor : @capacitor/preferences (adaptateur à brancher, voir docs/BUILD_MOBILE.md).
// - Multijoueur : le serveur deviendra la source de vérité (économie, récompenses, logements).
import { createDefaultPlayer, migrate, type PlayerData } from './PlayerData';

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export class MemoryStorage implements StorageAdapter {
  data = new Map<string, string>();
  get(k: string) { return this.data.get(k) ?? null; }
  set(k: string, v: string) { this.data.set(k, v); }
}

export class LocalStorageAdapter implements StorageAdapter {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
  set(k: string, v: string) { localStorage.setItem(k, v); }
}

/** Choisit localStorage s'il est utilisable, sinon une mémoire volatile (navigation privée stricte, iframe). */
export function detectStorage(): { adapter: StorageAdapter; persistent: boolean } {
  try {
    const k = '__ks_probe__';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return { adapter: new LocalStorageAdapter(), persistent: true };
  } catch {
    return { adapter: new MemoryStorage(), persistent: false };
  }
}

export const SAVE_KEY = 'kingsea.save.v1';

export class SaveService {
  data: PlayerData;
  /** Indique si la dernière lecture a dû réinitialiser une sauvegarde corrompue. */
  recoveredFromCorruption = false;
  lastError: string | null = null;
  private dirty = false;
  /** Clé de stockage courante : partie hors ligne, ou copie locale d'un profil en ligne. */
  key = SAVE_KEY;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private storage: StorageAdapter, private debounceMs = 800) {
    this.data = this.load();
  }

  private load(): PlayerData {
    const raw = this.storage.get(this.key);
    if (!raw) return createDefaultPlayer();
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      // On conserve une copie de la sauvegarde illisible pour diagnostic, puis on repart proprement.
      try { this.storage.set(`${SAVE_KEY}.corrupt.${Date.now()}`, raw); } catch { /* stockage plein */ }
      this.recoveredFromCorruption = true;
      this.lastError = String(e);
      return createDefaultPlayer();
    }
  }

  /** Marque les données comme modifiées ; écriture groupée après un court délai. */
  markDirty(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.saveNow(); }, this.debounceMs);
  }

  /** Écriture immédiate (mise en arrière-plan, action importante). Retourne false en cas d'échec. */
  saveNow(): boolean {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try {
      this.storage.set(this.key, JSON.stringify(this.data));
      this.dirty = false;
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = String(e);
      return false;
    }
  }

  get hasUnsavedChanges(): boolean { return this.dirty; }

  /** Bascule vers d'autres données (profil en ligne) ou revient à la partie hors ligne (key = SAVE_KEY). */
  switchTo(key: string, data?: PlayerData): void {
    this.saveNow();
    this.key = key;
    this.data = data ?? this.load();
    this.saveNow();
  }

  resetAll(): void {
    this.data = createDefaultPlayer();
    this.saveNow();
  }
}
