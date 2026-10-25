import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASKET, crossedHoop, shotVelocity, simulateShot, MAX_SHOT_SPEED } from '../src/games/logic/basket';
import { applyError, keeperDive, keeperSaves, shotOutcome } from '../src/games/logic/football';
import { skeeLanding, skeeScoreAt, SKEE_CENTER } from '../src/games/logic/skeeball';
import { MoleField, MOLE_DURATION } from '../src/games/logic/mole';
import { flipperTip, launch, newPinState, PB, resetBall, stepPinball } from '../src/games/logic/pinball';

function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('basket : le panier ne compte que de haut en bas entre les bords', () => {
  assert.equal(crossedHoop(100, 110, 319), true);
  assert.equal(crossedHoop(110, 100, 319), false); // vers le haut
  assert.equal(crossedHoop(100, 110, 290), false); // à côté
});

test('basket : il existe des tirs gagnants, et un tir trop court échoue', () => {
  let wins = 0;
  for (let vx = 200; vx <= 600; vx += 10) for (let vy = -700; vy <= -300; vy += 10) if (simulateShot(100, 200, vx, vy).scored) wins++;
  assert.ok(wins > 5, `tirs gagnants trouvés : ${wins}`);
  assert.equal(simulateShot(100, 200, 100, -300).scored, false);
  assert.equal(simulateShot(100, 200, 0, -800).scored, false);
});

test('basket : la balle ne traverse jamais le panneau ni le sol', () => {
  const rng = lcg(7);
  for (let i = 0; i < 200; i++) {
    const v = shotVelocity((rng() * 2 - 0.5) * 600, -rng() * 600, 1.6);
    const b = { x: 60 + rng() * 100, y: 200, vx: v.vx, vy: v.vy };
    const r = simulateShot(b.x, b.y, b.vx, b.vy);
    assert.ok(typeof r.scored === 'boolean');
  }
  const s = shotVelocity(10000, -10000, 1);
  assert.ok(Math.hypot(s.vx, s.vy) <= MAX_SHOT_SPEED + 1e-6);
  assert.ok(BASKET.board.x > BASKET.rimBack.x);
});

test('football : gardien, poteaux, barre et cadre', () => {
  assert.equal(shotOutcome({ x: 0, y: 0.3 }, 0), 'saved');
  assert.equal(shotOutcome({ x: 0.85, y: 0.85 }, 0.85), 'goal'); // lucarne : hors de portée même s'il a deviné
  assert.equal(shotOutcome({ x: 0.85, y: 0.2 }, 0.85), 'saved');
  assert.equal(shotOutcome({ x: -0.8, y: 0.3 }, 0.6), 'goal'); // mauvais côté
  assert.equal(shotOutcome({ x: 1.2, y: 0.3 }, 0), 'wide');
  assert.equal(shotOutcome({ x: 0.2, y: 1.2 }, 0), 'over');
  assert.equal(shotOutcome({ x: 0.99, y: 0.3 }, 0), 'post');
  assert.equal(shotOutcome({ x: 0.3, y: 0.99 }, 0), 'bar');
  assert.ok(keeperSaves({ x: 0.1, y: 0.5 }, 0));
});

test('football : plongeon toujours dans le but, imprécision bornée', () => {
  const rng = lcg(3);
  for (let i = 0; i < 500; i++) {
    const d = keeperDive({ x: rng() * 2 - 1 }, i % 10, rng);
    assert.ok(Math.abs(d) <= 0.86);
    const t = applyError({ x: 0.5, y: 0.5 }, rng);
    assert.ok(Math.abs(t.x - 0.5) <= 0.1 && Math.abs(t.y - 0.5) <= 0.1);
  }
});

test('skee-ball : anneaux, coins à 100 et lancer parfait', () => {
  assert.equal(skeeScoreAt(SKEE_CENTER.x, SKEE_CENTER.y), 50);
  assert.equal(skeeScoreAt(0, SKEE_CENTER.y - 0.15), 40);
  assert.equal(skeeScoreAt(0, SKEE_CENTER.y - 0.45), 10);
  assert.equal(skeeScoreAt(0.75, 0.95), 100);
  assert.equal(skeeScoreAt(0.95, 0.1), 0);
  const p = (SKEE_CENTER.y - 0.05) / 0.95;
  const l = skeeLanding(p, 0);
  assert.equal(skeeScoreAt(l.x, l.y), 50);
  assert.ok(skeeLanding(5, 0).y <= 0.05 + 1.2 * 0.95 + 1e-9);
});

test('tape-crabe : apparitions, points, méduse pénalisante, fin à 30 s', () => {
  const f = new MoleField(lcg(11));
  let maxUp = 0, total = 0;
  while (!f.over) {
    f.update(1 / 30);
    const up = f.holes.filter(Boolean).length; maxUp = Math.max(maxUp, up);
    f.holes.forEach((c, i) => { if (c && !c.hit && c.kind !== 'jelly' && c.age > 0.3) total += f.hit(i); });
  }
  assert.ok(f.time >= MOLE_DURATION);
  assert.ok(f.hits > 20, `coups réussis : ${f.hits}`);
  assert.equal(f.score, total);
  assert.ok(maxUp <= 9);
  // Méduse
  const g = new MoleField(() => 0.15); // r = 0.15 → méduse
  for (let i = 0; i < 40 && !g.holes.some(Boolean); i++) g.update(0.05);
  const i = g.holes.findIndex(Boolean);
  assert.equal(g.holes[i]!.kind, 'jelly');
  g.score = 5;
  assert.equal(g.hit(i), -2);
  assert.equal(g.score, 3);
  assert.equal(g.hit(i), 0, 'pas de double coup');
  assert.equal(g.hit((i + 1) % 9), 0, 'trou vide');
});

test('flipper : sans batteurs la balle finit par tomber, sans jamais sortir de la table', () => {
  const rng = lcg(5);
  for (let k = 0; k < 30; k++) {
    const s = newPinState();
    launch(s, 0.3 + rng() * 0.7);
    let t = 0;
    while (!s.drained && t < 60) {
      if (!s.inPlay) launch(s, 0.5);
      stepPinball(s, 1 / 60); t += 1 / 60;
      assert.ok(s.ball.x > 0 && s.ball.x < PB.W && s.ball.y > -5, `balle hors table (${s.ball.x.toFixed(1)}, ${s.ball.y.toFixed(1)})`);
    }
    assert.ok(s.drained, 'la balle ne reste jamais coincée');
  }
});

test('flipper : le batteur renvoie la balle vers le haut', () => {
  const s = newPinState();
  const f = s.flippers[0];
  s.inPlay = true;
  // Balle posée sur le batteur gauche, vers les deux tiers
  const tip = flipperTip(f), x = f.px + (tip.x - f.px) * 0.65, y = f.py + (tip.y - f.py) * 0.65 - 14;
  s.ball = { x, y, vx: 0, vy: 0 };
  f.pressed = true;
  let minVy = 0;
  for (let i = 0; i < 12; i++) { stepPinball(s, 1 / 120); minVy = Math.min(minVy, s.ball.vy); }
  assert.ok(minVy < -400, `vitesse verticale ${minVy.toFixed(0)}`);
});

test('flipper : champignons et couloirs rapportent des points, le lanceur envoie la balle en jeu', () => {
  const s = newPinState();
  s.inPlay = true;
  s.ball = { x: 110, y: 120, vx: 0, vy: 100 };
  let ev = 0;
  for (let i = 0; i < 30; i++) ev += stepPinball(s, 1 / 120).bumper;
  assert.ok(ev >= 1 && s.score >= 100);
  resetBall(s); s.lanes = [true, true, false]; s.score = 0; s.inPlay = true;
  s.ball = { x: 190, y: 55, vx: 0, vy: 50 };
  for (let i = 0; i < 20; i++) stepPinball(s, 1 / 120);
  assert.equal(s.multiplier, 2);
  assert.ok(s.score >= 550);
  const t = newPinState();
  launch(t, 1);
  for (let i = 0; i < 90; i++) stepPinball(t, 1 / 60);
  assert.ok(t.ball.x < 270, 'la balle a quitté le couloir de lancement');
});
