// Musique originale générée en direct (Web Audio) : un thème par lieu, composé ici sous forme de données
// (tempo, grille d'accords, motifs). Aucun fichier audio : poids nul et aucune question de droits.
// Les notes sont planifiées un peu en avance (séquenceur à anticipation) : le rythme reste stable même si l'image ralentit.

export type MusicTheme = 'none' | 'menu' | 'hub' | 'casino' | 'arcade' | 'cabins' | 'rooftop' | 'engine' | 'deephouse' | 'lounge';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Accords en notes MIDI (basse comprise en premier). */
type Chord = number[];

interface ThemeDef {
  bpm: number;
  /** Swing : retard des doubles-croches impaires (0..0.33). */
  swing: number;
  chords: Chord[];          // un accord par mesure
  play: (k: Kit, step: number, bar: number, chord: Chord, time: number, stepDur: number) => void;
}

/** Petit générateur pseudo-aléatoire déterministe (motifs mélodiques reproductibles). */
function hash(n: number): number { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

export class Kit {
  private noise: AudioBuffer;
  /** Filtres partagés (un par réglage) : pas de nœud créé à chaque note pour les filtres. */
  private filters = new Map<string, BiquadFilterNode>();
  constructor(readonly c: AudioContext, readonly out: AudioNode) {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
  }
  private env(g: GainNode, t: number, a: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, a = 0.005, dest: AudioNode = this.out, detune = 0): void {
    const o = this.c.createOscillator(), g = this.c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    this.env(g, t, a, peak, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  private filtered(type: BiquadFilterType, freq: number, q = 0.8): BiquadFilterNode {
    const key = `${type}:${freq}:${q}`;
    let f = this.filters.get(key);
    if (!f) { f = this.c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(this.out); this.filters.set(key, f); }
    return f;
  }
  // ---- Instruments
  piano(n: number, t: number, dur = 0.9, v = 0.12): void { const f = midi(n); this.osc('triangle', f, t, dur, v); this.osc('sine', f * 2, t, dur * 0.5, v * 0.35); }
  rhodes(n: number, t: number, dur = 1.2, v = 0.1): void {
    const lp = this.filtered('lowpass', 1800); const f = midi(n);
    this.osc('sine', f, t, dur, v, 0.01, lp); this.osc('sine', f * 3.01, t, dur * 0.25, v * 0.25, 0.003, lp);
  }
  pad(notes: number[], t: number, dur: number, v = 0.035, cutoff = 1100): void {
    const lp = this.filtered('lowpass', cutoff);
    for (const n of notes) { this.osc('sawtooth', midi(n), t, dur, v, dur * 0.3, lp, -6); this.osc('sawtooth', midi(n), t, dur, v, dur * 0.3, lp, 6); }
  }
  bass(n: number, t: number, dur = 0.3, v = 0.22): void { const lp = this.filtered('lowpass', 520); this.osc('triangle', midi(n), t, dur, v, 0.004, lp); this.osc('sine', midi(n), t, dur, v * 0.6, 0.004, lp); }
  pluckBass(n: number, t: number, dur = 0.22, v = 0.2): void { const lp = this.filtered('lowpass', 700); this.osc('sawtooth', midi(n), t, dur, v * 0.5, 0.002, lp); }
  bell(n: number, t: number, dur = 1.1, v = 0.06): void { const f = midi(n); this.osc('sine', f, t, dur, v); this.osc('sine', f * 2.76, t, dur * 0.4, v * 0.4); this.osc('sine', f * 5.4, t, dur * 0.15, v * 0.15); }
  steel(n: number, t: number, dur = 0.5, v = 0.08): void { const f = midi(n); this.osc('sine', f, t, dur, v); this.osc('sine', f * 2.0, t, dur * 0.6, v * 0.5); this.osc('sine', f * 3.0, t, dur * 0.3, v * 0.25); }
  square(n: number, t: number, dur = 0.12, v = 0.04): void { this.osc('square', midi(n), t, dur, v); }
  brass(notes: number[], t: number, dur = 0.18, v = 0.05): void { const lp = this.filtered('lowpass', 1500, 2); for (const n of notes) this.osc('sawtooth', midi(n), t, dur, v, 0.02, lp); }
  harp(n: number, t: number, dur = 1.6, v = 0.07): void { const f = midi(n); this.osc('triangle', f, t, dur, v, 0.002); this.osc('sine', f * 2, t, dur * 0.4, v * 0.3, 0.002); }
  private hit(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1): void {
    const s = this.c.createBufferSource(); s.buffer = this.noise;
    const f = this.c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.c.createGain(); this.env(g, t, 0.002, peak, dur);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  kick(t: number, v = 0.5): void { const o = this.c.createOscillator(), g = this.c.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22); this.env(g, t, 0.003, v, 0.28); o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3); }
  snare(t: number, v = 0.12): void { this.hit(t, 0.14, v, 'bandpass', 1900, 0.7); }
  brush(t: number, v = 0.05): void { this.hit(t, 0.18, v, 'bandpass', 3500, 0.5); }
  hat(t: number, v = 0.05, open = false): void { this.hit(t, open ? 0.18 : 0.04, v, 'highpass', 7500); }
  shaker(t: number, v = 0.035): void { this.hit(t, 0.06, v, 'bandpass', 6000, 1.5); }
  ride(t: number, v = 0.035): void { this.hit(t, 0.3, v, 'highpass', 5200, 0.6); }
  chipNoise(t: number, v = 0.05): void { this.hit(t, 0.05, v, 'highpass', 3000); }
}

// ---------------------------------------------------------------- Thèmes (compositions originales)
const THEMES: Record<Exclude<MusicTheme, 'none'>, ThemeDef> = {
  // Menu : « KS Lounge », jazz lounge feutré (Ré m9 – Sol 13 – Do maj9 – La 7♯9) : Rhodes, contrebasse, balais
  menu: {
    bpm: 84, swing: 0.22,
    chords: [[38, 53, 57, 60, 64], [43, 53, 59, 64, 65], [36, 52, 55, 59, 62], [45, 55, 61, 64, 67]],
    play: (k, s, bar, ch, t, d) => {
      // Contrebasse : noires, fondamentale puis notes de passage
      if (s % 4 === 0) { const walk = [ch[0], ch[0] + 7, ch[0] + 12, ch[0] + 10]; k.pluckBass(walk[s / 4], t, d * 3.2, 0.16); }
      // Rhodes : accords posés sur le 1 et le 2&
      if (s === 0 || s === 6) for (const n of ch.slice(1)) k.rhodes(n, t, d * (s === 0 ? 5 : 8), 0.034);
      if (s === 0) k.pad(ch.slice(2), t, d * 16, 0.01, 800);
      // Mélodie au vibraphone, phrase de 4 mesures
      const ph = [2, 5, 9, 12];
      if (ph.includes(s) && hash((bar % 4) * 19 + s) > 0.4) k.bell(ch[1 + Math.floor(hash((bar % 4) * 3 + s) * 4)] + 12, t, 1.1, 0.03);
      // Balais et ride
      k.brush(t, s % 4 === 0 ? 0.03 : 0.012);
      if (s % 8 === 4) k.ride(t, 0.018);
    },
  },
  // Hall : lounge bossa nova (Ré maj7 – Si m7 – Mi m7 – La7)
  hub: {
    bpm: 92, swing: 0,
    chords: [[50, 61, 66, 69, 73], [47, 57, 62, 66, 69], [52, 62, 67, 71, 74], [45, 55, 61, 64, 67]],
    play: (k, s, bar, ch, t, d) => {
      // Basse bossa : fondamentale / quinte
      if (s === 0 || s === 6) k.bass(ch[0] - 12, t, d * 2.5, 0.17);
      if (s === 8 || s === 14) k.bass(ch[0] - 5, t, d * 2.5, 0.14);
      // Accords syncopés au Rhodes
      if ([0, 3, 6, 10, 13].includes(s)) for (const n of ch.slice(1, 4)) k.rhodes(n, t, d * 2, 0.045);
      // Mélodie (motif répété toutes les 4 mesures)
      if (s % 4 === 2 && hash(bar % 4 * 31 + s) > 0.45) k.rhodes(ch[1 + Math.floor(hash(bar % 4 + s * 3) * 4)] + 12, t, d * 3, 0.05);
      k.brush(t, s % 4 === 0 ? 0.035 : 0.018);
      if (s % 8 === 4) k.snare(t, 0.03);
    },
  },
  // Casino : swing feutré (Fa : Sol m7 – Do7 – Fa maj7 – Ré7)
  casino: {
    bpm: 116, swing: 0.28,
    chords: [[43, 58, 62, 65], [48, 58, 64, 67], [41, 57, 60, 64], [50, 57, 60, 66]],
    play: (k, s, bar, ch, t, d) => {
      // Basse marchante (noires)
      if (s % 4 === 0) { const walk = [ch[0], ch[0] + 4, ch[0] + 7, ch[0] + 9]; k.pluckBass(walk[s / 4] - 12, t, d * 3, 0.18); }
      // Ride swing : 1, 2&, 3, 4&
      if (s % 4 === 0 || s % 8 === 6) k.ride(t, s % 8 === 6 ? 0.02 : 0.03);
      if (s % 8 === 4) k.hat(t, 0.03);
      // Cuivres en sourdine sur les contretemps
      if ((s === 6 || s === 14) && bar % 2 === 1) k.brass(ch.slice(1), t, d * 1.2, 0.025);
      // Piano « comping »
      if ((s === 2 || s === 10) && bar % 2 === 0) for (const n of ch.slice(1)) k.piano(n, t, 0.5, 0.035);
      // Petite phrase de vibraphone de temps en temps
      if (bar % 4 === 3 && s % 2 === 0 && s < 12) k.bell(ch[1 + (s / 2) % 3] + 12, t, 0.6, 0.03);
    },
  },
  // Arcade : chiptune entraînant (La m – Fa – Do – Sol)
  arcade: {
    bpm: 128, swing: 0,
    chords: [[45, 69, 72, 76], [41, 65, 69, 72], [48, 67, 72, 76], [43, 67, 71, 74]],
    play: (k, s, bar, ch, t, d) => {
      if (s % 2 === 0) k.square(ch[0] - (s % 4 === 0 ? 0 : -12), t, d * 1.6, 0.05); // basse octaviée
      k.square(ch[1 + (s % 3)] + 12, t, d * 0.8, 0.018); // arpège rapide
      // Mélodie sur 2 mesures
      if (s % 4 === 0 || (s % 4 === 3 && hash(bar * 5 + s) > 0.5)) k.square(ch[1 + Math.floor(hash((bar % 2) * 17 + s) * 3)] + 24, t, d * 1.8, 0.03);
      if (s % 8 === 0) k.kick(t, 0.35);
      if (s % 8 === 4) k.chipNoise(t, 0.07);
      if (s % 2 === 1) k.chipNoise(t, 0.02);
    },
  },
  // Logements : boîte à musique / harpe, très douce (Fa maj7 – Mi m7 – Ré m7 – Do)
  cabins: {
    bpm: 64, swing: 0,
    chords: [[41, 60, 64, 65, 69], [40, 59, 62, 64, 67], [38, 57, 60, 62, 65], [36, 55, 60, 64, 67]],
    play: (k, s, bar, ch, t, d) => {
      if (s === 0) { k.pad(ch.slice(1, 4), t, d * 16, 0.014, 700); k.bass(ch[0], t, d * 6, 0.1); }
      if (s % 2 === 0) k.harp(ch[1 + ((s / 2) % 4)] + 12, t, 2, 0.05);
      if (s === 12 && hash(bar) > 0.4) k.bell(ch[3] + 24, t, 2, 0.025);
    },
  },
  // Rooftop : tropical (Do – Fa – Sol – Fa), steel-drum, shaker, accords sur les contretemps
  rooftop: {
    bpm: 100, swing: 0.12,
    chords: [[48, 64, 67, 72], [41, 65, 69, 72], [43, 62, 67, 71], [41, 65, 69, 72]],
    play: (k, s, bar, ch, t, d) => {
      if (s === 0 || s === 10) k.bass(ch[0] - 12, t, d * 2, 0.17);
      if (s === 6) k.bass(ch[0] - 5, t, d * 2, 0.13);
      if (s % 4 === 2) for (const n of ch.slice(1)) k.piano(n, t, 0.25, 0.03);
      k.shaker(t, s % 2 ? 0.02 : 0.03);
      if (s % 8 === 0) k.kick(t, 0.22);
      // Mélodie au steel-drum, motif sur 2 mesures
      const m = [0, 3, 6, 8, 11, 14];
      if (m.includes(s) && hash((bar % 2) * 13 + s) > 0.25) k.steel(ch[1 + Math.floor(hash((bar % 2) * 7 + s) * 3)] + 12, t, 0.55, 0.06);
    },
  },
  // Deep house (rooftop la nuit, salon VIP) : 122 BPM, grosse caisse à chaque temps, charleston ouvert sur les
  // contretemps, basse ronde, accords mineurs 9 au Rhodes en « stabs » (La m9 – Fa maj7 – Ré m9 – Mi m7)
  deephouse: {
    bpm: 122, swing: 0.06,
    chords: [[45, 60, 64, 67, 71], [41, 57, 60, 64, 67], [38, 57, 60, 64, 65], [40, 55, 59, 62, 66]],
    play: (k, s, bar, ch, t, d) => {
      if (s % 4 === 0) k.kick(t, 0.3);
      if (s % 4 === 2) k.hat(t, 0.045, true);
      if (s % 2 === 1) k.hat(t, 0.015);
      if (s === 4 || s === 12) k.snare(t, 0.035);
      // Basse : motif syncopé (1, 1a, 2&, 4)
      if ([0, 3, 6, 14].includes(s)) k.bass(ch[0] - (s === 6 ? 0 : 12) + (s === 14 ? 7 : 0), t, d * 1.6, 0.16);
      // Stabs d'accords (filtrés) sur les contretemps
      if (s === 2 || s === 10 || (s === 7 && bar % 2 === 1)) for (const n of ch.slice(1)) k.rhodes(n, t, d * 1.8, 0.03);
      if (s === 0 && bar % 4 === 0) k.pad(ch.slice(1), t, d * 64, 0.008, 650);
      if (s === 14 && hash(bar * 11) > 0.5) k.bell(ch[3] + 12, t, 0.9, 0.018);
    },
  },
  // Lounge (cabine) : lo-fi jazzy très doux (Fa maj9 – Mi m7 – Ré m9 – Do maj7), Rhodes et contrebasse
  lounge: {
    bpm: 76, swing: 0.25,
    chords: [[41, 57, 60, 64, 67], [40, 55, 59, 62, 66], [38, 53, 57, 60, 64], [36, 52, 55, 59, 62]],
    play: (k, s, bar, ch, t, d) => {
      if (s === 0 || s === 10) k.pluckBass(ch[0], t, d * 4, 0.13);
      if (s === 7) k.pluckBass(ch[0] + 7, t, d * 3, 0.1);
      if (s === 0 || s === 11) for (const n of ch.slice(1)) k.rhodes(n, t, d * 6, 0.026);
      if (s % 8 === 0) k.kick(t, 0.12);
      if (s % 8 === 4) k.brush(t, 0.04);
      if (s % 2 === 0) k.shaker(t, 0.008);
      if ((s === 3 || s === 13) && hash(bar * 5 + s) > 0.45) k.piano(ch[2 + Math.floor(hash(bar + s) * 3)] + 12, t, 0.9, 0.03);
    },
  },
  // Salle des machines : nappe sombre et pulsation lente, presque sans mélodie
  engine: {
    bpm: 60, swing: 0,
    chords: [[38, 50, 57, 60], [36, 48, 55, 58], [38, 50, 57, 60], [41, 53, 57, 60]],
    play: (k, s, bar, ch, t, d) => {
      if (s === 0) { k.pad(ch.slice(1), t, d * 16, 0.02, 500); }
      if (s % 8 === 0) k.kick(t, 0.18);
      if (s === 10 && bar % 2) k.bell(ch[2] + 12, t, 2.5, 0.02);
    },
  },
};

export const MUSIC_THEMES = Object.keys(THEMES) as Array<Exclude<MusicTheme, 'none'>>;
export function themeDef(id: Exclude<MusicTheme, 'none'>): { bpm: number; bars: number } { return { bpm: THEMES[id].bpm, bars: THEMES[id].chords.length }; }

export class MusicEngine {
  private current: MusicTheme = 'none';
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private c: AudioContext, private out: AudioNode) {}

  get theme(): MusicTheme { return this.current; }

  play(id: MusicTheme): void {
    if (id === this.current) return;
    this.stop();
    this.current = id;
    if (id === 'none') return;
    const def = THEMES[id];
    const g = this.c.createGain(); g.gain.value = 0.0001; g.connect(this.out);
    g.gain.exponentialRampToValueAtTime(1, this.c.currentTime + 1.2);
    this.gain = g;
    const kit = new Kit(this.c, g);
    const stepDur = 60 / def.bpm / 4;
    let next = this.c.currentTime + 0.1, step = 0;
    this.timer = setInterval(() => {
      while (next < this.c.currentTime + 0.25) {
        const s = step % 16, bar = Math.floor(step / 16);
        const swing = s % 2 === 1 ? def.swing * stepDur : 0;
        try { def.play(kit, s, bar, def.chords[bar % def.chords.length], next + swing, stepDur); } catch (e) { console.warn('[KingSea] musique', e); }
        next += stepDur; step++;
      }
    }, 50);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const g = this.gain;
    if (g) {
      const t = this.c.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      setTimeout(() => g.disconnect(), 1200);
    }
    this.gain = null;
    this.current = 'none';
  }
}
