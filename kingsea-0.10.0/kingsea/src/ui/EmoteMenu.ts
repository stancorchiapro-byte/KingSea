// Menu des émotes : sélection rapide par catégorie (Saluer, Réactions, Victoire, Défaite, Détente), dernières
// émotes utilisées en tête, émotes verrouillées affichées avec leur condition (niveau ou passe de croisière).
// L'émote choisie anime le personnage et, en ligne, est diffusée aux joueurs proches (le serveur vérifie le déblocage).
import { LUXE } from '../art/brand';
import { PAL } from '../art/palette';
import { EMOTE_BY_ID, EMOTE_CATEGORIES, EMOTES, emoteUnlocked, type EmoteCategory, type EmoteDef } from '../data/emotes';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { drawEmoteIcon } from './emoteIcons';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';

export type EmoteId = string;

const RECENT_KEY = 'kingsea.emotes.recent';
function recent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && EMOTE_BY_ID.has(x)).slice(0, 4) : []; } catch { return []; }
}
function remember(id: string): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 4))); } catch { /* stockage indisponible */ }
}

let lastCat: EmoteCategory | 'recent' = 'social';

export class EmoteMenu extends Modal {
  private cat: EmoteCategory | 'recent';
  private vp: Viewport | null = null;
  constructor(s: Services, private onPick: (e: EmoteId) => void) {
    super(s, 'Émotes');
    this.cat = recent().length && lastCat === 'social' ? 'recent' : lastCat;
  }

  private list(): EmoteDef[] {
    if (this.cat === 'recent') return recent().map((id) => EMOTE_BY_ID.get(id)!).filter(Boolean);
    return EMOTES.filter((e) => e.category === this.cat);
  }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    return { w: Math.min(maxW, 560 * vp.ui), h: Math.min(maxH, 250 * vp.ui) };
  }

  protected place(vp: Viewport): Button[] {
    this.vp = vp;
    const ui = vp.ui, C = this.content, gap = 8 * ui, out: Button[] = [];
    const cats: Array<[EmoteCategory | 'recent', string]> = [...(recent().length ? [['recent', 'Récentes'] as [EmoteCategory | 'recent', string]] : []), ...EMOTE_CATEGORIES.map((c) => [c.id, c.label] as [EmoteCategory, string])];
    const tw = (C.w - gap * (cats.length - 1)) / cats.length, th = Math.max(40, 40 * ui);
    cats.forEach(([id, label], i) => out.push(makeButton({ id: `ecat-${id}`, label, style: 'secondary', active: this.cat === id, fontSize: 12, x: C.x + i * (tw + gap), y: C.y, w: tw, h: th,
      onTap: () => { this.cat = id; lastCat = id; if (this.vp) this.layout(this.vp); } })));
    const unlocks = this.s.progress.unlocks;
    const items = this.list(), n = Math.max(4, items.length);
    const bw = (C.w - gap * (n - 1)) / n, by = C.y + th + 12 * ui, bh = C.h - th - 12 * ui;
    items.forEach((e, i) => {
      const ok = emoteUnlocked(e.id, unlocks);
      out.push(makeButton({
        id: `emote-${e.id}`, label: e.label, sub: ok ? undefined : e.pass ? 'Passe' : `Niv. ${e.level}`, style: 'secondary', enabled: ok, fontSize: 12,
        x: C.x + i * (bw + gap), y: by, w: bw, h: bh,
        icon: (ctx, cx, cy, sz) => { ctx.save(); if (!ok) ctx.globalAlpha = 0.4; drawEmoteIcon(ctx, e.id, cx, cy, sz * 1.25); ctx.restore(); },
        onTap: () => { remember(e.id); this.close(); this.onPick(e.id); },
      }));
    });
    return out;
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    if (this.list().length) return;
    const ui = vp.ui, C = this.content;
    ctx.fillStyle = PAL.textDim; ctx.font = font(13 * ui, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Aucune émote récente.', C.x + C.w / 2, C.y + C.h * 0.6);
    void LUXE;
  }
}
