// Bucle de juego con paso fijo para la lógica y render interpolado.
// Se pausa solo cuando la pestaña se oculta y limita saltos grandes de tiempo
// para que un cambio de app no dispare cientos de actualizaciones de golpe.

export class GameLoop {
  constructor({ step = 1 / 60, maxFrame = 0.25, update, render, raf, now, pauseWhenHidden = true } = {}) {
    this.step = step;
    this.maxFrame = maxFrame;
    this.pauseWhenHidden = pauseWhenHidden;
    this.update = update || (() => {});
    this.render = render || (() => {});
    this.raf = raf || ((fn) => globalThis.requestAnimationFrame(fn));
    this.now = now || (() => performance.now() / 1000);
    this.running = false;
    this.paused = false;
    this.accumulator = 0;
    this.last = 0;
    this.elapsed = 0;
    this.frames = 0;
    this._tick = this._tick.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = this.now();
    if (typeof document !== 'undefined' && this.pauseWhenHidden) {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
    this.raf(this._tick);
  }

  stop() {
    this.running = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
  }

  pause() { this.paused = true; }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.last = this.now();
    this.accumulator = 0;
  }

  _onVisibility() {
    if (document.hidden) this.pause();
    else this.resume();
  }

  // Avanza manualmente; útil en pruebas y para la simulación de tiempo offline.
  advance(seconds) {
    const steps = Math.floor(seconds / this.step);
    for (let i = 0; i < steps; i++) {
      this.update(this.step);
      this.elapsed += this.step;
    }
  }

  _tick() {
    if (!this.running) return;
    const t = this.now();
    let frame = t - this.last;
    this.last = t;
    if (!this.paused) {
      if (frame > this.maxFrame) frame = this.maxFrame;
      this.accumulator += frame;
      let guard = 0;
      while (this.accumulator >= this.step && guard < 240) {
        this.update(this.step);
        this.elapsed += this.step;
        this.accumulator -= this.step;
        guard++;
      }
      this.render(this.accumulator / this.step, frame);
      this.frames++;
    }
    this.raf(this._tick);
  }
}
