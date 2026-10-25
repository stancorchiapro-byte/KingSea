// Test de bout en bout dans un Chromium mobile émulé (écran tactile, iPhone ~ 844×390 en paysage).
// Vérifie : chargement, menu, joystick tactile, collisions, bar + achat, ascenseur, panneau, objet caché,
// sauvegarde après mise en arrière-plan, affichage portrait. Captures dans e2e-shots/.
// Usage : npm run build:single && npm run test:e2e
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist-single/kingsea.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/?debug=1`;
mkdirSync('e2e-shots', { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const cdp = await ctx.newCDPSession(page);

const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i })) });
const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(60); await touch('touchEnd', []); await sleep(120); };
const state = () => page.evaluate(() => {
  const k = window.__ks; if (!k) return null;
  const s = k.scene;
  // Au casino (window.__e2eChips), le solde suivi est celui des jetons ; ailleurs, les KSCoins
  return { floor: s.floor.id, x: s.player.x, y: s.player.y, balance: window.__e2eChips ? k.services.chips.balance : k.services.wallet.balance, coins: k.services.wallet.balance, chips: k.services.chips.balance, modal: s.modal ? s.modal.title : null, focus: s.interactions.focused?.handler ?? null, flags: k.services.data.flags };
});
const btnCenter = (expr) => page.evaluate((e) => { const b = eval(e); return b ? [b.x + b.w / 2, b.y + b.h / 2] : null; }, expr);
// Journal des réponses de l'autorité : mise, gain et bonus (KSCoins de montée de niveau) de chaque requête
const installAsks = () => page.evaluate(() => {
  const sv = window.__ks.services; if (sv.__logged) return; sv.__logged = true; window.__asks = [];
  const orig = sv.ask.bind(sv);
  sv.ask = async (...a) => { const purse = window.__e2eChips ? sv.chips : sv.wallet; const before = purse.balance; const r = await orig(...a); window.__asks.push({ game: a[1], action: a[2], r, before, after: purse.balance }); return r; };
});
const markAsks = () => page.evaluate(() => { window.__mark = (window.__asks ?? []).length; });
/** Somme des mises, gains et bonus de niveau depuis la dernière marque. */
const sinceMark = () => page.evaluate(() => (window.__asks ?? []).slice(window.__mark ?? 0).filter((x) => x.r.ok)
  .reduce((acc, x) => ({ stake: acc.stake + x.r.stake, payout: acc.payout + x.r.payout, bonus: acc.bonus + (x.after - (x.before - x.r.stake + x.r.payout)) }), { stake: 0, payout: 0, bonus: 0 }));
const teleport = (tx, ty) => page.evaluate(([x, y]) => { const s = window.__ks.scene; s.player.seat = null; s.player.x = x * 32; s.player.y = y * 32; }, [tx, ty]);

try {
  await page.goto(url);
  await sleep(400);
  await page.screenshot({ path: 'e2e-shots/01-chargement.png' });
  await sleep(2600);
  await page.screenshot({ path: 'e2e-shots/02-menu.png' });

  const v = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const ui = Math.max(0.85, Math.min(1.35, Math.min(v.w, v.h) / 400));
  // Jouer depuis le menu (premier lancement : écran d'embarquement avec pseudo et apparence)
  const playFromMenu = async () => { await tap(...(await btnCenter("window.__ksMenu.layer.buttons.find((b) => b.id === 'play')"))); await sleep(1300); };
  // Premier lancement : avertissement d'âge (casino simulé, 18+) avant de pouvoir jouer
  await tap(...(await btnCenter("window.__ksMenu.layer.buttons.find((b) => b.id === 'play')"))); await sleep(500);
  const gate = await page.evaluate(() => window.__ksMenu.modal?.title ?? null);
  await page.screenshot({ path: 'e2e-shots/02a-age.png' });
  await tap(...(await btnCenter("window.__ksMenu.modal.layer.buttons.find((b) => /ou plus/.test(b.label))"))); await sleep(1300);
  check('Avertissement d’âge au premier lancement (18 ans ou plus), mémorisé', gate === 'Avant d’embarquer' && (await page.evaluate(() => localStorage.getItem('kingsea.ageOk'))) === '1', String(gate));
  const onProfile = await page.evaluate(() => !!window.__ksProfile && window.__ksProfile.mode === 'first');
  await page.screenshot({ path: 'e2e-shots/02b-embarquement.png' });
  const confirmDisabled = await page.evaluate(() => !window.__ksProfile.layer.buttons.find((b) => b.id === 'confirm').enabled);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'name')"))); await sleep(400);
  await page.fill('#ks-prompt input', 'Capitaine Nemo'); await page.keyboard.press('Enter'); await sleep(300);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'tab-tenue')"))); await sleep(150);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'outfit-hawai')"))); await sleep(150);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'color-#ff6f91')"))); await sleep(150);
  await page.screenshot({ path: 'e2e-shots/02c-tenue.png' });
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'confirm')"))); await sleep(1500);
  let s = await state();
  const prof = await page.evaluate(() => ({ name: window.__ks.services.data.name, look: window.__ks.services.data.appearance }));
  check('Embarquement : pseudo obligatoire, saisi au clavier virtuel, tenue choisie au toucher', onProfile && confirmDisabled && prof.name === 'Capitaine Nemo' && prof.look.outfit === 'hawai' && prof.look.color === '#ff6f91', JSON.stringify(prof.name));
  check('Menu → embarquement → monde', s?.floor === 'hub', JSON.stringify(s && { floor: s.floor }));
  await installAsks();
  await page.screenshot({ path: 'e2e-shots/03-hall.png' });

  // Joystick : glisser le pouce vers la droite pendant ~1 s
  const x0 = s.x;
  await touch('touchStart', [[140, 290]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[140 + i * 6, 290]]); await sleep(16); }
  await sleep(900);
  await page.screenshot({ path: 'e2e-shots/04-joystick.png' });
  await touch('touchEnd', []);
  s = await state();
  check('Joystick tactile : le personnage avance', s.x - x0 > 40, `Δx = ${(s.x - x0).toFixed(1)}`);

  // Multi-touch : joystick + bouton en même temps ne doit pas bloquer
  await touch('touchStart', [[140, 290]]);
  await touch('touchMove', [[140, 250]]);
  await sleep(500);
  await touch('touchEnd', []);
  s = await state();
  check('Collisions : reste dans la salle', s.y > 64 && s.x > 32 && s.x < 31 * 32);

  // Mur nord : pousser vers le haut longtemps ne traverse pas
  await teleport(11, 3);
  await touch('touchStart', [[140, 290]]);
  await touch('touchMove', [[140, 220]]);
  await sleep(1500);
  await touch('touchEnd', []);
  s = await state();
  check('Collision avec le mur nord', s.y >= 64 + 8, `y = ${s.y.toFixed(1)}`);

  // Bar : se placer devant le comptoir, toucher « Interagir »
  await teleport(5, 6.2);
  await sleep(250);
  s = await state();
  check('Le bar est ciblé à proximité', s.focus === 'bar', String(s.focus));
  const interact = await btnCenter('window.__ks.scene.hud.interactBtn');
  await tap(...interact);
  await sleep(400);
  s = await state();
  check('Menu du bar ouvert par le bouton tactile', s.modal === 'Bar KS · Hall', String(s.modal));
  await page.screenshot({ path: 'e2e-shots/05-bar.png' });
  const before = s.balance;
  await markAsks();
  const drink = await btnCenter('window.__ks.scene.modal.layer.buttons[0]');
  await tap(...drink);
  await sleep(500);
  s = await state();
  check('Achat d’une boisson débite le portefeuille', s.balance === before - 20 + (await sinceMark()).bonus && !s.modal, `${before} → ${s.balance}`);
  await page.screenshot({ path: 'e2e-shots/06-boisson.png' });

  // Réception : cadeau de bienvenue une seule fois
  await teleport(27, 6.2); await sleep(200);
  await tap(...(await btnCenter('window.__ks.scene.hud.interactBtn'))); await sleep(400);
  const gift = await btnCenter('window.__ks.scene.modal.layer.buttons[0]');
  const b1 = (await state()).balance;
  await markAsks();
  await tap(...gift); await sleep(400);
  await tap(...(await btnCenter('window.__ks.scene.hud.interactBtn'))); await sleep(400);
  await tap(...(await btnCenter('window.__ks.scene.modal.layer.buttons[0]'))); await sleep(400);
  s = await state();
  check('Cadeau de bienvenue versé une seule fois', s.balance === b1 + 100 + (await sinceMark()).bonus, `${b1} → ${s.balance}`);

  // Ascenseur via le bouton « Étages » du HUD
  await tap(...(await btnCenter('window.__ks.scene.hud.floorsBtn')));
  await sleep(400);
  await page.screenshot({ path: 'e2e-shots/07-ascenseur.png' });
  const enabledCount = await page.evaluate(() => window.__ks.scene.modal.layer.buttons.filter((b) => b.id.startsWith('floor-') && b.enabled).length);
  check('Ascenseur : les 5 autres étages sont accessibles', enabledCount === 5, String(enabledCount));
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'floor-engine')")));
  await sleep(1400);
  s = await state();
  check('Voyage vers la salle des machines', s.floor === 'engine', s.floor);
  await page.screenshot({ path: 'e2e-shots/08-machines.png' });

  // Objet caché invisible avant l'éclairage
  await teleport(27.5, 16.6); await sleep(200);
  s = await state();
  check('Boussole introuvable sans éclairage', s.focus !== 'compass', String(s.focus));

  // Panneau de contrôle (toucher direct sur l'objet)
  await teleport(22.5, 3.2); await sleep(300);
  const panelScreen = await page.evaluate(() => { const s = window.__ks.scene, v = window.__ks.services.game.viewport, z = s.cam.zoom; const wx = 22.5 * 32, wy = 1 * 32; return [(wx - s.cam.x) * z + v.width / 2, (wy - s.cam.y) * z + v.height / 2]; });
  await tap(...panelScreen); await sleep(400);
  s = await state();
  check('Toucher direct le panneau active l’éclairage', s.flags['engine.lights'] === true);
  await page.screenshot({ path: 'e2e-shots/09-eclairage.png' });

  await teleport(27.5, 16.6); await sleep(300);
  s = await state();
  check('Boussole visible avec l’éclairage', s.focus === 'compass', String(s.focus));
  const b2 = s.balance;
  await tap(...(await btnCenter('window.__ks.scene.hud.interactBtn'))); await sleep(500);
  await page.screenshot({ path: 'e2e-shots/10-boussole.png' });
  s = await state();
  check('Boussole ramassée : +75 KSCoins', s.balance === b2 + 75 && s.flags['found.golden-compass'] === true, `${b2} → ${s.balance}`);

  // ---------------- Phase 2 : escaliers, casino, arcade, logements, rooftop
  const tapInteract = async () => tap(...(await btnCenter('window.__ks.scene.hud.interactBtn')));
  if ((await state()).modal) { await tap(...(await btnCenter('window.__ks.scene.modal.layer.buttons[0]'))); await sleep(300); }
  // Escalier montant de la salle des machines → hall
  await teleport(28, 9.2); await sleep(250);
  s = await state();
  check('Escalier ciblé dans la salle des machines', s.focus === 'stairs-up', String(s.focus));
  await tapInteract(); await sleep(1700);
  s = await state();
  check('Escalier : salle des machines → hall', s.floor === 'hub' && s.x < 32 * 4, `${s.floor} x=${s.x.toFixed(0)}`);
  // Hall → casino par l'escalier de droite
  await teleport(30, 9.2); await sleep(250); await tapInteract(); await sleep(1700);
  s = await state();
  check('Escalier : hall → casino', s.floor === 'casino', s.floor);
  await page.screenshot({ path: 'e2e-shots/13-casino.png' });
  await teleport(17, 18.2); await sleep(250);
  s = await state();
  check('Caisse du casino ciblée', s.focus === 'cashier', String(s.focus));
  await tapInteract(); await sleep(400);
  s = await state();
  check('Caisse du casino ouverte', s.modal === 'Caisse du casino', String(s.modal));
  await page.screenshot({ path: 'e2e-shots/14-caisse.png' });
  // Échange KSCoins → jetons : 100 jetons, double toucher sur « Confirmer » (un seul échange)
  const cashBefore = await page.evaluate(() => [window.__ks.services.wallet.balance, window.__ks.services.chips.balance]);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'cash-100')"))); await sleep(200);
  const conf = await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'cash-confirm')");
  await tap(...conf); await tap(...conf); await sleep(500);
  const cashAfter = await page.evaluate(() => [window.__ks.services.wallet.balance, window.__ks.services.chips.balance]);
  check('Caisse : 100 KSCoins → 100 jetons, une seule fois malgré le double toucher', cashAfter[0] === cashBefore[0] - 100 && cashAfter[1] === cashBefore[1] + 100, `${cashBefore} → ${cashAfter}`);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'close')"))); await sleep(300);
  check('Caisse refermée', (await state()).modal === null);

  // Ascenseur → logements : attribution d'une cabine unique
  await tap(...(await btnCenter('window.__ks.scene.hud.floorsBtn'))); await sleep(350);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'floor-cabins')"))); await sleep(2600);
  const cab = await page.evaluate(() => window.__ks.services.data.cabin.id);
  s = await state();
  check('Logements : cabine attribuée et sauvegardée', s.floor === 'cabins' && /^3(0[1-9]|1\d|20)$/.test(cab ?? ''), String(cab));
  const door = await page.evaluate((id) => { const d = window.__ks.scene.floor.props.find((p) => p.kind === 'cabinDoor' && p.id === id); return [d.tx + 0.5, d.ty + 2.6]; }, cab);
  await teleport(...door); await sleep(250);
  const ownLabel = await page.evaluate((id) => window.__ks.scene.interactions.items.find((i) => i.ref && i.ref.id === id)?.label, cab);
  await tapInteract(); await sleep(1200);
  s = await state();
  check('Porte de sa propre cabine reconnue et ouverte', s.floor === 'cabin-interior' && ownLabel === `Ma cabine ${cab}`, `${s.floor} / ${ownLabel}`);
  await page.screenshot({ path: 'e2e-shots/15-cabine.png' });
  await teleport(7, 8.4); await sleep(250); await tapInteract(); await sleep(1200);

  // Escalier → rooftop, snack, transat
  await teleport(37.6, 4.2); await sleep(250); await tapInteract(); await sleep(1700);
  s = await state();
  check('Escalier : logements → rooftop', s.floor === 'rooftop', s.floor);
  await teleport(4, 18.4); await sleep(250);
  await tapInteract(); await sleep(400);
  const b3 = (await state()).balance;
  await tap(...(await btnCenter('window.__ks.scene.modal.layer.buttons[0]'))); await sleep(400);
  s = await state();
  check('Snack : achat débité', s.balance === b3 - 35 && !s.modal, `${b3} → ${s.balance}`);
  await teleport(12.5, 17); await sleep(250);
  s = await state();
  check('Transat ciblé', s.focus === 'sit', String(s.focus));
  await tapInteract(); await sleep(300);
  const seated = await page.evaluate(() => !!window.__ks.scene.player.seat);
  await page.screenshot({ path: 'e2e-shots/16-transat.png' });
  await touch('touchStart', [[140, 290]]); await touch('touchMove', [[140, 340]]); await sleep(500); await touch('touchEnd', []);
  const stood = await page.evaluate(() => { const s = window.__ks.scene; return !s.player.seat && !s.map.collides({ x: s.player.x - 8, y: s.player.y - 9, w: 16, h: 9 }); });
  check('S’allonger puis se relever au joystick (sans rester coincé)', seated && stood);
  await teleport(30.5, 17); await sleep(600);
  await page.screenshot({ path: 'e2e-shots/17-piste.png' });

  // Arcade par l'ascenseur
  await tap(...(await btnCenter('window.__ks.scene.hud.floorsBtn'))); await sleep(350);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'floor-arcade')"))); await sleep(2600);
  await teleport(21, 7.2); await sleep(250); await tapInteract(); await sleep(400);
  s = await state();
  check('Arcade : tableau du programme', s.floor === 'arcade' && s.modal === 'Programme de l’arcade', `${s.floor} ${s.modal}`);
  await tap(...(await btnCenter('window.__ks.scene.modal.layer.buttons[0]'))); await sleep(300);
  await page.screenshot({ path: 'e2e-shots/18-arcade.png' });

  // ---------------- Phase 3 : mini-jeux, cabine, piscine, boîte de nuit
  const G = 'window.__ksGame.game';
  const game = (expr) => page.evaluate((e) => eval(e), expr);
  const quitGame = async () => {
    await tap(...(await btnCenter('window.__ksGame.quitBtn'))); await sleep(400);
    // Casino : bilan de la session affiché avant de repartir
    const back = await btnCenter("window.__ksGame?.modal?.layer.buttons.find((b) => b.label === 'Retour au navire')");
    if (back) { await tap(...back); }
    await sleep(900);
  };
  const goFloor = async (id) => { await tap(...(await btnCenter('window.__ks.scene.hud.floorsBtn'))); await sleep(350); await tap(...(await btnCenter(`window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'floor-${id}')`))); await sleep(2600); };
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await game(expr)) return true; await sleep(150); } return false; };

  // Billard (arcade)
  await teleport(4.5, 8.2); await sleep(250); await tapInteract(); await sleep(1700);
  check('Billard ouvert depuis la table', await game(`${G}.id`) === 'billiards');
  await page.evaluate(() => { window.__ksGame.game.power = 1; });
  await tap(...(await btnCenter(`${G}.btn.shoot`)));
  const settled = await waitFor(`!${G}.moving`, 9000);
  const scattered = await game(`${G}.balls.filter((b) => b.id > 0 && (!b.active || Math.hypot(b.vx, b.vy) < 1)).length`);
  const shots = await game(`${G}.shots`);
  check('Billard : la casse disperse les billes, coup compté', settled && shots >= 1 && scattered === 15, `coups ${shots}`);
  await page.screenshot({ path: 'e2e-shots/20-billard.png' });
  await quitGame();
  s = await state();
  check('Retour au navire à la même place après le billard', s.floor === 'arcade' && Math.abs(s.x - 4.5 * 32) < 2, `${s.floor} ${s.x}`);

  // Bowling (arcade) : geste de fronde
  await teleport(23, 11.2); await sleep(250); await tapInteract(); await sleep(1700);
  const ballPos = await page.evaluate(() => { const g = window.__ksGame.game; return [g.view.x + g.ball.x * g.view.s, g.view.y + g.ball.y * g.view.s]; });
  await touch('touchStart', [ballPos]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[ballPos[0] - i * 16, ballPos[1]]]); await sleep(16); }
  await touch('touchEnd', []);
  const rolled = await waitFor(`${G}.rolls.length >= 1`, 12000);
  const first = await game(`${G}.rolls[0]`);
  check('Bowling : lancer au doigt, quilles comptées', rolled && first >= 0 && first <= 10, `quilles ${first}`);
  await page.screenshot({ path: 'e2e-shots/21-bowling.png' });
  await quitGame();

  // Casino : les mises sont en jetons (achetés à la caisse avec des KSCoins)
  await goFloor('casino');
  const exch = await page.evaluate(async () => { const r = await window.__ks.services.ask('purser', 'purser', 'exchange', { dir: 'buy', amount: 300 }); window.__e2eChips = true; return r.ok; });
  check('Caisse : achat de 300 jetons pour les jeux', exch);
  const pickTable = async () => { await waitFor(`${G}.panel === 'tables'`, 3000); await tap(...(await btnCenter(`${G}.panelBtns.find((b) => b.id === 'table-debutant')`))); await sleep(300); };
  // Blackjack
  await teleport(4.5, 16.3); await sleep(250); await tapInteract(); await sleep(1700);
  const bj0 = (await state()).balance;
  await markAsks();
  await pickTable();
  check('Blackjack : choix de la table (Débutant 5–100)', (await game(`${G}.tableDef.id`)) === 'debutant');
  await tap(...(await btnCenter(`${G}.btn.deal`))); await sleep(400);
  await waitFor(`${G}.g.phase !== 'player' || ${G}.t >= ${G}.queue`, 6000);
  if (await game(`${G}.g.phase === 'player'`)) { await tap(...(await btnCenter(`${G}.btn.stand`))); await sleep(400); }
  await waitFor(`${G}.g.phase === 'settled' && !${G}.settlePending`, 8000);
  const bjRecap = await game(`${G}.recap`);
  check('Blackjack : récapitulatif (solde avant, mise, retour)', !!bjRecap && bjRecap.initial > 0 && typeof bjRecap.before === 'number', JSON.stringify(bjRecap));
  const bjPhase = await game(`${G}.g.phase`), bjPay = await game(`${G}.g.totalPayout`), bjStake = await game(`${G}.g.totalStake`);
  const bj1 = (await state()).balance;
  check('Blackjack : manche jouée, KSCoins exactes', bjPhase === 'settled' && bj1 === bj0 - bjStake + bjPay + (await sinceMark()).bonus, `${bj0} → ${bj1} (mise ${bjStake}, gain ${bjPay})`);
  await page.screenshot({ path: 'e2e-shots/22-blackjack.png' });
  await quitGame();
  // Roulette
  await teleport(4.5, 8.2); await sleep(250); await tapInteract(); await sleep(1700);
  const ro0 = (await state()).balance;
  await markAsks();
  const red = await page.evaluate(() => { const c = window.__ksGame.game.cells.find((c) => c.kind.type === 'red'); return [c.x + c.w / 2, c.y + c.h / 2]; });
  await tap(...red);
  await tap(...(await btnCenter(`${G}.btn.spin`)));
  await sleep(300);
  await tap(...(await btnCenter('window.__ksGame.quitBtn'))); await sleep(400);
  const stillIn = await game(`${G}.id`) === 'roulette';
  await waitFor(`${G}.spin === null`, 7000);
  const result = await game(`${G}.result`);
  const isRed = await page.evaluate((n) => [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n), result);
  const ro1 = (await state()).balance;
  const roL = await sinceMark();
  check('Roulette : bloquée pendant le tirage, mise sur rouge payée correctement', stillIn && roL.stake > 0 && roL.payout === (isRed ? roL.stake * 2 : 0) && ro1 === ro0 - roL.stake + roL.payout + roL.bonus, `résultat ${result}, ${ro0} → ${ro1}`);
  await page.screenshot({ path: 'e2e-shots/23-roulette.png' });
  await quitGame();
  // Machine à sous
  await teleport(4.5, 4.0); await sleep(250);
  s = await state();
  check('Machine « Trésors » ciblée', s.focus === 'slots', String(s.focus));
  await tapInteract(); await sleep(1700);
  const sl0 = (await state()).balance;
  await markAsks();
  await tap(...(await btnCenter(`${G}.spinBtn`)));
  await waitFor(`${G}.anim === null`, 5000);
  const win = await game(`${G}.lastWin`);
  const sl1 = (await state()).balance;
  const slL = await sinceMark();
  check('Machine à sous : mise et gain cohérents', slL.payout === win && sl1 === sl0 - slL.stake + win + slL.bonus, `${sl0} → ${sl1} (gain ${win})`);
  await page.screenshot({ path: 'e2e-shots/24-slots.png' });
  await quitGame();

  // ---------------- Phase 4 : tous les jeux du casino
  // Journal des réponses de l'autorité (mise et gain réellement réglés)
  await installAsks();
  const openAt = async (x, y, id) => { await teleport(x, y); await sleep(250); await tapInteract(); await sleep(1700); await page.evaluate(() => { window.__mark = (window.__asks ?? []).length; }); return (await game(`${G}.id`)) === id; };
  const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const roundOk = async (name, b0) => {
    const { stake, payout, bonus } = await sinceMark();
    const b1 = (await state()).balance;
    const open = await page.evaluate(() => Object.entries(window.__ks.services.data.sessions).filter(([k, v]) => !k.startsWith('shoe:') && v.stake > 0).length);
    check(name, stake > 0 && b1 === b0 - stake + payout + bonus && open === 0, `${b0} → ${b1} (mise ${stake}, gain ${payout})`);
  };

  // Blackjack Hi-Lo
  let ok = await openAt(10.5, 16.3, 'blackjack-hilo');
  let b0 = (await state()).balance;
  await pickTable();
  await tap(...(await btnCenter(`${G}.btn.deal`))); await sleep(400);
  await waitFor(`${G}.g.phase !== 'player' || ${G}.t >= ${G}.queue`, 6000);
  if (await game(`${G}.g.phase === 'player'`)) { await tap(...(await btnCenter(`${G}.btn.stand`))); await sleep(400); }
  await waitFor(`${G}.g.phase === 'settled' && !${G}.settlePending`, 8000);
  const rc = await game(`${G}.running`), bjs = await game(`${G}.g.totalStake`), bjp = await game(`${G}.g.totalPayout`);
  check('Blackjack Hi-Lo : manche + compte courant affiché', ok && (await state()).balance === b0 - bjs + bjp + (await sinceMark()).bonus && Number.isInteger(rc) && rc !== null, `compte ${rc}`);
  await page.screenshot({ path: 'e2e-shots/30-hilo.png' });
  await quitGame();

  // Poker classique : garder la 1re carte, tirer
  ok = await openAt(13.5, 6.7, 'poker');
  b0 = (await state()).balance;
  await tap(...(await btnCenter(`${G}.dealBtn`)));
  await waitFor(`${G}.phase === 'hold'`, 4000);
  const handBefore = await game(`JSON.stringify(${G}.hand)`);
  await tap(...center(await game(`${G}.cardRects[0]`))); await sleep(200);
  const held = await game(`${G}.held[0]`);
  await page.screenshot({ path: 'e2e-shots/31-poker-hold.png' });
  await tap(...(await btnCenter(`${G}.dealBtn`)));
  await waitFor(`${G}.phase === 'done'`, 4000);
  const after = await game(`${G}.hand`);
  check('Poker : carte gardée au toucher, conservée après le tirage', ok && held && JSON.stringify(after[0]) === JSON.stringify(JSON.parse(handBefore)[0]));
  await roundOk('Poker : KSCoins exactes', b0);
  await page.screenshot({ path: 'e2e-shots/32-poker.png' });
  await quitGame();
  const pokerSeated = await page.evaluate(() => { const p = window.__ks.scene.player; return p.seat?.kind === 'sit' && p.dir === 'up'; });
  check('Table de poker : le joueur s’assoit avant la partie et reste assis au retour', pokerSeated === true);

  // Direct Poker
  ok = await openAt(20.5, 5.8, 'direct-poker');
  b0 = (await state()).balance;
  await tap(...(await btnCenter(`${G}.dealBtn`)));
  await waitFor(`${G}.phase === 'done'`, 4000);
  await roundOk('Direct Poker : paiement immédiat exact', b0);
  check('Direct Poker ouvert depuis sa borne', ok);
  await quitGame();

  // Baccarat : jeton sur « Joueur »
  ok = await openAt(23.5, 16.3, 'baccarat');
  b0 = (await state()).balance;
  await tap(...center(await game(`${G}.zones[0]`)));
  await tap(...(await btnCenter(`${G}.dealBtn`)));
  await waitFor(`${G}.phase === 'done'`, 8000);
  check('Baccarat ouvert depuis la table', ok);
  await roundOk('Baccarat : coup distribué et réglé', b0);
  await page.screenshot({ path: 'e2e-shots/33-baccarat.png' });
  await quitGame();

  // Craps : Pass Line, on relance jusqu'au résultat
  ok = await openAt(23.5, 8.2, 'craps');
  b0 = (await state()).balance;
  await tap(...center(await game(`${G}.zones[0]`)));
  for (let i = 0; i < 40 && (await game(`${G}.phase`)) !== 'done'; i++) { await tap(...(await btnCenter(`${G}.rollBtn`))); await sleep(950); }
  check('Craps ouvert depuis la table', ok);
  await roundOk('Craps : manche jouée jusqu’au résultat', b0);
  await page.screenshot({ path: 'e2e-shots/34-craps.png' });
  await quitGame();

  // Keno : 4 numéros touchés sur la grille
  ok = await openAt(12, 3.0, 'keno');
  b0 = (await state()).balance;
  const gr = await game(`${G}.grid`);
  for (const n of [7, 18, 33, 61]) { const c = (n - 1) % 10, r = Math.floor((n - 1) / 10); await tap(gr.x + (c + 0.5) * gr.cw, gr.y + (r + 0.5) * gr.ch); }
  const picks = await game(`${G}.picks.length`);
  await tap(...(await btnCenter(`${G}.btn.play`)));
  await waitFor(`${G}.phase === 'done'`, 8000);
  check('Keno : 4 numéros choisis au toucher', ok && picks === 4, `choisis ${picks}`);
  await roundOk('Keno : tirage de 20 numéros réglé', b0);
  await page.screenshot({ path: 'e2e-shots/35-keno.png' });
  await quitGame();

  // Courses : miser sur deux chevaux
  ok = await openAt(22, 3.0, 'races');
  b0 = (await state()).balance;
  await tap(...center(await game(`${G}.rows[0]`))); await tap(...center(await game(`${G}.rows[3]`)));
  await tap(...(await btnCenter(`${G}.startBtn`))); await sleep(3000);
  await page.screenshot({ path: 'e2e-shots/36-courses.png' });
  await waitFor(`${G}.phase === 'done'`, 12000);
  const winner = await game(`${G}.order[0]`), lead = await game(`${G}.finishTimes.indexOf(Math.min(...${G}.finishTimes))`);
  check('Courses : le cheval tiré gagnant franchit la ligne en premier', ok && winner === lead, `gagnant ${winner}`);
  await roundOk('Courses : mises sur 2 chevaux réglées', b0);
  await quitGame();

  // Plinko
  ok = await openAt(13.5, 16.8, 'plinko');
  b0 = (await state()).balance;
  await tap(...(await btnCenter(`${G}.dropBtn`))); await sleep(900);
  await page.screenshot({ path: 'e2e-shots/37-plinko.png' });
  await waitFor(`${G}.balls.length === 0`, 6000);
  const ptx = await page.evaluate(() => window.__ks.services.data.stats['plays.plinko']);
  const pL = await sinceMark();
  const pb1 = (await state()).balance, mult = await game(`${G}.history[0]`);
  check('Plinko : bille tombée dans une case, gain = mise × multiplicateur', ok && typeof mult === 'number' && pL.payout === Math.floor(pL.stake * mult) && pb1 === b0 - pL.stake + pL.payout + pL.bonus && ptx >= 1, `×${mult}, mise ${pL.stake}, gain ${pL.payout}`);
  await quitGame();

  // Crash : encaisser en cours de vol
  ok = await openAt(20.5, 16.8, 'crash');
  b0 = (await state()).balance;
  await tap(...(await btnCenter(`${G}.goBtn`))); await sleep(400);
  const blocked = (await game(`${G}.canQuit().ok`)) === false || (await game(`${G}.run.point`)) < 1.2;
  for (let k = 0; k < 3 && (await game(`${G}.run.cashed === null && !${G}.run.crashed`)); k++) { await tap(...(await btnCenter(`${G}.goBtn`))); await sleep(300); }
  const run = await game(`${G}.run`);
  const expectCrash = run.cashed !== null ? Math.floor(10 * run.cashed) : 0;
  check('Crash : sortie bloquée en vol, encaissement au toucher', ok && blocked && (run.cashed !== null || run.point < 1.1), `point ×${run.point.toFixed(2)}, encaissé ${run.cashed}`);
  const cL = await sinceMark();
  check('Crash : gain = mise × multiplicateur encaissé', cL.payout === (run.cashed !== null ? Math.floor(cL.stake * run.cashed) : 0) && (await state()).balance === b0 - cL.stake + cL.payout + cL.bonus, `+${cL.payout}`);
  await page.screenshot({ path: 'e2e-shots/38-crash.png' });

  // Manche interrompue : Crash avec encaissement auto ×2, application fermée en plein vol
  await page.evaluate(() => { const r = window.__ksGame.game.run; if (r && !r.crashed) r.t = 1000; }); // fin du vol (déjà encaissé)
  await waitFor(`${G}.run.crashed`, 3000);
  for (let i = 0; i < 8 && (await game(`${G}.auto`)) !== 2; i++) await tap(...(await btnCenter(`${G}.autoBtn`)));
  const autoV = await game(`${G}.auto`);
  b0 = (await state()).balance;
  await tap(...(await btnCenter(`${G}.goBtn`))); await sleep(200);
  const pend = await page.evaluate(() => JSON.parse(localStorage.getItem('kingsea.save.v1')).sessions?.crash ?? null);
  await page.reload(); await sleep(3200);
  await playFromMenu();
  await page.evaluate(() => { window.__e2eChips = true; });
  const expectAuto = pend && pend.data.auto !== null && pend.data.auto <= pend.data.point ? Math.floor(10 * pend.data.auto) : 0;
  s = await state();
  const noticeShown = await page.evaluate(() => window.__ks.scene.toasts.list.some((t) => /Crash/.test(t.text)));
  check('Reprise : la manche de Crash interrompue est réglée une seule fois (auto ×2)', autoV === 2 && pend?.game === 'crash' && s.balance === b0 - 10 + expectAuto && (await page.evaluate(() => !window.__ks.services.data.sessions.crash)) && noticeShown,
    `point ×${pend?.data.point.toFixed(2)}, ${b0} → ${s.balance}`);
  await page.screenshot({ path: 'e2e-shots/39-reprise.png' });

  // Une autre machine à sous (autre thème)
  await teleport(26.5, 4.0); await sleep(250); await tapInteract(); await sleep(1700);
  const title2 = await game(`${G}.title`), def2 = await game(`${G}.def.id`);
  check('Deuxième machine à sous : autre thème', (await game(`${G}.id`)) === `slots-${def2}` && def2 !== 'tresors', `${title2} (${def2})`);
  await page.screenshot({ path: 'e2e-shots/40-slots2.png' });
  await quitGame();

  // ---------------- Phase 4 : arcade (KSCoins)
  await page.evaluate(() => { window.__e2eChips = false; });
  await goFloor('arcade');
  // Basket : un vrai tir au doigt, puis fin du chrono
  ok = await openAt(10, 16.9, 'basket');
  await tap(...(await btnCenter(`${G}.startBtn`)));
  check('Basket : compte à rebours avant le départ', await game(`${G}.card.counting`));
  await waitFor(`${G}.phase === 'play'`, 4000);
  const bp = await game(`[${G}.view.x + ${G}.startX * ${G}.view.s, ${G}.view.y + 200 * ${G}.view.s]`);
  await touch('touchStart', [bp]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[bp[0] + i * 12, bp[1] - i * 18]]); await sleep(16); }
  await touch('touchEnd', []); await sleep(300);
  await page.screenshot({ path: 'e2e-shots/41-basket.png' });
  const bshots = await game(`${G}.shots`);
  await page.evaluate(() => { window.__ksGame.game.time = 0.05; });
  await waitFor(`${G}.phase === 'over'`, 8000);
  check('Basket : tir au geste, fin de partie et score enregistré', ok && bshots === 1 && (await page.evaluate(() => window.__ks.services.data.stats['plays.basket'])) >= 1, JSON.stringify(await game(`${G}.card?.result ?? null`)));
  await quitGame();

  // Tirs au but
  ok = await openAt(15.5, 9.9, 'football');
  await tap(...(await btnCenter(`${G}.startBtn`)));
  const fb = await game(`[${G}.ballHome.x, ${G}.ballHome.y]`);
  const shoot = async (dx) => { await touch('touchStart', [fb]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[fb[0] + dx * i, fb[1] - i * 14]]); await sleep(16); } await touch('touchEnd', []); };
  await shoot(-10); await sleep(500);
  await page.screenshot({ path: 'e2e-shots/42-football.png' });
  await waitFor(`${G}.results.length === 1`, 4000);
  await page.evaluate(() => { const g = window.__ksGame.game; g.results = Array(9).fill('saved'); });
  await shoot(8);
  await waitFor(`${G}.phase === 'over'`, 4000);
  check('Tirs au but : frappe au geste, 10 tirs puis bilan', ok && (await game(`${G}.results.length`)) === 10, JSON.stringify(await game(`${G}.card?.result ?? null`)));
  await quitGame();

  // Skee-Ball
  ok = await openAt(15.5, 16.9, 'skeeball');
  await tap(...(await btnCenter(`${G}.startBtn`)));
  const L = await game(`${G}.lane`), hb = [L.cx, L.botY - 26 * ui];
  const roll = async () => { await touch('touchStart', [hb]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[hb[0], hb[1] - i * 22]]); await sleep(16); } await touch('touchEnd', []); };
  await roll(); await sleep(700);
  await page.screenshot({ path: 'e2e-shots/43-skeeball.png' });
  await waitFor(`${G}.throwsLog.length === 1`, 4000);
  await waitFor(`${G}.phase === 'aim'`, 4000);
  await page.evaluate(() => { window.__ksGame.game.left = 1; });
  await roll();
  await waitFor(`${G}.phase === 'over'`, 4000);
  check('Skee-Ball : lancer au geste, points comptés, fin de partie', ok && (await game(`${G}.throwsLog.length`)) === 2, JSON.stringify(await game(`${G}.card?.result ?? null`)));
  await quitGame();

  // Tape-crabe
  ok = await openAt(20, 10.9, 'mole');
  await tap(...(await btnCenter(`${G}.startBtn`)));
  await waitFor(`${G}.phase === 'play' && ${G}.field`, 4000);
  let whacked = false;
  for (let k = 0; k < 40 && !whacked; k++) {
    const target = await game(`(() => { const g = ${G}; const i = g.field.holes.findIndex((c) => c && !c.hit && c.kind !== 'jelly' && c.age > 0.15 && c.life - c.age > 0.3); return i < 0 ? null : [g.holes[i].x, g.holes[i].y - g.holes[i].r * 0.6]; })()`);
    if (target) { await tap(...target); whacked = (await game(`${G}.field.score`)) > 0; } else await sleep(80);
  }
  await page.screenshot({ path: 'e2e-shots/44-tape-crabe.png' });
  await page.evaluate(() => { window.__ksGame.game.field.time = 29.95; });
  await waitFor(`${G}.phase === 'over'`, 3000);
  check('Tape-crabe : crabe touché au doigt, fin à 30 s', ok && whacked, JSON.stringify(await game(`${G}.card?.result ?? null`)));
  await quitGame();

  // Flipper maritime
  ok = await openAt(2.5, 16.8, 'pinball');
  await tap(...(await btnCenter(`${G}.startBtn`)));
  await touch('touchStart', [[v.w * 0.7, v.h * 0.6]]); await sleep(900); await touch('touchEnd', []);
  await sleep(500);
  const inPlay = await game(`${G}.st.inPlay`);
  const a0 = await game(`${G}.st.flippers[0].angle`);
  await touch('touchStart', [[v.w * 0.2, v.h * 0.7]]); await sleep(150);
  const a1 = await game(`${G}.st.flippers[0].angle`), r1 = await game(`${G}.st.flippers[1].angle`);
  await page.screenshot({ path: 'e2e-shots/45-flipper.png' });
  await touch('touchEnd', []); await sleep(200);
  check('Flipper : lancement au ressort, batteur gauche au toucher (seul)', ok && inPlay && a1 < a0 - 0.5 && Math.abs(r1 - (Math.PI - 0.52)) < 0.01, `angle ${a0.toFixed(2)} → ${a1.toFixed(2)}`);
  await page.evaluate(() => { const g = window.__ksGame.game; g.balls = 1; g.st.inPlay = true; g.st.ball.x = 150; g.st.ball.y = 600; g.st.ball.vy = 100; });
  await waitFor(`${G}.phase === 'over'`, 5000);
  check('Flipper : fin de partie après la dernière balle', (await game(`${G}.phase`)) === 'over', JSON.stringify(await game(`${G}.card?.result ?? null`)));
  await quitGame();

  // Roue du jour (hall)
  await goFloor('hub');
  await teleport(25, 11.2); await sleep(250);
  s = await state();
  check('Roue du jour ciblée', s.focus === 'wheel', String(s.focus));
  await tapInteract(); await sleep(1700);
  const wh0 = (await state()).balance;
  await tap(...(await btnCenter(`${G}.btn`))); await sleep(4600);
  const wh1 = (await state()).balance;
  const again = await game(`${G}.btn.enabled`);
  check('Roue : gain crédité une fois, bouton bloqué jusqu’à demain', wh1 > wh0 && again === false, `${wh0} → ${wh1}`);
  await page.screenshot({ path: 'e2e-shots/25-roue.png' });
  await quitGame();

  // Cabine personnelle
  await goFloor('cabins');
  const myDoor = await page.evaluate(() => { const s = window.__ks.scene, id = window.__ks.services.data.cabin.id; const d = s.floor.props.find((p) => p.kind === 'cabinDoor' && p.id === id); return [d.tx + 0.5, d.ty + 2.6]; });
  await teleport(...myDoor); await sleep(250); await tapInteract(); await sleep(1200);
  s = await state();
  check('Entrer dans sa cabine', s.floor === 'cabin-interior', s.floor);
  await teleport(10.5, 4.2); await sleep(250); await tapInteract(); await sleep(400);
  const modalBtn = (id) => btnCenter(`(() => { const m = window.__ks.scene.modal; for (let i = 0; i < 10 && !m.layer.buttons.find((b) => b.id === '${id}'); i++) m.layer.buttons.find((b) => b.id === 'page-next')?.onTap(); return m.layer.buttons.find((b) => b.id === '${id}'); })()`);
  await tap(...(await modalBtn('tab-style'))); await sleep(150);
  await tap(...(await modalBtn('wall-2'))); await sleep(1000);
  const wall = await page.evaluate(() => window.__ks.services.data.cabin.wallColor);
  check('Aménager › Style : couleur des murs changée et sauvegardée', wall === 2, String(wall));
  // Aménagement : acheter une plante, la poser sur le plan, enregistrer ; la cabine est reconstruite
  await teleport(10.5, 4.2); await sleep(250); await tapInteract(); await sleep(400);
  const rb0 = (await state()).balance;
  await tap(...(await modalBtn('tab-shop'))); await sleep(150);
  await tap(...(await modalBtn('buy-plant-small'))); await sleep(400);
  await tap(...(await modalBtn('tab-items'))); await sleep(150);
  await tap(...(await modalBtn('inv-plant-small'))); await sleep(150);
  const cellXY = await page.evaluate(() => { const P = window.__ks.scene.modal.plan; return [P.x + 4.5 * P.cell, P.y + 6.5 * P.cell]; });
  await tap(...cellXY); await sleep(200);
  await page.screenshot({ path: 'e2e-shots/26-amenagement.png' });
  await tap(...(await modalBtn('room-save'))); await sleep(1500);
  const room = await page.evaluate(() => ({ placed: window.__ks.services.data.room.placed, props: window.__ks.scene.floor.props.filter((p) => p.kind === 'furniture').map((p) => `${p.id}@${p.tx},${p.ty}`) }));
  const rb1 = (await state()).balance;
  check('Aménager : meuble acheté (KSCoins), posé, enregistré et visible dans la cabine', rb1 <= rb0 - 30 + 300 && room.placed.some((p) => p.item === 'plant-small' && p.x === 4 && p.y === 6) && room.props.includes('plant-small|0@4,6'), `${rb0} → ${rb1}`);
  await page.screenshot({ path: 'e2e-shots/26-cabine.png' });
  // Phase 5 : garde-robe → éditeur de personnage → retour dans la cabine au même endroit
  await teleport(12, 3.9); await sleep(250); await tapInteract(); await sleep(1300);
  const inEditor = await page.evaluate(() => window.__ksProfile?.mode === 'edit' && window.__ks.services.game.current === window.__ksProfile);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'tab-accessoires')"))); await sleep(150);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'hat-bob')"))); await sleep(150);
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'glasses')"))); await sleep(150);
  await page.screenshot({ path: 'e2e-shots/26b-garde-robe.png' });
  await tap(...(await btnCenter("window.__ksProfile.layer.buttons.find((b) => b.id === 'confirm')"))); await sleep(1500);
  s = await state();
  const look2 = await page.evaluate(() => window.__ks.services.data.appearance);
  check('Garde-robe : chapeau et lunettes changés, retour dans la cabine', inEditor && look2.hat === 'bob' && look2.glasses === true && s.floor === 'cabin-interior' && Math.abs(s.y - 3.9 * 32) < 8, `${look2.hat} ${look2.glasses} ${s.floor}`);
  await teleport(2, 9.0); await sleep(250); await tapInteract(); await sleep(400);
  s = await state();
  check('Journal de bord de la cabine (souvenirs et records)', /Journal de bord/.test(s.modal ?? ''), String(s.modal));
  await tap(...(await btnCenter('window.__ks.scene.modal.layer.buttons[0]'))); await sleep(300);
  await teleport(7, 8.4); await sleep(250); await tapInteract(); await sleep(1200);
  s = await state();
  check('Sortir de la cabine devant sa porte', s.floor === 'cabins' && Math.abs(s.x - myDoor[0] * 32) < 40, `${s.floor}`);

  // Rooftop : nage, toboggan, danse, DJ
  await goFloor('rooftop');
  await teleport(15, 13.3); await sleep(200);
  await touch('touchStart', [[140, 290]]); await touch('touchMove', [[140, 240]]); await sleep(900); await touch('touchEnd', []);
  let swim = await page.evaluate(() => window.__ks.scene.swimming);
  check('Piscine : entrer dans l’eau au joystick et nager', swim === true);
  await page.screenshot({ path: 'e2e-shots/27-piscine.png' });
  await teleport(28, 9.3); await sleep(250);
  s = await state();
  check('Toboggan ciblé', s.focus === 'slide', String(s.focus));
  await tapInteract(); await sleep(400);
  await page.screenshot({ path: 'e2e-shots/28-toboggan.png' });
  await sleep(1800);
  swim = await page.evaluate(() => window.__ks.scene.swimming && !window.__ks.scene.ride);
  check('Toboggan : glissade jusque dans la piscine', swim === true);
  await teleport(30.5, 17.5); await sleep(300);
  await tap(...(await btnCenter('window.__ks.scene.hud.emoteBtn'))); await sleep(300);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'dance')"))); await sleep(800);
  const dancing = await page.evaluate(() => window.__ks.scene.emote && window.__ks.scene.emote.id === 'dance' && window.__ks.scene.emote.t === Infinity);
  check('Danser sur la piste (danse continue, en rythme)', dancing === true);
  await page.screenshot({ path: 'e2e-shots/29-danse.png' });
  await teleport(31, 15.2); await sleep(250); await tapInteract(); await sleep(300);
  const style = await page.evaluate(() => window.__ks.services.audio.clubStyle);
  check('DJ : changement de style musical', style === 1, String(style));
  // Salon VIP : fermé sous le niveau 5, ouvert une fois débloqué
  const hadVip = await page.evaluate(() => { const u = window.__ks.services.progress.unlocks, i = u.indexOf('feature:vip-lounge'); if (i >= 0) u.splice(i, 1); return i >= 0; });
  await teleport(10.4, 18.9); await sleep(400);
  s = await state();
  const vipLocked = s.focus === 'vip-gate' ? (await tapInteract(), await sleep(500), await page.evaluate(() => window.__ks.scene.player.x / 32 < 11.5)) : false;
  await page.evaluate(() => { const u = window.__ks.services.progress.unlocks; if (!u.includes('feature:vip-lounge')) u.push('feature:vip-lounge'); });
  await tapInteract(); await sleep(1600);
  const vipIn = await page.evaluate(() => { const p = window.__ks.scene.player; return p.x / 32 > 11.5 && p.y / 32 > 18; });
  const vipMusic = await page.evaluate(() => window.__ks.services.audio.musicTheme);
  check('Salon VIP : porte gardée (niveau 5), entrée une fois débloqué, deep house', vipLocked && vipIn && vipMusic === 'deephouse', `fermé ${vipLocked} · entré ${vipIn} · musique ${vipMusic} · niveau 5 déjà atteint : ${hadVip}`);
  await page.screenshot({ path: 'e2e-shots/29b-salon-vip.png' });

  // ---------------- Phase 5 : passagers, animations, musique, réglages, transitions
  await goFloor('hub');
  await sleep(600);
  const crowd = await page.evaluate(() => window.__ks.scene.crowd?.list.length ?? 0);
  const p0 = await page.evaluate(() => { const p = window.__ks.scene.crowd.list[0]; return [p.x / 32, p.y / 32]; });
  await teleport(p0[0] + 1.2, p0[1]); await sleep(200);
  await tap(...(await btnCenter('window.__ks.scene.hud.emoteBtn'))); await sleep(300);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'wave')"))); await sleep(400);
  const waving = await page.evaluate(() => window.__ks.scene.crowd.list.filter((p) => p.state === 'wave').length);
  const pAnim = await page.evaluate(() => window.__ks.scene.playerAnim().anim);
  await page.screenshot({ path: 'e2e-shots/46-salut-passagers.png' });
  check('Passagers d’ambiance présents ; ils répondent au salut du joueur', crowd >= 3 && waving >= 1 && pAnim === 'wave', `passagers ${crowd}, saluent ${waving}, anim ${pAnim}`);
  await sleep(2500);
  const idleAnim = await page.evaluate(() => window.__ks.scene.playerAnim().anim);
  check('Animation d’attente quand le personnage est immobile', idleAnim === 'idle', idleAnim);
  const music = await page.evaluate(() => window.__ks.services.audio.musicTheme);
  check('Musique du hall jouée (audio débloqué au premier toucher)', music === 'hub', music);
  // Réglages : volume de la musique indépendant + mode gaucher
  await tap(...(await btnCenter('window.__ks.scene.hud.settingsBtn'))); await sleep(350);
  const mv0 = await page.evaluate(() => window.__ks.services.data.settings.musicVolume);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'musicVolume-')"))); await sleep(200);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'Commandes')"))); await sleep(200);
  await page.screenshot({ path: 'e2e-shots/47-parametres.png' });
  const mv1 = await page.evaluate(() => window.__ks.services.data.settings.musicVolume);
  await tap(...(await btnCenter("window.__ks.scene.modal.closeBtn"))); await sleep(300);
  const joyRight = await page.evaluate(() => window.__ks.scene.joystick.rest.x > innerWidth / 2 && window.__ks.scene.hud.interactBtn.x < innerWidth / 2);
  // Toucher sur le joystick lui-même (à côté, l'aquarium du hall est désormais touchable)
  await touch('touchStart', [[v.w - 93, v.h - 90]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[v.w - 93 + i * 6, v.h - 90]]); await sleep(16); } await sleep(500);
  const jsActive = await page.evaluate(() => window.__ks.scene.joystick.active);
  await touch('touchEnd', []);
  await page.screenshot({ path: 'e2e-shots/48-gaucher.png' });
  check('Réglages : musique baissée seule, mode gaucher (joystick à droite)', Math.abs(mv1 - (mv0 - 0.1)) < 0.001 && joyRight && jsActive, `musique ${mv0} → ${mv1}`);
  await page.evaluate(() => { const st = window.__ks.services.data.settings; st.leftHanded = false; window.__ks.scene.onResize(); });
  // Transition d'ascenseur avec portes et nom de l'étage
  await tap(...(await btnCenter('window.__ks.scene.hud.floorsBtn'))); await sleep(350);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'floor-casino')"))); await sleep(520);
  const label = await page.evaluate(() => window.__ks.services.game.transitionLabel);
  await page.screenshot({ path: 'e2e-shots/49-portes-ascenseur.png' });
  await sleep(1400);
  check('Ascenseur : portes qui se ferment avec le nom de l’étage', /Casino/.test(label ?? ''), String(label));

  // Retour salle des machines pour le test de reprise
  await tap(...(await btnCenter('window.__ks.scene.hud.floorsBtn'))); await sleep(350);
  await tap(...(await btnCenter("window.__ks.scene.modal.layer.buttons.find((b) => b.id === 'floor-engine')"))); await sleep(2600);
  s = await state();

  // Mise en arrière-plan → sauvegarde immédiate
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kingsea.save.v1')));
  check('Sauvegarde écrite à la mise en arrière-plan', saved?.wallet?.balance === s.balance && saved?.location?.floorId === 'engine');
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));

  // Rechargement : on reprend au même étage avec le même solde
  await page.reload(); await sleep(3200);
  await playFromMenu();
  const s2 = await state();
  check('Reprise après rechargement (étage + solde)', s2?.floor === 'engine' && s2?.balance === s.balance, JSON.stringify(s2 && { floor: s2.floor, balance: s2.balance }));

  // Portrait
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(600);
  await page.screenshot({ path: 'e2e-shots/11-portrait.png' });
  const hudOk = await page.evaluate(() => { const h = window.__ks.scene.hud, b = h.interactBtn; return b.x >= 0 && b.x + b.w <= innerWidth && b.y + b.h <= innerHeight; });
  check('HUD visible en portrait', hudOk);

  // Petit écran (iPhone SE paysage)
  await page.setViewportSize({ width: 667, height: 375 });
  await sleep(400);
  await page.screenshot({ path: 'e2e-shots/12-petit-ecran.png' });

  check('Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Exécution du scénario', false, String(e));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
process.exit(failed ? 1 : 0);
