/**
 * Procedural lofi engine — no audio files, everything is synthesized.
 * A slow Am9-flavored axis (Fmaj7 → Em7 → Dm9 → Cmaj7), sparse pentatonic
 * melody notes, soft boom-bap kick/hats, vinyl crackle, generated reverb.
 * Autoplay-safe: starts only on a user gesture (the start screen click).
 */

export const BPM = 72;
const BEAT = 60 / BPM;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** MIDI → Hz. */
export function noteHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** The four-bar loop. Each bar = root + chord tones above (MIDI). */
export const CHORD_PROGRESSION: number[][] = [
  [41, 53, 57, 60, 64], // Fmaj7
  [40, 52, 55, 59, 62], // Em7
  [38, 50, 53, 57, 60], // Dm9
  [36, 48, 52, 55, 59], // Cmaj7
];

const MELODY_PENT = [57, 60, 62, 64, 67, 69]; // A3 C4 D4 E4 G4 A4
const STORAGE_KEY = 'lofi-garden-audio';

interface AudioPrefs {
  on?: boolean;
  volume?: number;
  sfxVolume?: number;
  goldenHour?: boolean;
  rainVolume?: number;
  rainOn?: boolean;
}

export function readAudioPrefs(): AudioPrefs {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AudioPrefs) : {};
  } catch {
    return {};
  }
}

export function writeAudioPrefs(patch: AudioPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAudioPrefs(), ...patch }));
  } catch {
    // private mode — prefs just won't persist
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private crackle: AudioBufferSourceNode | null = null;
  private crackleGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private on = true; // fresh visitors get music; a saved 'false' is respected
  private volume = 0.55;
  private sfxVolume = 0.7;
  private rainVolume = 0.55;
  private rainOn = true;
  private rainBus: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainPlipTimer: ReturnType<typeof setInterval> | null = null;
  private rainActive = false;
  private nextNoteTime = 0;
  private beat = 0;
  private bar = 0;
  private melodyIndex = 2;

  constructor() {
    const saved = readAudioPrefs();
    if (typeof saved.on === 'boolean') this.on = saved.on;
    if (typeof saved.volume === 'number') this.volume = clamp01(saved.volume);
    if (typeof saved.sfxVolume === 'number') this.sfxVolume = clamp01(saved.sfxVolume);
    if (typeof saved.rainVolume === 'number') this.rainVolume = clamp01(saved.rainVolume);
    if (typeof saved.rainOn === 'boolean') this.rainOn = saved.rainOn;
    // rain arrives whenever the sky says so — unless you asked it not to
  }

  // ------------------------------------------------------------- lifecycle

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0; // starts silent, ramps in on start()
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1600;
    lowpass.Q.value = 0.6;

    this.musicBus.connect(lowpass);
    lowpass.connect(comp); // dry

    // generated room reverb, fed by the music bus
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeImpulseResponse(1.9, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    lowpass.connect(this.convolver);
    this.convolver.connect(wet);
    wet.connect(comp);

    // sfx: dry path through the same compressor
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume * 0.7;
    this.sfxBus.connect(comp);

    // rain: a filtered hush of its own bus, independent of music and sfx
    this.rainBus = ctx.createGain();
    this.rainBus.gain.value = 0;
    this.rainBus.connect(comp);

    return ctx;
  }

  private makeImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  /** Begin the generative loop (call from a user gesture). */
  start(): void {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    this.stopCrackle(); // never double up
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.on = true;
    this.persist();
    // gentle fade-in of the whole music bus
    const t = ctx.currentTime;
    this.musicBus!.gain.cancelScheduledValues(t);
    this.musicBus!.gain.setValueAtTime(this.musicBus!.gain.value, t);
    this.musicBus!.gain.linearRampToValueAtTime(this.volume * 0.9, t + 0.8);
    this.startCrackle();
    this.nextNoteTime = t + 0.08;
    this.beat = 0;
    this.bar = 0;
    this.timer = setInterval(() => this.tick(), 25);
  }

  /** Fade the loop out and suspend scheduling. */
  pause(): void {
    if (!this.ctx) {
      this.on = false;
      return;
    }
    this.on = false;
    this.persist();
    const t = this.ctx.currentTime;
    this.musicBus!.gain.cancelScheduledValues(t);
    this.musicBus!.gain.setValueAtTime(this.musicBus!.gain.value, t);
    this.musicBus!.gain.linearRampToValueAtTime(0, t + 0.35);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // let the tail ring, then silence the crackle
    setTimeout(() => this.stopCrackle(), 400);
  }

  toggle(): boolean {
    if (this.on) this.pause();
    else this.start();
    return this.on;
  }

  isOn(): boolean {
    return this.on;
  }

  getVolume(): number {
    return this.volume;
  }

  /** 0..1 perceptual — applied to the music bus, not SFX. */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.persist();
    if (this.ctx && this.musicBus && this.on) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(this.volume * 0.9, t + 0.12);
    }
  }

  private persist(): void {
    writeAudioPrefs({
      on: this.on,
      volume: this.volume,
      sfxVolume: this.sfxVolume,
      rainVolume: this.rainVolume,
      rainOn: this.rainOn,
    });
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  getRainVolume(): number {
    return this.rainVolume;
  }

  getRainOn(): boolean {
    return this.rainOn;
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = clamp01(v);
    this.persist();
    if (this.ctx && this.sfxBus) {
      const t = this.ctx.currentTime;
      this.sfxBus.gain.cancelScheduledValues(t);
      this.sfxBus.gain.setValueAtTime(this.sfxBus.gain.value, t);
      this.sfxBus.gain.linearRampToValueAtTime(this.sfxVolume * 0.7, t + 0.12);
    }
  }

  // -------------------------------------------------------------- rain bus

  /** Start (or fade in) the rain. Called when the sky opens. */
  startRain(): void {
    if (typeof window === 'undefined') return; // headless tests have no sky
    const ctx = this.ensure();
    this.rainActive = true;
    if (!this.rainSource) {
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.025 * white) / 1.025;
        data[i] = last * 3.1;
      }
      this.rainSource = ctx.createBufferSource();
      this.rainSource.buffer = noise;
      this.rainSource.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1050;
      band.Q.value = 0.75;
      this.rainSource.connect(band);
      band.connect(this.rainBus!);
      this.rainSource.start();
      this.startRainPips();
    }
    this.rampRainTo(this.rainOn ? this.rainVolume * 0.55 : 0);
  }

  /** Fade the rain out. Called when the sky clears. */
  stopRain(): void {
    if (!this.ctx || !this.rainActive) return;
    this.rainActive = false;
    this.rampRainTo(0);
    if (this.rainPlipTimer) {
      clearInterval(this.rainPlipTimer);
      this.rainPlipTimer = null;
    }
    const source = this.rainSource;
    this.rainSource = null;
    if (source) {
      setTimeout(() => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
      }, 900);
    }
  }

  private rampRainTo(target: number): void {
    if (!this.ctx || !this.rainBus) return;
    const t = this.ctx.currentTime;
    this.rainBus.gain.cancelScheduledValues(t);
    this.rainBus.gain.setValueAtTime(this.rainBus.gain.value, t);
    this.rainBus.gain.linearRampToValueAtTime(target, t + 0.7);
  }

  private startRainPips(): void {
    if (this.rainPlipTimer) return;
    // sparse droplet plips scattered over the hush
    this.rainPlipTimer = setInterval(() => {
      if (!this.rainOn) return;
      if (Math.random() < 0.72) this.plip(0.03 + Math.random() * 0.05, 700 + Math.random() * 1100);
    }, 140);
  }

  private plip(peak: number, freq: number): void {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.rainBus!);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** User-facing volume for the rain channel, 0..1. */
  setRainVolume(v: number): void {
    this.rainVolume = clamp01(v);
    this.persist();
    this.rampRainTo(this.rainOn && this.rainActive ? this.rainVolume * 0.55 : 0);
  }

  /** User's rain toggle — weather continues regardless; only the sound goes quiet. */
  setRainOn(on: boolean): void {
    this.rainOn = on;
    this.persist();
    if (this.rainActive) this.rampRainTo(on ? this.rainVolume * 0.55 : 0);
  }

  // ------------------------------------------------------------ scheduling

  private tick(): void {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.35) {
      this.scheduleBeat(this.beat, this.bar, this.nextNoteTime);
      this.nextNoteTime += BEAT;
      this.beat += 1;
      if (this.beat >= 4) {
        this.beat = 0;
        this.bar = (this.bar + 1) % CHORD_PROGRESSION.length;
      }
    }
  }

  private scheduleBeat(beat: number, bar: number, t: number): void {
    if (beat === 0) this.scheduleChord(CHORD_PROGRESSION[bar], t);
    // soft boom-bap: kick on 1 & 3, brushed hats on 2 & 4 + offbeat ticks
    if (beat === 0 || beat === 2) this.kick(t, beat === 0 ? 0.5 : 0.32);
    if (beat === 1 || beat === 3) this.hat(t, 0.09);
    this.hat(t + BEAT / 2, 0.04);
    // sparse melody: ~30% chance per beat, weighted toward rests
    if (Math.random() < 0.3) this.melodyNote(t + (Math.random() < 0.5 ? 0 : BEAT / 2));
  }

  private voice(
    midi: number,
    t: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    detuneCents = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = noteHz(midi);
    osc.detune.value = detuneCents;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.28);
    gain.gain.setValueAtTime(peak, t + Math.max(0.3, dur - 0.5));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.musicBus!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private scheduleChord(notes: number[], t: number): void {
    const [root, ...rest] = notes;
    // the root breathes as a deep sine, the voicing floats as triangles
    this.voice(root, t, 4.4, 0.16, 'sine', 0);
    for (const midi of rest) {
      this.voice(midi, t + 0.012 * Math.random(), 4.2, 0.055, 'triangle', (Math.random() - 0.5) * 9);
    }
  }

  private kick(t: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, t);
    osc.frequency.exponentialRampToValueAtTime(43, t + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain);
    gain.connect(this.musicBus!);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private hat(t: number, peak: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus!);
    src.start(t);
  }

  private melodyNote(t: number): void {
    // lazy random walk across the pentatonic ladder
    const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    this.melodyIndex = Math.min(MELODY_PENT.length - 1, Math.max(0, this.melodyIndex + step));
    this.voice(MELODY_PENT[this.melodyIndex], t, 1.6, 0.045, 'sine', (Math.random() - 0.5) * 7);
  }

  // --------------------------------------------------------------- crackle

  private startCrackle(): void {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buf.getChannelData(ch);
      // soft vinyl bed (filtered brown-ish noise)
      let last = 0;
      for (let i = 0; i < len; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 0.16;
      }
      // pops & dust ticks
      const pops = 18 + Math.floor(Math.random() * 8);
      for (let p = 0; p < pops; p += 1) {
        const at = Math.floor(Math.random() * (len - 200));
        const amp = 0.12 + Math.random() ** 2 * 0.5;
        const dur = 24 + Math.floor(Math.random() * 110);
        for (let j = 0; j < dur; j += 1) {
          data[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (dur * 0.32));
        }
      }
    }
    this.crackle = ctx.createBufferSource();
    this.crackle.buffer = buf;
    this.crackle.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1700;
    band.Q.value = 0.5;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0.32;
    this.crackle.connect(band);
    band.connect(this.crackleGain);
    this.crackleGain.connect(this.musicBus!); // rides with the music bus fader
    this.crackle.start();
  }

  private stopCrackle(): void {
    if (!this.crackle) return;
    try {
      this.crackle.stop();
    } catch {
      // already stopped
    }
    this.crackle.disconnect();
    this.crackleGain?.disconnect();
    this.crackle = null;
    this.crackleGain = null;
  }

  // ------------------------------------------------------------------- sfx

  private sfxEnv(peak: number, t0 = 0): { gain: GainNode; t: number } {
    const ctx = this.ensure();
    const t = ctx.currentTime + t0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.connect(this.sfxBus!);
    return { gain, t };
  }

  private noiseBurst(t: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const { gain, t: start } = this.sfxEnv(peak, t - ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    src.start(start);
  }

  private tone(freq0: number, freq1: number, t0: number, dur: number, peak: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + t0;
    osc.frequency.setValueAtTime(freq0, t);
    osc.frequency.exponentialRampToValueAtTime(freq1, t + dur * 0.55);
    const { gain } = this.sfxEnv(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Low soft thud + dirt whisper. */
  playTill(): void {
    if (!this.ctx) return;
    this.tone(92, 55, 0, 0.16, 0.5, 'sine');
    this.noiseBurst(this.ctx.currentTime, 0.07, 0.18, 'lowpass', 420);
  }

  /** Splash: swept band-passed noise + droplet blips. */
  playWater(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.ctx.currentTime, 0.22, 0.22, 'bandpass', 900);
    this.tone(740, 620, 0.05, 0.08, 0.12, 'sine');
    this.tone(980, 830, 0.14, 0.07, 0.1, 'sine');
  }

  /** Sprinkler tick — a polite little droplet cluster. */
  playSprinkle(): void {
    if (!this.ctx) return;
    this.tone(1180, 990, 0, 0.05, 0.1, 'sine');
    this.tone(1420, 1240, 0.07, 0.05, 0.09, 'sine');
    this.tone(980, 860, 0.13, 0.05, 0.08, 'sine');
  }

  /** Tiny high tick. */
  playPlant(): void {
    if (!this.ctx) return;
    this.tone(660, 700, 0, 0.055, 0.16, 'triangle');
  }

  /** Satisfying pop. */
  playHarvest(): void {
    if (!this.ctx) return;
    this.tone(430, 660, 0, 0.11, 0.4, 'triangle');
    this.noiseBurst(this.ctx.currentTime, 0.045, 0.12, 'highpass', 1800);
  }

  /** Bright two-note chime. Pass a small delay for layering behind the pop. */
  playCoin(t0 = 0): void {
    if (!this.ctx) return;
    this.tone(1318, 1318, t0, 0.32, 0.22, 'sine');
    this.tone(1760, 1760, t0 + 0.055, 0.4, 0.18, 'sine');
    this.tone(2637, 2637, t0 + 0.11, 0.3, 0.08, 'sine');
  }

  /** Hammer knock. */
  playKnock(): void {
    if (!this.ctx) return;
    this.tone(215, 180, 0, 0.075, 0.42, 'square');
    this.noiseBurst(this.ctx.currentTime, 0.04, 0.14, 'bandpass', 1400);
  }

  /** Little victory arpeggio — used when a barn (or deed) lands. */
  playArpeggio(): void {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1046]; // C5 E5 G5 C6
    for (let i = 0; i < notes.length; i += 1) {
      this.tone(notes[i], notes[i], i * 0.085, 0.34, 0.16, 'triangle');
    }
  }

  /** Muted thud — "nope". */
  playDenied(): void {
    if (!this.ctx) return;
    this.tone(155, 120, 0, 0.14, 0.28, 'sine');
  }

  /** Tiny wood tick for UI. */
  playUi(): void {
    if (!this.ctx) return;
    this.tone(880, 840, 0, 0.03, 0.07, 'triangle');
  }

  /** Dev/test introspection. */
  state(): string {
    return this.ctx?.state ?? 'cold';
  }
}

export const audio = new AudioEngine();
