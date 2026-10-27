// Paramètres : volumes séparés (effets / ambiance / musique), taille des commandes, effets réduits, économie d'énergie,
// qualité automatique, vibrations, diagnostic (FPS, mémoire, erreurs, rapport à copier), réinitialisation.
import { PAL } from '../art/palette';
import type { Viewport } from '../engine/Viewport';
import { Diagnostics } from '../systems/Diagnostics';
import { openDeleteForm, openPasswordForm } from './AccountForms';
import { openLegal } from './LegalView';
import type { Services } from '../systems/Services';
import { Modal } from './Modal';
import { font, makeButton, wrapText, type Button } from './UIKit';

const JOY_SIZES: Array<[number, string]> = [[0.8, 'Petit'], [1, 'Moyen'], [1.25, 'Grand']];

export class SettingsMenu extends Modal {
  private rows: Array<{ label: string; x: number; y: number; w?: number }> = [];
  private confirmReset = 0;
  private view: 'main' | 'diag' | 'more' = 'main';
  private diagRefresh = 0;
  private copyMsg: { text: string; t: number } | null = null;
  private diagText = '';

  constructor(s: Services, private opts: { onChanged: () => void; onControls?: () => void; onQuitToMenu?: () => void; onReset: () => void; onLogout?: () => void; onAccountDeleted?: () => void }) {
    super(s, 'Paramètres');
  }

  update(dt: number): void {
    super.update(dt);
    if (this.confirmReset > 0) { this.confirmReset -= dt; if (this.confirmReset <= 0) this.relayout(); }
    if (this.copyMsg) { this.copyMsg.t -= dt; if (this.copyMsg.t <= 0) this.copyMsg = null; }
    if (this.view === 'diag' && (this.diagRefresh -= dt) <= 0) { this.diagRefresh = 1; this.diagText = this.report(); }
  }

  private report(): string {
    const set = this.s.data.settings, g = this.s.game;
    return Diagnostics.report({
      Qualité: `${set.powerSaver ? 'économie d’énergie' : g.autoLow ? 'réduite automatiquement' : set.lowFx ? 'effets réduits' : 'normale'} · densité ${g.viewport.dpr} · cadence max ${g.maxFps}`,
      Mode: this.s.online ? 'en ligne' : 'hors ligne',
      Sauvegarde: this.s.persistent ? 'persistante' : 'indisponible',
    });
  }

  private async copyReport(): Promise<void> {
    const text = this.report();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* repli ci-dessous */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch { ok = false; }
    }
    this.copyMsg = { text: ok ? 'Rapport copié : collez-le dans un message.' : 'Copie impossible sur cet appareil.', t: 3 };
  }

  private vp: Viewport | null = null;
  private relayout(): void { if (this.vp) this.layout(this.vp); }

  protected measure(vp: Viewport, maxW: number, maxH: number): { w: number; h: number } {
    this.vp = vp;
    const ui = vp.ui;
    const wide = vp.width > vp.height || vp.width >= 560;
    // Paysage : trois colonnes (12 réglages sur 4 lignes) pour garder des cibles de 44 px même sur petit écran.
    // Portrait : volumes sur 4 lignes, puis les 8 options deux par ligne (libellé et valeur sur deux lignes, plus aérés)
    const rows = wide ? 5 : 9;
    return { w: Math.min(maxW, (wide ? 900 : 420) * ui), h: Math.min(maxH, rows * 54 * ui + 60 * ui) };
  }

  protected place(vp: Viewport): Button[] {
    const ui = vp.ui, set = this.s.data.settings, out: Button[] = [];
    const wide = vp.width > vp.height || vp.width >= 560;
    if (this.view === 'diag') return this.placeDiag(vp);
    if (this.view === 'more') return this.placeMore(vp);
    const cols = wide ? 3 : 1;
    const colW = wide ? (this.content.w - 20 * ui * (cols - 1)) / cols : this.content.w;
    // Cibles tactiles d'au moins 44 px CSS, même sur les petits écrans en paysage (audit phase 7)
    const rowH = Math.min(wide ? 54 * ui : 60 * ui, (this.content.h - 48 - 4 * ui) / (wide ? 5 : 8.4));
    const bh = Math.max(44, Math.min(44 * ui, rowH - 2));
    this.rows = [];
    let i = 0;
    const slot = () => {
      const col = wide ? i % cols : 0, row = wide ? Math.floor(i / cols) : i;
      i++;
      return { x: this.content.x + col * (colW + 20 * ui), y: this.content.y + row * rowH };
    };
    const changed = () => { this.s.applySettings(); this.s.save.markDirty(); this.opts.onChanged(); this.layout(vp); };

    const volume = (label: string, key: 'masterVolume' | 'sfxVolume' | 'ambientVolume' | 'musicVolume') => {
      const p = slot();
      this.rows.push({ label: `${label} : ${Math.round(set[key] * 100)} %`, x: p.x, y: p.y + rowH / 2, w: colW - bh * 2 - 16 * ui });
      const mk = (id: string, txt: string, dx: number, delta: number) => makeButton({
        id, label: txt, style: 'secondary', x: p.x + colW - dx, y: p.y + (rowH - bh) / 2, w: bh, h: bh, fontSize: 20,
        enabled: delta < 0 ? set[key] > 0 : set[key] < 1,
        onTap: () => { set[key] = Math.round(Math.min(1, Math.max(0, set[key] + delta)) * 10) / 10; changed(); },
      });
      out.push(mk(`${key}-`, '−', bh * 2 + 8 * ui, -0.1), mk(`${key}+`, '+', bh, 0.1));
    };
    let t = 0;
    const toggle = (label: string, value: string, onTap: () => void, active = false) => {
      if (wide) {
        const p = slot();
        out.push(makeButton({ id: label, label: `${label} : ${value}`, style: 'secondary', active, x: p.x, y: p.y + (rowH - bh) / 2, w: colW, h: bh, fontSize: 15, onTap }));
        return;
      }
      // Portrait : deux options par ligne, espacées
      const gap = 10 * ui, w2 = (colW - gap) / 2, h2 = Math.max(48, rowH - 8 * ui);
      const x = this.content.x + (t % 2) * (w2 + gap), y = this.content.y + (4 + Math.floor(t / 2)) * rowH + (rowH - h2) / 2;
      t++;
      out.push(makeButton({ id: label, label, sub: value, style: 'secondary', active, x, y, w: w2, h: h2, fontSize: 14, onTap }));
    };

    volume('Général', 'masterVolume');
    volume('Effets', 'sfxVolume');
    volume('Ambiance', 'ambientVolume');
    volume('Musique', 'musicVolume');
    const js = JOY_SIZES.find(([v]) => Math.abs(v - set.joystickScale) < 0.01) ?? JOY_SIZES[1];
    toggle('Commandes', set.leftHanded ? 'gaucher' : 'droitier', () => { set.leftHanded = !set.leftHanded; changed(); }, set.leftHanded);
    toggle('Taille des commandes', js[1], () => { const idx = JOY_SIZES.indexOf(js); set.joystickScale = JOY_SIZES[(idx + 1) % JOY_SIZES.length][0]; changed(); });
    toggle('Effets réduits', set.lowFx ? 'oui' : 'non', () => { set.lowFx = !set.lowFx; changed(); }, set.lowFx);
    toggle('Vibrations', set.haptics ? 'oui' : 'non', () => { set.haptics = !set.haptics; changed(); if (set.haptics) this.s.haptic(30); }, set.haptics);
    toggle('Économie d’énergie', set.powerSaver ? 'oui' : 'non', () => { set.powerSaver = !set.powerSaver; changed(); }, set.powerSaver);
    toggle('Qualité auto', set.autoQuality ? 'oui' : 'non', () => { set.autoQuality = !set.autoQuality; changed(); }, set.autoQuality);
    if (this.opts.onControls) toggle('Touches et manette', 'ouvrir', () => { this.close(); this.opts.onControls?.(); });
    toggle('Diagnostic', 'ouvrir', () => { this.view = 'diag'; this.diagRefresh = 0; this.title = 'Diagnostic'; this.layout(vp); });

    // Ligne d'actions en bas
    const by = this.content.y + this.content.h - Math.max(44, 44 * ui);
    const actions: Button[] = [];
    if (this.opts.onLogout) actions.push(makeButton({ id: 'logout', label: 'Déconnexion', style: 'ghost', fontSize: 14, onTap: () => { this.close(); this.opts.onLogout?.(); } }));
    else actions.push(makeButton({
      id: 'reset', label: this.confirmReset > 0 ? 'Confirmer : tout effacer' : 'Réinitialiser la partie', style: this.confirmReset > 0 ? 'danger' : 'ghost', fontSize: 14,
      onTap: () => {
        if (this.confirmReset > 0) { this.confirmReset = 0; this.opts.onReset(); this.close(); }
        else { this.confirmReset = 4; this.layout(vp); }
      },
    }));
    actions.push(makeButton({ id: 'more', label: this.s.online ? 'Compte et infos' : 'Infos', style: 'secondary', fontSize: 14, onTap: () => { this.view = 'more'; this.title = this.s.online ? 'Mon compte' : 'Informations'; this.layout(vp); } }));
    if (this.opts.onQuitToMenu) actions.push(makeButton({ id: 'quit', label: 'Menu principal', style: 'secondary', fontSize: 14, onTap: () => { this.close(); this.opts.onQuitToMenu?.(); } }));
    const gap = 10 * ui, aw = Math.min(240 * ui, (this.content.w - gap * (actions.length - 1)) / actions.length);
    actions.forEach((a, k) => Object.assign(a, { x: this.content.x + k * (aw + gap), y: by, w: aw, h: Math.max(44, 44 * ui) }));
    return [...out, ...actions];
  }

  /** Compte en ligne (mot de passe, suppression) et textes légaux. */
  private placeMore(vp: Viewport): Button[] {
    const ui = vp.ui, bh = Math.max(44, 44 * ui), gap = 10 * ui, net = this.s.online ? this.s.net : null;
    const items: Button[] = [];
    const add = (id: string, label: string, onTap: () => void, style: 'secondary' | 'danger' | 'ghost' = 'secondary') => items.push(makeButton({ id, label, style, fontSize: 15, onTap }));
    if (net) {
      add('pw', 'Changer mon mot de passe', () => openPasswordForm((o, n) => net.changePassword(o, n), () => {}));
      add('delete', 'Supprimer mon compte', () => openDeleteForm(this.s.data.name, (pw) => net.deleteAccount(pw), (ok) => { if (ok) { this.close(); this.opts.onAccountDeleted?.(); } }), 'danger');
    }
    add('privacy', 'Politique de confidentialité', () => openLegal('privacy'));
    add('terms', 'Conditions d’utilisation', () => openLegal('terms'));
    add('about', 'À propos', () => openLegal('about'));
    add('more-back', 'Retour', () => { this.view = 'main'; this.title = 'Paramètres'; this.layout(vp); }, 'ghost');
    const wide = vp.width > vp.height;
    const cols = wide ? 2 : 1, cw = (this.content.w - gap * (cols - 1)) / cols;
    items.forEach((b, k) => Object.assign(b, { x: this.content.x + (k % cols) * (cw + gap), y: this.content.y + Math.floor(k / cols) * (bh + gap), w: cw, h: bh }));
    return items;
  }

  private placeDiag(vp: Viewport): Button[] {
    const ui = vp.ui, set = this.s.data.settings, bh = Math.max(44, 44 * ui), gap = 10 * ui;
    const by = this.content.y + this.content.h - bh;
    const bs = [
      makeButton({ id: 'diag-back', label: 'Retour', style: 'secondary', fontSize: 14, onTap: () => { this.view = 'main'; this.title = 'Paramètres'; this.layout(vp); } }),
      makeButton({ id: 'diag-fps', label: `FPS à l’écran : ${set.showFps ? 'oui' : 'non'}`, style: 'secondary', active: set.showFps, fontSize: 14, onTap: () => { set.showFps = !set.showFps; this.s.save.markDirty(); this.opts.onChanged(); this.layout(vp); } }),
      makeButton({ id: 'diag-copy', label: 'Copier le rapport', style: 'primary', fontSize: 14, onTap: () => { void this.copyReport(); } }),
    ];
    const bw = (this.content.w - gap * (bs.length - 1)) / bs.length;
    bs.forEach((b, k) => Object.assign(b, { x: this.content.x + k * (bw + gap), y: by, w: bw, h: bh }));
    return bs;
  }

  protected renderContent(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    if (this.view === 'more') {
      const ui = vp.ui;
      ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(this.s.online ? 'Pas de récupération par e-mail : garde ton mot de passe en lieu sûr.' : 'Hors ligne, ta partie reste uniquement sur ce téléphone.', this.content.x, this.content.y + this.content.h, this.content.w);
      return;
    }
    if (this.view === 'diag') {
      const ui = vp.ui, c = this.content, lh = 15 * ui;
      ctx.fillStyle = PAL.text; ctx.font = font(11.5 * ui, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const lines = this.diagText.split('\n').slice(1).flatMap((l) => wrapText(ctx, l, c.w));
      const max = Math.max(1, Math.floor((c.h - 70 * ui) / lh));
      lines.slice(0, max).forEach((l, k) => ctx.fillText(l, c.x, c.y + k * lh, c.w));
      if (this.copyMsg) { ctx.fillStyle = PAL.gold; ctx.font = font(13 * ui, 700); ctx.fillText(this.copyMsg.text, c.x, c.y + c.h - 70 * ui, c.w); }
      return;
    }
    ctx.fillStyle = PAL.text; ctx.font = font(15 * vp.ui, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const r of this.rows) ctx.fillText(r.label, r.x, r.y, r.w);
    if (!this.s.persistent) {
      ctx.fillStyle = PAL.danger; ctx.font = font(12 * vp.ui, 600);
      ctx.fillText('Stockage indisponible : la progression ne sera pas conservée.', this.content.x, this.content.y + this.content.h - 58 * vp.ui);
    }
  }
}
