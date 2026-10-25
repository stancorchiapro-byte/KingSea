// Modération du chat : anti-spam (cadence, rafales, répétitions), mise en sourdine temporaire,
// masquage des insultes et des liens. Logique pure, testée.

export const CHAT_MAX_LEN = 140;
const MIN_INTERVAL = 800;        // ms entre deux messages
const BURST = 5, BURST_WINDOW = 10_000;
const REPEAT_WINDOW = 30_000;
const STRIKES_TO_MUTE = 3, STRIKE_WINDOW = 30_000, MUTE_MS = 60_000;

// Liste volontairement courte (insultes courantes) ; en production : liste maintenue + signalements.
const BAD = ['connard', 'connasse', 'salope', 'pute', 'putain', 'encule', 'enculé', 'batard', 'bâtard', 'fdp', 'ntm', 'nique', 'pd', 'tg', 'merde', 'abruti', 'débile', 'debile', 'idiot', 'con'];
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const BAD_SET = new Set(BAD.map(strip));

/** Nettoie un message : espaces, caractères de contrôle, répétitions, liens, insultes. */
export function cleanMessage(raw: string): string {
  let s = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/(.)\1{4,}/gu, '$1$1$1');                                  // « coooooool » → « cooool »
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+|\b\S+\.(?:com|fr|net|org|io|gg|xyz|ru)\b\S*/giu, '[lien masqué]');
  s = s.replace(/[\p{L}\p{N}']+/gu, (w) => (BAD_SET.has(strip(w)) ? '*'.repeat(Math.min(6, w.length)) : w));
  return s.slice(0, CHAT_MAX_LEN);
}

export class ChatLimiter {
  private times: number[] = [];
  private recent: Array<{ text: string; at: number }> = [];
  private strikes: number[] = [];
  mutedUntil = 0;

  /** Vérifie et nettoie un message. */
  check(raw: unknown, now: number): { ok: true; text: string } | { ok: false; reason: string } {
    if (now < this.mutedUntil) return { ok: false, reason: `Tu es en sourdine encore ${Math.ceil((this.mutedUntil - now) / 1000)} s (anti-spam).` };
    if (typeof raw !== 'string') return { ok: false, reason: 'Message invalide' };
    const text = cleanMessage(raw);
    if (!text) return { ok: false, reason: 'Message vide' };
    const fail = (reason: string) => {
      this.strikes = this.strikes.filter((t) => now - t < STRIKE_WINDOW); this.strikes.push(now);
      if (this.strikes.length >= STRIKES_TO_MUTE) { this.mutedUntil = now + MUTE_MS; this.strikes = []; return { ok: false as const, reason: 'Trop de messages : sourdine 60 s.' }; }
      return { ok: false as const, reason };
    };
    const last = this.times[this.times.length - 1];
    if (last !== undefined && now - last < MIN_INTERVAL) return fail('Doucement : attends un instant entre deux messages.');
    this.times = this.times.filter((t) => now - t < BURST_WINDOW);
    if (this.times.length >= BURST) return fail('Trop de messages d’affilée.');
    this.recent = this.recent.filter((r) => now - r.at < REPEAT_WINDOW);
    if (this.recent.some((r) => strip(r.text) === strip(text))) return fail('Message déjà envoyé.');
    this.times.push(now); this.recent.push({ text, at: now });
    return { ok: true, text };
  }
}

/** Limiteur simple (connexions, signalements) : n actions par fenêtre glissante. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private n: number, private windowMs: number) {}
  allow(key: string, now: number): boolean {
    const h = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (h.length >= this.n) { this.hits.set(key, h); return false; }
    h.push(now); this.hits.set(key, h);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.length || now - v[v.length - 1] > this.windowMs) this.hits.delete(k);
    return true;
  }
}
