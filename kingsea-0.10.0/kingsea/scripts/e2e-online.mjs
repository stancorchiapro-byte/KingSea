// Test de bout en bout du multijoueur : un vrai serveur KingSea + deux téléphones émulés (Chromium tactile).
// Vérifie : création de compte, présence mutuelle, déplacements synchronisés, chat, emotes, économie
// côté serveur, liste des joueurs, blocage, signalement, coupure réseau et reconnexion, reprise de session.
// Usage : npm run build && node scripts/e2e-online.mjs   (captures dans e2e-shots/online-*)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const ADMIN = 'test-admin';
const base = `http://127.0.0.1:${PORT}`;
mkdirSync('e2e-shots', { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok }); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', '--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT), KS_DB: ':memory:', KS_ADMIN_TOKEN: ADMIN }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => { server.stdout.on('data', (d) => { if (String(d).includes('serveur prêt')) res(); }); server.on('exit', () => rej(new Error('serveur arrêté'))); setTimeout(() => rej(new Error('serveur trop lent')), 15000); });

const browser = await chromium.launch();
const errors = [];
async function phone(label) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('kingsea.ageOk', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e}`));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(60); await touch('touchEnd', []); await sleep(150); };
  const center = (expr) => page.evaluate((e) => { const b = eval(e); return b ? [b.x + b.w / 2, b.y + b.h / 2] : null; }, expr);
  const tapBtn = async (expr) => { const c = await center(expr); if (!c) throw new Error(`bouton introuvable : ${expr}`); await tap(...c); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const waitFor = async (fn, ms = 8000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(120); } return false; };
  return { ctx, page, touch, tap, tapBtn, ev, waitFor, label };
}

const termsRefused = [];
async function signUp(p, name) {
  await p.page.goto(`${base}/?debug=1`);
  await sleep(3300);
  // Menu : choisir le mode « En ligne » puis « Embarquer en ligne »
  await p.tapBtn("window.__ksMenu.layer.buttons.find((b) => b.id === 'mode-online')"); await sleep(300);
  await p.tapBtn("window.__ksMenu.layer.buttons.find((b) => b.id === 'play')"); await sleep(1300);
  const probed = await p.waitFor(() => window.__ksConnect?.probe.state === 'ok', 5000);
  await p.tapBtn("window.__ksConnect.layer.buttons.find((b) => b.id === 'register')"); await sleep(300);
  await p.page.fill('#ks-auth input[name=name]', name);
  await p.page.fill('#ks-auth input[name=password]', 'motdepasse1');
  // Sans accepter les conditions (âge + confidentialité) : refusé
  await p.page.click('#ks-auth button[type=submit]'); await sleep(200);
  termsRefused.push(/Coche la case/.test(await p.page.textContent('#ks-auth [data-err]')));
  await p.page.check('#ks-auth input[name=terms]');
  await p.page.click('#ks-auth button[type=submit]');
  const inWorld = await p.waitFor(() => !!window.__ks?.scene?.presence && window.__ks.services.online, 8000);
  return probed && inWorld;
}

try {
  const A = await phone('A'), B = await phone('B');
  const okA = await signUp(A, 'Alice'), okB = await signUp(B, 'Bruno');
  await A.page.screenshot({ path: 'e2e-shots/online-01-connexion.png' });
  check('Deux comptes créés depuis l’écran de connexion (âge + conditions obligatoires), entrée dans le monde en ligne', okA && okB && termsRefused.length === 2 && termsRefused.every(Boolean));
  const bal = await A.ev(() => window.__ks.services.wallet.balance);
  check('Profil en ligne fourni par le serveur (500 KSCoins de départ)', bal === 500, String(bal));

  // Présence mutuelle dans le hall
  const seeEach = await A.waitFor(() => window.__ks.scene.presence.remotes.size === 1, 5000) && await B.waitFor(() => window.__ks.scene.presence.remotes.size === 1, 5000);
  const nameSeen = await A.ev(() => [...window.__ks.scene.presence.remotes.values()][0]?.name);
  check('Chacun voit l’autre joueur dans le hall', seeEach && nameSeen === 'Bruno', String(nameSeen));

  // Déplacement de Bruno au joystick → visible chez Alice
  const before = await A.ev(() => [...window.__ks.scene.presence.remotes.values()][0].x);
  await B.touch('touchStart', [[140, 290]]); for (let i = 1; i <= 10; i++) { await B.touch('touchMove', [[140 + i * 6, 290]]); await sleep(16); }
  await sleep(1200); await B.touch('touchEnd', []); await sleep(500);
  const after = await A.ev(() => [...window.__ks.scene.presence.remotes.values()][0].x);
  const bx = await B.ev(() => window.__ks.scene.player.x);
  check('Déplacement synchronisé (Bruno marche, Alice le voit bouger)', after - before > 40 && Math.abs(after - bx) < 12, `Δ ${Math.round(after - before)}, écart ${Math.round(after - bx)}`);
  await A.page.screenshot({ path: 'e2e-shots/online-02-presence.png' });

  // Chat : Bruno écrit, Alice reçoit (insulte masquée)
  await B.tapBtn('window.__ks.scene.hud.chatBtn'); await sleep(300);
  await B.page.fill('#ks-chat input', 'Bonjour Alice, quel idiot ce mouette !');
  await B.page.press('#ks-chat input', 'Enter'); await sleep(600);
  const got = await A.waitFor(() => window.__ks.scene.presence.chat.some((l) => l.name === 'Bruno'), 3000);
  const text = await A.ev(() => window.__ks.scene.presence.chat.find((l) => l.name === 'Bruno')?.text);
  const bubble = await A.ev(() => !![...window.__ks.scene.presence.remotes.values()][0].bubble);
  await B.page.screenshot({ path: 'e2e-shots/online-03-chat-saisie.png' });
  await A.page.screenshot({ path: 'e2e-shots/online-04-chat-bulle.png' });
  check('Chat : message reçu, bulle au-dessus du joueur, insulte masquée', got && bubble && text === 'Bonjour Alice, quel ***** ce mouette !', String(text));
  // Anti-spam
  for (let i = 0; i < 4; i++) { await B.page.fill('#ks-chat input', `spam ${i}`); await B.page.press('#ks-chat input', 'Enter'); }
  await sleep(500);
  const toastSpam = await B.ev(() => window.__ks.scene.toasts.list.some((t) => /instant|affilée|sourdine|déjà/.test(t.text)));
  check('Anti-spam : messages trop rapprochés refusés avec un message clair', toastSpam);
  await B.tapBtn('window.__ks.scene.hud.chatBtn'); // garde la barre ouverte (déjà ouverte)
  await B.page.click('#ks-chat [data-close]'); await sleep(200);

  // Emote d'Alice vue par Bruno
  await A.tapBtn('window.__ks.scene.hud.emoteBtn'); await sleep(300);
  await A.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'ecat-social')"); await sleep(250);
  await A.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'emote-wave')"); await sleep(600);
  const emoteSeen = await B.ev(() => [...window.__ks.scene.presence.remotes.values()][0]?.emote?.e);
  check('Emote : le salut d’Alice apparaît chez Bruno', emoteSeen === 'wave', String(emoteSeen));

  // Économie côté serveur : roue du jour d'Alice
  // (le serveur refuse les téléportations : on « arrive » à côté de la roue par l'ascenseur)
  await A.ev(() => window.__ks.scene.loadFloor('hub', false, 'elevator', { x: 25, y: 11.2 }));
  await sleep(600); await A.tapBtn('window.__ks.scene.hud.interactBtn'); await sleep(1200);
  const isWheel = await A.ev(() => window.__ksGame?.game?.id === 'wheel');
  await A.tapBtn('window.__ksGame.game.btn'); await sleep(4800);
  const balWheel = await A.ev(() => window.__ks.services.wallet.balance);
  await A.tapBtn('window.__ksGame.quitBtn'); await sleep(1200);
  const backendOnline = await A.ev(() => window.__ks.services.backend.online);
  check('Économie : roue du jour tirée et payée par le serveur', isWheel && backendOnline && balWheel > 500, `${balWheel} KSCoins`);

  // KS Pass Croisière : sans lui, le serveur refuse les autres ponts ; remis à la réception
  await A.ev(() => window.__ks.scene.loadFloor('casino', false, 'elevator', { x: 4.5, y: 8.2 })); await sleep(500);
  const deniedFloor = await A.ev(() => window.__ks.scene.floor.id);
  const passA = await A.ev(async () => { const r = await window.__ks.services.ask('purser', 'purser', 'gift', {}); return r.ok && window.__ks.services.itemCount('ks-pass') === 1; });
  const passB = await B.ev(async () => (await window.__ks.services.ask('purser', 'purser', 'gift', {})).ok && window.__ks.services.itemCount('ks-pass') === 1);
  check('KS Pass Croisière : casino refusé sans le pass, pass remis par la réception (serveur)', deniedFloor === 'hub' && passA && passB, deniedFloor);
  // Casino en ligne : roulette jouée au doigt à une table multijoueur, tirage et paiement par le serveur
  await A.ev(() => window.__ks.scene.loadFloor('casino', false, 'elevator', { x: 4.5, y: 8.2 }));
  await sleep(700); await A.tapBtn('window.__ks.scene.hud.interactBtn'); await sleep(1300);
  const isRoulette = await A.ev(() => window.__ksGame?.game?.id === 'roulette');
  // Caisse en ligne : 200 KSCoins → 200 jetons, échange validé par le serveur (les deux soldes ensemble)
  const ex0 = await A.ev(() => [window.__ks.services.wallet.balance, window.__ks.services.chips.balance]);
  const exOk = await A.ev(async () => (await window.__ks.services.ask('purser', 'purser', 'exchange', { dir: 'buy', amount: 200 })).ok);
  const ex1 = await A.ev(() => [window.__ks.services.wallet.balance, window.__ks.services.chips.balance]);
  check('Caisse en ligne : KSCoins → jetons, validé par le serveur', exOk && ex1[0] === ex0[0] - 200 && ex1[1] === ex0[1] + 200, `${ex0} → ${ex1}`);
  const r0 = await A.ev(() => window.__ks.services.chips.balance);
  // Journal des réponses du serveur (mise, gain, KSCoins de montée de niveau éventuelle)
  await A.ev(() => { const sv = window.__ks.services; window.__asks = []; const o = sv.absorb.bind(sv); sv.absorb = (...x) => { const r = o(...x); window.__asks.push({ r }); return r; }; });
  const atTable = await A.waitFor(() => !!window.__ksGame.table?.state, 4000);
  const redCell = await A.ev(() => { const c = window.__ksGame.game.cells.find((c) => c.kind.type === 'red'); return [c.x + c.w / 2, c.y + c.h / 2]; });
  await A.tap(...redCell);
  await A.tapBtn('window.__ksGame.game.btn.spin');
  await A.waitFor(() => window.__ksGame.game.spin === null && window.__ksGame.game.result !== null, 9000);
  const res = await A.ev(() => window.__ksGame.game.result);
  const r1 = await A.ev(() => window.__ks.services.chips.balance);
  const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(res);
  await A.page.screenshot({ path: 'e2e-shots/online-08-roulette.png' });
  await A.tapBtn('window.__ksGame.quitBtn'); await sleep(500);
  await A.tapBtn("window.__ksGame.modal?.layer.buttons.find((b) => b.label === 'Retour au navire')"); await sleep(1000); // bilan de session
  const L = await A.ev(() => window.__asks.filter((x) => x.r.ok).reduce((a, x) => ({ stake: a.stake + x.r.stake, payout: a.payout + x.r.payout }), { stake: 0, payout: 0 }));
  check('Casino en ligne : roulette en jetons à une table (instance serveur), tirée et payée par le serveur', atTable && isRoulette && L.stake > 0 && L.payout === (red ? L.stake * 2 : 0) && r1 === r0 - L.stake + L.payout, `résultat ${res}, ${r0} → ${r1} jetons (mise ${L.stake}, gain ${L.payout})`);
  // Inventaire en ligne : plat emporté au bar, consommé, jauges renvoyées par le serveur
  const inv = await A.ev(async () => { const sv = window.__ks.services; const b = await sv.ask('purser', 'purser', 'buy', { menu: 'hub', id: 'croissant' }); const n1 = sv.itemCount('food.croissant'); const c = await sv.ask('purser', 'purser', 'consume', { item: 'food.croissant' }); return { b: b.ok, n1, c: c.ok, n2: sv.itemCount('food.croissant'), h: sv.eco?.needs.hunger }; });
  check('Inventaire en ligne : achat rangé, consommé une fois, jauges du serveur', inv.b && inv.n1 >= 1 && inv.c && inv.n2 === inv.n1 - 1 && typeof inv.h === 'number', JSON.stringify(inv));
  await A.ev(() => window.__ks.scene.loadFloor('hub', false, 'elevator', { x: 17, y: 6 }));
  await sleep(800);

  // Amis : code ami unique, demande par code, acceptation, statut en ligne (persisté par le serveur)
  await A.tapBtn('window.__ks.scene.hud.playersBtn'); await sleep(700);
  const codeA = await A.ev(() => window.__ks.scene.modal?.data?.code ?? null);
  await B.tapBtn('window.__ks.scene.hud.playersBtn'); await sleep(700);
  await B.ev((c) => window.__ks.services.net.send({ t: 'friendAdd', query: c }), codeA); await sleep(800);
  await A.page.screenshot({ path: 'e2e-shots/online-04b-demande-ami.png' });
  await A.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id.startsWith('f-accept-'))"); await sleep(900);
  const friendsA = await A.ev(() => window.__ks.scene.modal?.data?.friends ?? []);
  const friendsB = await B.ev(() => window.__ks.scene.modal?.data?.friends ?? []);
  await A.page.screenshot({ path: 'e2e-shots/online-04c-amis.png' });
  check('Amis : code ami, demande, acceptation, statut en ligne et avatar des deux côtés', /^KS-[2-9A-Z]{6}$/.test(codeA ?? '') && friendsA[0]?.name === 'Bruno' && friendsA[0]?.online === true && friendsB[0]?.name === 'Alice' && !!friendsA[0]?.look?.skin && !!friendsB[0]?.look?.outfit, `${codeA} · ${friendsA.map((f) => f.name)} / ${friendsB.map((f) => f.name)}`);
  await A.ev(() => window.__ks.scene.modal?.close()); await sleep(200);
  await B.ev(() => window.__ks.scene.modal?.close()); await sleep(200);

  // Téléphone : message privé d'Alice à Bruno (persisté par le serveur), non-lu chez Bruno
  const bobId = await B.ev(() => window.__ks.services.data.playerId);
  const dm = await A.ev(async (id) => window.__ks.scene.phone.send(id, 'Rendez-vous au casino ?'), bobId);
  const unreadB = await B.waitFor(() => (window.__ks.scene.phone?.unread ?? 0) >= 1, 4000);
  await B.tapBtn('window.__ks.scene.hud.phoneBtn'); await sleep(700);
  await B.page.screenshot({ path: 'e2e-shots/online-10-telephone.png' });
  check('Téléphone : message privé envoyé, reçu et compté comme non lu', dm.ok && unreadB, JSON.stringify(dm));
  await B.ev(() => window.__ks.scene.modal?.close()); await sleep(200);
  // Cadeau : 50 KSCoins d'Alice à Bruno (limite glissante de 24 h, opération unique côté serveur)
  const bb0 = await B.ev(() => window.__ks.services.wallet.balance);
  const gift = await A.ev(async (id) => { const r = await window.__ks.scene.phone.gift(id, { kind: 'coins', amount: 50 }); return { ok: r.ok, left: r.allowance.coinsLeft }; }, bobId);
  const gotGift = await B.waitFor((b0) => window.__ks.services.wallet.balance === b0 + 50, 4000, bb0);
  check('Cadeau entre amis : 50 KSCoins reçus, capacité restante 950 sur 24 h', gift.ok && gift.left === 950 && gotGift, JSON.stringify(gift));
  // Table partagée : Bruno rejoint la roulette d'Alice ; une manche commune, même numéro pour les deux
  for (const P of [A, B]) {
    await P.ev(() => window.__ks.scene.loadFloor('casino', false, 'elevator', { x: 4.5, y: 8.2 })); await sleep(700);
    await P.tapBtn('window.__ks.scene.hud.interactBtn'); await sleep(1400);
  }
  const sameTable = await A.waitFor(() => window.__ksGame?.table?.state?.seats.length === 2, 5000);
  const tid = await Promise.all([A.ev(() => window.__ksGame.table.state.id), B.ev(() => window.__ksGame.table.state.id)]);
  const rounds = await Promise.all([
    A.ev(async () => { await window.__ks.services.ask('purser', 'purser', 'exchange', { dir: 'buy', amount: 20 }); const r = await window.__ksGame.playRound('roulette', 'play', { bets: [{ kind: { type: 'red' }, amount: 10 }] }, 10); return r.ok ? r.view.result : r.error; }),
    B.ev(async () => { await window.__ks.services.ask('purser', 'purser', 'exchange', { dir: 'buy', amount: 20 }); const r = await window.__ksGame.playRound('roulette', 'play', { bets: [{ kind: { type: 'black' }, amount: 10 }] }, 10); return r.ok ? r.view.result : r.error; }),
  ]);
  await A.page.screenshot({ path: 'e2e-shots/online-11-table.png' });
  check('Table multijoueur : même instance (2/5), un tirage commun pour les deux joueurs', sameTable && tid[0] === tid[1] && typeof rounds[0] === 'number' && rounds[0] === rounds[1], `${tid.join(' / ')} · ${rounds.join(' / ')}`);
  for (const P of [A, B]) { await P.ev(() => window.__ksGame.quit()); await sleep(600); await P.ev(() => window.__ksGame?.modal?.layer.buttons.find((b) => b.label === 'Retour au navire')?.onTap()); await sleep(1200); }
  // Visite : Alice sonne chez Bruno, Bruno ouvre, Alice entre dans la cabine de Bruno
  await B.ev(() => window.__ks.services.net.send({ t: 'cabin' })); await sleep(500);
  await A.ev((id) => window.__ks.scene.phone.ring(id), bobId);
  const rang = await B.waitFor(() => window.__ks.scene.modal?.title === 'On sonne à ta porte !', 4000);
  await B.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.label === 'Ouvrir la porte')");
  const inside = await A.waitFor((id) => window.__ks.scene.floor.id === 'cabin-interior' && window.__ks.scene.visit?.owner === id, 6000, bobId);
  await A.page.screenshot({ path: 'e2e-shots/online-12-visite.png' });
  check('Visite de cabine : sonnette chez l’hôte, porte ouverte, entrée dans la bonne cabine', rang && inside);
  await A.ev(() => window.__ks.scene.loadFloor('hub', false, 'elevator', { x: 17, y: 6 })); await sleep(800);
  await B.ev(() => window.__ks.scene.loadFloor('hub', false, 'elevator', { x: 15, y: 6 })); await sleep(800);
  await B.tapBtn('window.__ks.scene.hud.playersBtn'); await sleep(700);

  // Liste des joueurs (onglet « En ligne » du menu Amis), blocage
  await B.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'ftab-online')"); await sleep(700);
  const listed = await B.ev(() => window.__ks.scene.modal?.title);
  await B.page.screenshot({ path: 'e2e-shots/online-05-joueurs.png' });
  const aliceId = await A.ev(() => window.__ks.services.data.playerId);
  await B.tapBtn(`window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'block-${aliceId}')`); await sleep(400);
  await B.tapBtn(`window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'report-${aliceId}')`); await sleep(300);
  await B.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'reason-0')"); await sleep(600);
  await A.tapBtn('window.__ks.scene.hud.chatBtn'); await sleep(300);
  await A.page.fill('#ks-chat input', 'Tu me lis ?'); await A.page.press('#ks-chat input', 'Enter'); await sleep(800);
  await A.page.click('#ks-chat [data-close]');
  const blockedOk = await B.ev(() => !window.__ks.scene.presence.chat.some((l) => l.text === 'Tu me lis ?'));
  const reports = await (await fetch(`${base}/api/reports`, { headers: { authorization: `Bearer ${ADMIN}` } })).json();
  check('Liste des joueurs, blocage (messages masqués) et signalement enregistré', /Joueurs en ligne \(2\)/.test(listed ?? '') && blockedOk && reports.length === 1 && reports[0].reason === 'Insultes', `${listed} · ${reports.length} signalement(s)`);

  const lastBal = await A.ev(() => window.__ks.services.wallet.balance);
  const lastChips = await A.ev(() => window.__ks.services.chips.balance);
  // Coupure réseau d'Alice : reconnexion automatique, Bruno la revoit
  await A.ev(() => window.__ks.services.net.ws.close());
  await sleep(300);
  const leftSeen = await B.waitFor(() => window.__ks.scene.presence.remotes.size === 0, 3000);
  const reco = await A.waitFor(() => window.__ks.services.net.state === 'online', 6000);
  const backSeen = await B.waitFor(() => window.__ks.scene.presence.remotes.size === 1, 4000);
  await A.page.screenshot({ path: 'e2e-shots/online-06-reconnexion.png' });
  check('Coupure réseau : départ vu par les autres, reconnexion automatique, retour dans l’étage', leftSeen && reco && backSeen);

  // Rechargement complet : reprise de session par jeton, même solde
  await A.page.reload(); await sleep(3300);
  await A.tapBtn("window.__ksMenu.layer.buttons.find((b) => b.id === 'mode-online')"); await sleep(300);
  await A.tapBtn("window.__ksMenu.layer.buttons.find((b) => b.id === 'play')"); await sleep(1300);
  await A.waitFor(() => window.__ksConnect?.probe.state === 'ok', 4000);
  const hasResume = await A.ev(() => window.__ksConnect.layer.buttons.find((b) => b.id === 'resume')?.visible);
  await A.page.screenshot({ path: 'e2e-shots/online-07-reprise.png' });
  await A.tapBtn("window.__ksConnect.layer.buttons.find((b) => b.id === 'resume')");
  await A.waitFor(() => !!window.__ks?.scene?.presence, 6000);
  const balAfter = await A.ev(() => window.__ks.services.wallet.balance);
  const offlineSave = await A.ev(() => JSON.parse(localStorage.getItem('kingsea.save.v1') ?? 'null')?.wallet?.balance ?? null);
  const chipsAfter = await A.ev(() => window.__ks.services.chips.balance);
  check('Reprise de session (« Continuer ») : mêmes KSCoins et jetons, partie hors ligne séparée', hasResume && balAfter === lastBal && chipsAfter === lastChips && offlineSave !== balAfter, `${balAfter} KSCoins · ${chipsAfter} jetons en ligne`);

  // Mauvais mot de passe
  const C = await phone('C');
  await C.page.goto(`${base}/?debug=1`); await sleep(3300);
  await C.tapBtn("window.__ksMenu.layer.buttons.find((b) => b.id === 'mode-online')"); await sleep(300);
  await C.tapBtn("window.__ksMenu.layer.buttons.find((b) => b.id === 'play')"); await sleep(1300);
  await C.waitFor(() => window.__ksConnect?.probe.state === 'ok', 4000);
  await C.tapBtn("window.__ksConnect.layer.buttons.find((b) => b.id === 'login')"); await sleep(300);
  await C.page.fill('#ks-auth input[name=name]', 'Alice'); await C.page.fill('#ks-auth input[name=password]', 'faux-mot');
  await C.page.click('#ks-auth button[type=submit]'); await sleep(1200);
  const err = await C.page.textContent('#ks-auth [data-err]');
  check('Connexion refusée avec un mauvais mot de passe', /incorrect/.test(err ?? ''), String(err));

  // Changement de mot de passe puis suppression du compte depuis le jeu (exigences des boutiques)
  await A.tapBtn('window.__ks.scene.hud.settingsBtn'); await sleep(400);
  await A.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'more')"); await sleep(300);
  await A.page.screenshot({ path: 'e2e-shots/online-08-compte.png' });
  await A.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'pw')"); await sleep(300);
  await A.page.fill('#ks-password input[name=old]', 'motdepasse1');
  await A.page.fill('#ks-password input[name=next]', 'nouveau-secret');
  await A.page.fill('#ks-password input[name=again]', 'nouveau-secret');
  await A.page.click('#ks-password button[type=submit]'); await sleep(800);
  const pwMsg = await A.page.textContent('#ks-password [data-msg]');
  check('Changement de mot de passe dans le jeu', /modifié/.test(pwMsg ?? ''), String(pwMsg));
  await sleep(1800);
  await A.tapBtn("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'delete')"); await sleep(300);
  await A.page.fill('#ks-delete input[name=password]', 'motdepasse1');
  await A.page.click('#ks-delete button[type=submit]'); await sleep(800);
  const wrongDel = await A.page.textContent('#ks-delete [data-msg]');
  await A.page.fill('#ks-delete input[name=password]', 'nouveau-secret');
  await A.page.screenshot({ path: 'e2e-shots/online-09-suppression.png' });
  await A.page.click('#ks-delete button[type=submit]');
  const backMenu = await A.waitFor(() => window.__ksApp?.game.current === window.__ksMenu && !window.__ks.services.online, 8000);
  const goneB = await B.waitFor(() => window.__ks.scene.presence.remotes.size === 0, 4000);
  const tokenGone = await A.ev(() => localStorage.getItem('kingsea.token') === null);
  check('Suppression du compte dans le jeu : mot de passe vérifié, retour au menu hors ligne, disparu pour les autres', /incorrect/.test(wrongDel ?? '') && backMenu && goneB && tokenGone, String(wrongDel));
  C.page.on('dialog', (d) => d.accept());
  await C.page.goto(`${base}/delete-account`);
  const page404 = await C.page.textContent('h1');
  await C.page.fill('#n', 'Alice'); await C.page.fill('#p', 'nouveau-secret'); await C.page.click('button[type=submit]'); await sleep(800);
  check('Page web de suppression : le compte supprimé n’existe plus', /Supprimer/.test(page404 ?? '') && /incorrect/.test((await C.page.textContent('#msg')) ?? ''));

  // Session refusée pendant une reconnexion (compte supprimé par l'administrateur) : retour au menu avec un
  // message clair, au lieu d'un « Reconnexion… » sans fin
  await fetch(`${base}/api/admin/delete`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bruno' }) });
  await B.ev(() => window.__ks.services.net.ws?.close());
  const bMenu = await B.waitFor(() => window.__ksApp?.game.current === window.__ksMenu, 9000);
  const bToken = await B.ev(() => localStorage.getItem('kingsea.token'));
  check('Session refusée à la reconnexion : retour au menu (pas de « Reconnexion… » infini), jeton effacé', bMenu && bToken === null, `menu ${bMenu}`);

  // Icônes du jeu servies par le serveur (onglet, écran d'accueil) : vraies images, pas la page HTML
  const icon = await fetch(`${base}/icons/apple-touch-icon.png`);
  const fav = await fetch(`${base}/favicon.ico`);
  const miss = await fetch(`${base}/icons/inexistant.png`);
  const man = await (await fetch(`${base}/manifest.webmanifest`)).json();
  check('Icônes servies en ligne : PNG réels, manifeste, 404 pour une image absente', icon.headers.get('content-type') === 'image/png' && fav.headers.get('content-type') === 'image/png' && miss.status === 404 && man.icons?.length >= 2, `${icon.headers.get('content-type')} / ${miss.status}`);

  check('Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Exécution du scénario', false, String(e));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
process.exit(failed ? 1 : 0);
