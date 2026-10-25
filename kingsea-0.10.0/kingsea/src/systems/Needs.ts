// Faim et soif côté interface : mesure le temps d'exploration, envoie un relevé à l'autorité toutes les 20 s,
// prévient le joueur quand une jauge franchit un seuil (50, 25, 10 — réglables dans authority/economy.ts › NEEDS)
// et pilote le coma (compte à rebours de 15 s, réveil demandé à l'autorité, retour au hall).
// Les jauges ne baissent QUE pendant l'exploration du navire : ni pendant les jeux, ni dans les menus, ni pendant
// les chargements, ni application en arrière-plan (le moteur s'arrête), ni entre deux sessions.
import { NEEDS } from '../authority/economy';
import type { EcoSnapshot } from '../authority/types';
import type { Services } from './Services';

export const TICK_EVERY = 20;
/** Marge de réarmement : une alerte se redéclenche seulement après être remonté de 5 points au-dessus du seuil. */
const REARM = 5;

export type NeedAlert = { level: 1 | 2 | 3; text: string };

/** Niveau d'alerte d'une jauge (0 : normal, 1 : ≤ 50, 2 : ≤ 25, 3 : ≤ 10), avec hystérésis. */
export function alertLevel(v: number, prev: number): number {
  const th = NEEDS.thresholds;
  let lvl = 0;
  for (let i = 0; i < th.length; i++) if (v <= th[i]) lvl = i + 1;
  // On ne redescend d'un cran qu'une fois nettement remonté au-dessus du seuil
  if (lvl < prev) { let keep = lvl; for (let i = lvl; i < prev; i++) if (v <= th[i] + REARM) keep = i + 1; return keep; }
  return lvl;
}

/** Message pour un passage de seuil (faim, soif ou les deux). */
export function alertText(level: number, hunger: boolean, thirst: boolean): string {
  const what = hunger && thirst ? 'faim et soif' : hunger ? 'faim' : 'soif';
  const fix = hunger && thirst ? 'mange et bois' : hunger ? 'mange' : 'bois';
  if (level >= 3) return `État critique (${what}) : ${fix} tout de suite, sinon tu vas t’évanouir !`;
  if (level === 2) return `Tu as très ${hunger && thirst ? 'faim et soif' : what} : ${fix} quelque chose bientôt (inventaire ou bar).`;
  return hunger && thirst ? 'Tu commences à avoir faim et soif. Un en-cas au bar ?' : hunger ? 'Tu commences à avoir faim. Un en-cas au bar ?' : 'Tu commences à avoir soif. Un verre au bar ?';
}

export class NeedsController {
  private acc = 0;
  private sending = false;
  private levels = { hunger: 0, thirst: 0 };
  private primed = false;
  /** Coma en cours : fin du compte à rebours (horloge locale, ms) et cause. */
  coma: { endsAt: number; cause: string } | null = null;
  private waking = false;
  onAlert: ((a: NeedAlert) => void) | null = null;
  onComa: ((cause: string) => void) | null = null;
  onWake: (() => void) | null = null;

  constructor(private s: Services) {
    s.ecoListeners.add((e) => this.onEco(e));
  }

  /** Jauges actuelles (dernier état reçu). */
  get values(): { hunger: number; thirst: number } {
    const n = this.s.data.needs;
    return { hunger: n?.hunger ?? 100, thirst: n?.thirst ?? 100 };
  }

  /** À appeler chaque image pendant l'exploration (`active` = faux : menus, chargements, coma). */
  update(dt: number, active: boolean): void {
    if (this.coma) {
      if (!this.waking && performance.now() >= this.coma.endsAt) void this.wake();
      return;
    }
    if (!active) return;
    this.acc += dt;
    if (this.acc >= TICK_EVERY && !this.sending) void this.tick();
  }

  /** Relevé immédiat (entrée dans le monde) : synchronise les jauges sans les faire baisser. */
  async prime(): Promise<void> { this.acc = 0; await this.s.ask('purser', 'purser', 'needs', { seconds: 0 }); }

  private async tick(): Promise<void> {
    this.sending = true;
    const seconds = Math.min(NEEDS.maxTickSeconds, this.acc);
    this.acc = 0;
    await this.s.ask('purser', 'purser', 'needs', { seconds });
    this.sending = false;
  }

  private onEco(e: EcoSnapshot): void {
    const n = e.needs;
    if (n.coma !== null && !this.coma) {
      this.coma = { endsAt: performance.now() + n.coma, cause: n.cause ?? 'faim' };
      this.onComa?.(this.coma.cause);
      return;
    }
    if (n.coma !== null) return;
    const h = alertLevel(n.hunger, this.levels.hunger), t = alertLevel(n.thirst, this.levels.thirst);
    const upH = h > this.levels.hunger, upT = t > this.levels.thirst;
    this.levels = { hunger: h, thirst: t };
    // Premier relevé : pas d'alerte pour l'état déjà connu (évite un message à chaque chargement)
    if (!this.primed) { this.primed = true; if (Math.max(h, t) < 2) return; }
    if (upH || upT) {
      const lvl = Math.max(upH ? h : 0, upT ? t : 0) as 1 | 2 | 3;
      this.onAlert?.({ level: lvl, text: alertText(lvl, upH || h >= lvl, upT || t >= lvl) });
    }
  }

  /** Fin du compte à rebours : réveil confirmé par l'autorité (nouvel essai chaque seconde si besoin). */
  private async wake(): Promise<void> {
    this.waking = true;
    const r = await this.s.ask('purser', 'purser', 'wake', {});
    this.waking = false;
    if (!r.ok) { if (this.coma) this.coma.endsAt = performance.now() + 1000; return; }
    this.coma = null;
    this.levels = { hunger: 0, thirst: 0 };
    this.onWake?.();
  }

  /** Secondes restantes du coma (affichage). */
  get comaLeft(): number { return this.coma ? Math.max(0, Math.ceil((this.coma.endsAt - performance.now()) / 1000)) : 0; }
}
