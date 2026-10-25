import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticsImpl } from '../src/systems/Diagnostics';
import { NET_ANIMS, NET_DIRS, packPose, unpackPose } from '../src/net/protocol';
import { layoutControlBar, chipButtons } from '../src/games/widgets';
import { makeButton } from '../src/ui/UIKit';

test('diagnostic : images/s, centiles, images lentes, erreurs regroupées', () => {
  const d = new DiagnosticsImpl();
  for (let i = 0; i < 100; i++) d.recordFrame(i < 95 ? 2 : 30, i < 90 ? 16.7 : 60);
  const f = d.frameStats();
  assert.ok(f.fps > 40 && f.fps < 60, String(f.fps));
  assert.equal(f.workP95, 30);
  assert.equal(d.longFrames, 10);
  d.recordError(new Error('boum')); d.recordError(new Error('boum')); d.recordError('autre');
  assert.equal(d.errors.length, 2);
  assert.equal(d.errors[0].count, 2);
  for (let i = 0; i < 400; i++) d.recordFrame(1, 16);
  assert.ok(Math.abs(d.frameStats().fps - 62.5) < 0.1, 'fenêtre glissante');
  d.resetFrames(); assert.equal(d.frameStats().fps, 0);
});

test('protocole 2 : direction + animation dans un seul nombre, aller-retour exact', () => {
  for (const dir of NET_DIRS) for (const anim of NET_ANIMS) assert.deepEqual(unpackPose(packPose(dir, anim)), { dir, anim });
  assert.deepEqual(unpackPose(9999), { dir: 'right', anim: 'idle' }, 'valeur inconnue : repli sûr');
});

test('barre de commandes des jeux : jamais de chevauchement, cibles ≥ 44 px, en paysage comme en portrait', () => {
  for (const [w, h, ui] of [[760, 300, 0.94], [330, 640, 0.975], [300, 560, 0.85], [1100, 700, 1.35]]) {
    const a = { x: 10, y: 20, w, h };
    const chips = chipButtons([5, 10, 25, 50], () => {});
    const acts: Array<[ReturnType<typeof makeButton>, number]> = [[makeButton({ id: 'auto', onTap: () => {} }), 130], [makeButton({ id: 'go', onTap: () => {} }), 220]];
    const used = layoutControlBar(a, ui, chips, acts);
    const all = [...chips, ...acts.map(([b]) => b)];
    for (const b of all) {
      assert.ok(b.x >= a.x - 0.5 && b.x + b.w <= a.x + a.w + 0.5, `${b.id} dans la largeur (${w})`);
      assert.ok(b.y >= a.y + a.h - used - 0.5 && b.y + b.h <= a.y + a.h + 0.5, `${b.id} dans la hauteur réservée`);
      assert.ok(Math.min(b.w, b.h) >= 44 || (b.id === 'auto' && b.w >= 44), `${b.id} assez grand (${b.w}×${b.h})`);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const p = all[i], q = all[j];
      const ov = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0.5 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 0.5;
      assert.ok(!ov, `${p.id} et ${q.id} ne se chevauchent pas (${w}×${h})`);
    }
  }
});

test('réglages phase 7 : anciennes sauvegardes et valeurs corrompues → valeurs sûres', async () => {
  const { migrate } = await import('../src/systems/PlayerData');
  const old = migrate({ version: 1, settings: { sfxVolume: 0.3 } });
  assert.equal(old.settings.powerSaver, false);
  assert.equal(old.settings.autoQuality, true);
  assert.equal(old.settings.sfxVolume, 0.3);
  const bad = migrate({ settings: { powerSaver: 'oui', autoQuality: 0, joystickScale: 99 } });
  assert.equal(bad.settings.powerSaver, false);
  assert.equal(bad.settings.autoQuality, true);
  assert.ok(bad.settings.joystickScale <= 1.5);
  for (const junk of [{ wallet: 'beaucoup' }, { settings: null, flags: 3 }, { appearance: 'x', location: [] }]) assert.doesNotThrow(() => migrate(junk));
});
