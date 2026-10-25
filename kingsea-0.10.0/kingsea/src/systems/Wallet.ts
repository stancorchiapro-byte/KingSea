// Portefeuille de KSCoins : monnaie virtuelle SANS valeur réelle (aucun dépôt, aucun retrait).
// Toute opération porte un identifiant de transaction : rejouer la même opération n'a aucun effet
// (protection contre les doubles attributions). En multijoueur, ces règles seront exécutées côté serveur.

export type TxResult = { ok: true; balance: number } | { ok: false; reason: 'insufficient' | 'duplicate' | 'invalid'; balance: number };

export interface WalletState { balance: number; processedTx: string[] }

const MAX_TX_HISTORY = 200;

export class Wallet {
  private listeners: Array<(balance: number, delta: number) => void> = [];

  constructor(private state: WalletState, private onChange: () => void = () => {}) {}

  get balance(): number { return this.state.balance; }

  subscribe(fn: (balance: number, delta: number) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  canAfford(amount: number): boolean { return Number.isInteger(amount) && amount >= 0 && this.state.balance >= amount; }

  earn(amount: number, txId: string): TxResult { return this.apply(amount, txId); }

  spend(amount: number, txId: string): TxResult {
    if (!Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'invalid', balance: this.balance };
    if (this.state.balance < amount) return { ok: false, reason: 'insufficient', balance: this.balance };
    return this.apply(-amount, txId);
  }

  /** Aligne le solde affiché sur celui de l'autorité (serveur en ligne, ou autorité locale qui a écrit directement). */
  syncFrom(balance: number): void {
    if (!Number.isInteger(balance) || balance < 0) return;
    const delta = balance - this.state.balance;
    this.state.balance = balance;
    if (delta !== 0) { this.onChange(); for (const l of this.listeners) l(balance, delta); }
  }

  hasProcessed(txId: string): boolean { return this.state.processedTx.includes(txId); }

  private apply(delta: number, txId: string): TxResult {
    if (!Number.isInteger(delta) || !txId) return { ok: false, reason: 'invalid', balance: this.balance };
    if (this.state.processedTx.includes(txId)) return { ok: false, reason: 'duplicate', balance: this.balance };
    const next = this.state.balance + delta;
    if (next < 0) return { ok: false, reason: 'insufficient', balance: this.balance };
    this.state.balance = next;
    this.state.processedTx.push(txId);
    if (this.state.processedTx.length > MAX_TX_HISTORY) this.state.processedTx.splice(0, this.state.processedTx.length - MAX_TX_HISTORY);
    this.onChange();
    for (const l of this.listeners) l(next, delta);
    return { ok: true, balance: next };
  }
}

/** Identifiant de transaction unique pour un achat ponctuel. */
export function uniqueTx(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}
