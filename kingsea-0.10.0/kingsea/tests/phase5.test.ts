import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIMS, DEFAULT_LOOK, NPC_LOOKS, poseFor, randomLook, sanitizeLook, lookKey } from '../src/art/characters';
import { Crowd, walkableSpots, clearPath, P_FOOT_W, P_FOOT_H } from '../src/entities/Passengers';
import { TileMap } from '../src/world/TileMap';
import { FLOORS } from '../src/world/floors';
import { TILE, isWaterChar } from '../src/world/types';
import { migrate, createDefaultPlayer } from '../src/systems/PlayerData';
import { cleanName } from '../src/ui/TextPrompt';
import { skyTint } from '../src/art/ambientFx';
import { MUSIC_THEMES, themeDef } from '../src/systems/Music';

function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('apparence : validation, ancien format migré, valeurs invalides remplacées', () => {
  assert.deepEqual(sanitizeLook(undefined), DEFAULT_LOOK);
  const old = sanitizeLook({ skin: '#f1c7a1', hair: '#3b2516', outfit: '#173e72', accent: '#e5b54a' }); // format v0.4
  assert.equal(old.outfit, 'marin'); assert.equal(old.color, '#173e72');
  const bad = sanitizeLook({ skin: 'rouge', hairStyle: 'mohawk', hat: 42, glasses: 'oui', outfit: 'robe' });
  assert.equal(bad.skin, DEFAULT_LOOK.skin); assert.equal(bad.hairStyle, DEFAULT_LOOK.hairStyle); assert.equal(bad.hat, DEFAULT_LOOK.hat); assert.equal(bad.glasses, false); assert.equal(bad.outfit, 'robe');
  const rnd = randomLook(lcg(1));
  assert.deepEqual(sanitizeLook(rnd), rnd, 'une apparence aléatoire est toujours valide');
  for (const l of Object.values(NPC_LOOKS)) assert.deepEqual(sanitizeLook(l), l);
  assert.notEqual(lookKey(rnd), lookKey(DEFAULT_LOOK));
});

test('sauvegarde : apparence et nouveaux réglages migrés depuis la version 0.4', () => {
  const d = createDefaultPlayer() as unknown as Record<string, unknown>;
  d.appearance = { skin: '#c98d62', hair: '#1c1412', outfit: '#0f8a8a', accent: '#e5b54a' };
  d.settings = { sfxVolume: 0.5, ambientVolume: 0.4, joystickScale: 1, lowFx: true, showFps: false };
  const m = migrate(d);
  assert.equal(m.appearance.skin, '#c98d62'); assert.equal(m.appearance.color, '#0f8a8a');
  assert.equal(m.settings.musicVolume, 0.5); assert.equal(m.settings.haptics, true); assert.equal(m.settings.leftHanded, false); assert.equal(m.settings.lowFx, true);
});

test('animations : chaque pose est définie pour toutes ses images et directions', () => {
  for (const [name, A] of Object.entries(ANIMS)) for (const d of A.dirs) for (let f = 0; f < A.frames; f++) {
    const p = poseFor(name as keyof typeof ANIMS, d, f);
    for (const k of ['step', 'armA', 'armB', 'bob', 'sway'] as const) assert.ok(Number.isFinite(p[k]), `${name} ${d} ${f} ${k}`);
  }
});

test('pseudo : nettoyage et longueur', () => {
  assert.equal(cleanName('  Capitaine   Nemo  '), 'Capitaine Nemo');
  assert.equal(cleanName('Zoé_42'), 'Zoé_42');
  assert.equal(cleanName('<script>'), 'script');
  assert.equal(cleanName('a'), null);
  assert.equal(cleanName('x'.repeat(40))?.length, 16);
});

test('passagers : ils se promènent sans jamais entrer dans un mur, un meuble ou la piscine', () => {
  for (const f of FLOORS.filter((f) => f.available && f.map)) {
    const map = TileMap.fromFloor(f);
    const spots = walkableSpots(map);
    if (f.id !== 'cabin-interior') assert.ok(spots.length > 20, `${f.id} : ${spots.length} emplacements`);
    const crowd = new Crowd(map, { count: 6 }, lcg(f.id.length * 7));
    let moved = 0;
    const start = crowd.list.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < 60 * 40; i++) {
      crowd.update(1 / 60, { x: -999, y: -999 });
      for (const p of crowd.list) {
        assert.ok(!map.collides({ x: p.x - P_FOOT_W / 2, y: p.y - P_FOOT_H, w: P_FOOT_W, h: P_FOOT_H }), `${f.id} : passager dans un obstacle`);
        assert.ok(!isWaterChar(map.charAt(Math.floor(p.x / TILE), Math.floor((p.y - 3) / TILE))), `${f.id} : passager dans l'eau`);
      }
    }
    crowd.list.forEach((p, i) => { if (Math.hypot(p.x - start[i].x, p.y - start[i].y) > TILE) moved++; });
    if (crowd.list.length) assert.ok(moved >= 2, `${f.id} : seulement ${moved} passagers ont bougé`);
  }
});

test('passagers : réponse au salut à proximité, une fois par délai', () => {
  const f = FLOORS.find((f) => f.id === 'hub')!;
  const map = TileMap.fromFloor(f);
  const crowd = new Crowd(map, { count: 5 }, lcg(3));
  const p0 = crowd.list[0];
  assert.ok(crowd.greet(p0.x + 10, p0.y) >= 1);
  assert.equal(p0.state, 'wave');
  assert.equal(crowd.greet(p0.x + 10, p0.y), 0, 'pas de double salut immédiat');
  assert.equal(crowd.greet(-5000, -5000), 0);
  assert.ok(clearPath(map, p0.x, p0.y, p0.x, p0.y));
});

test('musique : chaque thème a un tempo raisonnable et une grille complète ; ciel du rooftop selon l\'heure', () => {
  assert.ok(MUSIC_THEMES.length >= 7);
  for (const id of MUSIC_THEMES) { const d = themeDef(id); assert.ok(d.bpm >= 50 && d.bpm <= 140, id); assert.ok(d.bars >= 4, id); }
  assert.equal(skyTint(12).alpha, 0);
  assert.equal(skyTint(23).night, true);
  assert.ok(skyTint(19).alpha > 0 && !skyTint(19).night);
});
