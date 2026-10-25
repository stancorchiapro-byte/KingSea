// Présence des autres joueurs (côté téléphone) : liste par étage, positions lissées par interpolation
// (affichées avec ~120 ms de retard pour rester fluides malgré le réseau), emotes, bulles de chat,
// envoi de sa propre position 10 fois par seconde au plus (uniquement quand elle change).
import type { Look } from '../art/characters';
import type { Connection } from './Net';
import { MOVE_HZ, unpackPose, type ChatScope, type NetAnim, type NetDir, type PublicPlayer, type ServerMsg } from './protocol';

export interface Remote {
  id: string; name: string; look: Look;
  x: number; y: number; dir: NetDir; anim: NetAnim;
  buf: Array<{ t: number; x: number; y: number; dir: NetDir; anim: NetAnim }>;
  emote: { e: string; t: number } | null;
  bubble: { text: string; t: number } | null;
  animT: number;
}

export interface ChatLine { id: string; name: string; text: string; at: number; mine: boolean; system?: boolean; scope: ChatScope }

export interface PresenceEvents {
  onCorrect(x: number, y: number): void;
  onCabin(id: string | null, wallColor: number): void;
  onNotice(msg: string): void;
  onKicked(msg: string): void;
  onDisconnected(): void;
  onReconnected(): void;
  onChat(line: ChatLine): void;
  onChatError(msg: string): void;
  onPlayers(list: Array<{ id: string; name: string; floor: string }>): void;
}

const INTERP_DELAY = 120;

export class Presence {
  remotes = new Map<string, Remote>();
  /** Numéro court (instantanés) → identifiant. */
  private byNum = new Map<number, string>();
  chat: ChatLine[] = [];
  blocked: Set<string>;
  private floor: string | null = null;
  private lastSent = { x: NaN, y: NaN, dir: '', anim: '', at: 0 };
  private sendAcc = 0;
  private off: () => void;

  constructor(private conn: Connection, readonly myId: string, private ev: PresenceEvents, private clock: () => number = () => performance.now()) {
    this.blocked = new Set(conn.profile?.blocked ?? []);
    this.off = conn.on((m) => this.onMessage(m));
    conn.onReconnected = () => { if (this.floor) this.join(this.floor, this.lastSent.x, this.lastSent.y); ev.onReconnected(); };
  }

  dispose(): void { this.off(); this.conn.onReconnected = null; }

  get online(): boolean { return this.conn.online; }
  get count(): number { return this.remotes.size; }

  join(floor: string, x: number, y: number): void {
    this.floor = floor;
    this.remotes.clear();
    this.lastSent = { x, y, dir: '', anim: '', at: 0 };
    this.conn.send({ t: 'join', floor, x, y });
  }

  private add(p: PublicPlayer): void {
    if (p.id === this.myId) return;
    const now = this.clock();
    this.byNum.set(p.n, p.id);
    this.remotes.set(p.id, { ...p, buf: [{ t: now, x: p.x, y: p.y, dir: p.dir, anim: p.anim }], emote: null, bubble: null, animT: Math.random() * 3 });
  }

  private onMessage(m: ServerMsg): void {
    const now = this.clock();
    switch (m.t) {
      case 'room': this.remotes.clear(); this.byNum.clear(); for (const p of m.players) this.add(p); break;
      case 'enter': this.add(m.p); break;
      case 'leave': this.remotes.delete(m.id); break;
      case 'snap':
        for (let i = 0; i + 3 < m.d.length; i += 4) {
          const id = this.byNum.get(m.d[i]);
          const r = id ? this.remotes.get(id) : undefined;
          if (!r) continue;
          const { dir, anim } = unpackPose(m.d[i + 3]);
          r.buf.push({ t: now, x: m.d[i + 1], y: m.d[i + 2], dir, anim });
          if (r.buf.length > 12) r.buf.shift();
        }
        break;
      case 'look': { const r = this.remotes.get(m.id); if (r) { r.look = m.look; r.name = m.name; } break; }
      case 'emote': { const r = this.remotes.get(m.id); if (r && !this.blocked.has(m.id)) r.emote = { e: m.e, t: m.e === 'dance' ? 4 : 2.2 }; break; }
      case 'chat': {
        if (this.blocked.has(m.id)) break;
        const scope = m.scope === 'global' ? 'global' : 'near';
        const line: ChatLine = { id: m.id, name: m.name, text: m.text, at: Date.now(), mine: m.id === this.myId, scope };
        this.chat.push(line); if (this.chat.length > 80) this.chat.shift();
        // Bulles au-dessus des personnages : seulement pour la conversation de proximité
        const r = scope === 'near' ? this.remotes.get(m.id) : undefined;
        if (r) r.bubble = { text: m.text, t: 5 };
        this.ev.onChat(line);
        break;
      }
      case 'chatLog':
        for (const l of m.lines) if (!this.blocked.has(l.id) && !this.chat.some((c) => c.scope === 'global' && c.at === l.at && c.id === l.id)) this.chat.push({ ...l, mine: l.id === this.myId, scope: 'global' });
        this.chat.sort((a, b) => a.at - b.at);
        break;
      case 'chatError': this.ev.onChatError(m.msg); break;
      case 'correct': this.lastSent.x = m.x; this.lastSent.y = m.y; this.ev.onCorrect(m.x, m.y); break;
      case 'cabin': this.ev.onCabin(m.id, m.wallColor); break;
      case 'players': this.ev.onPlayers(m.list); break;
      case 'kicked': this.ev.onKicked(m.msg); break;
      case 'notice': if (m.msg === '__disconnected__') { this.remotes.clear(); this.ev.onDisconnected(); } else this.ev.onNotice(m.msg); break;
    }
  }

  /** À chaque image : lissage des autres joueurs, envoi de sa position si elle a changé. */
  update(dt: number, me: { x: number; y: number; dir: NetDir; anim: NetAnim }): void {
    const now = this.clock(), at = now - INTERP_DELAY;
    for (const r of this.remotes.values()) {
      r.animT += dt;
      if (r.emote) { r.emote.t -= dt; if (r.emote.t <= 0) r.emote = null; }
      if (r.bubble) { r.bubble.t -= dt; if (r.bubble.t <= 0) r.bubble = null; }
      const b = r.buf;
      while (b.length >= 2 && b[1].t <= at) b.shift();
      if (b.length >= 2 && b[0].t <= at) {
        const k = Math.min(1, (at - b[0].t) / Math.max(1, b[1].t - b[0].t));
        r.x = b[0].x + (b[1].x - b[0].x) * k; r.y = b[0].y + (b[1].y - b[0].y) * k;
        r.dir = b[1].dir; r.anim = b[1].anim;
      } else if (b.length) { r.x = b[0].x; r.y = b[0].y; r.dir = b[0].dir; r.anim = b[0].anim; }
    }
    this.sendAcc += dt;
    const L = this.lastSent;
    const changed = Math.abs(me.x - L.x) > 0.5 || Math.abs(me.y - L.y) > 0.5 || me.dir !== L.dir || me.anim !== L.anim;
    if (this.floor && this.sendAcc >= 1 / MOVE_HZ && (changed || now - L.at > 3000)) {
      this.sendAcc = 0;
      this.lastSent = { x: me.x, y: me.y, dir: me.dir, anim: me.anim, at: now };
      this.conn.send({ t: 'move', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, dir: me.dir, anim: me.anim });
    }
  }

  emote(e: 'wave' | 'clap' | 'dance' | 'heart'): void { this.conn.send({ t: 'emote', e }); }
  say(text: string, scope: ChatScope = 'near'): void { this.conn.send({ t: 'chat', text, scope }); }
  requestPlayers(): void { this.conn.send({ t: 'players' }); }
  block(id: string, on: boolean): void { if (on) this.blocked.add(id); else this.blocked.delete(id); this.conn.send({ t: 'block', id, on }); }
  report(id: string, reason: string): void { this.conn.send({ t: 'report', id, reason }); }
  sendLook(look: Look): void { this.conn.send({ t: 'look', look }); }
  requestCabin(): void { this.conn.send({ t: 'cabin' }); }
  setCabinColor(color: number): void { this.conn.send({ t: 'cabinColor', color }); }
}
