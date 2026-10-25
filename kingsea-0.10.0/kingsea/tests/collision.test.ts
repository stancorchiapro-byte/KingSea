import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileMap } from '../src/world/TileMap.ts';
import { TILE } from '../src/world/types.ts';

const rows = ['#####', '#...#', '#...#', '#...#', '#####'];

test('impossible de traverser un mur, même avec un grand déplacement', () => {
  const m = new TileMap(rows);
  const box = { x: TILE * 2, y: TILE * 2, w: 16, h: 9 };
  const r = m.moveBox(box, 500, 0);
  assert.ok(r.hitX);
  assert.ok(r.x + box.w <= TILE * 4 + 0.001);
});

test('glisse le long du mur sur l’autre axe', () => {
  const m = new TileMap(rows);
  const box = { x: TILE * 4 - 16, y: TILE * 2, w: 16, h: 9 };
  const r = m.moveBox(box, 20, 10);
  assert.ok(r.hitX); assert.equal(r.hitY, false);
  assert.ok(Math.abs(r.y - (TILE * 2 + 10)) < 0.01);
});

test('accessoire solide bloquant', () => {
  const m = new TileMap(rows, [{ kind: 'crate', tx: 2, ty: 2, w: 1, h: 1, solid: true }]);
  assert.equal(m.collides({ x: TILE * 2 + 4, y: TILE * 2 + 4, w: 8, h: 8 }), true);
});

test('findFreeSpot sort le joueur d’un obstacle', () => {
  const m = new TileMap(rows, [{ kind: 'crate', tx: 2, ty: 2, w: 1, h: 1, solid: true }]);
  const p = m.findFreeSpot(TILE * 2.5, TILE * 2.9, 16, 9)!;
  assert.ok(p);
  assert.equal(m.collides({ x: p.x - 8, y: p.y - 9, w: 16, h: 9 }), false);
});
