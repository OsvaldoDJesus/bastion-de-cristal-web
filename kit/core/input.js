// Entrada unificada de ratón y táctil en coordenadas lógicas.
// Emite eventos { type: 'down'|'move'|'up'|'tap'|'drag'|'cancel', x, y, dx, dy, id, duration }.
// Solo sigue el primer puntero activo; los toques adicionales se ignoran.

export class Pointer {
  constructor(surface, handler, { tapMaxMs = 350, tapMaxDist = 12 } = {}) {
    this.surface = surface; // objeto de createCanvas()
    this.handler = handler;
    this.tapMaxMs = tapMaxMs;
    this.tapMaxDist = tapMaxDist;
    this.active = null;
    this.enabled = true;
    const c = surface.canvas;
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._cancel = this._cancel.bind(this);
    c.addEventListener('pointerdown', this._down);
    c.addEventListener('pointermove', this._move);
    c.addEventListener('pointerup', this._up);
    c.addEventListener('pointercancel', this._cancel);
    c.addEventListener('pointerleave', this._cancel);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy() {
    const c = this.surface.canvas;
    c.removeEventListener('pointerdown', this._down);
    c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up);
    c.removeEventListener('pointercancel', this._cancel);
    c.removeEventListener('pointerleave', this._cancel);
  }

  _emit(evt) {
    if (this.enabled) this.handler(evt);
  }

  _down(e) {
    if (this.active) {
      // Un segundo dedo se ignora; un puntero "colgado" (pointerup perdido) se reemplaza.
      if (this.active.id !== e.pointerId && performance.now() - this.active.t0 < 1500) return;
      this._emit({ type: 'cancel', x: this.active.x, y: this.active.y, dx: 0, dy: 0, id: this.active.id });
      this.active = null;
    }
    e.preventDefault();
    try { this.surface.canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    const p = this.surface.toLogical(e.clientX, e.clientY);
    this.active = { id: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, t0: performance.now(), moved: false };
    this._emit({ type: 'down', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId });
  }

  _move(e) {
    const p = this.surface.toLogical(e.clientX, e.clientY);
    if (!this.active || this.active.id !== e.pointerId) {
      this._emit({ type: 'hover', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId });
      return;
    }
    e.preventDefault();
    const dx = p.x - this.active.x;
    const dy = p.y - this.active.y;
    this.active.x = p.x;
    this.active.y = p.y;
    const dist = Math.hypot(p.x - this.active.startX, p.y - this.active.startY);
    if (dist > this.tapMaxDist) this.active.moved = true;
    this._emit({ type: 'move', x: p.x, y: p.y, dx, dy, id: e.pointerId });
    if (this.active.moved) this._emit({ type: 'drag', x: p.x, y: p.y, dx, dy, id: e.pointerId, startX: this.active.startX, startY: this.active.startY });
  }

  _up(e) {
    if (!this.active || this.active.id !== e.pointerId) return;
    e.preventDefault();
    const p = this.surface.toLogical(e.clientX, e.clientY);
    const duration = performance.now() - this.active.t0;
    const a = this.active;
    this.active = null;
    this._emit({ type: 'up', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId, duration, startX: a.startX, startY: a.startY });
    if (!a.moved && duration <= this.tapMaxMs) {
      this._emit({ type: 'tap', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId, duration });
    }
  }

  _cancel(e) {
    if (!this.active || this.active.id !== e.pointerId) return;
    const a = this.active;
    this.active = null;
    this._emit({ type: 'cancel', x: a.x, y: a.y, dx: 0, dy: 0, id: e.pointerId });
  }
}

// Utilidad para botones dibujados en canvas: comprueba si un punto cae en un rectángulo.
export function hit(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function hitCircle(x, y, cx, cy, radius) {
  return Math.hypot(x - cx, y - cy) <= radius;
}
