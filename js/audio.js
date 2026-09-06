/* Procedural audio via Web Audio — no asset files required.
 * Engine hum follows speed; one-shot SFX use short synthesized envelopes.
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.muted = Storage.get('muted', false);
    this._unlocked = false;
  }

  /* Must be called from a user gesture (browsers block autoplay). */
  unlock() {
    if (this._unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this._unlocked = true;
    } catch (_) {
      /* audio unavailable */
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get volume() {
    return this._volume ?? 0.6;
  }
  setVolume(v) {
    this._volume = U.clamp(v, 0, 1);
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
  }
  setMuted(m) {
    this.muted = m;
    Storage.set('muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, lp, g };
    g.gain.setTargetAtTime(0.11, ctx.currentTime, 0.4);
  }

  stopEngine() {
    if (!this.engine) return;
    const { osc, osc2, g } = this.engine;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.15);
    osc.stop(t + 0.6);
    osc2.stop(t + 0.6);
    this.engine = null;
    this.setRumble(0);
    if (this.wind) this.wind.g.gain.setTargetAtTime(0, t, 0.2);
  }

  /* Looping filtered noise for gravel/grass; level 0..1 */
  setRumble(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.rumble && level > 0) {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 1.5;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      this.rumble = { src, g };
    }
    if (this.rumble) this.rumble.g.gain.setTargetAtTime(0.35 * level, t, 0.08);
  }

  /* speed01: 0..1 normalised, nitro: bool */
  updateEngine(speed01, nitro) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    // wind noise rises with speed
    if (!this.wind) {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      this.wind = { src, f, g };
    }
    this.wind.g.gain.setTargetAtTime(0.09 * speed01 * speed01, t, 0.15);
    this.wind.f.frequency.setTargetAtTime(600 + speed01 * 1400, t, 0.2);
    const f = 55 + speed01 * 150 + (nitro ? 40 : 0);
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engine.lp.frequency.setTargetAtTime(320 + speed01 * 900 + (nitro ? 600 : 0), t, 0.1);
  }

  _blip({ type = 'sine', from = 440, to = 440, dur = 0.15, vol = 0.3, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.3, vol = 0.4, cutoff = 1200 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  coin() {
    this._blip({ type: 'square', from: 880, to: 1320, dur: 0.09, vol: 0.12 });
    this._blip({ type: 'square', from: 1320, to: 1760, dur: 0.12, vol: 0.1, delay: 0.07 });
  }
  pickup() {
    this._blip({ type: 'triangle', from: 300, to: 900, dur: 0.25, vol: 0.2 });
  }
  repair() {
    [523, 659, 784].forEach((f, i) => this._blip({ type: 'triangle', from: f, to: f * 1.01, dur: 0.18, vol: 0.16, delay: i * 0.08 }));
  }
  shield() {
    this._blip({ type: 'sine', from: 500, to: 1000, dur: 0.3, vol: 0.2 });
    this._blip({ type: 'sine', from: 750, to: 1500, dur: 0.3, vol: 0.15, delay: 0.1 });
  }
  crash() {
    this._noise({ dur: 0.45, vol: 0.5, cutoff: 900 });
    this._blip({ type: 'sawtooth', from: 160, to: 40, dur: 0.4, vol: 0.3 });
  }
  bump() {
    this._noise({ dur: 0.2, vol: 0.25, cutoff: 600 });
  }
  /* two-tone car horn from traffic you get close to */
  horn() {
    this._blip({ type: 'sawtooth', from: 392, to: 392, dur: 0.28, vol: 0.07 });
    this._blip({ type: 'sawtooth', from: 494, to: 494, dur: 0.28, vol: 0.07 });
  }
  /* metallic clang for the guardrail */
  rail() {
    this._noise({ dur: 0.25, vol: 0.35, cutoff: 2400 });
    this._blip({ type: 'square', from: 1400, to: 300, dur: 0.18, vol: 0.12 });
    this._blip({ type: 'triangle', from: 2200, to: 900, dur: 0.3, vol: 0.08, delay: 0.03 });
  }
  /* soft double beep when nitro is nearly empty */
  lowNitro() {
    this._blip({ type: 'sine', from: 660, to: 660, dur: 0.07, vol: 0.08 });
    this._blip({ type: 'sine', from: 660, to: 660, dur: 0.07, vol: 0.08, delay: 0.12 });
  }
  slide() {
    this._noise({ dur: 0.6, vol: 0.2, cutoff: 2500 });
  }
  nitro() {
    this._noise({ dur: 0.5, vol: 0.18, cutoff: 3000 });
    this._blip({ type: 'sawtooth', from: 200, to: 600, dur: 0.5, vol: 0.12 });
  }
  overtake() {
    this._blip({ type: 'triangle', from: 600, to: 900, dur: 0.12, vol: 0.15 });
    this._blip({ type: 'triangle', from: 900, to: 1200, dur: 0.16, vol: 0.15, delay: 0.1 });
  }
  closeCall() {
    this._blip({ type: 'sine', from: 1200, to: 1800, dur: 0.1, vol: 0.1 });
  }
  countdown(final) {
    this._blip({ type: 'square', from: final ? 880 : 440, to: final ? 880 : 440, dur: final ? 0.5 : 0.15, vol: 0.15 });
  }
  finish() {
    [523, 659, 784, 1046].forEach((f, i) => this._blip({ type: 'triangle', from: f, to: f, dur: 0.3, vol: 0.2, delay: i * 0.12 }));
  }
  gameOver() {
    [440, 370, 311, 220].forEach((f, i) => this._blip({ type: 'sawtooth', from: f, to: f * 0.9, dur: 0.35, vol: 0.15, delay: i * 0.18 }));
  }
  click() {
    this._blip({ type: 'sine', from: 700, to: 500, dur: 0.06, vol: 0.08 });
  }
  /* quick engine dip on a gear change */
  gearShift() {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const g = this.engine.g.gain;
    g.setTargetAtTime(0.04, t, 0.02);
    g.setTargetAtTime(0.11, t + 0.09, 0.05);
  }
  /* short rising chime for a sector split */
  sector() {
    this._blip({ type: 'triangle', from: 740, to: 740, dur: 0.1, vol: 0.14 });
    this._blip({ type: 'triangle', from: 988, to: 988, dur: 0.16, vol: 0.14, delay: 0.09 });
  }
}
