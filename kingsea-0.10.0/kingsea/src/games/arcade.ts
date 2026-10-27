// Fin de partie commune aux jeux d'arcade gratuits : le score est envoyé à l'autorité, qui calcule
// la récompense (plafonnée par jour) et tient les records. Renvoie un texte d'attente, puis le bilan.
// Mise à jour Stan : carte d'accueil (comment jouer, record, médailles), compte à rebours de départ,
// carte de fin (score, médaille bronze / argent / or, record, KSCoins gagnés).
import { roundRect } from '../art/canvas';
import { LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import type { Services } from '../systems/Services';
import { font, type Button } from '../ui/UIKit';

export interface ArcadeResult { score: number; unit: string; pending: boolean; granted: number; newBest: boolean; best: number | null; capReached: boolean; error: string | null }

/** Paliers de médailles (bronze, argent, or) et aide courte de chaque jeu d'arcade. */
export const ARCADE_INFO: Record<string, { better: 'high' | 'low'; medals: [number, number, number]; howto: string[] }> = {
  bowling: { better: 'high', medals: [90, 140, 190], howto: ['Tire la boule vers la gauche, vise, relâche.', '10 frames : strikes et spares comptent double.'] },
  billiards: { better: 'low', medals: [45, 30, 20], howto: ['Vide la table en un minimum de coups.', 'Blanche empochée : +1 coup de pénalité.'] },
  basket: { better: 'high', medals: [20, 40, 60], howto: ['Glisse le doigt vers le panier puis relâche.', '45 s · séries de 3 paniers : +1 point par panier.'] },
  football: { better: 'high', medals: [3, 5, 8], howto: ['Glisse vers le but : direction et puissance.', '10 tirs · le gardien lit de mieux en mieux tes frappes.'] },
  skeeball: { better: 'high', medals: [150, 250, 400], howto: ['Lance la boule vers les anneaux.', '9 boules · les petits anneaux rapportent le plus.'] },
  mole: { better: 'high', medals: [15, 30, 45], howto: ['Touche les crabes, évite les méduses.', '30 s · le rythme accélère.'] },
  racing: { better: 'low', medals: [1000, 880, 800], howto: ['◀ ▶ pour tourner, GAZ et FREIN à droite.', '3 tours contre l’équipage · évite l’huile, vise les vagues turbo.'] },
  pinball: { better: 'high', medals: [15000, 50000, 120000], howto: ['Touche à gauche / à droite pour les batteurs.', '3 billes · cibles et bumpers.'] },
};
const MEDAL_NAMES = ['Bronze', 'Argent', 'Or'] as const;
const MEDAL_COLORS = ['#c98d62', '#c9ccd3', LUXE.gold] as const;

/** Médaille obtenue (−1 : aucune, 0 bronze, 1 argent, 2 or). */
export function medalFor(game: string, score: number): number {
  const info = ARCADE_INFO[game];
  if (!info) return -1;
  let m = -1;
  info.medals.forEach((t, i) => { if (info.better === 'high' ? score >= t : score <= t) m = i; });
  return m;
}

/** Envoie le score à l'autorité ; `cb` reçoit le bilan (d'abord « en attente », puis la réponse). */
export function submitArcade(s: Services, game: string, score: number, unit: string, cb: (r: ArcadeResult) => void): void {
  const base: ArcadeResult = { score, unit, pending: true, granted: 0, newBest: false, best: s.data.stats[`best.${game}`] ?? null, capReached: false, error: null };
  cb(base);
  void s.ask('purser', 'purser', 'arcade', { game, score }).then((r) => {
    if (!r.ok) { cb({ ...base, pending: false, error: r.error }); s.audio.error(); return; }
    const v = r.view as { granted: number; newBest: boolean; best: number; plays: number; capReached: boolean };
    // Copie locale des records (affichage du journal de bord)
    s.data.stats[`best.${game}`] = v.best; s.data.stats[`plays.${game}`] = v.plays; s.save.markDirty();
    if (v.newBest && v.plays > 1) { s.audio.jackpot(); s.haptic([30, 50, 30, 50, 90]); } else { s.audio.win(); s.haptic(30); }
    cb({ ...base, pending: false, granted: v.granted, newBest: v.newBest && v.plays > 1, best: v.best, capReached: v.capReached });
  });
}

export function finishArcade(s: Services, game: string, score: number, unit: string, onText: (msg: string) => void): string {
  let first = '';
  submitArcade(s, game, score, unit, (r) => {
    const text = r.pending ? `${score} ${unit} · enregistrement…` : r.error ? `${score} ${unit} · ${r.error}`
      : `${score} ${unit}${medalFor(game, score) >= 0 ? ` · médaille ${MEDAL_NAMES[medalFor(game, score)]}` : ''}${r.newBest ? ' · nouveau record !' : ` · record ${r.best}`} · ${r.granted > 0 ? `+${r.granted} KSCoins` : r.capReached ? 'plafond du jour atteint' : 'pas de KSCoins'}`;
    if (r.pending) first = text; else onText(text);
  });
  return first;
}

/**
 * Carte des jeux d'arcade : accueil (comment jouer, record, paliers de médailles), compte à rebours 3-2-1,
 * bilan de fin. Le bouton principal du jeu (Commencer / Rejouer) est placé dans la carte.
 */
export class ArcadeCard {
  result: ArcadeResult | null = null;
  rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Zone de jeu complète : assombrie derrière la carte pour qu'aucun élément du jeu ne la traverse. */
  private area = { x: 0, y: 0, w: 0, h: 0 };
  private count = 0;
  private onGo: (() => void) | null = null;
  private lastTick = -1;

  constructor(private s: Services, readonly game: string, readonly title: string) {}

  get counting(): boolean { return this.count > 0; }

  /** Compte à rebours avant le départ (le jeu démarre à la fin). */
  countdown(onGo: () => void): void { this.count = 2.4; this.onGo = onGo; this.lastTick = -1; this.result = null; }

  /** Enregistre le score et affiche le bilan. */
  finish(score: number, unit: string): void { submitArcade(this.s, this.game, score, unit, (r) => (this.result = r)); }

  update(dt: number): void {
    if (this.count <= 0) return;
    this.count -= dt;
    const n = Math.ceil(this.count / 0.8);
    if (n !== this.lastTick && n > 0) { this.lastTick = n; this.s.audio.tick(); }
    if (this.count <= 0) { this.count = 0; this.s.audio.ding(); const f = this.onGo; this.onGo = null; f?.(); }
  }

  /** Place la carte au centre de la zone et le bouton principal dans sa partie basse. */
  place(a: { x: number; y: number; w: number; h: number }, ui: number, btn: Button): void {
    this.area = { ...a };
    const w = Math.min(a.w - 20 * ui, 460 * ui), h = Math.min(a.h - 16 * ui, 250 * ui);
    this.rect = { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h };
    Object.assign(btn, { x: this.rect.x + (w - Math.min(220 * ui, w - 30 * ui)) / 2, y: this.rect.y + h - 64 * ui, w: Math.min(220 * ui, w - 30 * ui), h: 52 * ui });
  }

  /** Accueil (`over` = faux) ou bilan (`over` = vrai). */
  render(ctx: CanvasRenderingContext2D, ui: number, over: boolean): void {
    const R = this.rect, info = ARCADE_INFO[this.game];
    ctx.save();
    const A = this.area;
    if (A.w > 0) { ctx.fillStyle = 'rgba(2,8,18,0.55)'; ctx.fillRect(A.x, A.y, A.w, A.h); }
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18 * ui; ctx.shadowOffsetY = 4 * ui;
    const bg = ctx.createLinearGradient(0, R.y, 0, R.y + R.h);
    bg.addColorStop(0, '#13253d'); bg.addColorStop(1, '#0a1424');
    roundRect(ctx, R.x, R.y, R.w, R.h, 16 * ui); ctx.fillStyle = bg; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(212,175,90,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
    // Filet doré en tête de carte
    const hl = ctx.createLinearGradient(R.x, 0, R.x + R.w, 0);
    hl.addColorStop(0, 'rgba(212,175,90,0)'); hl.addColorStop(0.5, 'rgba(239,220,174,0.9)'); hl.addColorStop(1, 'rgba(212,175,90,0)');
    ctx.fillStyle = hl; ctx.fillRect(R.x + 20 * ui, R.y + 1, R.w - 40 * ui, 1.6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx = R.x + R.w / 2, best = this.s.data.stats[`best.${this.game}`];
    if (!over || !this.result) {
      ctx.font = font(18 * ui, 800); ctx.fillStyle = LUXE.champagne; ctx.fillText(this.title, cx, R.y + 24 * ui, R.w - 20 * ui);
      ctx.font = font(13 * ui, 600); ctx.fillStyle = PAL.text;
      (info?.howto ?? []).forEach((l, i) => ctx.fillText(l, cx, R.y + 52 * ui + i * 19 * ui, R.w - 24 * ui));
      ctx.font = font(12 * ui, 700); ctx.fillStyle = PAL.textDim;
      ctx.fillText(best !== undefined ? `Ton record : ${best}` : 'Première partie : à toi de fixer le record !', cx, R.y + 98 * ui, R.w - 24 * ui);
      if (info) this.renderMedals(ctx, cx, R.y + 124 * ui, ui, -1);
    } else {
      const r = this.result, m = medalFor(this.game, r.score);
      ctx.font = font(15 * ui, 800); ctx.fillStyle = r.newBest ? LUXE.champagne : PAL.textDim;
      ctx.fillText(r.newBest ? 'Nouveau record !' : 'Partie terminée', cx, R.y + 20 * ui, R.w - 20 * ui);
      ctx.font = font(32 * ui, 900); ctx.fillStyle = PAL.text; ctx.fillText(`${r.score} ${r.unit}`, cx, R.y + 54 * ui, R.w - 20 * ui);
      ctx.font = font(12.5 * ui, 700); ctx.fillStyle = m >= 0 ? MEDAL_COLORS[m] : PAL.textDim;
      ctx.fillText(m >= 0 ? `Médaille ${MEDAL_NAMES[m]}` : 'Pas de médaille cette fois', cx, R.y + 84 * ui, R.w - 20 * ui);
      if (info) this.renderMedals(ctx, cx, R.y + 108 * ui, ui, m);
      ctx.font = font(13 * ui, 700);
      const line = r.pending ? 'Enregistrement du score…' : r.error ? r.error
        : `${r.best !== null ? `Record : ${r.best}` : ''}  ·  ${r.granted > 0 ? `+${r.granted} KSCoins` : r.capReached ? 'Plafond de KSCoins du jour atteint' : 'Pas de KSCoins pour ce score'}`;
      ctx.fillStyle = r.error ? PAL.danger : r.granted > 0 ? PAL.success : PAL.textDim;
      ctx.fillText(line, cx, R.y + 138 * ui, R.w - 20 * ui);
    }
    ctx.restore();
  }

  private renderMedals(ctx: CanvasRenderingContext2D, cx: number, y: number, ui: number, got: number): void {
    const info = ARCADE_INFO[this.game], gap = 92 * ui;
    info.medals.forEach((t, i) => {
      const x = cx + (i - 1) * gap, on = got >= i;
      ctx.globalAlpha = got < 0 || on ? 1 : 0.35;
      ctx.fillStyle = MEDAL_COLORS[i]; ctx.beginPath(); ctx.arc(x - 26 * ui, y, 7 * ui, 0, Math.PI * 2); ctx.fill();
      ctx.font = font(11.5 * ui, 700); ctx.fillStyle = PAL.text; ctx.textAlign = 'left';
      ctx.fillText(`${info.better === 'high' ? '≥' : '≤'} ${t >= 10000 ? `${t / 1000} k` : t}`, x - 16 * ui, y);
      ctx.textAlign = 'center'; ctx.globalAlpha = 1;
    });
  }

  /** Grand compte à rebours au centre de la zone de jeu. */
  renderCountdown(ctx: CanvasRenderingContext2D, a: { x: number; y: number; w: number; h: number }, ui: number): void {
    if (this.count <= 0) return;
    const n = Math.ceil(this.count / 0.8), k = (this.count % 0.8) / 0.8;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = font((70 + (1 - k) * 30) * ui, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = LUXE.champagne; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6 * ui;
    ctx.strokeText(String(n), a.x + a.w / 2, a.y + a.h / 2); ctx.fillText(String(n), a.x + a.w / 2, a.y + a.h / 2);
    ctx.restore();
  }
}
