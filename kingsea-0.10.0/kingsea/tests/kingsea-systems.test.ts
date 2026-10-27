// Refonte KingSea : niveaux illimités, passe de croisière gratuit, KS Pass Croisière, téléphone, clés et serrurier,
// dons entre amis (limites glissantes de 24 h, objets personnels), accès aux ponts. Exécutés par l'autorité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  floorAccess, giftAllowance, giveGift, GIFT_RULES, handle, KEY_COPY_PRICE, keyOpens, levelForXp, levelProgress, LOCK_CHANGE_PRICE, PASS, rewardFor, xpForLevel, xpToNext,
  type AuthEnv, type AuthState,
} from '../src/authority/index';
import { EMOTES, emoteUnlocked } from '../src/data/emotes';
import { giftable, ITEMS_BY_ID } from '../src/data/items';

function lcg(seed: number) { let s = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const fresh = (balance = 5000, cabin: string | null = null): AuthState => ({ wallet: { balance, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {}, cabin: { id: cabin } });
let n = 0;
const env = (over: Partial<AuthEnv> = {}): AuthEnv => ({ rng: lcg(n), now: 1_000_000 + n * 1000, day: '2026-10-23', seed: 'joueur-1', ...over });
const ask = (s: AuthState, action: string, input: unknown = {}, e: Partial<AuthEnv> = {}) => handle(s, { kind: 'purser', game: 'purser', action, input, id: `t${++n}x` }, env(e));

test('niveaux sans limite : courbe croissante, forme close exacte, grands niveaux atteignables mais lents', () => {
  // Forme close identique à la somme des paliers
  let sum = 0;
  for (let l = 1; l <= 400; l++) { assert.equal(xpForLevel(l), sum, `niveau ${l}`); sum += xpToNext(l); }
  for (const l of [1, 2, 10, 11, 50, 51, 99, 100, 250, 1000]) { assert.equal(levelForXp(xpForLevel(l)), l); assert.equal(levelForXp(xpForLevel(l) - 1), Math.max(1, l - 1)); }
  assert.ok(levelForXp(1e12) > 1000, 'pas de plafond');
  assert.ok(Number.isFinite(xpForLevel(100_000)), 'aucun débordement');
  // Les dix premiers niveaux gardent l'ancienne courbe ; ensuite elle s'accentue
  assert.equal(xpToNext(5), 80 + 40 * 5);
  assert.ok(xpToNext(50) > 3 * xpToNext(10));
  const p = levelProgress(xpForLevel(60) + 10);
  assert.equal(p.level, 60); assert.equal(p.into, 10); assert.equal(p.needed, xpToNext(60));
});

test('récompenses de niveau : KSCoins, jetons, émotes, titres, prestige ; toujours définies', () => {
  assert.ok(rewardFor(3).chips! > 0);
  assert.ok(rewardFor(10).unlocks!.includes('feature:panorama'));
  assert.ok(rewardFor(12).unlocks!.includes('emote:spyglass'));
  assert.deepEqual(rewardFor(55), { coins: 150, chips: 100 });
  assert.ok(rewardFor(75).unlocks!.some((u) => u.startsWith('badge:Prestige')));
  assert.equal(rewardFor(61).coins, 50);
  // Chaque émote verrouillée par le niveau est réellement distribuée par un palier
  for (const e of EMOTES.filter((x) => x.level)) {
    const lv = e.level!;
    assert.ok(rewardFor(lv).unlocks?.includes(`emote:${e.id}`), `émote ${e.id} au niveau ${lv}`);
  }
  // … et chaque émote du passe par un palier du passe
  for (const e of EMOTES.filter((x) => x.pass)) assert.ok(PASS.tiers.some((t) => t.unlock === `emote:${e.id}`), `émote ${e.id} dans le passe`);
});

test('montée de niveau : jetons versés une seule fois avec les KSCoins', () => {
  const s = fresh(0);
  const r = ask(s, 'mission-claim', { id: 'inconnue' });
  assert.ok(!r.ok);
  // XP de découverte jusqu'au niveau 3 (100 jetons au niveau 3)
  for (const place of ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine']) ask(s, 'visit', { place });
  assert.ok(s.progress!.level >= 3);
  const chips0 = s.chips!.balance;
  ask(s, 'visit', { place: 'hub' });
  assert.equal(s.chips!.balance, chips0, 'pas de second versement');
  assert.equal(s.chips!.processedTx.filter((t) => t === 'level:3:jetons').length, 1);
});

test('passe de croisière gratuit : paliers atteints par l’XP, récompense réclamée une seule fois', () => {
  const s = fresh(0);
  for (const place of ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine', 'cabin-interior']) ask(s, 'visit', { place });
  const xp = s.progress!.pass!.xp;
  assert.equal(xp, s.progress!.xp, 'l’XP alimente le passe');
  const tier = Math.floor(xp / PASS.xpPerTier);
  assert.ok(tier >= 1);
  const coins0 = s.wallet.balance;
  const r1 = ask(s, 'pass-claim', { tier: 1 });
  assert.ok(r1.ok);
  assert.equal(s.wallet.balance, coins0 + (PASS.tiers[0].coins ?? 0));
  const r2 = ask(s, 'pass-claim', { tier: 1 });
  assert.ok(!r2.ok && /déjà/.test(r2.error));
  assert.equal(s.wallet.balance, coins0 + (PASS.tiers[0].coins ?? 0), 'pas de double paiement');
  const far = ask(s, 'pass-claim', { tier: PASS.tiers.length });
  assert.ok(!far.ok, 'palier non atteint refusé');
  // Palier 2 : émote débloquée
  if (tier >= 2) { assert.ok(ask(s, 'pass-claim', { tier: 2 }).ok); assert.ok(emoteUnlocked('jackpot', s.progress!.unlocks)); }
  assert.ok(!ask(s, 'pass-claim', { tier: 0 }).ok);
  assert.ok(!ask(s, 'pass-claim', { tier: 1.5 }).ok);
});

test('KS Pass Croisière et téléphone : remis une fois, personnels, reconnus par l’accès aux ponts', () => {
  const s = fresh(0);
  ask(s, 'needs', { seconds: 0 });
  assert.equal(s.inventory!.items.phone, 1, 'téléphone offert');
  assert.equal(floorAccess('casino', s.inventory!.items, []).ok, false, 'sans pass : casino fermé');
  assert.equal(floorAccess('hub', s.inventory!.items, []).ok, true);
  const g1 = ask(s, 'gift');
  assert.ok(g1.ok && g1.view.pass === true);
  assert.equal(s.inventory!.items['ks-pass'], 1);
  const g2 = ask(s, 'gift');
  assert.ok(g2.ok && g2.view.pass === false && g2.view.already === true);
  assert.equal(s.inventory!.items['ks-pass'], 1, 'jamais en double (requêtes répétées)');
  assert.equal(floorAccess('casino', s.inventory!.items, []).ok, true);
  assert.equal(floorAccess('panorama', s.inventory!.items, []).ok, false, 'panorama : niveau requis');
  assert.equal(floorAccess('panorama', s.inventory!.items, ['feature:panorama']).ok, true);
  assert.equal(giftable(ITEMS_BY_ID.get('ks-pass')).ok, false);
  assert.equal(giftable(ITEMS_BY_ID.get('phone')).ok, false);
  // Ancien profil ayant déjà reçu le cadeau : pass remis automatiquement
  const old = fresh(0); old.flags['gift.received'] = true;
  ask(old, 'needs', { seconds: 0 });
  assert.equal(old.inventory!.items['ks-pass'], 1);
  // Boutique : objets spéciaux et exclusifs jamais vendus
  assert.ok(!ask(s, 'shop-buy', { item: 'ks-pass' }).ok);
  assert.ok(!ask(s, 'shop-buy', { item: 'use.fireworks-royal' }).ok);
});

test('clés : principale personnelle, doubles payants, renommage, changement de serrure', () => {
  const s = fresh(1000, '304');
  ask(s, 'gift'); s.wallet.balance = 1000; // clé principale remise à la réception (avec le KS Pass)
  ask(s, 'keys');
  const master = s.keys!.find((k) => k.master)!;
  assert.ok(master && master.cabin === '304' && master.owner === 'joueur-1');
  assert.ok(!ask(s, 'key-rename', { uid: master.uid, name: 'X' }).ok, 'la principale ne se renomme pas');
  const c = ask(s, 'key-copy');
  assert.ok(c.ok);
  assert.equal(s.wallet.balance, 1000 - KEY_COPY_PRICE);
  const copy = s.keys!.find((k) => !k.master)!;
  assert.ok(keyOpens(copy, '304', 'joueur-1', s.keyring!.lock));
  assert.ok(ask(s, 'key-rename', { uid: copy.uid, name: 'Clé de Léa' }).ok);
  assert.equal(s.keys!.find((k) => k.uid === copy.uid)!.name, 'Clé de Léa');
  assert.ok(!ask(s, 'key-rename', { uid: copy.uid, name: '<script>' }).ok, 'nom nettoyé');
  // Double donné à un ami puis serrure changée : le double donné n'ouvre plus
  const friend = fresh(0);
  giveGift(s, friend, { kind: 'key', uid: copy.uid }, 'don-cle', 2_000_000);
  const given = friend.keys!.find((k) => k.uid === copy.uid)!;
  assert.ok(keyOpens(given, '304', 'joueur-1', s.keyring!.lock));
  assert.ok(ask(s, 'lock-change').ok);
  assert.equal(s.wallet.balance, 1000 - KEY_COPY_PRICE - LOCK_CHANGE_PRICE);
  assert.ok(!keyOpens(given, '304', 'joueur-1', s.keyring!.lock), 'ancien double inutilisable');
  assert.equal(s.keys!.find((k) => k.master)!.lock, s.keyring!.lock, 'la principale suit la nouvelle serrure');
  // Pas de cabine : pas de double
  const none = fresh(1000);
  assert.ok(!ask(none, 'key-copy').ok);
  // Solde insuffisant : rien n'est créé
  const poor = fresh(10, '305');
  ask(poor, 'gift'); poor.wallet.balance = 10;
  const k0 = (ask(poor, 'keys'), poor.keys!.length);
  assert.ok(!ask(poor, 'key-copy').ok);
  assert.equal(poor.keys!.length, k0);
});

test('dons de KSCoins : 1 000 au plus par 24 h glissantes, plusieurs petits dons, atomiques et uniques', () => {
  const a = fresh(5000), b = fresh(0);
  const t0 = 10_000_000;
  giveGift(a, b, { kind: 'coins', amount: 400 }, 'g1', t0);
  giveGift(a, b, { kind: 'coins', amount: 500 }, 'g2', t0 + 1000);
  assert.equal(a.wallet.balance, 4100); assert.equal(b.wallet.balance, 900);
  assert.throws(() => giveGift(a, b, { kind: 'coins', amount: 101 }, 'g3', t0 + 2000), /encore donner 100/);
  assert.equal(a.wallet.balance, 4100, 'refus : rien n’est débité');
  giveGift(a, b, { kind: 'coins', amount: 100 }, 'g4', t0 + 3000);
  assert.equal(giftAllowance(a, t0 + 4000).coinsLeft, 0);
  assert.throws(() => giveGift(a, b, { kind: 'coins', amount: 1 }, 'g5', t0 + 4000), /Limite/);
  // Fenêtre glissante : le premier don (400) se libère 24 h après
  const later = t0 + GIFT_RULES.windowMs + 10;
  assert.equal(giftAllowance(a, later).coinsLeft, 400);
  giveGift(a, b, { kind: 'coins', amount: 400 }, 'g6', later);
  // Même requête rejouée : refusée
  assert.throws(() => giveGift(a, b, { kind: 'coins', amount: 10 }, 'g6', later + 1), /déjà/);
  assert.equal(a.wallet.balance + b.wallet.balance, 5000, 'aucune création ni perte');
  const poor = fresh(5);
  assert.throws(() => giveGift(poor, b, { kind: 'coins', amount: 50 }, 'g7', t0), /Pas assez/);
  assert.throws(() => giveGift(a, b, { kind: 'coins', amount: -5 }, 'g8', t0), /invalide/);
  assert.throws(() => giveGift(a, b, { kind: 'coins', amount: 1.5 }, 'g9', t0), /invalide/);
});

test('dons de jetons : restent des jetons, limités par le solde, sans conversion', () => {
  const a = fresh(0), b = fresh(0);
  const t = 5_000_000;
  handle(a, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: 'init-a' }, env());
  handle(b, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: 'init-b' }, env());
  const ca = a.chips!.balance, cb = b.chips!.balance;
  giveGift(a, b, { kind: 'chips', amount: 60 }, 'c1', t);
  assert.equal(a.chips!.balance, ca - 60); assert.equal(b.chips!.balance, cb + 60);
  assert.equal(a.wallet.balance, 0); assert.equal(b.wallet.balance, 0, 'aucun KSCoin créé');
  assert.throws(() => giveGift(a, b, { kind: 'chips', amount: 10_000 }, 'c2', t), /Pas assez/);
  assert.throws(() => giveGift(a, b, { kind: 'chips', amount: 5 }, 'c1', t), /déjà/);
});

test('dons d’objets : 2 par 24 h, valeur ≤ 100, objets personnels refusés, propriété vérifiée', () => {
  const a = fresh(0), b = fresh(0);
  const t = 7_000_000;
  handle(a, { kind: 'purser', game: 'purser', action: 'needs', input: { seconds: 0 }, id: 'ia' }, env());
  a.inventory!.items['use.confetti'] = 3; // 25 KSCoins
  a.inventory!.items['outfit:blazer'] = 1; // 300 KSCoins
  assert.throws(() => giveGift(a, b, { kind: 'item', item: 'phone' }, 'i0', t), /personnel/);
  assert.throws(() => giveGift(a, b, { kind: 'item', item: 'ks-pass' }, 'i0b', t), /personnel/);
  assert.throws(() => giveGift(a, b, { kind: 'item', item: 'outfit:blazer' }, 'i1', t), /100 KSCoins/);
  assert.throws(() => giveGift(a, b, { kind: 'item', item: 'use.fireworks' }, 'i2', t), /absent/);
  giveGift(a, b, { kind: 'item', item: 'use.confetti' }, 'i3', t);
  giveGift(a, b, { kind: 'item', item: 'use.confetti' }, 'i4', t + 10);
  assert.equal(a.inventory!.items['use.confetti'], 1); assert.equal(b.inventory!.items['use.confetti'], 2);
  assert.throws(() => giveGift(a, b, { kind: 'item', item: 'use.confetti' }, 'i5', t + 20), /2 objets/);
  assert.equal(a.inventory!.items['use.confetti'], 1, 'refus : objet conservé');
  assert.equal(giftAllowance(a, t + GIFT_RULES.windowMs + 11).itemsLeft, 2);
  // Clé principale jamais transférable
  const owner = fresh(0, '310');
  handle(owner, { kind: 'purser', game: 'purser', action: 'gift', input: {}, id: 'k' }, env({ seed: 'proprio' }));
  const master = owner.keys!.find((k) => k.master)!;
  assert.throws(() => giveGift(owner, b, { kind: 'key', uid: master.uid }, 'k1', t), /personnelle/);
  assert.ok(owner.keys!.some((k) => k.master), 'la clé principale reste');
});
