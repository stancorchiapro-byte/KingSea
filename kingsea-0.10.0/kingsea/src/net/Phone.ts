// Téléphone KS (côté joueur) : état synchronisé avec le serveur — conversations privées (persistées en base),
// non-lus, contacts (surnom, favori), amis et statut en ligne, cadeaux (capacité restante, historique),
// coups de sonnette et visiteurs de cabine. Rien n'est inventé localement : tout vient des messages du serveur.
import type { AuthReply } from '../authority/types';
import { newRequestId } from './Backend';
import type { Connection } from './Net';
import type { ContactEntry, DmConversation, DmMessage, FriendsData, GiftAllowanceInfo, GiftPayload, ServerMsg, TransferEntry } from './protocol';

export interface PhoneEvents {
  /** Notification à afficher (nouveau message, cadeau reçu, réponse de visite…). */
  notify(text: string, kind: 'info' | 'success' | 'error' | 'reward'): void;
  /** Quelqu'un sonne à la porte de ma cabine. */
  ring(from: string, name: string): void;
  /** Visite acceptée : entrer dans la cabine de `owner`. */
  visitAccepted(owner: string, name: string): void;
  /** Réponse de l'autorité à appliquer (cadeau envoyé ou reçu : soldes, inventaire). */
  reply(r: AuthReply): void;
}

export class PhoneState {
  convs: DmConversation[] = [];
  unread = 0;
  contacts: ContactEntry[] = [];
  friends: FriendsData | null = null;
  history = new Map<string, DmMessage[]>();
  more = new Map<string, boolean>();
  allowance: GiftAllowanceInfo | null = null;
  allowanceAt = 0;
  transfers: TransferEntry[] = [];
  visitors: Array<{ id: string; name: string }> = [];
  doorOpen = true;
  /** Conversation ouverte à l'écran (les messages reçus y sont marqués lus). */
  open: string | null = null;
  /** Écouteurs de l'interface (rafraîchir l'écran du téléphone). */
  readonly changed = new Set<() => void>();
  private giftWait = new Map<string, (m: Extract<ServerMsg, { t: 'giftResult' }>) => void>();
  private pendingDm = new Map<string, (ok: boolean, msg?: string) => void>();
  private off: () => void;

  constructor(private conn: Connection, private ev: PhoneEvents, private clock: () => number = () => Date.now()) {
    this.contacts = conn.profile?.contacts ?? [];
    this.off = conn.on((m) => this.onMsg(m));
    this.refresh();
  }

  dispose(): void { this.off(); this.changed.clear(); }
  get online(): boolean { return this.conn.online; }
  get me(): string { return this.conn.profile?.id ?? ''; }

  refresh(): void { this.conn.send({ t: 'dmList' }); this.conn.send({ t: 'friends' }); this.conn.send({ t: 'giftInfo' }); }

  private emit(): void { for (const f of this.changed) { try { f(); } catch (e) { console.error(e); } } }

  /** Nom affiché d'un joueur : surnom de contact, sinon pseudo. */
  nameOf(id: string): string {
    const c = this.contacts.find((x) => x.id === id);
    if (c?.nick) return c.nick;
    return this.friends?.friends.find((f) => f.id === id)?.name ?? this.convs.find((x) => x.with === id)?.name ?? 'Passager';
  }

  private onMsg(m: ServerMsg): void {
    switch (m.t) {
      case 'dmList': this.convs = m.convs; this.unread = m.unread; this.emit(); break;
      case 'dmHistory': {
        const prev = m.msgs.length && this.history.has(m.with) && (this.history.get(m.with)![0]?.id ?? 0) > m.msgs[m.msgs.length - 1].id ? this.history.get(m.with)! : [];
        this.history.set(m.with, [...m.msgs, ...prev]); this.more.set(m.with, m.more); this.emit(); break;
      }
      case 'dm': {
        const other = m.msg.from === this.me ? m.msg.to : m.msg.from;
        const h = this.history.get(other);
        if (h && !h.some((x) => x.id === m.msg.id)) h.push(m.msg);
        if (m.nonce) { this.pendingDm.get(m.nonce)?.(true); this.pendingDm.delete(m.nonce); }
        if (m.msg.from !== this.me) {
          if (this.open === other) this.conn.send({ t: 'dmRead', with: other });
          else this.ev.notify(`Message de ${this.nameOf(other) || m.name} : ${m.msg.text.slice(0, 60)}`, 'info');
        }
        this.conn.send({ t: 'dmList' });
        this.emit();
        break;
      }
      case 'dmError':
        if (m.nonce && this.pendingDm.has(m.nonce)) { this.pendingDm.get(m.nonce)!(false, m.msg); this.pendingDm.delete(m.nonce); }
        else this.ev.notify(m.msg, 'error');
        break;
      case 'contacts': this.contacts = m.list; this.emit(); break;
      case 'friends': this.friends = m.data; this.emit(); break;
      case 'giftResult': {
        this.allowance = m.allowance; this.allowanceAt = this.clock();
        if (m.reply) this.ev.reply(m.reply);
        const w = this.giftWait.get(m.tx); this.giftWait.delete(m.tx);
        w?.(m);
        if (m.ok) this.conn.send({ t: 'giftInfo' });
        this.emit();
        break;
      }
      case 'giftIn':
        this.ev.reply(m.reply);
        this.ev.notify(`Cadeau : ${m.name} t’offre ${m.label} !`, 'reward');
        this.conn.send({ t: 'giftInfo' });
        break;
      case 'giftInfo': this.allowance = m.allowance; this.allowanceAt = this.clock(); this.transfers = m.history; this.emit(); break;
      case 'visitRing': this.ev.ring(m.from, m.name); break;
      case 'visitReply':
        if (m.ok && m.owner) this.ev.visitAccepted(m.owner, this.nameOf(m.owner));
        else this.ev.notify(m.msg, m.ok ? 'info' : 'error');
        break;
      case 'visitors': this.visitors = m.list; this.doorOpen = m.open; this.emit(); break;
    }
  }

  // ---------------------------------------------------------------- actions
  openConversation(id: string): void {
    this.open = id;
    if (!this.history.has(id)) this.conn.send({ t: 'dmHistory', with: id });
    this.conn.send({ t: 'dmRead', with: id });
  }
  loadOlder(id: string): void { const h = this.history.get(id); if (h?.length) this.conn.send({ t: 'dmHistory', with: id, before: h[0].id }); }
  closeConversation(): void { this.open = null; }

  /** Envoie un message ; la promesse se résout quand le serveur l'a accepté (ou refusé, avec la raison). */
  send(to: string, text: string): Promise<{ ok: boolean; msg?: string }> {
    const nonce = newRequestId();
    return new Promise((res) => {
      const t = setTimeout(() => { this.pendingDm.delete(nonce); res({ ok: false, msg: 'Le serveur ne répond pas' }); }, 8000);
      this.pendingDm.set(nonce, (ok, msg) => { clearTimeout(t); res({ ok, msg }); });
      if (!this.online) { this.pendingDm.delete(nonce); clearTimeout(t); res({ ok: false, msg: 'Hors connexion' }); return; }
      this.conn.send({ t: 'dmSend', to, text, nonce });
    });
  }
  deleteConversation(id: string): void { this.history.delete(id); this.conn.send({ t: 'dmDelete', with: id }); }
  setContact(id: string, patch: { nick?: string | null; fav?: boolean }): void { this.conn.send({ t: 'contact', id, ...patch }); }

  /** Cadeau à un ami (identifiant de transaction unique : un double appui ne donne jamais deux fois). */
  gift(to: string, gift: GiftPayload): Promise<Extract<ServerMsg, { t: 'giftResult' }>> {
    const tx = newRequestId();
    return new Promise((res) => {
      const t = setTimeout(() => { this.giftWait.delete(tx); res({ t: 'giftResult', ok: false, msg: 'Le serveur ne répond pas : vérifie ton solde avant de réessayer', tx, allowance: this.allowance ?? { coinsLeft: 0, itemsLeft: 0, coinsIn: null, itemsIn: null } }); }, 10_000);
      this.giftWait.set(tx, (m) => { clearTimeout(t); res(m); });
      this.conn.send({ t: 'gift', to, gift, tx });
    });
  }

  /** Temps restant (ms) avant que la capacité de don se libère, corrigé du temps écoulé depuis la réponse. */
  freesIn(kind: 'coins' | 'items'): number | null {
    const a = this.allowance;
    const v = kind === 'coins' ? a?.coinsIn : a?.itemsIn;
    return v === null || v === undefined ? null : Math.max(0, v - (this.clock() - this.allowanceAt));
  }

  ring(to: string): void { this.conn.send({ t: 'visitAsk', to }); }
  answerRing(from: string, accept: boolean): void { this.conn.send({ t: 'visitAnswer', from, accept }); }
  kick(id: string): void { this.conn.send({ t: 'visitKick', id }); }
  setDoor(open: boolean): void { this.conn.send({ t: 'door', open }); }
}

/** « dans 3 h 20 min » (durée, jamais d'heure d'horloge). */
export function durationText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} h${m ? ` ${m} min` : ''}`;
}
