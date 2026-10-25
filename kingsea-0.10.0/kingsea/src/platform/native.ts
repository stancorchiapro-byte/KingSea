// Pont vers l'application native (Capacitor), sans dépendance obligatoire : chaque module natif n'est utilisé
// que s'il est présent. Dans un navigateur, tout se replie sur les API web (localStorage, navigator.vibrate…).
// Modules prévus (package.json) : @capacitor/preferences, @capacitor/haptics, @capacitor/splash-screen,
// @capacitor/status-bar, @capacitor/app.

interface CapPlugins {
  Preferences?: { get(o: { key: string }): Promise<{ value: string | null }>; set(o: { key: string; value: string }): Promise<void>; remove(o: { key: string }): Promise<void>; keys(): Promise<{ keys: string[] }> };
  Haptics?: { impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>; vibrate(o?: { duration?: number }): Promise<void> };
  SplashScreen?: { hide(o?: { fadeOutDuration?: number }): Promise<void> };
  StatusBar?: { hide(): Promise<void>; setOverlaysWebView(o: { overlay: boolean }): Promise<void> };
  App?: { addListener(e: string, cb: (...a: unknown[]) => void): unknown };
}
interface Cap { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: CapPlugins }

function cap(): Cap | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { Capacitor?: Cap }).Capacitor : undefined;
}

export function isNative(): boolean { return !!cap()?.isNativePlatform?.(); }
export function platform(): 'ios' | 'android' | 'web' { const p = cap()?.getPlatform?.(); return p === 'ios' || p === 'android' ? p : 'web'; }
export function plugins(): CapPlugins { return cap()?.Plugins ?? {}; }

const PREFIX = 'kingsea.';
const silent = (p: Promise<unknown> | undefined) => { p?.catch(() => { /* module natif indisponible : sans conséquence */ }); };

/**
 * Stockage natif : iOS peut vider le stockage d'une WebView quand la mémoire manque. Chaque écriture du jeu
 * (clés « kingsea.* ») est donc doublée dans les préférences natives, et restaurée au démarrage si elle manque.
 */
export async function restoreNativeStorage(timeoutMs = 1500): Promise<number> {
  const prefs = plugins().Preferences;
  if (!prefs || typeof localStorage === 'undefined') return 0;
  const work = (async () => {
    let n = 0;
    const { keys } = await prefs.keys();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      if (localStorage.getItem(key) !== null) continue;
      const { value } = await prefs.get({ key });
      if (value !== null) { localStorage.setItem(key, value); n++; }
    }
    return n;
  })();
  return Promise.race([work, new Promise<number>((r) => setTimeout(() => r(0), timeoutMs))]).catch(() => 0);
}

/** Recopie dans les préférences natives toute écriture du jeu dans localStorage. */
export function mirrorStorageToNative(): void {
  const prefs = plugins().Preferences;
  if (!prefs || typeof Storage === 'undefined') return;
  const proto = Storage.prototype, set = proto.setItem, remove = proto.removeItem;
  proto.setItem = function (this: Storage, key: string, value: string) {
    set.call(this, key, value);
    if (this === localStorage && key.startsWith(PREFIX)) silent(prefs.set({ key, value }));
  };
  proto.removeItem = function (this: Storage, key: string) {
    remove.call(this, key);
    if (this === localStorage && key.startsWith(PREFIX)) silent(prefs.remove({ key }));
  };
}

/** Vibration : module natif (fonctionne aussi sur iPhone), sinon API web (Android uniquement). */
export function vibrate(pattern: number | number[]): void {
  const h = plugins().Haptics;
  const total = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : pattern;
  if (h) { silent(total <= 25 ? h.impact({ style: 'LIGHT' }) : total <= 60 ? h.impact({ style: 'MEDIUM' }) : h.vibrate({ duration: Math.min(400, total) })); return; }
  try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern); } catch { /* non pris en charge */ }
}

/** Plein écran natif et fin de l'écran de démarrage natif (appelé quand le jeu affiche sa première image). */
export function nativeReady(): void {
  const p = plugins();
  silent(p.StatusBar?.setOverlaysWebView({ overlay: true }));
  silent(p.StatusBar?.hide());
  silent(p.SplashScreen?.hide({ fadeOutDuration: 250 }));
}

/** Bouton retour Android. */
export function onBackButton(cb: () => void): void { plugins().App?.addListener('backButton', cb); }
