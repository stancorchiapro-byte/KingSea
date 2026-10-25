// Missions quotidiennes et hebdomadaires : objectif, progression mesurée, état (en cours / terminée / reçue),
// récompense (KSCoins, XP, objet de collection), bouton « Réclamer » validé par l'autorité (une seule fois).
import { drawKSCoin, LUXE, spacedCaps } from '../art/brand';
import { PAL } from '../art/palette';
import { FURNITURE_BY_ID } from '../data/furniture';
import { MISSION_BY_ID, missionStatus, type MissionProgress } from '../authority/progress';
import type { Viewport } from '../engine/Viewport';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, type Button } from './UIKit';
import { drawXpBar } from './Wealth';

interface Row { mp: MissionProgress; x: number; y: number; w: number; h: number }

/** Temps restant avant minuit (missions du jour) ou lundi (semaine), heure locale. */
export function resetCountdown(now = new Date()): { day: string; week: string } {
  const mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const dow = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setHours(24 * (7 - dow), 0, 0, 0);
  const fmt = (ms: number) => { const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000); return h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h ${String(m).padStart(2, '0')}`; };
  return { day: fmt(mid.getTime() - now.getTime()), week: fmt(mon.getTime() - now.getTime()) };
}

export class MissionsMenu extends Modal {
  private rows: Row[] = [];
  private headers: Array<{ text: string; sub: string; x: number; y: number }> = [];
  private busy = false;
  private loaded = false;
  private message: string | null = null;
  onReward: ((coins: number, xp: number, item: string | null) => void) | null = null;

  constructor(s: Services) {
    super(s, 'Missions');
    void this.refresh();
  }

  private vp: Viewport | null = null;
  private async refresh(): Promise<void> {
    const r = await this.s.ask('purser', 'purser', 'missions', {});
    this.loaded = true;
    if (!r.ok) this.message = r.error;
    if (this.vp) this.layout(this.vp);
  }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    this.vp = vp;
    const ui = vp.ui, wide = vp.width > vp.height && vp.width >= 640;
    return { w: Math.min(maxW, (wide ? 760 : 440) * ui), h: Math.min(maxH, (wide ? 3 : 6) * 70 * ui + 90 * ui) };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, m = this.s.data.missions, c = this.content;
    const wide = vp.width > vp.height && vp.width >= 640;
    this.rows = []; this.headers = [];
    const out: Button[] = [];
    if (!m) return out;
    const cd = resetCountdown();
    const cols = wide ? 2 : 1, colW = (c.w - 14 * ui * (cols - 1)) / cols;
    const groups: Array<[string, string, MissionProgress[]]> = [['Aujourd’hui', `renouvelées dans ${cd.day}`, m.daily], ['Cette semaine', `renouvelées dans ${cd.week}`, m.weekly]];
    const rowH = Math.max(56, Math.min(70 * ui, (c.h - 40 * ui * (wide ? 1 : 2)) / (wide ? 3 : 6)));
    groups.forEach(([title, sub, list], gi) => {
      const x = c.x + (wide ? gi * (colW + 14 * ui) : 0);
      let y = c.y + (wide ? 0 : gi * (rowH * 3 + 40 * ui));
      this.headers.push({ text: title, sub, x, y: y + 12 * ui });
      y += 28 * ui;
      for (const mp of list) {
        const st = missionStatus(mp), def = MISSION_BY_ID.get(mp.id);
        if (!def) continue;
        this.rows.push({ mp, x, y, w: colW, h: rowH - 6 * ui });
        const bw = 104 * ui, bh = Math.max(44, 40 * ui);
        out.push(makeButton({
          id: `claim-${mp.id}`, label: st === 'réclamée' ? 'Reçue' : st === 'terminée' ? 'Réclamer' : 'En cours',
          style: st === 'terminée' ? 'gold' : 'ghost', enabled: st === 'terminée' && !this.busy, fontSize: 13,
          x: x + colW - bw - 8 * ui, y: y + (rowH - 6 * ui - bh) / 2, w: bw, h: bh,
          onTap: () => { void this.claim(mp.id); },
        }));
        y += rowH;
      }
    });
    return out;
  }

  private async claim(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; if (this.vp) this.layout(this.vp);
    const r = await this.s.ask('purser', 'purser', 'mission-claim', { id });
    this.busy = false;
    if (r.ok) {
      this.s.audio.coin();
      const item = r.view.item as string | null;
      this.message = `+${r.view.coins} KSCoins · +${r.view.xp} XP${item ? ` · ${FURNITURE_BY_ID.get(item)?.name ?? item} ajouté à ta cabine` : ''}`;
      this.onReward?.(Number(r.view.coins), Number(r.view.xp), item);
    } else { this.message = r.error; this.s.audio.error(); }
    if (this.vp) this.layout(this.vp);
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const ui = vp.ui;
    if (!this.s.data.missions) {
      ctx.fillStyle = PAL.textDim; ctx.font = font(14 * ui, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.loaded ? (this.message ?? 'Missions indisponibles') : 'Chargement…', this.content.x + this.content.w / 2, this.content.y + this.content.h / 2);
      return;
    }
    for (const h of this.headers) {
      spacedCaps(ctx, h.text, h.x, h.y, 13 * ui, LUXE.champagne);
      ctx.fillStyle = PAL.textDim; ctx.font = font(11 * ui, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const colW = this.rows.find((r) => r.x === h.x)?.w ?? this.content.w;
      ctx.fillText(h.sub, h.x + colW, h.y);
    }
    for (const r of this.rows) {
      const def = MISSION_BY_ID.get(r.mp.id)!;
      const st = missionStatus(r.mp);
      ctx.save();
      ctx.fillStyle = st === 'terminée' ? 'rgba(212,175,90,0.12)' : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = st === 'terminée' ? 'rgba(212,175,90,0.6)' : 'rgba(212,175,90,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect?.(r.x, r.y, r.w, r.h, 10 * ui); ctx.fill(); ctx.stroke();
      const tx = r.x + 12 * ui, textW = r.w - 130 * ui;
      ctx.fillStyle = st === 'réclamée' ? PAL.textDim : PAL.text; ctx.font = font(13.5 * ui, 800); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(def.label, tx, r.y + r.h * 0.3, textW);
      drawXpBar(ctx, tx, r.y + r.h * 0.55, Math.min(textW * 0.55, 150 * ui), 6 * ui, r.mp.progress / def.target);
      ctx.fillStyle = PAL.textDim; ctx.font = font(11 * ui, 700);
      const barW = Math.min(textW * 0.55, 150 * ui);
      ctx.fillText(`${r.mp.progress} / ${def.target}`, tx + barW + 8 * ui, r.y + r.h * 0.58);
      // Récompense
      const rx = tx, ry = r.y + r.h * 0.82;
      drawKSCoin(ctx, rx + 6 * ui, ry, 6 * ui);
      ctx.fillStyle = LUXE.champagne; ctx.font = font(11 * ui, 800);
      const rew = `${def.coins}${def.xp ? ` · ${def.xp} XP` : ''}${def.item ? ` · ${FURNITURE_BY_ID.get(def.item)?.name ?? ''}` : ''}${def.online ? ' · en ligne' : ''}`;
      ctx.fillText(rew, rx + 16 * ui, ry, textW - 16 * ui);
      ctx.restore();
    }
    if (this.message) {
      ctx.fillStyle = LUXE.champagne; ctx.font = font(12 * ui, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(this.message, this.content.x + this.content.w / 2, this.content.y + this.content.h, this.content.w);
    }
  }
}
