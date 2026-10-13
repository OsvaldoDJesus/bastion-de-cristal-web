// Sistema de partículas y textos flotantes para dar "jugo" a las acciones.

export class Particles {
  constructor({ max = 600 } = {}) {
    this.items = [];
    this.max = max;
  }

  emit({ x, y, count = 12, speed = 120, spread = Math.PI * 2, angle = -Math.PI / 2, life = 0.7, colors = ['#fff'], size = 4, sizeJitter = 0.5, gravity = 200, drag = 0.98, shape = 'circle', rng = Math.random }) {
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = angle + (rng() - 0.5) * spread;
      const s = speed * (0.4 + rng() * 0.8);
      this.items.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, maxLife: life,
        color: colors[Math.floor(rng() * colors.length)],
        size: size * (1 - sizeJitter + rng() * sizeJitter * 2),
        gravity, drag, shape,
        rot: rng() * Math.PI * 2,
        spin: (rng() - 0.5) * 8,
      });
    }
  }

  update(dt) {
    const out = [];
    for (const p of this.items) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      out.push(p);
    }
    this.items = out;
  }

  render(ctx) {
    for (const p of this.items) {
      const k = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size * (0.5 + k * 0.5);
      if (p.shape === 'star') drawStar(ctx, 0, 0, 5, s, s * 0.45);
      else if (p.shape === 'square') ctx.fillRect(-s / 2, -s / 2, s, s);
      else if (p.shape === 'heart') drawHeart(ctx, 0, 0, s);
      else { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  clear() { this.items.length = 0; }
}

export class FloatingTexts {
  constructor() { this.items = []; }

  add(x, y, text, { color = '#fff', size = 20, life = 0.9, vy = -60, stroke = 'rgba(0,0,0,0.6)' } = {}) {
    this.items.push({ x, y, text, color, size, life, maxLife: life, vy, stroke });
  }

  update(dt) {
    this.items = this.items.filter((t) => (t.life -= dt) > 0);
    for (const t of this.items) t.y += t.vy * dt;
  }

  render(ctx, font = 'bold {size}px system-ui, sans-serif') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.items) {
      const k = t.life / t.maxLife;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = font.replace('{size}', String(Math.round(t.size * (1 + (1 - k) * 0.2))));
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}

export function drawStar(ctx, cx, cy, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawHeart(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.4);
  ctx.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.5, cy - s, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.3, cx, cy + s * 0.4);
  ctx.closePath();
  ctx.fill();
}

// Sacudida de pantalla: devuelve un desplazamiento (x, y) que decae con el tiempo.
export class Shake {
  constructor() { this.t = 0; this.mag = 0; this.x = 0; this.y = 0; }
  hit(mag = 6, dur = 0.25) { this.mag = Math.max(this.mag, mag); this.t = Math.max(this.t, dur); this.dur = this.t; }
  update(dt) {
    if (this.t <= 0) { this.x = 0; this.y = 0; this.mag = 0; return; }
    this.t -= dt;
    const k = Math.max(0, this.t / (this.dur || 1));
    this.x = (Math.random() - 0.5) * 2 * this.mag * k;
    this.y = (Math.random() - 0.5) * 2 * this.mag * k;
  }
}
