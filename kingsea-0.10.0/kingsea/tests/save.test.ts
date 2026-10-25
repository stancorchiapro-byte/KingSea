import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage, SaveService, SAVE_KEY } from '../src/systems/SaveService.ts';
import { migrate, STARTING_COINS } from '../src/systems/PlayerData.ts';

test('nouvelle partie avec les valeurs par défaut', () => {
  const s = new SaveService(new MemoryStorage());
  assert.equal(s.data.wallet.balance, STARTING_COINS);
  assert.equal(s.data.location.floorId, 'hub');
  assert.match(s.data.playerId, /^ks-[a-z0-9]{12}$/);
});

test('aller-retour sauvegarde / chargement', () => {
  const store = new MemoryStorage();
  const a = new SaveService(store);
  a.data.wallet.balance = 321; a.data.flags['engine.lights'] = true; a.data.location.floorId = 'engine';
  assert.equal(a.saveNow(), true);
  const b = new SaveService(store);
  assert.equal(b.data.wallet.balance, 321);
  assert.equal(b.data.flags['engine.lights'], true);
  assert.equal(b.data.location.floorId, 'engine');
  assert.equal(b.data.playerId, a.data.playerId);
});

test('sauvegarde corrompue : copie conservée et nouvelle partie', () => {
  const store = new MemoryStorage();
  store.set(SAVE_KEY, '{pas du json');
  const s = new SaveService(store);
  assert.equal(s.recoveredFromCorruption, true);
  assert.equal(s.data.wallet.balance, STARTING_COINS);
  assert.ok([...store.data.keys()].some((k) => k.startsWith(`${SAVE_KEY}.corrupt.`)));
});

test('migration : champs manquants complétés, valeurs aberrantes corrigées', () => {
  const d = migrate({ playerId: 'ks-abc', wallet: { balance: -50 }, settings: { sfxVolume: 7, lowFx: 'oui' }, flags: { a: true, b: 'x' } });
  assert.equal(d.playerId, 'ks-abc');
  assert.equal(d.wallet.balance, 0);
  assert.equal(d.settings.sfxVolume, 1);
  assert.equal(d.settings.lowFx, false);
  assert.deepEqual(d.flags, { a: true });
  assert.equal(d.location.floorId, 'hub');
});

test("échec d'écriture signalé sans planter", () => {
  const broken = { get: () => null, set: () => { throw new Error('QuotaExceeded'); } };
  const s = new SaveService(broken);
  assert.equal(s.saveNow(), false);
  assert.match(String(s.lastError), /Quota/);
});

test('migration : couleur de cabine bornée', () => {
  assert.equal(migrate({ cabin: { id: '305', wallColor: 9 } }).cabin.wallColor, 3);
  assert.equal(migrate({ cabin: { id: '305' } }).cabin.wallColor, 0);
  assert.equal(migrate({}).cabin.id, null);
});
