import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CABIN_IDS, CabinRegistry } from '../src/systems/Cabins.ts';
import { CABIN_DOORS } from '../src/world/floors/cabins.ts';

test('chaque cabine attribuable a une porte dans le couloir, et inversement', () => {
  assert.deepEqual(CABIN_DOORS.map((d) => d.id).sort(), [...CABIN_IDS].sort());
});

test('un même joueur garde toujours la même cabine', () => {
  const r = new CabinRegistry();
  const a = r.assign('ks-alice');
  assert.ok(a);
  assert.equal(r.assign('ks-alice'), a);
  assert.equal(r.occupied, 1);
});

test('jamais deux joueurs dans la même cabine ; complet = null', () => {
  const r = new CabinRegistry();
  const got = new Set<string>();
  for (let i = 0; i < CABIN_IDS.length; i++) {
    const c = r.assign(`ks-player-${i}`);
    assert.ok(c); assert.ok(!got.has(c!)); got.add(c!);
  }
  assert.equal(got.size, CABIN_IDS.length);
  assert.equal(r.assign('ks-en-trop'), null);
});

test('restauration : refuse une cabine déjà occupée par un autre', () => {
  const r = new CabinRegistry();
  assert.equal(r.restore('ks-a', '305'), true);
  assert.equal(r.restore('ks-b', '305'), false);
  assert.equal(r.restore('ks-a', '999'), false);
  r.release('ks-a');
  assert.equal(r.restore('ks-b', '305'), true);
});
