// Embarquement / garde-robe : pseudo et apparence du personnage, avec aperçu animé en grand.
// Profil local pour l'instant ; en multijoueur (phase 6), il sera enregistré sur le serveur et vu des autres joueurs.
import { unlockLevel } from '../authority/progress';
import { ITEMS_BY_ID } from '../data/items';
import {
  ANIMS, drawLookDirect, enforceUnlocks, HAIR_COLORS, PLAYER_GLASSES, PLAYER_JEWELS, PLAYER_PANTS, PLAYER_SHOES, HAIR_STYLES, OUTFIT_COLORS, PLAYER_HATS, PLAYER_OUTFITS, randomLook, releaseLook, SKIN_TONES,
  warmLook, type Anim, type Dir, type Look,
} from '../art/characters';
import { roundRect } from '../art/canvas';
import { drawKSLogo } from '../art/logo';
import { drawOceanBackground } from '../art/ocean';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import type { Scene } from '../engine/Scene';
import type { Services } from '../systems/Services';
import { promptText } from '../ui/TextPrompt';
import { ButtonLayer, drawPanel, font, makeButton, type Button } from '../ui/UIKit';

type Tab = 'silhouette' | 'cheveux' | 'tenue' | 'bas' | 'accessoires';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'silhouette', label: 'Silhouette' }, { id: 'cheveux', label: 'Cheveux' }, { id: 'tenue', label: 'Tenue' }, { id: 'bas', label: 'Bas' }, { id: 'accessoires', label: 'Accessoires' },
];
const PREVIEW_ANIMS: Anim[] = ['idle', 'walk', 'wave', 'dance', 'cheer'];
const ANIM_LABELS: Record<string, string> = { idle: 'Attente', walk: 'Marche', wave: 'Salut', dance: 'Danse', cheer: 'Joie' };
const ACCENTS = ['#e5b54a', '#f4efe6', '#1fc7c1', '#ff6f91', '#c0392b', '#7b4dff'];

const swatchIcon = (color: string) => (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
};

export class ProfileScene implements Scene {
  readonly layer = new ButtonLayer(4);
  look: Look;
  name: string;
  private tab: Tab = 'silhouette';
  private t = 0;
  private dir: Dir = 'down';
  private animIdx = 0;
  private preview = { x: 0, y: 0, w: 0, h: 0 };
  private panel = { x: 0, y: 0, w: 0, h: 0 };
  private rows: Array<{ label: string; x: number; y: number }> = [];
  private previewTap: PointerHandler = { onDown: (p) => this.tapPreview(p) };
  private prompting = false;

  constructor(private s: Services, private next: () => Scene, readonly mode: 'first' | 'edit') {
    this.look = { ...s.data.appearance };
    this.name = s.data.name === 'Passager' && mode === 'first' ? '' : s.data.name;
    this.layer.onTapSound = () => s.audio.tap();
  }

  enter(): void {
    this.layout();
    if (this.mode === 'first') this.s.audio.setMusic('menu');
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __ksProfile: unknown }).__ksProfile = this;
  }
  exit(): void {}
  onResize(): void { this.layout(); }
  onBack(): boolean { if (this.mode === 'edit') this.confirm(); return true; }
  pointerHandlers(): PointerHandler[] { return [this.layer, this.previewTap]; }

  private tapPreview(p: PointerInfo): boolean {
    const r = this.preview;
    if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h * 0.8) return false;
    this.animIdx = (this.animIdx + 1) % PREVIEW_ANIMS.length;
    this.s.audio.tap();
    return true;
  }

  private set<K extends keyof Look>(k: K, v: Look[K]): void { this.look = { ...this.look, [k]: v }; this.layout(); }

  private askName(): void {
    if (this.prompting) return;
    this.prompting = true;
    promptText('Ton pseudo à bord', this.name, (v) => { this.prompting = false; if (v) { this.name = v; this.layout(); } });
  }

  private confirm(): void {
    const d = this.s.data;
    this.look = enforceUnlocks(this.look, this.owned);
    const old = d.appearance;
    d.appearance = { ...this.look };
    if (this.name && !this.s.online) d.name = this.name; // en ligne, le pseudo est celui du compte
    this.s.net?.send({ t: 'look', look: this.look });
    d.flags['profile.done'] = true;
    this.s.save.saveNow();
    if (JSON.stringify(old) !== JSON.stringify(this.look)) releaseLook(old);
    warmLook(this.look, ['walk', 'idle']);
    this.s.audio.discover();
    this.s.game.goto(this.next, 3);
  }

  /** Éléments portables possédés : récompenses de niveau + achats (inventaire). */
  private get owned(): string[] { return [...this.s.progress.unlocks, ...Object.keys(this.s.data.inventory?.items ?? {})]; }

  private layout(): void {
    const v = this.s.game.viewport, ui = v.ui;
    const L = v.safe.left + 12 * ui, R = v.width - v.safe.right - 12 * ui, T = v.safe.top + 10 * ui, B = v.height - v.safe.bottom - 10 * ui;
    if (v.isPortrait) {
      this.preview = { x: L, y: T + 40 * ui, w: R - L, h: (B - T) * 0.36 };
      this.panel = { x: L, y: this.preview.y + this.preview.h + 10 * ui, w: R - L, h: B - (this.preview.y + this.preview.h + 10 * ui) };
    } else {
      const pw = Math.min((R - L) * 0.38, 330 * ui);
      this.preview = { x: L, y: T + 34 * ui, w: pw, h: B - T - 34 * ui };
      this.panel = { x: L + pw + 12 * ui, y: T, w: R - L - pw - 12 * ui, h: B - T };
    }
    const P = this.panel, pad = 12 * ui, out: Button[] = [];
    this.rows = [];
    // Onglets
    const tw = (P.w - pad * 2 - 6 * ui * (TABS.length - 1)) / TABS.length, th = 42 * ui;
    TABS.forEach((tb, i) => out.push(makeButton({
      id: `tab-${tb.id}`, label: tb.label, style: 'secondary', active: this.tab === tb.id, fontSize: 13,
      x: P.x + pad + i * (tw + 6 * ui), y: P.y + pad, w: tw, h: th, onTap: () => { this.tab = tb.id; this.layout(); },
    })));
    let y = P.y + pad + th + 14 * ui;
    const x0 = P.x + pad, maxX = P.x + P.w - pad, sw = 44 * ui, gap = 8 * ui;
    const label = (txt: string) => { this.rows.push({ label: txt, x: x0, y: y + 8 * ui }); y += 20 * ui; };
    const flow = (items: Button[]) => {
      let x = x0;
      for (const b of items) {
        if (x + b.w > maxX + 0.5) { x = x0; y += b.h + gap; }
        b.x = x; b.y = y; x += b.w + gap; out.push(b);
      }
      y += (items[0]?.h ?? 0) + 12 * ui;
    };
    const swatches = (id: string, colors: string[], cur: string, set: (c: string) => void) =>
      flow(colors.map((c) => makeButton({ id: `${id}-${c}`, style: 'ghost', icon: swatchIcon(c), active: c === cur, w: sw, h: sw, onTap: () => set(c) })));
    const unlocks = this.s.progress.unlocks, owned = this.owned;
    const chips = <T extends string>(id: string, list: Array<{ id: T; label: string; unlock?: string }>, cur: T, set: (v: T) => void) => {
      const cw = Math.max(70 * ui, Math.min(120 * ui, (maxX - x0 - gap * 3) / 4));
      flow(list.map((o) => {
        // Élément de récompense (niveau) ou de boutique : visible mais verrouillé tant qu'il n'est pas obtenu
        const locked = !!o.unlock && !owned.includes(o.unlock);
        const lv = o.unlock ? unlockLevel(o.unlock) : null;
        const shop = o.unlock ? ITEMS_BY_ID.get(o.unlock) : undefined;
        const sub = !locked ? undefined : lv ? `niveau ${lv}` : shop ? `Boutique · ${shop.price}` : undefined;
        return makeButton({ id: `${id}-${o.id}`, label: locked ? `🔒 ${o.label}` : o.label, sub, style: 'secondary', active: o.id === cur, enabled: !locked, fontSize: 13, w: cw, h: 42 * ui, onTap: () => set(o.id) });
      }));
    };
    const L2 = this.look;
    switch (this.tab) {
      case 'silhouette':
        label('Pseudo');
        flow([makeButton({ id: 'name', label: this.s.online ? `${this.name} (compte en ligne)` : this.name ? `${this.name}  ✎` : 'Choisir un pseudo  ✎', style: 'secondary', fontSize: 15, enabled: !this.s.online, w: Math.min(maxX - x0, 300 * ui), h: 46 * ui, onTap: () => this.askName() })]);
        label('Teint');
        swatches('skin', SKIN_TONES, L2.skin, (c) => this.set('skin', c));
        {
          // Titre affiché (débloqué par les niveaux) : enregistré tout de suite auprès de l'autorité
          const titles = unlocks.filter((u) => u.startsWith('title:')).map((u) => u.slice(6));
          if (titles.length) {
            label('Titre');
            const cur = this.s.progress.title;
            const cw = Math.max(80 * ui, Math.min(130 * ui, (maxX - x0 - gap * 3) / 4));
            flow([null, ...titles].map((t) => makeButton({ id: `title-${t ?? 'aucun'}`, label: t ?? 'Aucun', style: 'secondary', active: cur === t, fontSize: 13, w: cw, h: 42 * ui,
              onTap: () => void this.s.ask('purser', 'purser', 'title', { title: t }).then((r) => { if (r.ok) { this.s.progress.title = t; this.layout(); } }) })));
          }
        }
        break;
      case 'cheveux':
        label('Coiffure');
        chips('hair', HAIR_STYLES, L2.hairStyle, (v) => this.set('hairStyle', v));
        label('Couleur');
        swatches('haircol', HAIR_COLORS, L2.hair, (c) => this.set('hair', c));
        break;
      case 'tenue':
        label('Style');
        chips('outfit', PLAYER_OUTFITS, PLAYER_OUTFITS.some((o) => o.id === L2.outfit) ? L2.outfit : 'marin', (v) => this.set('outfit', v));
        label('Couleur');
        swatches('color', OUTFIT_COLORS, L2.color, (c) => this.set('color', c));
        break;
      case 'accessoires':
        label('Chapeau');
        chips('hat', PLAYER_HATS, PLAYER_HATS.some((o) => o.id === L2.hat) ? L2.hat : 'aucun', (v) => this.set('hat', v));
        label('Lunettes');
        flow([
          makeButton({ id: 'glasses', label: L2.glasses ? 'Lunettes : oui' : 'Lunettes : non', style: 'secondary', active: L2.glasses, fontSize: 13, w: 140 * ui, h: 42 * ui, onTap: () => this.set('glasses', !L2.glasses) }),
        ]);
        if (L2.glasses) { y -= 4 * ui; chips('gl', PLAYER_GLASSES, L2.glassesStyle ?? 'soleil', (v) => this.set('glassesStyle', v)); }
        label('Bijou');
        chips('jewel', PLAYER_JEWELS, L2.jewel ?? 'aucun', (v) => this.set('jewel', v));
        label('Détails (couleur d’accent)');
        flow(ACCENTS.map((c) => makeButton({ id: `accent-${c}`, style: 'ghost', icon: swatchIcon(c), active: c === L2.accent, w: sw, h: sw, onTap: () => this.set('accent', c) })));
        break;
      case 'bas':
        label('Pantalon');
        chips('pants', PLAYER_PANTS, L2.pants ?? 'auto', (v) => this.set('pants', v));
        label('Chaussures');
        chips('shoes', PLAYER_SHOES, L2.shoes ?? 'auto', (v) => this.set('shoes', v));
        break;
    }
    // Actions
    const bh = 50 * ui, bw = Math.min(200 * ui, (P.w - pad * 3) / 2);
    out.push(makeButton({ id: 'random', label: 'Au hasard', style: 'ghost', fontSize: 15, x: P.x + pad, y: P.y + P.h - pad - bh, w: bw, h: bh, onTap: () => { this.look = randomLook(); this.layout(); } }));
    out.push(makeButton({ id: 'confirm', label: this.mode === 'first' ? 'Embarquer' : 'Valider', style: 'gold', fontSize: 18, x: P.x + P.w - pad - bw, y: P.y + P.h - pad - bh, w: bw, h: bh, enabled: this.mode === 'edit' || this.name.length >= 2, onTap: () => this.confirm() }));
    // Rotation de l'aperçu
    const pr = this.preview, ab = 44 * ui;
    out.push(makeButton({ id: 'rot-l', label: '⟲', style: 'round', fontSize: 20, x: pr.x + 8 * ui, y: pr.y + pr.h - ab - 8 * ui, w: ab, h: ab, onTap: () => { this.dir = ({ down: 'left', left: 'up', up: 'right', right: 'down' } as Record<Dir, Dir>)[this.dir]; } }));
    out.push(makeButton({ id: 'rot-r', label: '⟳', style: 'round', fontSize: 20, x: pr.x + pr.w - ab - 8 * ui, y: pr.y + pr.h - ab - 8 * ui, w: ab, h: ab, onTap: () => { this.dir = ({ down: 'right', right: 'up', up: 'left', left: 'down' } as Record<Dir, Dir>)[this.dir]; } }));
    this.layer.buttons = out;
  }

  update(dt: number): void {
    this.t += dt;
    const c = this.layer.buttons.find((b) => b.id === 'confirm');
    if (c) c.enabled = this.mode === 'edit' || this.name.length >= 2;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const v = this.s.game.viewport, ui = v.ui, lowFx = this.s.lowFx;
    drawOceanBackground(ctx, v.width, v.height, this.t, lowFx);
    // Titre
    ctx.fillStyle = PAL.pearl; ctx.font = font(20 * ui, 900); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    drawKSLogo(ctx, this.preview.x + 16 * ui, v.safe.top + 26 * ui, 22 * ui, this.t, false);
    ctx.fillText(this.mode === 'first' ? 'Embarquement' : 'Garde-robe', this.preview.x + 40 * ui, v.safe.top + 26 * ui);

    // Scène d'aperçu : cabine-loge avec projecteur et podium KS
    const r = this.preview;
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 18 * ui); ctx.clip();
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, '#0b3a66'); g.addColorStop(0.62, '#082a4c'); g.addColorStop(0.62, '#7a4a22'); g.addColorStop(1, '#4f2f14');
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(r.x, r.y + r.h * 0.62 + i * r.h * 0.045, r.w, 1); }
    // Hublot avec la mer
    const hx = r.x + r.w * 0.8, hy = r.y + r.h * 0.36, hr = Math.min(r.w, r.h) * 0.11;
    ctx.fillStyle = '#9fd8f0'; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f6fa8'; ctx.fillRect(hx - hr, hy + Math.sin(this.t) * 2, hr * 2, hr);
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 4 * ui; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
    // Projecteur
    const sp = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.75, 4, r.x + r.w / 2, r.y + r.h * 0.6, r.h * 0.6);
    sp.addColorStop(0, 'rgba(255,240,200,0.35)'); sp.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sp; ctx.fillRect(r.x, r.y, r.w, r.h);
    // Podium
    const feetY = r.y + r.h * 0.8, cx = r.x + r.w / 2;
    ctx.fillStyle = '#0e2c52'; ctx.beginPath(); ctx.ellipse(cx, feetY + 4 * ui, r.w * 0.3, r.w * 0.075, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.stroke();
    const anim = PREVIEW_ANIMS[this.animIdx];
    const A = ANIMS[anim];
    const scale = Math.min((r.h * 0.62) / 48, (r.w * 0.6) / 32);
    const dir: Dir = A.dirs.includes(this.dir) ? this.dir : 'down';
    drawLookDirect(ctx, this.look, anim, dir, this.t * (anim === 'dance' ? 4 : A.fps), cx, feetY, scale);
    ctx.restore();
    ctx.strokeStyle = 'rgba(111,243,255,0.35)'; ctx.lineWidth = 1.5; roundRect(ctx, r.x, r.y, r.w, r.h, 18 * ui); ctx.stroke();
    ctx.fillStyle = PAL.text; ctx.font = font(15 * ui, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(this.name || 'Nouveau passager', cx, r.y + 10 * ui, r.w - 20 * ui);
    ctx.fillStyle = PAL.textDim; ctx.font = font(11 * ui, 600);
    ctx.fillText(`${ANIM_LABELS[anim]} · touche pour changer`, cx, r.y + 30 * ui, r.w - 20 * ui);

    // Panneau des choix
    const P = this.panel;
    drawPanel(ctx, P.x, P.y, P.w, P.h, ui);
    ctx.fillStyle = PAL.textDim; ctx.font = font(12 * ui, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const row of this.rows) ctx.fillText(row.label.toUpperCase(), row.x, row.y);
    if (this.mode === 'first' && this.name.length < 2) {
      ctx.fillStyle = PAL.goldLight; ctx.font = font(12 * ui, 700); ctx.textAlign = 'right';
      const c = this.layer.buttons.find((b) => b.id === 'confirm')!;
      ctx.fillText('Choisis d’abord un pseudo', c.x + c.w, c.y - 10 * ui);
    }
    this.layer.render(ctx, ui);
  }
}
