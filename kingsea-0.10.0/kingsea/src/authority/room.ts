// Cabine personnalisable, côté autorité : achat de meubles (KSCoins, niveau requis), disposition validée
// (objets possédés, cases libres, pas de chevauchement, passage vers la porte), style de la pièce.
import { FURNITURE_BY_ID, maxCopies, ROOM_STYLES, type FurnitureDef } from '../data/furniture';
import { ensureProgress, missionEvent, type RoomItem } from './progress';
import { AuthError, ledger, obj, type AuthEnv, type AuthState } from './types';

/** Géométrie de l'intérieur de cabine (world/floors/cabinInterior.ts) : 14 × 10 cases, murs en bordure. */
export const ROOM = { w: 14, h: 10 };
/** Cases réservées : porte et son accès, garde-robe, établi d'aménagement, bureau du journal de bord, et les cases
 * devant ces meubles fixes (pour pouvoir toujours s'en servir). */
export const ROOM_FIXED = new Set(['6,9', '7,9', '6,8', '7,8', '11,2', '12,2', '10,2', '1,7', '2,7', '10,3', '11,3', '12,3', '1,8', '2,8']);
/** Hublots (mur du haut) : pas d'objet mural. */
const WINDOWS = new Set(['4,1', '5,1', '8,1', '9,1']);

export function footprint(f: FurnitureDef, it: Pick<RoomItem, 'x' | 'y' | 'rot'>): Array<[number, number]> {
  const w = it.rot ? f.h : f.w, h = it.rot ? f.w : f.h, out: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([it.x + dx, it.y + dy]);
  return out;
}

/** Vérifie une disposition complète ; renvoie un message d'erreur ou null. */
export function checkLayout(placed: RoomItem[], owned: Record<string, number>): string | null {
  const counts: Record<string, number> = {};
  const floorSolid = new Map<string, string>(), floorRug = new Map<string, string>(), wall = new Map<string, string>();
  for (const it of placed) {
    const f = FURNITURE_BY_ID.get(it.item);
    if (!f) return 'Objet inconnu';
    counts[it.item] = (counts[it.item] ?? 0) + 1;
    if (counts[it.item] > (owned[it.item] ?? 0)) return `${f.name} : tu n’en possèdes pas assez`;
    for (const [x, y] of footprint(f, it)) {
      const k = `${x},${y}`;
      if (f.wall) {
        if (y !== 1 || x < 1 || x > ROOM.w - 2 || WINDOWS.has(k)) return `${f.name} se pose au mur, hors des hublots`;
        if (wall.has(k)) return 'Deux objets au même endroit du mur';
        wall.set(k, it.uid);
        continue;
      }
      if (x < 1 || y < 2 || x > ROOM.w - 2 || y > ROOM.h - 2) return `${f.name} dépasse de la pièce`;
      if (ROOM_FIXED.has(k)) return `${f.name} bloque un passage ou un meuble fixe`;
      const layer = f.category === 'tapis' ? floorRug : floorSolid;
      if (layer.has(k)) return 'Deux objets se chevauchent';
      layer.set(k, it.uid);
    }
  }
  // La porte doit rester accessible depuis toute la pièce : au moins un chemin de cases libres vers (6,8)
  const blocked = new Set([...floorSolid.entries()].filter(([, uid]) => FURNITURE_BY_ID.get(placed.find((p) => p.uid === uid)!.item)?.solid).map(([k]) => k));
  const free = (x: number, y: number) => x >= 1 && y >= 2 && x <= ROOM.w - 2 && y <= ROOM.h - 2 && !blocked.has(`${x},${y}`) && !(['11,2', '12,2', '10,2', '1,7', '2,7'].includes(`${x},${y}`));
  const seen = new Set<string>(['6,8']), queue: Array<[number, number]> = [[6, 8]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      const k = `${nx},${ny}`;
      if (!seen.has(k) && free(nx, ny)) { seen.add(k); queue.push([nx, ny]); }
    }
  }
  let freeCount = 0;
  for (let y = 2; y <= ROOM.h - 2; y++) for (let x = 1; x <= ROOM.w - 2; x++) if (free(x, y)) freeCount++;
  if (seen.size < freeCount) return 'Un meuble enferme une partie de la pièce : laisse un passage';
  return null;
}

export function roomAction(s: AuthState, action: string, rawInput: unknown, reqId: string, env: AuthEnv): { view: Record<string, unknown>; stake: number; payout: number; done: boolean } {
  ensureProgress(s);
  const input = obj(rawInput), room = s.room, level = s.progress.level;
  switch (action) {
    case 'room-buy': {
      const f = FURNITURE_BY_ID.get(String(input.item));
      if (!f) throw new AuthError('Objet inconnu');
      if (f.reward || f.price <= 0) throw new AuthError('Cet objet se gagne (niveau ou mission)');
      if (level < f.level) throw new AuthError(`Disponible au niveau ${f.level}`);
      if ((room.owned[f.id] ?? 0) >= maxCopies(f)) throw new AuthError('Tu possèdes déjà le maximum de cet objet');
      ledger.spend(s, f.price, `room:${f.id}:${reqId}`);
      room.owned[f.id] = (room.owned[f.id] ?? 0) + 1;
      missionEvent(s, 'room', env);
      return { view: { item: f.id, owned: room.owned[f.id], room }, stake: f.price, payout: 0, done: true };
    }
    case 'room-layout': {
      if (!Array.isArray(input.placed) || input.placed.length > 60) throw new AuthError('Disposition invalide');
      const placed: RoomItem[] = input.placed.map((p, i) => {
        const o = obj(p);
        const x = o.x, y = o.y;
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) throw new AuthError('Position invalide');
        return { uid: typeof o.uid === 'string' && o.uid.length < 12 ? o.uid : `n${i}`, item: String(o.item), x, y, rot: o.rot === 1 ? 1 : 0 };
      });
      const err = checkLayout(placed, room.owned);
      if (err) throw new AuthError(err);
      const style = typeof input.style === 'string' ? input.style : room.style;
      const st = ROOM_STYLES.find((x) => x.id === style);
      if (!st) throw new AuthError('Style inconnu');
      if (st.level > level && !s.progress.unlocks.includes(`style:${st.id}`)) throw new AuthError(`Style ${st.name} : niveau ${st.level}`);
      // Nombre de changements (pour les missions), comparé à la disposition précédente
      const key = (p: RoomItem) => `${p.item}@${p.x},${p.y},${p.rot}`;
      const before = new Set(room.placed.map(key));
      let changes = placed.filter((p) => !before.has(key(p))).length + (style !== room.style ? 1 : 0);
      changes += Math.max(0, room.placed.length - placed.length);
      room.placed = placed.map((p, i) => ({ ...p, uid: p.uid || `r${room.nextUid + i}` }));
      room.nextUid += placed.length;
      room.style = style;
      if (changes > 0) missionEvent(s, 'room', env, Math.min(5, changes));
      return { view: { room, changes }, stake: 0, payout: 0, done: true };
    }
  }
  throw new AuthError('Action inconnue');
}
