// Efectos de sonido sintetizados con WebAudio: sin archivos, sin licencias.
// Se desbloquea con el primer gesto del usuario (requisito de los navegadores móviles).

export class Sfx {
  constructor({ enabled = true, volume = 0.5 } = {}) {
    this.enabled = enabled;
    this.volume = volume;
    this.ctx = null;
    this.master = null;
    this._unlockBound = this.unlock.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this._unlockBound, { once: false });
      window.addEventListener('keydown', this._unlockBound, { once: false });
    }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(v) { this.enabled = v; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  // Tono simple con envolvente. freq puede ser número o [inicio, fin] para glissando.
  tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.3, attack = 0.005, decay, delay = 0 } = {}) {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    const f0 = Array.isArray(freq) ? freq[0] : freq;
    const f1 = Array.isArray(freq) ? freq[1] : freq;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || dur));
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + (decay || dur) + 0.02);
  }

  noise({ dur = 0.15, gain = 0.2, delay = 0, lowpass = 2000 } = {}) {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  // Presets reutilizables por todos los juegos.
  tap() { this.tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.12 }); }
  pop(pitch = 1) { this.tone({ freq: [320 * pitch, 720 * pitch], dur: 0.09, type: 'sine', gain: 0.25 }); }
  coin() {
    this.tone({ freq: 988, dur: 0.07, type: 'square', gain: 0.15 });
    this.tone({ freq: 1319, dur: 0.18, type: 'square', gain: 0.15, delay: 0.07 });
  }
  success() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.22, delay: i * 0.08 }));
  }
  fanfare() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.22, delay: i * 0.09 }));
    this.noise({ dur: 0.5, gain: 0.08, delay: 0.5, lowpass: 4000 });
  }
  error() { this.tone({ freq: [220, 110], dur: 0.25, type: 'sawtooth', gain: 0.18 }); }
  whoosh() { this.noise({ dur: 0.25, gain: 0.15, lowpass: 1200 }); }
  sparkle() {
    for (let i = 0; i < 4; i++) this.tone({ freq: 1500 + Math.random() * 1500, dur: 0.08, type: 'sine', gain: 0.08, delay: i * 0.03 });
  }
  // Fusión: sube de tono con el nivel para que se note el progreso.
  merge(level = 0) {
    const base = 300 * Math.pow(1.12, level);
    this.tone({ freq: [base, base * 2], dur: 0.16, type: 'sine', gain: 0.28 });
    this.tone({ freq: base * 3, dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.05 });
  }
  thud() { this.tone({ freq: [120, 50], dur: 0.12, type: 'sine', gain: 0.3 }); this.noise({ dur: 0.08, gain: 0.1, lowpass: 600 }); }
  brush() { this.noise({ dur: 0.12, gain: 0.06, lowpass: 3000 }); }
  splash() { this.noise({ dur: 0.4, gain: 0.18, lowpass: 1800 }); this.tone({ freq: [600, 200], dur: 0.3, type: 'sine', gain: 0.1 }); }
  harvest() { this.tone({ freq: [500, 900], dur: 0.08, type: 'triangle', gain: 0.2 }); this.tone({ freq: 1200, dur: 0.06, type: 'sine', gain: 0.1, delay: 0.06 }); }
  plant() { this.tone({ freq: [700, 400], dur: 0.08, type: 'sine', gain: 0.18 }); }
}
