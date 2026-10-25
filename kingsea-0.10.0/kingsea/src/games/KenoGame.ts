// Keno : choisis 1 à 10 numéros sur 80, 20 numéros sont tirés (par l'autorité). La table des gains suit le nombre
// de numéros joués. Tirage animé boule par boule, numéros trouvés mis en évidence, gain en direct dans la table.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { KENO_PAY, kenoRtp } from './logic/keno';
import { secureRandom, shuffle } from './logic/rng';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawLabel, drawPill } from './widgets';
import { BetControl } from './casinoKit';
import { goldGradient, LUXE } from '../art/brand';

const BALL_TIME = 0.2;

export class KenoGame implements MiniGame {
  readonly id = 'keno';
  readonly title = 'Keno';
  readonly bg: [string, string] = ['#18121a', '#060407'];
  readonly currency = 'chips' as const;
  readonly rules =
    'Touche de 1 à 10 numéros (ou « Au hasard »), choisis ta mise, puis « Jouer ».\n20 numéros sur 80 sont tirés. Plus tu en trouves, plus tu gagnes : la table à droite dépend du nombre de numéros joués.\n' +
    'Taux de retour théorique entre 90 et 93 % selon le nombre de numéros.';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private hitPulse = new Map<number, number>();
  private picks: number[] = [];
  private drawn: number[] = [];
  private shown = 0;
  private revealT = 0;
  private phase: 'pick' | 'draw' | 'done' = 'pick';
  private settled = { stake: 0, payout: 0 };
  private waiting = false;
  private message = 'Choisis tes numéros (10 au maximum).';
  private grid = { x: 0, y: 0, cw: 0, ch: 0 };
  private side = { x: 0, y: 0, w: 0, h: 0 };
  private btn: Record<string, Button> = {};
  private gridHandler: PointerHandler = { onDown: (p) => this.tapGrid(p) };

  get holdBalance(): boolean { return this.phase === 'draw' || this.waiting; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [5, 10, 25, 100], min: 1, initial: 10 });
    this.btn.play = makeButton({ id: 'play', label: 'Jouer', style: 'gold', fontSize: 17, onTap: () => this.play() });
    this.btn.random = makeButton({ id: 'random', label: 'Au hasard', style: 'secondary', fontSize: 14, onTap: () => this.quickPick() });
    this.btn.clear = makeButton({ id: 'clear', label: 'Effacer', style: 'secondary', fontSize: 14, onTap: () => { if (this.phase !== 'draw') { this.picks = []; this.reset(); } } });
    this.layer.buttons = [...this.betCtl.buttons, this.btn.clear, this.btn.random, this.btn.play];
  }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui, ctrlH = this.betCtl.layout(a, ui, [[this.btn.clear, 96], [this.btn.random, 110], [this.btn.play, 140]]);
    const avail = a.h - ctrlH - 10 * ui;
    if (a.h > a.w * 1.2) {
      // Portrait : grille sur toute la largeur (cases plus grandes au doigt), tableau des gains dessous
      const cw = Math.min(a.w / 10, (avail * 0.62) / 8 * 1.1), ch = Math.min((avail * 0.62) / 8, cw * 1.1);
      this.grid = { x: a.x + (a.w - cw * 10) / 2, y: a.y, cw, ch };
      this.side = { x: a.x, y: a.y + ch * 8 + 12 * ui, w: a.w, h: avail - ch * 8 - 12 * ui };
      return;
    }
    const gw = a.w * 0.66, gh = avail;
    const cw = Math.min(gw / 10, gh / 8 * 1.3), ch = Math.min(gh / 8, cw);
    this.grid = { x: a.x, y: a.y, cw, ch };
    this.side = { x: a.x + cw * 10 + 12 * ui, y: a.y, w: a.x + a.w - (a.x + cw * 10 + 12 * ui), h: gh };
  }

  handlers(): PointerHandler[] { return [this.gridHandler, this.layer]; }
  canQuit() { return this.phase === 'draw' ? { ok: false as const, reason: 'Attends la fin du tirage' } : { ok: true as const }; }

  private reset(): void { if (this.phase === 'done') { this.phase = 'pick'; this.drawn = []; this.shown = 0; } }

  private tapGrid(p: PointerInfo): boolean {
    const G = this.grid;
    const col = Math.floor((p.x - G.x) / G.cw), row = Math.floor((p.y - G.y) / G.ch);
    if (col < 0 || col > 9 || row < 0 || row > 7) return false;
    if (this.phase === 'draw') return true;
    this.reset();
    const n = row * 10 + col + 1;
    if (this.picks.includes(n)) this.picks = this.picks.filter((x) => x !== n);
    else if (this.picks.length < 10) this.picks.push(n);
    else this.host.toasts.show('10 numéros au maximum', 'info');
    this.host.s.audio.chip();
    return true;
  }

  private quickPick(): void {
    if (this.phase === 'draw') return;
    this.reset();
    const k = this.picks.length || 6;
    this.picks = shuffle(Array.from({ length: 80 }, (_, i) => i + 1), secureRandom).slice(0, k);
  }

  private async play(): Promise<void> {
    const s = this.host.s;
    if (this.phase === 'draw' || this.waiting || this.picks.length === 0) return;
    this.reset();
    this.waiting = true;
    const bet = this.betCtl.amount;
    const r = await s.ask('casino', 'keno', 'play', { picks: [...this.picks], bet });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    this.betCtl.remember(bet);
    this.settled = { stake: r.stake, payout: r.payout }; this.drawn = r.view.drawn as number[]; this.shown = 0; this.revealT = 0; this.phase = 'draw'; this.message = 'Tirage en cours…';
  }

  update(dt: number): void {
    const s = this.host.s;
    if (this.phase === 'draw') {
      this.revealT += dt;
      if (this.revealT > BALL_TIME && this.shown < 20) {
        this.shown++; this.revealT = 0;
        const n = this.drawn[this.shown - 1];
        if (this.picks.includes(n)) { s.audio.coin(); this.hitPulse.set(n, 1); } else s.audio.tick();
      }
      if (this.shown >= 20 && this.revealT > 0.5) {
        const win = this.settled.payout, hits = this.picks.filter((n) => this.drawn.includes(n)).length;
        this.message = `${hits} / ${this.picks.length} trouvé${hits > 1 ? 's' : ''} · ${win > 0 ? `+${win} jetons` : 'pas de gain'}`;
        if (win > this.settled.stake) s.audio.win(); else if (win === 0) s.audio.lose();
        this.phase = 'done';
      }
    }
    for (const [k, v] of this.hitPulse) this.hitPulse.set(k, Math.max(0, v - dt * 1.2));
    this.betCtl.locked = this.phase === 'draw';
    this.betCtl.sync();
    this.btn.play.enabled = this.phase !== 'draw' && !this.waiting && this.picks.length > 0 && s.chips.canAfford(this.betCtl.amount);
    this.btn.play.label = this.phase === 'done' ? `Rejouer · ${this.betCtl.amount}` : `Jouer · ${this.betCtl.amount}`;
    this.btn.random.enabled = this.btn.clear.enabled = this.phase !== 'draw';
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, G = this.grid, shownSet = new Set(this.drawn.slice(0, this.shown));
    const last = this.shown > 0 ? this.drawn[this.shown - 1] : 0;
    // Grille : cases laquées, numéros joués en or, tirés en bordeaux, trouvés en or brillant
    for (let n = 1; n <= 80; n++) {
      const col = (n - 1) % 10, row = Math.floor((n - 1) / 10);
      const x = G.x + col * G.cw, y = G.y + row * G.ch;
      const picked = this.picks.includes(n), drawn = shownSet.has(n), hit = picked && drawn;
      const pulse = this.hitPulse.get(n) ?? 0, grow = (n === last && this.phase === 'draw' ? Math.max(0, 1 - this.revealT / BALL_TIME) : 0) + pulse * 0.4;
      ctx.save();
      ctx.translate(x + G.cw / 2, y + G.ch / 2); ctx.scale(1 + grow * 0.15, 1 + grow * 0.15);
      roundRect(ctx, -G.cw / 2 + 2, -G.ch / 2 + 2, G.cw - 4, G.ch - 4, 6 * ui);
      ctx.fillStyle = hit ? goldGradient(ctx, -G.cw / 2, -G.ch / 2, G.cw / 2, G.ch / 2) : drawn ? '#7a1f33' : picked ? 'rgba(212,175,90,0.28)' : 'rgba(255,255,255,0.06)';
      if (hit && pulse > 0) { ctx.shadowColor = 'rgba(255,230,160,0.9)'; ctx.shadowBlur = 14 * pulse; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = picked ? 'rgba(239,220,174,0.9)' : 'rgba(212,175,90,0.18)'; ctx.lineWidth = picked ? 1.6 : 1; ctx.stroke();
      drawLabel(ctx, String(n), 0, 0, Math.min(G.ch * 0.42, 15 * ui), hit ? '#1a1208' : picked ? LUXE.champagne : PAL.text, 'center', 800);
      ctx.restore();
    }
    // Panneau : boule tirée, compteur, table des gains en direct
    const S = this.side, k = this.picks.length;
    roundRect(ctx, S.x, S.y, S.w, S.h, 12 * ui); ctx.fillStyle = 'rgba(10,8,12,0.7)'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,90,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    let top = S.y + 10 * ui;
    if (this.phase !== 'pick' && this.shown > 0) {
      const br = Math.min(22 * ui, S.w * 0.12), bx = S.x + br + 12 * ui, by = top + br;
      const hitNow = this.picks.includes(last);
      const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, 1, bx, by, br);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, hitNow ? '#f3e2b3' : '#e9e4dc'); g.addColorStop(1, hitNow ? LUXE.gold : '#9a948c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      drawLabel(ctx, String(last), bx, by + 1, br * 0.9, hitNow ? '#1a1208' : '#16131a', 'center', 900);
      const hits = this.picks.filter((n) => shownSet.has(n)).length;
      drawLabel(ctx, `Boule ${this.shown} / 20`, bx + br + 10 * ui, by - 8 * ui, 12 * ui, PAL.text, 'left', 800);
      drawLabel(ctx, `${hits} trouvé${hits > 1 ? 's' : ''} sur ${k}`, bx + br + 10 * ui, by + 9 * ui, 11.5 * ui, LUXE.champagne, 'left', 700);
      top = by + br + 10 * ui;
    } else {
      drawLabel(ctx, k ? `${k} numéro${k > 1 ? 's' : ''} joué${k > 1 ? 's' : ''}` : 'Aucun numéro', S.x + S.w / 2, top + 8 * ui, 13 * ui, LUXE.champagne);
      top += 24 * ui;
    }
    if (k) {
      const table = KENO_PAY[k], rows = table.map((m, h) => [h, m] as const).filter(([, m]) => m > 0).reverse();
      const lh = Math.min(22 * ui, (S.y + S.h - 60 * ui - top) / Math.max(1, rows.length));
      const hits = this.phase !== 'pick' ? this.picks.filter((n) => shownSet.has(n)).length : -1;
      const bet = this.phase === 'pick' ? this.betCtl.amount : this.settled.stake;
      rows.forEach(([h, m], i) => {
        const y = top + i * lh + lh / 2;
        if (h === hits) { ctx.fillStyle = this.phase === 'done' ? 'rgba(212,175,90,0.35)' : 'rgba(212,175,90,0.15)'; ctx.fillRect(S.x + 6, y - lh / 2, S.w - 12, lh); }
        drawLabel(ctx, `${h} trouvé${h > 1 ? 's' : ''}`, S.x + 12 * ui, y, Math.min(12 * ui, lh * 0.6), PAL.text, 'left', 700);
        drawLabel(ctx, `×${m} = ${Math.floor(m * bet)}`, S.x + S.w - 12 * ui, y, Math.min(12 * ui, lh * 0.6), LUXE.champagne, 'right');
      });
      drawLabel(ctx, `Retour théorique ${(kenoRtp(k) * 100).toFixed(1).replace('.', ',')} %`, S.x + S.w / 2, S.y + S.h - 12 * ui, 10 * ui, PAL.textDim, 'center', 600);
    }
    if (this.message) drawPill(ctx, this.message, S.x + S.w / 2, S.y + S.h - 34 * ui, Math.min(12 * ui, S.w / 22), 'rgba(14,11,16,0.92)', PAL.text);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
