import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from '../src/systems/Wallet.ts';

const mk = (balance = 100) => new Wallet({ balance, processedTx: [] });

test('dépense possible si le solde suffit', () => {
  const w = mk(100);
  assert.deepEqual(w.spend(30, 'a'), { ok: true, balance: 70 });
  assert.equal(w.balance, 70);
});

test('jamais de solde négatif', () => {
  const w = mk(20);
  const r = w.spend(25, 'a');
  assert.equal(r.ok, false);
  assert.equal(w.balance, 20);
});

test('une même transaction ne peut pas être appliquée deux fois (anti double récompense)', () => {
  const w = mk(0);
  assert.equal(w.earn(75, 'find:golden-compass').ok, true);
  const again = w.earn(75, 'find:golden-compass');
  assert.equal(again.ok, false);
  assert.equal(w.balance, 75);
});

test('montants invalides refusés', () => {
  const w = mk(50);
  assert.equal(w.spend(-5, 'x').ok, false);
  assert.equal(w.spend(2.5, 'y').ok, false);
  assert.equal(w.earn(10, '').ok, false);
  assert.equal(w.balance, 50);
});

test('notifie les abonnés et la sauvegarde', () => {
  let saved = 0; const deltas: number[] = [];
  const w = new Wallet({ balance: 10, processedTx: [] }, () => saved++);
  w.subscribe((_, d) => deltas.push(d));
  w.earn(5, 't1'); w.spend(3, 't2'); w.spend(100, 't3');
  assert.equal(saved, 2);
  assert.deepEqual(deltas, [5, -3]);
});

test("l'historique des transactions est borné", () => {
  const w = mk(0);
  for (let i = 0; i < 260; i++) w.earn(1, `t${i}`);
  assert.equal(w.balance, 260);
  assert.ok(w.hasProcessed('t259'));
});
