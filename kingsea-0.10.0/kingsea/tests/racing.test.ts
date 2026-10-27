// Circuit KS : géométrie de la piste, physique, tours (pas de raccourci ni de marche arrière), classement,
// éléments de piste, et règle de score de l'autorité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiInputs, buildTrack, collideCars, HALF_W, LAPS, makeCars, makeObstacles, nearest, pointAt, raceScore, RUNOFF, standings, stepCar,
} from '../src/games/logic/racing';
import { handle, type AuthState } from '../src/authority/index';

const t = buildTrack();

test('piste : fermée, sans portions qui se chevauchent (barrières comprises)', () => {
  let md = Infinity;
  for (let i = 0; i < t.n; i += 2) for (let j = i + 1; j < t.n; j += 2) {
    const gap = Math.min(Math.abs(t.cum[i] - t.cum[j]), t.length - Math.abs(t.cum[i] - t.cum[j]));
    if (gap < 700) continue;
    md = Math.min(md, Math.hypot(t.pts[i].x - t.pts[j].x, t.pts[i].y - t.pts[j].y));
  }
  assert.ok(md > 2 * (HALF_W + RUNOFF), `distance minimale ${Math.round(md)}`);
  assert.ok(t.length > 8000 && t.length < 13000);
});

test('course entre pilotes automatiques : 3 tours en 1 à 2 minutes, temps de tour plausibles', () => {
  const cars = makeCars(t, 'Test'); cars[0].ai = true;
  const obs = makeObstacles(t);
  let time = 0;
  while (time < 240 && !cars.every((c) => c.finished)) {
    time += 1 / 120;
    for (const c of cars) if (!c.finished) stepCar(c, aiInputs(c, t), t, obs, 1 / 120, time);
    collideCars(cars);
  }
  for (const c of cars) {
    assert.ok(c.finished, c.name);
    assert.equal(c.lapTimes.length, LAPS);
    for (const lt of c.lapTimes) assert.ok(lt > 18 && lt < 45, `${c.name} ${lt}`);
    // Jamais au-delà des barrières
    assert.ok(Math.abs(nearest(t, c.x, c.y).lateral) <= HALF_W + RUNOFF + 1);
  }
  const st = standings(cars);
  for (let i = 1; i < st.length; i++) assert.ok((st[i - 1].finishTime ?? 0) <= (st[i].finishTime ?? 0));
});

test('tours : la marche arrière à travers la ligne et les allers-retours ne comptent pas', () => {
  const [c] = makeCars(t, 'T');
  // Recule de part et d'autre de la ligne de départ : aucun tour
  for (let k = 0; k < 6; k++) {
    const p = pointAt(t, k % 2 ? 40 : t.length - 40);
    c.x = p.x; c.y = p.y;
    stepCar(c, { steer: 0, throttle: 0, brake: 0 }, t, [], 1 / 60, k);
  }
  assert.equal(c.lap, 0);
  // Saut direct d'un bout à l'autre (raccourci) sans passer par la moitié : refusé
  const far = pointAt(t, t.length * 0.3); c.x = far.x; c.y = far.y; c.idx = far.i;
  stepCar(c, { steer: 0, throttle: 0, brake: 0 }, t, [], 1 / 60, 10);
  assert.equal(c.lap, 0);
  assert.equal(c.checkpoint, false);
});

test('éléments de piste : huile (glisse), vague turbo, bouée (freine), barrière (rebond)', () => {
  const obs = makeObstacles(t);
  const oil = obs.find((o) => o.kind === 'oil')!, boost = obs.find((o) => o.kind === 'boost')!, buoy = obs.find((o) => o.kind === 'buoy')!;
  const place = (o: { x: number; y: number }) => { const [c] = makeCars(t, 'T'); const n = nearest(t, o.x, o.y); c.x = o.x; c.y = o.y; c.idx = n.i; c.lastS = t.cum[n.i]; c.progress = t.cum[n.i]; return c; };
  const a = place(oil); stepCar(a, { steer: 0, throttle: 1, brake: 0 }, t, obs, 1 / 60, 0); assert.ok(a.slip > 0);
  const b = place(boost); stepCar(b, { steer: 0, throttle: 1, brake: 0 }, t, obs, 1 / 60, 0); assert.ok(b.boost > 0 && b.boosted);
  const c = place(buoy); c.vx = 300; c.vy = 0; stepCar(c, { steer: 0, throttle: 0, brake: 0 }, t, obs, 1 / 60, 0); assert.ok(c.hit > 0);
  // Voiture lancée vers l'extérieur : retenue par la barrière
  const [d] = makeCars(t, 'T'); const p = pointAt(t, 2000, HALF_W + RUNOFF - 20);
  d.x = p.x; d.y = p.y; d.idx = p.i; d.vx = t.nx[p.i] * 500; d.vy = t.ny[p.i] * 500;
  for (let k = 0; k < 30; k++) stepCar(d, { steer: 0, throttle: 0, brake: 0 }, t, [], 1 / 60, k);
  assert.ok(Math.abs(nearest(t, d.x, d.y, d.idx).lateral) <= HALF_W + RUNOFF + 1);
});

test('autorité : temps du circuit validé (bornes), meilleur temps = le plus court, récompense plafonnée', () => {
  const s: AuthState = { wallet: { balance: 0, processedTx: [] }, chips: { balance: 0, processedTx: ['chips:welcome'] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {} };
  const env = { rng: Math.random, now: 1, day: '2026-10-26' };
  let n = 0;
  const send = (score: unknown) => handle(s, { kind: 'purser', game: 'purser', action: 'arcade', input: { game: 'racing', score }, id: `race${++n}xx` }, env);
  assert.equal(send(100).ok, false, 'temps impossible');
  assert.equal(send(84.5).ok, false, 'entier requis');
  const r1 = send(raceScore(90)); assert.ok(r1.ok);
  const r2 = send(raceScore(85)); assert.ok(r2.ok);
  const r3 = send(raceScore(95)); assert.ok(r3.ok);
  assert.equal(s.stats['best.racing'], 850);
  if (r2.ok) assert.equal(r2.view.newBest, true);
  if (r3.ok) assert.equal(r3.view.newBest, false);
  assert.ok(s.wallet.balance > 0 && s.wallet.balance <= 120 * 3);
});
