// Économie (jetons, caisse), inventaire, faim/soif et coma : règles de l'autorité (authority/economy.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIP_RATE, handle, NEEDS, WELCOME_CHIPS, type AuthEnv, type AuthState } from '../src/authority/index';
import { migrate } from '../src/systems/PlayerData';

let n = 0;
const env = (now = 1_000_000): AuthEnv => ({ rng: () => 0.5, now, day: '2026-10-24' });
const req = (action: string, input: unknown, id = `e${++n}xx`) => ({ kind: 'purser' as const, game: 'purser', action, input, id });
const fresh = (coins = 500): AuthState => ({ wallet: { balance: coins, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {} });

test('jetons de bienvenue versés une seule fois', () => {
  const s = fresh();
  handle(s, req('needs', { seconds: 0 }), env());
  handle(s, req('needs', { seconds: 0 }), env());
  assert.equal(s.chips!.balance, WELCOME_CHIPS);
  assert.equal(s.wallet.balance, 500, 'les KSCoins ne sont pas touchés');
});

test('caisse : achat, revente, taux appliqué, soldes modifiés ensemble', () => {
  const s = fresh();
  const r = handle(s, req('exchange', { dir: 'buy', amount: 200 }), env());
  assert.ok(r.ok);
  assert.equal(s.wallet.balance, 500 - 200 * CHIP_RATE.coinsPerChip);
  assert.equal(s.chips!.balance, WELCOME_CHIPS + 200);
  const r2 = handle(s, req('exchange', { dir: 'sell', amount: 50 }), env());
  assert.ok(r2.ok);
  assert.equal(s.wallet.balance, 300 + 50 * CHIP_RATE.coinsPerChip);
  assert.equal(s.chips!.balance, WELCOME_CHIPS + 150);
  if (r2.ok) assert.equal(r2.eco!.chips, s.chips!.balance, 'réponse à jour');
});

test('caisse : soldes insuffisants, montants nuls, négatifs, décimaux ou trop grands refusés sans rien modifier', () => {
  const s = fresh(100);
  handle(s, req('needs', { seconds: 0 }), env());
  const before = JSON.stringify([s.wallet, s.chips]);
  for (const input of [{ dir: 'buy', amount: 101 }, { dir: 'sell', amount: WELCOME_CHIPS + 1 }, { dir: 'buy', amount: 0 }, { dir: 'buy', amount: -5 },
    { dir: 'buy', amount: 2.5 }, { dir: 'buy', amount: CHIP_RATE.maxExchange + 1 }, { dir: 'vol', amount: 5 }, { dir: 'buy', amount: '10' }]) {
    const r = handle(s, req('exchange', input), env());
    assert.equal(r.ok, false, JSON.stringify(input));
  }
  assert.equal(JSON.stringify([s.wallet, s.chips]), before);
});

test('caisse : double toucher (même requête deux fois) = un seul échange', () => {
  const s = fresh();
  const q = req('exchange', { dir: 'buy', amount: 100 });
  assert.ok(handle(s, q, env()).ok);
  assert.equal(handle(s, q, env()).ok, false);
  assert.equal(s.wallet.balance, 400);
  assert.equal(s.chips!.balance, WELCOME_CHIPS + 100);
});

test('casino en jetons : mise refusée sans jetons, KSCoins jamais utilisés', () => {
  const s = fresh(5000);
  handle(s, req('exchange', { dir: 'sell', amount: WELCOME_CHIPS }), env());
  assert.equal(s.chips!.balance, 0);
  const r = handle(s, { kind: 'casino', game: 'plinko', action: 'play', input: { bet: 10 }, id: 'pl-1' }, env());
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /jetons/);
  assert.equal(s.wallet.balance, 5000 + WELCOME_CHIPS);
});

test('inventaire : achat au bar, consommation, quantité insuffisante, objet inconnu', () => {
  const s = fresh();
  s.needs = { hunger: 30, thirst: 30, lastTick: 0, coma: null };
  assert.ok(handle(s, req('buy', { menu: 'hub', id: 'club' }), env()).ok);
  assert.equal(s.inventory!.items['food.club'], 1);
  assert.equal(s.wallet.balance, 460);
  const c = handle(s, req('consume', { item: 'food.club' }), env());
  assert.ok(c.ok);
  assert.equal(s.needs!.hunger, 75);
  assert.equal(s.inventory!.items['food.club'], undefined);
  assert.equal(handle(s, req('consume', { item: 'food.club' }), env()).ok, false, 'plus en stock');
  assert.equal(handle(s, req('consume', { item: 'inexistant' }), env()).ok, false);
  // Commande au comptoir consommée aussitôt
  assert.ok(handle(s, req('buy', { menu: 'hub', id: 'lagon', consume: true }), env()).ok);
  assert.equal(s.needs!.thirst, 60);
  assert.equal(s.inventory!.items['drink.lagon'], undefined);
});

test('boutique : vêtement acheté une fois, niveau requis, rien de gratuit', () => {
  const s = fresh(2000);
  assert.ok(handle(s, req('shop-buy', { item: 'hat:fedora' }), env()).ok);
  assert.equal(s.inventory!.items['hat:fedora'], 1);
  assert.equal(handle(s, req('shop-buy', { item: 'hat:fedora' }), env()).ok, false, 'objet unique');
  assert.equal(handle(s, req('shop-buy', { item: 'jewel:chaine' }), env()).ok, false, 'niveau 3 requis');
  assert.equal(handle(s, req('shop-buy', { item: 'food.club' }), env()).ok, false, 'pas une boutique de nourriture');
  assert.equal(s.wallet.balance, 2000 - 140);
});

test('objets utilisables : retirés de l’inventaire, effet renvoyé', () => {
  const s = fresh();
  handle(s, req('shop-buy', { item: 'use.confetti' }), env());
  const u = handle(s, req('use', { item: 'use.confetti' }), env());
  assert.ok(u.ok);
  if (u.ok) assert.equal(u.view.effect, 'confetti');
  assert.equal(handle(s, req('use', { item: 'use.confetti' }), env()).ok, false);
});

test('faim et soif : baisse progressive, durée bornée par le temps réel', () => {
  const s = fresh();
  handle(s, req('needs', { seconds: 60 }), env(1_000_000));
  assert.ok(Math.abs(s.needs!.hunger - (100 - NEEDS.hungerPerMin)) < 1e-9);
  assert.ok(Math.abs(s.needs!.thirst - (100 - NEEDS.thirstPerMin)) < 1e-9);
  // 5 s plus tard, un relevé qui prétend 60 s ne compte que ~7 s
  const t0 = s.needs!.thirst;
  handle(s, req('needs', { seconds: 60 }), env(1_005_000));
  assert.ok(t0 - s.needs!.thirst < (NEEDS.thirstPerMin * 8) / 60);
  // Relevé démesuré : borné
  handle(s, req('needs', { seconds: 99999 }), env(9_000_000));
  assert.ok(s.needs!.thirst > 90);
});

test('coma : déclenché à 0, actions bloquées, réveil après 15 s, aucune donnée perdue', () => {
  const s = fresh(800);
  handle(s, req('exchange', { dir: 'buy', amount: 300 }), env());
  handle(s, req('shop-buy', { item: 'hat:beret' }), env());
  handle(s, req('buy', { menu: 'hub', id: 'eau' }), env());
  const snapshot = JSON.stringify([s.wallet.balance, s.chips!.balance, s.inventory, s.progress?.xp]);
  s.needs = { hunger: 50, thirst: 0.5, lastTick: 0, coma: null };
  const t = handle(s, req('needs', { seconds: 60 }), env(2_000_000));
  assert.ok(t.ok);
  if (t.ok) { assert.equal(t.view.coma, true); assert.ok((t.eco!.needs.coma ?? 0) > 14_000); assert.equal(t.eco!.needs.cause, 'soif'); }
  // Pendant le coma : achats, consommation, casino, caisse refusés
  for (const q of [req('consume', { item: 'drink.eau' }), req('buy', { menu: 'hub', id: 'eau' }), req('exchange', { dir: 'buy', amount: 1 })]) assert.equal(handle(s, q, env(2_001_000)).ok, false);
  assert.equal(handle(s, { kind: 'casino', game: 'plinko', action: 'play', input: { bet: 5 }, id: 'pl-coma' }, env(2_001_000)).ok, false);
  // Réveil trop tôt refusé, puis accepté
  assert.equal(handle(s, req('wake', {}), env(2_005_000)).ok, false);
  assert.ok(handle(s, req('wake', {}), env(2_015_000)).ok);
  assert.equal(s.needs!.coma, null);
  assert.equal(s.needs!.thirst, NEEDS.wakeTo);
  assert.equal(JSON.stringify([s.wallet.balance, s.chips!.balance, s.inventory, s.progress?.xp]), snapshot, 'monnaies, objets et progression intacts');
  assert.equal(s.stats.comas, 1);
});

test('migration : sauvegarde v2 → jetons, inventaire et jauges par défaut, rien de perdu', () => {
  const d = migrate({ version: 2, wallet: { balance: 1234, processedTx: [] }, name: 'Ancien', stats: { 'plays.slots': 3 } });
  assert.equal(d.version, 3);
  assert.equal(d.wallet.balance, 1234);
  assert.deepEqual(d.chips, { balance: 0, processedTx: [] });
  assert.deepEqual(d.inventory, { items: {} });
  assert.equal(d.needs!.hunger, 100); assert.equal(d.needs!.coma, null);
  const bad = migrate({ version: 3, chips: { balance: -50 }, inventory: { items: { 'food.club': 99, faux: 3 } }, needs: { hunger: 400, thirst: 'x' } });
  assert.equal(bad.chips!.balance, 0);
  assert.deepEqual(bad.inventory!.items, { 'food.club': 20 });
  assert.equal(bad.needs!.hunger, 100); assert.equal(bad.needs!.thirst, 100);
});
