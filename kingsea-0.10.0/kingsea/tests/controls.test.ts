// Commandes : actions, touche personnalisée, conflits, axe de déplacement, capture de touche, migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controls, keyName } from '../src/engine/Controls';
import type { Input } from '../src/engine/Input';
import { migrate } from '../src/systems/PlayerData';

function fakeInput() {
  const down = new Set<string>(), pressed = new Set<string>();
  const inp = { isDown: (c: string) => down.has(c), wasPressed: (c: string) => pressed.has(c), onKeyCapture: null as null | ((c: string) => boolean), lastActivity: 0 };
  return { inp, down, pressed, c: new Controls(inp as unknown as Input) };
}

test('touches par défaut (QWERTY et AZERTY) et axe normalisé', () => {
  const { c, down } = fakeInput();
  down.add('KeyZ'); down.add('KeyD');
  const a = c.axis();
  assert.ok(Math.abs(Math.hypot(a.x, a.y) - 1) < 1e-9 && a.x > 0 && a.y < 0);
  down.clear(); down.add('KeyW');
  assert.equal(c.axis().y, -1);
});

test('touche personnalisée : ajoutée en tête, sans déclencher une autre action', () => {
  const { c, pressed } = fakeInput();
  c.custom = { chat: 'KeyE' }; // E sert d'habitude à « interagir »
  pressed.add('KeyE');
  assert.equal(c.pressed('chat'), true);
  assert.equal(c.pressed('interact'), false, 'la touche réassignée ne déclenche plus « interagir »');
  assert.deepEqual(c.keysOf('chat').slice(0, 2), ['KeyE', 'KeyT']);
  pressed.clear(); pressed.add('Enter');
  assert.equal(c.pressed('interact'), true);
});

test('capture d’une touche pour la réassigner ; Échap annule', () => {
  const { c, inp } = fakeInput();
  let got: string | null | undefined;
  c.captureNext((k) => { got = k; });
  assert.equal(c.capturing, true);
  assert.equal(inp.onKeyCapture!('KeyP'), true);
  assert.equal(got, 'KeyP');
  assert.equal(inp.onKeyCapture!('KeyO'), false, 'une seule capture');
  c.captureNext((k) => { got = k; });
  inp.onKeyCapture!('Escape');
  assert.equal(got, null);
});

test('noms lisibles et migration de la carte des touches', () => {
  assert.equal(keyName('KeyT'), 'T'); assert.equal(keyName('ArrowUp'), '↑'); assert.equal(keyName('Space'), 'Espace');
  const d = migrate({ version: 2, settings: { keymap: { chat: 'KeyY', '<script>': 'x', missions: 42 } } });
  assert.deepEqual(d.settings.keymap, { chat: 'KeyY' });
  assert.equal(d.settings.masterVolume, 1);
});
