import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/math.ts';
import { handValue, isBlackjack, Shoe, type Card } from '../src/games/logic/cards.ts';
import { Blackjack } from '../src/games/logic/blackjack.ts';
import { betWins, returnMultiplier, settleBets, WHEEL_ORDER, type BetKind } from '../src/games/logic/roulette.ts';
import { lineReturn, STRIP, theoreticalRtp } from '../src/games/logic/slots.ts';
import { canSpinToday, expectedCoins, pickSegment, WHEEL_SEGMENTS } from '../src/games/logic/wheel.ts';
import { frameMarks, gameState, scoreFrames, totalScore } from '../src/games/logic/bowling.ts';
import { allStopped, stepWorld, type Disc } from '../src/games/logic/physics.ts';
import { recordResult, DAILY_REWARD_CAP } from '../src/games/logic/rewards.ts';
import { Wallet } from '../src/systems/Wallet.ts';
import { dayKey, weightedIndex } from '../src/games/logic/rng.ts';

const C = (rank: number, suit: Card['suit'] = '♠'): Card => ({ rank, suit });

// ---------------------------------------------------------------- cartes
test('valeur des mains : As souple / dur', () => {
  assert.deepEqual(handValue([C(1), C(6)]), { total: 17, soft: true });
  assert.deepEqual(handValue([C(1), C(6), C(10)]), { total: 17, soft: false });
  assert.equal(handValue([C(1), C(1), C(9)]).total, 21);
  assert.equal(handValue([C(13), C(12), C(5)]).total, 25);
  assert.ok(isBlackjack([C(1), C(12)]));
  assert.ok(!isBlackjack([C(7), C(7), C(7)]));
});

test('sabot de 6 jeux : 312 cartes, 24 As', () => {
  const s = new Shoe(seededRandom(1), 6);
  assert.equal(s.remaining, 312);
  let aces = 0; for (let i = 0; i < 312; i++) if (s.draw().rank === 1) aces++;
  assert.equal(aces, 24);
});

// ---------------------------------------------------------------- blackjack
function rig(cards: Card[]): Blackjack { const g = new Blackjack(seededRandom(2)); g.shoe.stack(cards); return g; }

test('blackjack naturel payé 3:2 + bonus de 50 % de la mise', () => {
  const g = rig([C(1), C(9), C(13), C(7)]); // joueur A,R ; croupier 9,7
  g.deal(10);
  assert.equal(g.phase, 'settled');
  assert.equal(g.hands[0].outcome, 'blackjack');
  assert.equal(g.hands[0].bonus, 5);
  assert.equal(g.totalPayout, 25 + 5, 'mise 10 + gain 15 + bonus 5');
});

test('le croupier tire jusqu’à 17 et reste sur 17 souple', () => {
  const g = rig([C(10), C(1), C(8), C(6), /* tirage croupier */ C(5)]);
  g.deal(10);
  assert.equal(g.phase, 'insurance', 'As du croupier : assurance proposée');
  g.insure(0, false);
  g.stand(); // joueur 18 ; croupier A,6 = 17 souple → reste
  assert.equal(handValue(g.dealer).total, 17);
  assert.equal(g.dealer.length, 2);
  assert.equal(g.hands[0].outcome, 'win');
  assert.equal(g.totalPayout, 20);
});

test('joueur qui saute perd sans que le croupier tire', () => {
  const g = rig([C(10), C(10), C(6), C(6), C(9)]);
  g.deal(10); g.hit();
  assert.equal(g.phase, 'settled');
  assert.equal(g.hands[0].outcome, 'lose');
  assert.equal(g.dealer.length, 2);
});

test('égalité rembourse la mise', () => {
  const g = rig([C(10), C(10), C(8), C(8)]);
  g.deal(25); g.stand();
  assert.equal(g.hands[0].outcome, 'push');
  assert.equal(g.totalPayout, 25);
});

test('doubler : une seule carte, mise doublée', () => {
  const g = rig([C(5), C(10), C(6), C(7), C(10), /* croupier */ C(10)]);
  g.deal(10);
  assert.ok(g.canDouble());
  g.double();
  assert.equal(g.hands[0].cards.length, 3);
  assert.equal(g.hands[0].bet, 20);
  assert.equal(g.hands[0].outcome, 'win'); // 21 contre 27
  assert.equal(g.totalPayout, 40);
});

test('séparer une paire : deux mains jouées l’une après l’autre', () => {
  const g = rig([C(8), C(10), C(8, '♥'), C(7), C(3), C(10), C(2)]);
  g.deal(10);
  assert.ok(g.canSplit());
  g.split();
  assert.equal(g.hands.length, 2);
  assert.equal(g.totalStake, 20);
  g.stand(); // main 1 : 8+3 = 11
  assert.equal(g.active, 1);
  g.stand(); // main 2 : 8+10 = 18 ; croupier 10+7 = 17
  assert.equal(g.phase, 'settled');
  assert.deepEqual(g.hands.map((h) => h.outcome), ['lose', 'win']);
  assert.ok(!isBlackjack(g.hands[1].cards));
});

test('croupier avec blackjack : vérifié dès la distribution', () => {
  const g = rig([C(10), C(1), C(9), C(13)]);
  g.deal(10);
  g.insure(0, false);
  assert.equal(g.phase, 'settled');
  assert.equal(g.hands[0].outcome, 'lose');
});

test('simulation : avantage de la maison raisonnable (stratégie simple)', () => {
  const g = new Blackjack(seededRandom(7));
  let staked = 0, returned = 0;
  for (let i = 0; i < 20000; i++) {
    g.deal(10);
    if (g.phase === 'insurance') g.insure(0, false);
    while (g.phase === 'player') { if (handValue(g.current!.cards).total < 17) g.hit(); else g.stand(); }
    staked += g.totalStake; returned += g.totalPayout;
  }
  const rtp = returned / staked;
  assert.ok(rtp > 0.88 && rtp < 1.0, `rtp ${rtp}`);
});

// ---------------------------------------------------------------- roulette
test('roulette : 37 cases dans l’ordre de la roue', () => {
  assert.equal(new Set(WHEEL_ORDER).size, 37);
});

test('roulette : chaque mise a un retour attendu de 36/37', () => {
  const kinds: BetKind[] = [{ type: 'number', n: 17 }, { type: 'red' }, { type: 'odd' }, { type: 'low' }, { type: 'dozen', d: 2 }, { type: 'column', c: 3 }];
  for (const k of kinds) {
    let wins = 0; for (let n = 0; n <= 36; n++) if (betWins(k, n)) wins++;
    assert.equal(wins * returnMultiplier(k), 36, JSON.stringify(k));
  }
});

test('roulette : le zéro fait perdre les chances simples', () => {
  assert.equal(settleBets([{ kind: { type: 'red' }, amount: 10 }, { kind: { type: 'even' }, amount: 10 }], 0), 0);
  assert.equal(settleBets([{ kind: { type: 'number', n: 0 }, amount: 10 }], 0), 360);
  assert.equal(settleBets([{ kind: { type: 'black' }, amount: 10 }, { kind: { type: 'number', n: 2 }, amount: 5 }], 2), 20 + 180);
});

// ---------------------------------------------------------------- machine à sous
test('machine à sous : bande de 32 symboles, taux de retour entre 92 et 96 %', () => {
  assert.equal(STRIP.length, 32);
  const rtp = theoreticalRtp();
  assert.ok(rtp > 0.92 && rtp < 0.96, String(rtp));
});

test('machine à sous : table des gains', () => {
  assert.equal(lineReturn(['ks', 'ks', 'ks']), 500);
  assert.equal(lineReturn(['perle', 'perle', 'ancre']), 3);
  assert.equal(lineReturn(['perle', 'ancre', 'ancre']), 1);
  assert.equal(lineReturn(['ancre', 'ancre', 'perle']), 0);
});

// ---------------------------------------------------------------- roue du jour
test('roue : une fois par jour, tirage pondéré', () => {
  assert.equal(canSpinToday(null, '2026-10-23'), true);
  assert.equal(canSpinToday('2026-10-23', '2026-10-23'), false);
  assert.equal(canSpinToday('2026-10-22', '2026-10-23'), true);
  const rng = seededRandom(3), hits = new Array(WHEEL_SEGMENTS.length).fill(0);
  for (let i = 0; i < 20000; i++) hits[pickSegment(rng)]++;
  const big = WHEEL_SEGMENTS.findIndex((s) => s.coins === 250);
  assert.ok(hits[big] / 20000 < 0.03);
  assert.ok(expectedCoins() > 20 && expectedCoins() < 45);
});

test('dayKey : date locale AAAA-MM-JJ', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(weightedIndex(() => 0.999, [1, 0, 0]), 0);
});

// ---------------------------------------------------------------- bowling
test('bowling : partie parfaite = 300', () => {
  const rolls = new Array(12).fill(10);
  assert.equal(totalScore(rolls), 300);
  assert.equal(gameState(rolls).over, true);
});

test('bowling : spares et frame ouverte', () => {
  const rolls = [9, 1, 5, 3]; // spare puis 8
  assert.deepEqual(scoreFrames(rolls).slice(0, 2), [15, 23]);
  assert.deepEqual(frameMarks(rolls).slice(0, 2), [['9', '/'], ['5', '3']]);
});

test('bowling : tout à 9 = 90 ; 10e frame sans bonus termine la partie', () => {
  const rolls: number[] = []; for (let f = 0; f < 10; f++) rolls.push(9, 0);
  assert.equal(totalScore(rolls), 90);
  assert.equal(gameState(rolls).over, true);
});

test('bowling : 10e frame avec spare donne un 3e lancer', () => {
  const rolls: number[] = []; for (let f = 0; f < 9; f++) rolls.push(0, 0);
  rolls.push(7, 3);
  const st = gameState(rolls);
  assert.equal(st.over, false); assert.equal(st.roll, 2); assert.equal(st.standing, 10);
  rolls.push(5);
  assert.equal(totalScore(rolls), 15);
  assert.equal(gameState(rolls).over, true);
});

test('bowling : quilles debout après un premier lancer', () => {
  assert.deepEqual(gameState([6]), { frame: 0, roll: 1, standing: 4, over: false });
  assert.deepEqual(gameState([10]), { frame: 1, roll: 0, standing: 10, over: false });
});

// ---------------------------------------------------------------- physique
const opts = { friction: 50, restitution: 0.95, wallRestitution: 0.8, bounds: { x: 0, y: 0, w: 400, h: 200 }, pockets: [] as Array<{ x: number; y: number; r: number }> };
const disc = (id: number, x: number, y: number, vx = 0, vy = 0): Disc => ({ id, x, y, vx, vy, r: 8, m: 1, active: true });

test('physique : choc frontal transmet la vitesse', () => {
  const a = disc(0, 100, 100, 300), b = disc(1, 140, 100);
  for (let i = 0; i < 30; i++) stepWorld([a, b], 1 / 60, { ...opts, friction: 0 });
  assert.ok(b.vx > 250 && Math.abs(a.vx) < 40, `${a.vx} ${b.vx}`);
});

test('physique : les bandes renvoient la bille et elle finit par s’arrêter', () => {
  const a = disc(0, 380, 100, 400);
  for (let i = 0; i < 600; i++) stepWorld([a], 1 / 60, opts);
  assert.ok(a.x + a.r <= 400.001 && a.x - a.r >= -0.001);
  assert.ok(allStopped([a]));
});

test('physique : une bille entre dans la poche', () => {
  const a = disc(0, 100, 100, 200);
  let got: Disc[] = [];
  for (let i = 0; i < 120 && !got.length; i++) got = stepWorld([a], 1 / 60, { ...opts, pockets: [{ x: 160, y: 100, r: 12 }] });
  assert.equal(got.length, 1); assert.equal(a.active, false);
});

// ---------------------------------------------------------------- récompenses
test('récompenses : plafond quotidien et meilleur score', () => {
  const stats: Record<string, number> = {};
  const w = new Wallet({ balance: 0, processedTx: [] });
  const r1 = recordResult(stats, w, { game: 'bowling', score: 150, reward: 100, better: 'high', today: '2026-10-23' });
  assert.equal(r1.granted, 100); assert.ok(r1.newBest);
  const r2 = recordResult(stats, w, { game: 'bowling', score: 90, reward: 100, better: 'high', today: '2026-10-23' });
  assert.equal(r2.granted, DAILY_REWARD_CAP - 100); assert.ok(!r2.newBest); assert.ok(r2.capReached);
  const r3 = recordResult(stats, w, { game: 'bowling', score: 90, reward: 50, better: 'high', today: '2026-10-23' });
  assert.equal(r3.granted, 0);
  assert.equal(w.balance, DAILY_REWARD_CAP);
  const r4 = recordResult(stats, w, { game: 'bowling', score: 200, reward: 20, better: 'high', today: '2026-10-24' });
  assert.equal(r4.granted, 20); assert.equal(r4.best, 200);
  assert.equal(stats['earned.bowling.2026-10-23'], undefined);
});

test('récompenses : « moins c’est mieux » pour le billard', () => {
  const stats: Record<string, number> = {};
  const w = new Wallet({ balance: 0, processedTx: [] });
  recordResult(stats, w, { game: 'billiards', score: 30, reward: 0, better: 'low', today: 'd' });
  const r = recordResult(stats, w, { game: 'billiards', score: 22, reward: 0, better: 'low', today: 'd' });
  assert.ok(r.newBest); assert.equal(r.best, 22);
});
