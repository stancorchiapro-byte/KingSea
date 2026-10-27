import { VIP_LOUNGE } from '../src/world/floors/rooftop';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentFloor, FLOORS, getFloor, getPlayableFloor } from '../src/world/floors/index.ts';
import { TileMap, propActive, propInteractPoint } from '../src/world/TileMap.ts';
import { stairsArrival, TILE } from '../src/world/types.ts';
import { FOOT_W, FOOT_H } from '../src/entities/Player.ts';

test('le bateau compte exactement sept niveaux, de -1 à 5 (pont Panorama), sans doublon', () => {
  assert.equal(FLOORS.length, 7);
  assert.deepEqual(FLOORS.map((f) => f.level).sort((a, b) => a - b), [-1, 0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(FLOORS.map((f) => f.id)).size, 7);
});

test('un id inconnu renvoie au hall', () => {
  assert.equal(getPlayableFloor('nimporte').id, 'hub');
  assert.equal(getPlayableFloor('engine').id, 'engine');
});

test('les six niveaux sont accessibles (phase 2)', () => {
  assert.ok(FLOORS.every((f) => f.available && f.map && f.spawn));
});

test('escaliers : chaque étage relie ses voisins, dans les deux sens', () => {
  const byLevel = [...FLOORS].sort((a, b) => a.level - b.level);
  for (let i = 0; i < byLevel.length; i++) {
    const f = byLevel[i], props = f.props ?? [];
    const up = props.some((p) => p.kind === 'stairsUp'), down = props.some((p) => p.kind === 'stairsDown');
    assert.equal(up, i < byLevel.length - 1, `${f.id} : escalier montant`);
    assert.equal(down, i > 0, `${f.id} : escalier descendant`);
    if (up) assert.equal(adjacentFloor(f, 1)?.id, byLevel[i + 1].id);
    if (down) assert.equal(adjacentFloor(f, -1)?.id, byLevel[i - 1].id);
  }
});

for (const f of [...FLOORS.filter((x) => x.available), getFloor('cabin-interior')!]) {
  test(`${f.name} : carte rectangulaire, fermée sauf aux escaliers`, () => {
    const map = f.map!;
    const w = map[0].length;
    const edge = '#WG';
    for (const row of map) assert.equal(row.length, w);
    for (let x = 0; x < w; x++) { assert.ok(edge.includes(map[0][x])); assert.ok(edge.includes(map[map.length - 1][x])); }
    map.forEach((row, y) => {
      for (const x of [0, w - 1]) {
        if (row[x] === 'S') assert.ok((f.props ?? []).some((p) => (p.kind === 'stairsUp' || p.kind === 'stairsDown') && p.tx === x && y >= p.ty && y < p.ty + p.h), `ouverture sans escalier en ${x},${y}`);
        else assert.ok(edge.includes(row[x]), `bord ouvert en ${x},${y}`);
      }
    });
  });

  test(`${f.name} : arrivées par escalier sur une case libre`, () => {
    const tm = TileMap.fromFloor(f, {});
    for (const kind of ['stairsUp', 'stairsDown'] as const) {
      const a = stairsArrival(f, kind);
      if (!a) continue;
      assert.equal(tm.collides({ x: a.x * TILE - FOOT_W / 2, y: a.y * TILE - FOOT_H, w: FOOT_W, h: FOOT_H }), false, `${kind}`);
    }
  });

  for (const flags of [{}, { 'engine.lights': true }] as Array<Record<string, boolean>>) {
    test(`${f.name} : point d'apparition libre (drapeaux ${JSON.stringify(flags)})`, () => {
      const tm = TileMap.fromFloor(f, flags);
      const sx = f.spawn!.x * TILE, sy = f.spawn!.y * TILE;
      assert.equal(tm.collides({ x: sx - FOOT_W / 2, y: sy - FOOT_H, w: FOOT_W, h: FOOT_H }), false);
    });
  }

  test(`${f.name} : possède un ascenseur et chaque interaction est atteignable`, () => {
    const props = f.props ?? [];
    assert.ok(props.some((p) => p.interact?.id === (f.interior ? 'cabin-exit' : 'elevator')));
    const tm = TileMap.fromFloor(f, { 'engine.lights': true });
    // Parcours en largeur sur les tuiles depuis le point d'apparition
    const start = [Math.floor(f.spawn!.x), Math.floor(f.spawn!.y)];
    // Salon VIP du rooftop : on y entre par la porte gardée (téléportation), pas à pied
    const extra = f.id === 'rooftop' ? [[Math.floor(VIP_LOUNGE.inside.x), Math.floor(VIP_LOUNGE.inside.y)]] : [];
    const seen = new Set([start.join(','), ...extra.map((e) => e.join(','))]); const q = [start, ...extra];
    const freeTile = (x: number, y: number) => !tm.collides({ x: x * TILE + 8, y: y * TILE + 12, w: FOOT_W, h: FOOT_H });
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && freeTile(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
    for (const p of props.filter((p) => p.interact && propActive(p, { 'engine.lights': true }))) {
      const pt = propInteractPoint(p), r = (p.interact!.radius ?? 1.6) * TILE;
      const ok = [...seen].some((k) => { const [x, y] = k.split(',').map(Number); return Math.hypot((x + 0.5) * TILE - pt.x, (y + 0.7) * TILE - pt.y) <= r; });
      assert.ok(ok, `${p.interact!.id} inatteignable`);
    }
  });

  test(`${f.name} : accessoires dans les limites`, () => {
    for (const p of f.props ?? []) {
      assert.ok(p.tx >= 0 && p.ty >= 0 && p.tx + p.w <= f.map![0].length && p.ty + p.h <= f.map!.length, `${p.kind} hors carte`);
    }
  });
}

test("la boussole n'apparaît qu'avec l'éclairage et disparaît une fois ramassée", () => {
  const compass = FLOORS.find((f) => f.id === 'engine')!.props!.find((p) => p.kind === 'compass')!;
  assert.equal(propActive(compass, {}), false);
  assert.equal(propActive(compass, { 'engine.lights': true }), true);
  assert.equal(propActive(compass, { 'engine.lights': true, 'found.golden-compass': true }), false);
});

test('cabine : intérieur instancié, couleur des murs prise en compte, absent de l’ascenseur', () => {
  const c = getFloor('cabin-interior')!;
  assert.ok(c.interior);
  assert.ok(!FLOORS.some((f) => f.id === c.id));
  assert.equal(adjacentFloor(c, 1)?.id, 'rooftop'); // même niveau que les logements (3) : pas d'escalier dans la cabine
  assert.ok(!(c.props ?? []).some((p) => p.kind === 'stairsUp' || p.kind === 'stairsDown'));
});

test('piscine : l’eau est praticable (on y nage)', () => {
  const r = FLOORS.find((f) => f.id === 'rooftop')!;
  const tm = TileMap.fromFloor(r, {});
  assert.equal(tm.collides({ x: 15 * TILE, y: 8 * TILE, w: 16, h: 9 }), false);
});

test('Salon VIP : points d’entrée et de sortie libres', () => {
  const f = FLOORS.find((x) => x.id === 'rooftop')!;
  const tm = TileMap.fromFloor(f, {});
  for (const p of [VIP_LOUNGE.inside, VIP_LOUNGE.outside]) assert.equal(tm.collides({ x: p.x * TILE - FOOT_W / 2, y: p.y * TILE - FOOT_H, w: FOOT_W, h: FOOT_H }), false, JSON.stringify(p));
});
