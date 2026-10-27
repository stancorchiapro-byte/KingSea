// Refonte du casino : présentation des résultats (paliers, cycle de vie) et trajectoire de la roulette.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winTier, ResultFx } from '../src/games/ResultFx';
import { pocketAngle, rouletteBall } from '../src/games/RouletteGame';
import { WHEEL_ORDER } from '../src/games/logic/roulette';

test('paliers de gain : selon le gain net et le multiple de la mise', () => {
  assert.equal(winTier(5, 10), 0);
  assert.equal(winTier(30, 10), 1);     // ×3 la mise
  assert.equal(winTier(100, 100), 1);   // 100 jetons nets
  assert.equal(winTier(500, 100), 2);
  assert.equal(winTier(100, 10), 2);    // ×10
  assert.equal(winTier(2000, 1000), 3);
  assert.equal(winTier(500, 10), 3);    // ×50
});

test('bannière : active après show, s’efface d’elle-même, sans particules en perte', () => {
  const fx = new ResultFx();
  const area = { x: 0, y: 0, w: 800, h: 400 };
  assert.equal(fx.show(-10, 10, 'perdu'), 0);
  assert.ok(fx.active);
  for (let i = 0; i < 300; i++) fx.update(1 / 60, area);
  assert.ok(!fx.active, 'perte : disparaît après ~2 s');
  fx.show(5000, 10);
  assert.ok(fx.active);
  for (let i = 0; i < 600; i++) fx.update(1 / 60, area);
  assert.ok(!fx.active, 'jackpot : disparaît une fois l’animation et les jetons retombés');
  fx.show(50, 10); fx.clear();
  assert.ok(!fx.active);
});

test('roulette : la bille finit exactement au centre de la case tirée, quelle que soit la rotation', () => {
  const TAU = Math.PI * 2;
  for (const n of WHEEL_ORDER) {
    for (const rot of [0, 1.3, 5.9, 123.4]) {
      const relEnd = pocketAngle(n), rel0 = relEnd + TAU * 9 + 0.7;
      const end = rouletteBall(1, rel0, relEnd, rot);
      const diff = ((end.a - rot - relEnd) % TAU + TAU) % TAU;
      assert.ok(diff < 1e-9 || TAU - diff < 1e-9, `numéro ${n}`);
      assert.ok(Math.abs(end.r - 0.62) < 1e-9);
      // Au départ, la bille est sur la piste extérieure
      assert.equal(rouletteBall(0, rel0, relEnd, rot).r, 0.93);
    }
  }
});

test('roulette : la bille tourne en sens inverse de la roue (angle relatif décroissant)', () => {
  const relEnd = pocketAngle(17), rel0 = relEnd + Math.PI * 18;
  let prev = Infinity;
  for (let p = 0; p <= 0.5; p += 0.05) { const a = rouletteBall(p, rel0, relEnd, 0).a; assert.ok(a < prev); prev = a; }
});
