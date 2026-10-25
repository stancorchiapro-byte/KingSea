// Audio synthétisé (Web Audio) : aucun fichier son à charger, poids nul, sons et musiques originaux.
// Trois bus indépendants, chacun avec son volume : effets (sfx), ambiance (océan, machines, foule), musique.
// Sur mobile, l'audio ne démarre qu'après un premier geste : unlock() est appelé au premier toucher.
import { MusicEngine, type MusicTheme } from './Music';

export type Ambient = 'none' | 'hub' | 'engine' | 'casino' | 'arcade' | 'cabins' | 'rooftop';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** Atténuation de la musique d'étage quand on s'approche de la boîte de nuit. */
  private musicDuck: GainNode | null = null;
  private music: MusicEngine | null = null;
  private ambNodes: AudioNode[] = [];
  private ambStoppers: Array<() => void> = [];
  private currentAmbient: Ambient = 'none';
  private wantedAmbient: Ambient = 'none';
  private wantedMusic: MusicTheme = 'none';
  private sfxVol = 0.8;
  private ambVol = 0.6;
  private musVol = 0.5;
  private masterVol = 1;
  private masterBus: GainNode | null = null;
  private seqTimers: Array<ReturnType<typeof setInterval>> = [];
  private clubGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Style musical de la boîte de nuit (choisi auprès du DJ). */
  clubStyle = 0;
  static readonly CLUB_STYLES = ['House marine', 'Tropical', 'Électro néon'];

  get unlocked(): boolean { return this.ctx !== null && this.ctx.state === 'running'; }
  get musicTheme(): MusicTheme { return this.music?.theme ?? 'none'; }

  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor(); // évite la saturation quand tout joue en même temps
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.masterBus = this.ctx.createGain(); comp.connect(this.masterBus); this.masterBus.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain(); this.ambBus = this.ctx.createGain(); this.musicBus = this.ctx.createGain();
        this.musicDuck = this.ctx.createGain();
        this.sfxBus.connect(comp); this.ambBus.connect(comp); this.musicBus.connect(comp);
        this.musicDuck.connect(this.musicBus);
        this.music = new MusicEngine(this.ctx, this.musicDuck);
        this.applyVolumes();
      }
      void this.ctx.resume();
      if (this.wantedAmbient !== this.currentAmbient) this.setAmbient(this.wantedAmbient);
      this.setMusic(this.wantedMusic);
    } catch (e) { console.warn('[KingSea] audio indisponible', e); }
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }

  /** Volume de la musique de la boîte de nuit selon la distance à la piste (0..1) ; la musique d'étage s'efface d'autant. */
  setClubLevel(level: number): void {
    if (!this.ctx) return;
    const l = Math.max(0, Math.min(1, level)), t = this.ctx.currentTime;
    this.clubGain?.gain.setTargetAtTime(l, t, 0.25);
    this.musicDuck?.gain.setTargetAtTime(1 - l * 0.9, t, 0.3);
  }

  setVolumes(sfx: number, ambient: number, music = this.musVol, master = this.masterVol): void { this.sfxVol = sfx; this.ambVol = ambient; this.musVol = music; this.masterVol = master; this.applyVolumes(); }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxBus || !this.ambBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.sfxVol * 0.5, t, 0.03);
    this.ambBus.gain.setTargetAtTime(this.ambVol * 0.35, t, 0.1);
    this.musicBus.gain.setTargetAtTime(this.musVol * 0.5, t, 0.1);
    this.masterBus?.gain.setTargetAtTime(this.masterVol, t, 0.05);
  }

  /** Thème musical (menu, hall, casino…). Sans effet tant que l'audio n'est pas débloqué : mémorisé pour plus tard. */
  setMusic(theme: MusicTheme): void {
    this.wantedMusic = theme;
    if (this.music && this.ctx?.state !== 'closed') this.music.play(theme);
  }

  // ---------- Effets
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.4, delay = 0, slideTo?: number): void {
    const c = this.ctx; if (!c || !this.sfxBus || c.state !== 'running') return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private noiseHit(dur: number, gain: number, type: BiquadFilterType, freq: number, delay = 0, sweepTo?: number): void {
    const c = this.ctx; if (!c || !this.sfxBus || c.state !== 'running') return;
    const t0 = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuffer(c);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.05, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02);
  }

  tap(): void { this.tone(880, 0.06, 'triangle', 0.18); this.tone(1320, 0.04, 'sine', 0.06, 0.01); }
  back(): void { this.tone(520, 0.08, 'triangle', 0.18, 0, 380); }
  error(): void { this.tone(220, 0.16, 'square', 0.1); this.tone(180, 0.2, 'square', 0.08, 0.09); }
  coin(): void { this.tone(1318, 0.12, 'sine', 0.26); this.tone(1760, 0.3, 'sine', 0.22, 0.07); this.tone(2637, 0.2, 'sine', 0.06, 0.07); }
  ding(): void { this.tone(1046, 0.7, 'sine', 0.26); this.tone(1318, 0.9, 'sine', 0.18, 0.18); this.tone(2093, 0.4, 'sine', 0.05, 0.18); }
  pour(): void { for (let i = 0; i < 6; i++) this.tone(600 + Math.random() * 500, 0.05, 'sine', 0.1, i * 0.05); }
  switchOn(): void { this.tone(140, 0.12, 'square', 0.15); this.tone(90, 0.5, 'sawtooth', 0.08, 0.1, 160); }
  /** Jetons en argile : deux claquements courts et brillants (le second plus doux), comme une pile qu'on pose. */
  chip(): void {
    this.noiseHit(0.035, 0.16, 'bandpass', 3400, 0); this.tone(2600, 0.03, 'triangle', 0.05);
    this.noiseHit(0.03, 0.09, 'bandpass', 4200, 0.045); this.tone(3100, 0.025, 'triangle', 0.03, 0.045);
  }
  /** Carte : glissement sur le tapis puis claquement sec. */
  card(): void { this.noiseHit(0.09, 0.07, 'bandpass', 1800, 0, 4200); this.noiseHit(0.03, 0.12, 'highpass', 3000, 0.07); }
  tick(): void { this.tone(2400, 0.02, 'square', 0.04); }
  /** Petite fanfare de gain, avec scintillement. */
  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => { this.tone(f, 0.28, 'triangle', 0.15, i * 0.08); this.tone(f * 2, 0.2, 'sine', 0.04, i * 0.08); });
    for (let i = 0; i < 5; i++) this.tone(2000 + Math.random() * 1600, 0.12, 'sine', 0.03, 0.35 + i * 0.05);
  }
  /** Gros gain (jackpot, record) : fanfare plus longue. */
  jackpot(): void {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15, i * 0.09));
    for (let i = 0; i < 12; i++) this.tone(1800 + Math.random() * 2400, 0.15, 'sine', 0.03, 0.2 + i * 0.06);
  }
  lose(): void { this.tone(330, 0.2, 'triangle', 0.1); this.tone(247, 0.3, 'triangle', 0.08, 0.15); }
  knock(strength = 1): void { this.tone(180 + Math.random() * 120, 0.08, 'square', Math.min(0.18, 0.04 + strength * 0.05)); }
  roll(): void { this.noiseHit(0.6, 0.06, 'lowpass', 400, 0, 200); this.tone(70, 0.6, 'sawtooth', 0.04, 0, 50); }
  splash(): void { this.noiseHit(0.5, 0.18, 'bandpass', 1500, 0, 500); for (let i = 0; i < 4; i++) this.tone(400 + Math.random() * 900, 0.08, 'sine', 0.06, 0.05 + i * 0.04); }
  /** Portes coulissantes (ascenseur, cabine). */
  whoosh(): void { this.noiseHit(0.45, 0.07, 'bandpass', 600, 0, 2200); }
  /** Bruit de pas discret selon le sol (bois, pierre, moquette, métal) ; clapotis dans l'eau. */
  footstep(surface: 'wood' | 'stone' | 'carpet' | 'metal', water = false): void {
    if (water) { this.tone(300 + Math.random() * 200, 0.09, 'sine', 0.03, 0, 180); return; }
    const f = { wood: 190, stone: 320, carpet: 120, metal: 520 }[surface], g = { wood: 0.045, stone: 0.03, carpet: 0.015, metal: 0.035 }[surface];
    this.tone(f * (0.9 + Math.random() * 0.2), surface === 'metal' ? 0.06 : 0.045, surface === 'metal' ? 'square' : 'triangle', g, 0, f * 0.6);
  }
  /** Billard : choc de billes (sec et brillant), bande (sourd), bille qui tombe dans la poche (roulement). */
  ballClick(strength = 1): void { const g = Math.min(0.22, 0.05 + strength * 0.12); this.noiseHit(0.025, g, 'bandpass', 5200); this.tone(3400, 0.03, 'sine', g * 0.4); }
  cushion(strength = 1): void { this.tone(110 + Math.random() * 20, 0.09, 'triangle', Math.min(0.14, 0.03 + strength * 0.08), 0, 70); this.noiseHit(0.05, Math.min(0.06, strength * 0.04), 'lowpass', 600); }
  pocket(): void { this.noiseHit(0.32, 0.08, 'lowpass', 900, 0, 240); this.tone(160, 0.12, 'triangle', 0.06, 0.22, 90); }
  /** Arcade : quilles qui s'entrechoquent (bois creux), filet de basket, clameur du public. */
  pins(strength = 1): void { for (let i = 0; i < 3; i++) this.tone(420 + Math.random() * 380, 0.07, 'triangle', Math.min(0.12, 0.04 + strength * 0.05), i * 0.025, 260); this.noiseHit(0.06, 0.05 * strength, 'bandpass', 1400); }
  swish(): void { this.noiseHit(0.28, 0.09, 'highpass', 2400, 0, 6000); }
  cheer(): void { this.noiseHit(1.2, 0.07, 'bandpass', 1100, 0, 1500); for (let i = 0; i < 6; i++) this.tone(500 + Math.random() * 400, 0.25, 'sawtooth', 0.012, 0.1 + i * 0.08); }
  /** Coup de queue (cuir sur ivoire). */
  cueStrike(power = 0.5): void { this.noiseHit(0.03, 0.08 + power * 0.12, 'bandpass', 2600); this.tone(900, 0.04, 'triangle', 0.05 + power * 0.06); }
  discover(): void { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, i * 0.09)); }
  /** Piano du hall : courte phrase pentatonique (différente à chaque fois). */
  piano(): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
    let k = Math.floor(Math.random() * 3);
    for (let i = 0; i < 5; i++) {
      k = Math.max(0, Math.min(scale.length - 1, k + Math.floor(Math.random() * 3) - (i > 2 ? 1 : 0)));
      this.tone(scale[k], 0.9, 'triangle', 0.14, i * 0.22); this.tone(scale[k] * 2, 0.5, 'sine', 0.03, i * 0.22);
    }
    this.tone(261.63, 1.6, 'sine', 0.08, 0); this.tone(392, 1.4, 'sine', 0.05, 0.66);
  }
  /** Déclencheur d'appareil photo. */
  shutter(): void { this.noiseHit(0.05, 0.12, 'highpass', 3000); this.noiseHit(0.06, 0.08, 'bandpass', 1500, 0.08); }
  /** Feu d'artifice : sifflement puis détonation étouffée. */
  firework(delay = 0): void { this.tone(900, 0.5, 'sine', 0.05, delay, 2400); this.noiseHit(0.5, 0.14, 'lowpass', 700, delay + 0.5, 150); }

  // ---------- Ambiance (bruitages d'environnement ; la musique est à part)
  setAmbient(kind: Ambient): void {
    this.wantedAmbient = kind;
    const c = this.ctx; if (!c || !this.ambBus) return;
    if (kind === this.currentAmbient) return;
    for (const stop of this.ambStoppers) stop();
    this.ambStoppers = []; this.ambNodes = [];
    for (const tm of this.seqTimers) clearInterval(tm);
    this.seqTimers = [];
    this.clubGain = null;
    this.musicDuck?.gain.setTargetAtTime(1, c.currentTime, 0.3);
    this.currentAmbient = kind;
    if (kind === 'hub') this.startOcean(c, this.ambBus);
    if (kind === 'cabins') this.startOcean(c, this.ambBus, 0.18);
    if (kind === 'engine') this.startEngine(c, this.ambBus);
    if (kind === 'casino') this.startCasino(c, this.ambBus);
    if (kind === 'arcade') this.startArcade(c, this.ambBus);
    if (kind === 'rooftop') { this.startOcean(c, this.ambBus, 0.25); this.startGulls(c, this.ambBus); if (this.musicBus) this.startClub(c, this.musicBus); }
  }

  private runSequencer(c: AudioContext, stepDur: number, onStep: (step: number, time: number) => void): void {
    let next = c.currentTime + 0.05, step = 0;
    this.seqTimers.push(setInterval(() => {
      while (next < c.currentTime + 0.15) { onStep(step++, next); next += stepDur; }
    }, 40));
  }

  private note(c: AudioContext, out: AudioNode, time: number, freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, time);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, time + dur);
    g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(gain, time + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g).connect(out); o.start(time); o.stop(time + dur + 0.02);
  }

  /** Brouhaha de foule (bruit filtré, légèrement modulé). */
  private startMurmur(c: AudioContext, out: GainNode, level: number): void {
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.9;
    const g = c.createGain(); g.gain.value = level;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.31; const lg = c.createGain(); lg.gain.value = level * 0.4;
    lfo.connect(lg).connect(g.gain);
    src.connect(bp).connect(g).connect(out); src.start(); lfo.start();
    this.ambStoppers.push(() => { try { src.stop(); lfo.stop(); } catch { /* déjà arrêté */ } g.disconnect(); });
  }

  private startCasino(c: AudioContext, out: GainNode): void {
    this.startMurmur(c, out, 0.16);
    const g = c.createGain(); g.gain.value = 0.25; g.connect(out);
    const chimes = [1318, 1568, 1760, 2093];
    // Carillons de machines à sous et jetons, au hasard
    this.runSequencer(c, 0.25, (step, time) => {
      const r = Math.random();
      if (r < 0.06) for (let i = 0; i < 3; i++) this.note(c, g, time + i * 0.07, chimes[(step + i) % 4], 0.3, 'sine', 0.1);
      else if (r < 0.1) this.note(c, g, time, 1500 + Math.random() * 600, 0.05, 'square', 0.03);
    });
    this.ambStoppers.push(() => g.disconnect());
  }

  private startArcade(c: AudioContext, out: GainNode): void {
    this.startMurmur(c, out, 0.12);
    const g = c.createGain(); g.gain.value = 0.3; g.connect(out);
    // Bips des bornes et chocs de flipper, au hasard
    this.runSequencer(c, 0.2, (_step, time) => {
      const r = Math.random();
      if (r < 0.06) { const f = 400 + Math.floor(Math.random() * 8) * 110; this.note(c, g, time, f, 0.08, 'square', 0.03); this.note(c, g, time + 0.08, f * 1.5, 0.1, 'square', 0.025); }
      else if (r < 0.09) this.note(c, g, time, 180, 0.06, 'square', 0.04);
    });
    this.ambStoppers.push(() => g.disconnect());
  }

  /** Mouettes au loin sur le pont supérieur. */
  private startGulls(c: AudioContext, out: GainNode): void {
    const g = c.createGain(); g.gain.value = 0.18; g.connect(out);
    this.runSequencer(c, 0.5, (_s, time) => {
      if (Math.random() < 0.035) for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) this.note(c, g, time + i * 0.22, 1700 + Math.random() * 300, 0.18, 'sine', 0.05, 1100);
    });
    this.ambStoppers.push(() => g.disconnect());
  }

  private startClub(c: AudioContext, out: GainNode): void {
    const g = c.createGain(); g.gain.value = 0; g.connect(out);
    this.clubGain = g;
    const noise = this.noiseBuffer(c);
    const bass = [55, 55, 65.4, 49];
    this.runSequencer(c, 0.125, (step, time) => {
      const st = this.clubStyle;
      if (st === 1 && step % 8 === 3) this.note(c, g, time, [784, 880, 988, 1046][Math.floor(step / 8) % 4], 0.18, 'triangle', 0.14); // marimba
      if (st === 2 && step % 2 === 0) this.note(c, g, time, [440, 523, 659, 784][(step / 2) % 4], 0.08, 'square', 0.05); // arpège électro
      if (st === 0 && step % 16 === 6) for (const f of [349, 440, 523]) this.note(c, g, time, f, 0.3, 'sawtooth', 0.025); // stab house
      if (step % 4 === 0) this.note(c, g, time, 140, 0.25, 'sine', 0.9, 45); // grosse caisse
      if (step % 4 === 2) { // charleston
        const src = c.createBufferSource(); src.buffer = noise;
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        const hg = c.createGain(); hg.gain.setValueAtTime(0.18, time); hg.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
        src.connect(hp).connect(hg).connect(g); src.start(time); src.stop(time + 0.06);
      }
      if (step % 2 === 1) this.note(c, g, time, bass[Math.floor(step / 16) % 4], 0.12, 'sawtooth', 0.12);
    });
    this.ambStoppers.push(() => g.disconnect());
  }

  /** Intensifie le bruit des machines (mode « pleine puissance » du panneau). */
  setEngineBoost(on: boolean): void {
    const g = this.ambNodes.find((n) => (n as GainNode & { __boost?: boolean }).__boost) as GainNode | undefined;
    if (g && this.ctx) g.gain.setTargetAtTime(on ? 1.6 : 0.8, this.ctx.currentTime, 0.4);
  }

  private noiseBuffer(c: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    return b;
  }

  private startOcean(c: AudioContext, out: GainNode, level = 0.35): void {
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer(c); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = c.createGain(); g.gain.value = level;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.12;
    const lfoGain = c.createGain(); lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(out);
    src.start(); lfo.start();
    this.ambNodes.push(g);
    this.ambStoppers.push(() => { try { src.stop(); lfo.stop(); } catch { /* déjà arrêté */ } g.disconnect(); });
  }

  private startEngine(c: AudioContext, out: GainNode): void {
    const g = c.createGain(); g.gain.value = 0.8; (g as GainNode & { __boost?: boolean }).__boost = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 48;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 48.7;
    const og = c.createGain(); og.gain.value = 0.18;
    const n = c.createBufferSource(); n.buffer = this.noiseBuffer(c); n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.12;
    o1.connect(og); o2.connect(og); og.connect(lp);
    n.connect(nf).connect(ng).connect(lp);
    lp.connect(g).connect(out);
    o1.start(); o2.start(); n.start();
    this.ambNodes.push(g);
    // Cliquetis mécaniques réguliers
    const tg = c.createGain(); tg.gain.value = 0.3; tg.connect(out);
    this.runSequencer(c, 0.42, (step, time) => { if (step % 2 === 0) this.note(c, tg, time, 95, 0.07, 'square', 0.05); if (Math.random() < 0.05) this.note(c, tg, time, 1900, 0.04, 'square', 0.02); });
    this.ambStoppers.push(() => { try { o1.stop(); o2.stop(); n.stop(); } catch { /* déjà arrêté */ } g.disconnect(); tg.disconnect(); });
  }
}
