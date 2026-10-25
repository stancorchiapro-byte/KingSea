// Point d'entrée KingSea.
import { Game } from './engine/Game';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { WorldScene } from './scenes/WorldScene';
import { Diagnostics } from './systems/Diagnostics';
import { Services } from './systems/Services';
import { mirrorStorageToNative, nativeReady, onBackButton, restoreNativeStorage } from './platform/native';

function boot(): void {
  Diagnostics.install();
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Canvas #game introuvable');
  const game = new Game(canvas, document.getElementById('safe-probe'));
  const services = new Services(game);

  const makeMenu = (): MenuScene => new MenuScene(services, makeWorld);
  const makeWorld = (): WorldScene => new WorldScene(services, makeMenu);

  game.start(new BootScene(services, makeMenu));
  if (location.search.includes('debug')) (window as unknown as { __ksApp: unknown }).__ksApp = { game, services, diag: Diagnostics };

  // Application native : bouton retour Android, plein écran, fin de l'écran de démarrage natif
  onBackButton(() => game.back());
  requestAnimationFrame(() => nativeReady());
}

// Sauvegarde : restaurée depuis le stockage natif si la WebView l'a perdue, puis doublée à chaque écriture
restoreNativeStorage().then(() => { mirrorStorageToNative(); start(); }, () => start());

function start(): void {
  try {
    boot();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<p style="color:#f6fbff;font:16px system-ui;padding:24px">KingSea n’a pas pu démarrer : ${String(e)}</p>`;
  }
}
