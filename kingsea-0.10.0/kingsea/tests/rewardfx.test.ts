// Animation des gains : le compteur affiché suit uniquement les soldes réels (aucune valeur inventée),
// atteint exactement le nouveau solde, et un nouveau mouvement pendant l'animation la termine proprement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BalanceDisplay, rewardTier } from '../src/ui/Wealth';

test('paliers d’intensité selon le montant', () => {
  assert.equal(rewardTier(10), 0); assert.equal(rewardTier(50), 1); assert.equal(rewardTier(499), 1);
  assert.equal(rewardTier(500), 2); assert.equal(rewardTier(5000), 3);
});

test('gain animé : compteur croissant, jamais au-delà du solde réel, arrivée exacte, une seule animation', () => {
  const d = new BalanceDisplay('chips');
  d.home = { x: 200, y: 300 };
  let arrivals = 0; d.onArrive = () => { arrivals++; };
  d.sync(100);
  d.update(0.016, 1_100);
  assert.ok(d.animating);
  let prev = d.shown;
  for (let i = 0; i < 200; i++) {
    d.update(0.016, 1_100);
    assert.ok(d.shown >= prev && d.shown <= 1_100, `${d.shown}`);
    prev = d.shown;
  }
  assert.equal(d.shown, 1_100);
  assert.equal(d.animating, false);
  const n = arrivals;
  for (let i = 0; i < 50; i++) d.update(0.016, 1_100);
  assert.equal(arrivals, n, 'pas de nouvelle animation sans nouveau gain');
});

test('nouveau mouvement pendant une animation : la précédente est terminée, l’affichage suit le dernier solde', () => {
  const d = new BalanceDisplay('coins');
  d.home = { x: 0, y: 0 };
  d.sync(0);
  d.update(0.016, 1000);
  d.update(0.1, 1000);
  d.update(0.016, 900); // dépense immédiate
  for (let i = 0; i < 300; i++) d.update(0.016, 900);
  assert.equal(d.shown, 900);
});

test('compteur retenu (révélation en cours) : rien ne bouge avant la fin de la retenue', () => {
  const d = new BalanceDisplay('chips');
  d.home = { x: 0, y: 0 }; d.sync(50); d.hold = true;
  for (let i = 0; i < 20; i++) d.update(0.05, 250);
  assert.equal(d.shown, 50);
  d.hold = false;
  for (let i = 0; i < 300; i++) d.update(0.016, 250);
  assert.equal(d.shown, 250);
});
