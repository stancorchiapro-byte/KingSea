// Point d'entrée du serveur KingSea : HTTP (jeu + santé + modération) et WebSocket (/ws).
// Lancer : npm run server  (port 8787 par défaut ; variables PORT, KS_DB, KS_ADMIN_TOKEN, KS_NAME)
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameServer } from './game';
import { deletePage, privacyPage, termsPage } from './pages';
import type { IncomingMessage } from 'node:http';
import { openSqliteStore, type Store, MemoryStore } from './store';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8787);
const DB = process.env.KS_DB ?? join(root, 'server', 'data', 'kingsea.db');
const ADMIN = process.env.KS_ADMIN_TOKEN ?? '';
const STATIC = join(root, 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json' };

function clientIp(req: IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ?? req.socket.remoteAddress ?? '?';
}

/** Corps JSON (4 Ko au plus) ; null s'il est absent ou invalide. */
function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 4096) { req.destroy(); resolve(null); } });
    req.on('end', () => { try { const v = JSON.parse(data); resolve(v && typeof v === 'object' ? v : null); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

export async function startServer(opts: { port?: number; store?: Store; quiet?: boolean; adminToken?: string } = {}) {
  const admin = opts.adminToken ?? ADMIN;
  let store = opts.store;
  if (!store) {
    if (DB === ':memory:') store = new MemoryStore();
    else { mkdirSync(dirname(DB), { recursive: true }); store = await openSqliteStore(DB); }
  }
  const game = new GameServer(store, { name: process.env.KS_NAME ?? 'KingSea' });
  game.start();

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (url.pathname === '/api/health') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, name: game.name, ...game.stats }));
      return;
    }
    const html = (body: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }).end(body); };
    if (url.pathname === '/privacy') { html(privacyPage()); return; }
    if (url.pathname === '/terms') { html(termsPage()); return; }
    if (url.pathname === '/delete-account') { html(deletePage()); return; }
    if (url.pathname === '/api/account/delete' && req.method === 'POST') {
      readJson(req).then((b) => {
        const r = b ? game.deleteByCredentials(b.name, b.password, clientIp(req)) : { ok: false, msg: 'Requête invalide' };
        res.writeHead(r.ok ? 200 : 400, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(r));
      });
      return;
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!admin || req.headers.authorization !== `Bearer ${admin}`) { res.writeHead(401).end('non autorisé'); return; }
      const json = (code: number, o: unknown) => res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(o, null, 2));
      if (url.pathname === '/api/admin/account' && req.method === 'GET') {
        const info = game.accountInfo(url.searchParams.get('name') ?? '');
        json(info ? 200 : 404, info ?? { error: 'compte introuvable' }); return;
      }
      if (url.pathname === '/api/admin/sanction' && req.method === 'POST') {
        readJson(req).then((b) => {
          if (!b || typeof b.name !== 'string') { json(400, { error: 'name requis' }); return; }
          const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
          const r = game.sanction(b.name, { banMinutes: num(b.banMinutes), muteMinutes: num(b.muteMinutes), reason: typeof b.reason === 'string' ? b.reason : undefined });
          json(r.ok ? 200 : 404, r);
        });
        return;
      }
      if (url.pathname === '/api/admin/delete' && req.method === 'POST') {
        // Demande de suppression reçue par e-mail (mot de passe oublié), après vérification de l'identité
        readJson(req).then((b) => {
          const cred = b && typeof b.name === 'string' ? store!.credentials(b.name) : null;
          if (!cred) { json(404, { error: 'compte introuvable' }); return; }
          game.deleteAccount(cred.id); json(200, { ok: true, deleted: cred.id });
        });
        return;
      }
      json(404, { error: 'inconnu' }); return;
    }
    if (url.pathname === '/api/reports') {
      if (!admin || req.headers.authorization !== `Bearer ${admin}`) { res.writeHead(401).end('non autorisé'); return; }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(store!.reports(100), null, 2));
      return;
    }
    // Fichiers du jeu (dist/) : un téléphone sur le même réseau peut ouvrir http://<ip>:8787
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '').replace(/\.\.[/\\]/g, '');
    let file = join(STATIC, rel || 'index.html');
    if (!file.startsWith(STATIC) || !existsSync(file) || statSync(file).isDirectory()) file = join(STATIC, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('Construire le jeu d’abord : npm run build'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const client = game.connect({ ip, send: (d) => { if (ws.readyState === ws.OPEN) ws.send(d); }, close: (code, reason) => ws.close(code, reason) });
    ws.on('message', (data) => game.message(client, data.toString()));
    ws.on('close', () => game.disconnect(client));
    ws.on('error', () => game.disconnect(client));
  });

  const port = opts.port ?? PORT;
  await new Promise<void>((r) => http.listen(port, '0.0.0.0', r));
  const actual = (http.address() as { port: number }).port;
  if (!opts.quiet) console.log(`KingSea : serveur prêt sur http://localhost:${actual} (WebSocket /ws, base ${store instanceof MemoryStore ? 'mémoire' : DB})`);
  return {
    port: actual, game,
    close: () => new Promise<void>((r) => { game.stop(); wss.close(); http.close(() => r()); }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
}
