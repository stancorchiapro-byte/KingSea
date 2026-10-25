// Attribution des logements : une cabine privée par joueur, jamais deux joueurs dans la même.
// Logique pure : en local, le registre ne contient que le joueur ; en multijoueur, le serveur
// exécutera exactement ce code avec la liste des cabines déjà prises (source de vérité unique).

export const CABIN_IDS: string[] = Array.from({ length: 20 }, (_, i) => String(301 + i));

/** Hachage FNV-1a 32 bits : même joueur → même cabine préférée, répartition homogène. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class CabinRegistry {
  private byCabin = new Map<string, string>();
  private byPlayer = new Map<string, string>();

  constructor(private ids: string[] = CABIN_IDS) {}

  /** Restaure une attribution existante (sauvegarde / base de données). Refuse les conflits. */
  restore(playerId: string, cabinId: string): boolean {
    if (!this.ids.includes(cabinId)) return false;
    const owner = this.byCabin.get(cabinId);
    if (owner && owner !== playerId) return false;
    if (this.byPlayer.has(playerId) && this.byPlayer.get(playerId) !== cabinId) return false;
    this.byCabin.set(cabinId, playerId); this.byPlayer.set(playerId, cabinId);
    return true;
  }

  /** Cabine du joueur ; en attribue une libre si besoin. null si toutes sont prises (prévoir des étages instanciés). */
  assign(playerId: string): string | null {
    const existing = this.byPlayer.get(playerId);
    if (existing) return existing;
    const n = this.ids.length;
    const start = hashString(playerId) % n;
    for (let k = 0; k < n; k++) {
      const id = this.ids[(start + k) % n];
      if (!this.byCabin.has(id)) { this.byCabin.set(id, playerId); this.byPlayer.set(playerId, id); return id; }
    }
    return null;
  }

  release(playerId: string): void {
    const id = this.byPlayer.get(playerId);
    if (!id) return;
    this.byPlayer.delete(playerId); this.byCabin.delete(id);
  }

  ownerOf(cabinId: string): string | undefined { return this.byCabin.get(cabinId); }
  get occupied(): number { return this.byCabin.size; }
}
