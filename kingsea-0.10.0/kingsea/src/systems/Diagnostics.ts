// Diagnostic intégré : cadence d'affichage, temps de calcul par image, mémoire des textures et du JavaScript,
// erreurs d'exécution, appareil, latence réseau. Consultable dans Paramètres → Diagnostic, avec un rapport
// à copier (pour les tests sur vrais téléphones). Ne collecte rien d'identifiant et n'envoie rien.
import { layerStats } from '../art/floorRenderer';
import { Textures } from '../art/canvas';

export interface FrameSample { work: number; interval: number }

const RING = 240;

export class DiagnosticsImpl {
  private frames: FrameSample[] = [];
  errors: Array<{ msg: string; count: number; last: number }> = [];
  longFrames = 0;
  totalFrames = 0;
  started = Date.now();
  rttMs: number | null = null;

  /** Repart de zéro pour une nouvelle mesure (audit). */
  resetFrames(): void { this.frames = []; }

  recordFrame(work: number, interval: number): void {
    this.frames.push({ work, interval });
    if (this.frames.length > RING) this.frames.shift();
    this.totalFrames++;
    if (interval > 50) this.longFrames++;
  }

  recordError(e: unknown): void {
    const msg = (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 200);
    const ex = this.errors.find((x) => x.msg === msg);
    if (ex) { ex.count++; ex.last = Date.now(); return; }
    this.errors.push({ msg, count: 1, last: Date.now() });
    if (this.errors.length > 20) this.errors.shift();
  }

  install(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => this.recordError(e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => this.recordError(e.reason));
  }

  /** Statistiques sur les dernières images (≈ 4 s). */
  frameStats(): { fps: number; workAvg: number; workP95: number; intervalP95: number } {
    const f = this.frames;
    if (!f.length) return { fps: 0, workAvg: 0, workP95: 0, intervalP95: 0 };
    const iv = f.map((x) => x.interval).sort((a, b) => a - b), wk = f.map((x) => x.work).sort((a, b) => a - b);
    const avgIv = iv.reduce((a, b) => a + b, 0) / iv.length;
    const p95 = (a: number[]) => a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
    return { fps: avgIv > 0 ? 1000 / avgIv : 0, workAvg: wk.reduce((a, b) => a + b, 0) / wk.length, workP95: p95(wk), intervalP95: p95(iv) };
  }

  memory(): { texturesMB: number; textures: number; layersMB: number; heapMB: number | null } {
    const t = Textures.stats(), l = layerStats();
    const pm = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return { texturesMB: t.bytes / 1048576, textures: t.count, layersMB: l.bytes / 1048576, heapMB: pm ? pm.usedJSHeapSize / 1048576 : null };
  }

  device(): Record<string, string | number> {
    const n = navigator as Navigator & { deviceMemory?: number };
    return {
      ua: navigator.userAgent, screen: `${screen.width}×${screen.height}`, window: `${innerWidth}×${innerHeight}`, dpr: devicePixelRatio,
      cores: n.hardwareConcurrency ?? '?', memoryGB: n.deviceMemory ?? '?', lang: navigator.language,
    };
  }

  report(extra: Record<string, unknown> = {}): string {
    const f = this.frameStats(), m = this.memory(), d = this.device();
    const lines = [
      `KingSea — rapport de diagnostic (${new Date().toISOString()})`,
      `Version : ${typeof __KS_VERSION__ !== 'undefined' ? __KS_VERSION__ : '?'}`,
      `Appareil : ${d.ua}`,
      `Écran : ${d.screen} · fenêtre ${d.window} · densité ${d.dpr} · cœurs ${d.cores} · mémoire ${d.memoryGB} Go`,
      `Images/s : ${f.fps.toFixed(0)} · calcul moyen ${f.workAvg.toFixed(1)} ms · 95e centile ${f.workP95.toFixed(1)} ms · intervalle 95e ${f.intervalP95.toFixed(0)} ms`,
      `Images lentes (> 50 ms) : ${this.longFrames} sur ${this.totalFrames} · session ${Math.round((Date.now() - this.started) / 1000)} s`,
      `Mémoire : textures ${m.texturesMB.toFixed(1)} Mo (${m.textures}) · étages ${m.layersMB.toFixed(1)} Mo · JavaScript ${m.heapMB === null ? 'n/d' : `${m.heapMB.toFixed(1)} Mo`}`,
      `Réseau : ${this.rttMs === null ? 'hors ligne' : `latence ${Math.round(this.rttMs)} ms`}`,
      ...Object.entries(extra).map(([k, v]) => `${k} : ${typeof v === 'string' ? v : JSON.stringify(v)}`),
      `Erreurs : ${this.errors.length ? '' : 'aucune'}`,
      ...this.errors.map((e) => `  ×${e.count} ${e.msg}`),
    ];
    return lines.join('\n');
  }
}

export const Diagnostics = new DiagnosticsImpl();
