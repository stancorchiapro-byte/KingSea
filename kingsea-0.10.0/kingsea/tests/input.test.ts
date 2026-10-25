import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStick, knobOffset } from '../src/ui/joystickMath.ts';
import { InteractionSystem, type Interactable } from '../src/interaction/InteractionSystem.ts';

test('zone morte du joystick', () => {
  assert.deepEqual(computeStick(3, 2, 50), { x: 0, y: 0, mag: 0 });
});

test('joystick borné à 1 et direction conservée', () => {
  const s = computeStick(200, 0, 50);
  assert.equal(s.mag, 1); assert.equal(s.x, 1); assert.equal(s.y, 0);
  const d = computeStick(-30, -30, 50);
  assert.ok(d.x < 0 && d.y < 0 && Math.abs(d.x - d.y) < 1e-9);
});

test('le knob ne sort pas de la base', () => {
  const k = knobOffset(0, 120, 50);
  assert.equal(k.y, 50);
});

const it = (key: string, x: number, y: number, r = 40): Interactable => ({ key, handler: key, label: key, x, y, radius: r, hit: { x: x - 16, y: y - 32, w: 32, h: 32 }, enabled: true });

test('interaction : cible la plus proche à portée seulement', () => {
  const s = new InteractionSystem();
  s.set([it('bar', 100, 100), it('lift', 160, 100)]);
  assert.equal(s.update(110, 100)?.key, 'bar');
  assert.equal(s.update(150, 100)?.key, 'lift');
  assert.equal(s.update(400, 400), null);
});

test('interaction : objet désactivé ignoré, toucher direct à portée', () => {
  const s = new InteractionSystem();
  const hidden = { ...it('compass', 100, 100), enabled: false };
  s.set([hidden, it('bar', 300, 100)]);
  assert.equal(s.update(100, 100), null);
  assert.equal(s.pickAt(300, 90, 310, 100)?.key, 'bar');
  assert.equal(s.pickAt(300, 90, 600, 600), null);
  assert.equal(s.hitTest(300, 90)?.key, 'bar');
});
