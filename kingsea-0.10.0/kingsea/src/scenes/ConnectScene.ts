// Écran de connexion : jouer en ligne (créer un compte, se connecter, reprendre sa session) ou hors ligne.
// L'adresse du serveur se règle ici ; si la page est servie par un serveur KingSea, elle est trouvée seule.
import { drawLook } from '../art/characters';
import { roundRect } from '../art/canvas';
import { drawKSLogo } from '../art/logo';
import { PAL } from '../art/palette';
import { drawMenuBackdrop } from '../art/scenery';
import type { PointerHandler } from '../engine/Input';
import type { Scene } from '../engine/Scene';
import { Connection, defaultServerUrl, probeServer, saveServerUrl } from '../net/Net';
import type { OwnProfile } from '../net/protocol';
import type { Services } from '../systems/Services';
import { openAuthForm } from '../ui/AuthForm';
import { promptServer } from '../ui/TextPrompt';
import { ButtonLayer, drawPanel, font, makeButton, type Button } from '../ui/UIKit';

type Probe = { state: 'checking' } | { state: 'ok'; name: string; online: number } | { state: 'ko'; error: string };

export class ConnectScene implements Scene {
  readonly layer = new ButtonLayer(6);
  private t = 0;
  serverUrl = defaultServerUrl();
  probe: Probe = { state: 'checking' };
  private conn: Connection | null = null;
  message = '';
  private busy = false;
  private panel = { x: 0, y: 0, w: 0, h: 0 };
  private btn: Record<string, Button> = {};

  constructor(private s: Services, private world: () => Scene, private back: () => Scene, private offline: () => void) {
    this.layer.onTapSound = () => s.audio.tap();
    const mk = (id: string, label: string, style: Button['style'], onTap: () => void, fontSize = 16) => (this.btn[id] = makeButton({ id, label, style, fontSize, onTap }));
    mk('resume', 'Continuer', 'gold', () => void this.resume(), 18);
    mk('register', 'Créer un compte', 'gold', () => this.auth('register'), 17);
    mk('login', 'Se connecter', 'secondary', () => this.auth('login'));
    mk('server', 'Serveur', 'ghost', () => this.editServer(), 13);
    mk('retry', 'Réessayer', 'secondary', () => void this.check(), 14);
    mk('offline', 'Jouer hors ligne', 'secondary', () => this.offline(), 15);
    mk('back', '‹ Retour', 'ghost', () => this.s.game.goto(this.back), 14);
    this.layer.buttons = Object.values(this.btn);
  }

  enter(): void {
    this.layout();
    this.s.audio.setMusic('menu');
    void this.check();
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __ksConnect: unknown }).__ksConnect = this;
  }
  exit(): void {}
  onResize(): void { this.layout(); }
  onBack(): boolean { this.s.game.goto(this.back); return true; }
  pointerHandlers(): PointerHandler[] { return [this.layer]; }

  private get hasToken(): boolean { try { return !!localStorage.getItem('kingsea.token'); } catch { return false; } }

  async check(): Promise<void> {
    this.probe = { state: 'checking' };
    const r = await probeServer(this.serverUrl);
    this.probe = r.ok ? { state: 'ok', name: r.name, online: r.online } : { state: 'ko', error: r.error };
    this.layout();
  }

  private editServer(): void {
    promptServer(this.serverUrl, (v) => { if (v === null) return; this.serverUrl = v; saveServerUrl(v); void this.check(); });
  }

  private connection(): Connection {
    if (!this.conn || this.conn.url !== this.serverUrl) { this.conn?.close(); this.conn = new Connection(this.serverUrl); }
    return this.conn;
  }

  private enterWorld(conn: Connection, profile: OwnProfile, notice?: string): void {
    this.s.goOnline(conn, profile);
    if (notice) this.s.notice = notice;
    this.s.audio.discover();
    this.s.game.goto(this.world, 2.6);
  }

  async resume(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.message = 'Connexion…';
    const conn = this.connection();
    const r = await conn.open();
    this.busy = false;
    if (r.ok) { this.enterWorld(conn, r.profile, r.notice); return; }
    this.message = r.needAuth ? 'Session expirée : reconnecte-toi.' : r.msg;
    if (r.needAuth) { try { localStorage.removeItem('kingsea.token'); } catch { /* indisponible */ } }
    this.layout();
  }

  private auth(mode: 'register' | 'login'): void {
    if (this.busy) return;
    const initial = mode === 'register' && this.s.data.name !== 'Passager' ? this.s.data.name : '';
    openAuthForm(mode, initial, async ({ name, password }) => {
      const conn = this.connection();
      if (conn.state !== 'online') {
        const o = await conn.open();
        if (o.ok) { this.enterWorld(conn, o.profile, o.notice); return null; }
        if (!o.needAuth) return o.msg;
      }
      const r = mode === 'register' ? await conn.register(name, password, this.s.data.appearance) : await conn.login(name, password);
      if (!r.ok) return r.msg;
      this.enterWorld(conn, r.profile, r.notice);
      return null;
    }, () => {});
  }

  private layout(): void {
    const v = this.s.game.viewport, ui = v.ui;
    const pw = Math.min(380 * ui, v.width - v.safe.left - v.safe.right - 24 * ui);
    const px = v.isPortrait ? (v.width - pw) / 2 : Math.min(v.width * 0.56, v.width - v.safe.right - pw - 16 * ui);
    const py = v.isPortrait ? v.height * 0.36 : v.safe.top + 14 * ui;
    const ph = Math.min(v.height - py - v.safe.bottom - 12 * ui, 360 * ui);
    this.panel = { x: px, y: py, w: pw, h: ph };
    const pad = 14 * ui, bw = pw - pad * 2, bh = 48 * ui, gap = 9 * ui;
    for (const b of Object.values(this.btn)) b.visible = false;
    let y = py + 66 * ui;
    const put = (id: string, h = bh) => { Object.assign(this.btn[id], { x: px + pad, y, w: bw, h, visible: true }); y += h + gap; };
    const ok = this.probe.state === 'ok';
    let last = ''; try { last = localStorage.getItem('kingsea.lastName') ?? ''; } catch { /* indisponible */ }
    this.btn.resume.label = last ? `Continuer · ${last}` : 'Continuer';
    this.btn.register.style = ok && this.hasToken ? 'secondary' : 'gold';
    if (ok && this.hasToken) put('resume', 52 * ui);
    if (ok) { put('register'); put('login'); }
    else if (this.probe.state === 'ko') put('retry', 44 * ui);
    put('offline', 44 * ui);
    Object.assign(this.btn.server, { x: px + pad, y: py + ph - 40 * ui - pad, w: bw * 0.62, h: 40 * ui, visible: true });
    Object.assign(this.btn.back, { x: px + pad + bw * 0.65, y: py + ph - 40 * ui - pad, w: bw * 0.35, h: 40 * ui, visible: true });
    this.btn.server.label = `Serveur : ${this.serverUrl ? this.serverUrl.replace(/^https?:\/\//, '') : 'à régler'} ✎`;
  }

  update(dt: number): void { this.t += dt; }

  render(ctx: CanvasRenderingContext2D): void {
    const v = this.s.game.viewport, ui = v.ui, P = this.panel;
    drawMenuBackdrop(ctx, v.width, v.height, this.t, this.s.lowFx);
    if (!v.isPortrait) drawKSLogo(ctx, v.safe.left + (P.x - v.safe.left) / 2, v.height * 0.42, Math.min(v.height * 0.38, 210), this.t);
    else drawKSLogo(ctx, v.width / 2, v.height * 0.17, Math.min(v.width * 0.36, 170), this.t);
    drawPanel(ctx, P.x, P.y, P.w, P.h, ui);
    ctx.fillStyle = PAL.goldLight; ctx.font = font(19 * ui, 900); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Jouer en ligne', P.x + 16 * ui, P.y + 22 * ui);
    // État du serveur
    const st = this.probe;
    const dot = st.state === 'ok' ? PAL.success : st.state === 'ko' ? PAL.danger : PAL.gold;
    ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(P.x + 22 * ui, P.y + 46 * ui, 5 * ui, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.textDim; ctx.font = font(12.5 * ui, 600);
    const line = st.state === 'ok' ? `${st.name} · ${st.online} joueur${st.online > 1 ? 's' : ''} en ligne` : st.state === 'ko' ? `${st.error}${this.serverUrl ? '' : ' — règle l’adresse du serveur'}` : 'Recherche du serveur…';
    ctx.fillText(line, P.x + 34 * ui, P.y + 46 * ui, P.w - 46 * ui);
    this.layer.render(ctx, ui);
    if (this.message) {
      ctx.fillStyle = PAL.goldLight; ctx.font = font(13 * ui, 700); ctx.textAlign = 'center';
      ctx.fillText(this.message, P.x + P.w / 2, this.btn.server.y - 14 * ui, P.w - 20 * ui);
    }
    // Petit aperçu du personnage au-dessus du panneau (paysage)
    if (!v.isPortrait) {
      roundRect(ctx, P.x + P.w - 64 * ui, P.y + 8 * ui, 52 * ui, 52 * ui, 10 * ui); ctx.fillStyle = 'rgba(11,58,102,0.9)'; ctx.fill();
      ctx.save(); roundRect(ctx, P.x + P.w - 64 * ui, P.y + 8 * ui, 52 * ui, 52 * ui, 10 * ui); ctx.clip();
      drawLook(ctx, this.s.data.appearance, 'idle', 'down', Math.floor(this.t * 2.5), P.x + P.w - 38 * ui, P.y + 66 * ui, (52 * ui) / 48 * 1.1);
      ctx.restore();
    }
  }
}
