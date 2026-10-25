// Progression (niveaux, XP plafonnée, récompenses), missions (périodes, réclamation unique) et cabine
// (achats, disposition validée), exécutées par l'autorité. Migration des anciennes sauvegardes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_ACTIVITY_XP, DAILY_GAME_XP, handle, isoWeek, levelForXp, levelProgress, MISSION_BY_ID, pickMissions, rewardFor, xpForLevel, checkLayout,
  type AuthEnv, type AuthState,
} from '../src/authority/index';
import { migrate, SAVE_VERSION } from '../src/systems/PlayerData';

function lcg(seed: number) { let s = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const fresh = (balance = 5000): AuthState => ({ wallet: { balance, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {} });
let n = 0;
const env = (over: Partial<AuthEnv> = {}): AuthEnv => ({ rng: lcg(n), now: 1_000_000 + n * 1000, day: '2026-10-23', seed: 'joueur-1', ...over });
const ask = (s: AuthState, kind: 'casino' | 'purser', game: string, action: string, input: unknown, e: Partial<AuthEnv> = {}) => handle(s, { kind, game, action, input, id: `p${++n}x` }, env(e));

test('courbe de niveaux : croissante, réciproque, barre de progression cohérente', () => {
  let prev = -1;
  for (let l = 1; l <= 50; l++) { const x = xpForLevel(l); assert.ok(x > prev); prev = x; assert.equal(levelForXp(x), l); if (l > 1) assert.equal(levelForXp(x - 1), l - 1); }
  const p = levelProgress(xpForLevel(5) + 30);
  assert.equal(p.level, 5); assert.equal(p.into, 30); assert.ok(p.ratio > 0 && p.ratio < 1);
});

test('XP d’activité plafonnée : impossible de « farmer » en répétant la même manche', () => {
  const s = fresh(100_000);
  let total = 0;
  for (let i = 0; i < 60; i++) { const r = ask(s, 'casino', 'plinko', 'play', { bet: 1 }); assert.ok(r.ok); total += r.ok ? r.prog!.gainedXp : 0; }
  // 30 XP de première découverte + 120 XP au plus pour ce jeu aujourd'hui
  assert.equal(total, 30 + DAILY_GAME_XP);
  for (const g of ['keno', 'direct-poker', 'slots', 'craps', 'baccarat']) {
    for (let i = 0; i < 30; i++) {
      const input = g === 'keno' ? { picks: [1, 2], bet: 1 } : g === 'slots' ? { machine: 'pirates', bet: 1 } : g === 'craps' ? { bets: { pass: 1 } } : g === 'baccarat' ? { bets: { banker: 1 } } : { bet: 1 };
      const r = ask(s, 'casino', g, 'play', input); total += r.ok ? r.prog!.gainedXp : 0;
    }
  }
  assert.equal(s.progress!.xpToday, DAILY_ACTIVITY_XP, 'plafond quotidien global atteint');
  // Le lendemain, l'activité rapporte de nouveau
  const r = ask(s, 'casino', 'plinko', 'play', { bet: 1 }, { day: '2026-10-24' });
  assert.ok(r.ok && r.prog!.gainedXp > 0);
});

test('montée de niveau : KSCoins et déblocages versés une seule fois', () => {
  const s = fresh(0);
  ask(s, 'purser', 'purser', 'missions', {});
  // Découvertes des lieux : 50 XP chacune, une seule fois
  const before = s.wallet.balance;
  let ups: number[] = [];
  for (const place of ['hub', 'casino', 'arcade']) { const r = ask(s, 'purser', 'purser', 'visit', { place }); assert.ok(r.ok); ups = ups.concat(r.ok ? r.prog!.levelUps : []); }
  const again = ask(s, 'purser', 'purser', 'visit', { place: 'hub' });
  assert.ok(again.ok && again.prog!.gainedXp === 0, 'deuxième visite : pas d’XP');
  assert.deepEqual(ups, [2]);
  assert.equal(s.wallet.balance, before + (rewardFor(2).coins ?? 0));
  assert.ok(s.progress!.unlocks.includes('furn:lamp-deco'));
  assert.equal(s.room!.owned['lamp-deco'], 1, 'meuble de récompense ajouté à la cabine');
  assert.equal(ask(s, 'purser', 'purser', 'visit', { place: 'lune' }).ok, false);
});

test('missions : tirage stable, progression mesurée, réclamation unique, expiration', () => {
  assert.deepEqual(pickMissions('daily', '2026-10-23', 'a', false), pickMissions('daily', '2026-10-23', 'a', false));
  assert.equal(new Set(pickMissions('daily', '2026-10-23', 'a', false)).size, 3);
  assert.ok(pickMissions('weekly', '2026-W43', 'a', false).every((id) => !MISSION_BY_ID.get(id)!.online), 'hors ligne : pas de mission sociale');
  const s = fresh(10_000);
  // On cherche une graine qui propose « Joue 5 manches »
  let seed = 0;
  while (!pickMissions('daily', '2026-10-23', `g${seed}`, false).includes('d.rounds')) seed++;
  const e = { seed: `g${seed}` };
  ask(s, 'purser', 'purser', 'missions', {}, e);
  assert.equal(ask(s, 'purser', 'purser', 'mission-claim', { id: 'd.rounds' }, e).ok, false, 'pas encore terminée');
  for (let i = 0; i < 5; i++) ask(s, 'casino', 'plinko', 'play', { bet: 1 }, e);
  const mp = s.missions!.daily.find((m) => m.id === 'd.rounds')!;
  assert.equal(mp.progress, 5);
  const b0 = s.wallet.balance;
  const c = ask(s, 'purser', 'purser', 'mission-claim', { id: 'd.rounds' }, e);
  assert.ok(c.ok); assert.equal(s.wallet.balance, b0 + 60 + (c.ok ? c.prog!.levelUps.reduce((t, l) => t + (rewardFor(l).coins ?? 0), 0) : 0));
  assert.equal(ask(s, 'purser', 'purser', 'mission-claim', { id: 'd.rounds' }, e).ok, false, 'jamais deux fois');
  // Nouveau jour : nouvelles missions, l'ancienne ne peut plus être réclamée
  ask(s, 'purser', 'purser', 'missions', {}, { ...e, day: '2026-10-24' });
  assert.equal(s.missions!.day, '2026-10-24');
  assert.ok(s.missions!.daily.every((m) => m.progress === 0 && !m.claimed));
});

test('missions « différents » : chaque jeu ne compte qu’une fois', () => {
  const s = fresh(10_000);
  let seed = 0;
  while (!pickMissions('daily', '2026-10-23', `v${seed}`, false).includes('d.variety')) seed++;
  const e = { seed: `v${seed}` };
  for (let i = 0; i < 4; i++) ask(s, 'casino', 'plinko', 'play', { bet: 1 }, e);
  assert.equal(s.missions!.daily.find((m) => m.id === 'd.variety')!.progress, 1);
  ask(s, 'casino', 'keno', 'play', { picks: [3], bet: 1 }, e);
  ask(s, 'casino', 'slots', 'play', { machine: 'pirates', bet: 1 }, e);
  assert.equal(s.missions!.daily.find((m) => m.id === 'd.variety')!.progress, 3);
});

test('semaines ISO (réinitialisation hebdomadaire)', () => {
  assert.equal(isoWeek('2026-01-01'), '2026-W01');
  assert.equal(isoWeek('2025-12-29'), '2026-W01');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(isoWeek('2026-10-23'), '2026-W43');
  assert.equal(isoWeek('2026-10-25'), '2026-W43', 'dimanche : même semaine');
  assert.equal(isoWeek('2026-10-26'), '2026-W44', 'lundi : nouvelle semaine');
});

test('cabine : achat (niveau, solde, exemplaires), disposition validée, style verrouillé', () => {
  const s = fresh(1000);
  assert.equal(ask(s, 'purser', 'purser', 'room-buy', { item: 'sofa-grey' }).ok, false, 'niveau 2 requis');
  assert.equal(ask(s, 'purser', 'purser', 'room-buy', { item: 'piano' }).ok, false, 'récompense de niveau, pas achetable');
  const r = ask(s, 'purser', 'purser', 'room-buy', { item: 'plant-small' });
  assert.ok(r.ok); assert.equal(s.room!.owned['plant-small'], 2); assert.equal(s.wallet.balance, 1000 - 30);
  for (let i = 0; i < 2; i++) ask(s, 'purser', 'purser', 'room-buy', { item: 'plant-small' });
  assert.equal(s.room!.owned['plant-small'], 4);
  assert.equal(ask(s, 'purser', 'purser', 'room-buy', { item: 'plant-small' }).ok, false, '4 exemplaires au plus');
  const poor = fresh(10);
  assert.equal(ask(poor, 'purser', 'purser', 'room-buy', { item: 'table-teak' }).ok, false, 'solde insuffisant');
  assert.equal(poor.wallet.balance, 10);
  // Disposition
  const placed = s.room!.placed.map((p) => ({ ...p }));
  const ok = ask(s, 'purser', 'purser', 'room-layout', { placed: [...placed, { item: 'plant-small', x: 8, y: 8, rot: 0 }], style: 'marin' });
  assert.ok(ok.ok, ok.ok ? '' : ok.error);
  assert.equal(s.room!.placed.length, placed.length + 1);
  const layout = (extra: object) => ask(s, 'purser', 'purser', 'room-layout', { placed: [...placed, extra], style: 'marin' });
  assert.equal(layout({ item: 'plant-small', x: 1, y: 2, rot: 0 }).ok, false, 'chevauche le lit');
  assert.equal(layout({ item: 'plant-small', x: 6, y: 8, rot: 0 }).ok, false, 'devant la porte');
  assert.equal(layout({ item: 'plant-small', x: 13, y: 4, rot: 0 }).ok, false, 'dans le mur');
  assert.equal(layout({ item: 'piano', x: 4, y: 5, rot: 0 }).ok, false, 'objet non possédé');
  assert.equal(layout({ item: 'painting-sea', x: 4, y: 1, rot: 0 }).ok, false, 'tableau sur un hublot');
  assert.equal(ask(s, 'purser', 'purser', 'room-layout', { placed, style: 'luxe' }).ok, false, 'style luxe : niveau 5');
  // Un mur de meubles qui enferme une partie de la pièce est refusé
  assert.match(String(checkLayout([{ uid: 'a', item: 'bench-oak', x: 1, y: 5, rot: 0 }, { uid: 'b', item: 'bench-oak', x: 3, y: 5, rot: 0 }, { uid: 'c', item: 'bench-oak', x: 5, y: 5, rot: 0 }, { uid: 'd', item: 'bench-oak', x: 7, y: 5, rot: 0 }, { uid: 'e', item: 'bench-oak', x: 9, y: 5, rot: 0 }, { uid: 'f', item: 'bench-oak', x: 11, y: 5, rot: 0 }], { 'bench-oak': 6 })), /passage/);
});

test('refus : la progression et la cabine reviennent à l’identique', () => {
  const s = fresh(1000);
  ask(s, 'purser', 'purser', 'missions', {});
  const before = JSON.stringify({ p: s.progress, r: s.room });
  assert.equal(ask(s, 'purser', 'purser', 'room-layout', { placed: [{ item: 'bed-classic', x: 0, y: 0, rot: 0 }] }).ok, false);
  assert.equal(JSON.stringify({ p: s.progress, r: s.room }), before);
});

test('anciens profils : XP d’ancienneté accordée une fois, ancienne sauvegarde migrée sans perte', () => {
  const s = fresh(777);
  s.stats = { 'plays.roulette': 20, 'plays.blackjack': 10 };
  const r = ask(s, 'purser', 'purser', 'missions', {});
  assert.ok(r.ok);
  assert.equal(s.progress!.xp, 150);
  ask(s, 'purser', 'purser', 'missions', {});
  assert.equal(s.progress!.xp, 150, 'une seule fois');
  // Sauvegarde locale v1 (« perles ») → v2 (KSCoins) : même solde, même partie
  const old = { version: 1, playerId: 'ks-ancien', name: 'Ancien', wallet: { balance: 1234, processedTx: ['wheel:2026-10-01'] }, stats: { 'plays.keno': 3 }, flags: { 'profile.done': true }, cabin: { id: 'C-104', wallColor: 2 } };
  const d = migrate(old);
  assert.equal(d.version, SAVE_VERSION);
  assert.equal(d.wallet.balance, 1234);
  assert.deepEqual(d.wallet.processedTx, ['wheel:2026-10-01']);
  assert.deepEqual(d.economy, { currency: 'KSCoin', migratedFromPearls: true });
  assert.equal(d.cabin.id, 'C-104');
  assert.equal(migrate(d).economy.migratedFromPearls, true, 'migration stable');
  assert.equal(migrate({ version: 2, wallet: { balance: 5 } }).economy.migratedFromPearls, false);
});

test('cosmétiques de récompense : verrouillés sans déblocage, portables une fois débloqués', async () => {
  const { enforceUnlocks, DEFAULT_LOOK, randomLook } = await import('../src/art/characters');
  const { unlockLevel } = await import('../src/authority/progress');
  const look = { ...DEFAULT_LOOK, hat: 'hautdeforme' as const, outfit: 'smoking' as const };
  const locked = enforceUnlocks(look, []);
  assert.equal(locked.hat, 'aucun'); assert.equal(locked.outfit, 'costume');
  const ok = enforceUnlocks(look, ['hat:hautdeforme', 'outfit:smoking']);
  assert.equal(ok.hat, 'hautdeforme'); assert.equal(ok.outfit, 'smoking');
  assert.equal(unlockLevel('hat:hautdeforme'), 4); assert.equal(unlockLevel('outfit:smoking'), 9);
  for (let i = 0; i < 200; i++) assert.notEqual(randomLook().outfit, 'smoking');
});
