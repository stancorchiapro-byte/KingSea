// Banc d'essai réseau du serveur (sans réseau réel) : N joueurs dans le même étage, tous en mouvement,
// 10 instantanés par seconde. Mesure les octets reçus par joueur et par seconde et le temps de calcul serveur.
// Usage : node --import tsx scripts/bench-net.ts [joueurs=120]
import { GameServer, type Sock } from '../server/game';
import { MemoryStore } from '../server/store';
import { DEFAULT_LOOK } from '../src/art/characters';
import { PROTOCOL_VERSION, TERMS_VERSION } from '../src/net/protocol';

const N = Number(process.argv[2] ?? 120);
let now = 1_000_000;
const srv = new GameServer(new MemoryStore(), { now: () => now, rng: Math.random });
const bytes: number[] = [];
const clients = [];
for (let i = 0; i < N; i++) {
  bytes.push(0);
  const sock: Sock = { ip: `10.0.${i >> 8}.${i & 255}`, send: (d: string) => { bytes[i] += Buffer.byteLength(d); }, close: () => {} };
  const c = srv.connect(sock);
  srv.message(c, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION }));
  srv.message(c, JSON.stringify({ t: 'register', name: `Bench${i}`, password: 'motdepasse1', look: DEFAULT_LOOK, terms: TERMS_VERSION }));
  clients.push({ c, x: 6 * 32 + (i % 20) * 32, y: 6 * 32 + Math.floor(i / 20) * 16 });
}
// Laisse le temps aux inscriptions (scrypt asynchrone éventuel)
await new Promise((r) => setTimeout(r, 1500));
for (const k of clients) srv.message(k.c, JSON.stringify({ t: 'join', floor: 'hub', x: k.x, y: k.y }));
bytes.fill(0);
const SECONDS = 10;
let cpu = 0;
for (let tick = 0; tick < SECONDS * 10; tick++) {
  now += 100;
  for (const k of clients) { k.x += tick % 20 < 10 ? 8 : -8; srv.message(k.c, JSON.stringify({ t: 'move', x: k.x, y: k.y, dir: tick % 20 < 10 ? 'right' : 'left', anim: 'walk' })); }
  const t0 = performance.now();
  srv.broadcastSnapshots();
  cpu += performance.now() - t0;
}
const avg = bytes.reduce((a, b) => a + b, 0) / N / SECONDS;
console.log(`${N} joueurs dans un étage, tous en mouvement : ${(avg / 1024).toFixed(1)} Ko/s reçus par joueur · ${(cpu / (SECONDS * 10)).toFixed(2)} ms de calcul par diffusion`);
srv.stop();
process.exit(0);
