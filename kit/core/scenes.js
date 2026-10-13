// Gestor de escenas con transición de fundido.
// Una escena es un objeto con métodos opcionales:
//   enter(params), exit(), update(dt), render(ctx, alpha), pointer(evt), resize(w, h)

export class SceneManager {
  constructor({ ctx, width, height }) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.scenes = new Map();
    this.current = null;
    this.currentName = null;
    this.fade = null; // { t, duration, to, params, color }
  }

  register(name, scene) {
    this.scenes.set(name, scene);
    scene.manager = this;
    return this;
  }

  get(name) { return this.scenes.get(name); }

  // Cambia de escena. Con duration > 0 hace un fundido a color y de vuelta.
  switch(name, params = {}, { duration = 0.35, color = '#000' } = {}) {
    if (!this.scenes.has(name)) throw new Error(`Escena desconocida: ${name}`);
    // Un switch repetido al mismo destino durante el fundido no lo reinicia
    // (ocurre cuando la escena saliente sigue pidiendo el cambio cada frame).
    if (this.fade && this.fade.to === name) return;
    if (duration <= 0) {
      this._apply(name, params);
      return;
    }
    this.fade = { t: 0, duration, to: name, params, color, switched: false };
  }

  _apply(name, params) {
    if (this.current && this.current.exit) this.current.exit();
    this.current = this.scenes.get(name);
    this.currentName = name;
    if (this.current.enter) this.current.enter(params);
  }

  update(dt) {
    if (this.fade) {
      this.fade.t += dt;
      const half = this.fade.duration / 2;
      if (!this.fade.switched && this.fade.t >= half) {
        this.fade.switched = true;
        this._apply(this.fade.to, this.fade.params);
      }
      if (this.fade.t >= this.fade.duration) this.fade = null;
    }
    if (this.current && this.current.update) this.current.update(dt);
  }

  render(alpha) {
    const ctx = this.ctx;
    if (this.current && this.current.render) this.current.render(ctx, alpha);
    if (this.fade) {
      const half = this.fade.duration / 2;
      const k = this.fade.t < half ? this.fade.t / half : 1 - (this.fade.t - half) / half;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, k));
      ctx.fillStyle = this.fade.color;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  pointer(evt) {
    // Durante el fundido se ignoran toques para evitar dobles acciones.
    if (this.fade) return;
    if (this.current && this.current.pointer) this.current.pointer(evt);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    for (const s of this.scenes.values()) if (s.resize) s.resize(w, h);
  }
}
