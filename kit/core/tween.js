// Interpolaciones y funciones de suavizado para animaciones de interfaz y "jugo".

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const clamp01 = (v) => clamp(v, 0, 1);

export class Tweens {
  constructor() { this.list = []; }

  // to(obj, { x: 100, y: 50 }, 0.4, Ease.outBack, { delay, onDone })
  to(obj, props, duration, ease = Ease.outQuad, { delay = 0, onDone, onUpdate } = {}) {
    const from = {};
    for (const k of Object.keys(props)) from[k] = obj[k];
    const tw = { obj, props, from, duration, ease, t: -delay, onDone, onUpdate, done: false };
    this.list.push(tw);
    return tw;
  }

  // Secuencia de pasos: cada paso es (tweens) => tween
  delay(seconds, fn) {
    return this.to({}, {}, 0.0001, Ease.linear, { delay: seconds, onDone: fn });
  }

  update(dt) {
    const alive = [];
    for (const tw of this.list) {
      if (tw.done) continue;
      tw.t += dt;
      if (tw.t < 0) { alive.push(tw); continue; }
      const k = tw.duration <= 0 ? 1 : clamp01(tw.t / tw.duration);
      const e = tw.ease(k);
      for (const key of Object.keys(tw.props)) tw.obj[key] = lerp(tw.from[key], tw.props[key], e);
      if (tw.onUpdate) tw.onUpdate(e);
      if (k >= 1) { tw.done = true; if (tw.onDone) tw.onDone(); }
      else alive.push(tw);
    }
    this.list = alive;
  }

  cancel(tw) { tw.done = true; }
  clear() { this.list.length = 0; }
}

// Valor que se acerca suavemente a un objetivo (para contadores animados de monedas, barras, etc.).
export class Smooth {
  constructor(value = 0, speed = 8) { this.value = value; this.target = value; this.speed = speed; }
  set(v) { this.target = v; }
  snap(v) { this.value = v; this.target = v; }
  update(dt) {
    const k = 1 - Math.exp(-this.speed * dt);
    this.value += (this.target - this.value) * k;
    if (Math.abs(this.target - this.value) < 1e-4) this.value = this.target;
    return this.value;
  }
}
