// Tests à données aléatoires (phase 7) : l'autorité et le serveur reçoivent des milliers de requêtes
// absurdes, malformées ou hostiles. Ils ne doivent jamais planter, ni créer ou détruire des KSCoins
// en dehors des règles, ni laisser un état à moitié modifié quand ils refusent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASINO_GAMES, handle, type AuthEnv, type AuthState } from '../src/authority/index';
import { GameServer, type Sock } from '../server/game';
import { MemoryStore } from '../server/store';
import { DEFAULT_LOOK } from '../src/art/characters';
import { PROTOCOL_VERSION, TERMS_VERSION } from '../src/net/protocol';

function lcg(seed: number) { let s = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

const KEYS = ['bet', 'bets', 'amount', 'kind', 'type', 'n', 'holds', 'hold', 'act', 'move', 'auto', 'picks', 'horse', 'pick', 'score', 'game', 'key', 'value', 'item', 'id', 'by', 'zone', 'machine', 'lines', 'side', 'cashout', 'at', 'price'];
function junk(r: () => number, depth = 0): unknown {
  const k = Math.floor(r() * 14);
  switch (k) {
    case 0: return null;
    case 1: return undefined;
    case 2: return Math.floor(r() * 12) * 5;               // mises plausibles
    case 3: return [-1, 0, 0.5, 1e9, -1e9, NaN, Infinity, 2 ** 53, 1000, 1001, 5000][Math.floor(r() * 11)];
    case 4: return ['', 'red', 'black', 'number', 'hit', 'stand', 'double', 'split', 'player', 'banker', 'tie', 'pass', '__proto__', 'constructor', 'x'.repeat(500)][Math.floor(r() * 15)];
    case 5: return r() < 0.5;
    case 6: case 7: case 8: {
      if (depth > 3) return 1;
      const o: Record<string, unknown> = {};
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) o[KEYS[Math.floor(r() * KEYS.length)]] = junk(r, depth + 1);
      return o;
    }
    case 9: case 10: {
      if (depth > 3) return [];
      return Array.from({ length: Math.floor(r() * 6) }, () => junk(r, depth + 1));
    }
    case 11: return Math.floor(r() * 80);
    case 12: return { kind: { type: ['red', 'number', 'column', 'dozen', 'odd'][Math.floor(r() * 5)], n: Math.floor(r() * 40), c: 1 + Math.floor(r() * 3), d: 1 + Math.floor(r() * 3) }, amount: Math.floor(r() * 30) };
    default: return 'zzz';
  }
}
const ACTIONS = ['play', 'deal', 'draw', 'act', 'start', 'status', 'cashout', 'field', 'run', 'buy', 'gift', 'find', 'wheel', 'arcade', 'flag', 'stat', 'boom', ''];
const GAMES = [...CASINO_GAMES, 'purser', 'inconnu', '__proto__'];

test('autorité : 20 000 requêtes aléatoires, jamais de plantage ni de KSCoins hors règles', () => {
  const errors: unknown[] = [];
  const okCount = new Map<string, number>();
  const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    for (let seed = 0; seed < 20; seed++) {
      const r = lcg(seed);
      const s: AuthState = { wallet: { balance: 1000, processedTx: [] }, stats: {}, flags: {}, dailyRewards: { lastWheelDay: null }, sessions: {} };
      handle(s, { kind: 'purser', game: 'purser', action: 'missions', input: {}, id: `init${seed}` }, { rng: lcg(seed), now: 1, day: '2026-10-23' }); // état de progression initialisé
      let now = 1_000_000;
      for (let i = 0; i < 1000; i++) {
        now += Math.floor(r() * 3000);
        const env: AuthEnv = { rng: lcg(seed * 7919 + i), now, day: r() < 0.9 ? '2026-10-23' : '2026-10-24' };
        const game = GAMES[Math.floor(r() * GAMES.length)];
        const kind = game === 'purser' || r() < 0.1 ? 'purser' : 'casino';
        // Le renouvellement des missions au changement de jour n'est pas une modification due à la requête
        const snap = () => JSON.stringify({ ...s, missions: undefined });
        const before = snap();
        const reply = handle(s, { kind, game, action: ACTIONS[Math.floor(r() * ACTIONS.length)], input: junk(r), id: `f${seed}-${r() < 0.05 ? 1 : i}` }, env);
        const b = s.wallet.balance;
        if (reply.ok) okCount.set(game, (okCount.get(game) ?? 0) + 1);
        assert.ok(Number.isInteger(b) && b >= 0, `solde invalide ${b}`);
        assert.equal(reply.balance, b);
        if (!reply.ok) assert.equal(snap(), before, 'un refus ne doit rien modifier');
        else {
          assert.ok(Number.isFinite(reply.stake ?? 0) && (reply.stake ?? 0) >= 0);
          assert.ok(Number.isFinite(reply.payout ?? 0) && (reply.payout ?? 0) >= 0);
        }
        // Remise à niveau occasionnelle pour continuer d'explorer les jeux
        if (b < 50) s.wallet.balance = 1000;
        if (s.wallet.processedTx.length > 400) s.wallet.processedTx.splice(0, 200);
      }
    }
  } finally { console.error = orig; }
  assert.deepEqual(errors, [], 'aucune exception inattendue (hors refus prévus)');
  // Le hasard doit aussi produire des parties valides (sinon le test n'explorerait que les refus)
  if (process.env.KS_FUZZ_VERBOSE) console.log(Object.fromEntries(okCount));
  assert.ok(okCount.size >= 5, `requêtes acceptées : ${JSON.stringify(Object.fromEntries(okCount))}`);
});

test('serveur : messages aléatoires et malformés de joueurs connectés, il reste debout et cohérent', async () => {
  let now = 5_000_000;
  const srv = new GameServer(new MemoryStore(), { now: () => now, rng: lcg(99) });
  const r = lcg(1234);
  const out: string[][] = [];
  const socks = Array.from({ length: 6 }, (_, i) => {
    out.push([]);
    const sock: Sock = { ip: `10.1.0.${i}`, send: (d) => { out[i].push(d); }, close: () => {} };
    return srv.connect(sock);
  });
  socks.forEach((c, i) => { srv.message(c, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION })); srv.message(c, JSON.stringify({ t: 'register', name: `Fuzz${i}`, password: 'motdepasse1', look: DEFAULT_LOOK, terms: TERMS_VERSION })); });
  // L'inscription (dérivation de mot de passe) peut être asynchrone
  for (let k = 0; k < 100 && !out.every((o) => o.some((d) => d.includes('"t":"auth"'))); k++) await new Promise((res) => setTimeout(res, 30));
  assert.ok(out.every((o) => o.some((d) => d.includes('"t":"auth"'))), 'joueurs inscrits');
  const T = ['join', 'move', 'emote', 'chat', 'req', 'cabin', 'cabinColor', 'players', 'block', 'report', 'look', 'ping', 'hello', 'login', 'register', 'password', 'boom', 'logout'];
  const FLOORS = ['hub', 'casino', 'arcade', 'cabins', 'rooftop', 'engine', 'cabin-interior', 'nowhere', '../etc'];
  const errors: unknown[] = [];
  const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    for (let i = 0; i < 6000; i++) {
      now += Math.floor(r() * 120);
      const c = socks[Math.floor(r() * socks.length)];
      const t = T[Math.floor(r() * (T.length - 1))]; // pas de déconnexion volontaire
      let msg: unknown;
      const pick = r();
      if (pick < 0.05) msg = '{ pas du json';
      else if (pick < 0.1) msg = JSON.stringify(junk(r));
      else if (pick < 0.12) msg = 'x'.repeat(70_000);
      else {
        const m: Record<string, unknown> = { t };
        if (t === 'join') Object.assign(m, { floor: FLOORS[Math.floor(r() * FLOORS.length)], x: junk(r), y: junk(r) });
        if (t === 'move') Object.assign(m, { x: r() * 1200 - 100, y: r() * 800 - 100, dir: junk(r), anim: junk(r) });
        if (t === 'req') m.req = { kind: r() < 0.5 ? 'casino' : 'purser', game: GAMES[Math.floor(r() * GAMES.length)], action: ACTIONS[Math.floor(r() * ACTIONS.length)], input: junk(r), id: `z${i}abc` };
        if (t === 'chat') m.text = junk(r);
        if (t === 'emote') m.e = junk(r);
        if (t === 'block' || t === 'report') Object.assign(m, { id: junk(r), on: junk(r), reason: junk(r) });
        if (t === 'look') m.look = junk(r);
        if (t === 'cabinColor') m.color = junk(r);
        if (t === 'password') Object.assign(m, { old: junk(r), next: junk(r) });
        if (t === 'hello') Object.assign(m, { v: junk(r), token: junk(r) });
        if (t === 'login' || t === 'register') Object.assign(m, { name: junk(r), password: junk(r), look: junk(r) });
        msg = JSON.stringify(m);
      }
      srv.message(c, msg as string);
      if (i % 10 === 0) srv.broadcastSnapshots();
    }
  } finally { console.error = orig; }
  assert.deepEqual(errors, [], 'aucune exception inattendue');
  // Chaque joueur reçoit toujours une réponse et garde un solde valide
  for (let i = 0; i < socks.length; i++) {
    out[i].length = 0;
    srv.message(socks[i], JSON.stringify({ t: 'ping' }));
    assert.ok(out[i].some((d) => d === JSON.stringify({ t: 'pong' })), `joueur ${i} répond encore`);
    srv.message(socks[i], JSON.stringify({ t: 'req', req: { kind: 'purser', game: 'purser', action: 'stat', input: { key: 'greetings', by: 1 }, id: `final${i}abc` } }));
    const res = out[i].map((d) => JSON.parse(d)).find((m) => m.t === 'res');
    assert.ok(res && Number.isInteger(res.reply.balance) && res.reply.balance >= 0, `solde valide pour ${i}`);
  }
  srv.stop();
});
