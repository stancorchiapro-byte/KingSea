// Commissaire de bord : achats au bar, cadeau de bienvenue, objets trouvés, roue du jour, récompenses des
// jeux d'arcade (plafonnées), drapeaux de progression et statistiques. Exécuté par l'autorité.
import { MENUS, SNACK_ITEMS, VIP_DRINKS } from '../data/drinks';
import { consumableId, ITEMS_BY_ID } from '../data/items';
import { addItem, consume, exchange, tickNeeds, useItem, wake } from './economy';
import { pickSegment, WHEEL_SEGMENTS } from '../games/logic/wheel';
import { claimMission, ensureProgress, missionEvent, onArcade, onVisit, refreshMissions } from './progress';
import { amount, AuthError, incStat, ledger, obj, type AuthEnv, type AuthState } from './types';

export const RECEPTION_GIFT = 100;
export const DAILY_REWARD_CAP = 120;
export const COLLECTIBLES: Record<string, number> = { 'golden-compass': 75 };

/** Récompense de chaque jeu d'arcade, calculée par l'autorité à partir du score (jamais fournie par le joueur),
 *  avec le score maximal plausible (au-delà, le score est refusé). */
export const ARCADE: Record<string, { better: 'high' | 'low'; min: number; max: number; reward: (score: number) => number }> = {
  bowling: { better: 'high', min: 0, max: 300, reward: (s) => Math.floor(s / 5) },
  billiards: { better: 'low', min: 3, max: 400, reward: (s) => Math.max(10, Math.min(60, 90 - s * 2)) },
  basket: { better: 'high', min: 0, max: 400, reward: (s) => Math.floor(s / 3) },
  football: { better: 'high', min: 0, max: 10, reward: (s) => s * 2 + (s >= 8 ? 5 : 0) },
  skeeball: { better: 'high', min: 0, max: 900, reward: (s) => Math.floor(s / 25) },
  mole: { better: 'high', min: 0, max: 150, reward: (s) => Math.floor(s / 2) },
  pinball: { better: 'high', min: 0, max: 5_000_000, reward: (s) => Math.floor(s / 500) },
};

const FLAG_KEYS = new Set(['engine.lights', 'cabin.dim', 'profile.done']);
const STAT_KEYS = /^(emote\.(wave|clap|dance|heart)|greetings|naps|slides|swims)$/;

export interface PurserResult { view: Record<string, unknown>; stake: number; payout: number; done: boolean }

export function purserAction(s: AuthState, action: string, rawInput: unknown, reqId: string, env: AuthEnv): PurserResult {
  const input = obj(rawInput);
  switch (action) {
    case 'buy': {
      const menu = typeof input.menu === 'string' ? MENUS[input.menu] ?? null : null;
      if (menu === VIP_DRINKS) { ensureProgress(s); if (!s.progress.unlocks.includes('feature:vip-lounge')) throw new AuthError('Réservé au salon VIP (niveau 5)'); }
      const item = menu?.find((d) => d.id === input.id);
      if (!item) throw new AuthError('Article inconnu');
      // L'article va dans l'inventaire ; « consume » : consommé aussitôt (commande au comptoir)
      const def = ITEMS_BY_ID.get(consumableId(item))!;
      ledger.spend(s, item.price, `buy:${item.id}:${reqId}`);
      addItem(s, def, 1);
      incStat(s, menu === SNACK_ITEMS ? 'snacksOrdered' : 'drinksOrdered');
      missionEvent(s, 'buy', env);
      const eaten = input.consume === true ? consume(s, def.id) : null;
      return { view: { id: item.id, item: def.id, price: item.price, consumed: eaten }, stake: item.price, payout: 0, done: true };
    }
    case 'shop-buy': {
      // Boutique KS : vêtements, accessoires, objets utilisables et cosmétiques
      const def = typeof input.item === 'string' ? ITEMS_BY_ID.get(input.item) : undefined;
      if (!def || def.price <= 0 || def.type === 'food' || def.type === 'drink') throw new AuthError('Article indisponible en boutique');
      ensureProgress(s);
      if ((def.level ?? 1) > s.progress.level) throw new AuthError(`Disponible au niveau ${def.level}`);
      if (def.slot && s.progress.unlocks.includes(def.id)) throw new AuthError('Tu possèdes déjà cet article');
      ledger.spend(s, def.price, `shop:${def.id}:${reqId}`);
      addItem(s, def, 1);
      incStat(s, 'shopBought');
      missionEvent(s, 'buy', env);
      return { view: { item: def.id, price: def.price }, stake: def.price, payout: 0, done: true };
    }
    case 'consume': {
      const r = consume(s, input.item);
      return { view: r, stake: 0, payout: 0, done: true };
    }
    case 'use': {
      const r = useItem(s, input.item);
      return { view: r, stake: 0, payout: 0, done: true };
    }
    case 'exchange': {
      const r = exchange(s, input.dir, input.amount, reqId);
      return { view: { dir: input.dir, ...r }, stake: 0, payout: 0, done: true };
    }
    case 'needs': {
      const r = tickNeeds(s, input.seconds, env);
      return { view: r, stake: 0, payout: 0, done: true };
    }
    case 'wake': {
      wake(s, env);
      return { view: { woke: true }, stake: 0, payout: 0, done: true };
    }
    case 'gift': {
      const tx = 'gift:welcome';
      if (ledger.has(s, tx)) return { view: { granted: 0, already: true }, stake: 0, payout: 0, done: true };
      ledger.earn(s, RECEPTION_GIFT, tx);
      s.flags['gift.received'] = true;
      return { view: { granted: RECEPTION_GIFT }, stake: 0, payout: RECEPTION_GIFT, done: true };
    }
    case 'find': {
      const id = String(input.id), reward = COLLECTIBLES[id];
      if (reward === undefined) throw new AuthError('Objet inconnu');
      if (s.flags[`found.${id}`]) return { view: { granted: 0, already: true }, stake: 0, payout: 0, done: true };
      s.flags[`found.${id}`] = true;
      ledger.earn(s, reward, `find:${id}`);
      return { view: { granted: reward }, stake: 0, payout: reward, done: true };
    }
    case 'wheel': {
      if (s.dailyRewards.lastWheelDay === env.day) throw new AuthError('Roue déjà utilisée aujourd’hui');
      const index = pickSegment(env.rng), coins = WHEEL_SEGMENTS[index].coins;
      s.dailyRewards.lastWheelDay = env.day;
      ledger.earn(s, coins, `wheel:${env.day}`);
      incStat(s, 'plays.wheel');
      missionEvent(s, 'wheel', env);
      return { view: { index, coins }, stake: 0, payout: coins, done: true };
    }
    case 'arcade': {
      const game = String(input.game), rule = ARCADE[game];
      if (!rule) throw new AuthError('Jeu inconnu');
      const score = input.score;
      if (typeof score !== 'number' || !Number.isInteger(score) || score < rule.min || score > rule.max) throw new AuthError('Score refusé');
      const plays = (s.stats[`plays.${game}`] ?? 0) + 1;
      s.stats[`plays.${game}`] = plays;
      const prev = s.stats[`best.${game}`];
      const newBest = prev === undefined || (rule.better === 'high' ? score > prev : score < prev);
      if (newBest) s.stats[`best.${game}`] = score;
      const key = `earned.${game}.${env.day}`, already = s.stats[key] ?? 0;
      const granted = Math.min(Math.max(0, rule.reward(score)), Math.max(0, DAILY_REWARD_CAP - already));
      if (granted > 0) { ledger.earn(s, granted, `reward:${game}:${env.day}:${plays}`); s.stats[key] = already + granted; }
      for (const k of Object.keys(s.stats)) if (k.startsWith(`earned.${game}.`) && k !== key) delete s.stats[k];
      onArcade(s, game, newBest, env);
      return { view: { granted, newBest, best: s.stats[`best.${game}`], plays, capReached: (s.stats[key] ?? 0) >= DAILY_REWARD_CAP }, stake: 0, payout: granted, done: true };
    }
    case 'flag': {
      const key = String(input.key);
      if (!FLAG_KEYS.has(key)) throw new AuthError('Drapeau non modifiable');
      s.flags[key] = input.value === true;
      return { view: { key, value: s.flags[key] }, stake: 0, payout: 0, done: true };
    }
    case 'stat': {
      const key = String(input.key);
      if (!STAT_KEYS.test(key)) throw new AuthError('Statistique non modifiable');
      const by = input.by === undefined ? 1 : amount(input.by, 20);
      incStat(s, key, by);
      if (key.startsWith('emote.') || key === 'greetings') missionEvent(s, 'emote', env, by);
      if (key === 'swims') missionEvent(s, 'swim', env, by);
      return { view: { key, value: s.stats[key] }, stake: 0, payout: 0, done: true };
    }
    case 'visit': {
      const r = onVisit(s, String(input.place), env);
      return { view: { place: input.place, first: r.first, xp: r.gained }, stake: 0, payout: 0, done: true };
    }
    case 'missions': {
      ensureProgress(s);
      return { view: { missions: refreshMissions(s, env, env.seed, env.online) }, stake: 0, payout: 0, done: true };
    }
    case 'mission-claim': {
      const r = claimMission(s, String(input.id), env);
      return { view: { id: input.id, coins: r.coins, xp: r.xp.gained, item: r.item ?? null }, stake: 0, payout: r.coins, done: true };
    }
    case 'title': {
      ensureProgress(s);
      const t = input.title === null ? null : String(input.title);
      if (t !== null && !s.progress.unlocks.includes(`title:${t}`)) throw new AuthError('Titre non débloqué');
      s.progress.title = t;
      return { view: { title: t }, stake: 0, payout: 0, done: true };
    }
  }
  throw new AuthError('Action inconnue');
}
