// Baccarat Punto Banco : mise sur le Joueur, la Banque ou l'Égalité, puis distribution selon le tableau officiel.
import { roundRect } from '../art/canvas';
import { PAL } from '../art/palette';
import type { PointerHandler, PointerInfo } from '../engine/Input';
import { ButtonLayer, makeButton, type Button } from '../ui/UIKit';
import { bacTotal, type BacBet, type BacRound } from './logic/baccarat';
import type { Card } from './logic/cards';
import type { MiniGame, MiniGameHost } from './MiniGame';
import { drawCard, drawLabel, drawPill } from './widgets';
import { BetControl, ChipFlights, Dealer, drawTable, feltText, type Rect } from './casinoKit';
import { drawChipStack, LUXE } from '../art/brand';

const ZONES: Array<{ bet: BacBet; label: string; pays: string; color: string }> = [
  { bet: 'player', label: 'JOUEUR', pays: 'paie 1:1', color: '#2a5ea8' },
  { bet: 'tie', label: 'ÉGALITÉ', pays: 'paie 8:1', color: '#167a55' },
  { bet: 'banker', label: 'BANQUE', pays: '1:1 − 5 %', color: '#8e2236' },
];
const CARD_TIME = 0.34;

export class BaccaratGame implements MiniGame {
  readonly id = 'baccarat';
  readonly title = 'Baccarat';
  readonly bg: [string, string] = ['#1a0c10', '#060304'];
  readonly currency = 'chips' as const;
  readonly rules =
    'Punto Banco. Mise sur la main qui aura le total le plus proche de 9 : Joueur, Banque, ou Égalité.\n' +
    '• Les figures et les 10 valent 0, l’As vaut 1 ; on ne garde que le chiffre des unités.\n' +
    '• Une troisième carte est tirée automatiquement selon le tableau officiel.\n' +
    '• Banque gagnante : 1:1 moins 5 % de commission. Égalité : 8:1 (les mises Joueur et Banque sont rendues). Sabot de 8 jeux.';

  private host!: MiniGameHost;
  private layer = new ButtonLayer(6);
  private betCtl!: BetControl;
  private bets: Partial<Record<BacBet, number>> = {};
  private round: BacRound | null = null;
  private settled = { stake: 0, payout: 0 };
  private waiting = false;
  private shown = 0;
  private revealT = 0;
  private phase: 'bet' | 'reveal' | 'done' = 'bet';
  private message = 'Pose tes jetons sur une zone, puis « Distribuer ».';
  private zones: Array<{ bet: BacBet; x: number; y: number; w: number; h: number }> = [];
  private dealBtn!: Button;
  private clearBtn!: Button;
  private zoneHandler: PointerHandler = { onDown: (p) => this.tapZone(p) };
  private cardArea = { x: 0, y: 0, w: 0, h: 0 };
  private history: BacBet[] = [];
  private dealer = new Dealer('Croupière · Margaux', { skin: '#f1c7a1', hair: '#3b2516', hairStyle: 'carre', outfit: 'croupier', color: '#0f1d2e', accent: '#d4af5a', hat: 'aucun', glasses: false });
  private dealerPos = { x: 0, y: 0, k: 2 };
  private table: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private felt: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private flights = new ChipFlights();
  /** Mises de la manche jouée (affichées jusqu'au paiement / ramassage). */
  private onTable: Partial<Record<BacBet, number>> = {};
  private born: number[] = [];
  private t = 0;

  get holdBalance(): boolean { return this.phase === 'reveal' || this.waiting || this.flights.busy; }

  init(host: MiniGameHost): void {
    this.host = host;
    this.layer.onTapSound = () => host.s.audio.tap();
    this.betCtl = new BetControl(host, { presets: [1, 5, 25, 100], min: 1, initial: 5, mode: 'chip', onDouble: () => this.doubleBets() });
    this.dealBtn = makeButton({ id: 'deal', label: 'Distribuer', style: 'gold', fontSize: 17, onTap: () => this.deal() });
    this.clearBtn = makeButton({ id: 'clear', label: 'Effacer', style: 'secondary', fontSize: 15, onTap: () => { if (this.phase !== 'reveal') this.bets = {}; } });
    this.rebetBtn = makeButton({ id: 'rebet', label: 'Rejouer', style: 'secondary', fontSize: 15, onTap: () => { if (this.phase !== 'reveal' && this.staked === 0 && this.lastStake > 0 && this.lastStake <= host.s.chips.balance) { this.bets = { ...this.lastBets }; host.s.audio.chip(); } } });
    this.layer.buttons = [...this.betCtl.buttons, this.clearBtn, this.rebetBtn, this.dealBtn];
  }

  private rebetBtn!: Button;
  private lastBets: Partial<Record<BacBet, number>> = {};
  private get lastStake(): number { return Object.values(this.lastBets).reduce((a, b) => a + (b ?? 0), 0); }

  /** ×2 : double toutes les mises posées (si le solde le permet). */
  private doubleBets(): void {
    if (this.staked <= 0) return;
    if (this.staked * 2 > this.host.s.chips.balance) { this.host.toasts.show('Pas assez de jetons pour doubler', 'error'); return; }
    for (const k of Object.keys(this.bets) as Array<keyof typeof this.bets>) this.bets[k] = (this.bets[k] ?? 0) * 2;
    this.host.s.audio.chip();
  }

  private get staked(): number { return (this.bets.player ?? 0) + (this.bets.banker ?? 0) + (this.bets.tie ?? 0); }

  layout(): void {
    const a = this.host.area, ui = this.host.vp.ui, ctrlH = this.betCtl.layout(a, ui, [[this.clearBtn, 96], [this.rebetBtn, 100], [this.dealBtn, 150]]);
    const tableH = a.h - ctrlH - 8 * ui;
    const portrait = a.h > a.w;
    const k = portrait ? Math.max(1.5, Math.min(2.4, tableH / 170)) : Math.max(1.05, Math.min(1.8, tableH / 170));
    this.dealerPos = { x: a.x + a.w / 2, y: a.y + 38 * k, k };
    this.table = { x: a.x + a.w * 0.02, y: this.dealerPos.y - 4 * ui, w: a.w * 0.96, h: a.y + tableH - (this.dealerPos.y - 4 * ui) };
    const rail = 14 * ui, F = { x: this.table.x + rail, y: this.table.y + rail, w: this.table.w - rail * 2, h: this.table.h - rail * 2 };
    this.felt = F;
    const zh = Math.min(F.h * 0.38, 110 * ui), zy = F.y + F.h - zh - 8 * ui, zw = (F.w - 40 * ui) / 3;
    this.cardArea = { x: F.x, y: F.y, w: F.w, h: zy - F.y - 4 * ui };
    this.zones = ZONES.map((z, i) => ({ bet: z.bet, x: F.x + 10 * ui + i * (zw + 10 * ui), y: zy, w: zw, h: zh }));
  }

  handlers(): PointerHandler[] { return [this.zoneHandler, this.layer]; }
  canQuit() { return this.phase === 'reveal' || this.waiting ? { ok: false as const, reason: 'Attends la fin du coup' } : { ok: true as const }; }

  private tapZone(p: PointerInfo): boolean {
    const z = this.zones.find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
    if (!z) return false;
    if (this.phase === 'reveal') return true;
    if (this.phase === 'done') { this.phase = 'bet'; this.round = null; this.onTable = {}; }
    if (this.staked + this.betCtl.amount > this.host.s.chips.balance) { this.host.toasts.show('Mises supérieures à ton solde', 'error'); return true; }
    this.bets[z.bet] = (this.bets[z.bet] ?? 0) + this.betCtl.amount;
    this.host.s.audio.chip();
    return true;
  }

  private async deal(): Promise<void> {
    const s = this.host.s, total = this.staked;
    if (this.phase === 'reveal' || this.waiting || total <= 0) return;
    // Coup distribué par l'autorité (sabot de 8 jeux) avant l'affichage
    this.waiting = true;
    this.lastBets = { ...this.bets };
    const r = await s.ask('casino', 'baccarat', 'play', { bets: { ...this.bets } });
    this.waiting = false;
    if (!r.ok) { this.host.toasts.show(r.error, 'error'); s.audio.error(); return; }
    const round = r.view as unknown as BacRound;
    this.settled = { stake: r.stake, payout: r.payout }; this.round = round; this.shown = 0; this.revealT = 0; this.phase = 'reveal'; this.message = '';
    this.onTable = { ...this.bets }; this.bets = {}; this.born = [];
    this.dealer.play('deal', CARD_TIME * 6);
  }

  private finish(): void {
    const s = this.host.s, r = this.round!;
    const ret = this.settled.payout, net = ret - this.settled.stake;
    this.history.unshift(r.winner); this.history = this.history.slice(0, 14);
    const w = { player: 'Joueur', banker: 'Banque', tie: 'Égalité' }[r.winner];
    this.message = `${w} gagne (${bacTotal(r.player)} à ${bacTotal(r.banker)}) · ${net > 0 ? `+${net}` : net === 0 ? 'mise rendue' : `${net}`} jetons`;
    if (net > 0) s.audio.win(); else if (net < 0) s.audio.lose();
    // Le croupier paie les zones gagnantes et ramasse les autres (égalité : Joueur et Banque rendus)
    const ui = this.host.vp.ui, d = this.dealer.hand(this.dealerPos.x, this.dealerPos.y, this.dealerPos.k);
    for (const z of this.zones) {
      const amt = this.onTable[z.bet] ?? 0;
      if (!amt) continue;
      const c = { x: z.x + z.w / 2, y: z.y + z.h * 0.66 };
      const wins = r.winner === z.bet, refunded = r.winner === 'tie' && z.bet !== 'tie';
      if (wins) this.flights.add(d, c, z.bet === 'tie' ? amt * 8 : z.bet === 'banker' ? Math.floor(amt * 0.95) : amt, 12 * ui, 0.45);
      else if (!refunded) this.flights.add(c, d, amt, 12 * ui, 0.45, 0, () => { this.onTable[z.bet] = 0; });
    }
    this.dealer.play(net > 0 ? 'congrats' : net < 0 ? 'collect' : 'pay', 1.4);
    this.phase = 'done';
  }

  /** Ordre réel de distribution : J, B, J, B, puis 3e carte Joueur, 3e carte Banque. */
  private dealOrder(): Array<{ side: 'player' | 'banker'; i: number }> {
    const r = this.round!, o: Array<{ side: 'player' | 'banker'; i: number }> = [{ side: 'player', i: 0 }, { side: 'banker', i: 0 }, { side: 'player', i: 1 }, { side: 'banker', i: 1 }];
    if (r.player[2]) o.push({ side: 'player', i: 2 });
    if (r.banker[2]) o.push({ side: 'banker', i: 2 });
    return o;
  }

  update(dt: number): void {
    const s = this.host.s;
    this.t += dt;
    this.dealer.update(dt);
    this.flights.update(dt);
    if (this.phase === 'reveal') {
      this.revealT += dt;
      const n = this.dealOrder().length;
      if (this.revealT > 0.45 && this.shown < n) { this.shown++; this.revealT = 0; this.born[this.shown - 1] = this.t; s.audio.card(); this.dealer.play('deal', 0.4); }
      if (this.shown >= n && this.revealT > 0.6) this.finish();
    }
    this.betCtl.locked = this.phase === 'reveal';
    this.betCtl.engaged = this.staked;
    this.betCtl.sync();
    this.dealBtn.enabled = this.phase !== 'reveal' && !this.waiting && this.staked > 0;
    this.dealBtn.label = this.staked > 0 ? `Distribuer · ${this.staked}` : 'Distribuer';
    this.clearBtn.enabled = this.phase !== 'reveal' && this.staked > 0;
    this.rebetBtn.enabled = this.phase !== 'reveal' && this.staked === 0 && this.lastStake > 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const ui = this.host.vp.ui, A = this.cardArea, D = this.dealerPos;
    this.dealer.render(ctx, D.x, D.y, D.k, ui);
    drawTable(ctx, this.table, ui, 'green');
    const cw = Math.min(A.h * 0.42, 64 * ui), ch = cw * 1.4;
    const from = this.dealer.hand(D.x, D.y, D.k);
    const sides: Array<{ side: 'player' | 'banker'; label: string; cx: number }> = [
      { side: 'player', label: 'JOUEUR', cx: A.x + A.w * 0.27 }, { side: 'banker', label: 'BANQUE', cx: A.x + A.w * 0.73 },
    ];
    feltText(ctx, 'Punto Banco · Égalité paie 8 pour 1', A.x + A.w / 2, A.y + A.h - 10 * ui, 9 * ui, 0.5);
    for (const sd of sides) {
      drawLabel(ctx, sd.label, sd.cx, A.y + 12 * ui, 13 * ui, sd.side === 'player' ? '#9fc3ff' : '#ffb0a0');
      if (!this.round) continue;
      const cards: Card[] = this.round[sd.side];
      const all = this.dealOrder().slice(0, this.shown);
      all.forEach((o, n) => {
        if (o.side !== sd.side) return;
        const k = Math.min(1, Math.max(0, (this.t - (this.born[n] ?? 0)) / CARD_TIME)), e = 1 - (1 - k) * (1 - k);
        const flip = Math.min(1, Math.max(0, (this.t - (this.born[n] ?? 0) - CARD_TIME * 0.7) / 0.22));
        const tx = sd.cx - (cw * 1.5 + 8 * ui) + o.i * (cw + 8 * ui), ty = A.y + 26 * ui;
        const x = from.x + (tx - from.x) * e, y = from.y + (ty - from.y) * e - Math.sin(k * Math.PI) * 16;
        if (o.i === 2) { ctx.save(); ctx.translate(x + cw / 2, y + ch / 2); ctx.rotate((Math.PI / 2) * e); drawCard(ctx, cards[2], -cw / 2, -ch / 2, cw, ch, flip); ctx.restore(); }
        else drawCard(ctx, cards[o.i], x, y, cw, ch, flip);
      });
      const vis = all.filter((o) => o.side === sd.side).map((o) => cards[o.i]);
      if (vis.length) drawPill(ctx, `${bacTotal(vis)}`, sd.cx, A.y + 34 * ui + ch + 12 * ui, 15 * ui, 'rgba(0,0,0,0.55)', LUXE.ivory);
    }
    // Zones de mise imprimées sur le tapis
    this.zones.forEach((z, i) => {
      const Z = ZONES[i], win = this.phase === 'done' && this.round?.winner === z.bet;
      roundRect(ctx, z.x, z.y, z.w, z.h, 12 * ui);
      ctx.fillStyle = Z.color; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = win ? LUXE.champagne : 'rgba(239,220,174,0.45)'; ctx.lineWidth = win ? 3 : 1.2; ctx.stroke();
      drawLabel(ctx, Z.label, z.x + z.w / 2, z.y + 15 * ui, 13 * ui, LUXE.ivory);
      drawLabel(ctx, Z.pays, z.x + z.w / 2, z.y + 31 * ui, 10 * ui, 'rgba(239,220,174,0.8)', 'center', 600);
      const amt = this.phase === 'bet' ? this.bets[z.bet] : this.onTable[z.bet];
      if (amt) {
        drawChipStack(ctx, z.x + z.w / 2, z.y + z.h * 0.8, Math.min(z.h * 0.2, 16 * ui), amt, 8);
        drawLabel(ctx, `${amt}`, z.x + z.w - 14 * ui, z.y + z.h - 10 * ui, 11 * ui, LUXE.champagne, 'right');
      }
    });
    this.flights.render(ctx);
    // Historique (pastilles de couleur)
    const F = this.felt;
    this.history.forEach((h, i) => {
      ctx.fillStyle = h === 'player' ? '#2a5ea8' : h === 'banker' ? '#8e2236' : '#167a55';
      ctx.beginPath(); ctx.arc(F.x + F.w - 14 * ui - i * 15 * ui, F.y + 12 * ui, 5.5 * ui, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(239,220,174,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    });
    if (this.message) drawPill(ctx, this.message, A.x + A.w / 2, A.y + A.h * 0.84, 13 * ui, 'rgba(14,11,16,0.9)', PAL.text);
    this.betCtl.render(ctx, ui);
    this.layer.render(ctx, ui);
  }
}
