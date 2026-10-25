// Règles du 8 américain (logic/billiards.ts) et effet de la blanche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySpin, judgeShot, newEightBall, remainingOf } from '../src/games/logic/billiards';

test('casse : rien n’est attribué, la 8 empochée est replacée', () => {
  const s = newEightBall();
  const v = judgeShot(s, { firstHit: 1, potted: [3, 8], scratch: false });
  assert.equal(v.respot8, true);
  assert.deepEqual(s.groups, [null, null]);
  assert.ok(s.onTable.includes(8) && !s.onTable.includes(3));
});

test('attribution des groupes, on rejoue en empochant les siennes, sinon la main passe', () => {
  const s = newEightBall();
  judgeShot(s, { firstHit: 1, potted: [], scratch: false }); // casse vide : main à J2
  assert.equal(s.turn, 1);
  const v = judgeShot(s, { firstHit: 10, potted: [10], scratch: false });
  assert.equal(v.again, true);
  assert.deepEqual(s.groups, ['pleines', 'rayées']);
  assert.equal(s.turn, 1);
  judgeShot(s, { firstHit: 11, potted: [], scratch: false });
  assert.equal(s.turn, 0);
});

test('fautes : blanche, aucune bille, mauvaise bille d’abord → bille en main', () => {
  const s = newEightBall();
  judgeShot(s, { firstHit: 1, potted: [], scratch: false });
  judgeShot(s, { firstHit: 2, potted: [2], scratch: false }); // J2 prend les pleines
  assert.equal(s.groups[1], 'pleines');
  const v = judgeShot(s, { firstHit: 3, potted: [], scratch: false }); // J2 rejoue mais touche… sa bille : pas de faute
  assert.equal(v.foul, null);
  const f = judgeShot(s, { firstHit: 4, potted: [4], scratch: false }); // J1 (rayées) touche une pleine
  assert.match(f.foul!, /Première bille/);
  assert.equal(s.ballInHand, true); assert.equal(s.turn, 1);
  const g = judgeShot(s, { firstHit: null, potted: [], scratch: false });
  assert.equal(g.foul, 'Aucune bille touchée');
  const h = judgeShot(s, { firstHit: 9, potted: [0], scratch: true });
  assert.equal(h.foul, 'Blanche empochée');
});

test('la 8 : défaite si trop tôt, victoire après son groupe', () => {
  const s = newEightBall();
  judgeShot(s, { firstHit: 1, potted: [], scratch: false });
  judgeShot(s, { firstHit: 9, potted: [9], scratch: false });
  const early = judgeShot(s, { firstHit: 10, potted: [8], scratch: false });
  assert.equal(s.winner, 0, 'J2 empoche la 8 trop tôt : J1 gagne');
  assert.match(early.message, /trop tôt/);
  const w = newEightBall();
  judgeShot(w, { firstHit: 1, potted: [], scratch: false });
  judgeShot(w, { firstHit: 1, potted: [1, 2, 3, 4, 5, 6, 7], scratch: false }); // J2 : toutes les pleines
  assert.equal(remainingOf(w, 1), 0);
  judgeShot(w, { firstHit: 8, potted: [8], scratch: false });
  assert.equal(w.winner, 1);
});

test('effet : coulé suit, rétro revient, centre neutre', () => {
  const c = { vx: 0, vy: 0 };
  applySpin(c, { x: 1, y: 0 }, 400, 'coulé'); assert.ok(c.vx > 0);
  const d = { vx: 0, vy: 0 };
  applySpin(d, { x: 1, y: 0 }, 400, 'rétro'); assert.ok(d.vx < 0);
  const e = { vx: 5, vy: 0 };
  applySpin(e, { x: 1, y: 0 }, 400, 'centre'); assert.equal(e.vx, 5);
});
