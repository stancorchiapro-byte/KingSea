// Tables multijoueurs du casino, côté téléphone : rejoindre une instance (5 places), suivre son état diffusé par
// le serveur (places, phase, compte à rebours, mises des autres, tirage commun), miser et agir.
// Le téléphone n'envoie que des intentions : chaque mise est acceptée ou refusée par le serveur, et le résultat
// de la manche (avec le solde réel) arrive par « tableRound ». Rien n'est simulé localement.
import type { AuthReply } from '../authority/types';
import type { Connection } from './Net';
import type { ServerMsg, TablePlayerResult, TableState, TableSummary } from './protocol';

export interface TableFeedLine { text: string; net: number; t: number }

export class TableClient {
  state: TableState | null = null;
  list: TableSummary[] = [];
  friendsAt: Array<{ id: string; name: string; table: string; game: string }> = [];
  feed: TableFeedLine[] = [];
  error: string | null = null;
  /** Reçu à la mise à jour de l'état (en ms de l'horloge locale) : sert au compte à rebours affiché. */
  private stateAt = 0;
  private off: () => void;
  private roundWaiters: Array<{ stake: number; res: (r: AuthReply) => void; timer: ReturnType<typeof setTimeout> }> = [];
  /** Résultat de manche reçu (y compris pour un spectateur) : animation commune côté jeu. */
  onRound: ((m: Extract<ServerMsg, { t: 'tableRound' }>) => void) | null = null;
  onState: ((s: TableState) => void) | null = null;
  onAutoReply: ((r: AuthReply) => void) | null = null;

  constructor(private conn: Connection, readonly game: string, readonly tier: string | null = null, private clock: () => number = () => performance.now()) {
    this.off = conn.on((m) => this.onMsg(m));
    this.join();
  }

  get myId(): string { return this.conn.profile?.id ?? ''; }
  get online(): boolean { return this.conn.online; }

  join(opts: { instance?: string; friend?: string } = {}): void {
    this.conn.send({ t: 'tableJoin', game: this.game, tier: this.tier ?? undefined, ...opts });
  }
  refreshList(): void { this.conn.send({ t: 'tableList', game: this.game, tier: this.tier ?? undefined }); }

  dispose(): void {
    this.off();
    this.conn.send({ t: 'tableLeave' });
    for (const w of this.roundWaiters) { clearTimeout(w.timer); w.res({ ok: false, error: 'Table quittée', balance: this.conn.profile?.wallet.balance ?? 0 }); }
    this.roundWaiters = [];
  }

  /** Millisecondes avant l'échéance de la phase en cours (fenêtre de mises, tour de parole…). */
  get endsIn(): number { return this.state ? Math.max(0, this.state.endsIn - (this.clock() - this.stateAt)) : 0; }

  /** Joueurs assis (soi compris). */
  get seats() { return this.state?.seats ?? []; }

  private onMsg(m: ServerMsg): void {
    switch (m.t) {
      // Reconnexion (nouvelle session sur le serveur) : on reprend une place à la même table si elle existe encore
      case 'auth': this.state ? this.join({ instance: this.state.id }) : this.join(); break;
      case 'tableError':
        // Table disparue pendant la coupure : une autre table du même jeu
        if (this.state && /n’existe plus/.test(m.msg)) { this.state = null; this.join(); return; }
        this.error = m.msg; break;
      case 'table':
        if (m.state.game !== this.game) return;
        this.state = m.state; this.stateAt = this.clock(); this.error = null;
        this.onState?.(m.state);
        break;
      case 'tableList':
        if (m.game !== this.game) return;
        this.list = m.tables; this.friendsAt = m.friends;
        break;
      case 'tableEvent':
        if (!this.state || m.table !== this.state.id) return;
        this.push(`${m.name} · ${m.label || 'partie'}`, m.net);
        break;
      case 'tableRound': {
        if (!this.state || m.table !== this.state.id) return;
        for (const p of m.players) if (p.id !== this.myId && p.stake > 0) this.push(p.name, p.payout - p.stake);
        // Résultat de sa propre mise : renvoyé au jeu qui l'attendait (mise d'origine rétablie pour l'affichage)
        if (m.you) {
          const w = this.roundWaiters.shift();
          if (w) { clearTimeout(w.timer); w.res(m.you.ok ? { ...m.you, stake: w.stake } : m.you); }
          else this.onAutoReply?.(m.you);
        }
        this.onRound?.(m);
        break;
      }
    }
  }

  private push(text: string, net: number): void {
    this.feed.push({ text, net, t: 6 });
    if (this.feed.length > 6) this.feed.shift();
  }

  update(dt: number): void { for (const f of this.feed) f.t -= dt; this.feed = this.feed.filter((f) => f.t > 0); }

  /** Mise à la manche partagée ; la promesse se résout avec le résultat (après le tirage commun). */
  async round(bet: unknown, stake: number, onAccepted?: (r: AuthReply) => void): Promise<AuthReply> {
    const r = await this.conn.table('tableBet', bet);
    if (!r.ok) return r;
    onAccepted?.(r);
    return new Promise((res) => {
      const timer = setTimeout(() => {
        this.roundWaiters = this.roundWaiters.filter((w) => w.res !== res);
        res({ ok: false, error: 'Résultat de la manche non reçu : ton solde sera réaligné par le serveur', balance: this.conn.profile?.wallet.balance ?? 0 });
      }, 90_000);
      this.roundWaiters.push({ stake, res, timer });
    });
  }

  /** Mise simple (blackjack, Crash) : réponse d'acceptation seulement. */
  bet(bet: unknown): Promise<AuthReply> { return this.conn.table('tableBet', bet); }
  act(act: unknown): Promise<AuthReply> { return this.conn.table('tableAct', act); }

  /** Résultat d'un autre joueur, pour l'affichage. */
  static net(p: TablePlayerResult): number { return p.payout - p.stake; }
}
