// Widgets dibujados en Canvas (no DOM) para que escalen igual que el juego:
// rectángulos redondeados, texto con sombra, botones con pulsación, barras de progreso,
// y listas con desplazamiento vertical u horizontal por arrastre.

export function roundRect(ctx, x, y, w, h, r = 12) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function text(ctx, str, x, y, { size = 18, color = '#fff', align = 'left', baseline = 'middle', weight = '600', shadow = null, font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', maxWidth } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) { ctx.lineWidth = Math.max(2, size / 6); ctx.lineJoin = 'round'; ctx.strokeStyle = shadow; ctx.strokeText(str, x, y, maxWidth); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y, maxWidth);
  ctx.restore();
}

export function measure(ctx, str, size = 18, weight = '600', font = 'system-ui, sans-serif') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// Botón con sombra inferior y animación de pulsación (state.press 0..1).
export class Button {
  constructor({ x, y, w, h, label, color = '#ff5d8f', fg = '#fff', size = 20, radius = 14, icon = null, disabled = false, onTap = () => {} }) {
    Object.assign(this, { x, y, w, h, label, color, fg, size, radius, icon, disabled, onTap });
    this.press = 0;
    this.visible = true;
  }

  contains(px, py) { return this.visible && px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }

  handle(evt) {
    if (!this.visible || this.disabled) return false;
    if (evt.type === 'down' && this.contains(evt.x, evt.y)) { this.press = 1; return true; }
    if (evt.type === 'tap' && this.contains(evt.x, evt.y)) { this.onTap(evt); return true; }
    if (evt.type === 'up' || evt.type === 'cancel') this.press = 0;
    return false;
  }

  update(dt) { if (this.press > 0) this.press = Math.max(0, this.press - dt * 6); }

  render(ctx) {
    if (!this.visible) return;
    const lift = 4 * (1 - this.press);
    const y = this.y + 4 - lift;
    ctx.save();
    if (this.disabled) ctx.globalAlpha = 0.45;
    fillRoundRect(ctx, this.x, this.y + 4, this.w, this.h, this.radius, 'rgba(0,0,0,0.35)');
    fillRoundRect(ctx, this.x, y, this.w, this.h, this.radius, this.color);
    // Brillo superior sutil.
    ctx.globalAlpha *= 0.18;
    fillRoundRect(ctx, this.x + 3, y + 3, this.w - 6, this.h * 0.45, this.radius - 3, '#fff');
    ctx.globalAlpha = this.disabled ? 0.45 : 1;
    const cx = this.x + this.w / 2;
    const cy = y + this.h / 2;
    if (this.icon) { this.icon(ctx, cx, cy, this.h * 0.5); }
    if (this.label) text(ctx, this.label, cx, cy + (this.icon ? this.h * 0.3 : 0), { size: this.size, color: this.fg, align: 'center', weight: '700', shadow: 'rgba(0,0,0,0.25)' });
    ctx.restore();
  }
}

export function progressBar(ctx, x, y, w, h, k, { bg = 'rgba(0,0,0,0.35)', fg = '#7bd389', radius = h / 2, label } = {}) {
  fillRoundRect(ctx, x, y, w, h, radius, bg);
  if (k > 0) fillRoundRect(ctx, x, y, Math.max(h, w * Math.min(1, k)), h, radius, fg);
  if (label) text(ctx, label, x + w / 2, y + h / 2, { size: Math.max(10, h - 4), align: 'center', weight: '700', shadow: 'rgba(0,0,0,0.5)' });
}

// Lista con desplazamiento por arrastre. `items` es un arreglo; `itemHeight` fijo.
// renderItem(ctx, item, index, rect, hovered) dibuja cada fila; onTap(item, index, localX, localY).
export class ScrollList {
  constructor({ x, y, w, h, itemHeight = 60, gap = 6, horizontal = false, renderItem, onTap, padding = 8 }) {
    Object.assign(this, { x, y, w, h, itemHeight, gap, horizontal, renderItem, onTap, padding });
    this.items = [];
    this.offset = 0;
    this.velocity = 0;
    this.dragging = false;
    this.dragMoved = 0;
    this.pressIndex = -1;
  }

  setItems(items) {
    this.items = items;
    this.clampOffset();
  }

  get extent() { return this.horizontal ? this.w : this.h; }
  get contentSize() { return this.padding * 2 + this.items.length * (this.itemHeight + this.gap) - this.gap; }
  get maxOffset() { return Math.max(0, this.contentSize - this.extent); }

  clampOffset() { this.offset = Math.max(0, Math.min(this.maxOffset, this.offset)); }

  contains(px, py) { return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }

  indexAt(px, py) {
    const local = (this.horizontal ? px - this.x : py - this.y) + this.offset - this.padding;
    const idx = Math.floor(local / (this.itemHeight + this.gap));
    if (idx < 0 || idx >= this.items.length) return -1;
    if (local - idx * (this.itemHeight + this.gap) > this.itemHeight) return -1;
    return idx;
  }

  rectOf(index) {
    const start = this.padding + index * (this.itemHeight + this.gap) - this.offset;
    return this.horizontal
      ? { x: this.x + start, y: this.y + this.padding, w: this.itemHeight, h: this.h - this.padding * 2 }
      : { x: this.x + this.padding, y: this.y + start, w: this.w - this.padding * 2, h: this.itemHeight };
  }

  handle(evt) {
    if (evt.type === 'down') {
      if (!this.contains(evt.x, evt.y)) return false;
      this.dragging = true;
      this.dragMoved = 0;
      this.velocity = 0;
      this.pressIndex = this.indexAt(evt.x, evt.y);
      return true;
    }
    if (!this.dragging) return false;
    if (evt.type === 'move') {
      const d = this.horizontal ? evt.dx : evt.dy;
      this.dragMoved += Math.abs(d);
      if (this.dragMoved > 6) { this.offset -= d; this.velocity = -d * 60; this.clampOffset(); this.pressIndex = -1; }
      return true;
    }
    if (evt.type === 'up' || evt.type === 'cancel') {
      this.dragging = false;
      if (evt.type === 'up' && this.dragMoved <= 6 && this.pressIndex >= 0 && this.onTap) {
        const r = this.rectOf(this.pressIndex);
        this.onTap(this.items[this.pressIndex], this.pressIndex, evt.x - r.x, evt.y - r.y);
      }
      this.pressIndex = -1;
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.dragging && Math.abs(this.velocity) > 1) {
      this.offset += this.velocity * dt;
      this.velocity *= Math.exp(-dt * 5);
      this.clampOffset();
    }
  }

  render(ctx) {
    ctx.save();
    roundRect(ctx, this.x, this.y, this.w, this.h, 14);
    ctx.clip();
    const first = Math.max(0, Math.floor((this.offset - this.padding) / (this.itemHeight + this.gap)));
    const visible = Math.ceil(this.extent / (this.itemHeight + this.gap)) + 2;
    for (let i = first; i < Math.min(this.items.length, first + visible); i++) {
      const r = this.rectOf(i);
      this.renderItem(ctx, this.items[i], i, r, i === this.pressIndex);
    }
    ctx.restore();
    // Indicador de desplazamiento.
    if (this.maxOffset > 0) {
      const k = this.offset / this.maxOffset;
      ctx.save();
      ctx.globalAlpha = 0.35;
      if (this.horizontal) fillRoundRect(ctx, this.x + 10 + k * (this.w - 60), this.y + this.h - 5, 40, 3, 2, '#fff');
      else fillRoundRect(ctx, this.x + this.w - 5, this.y + 10 + k * (this.h - 60), 3, 40, 2, '#fff');
      ctx.restore();
    }
  }
}

// Pestañas horizontales simples.
export class Tabs {
  constructor({ x, y, w, h, tabs, active = 0, color = '#ff5d8f', onChange = () => {} }) {
    Object.assign(this, { x, y, w, h, tabs, active, color, onChange });
  }
  handle(evt) {
    if (evt.type !== 'tap' || evt.y < this.y || evt.y > this.y + this.h || evt.x < this.x || evt.x > this.x + this.w) return false;
    const idx = Math.floor(((evt.x - this.x) / this.w) * this.tabs.length);
    if (idx !== this.active) { this.active = idx; this.onChange(idx); }
    return true;
  }
  render(ctx) {
    const tw = this.w / this.tabs.length;
    fillRoundRect(ctx, this.x, this.y, this.w, this.h, 12, 'rgba(0,0,0,0.35)');
    for (let i = 0; i < this.tabs.length; i++) {
      const tx = this.x + i * tw;
      if (i === this.active) fillRoundRect(ctx, tx + 3, this.y + 3, tw - 6, this.h - 6, 10, this.color);
      text(ctx, this.tabs[i], tx + tw / 2, this.y + this.h / 2, { size: Math.min(16, this.h * 0.42), align: 'center', weight: '700', color: i === this.active ? '#fff' : 'rgba(255,255,255,0.75)' });
    }
  }
}
