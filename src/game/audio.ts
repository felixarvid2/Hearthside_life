// Sound effects and a gentle generative ambient track (WebAudio). Audio is never required: when the browser
// has no WebAudio, blocks autoplay or a file fails to load, the game simply stays silent. The context is
// created and resumed on the first user gesture (browsers refuse to start audio before one).
//
// Effects: public/assets/audio/<id>.ogg (Kenney CC0), decoded once on first use.
// Music: an original, very quiet pad of slowly changing chords built from oscillators (no file).

import type { GameSettings, SoundId } from './api';

type Ctx = AudioContext;

const CHORDS: number[][] = [
  // gentle major-seventh / add9 voicings (Hz), slow progression
  [196.0, 246.94, 293.66, 369.99],
  [174.61, 220.0, 261.63, 329.63],
  [220.0, 261.63, 329.63, 392.0],
  [164.81, 207.65, 246.94, 329.63],
];

export class GameAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private buffers = new Map<SoundId, AudioBuffer | null>();
  private loading = new Map<SoundId, Promise<AudioBuffer | null>>();
  private unlocked = false;
  private settings: GameSettings;
  private musicNodes: { oscs: OscillatorNode[]; gains: GainNode[]; timer: number } | null = null;
  private chordIndex = 0;
  private readonly onGesture = () => this.unlock();

  constructor(private readonly baseUrl: string, settings: GameSettings) {
    this.settings = settings;
    try {
      window.addEventListener('pointerdown', this.onGesture, { capture: true, passive: true });
      window.addEventListener('keydown', this.onGesture, { capture: true, passive: true });
    } catch { /* no window */ }
  }

  /** Creates/resumes the context; safe to call often. */
  unlock(): void {
    if (this.unlocked && this.ctx?.state === 'running') return;
    try {
      if (!this.ctx) {
        const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        if (!C) return;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.sfx = this.ctx.createGain();
        this.music = this.ctx.createGain();
        this.sfx.connect(this.master);
        this.music.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      this.unlocked = true;
      this.updateMusic();
    } catch {
      this.ctx = null;
    }
  }

  setSettings(s: GameSettings): void {
    this.settings = s;
    this.applyVolumes();
    this.updateMusic();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfx || !this.music) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.masterVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.settings.soundVolume, t, 0.05);
    this.music.gain.setTargetAtTime(this.settings.musicVolume * 0.05, t, 0.3);
  }

  /** Plays an effect (no-op until unlocked or when muted). */
  play(id: SoundId): void {
    if (!this.ctx || !this.sfx || this.settings.masterVolume <= 0 || this.settings.soundVolume <= 0) return;
    const buf = this.buffers.get(id);
    if (buf === undefined) { void this.load(id).then((b) => { if (b) this.start(b); }); return; }
    if (buf) this.start(buf);
  }

  private start(buf: AudioBuffer): void {
    if (!this.ctx || !this.sfx) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfx);
      src.start();
    } catch { /* ignore */ }
  }

  private load(id: SoundId): Promise<AudioBuffer | null> {
    const pending = this.loading.get(id);
    if (pending) return pending;
    const p = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}audio/${id}.ogg`);
        if (!res.ok || !this.ctx) throw new Error(String(res.status));
        const data = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(data);
        this.buffers.set(id, buf);
        return buf;
      } catch {
        this.buffers.set(id, null); // e.g. Safari without Ogg Vorbis: stay silent for this effect
        return null;
      }
    })();
    this.loading.set(id, p);
    return p;
  }

  // ---- ambient pad ----

  private updateMusic(): void {
    const want = !!this.ctx && this.unlocked && this.settings.musicVolume > 0 && this.settings.masterVolume > 0;
    if (want && !this.musicNodes) this.startMusic();
    else if (!want && this.musicNodes) this.stopMusic();
  }

  private startMusic(): void {
    const ctx = this.ctx, out = this.music;
    if (!ctx || !out) return;
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(out);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = CHORDS[0]![i]!;
      o.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o);
      gains.push(g);
    }
    const step = () => {
      const chord = CHORDS[this.chordIndex % CHORDS.length]!;
      this.chordIndex++;
      const t = ctx.currentTime;
      oscs.forEach((o, i) => {
        o.frequency.setTargetAtTime(chord[i]!, t, 1.2);
        const g = gains[i]!.gain;
        g.cancelScheduledValues(t);
        g.setTargetAtTime(0.18 + 0.1 * Math.sin(this.chordIndex + i), t, 2.5);
      });
    };
    step();
    const timer = window.setInterval(step, 9000);
    this.musicNodes = { oscs, gains, timer };
  }

  private stopMusic(): void {
    const m = this.musicNodes;
    if (!m) return;
    window.clearInterval(m.timer);
    const t = this.ctx?.currentTime ?? 0;
    for (const g of m.gains) g.gain.setTargetAtTime(0, t, 0.4);
    for (const o of m.oscs) { try { o.stop(t + 2); } catch { /* ignore */ } }
    this.musicNodes = null;
  }

  dispose(): void {
    this.stopMusic();
    try {
      window.removeEventListener('pointerdown', this.onGesture, { capture: true });
      window.removeEventListener('keydown', this.onGesture, { capture: true });
    } catch { /* ignore */ }
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
