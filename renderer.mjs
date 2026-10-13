// Dibujo de Bastión de Cristal en Canvas. No muta el motor: lee el estado de `Siege` y pinta.
// Arte procedimental: fondo y runas horneados una vez, enemigos como sprites horneados (sprites.mjs),
// torre, proyectiles y efectos dibujados cada frame.
import { offscreen, text, fillRoundRect, roundRect, progressBar, drawStar, Smooth, clamp } from './kit/index.js';
import { ARENA, BALANCE, CARDS, GAME, RARITY, SKINS } from './content.mjs';
import { bakeSprites, SPRITE_SIZE, BODY_R } from './sprites.mjs';
import { isBossWave } from './engine.mjs';
import { fmt } from './profile.mjs';

const TAU = Math.PI * 2;
const W = GAME.width;
const H = GAME.height;

// Zonas táctiles compartidas con app.mjs.
export const HUD = {
  nova: { x: 240, y: 750, r: 40 },
  speed: { x: 16, y: 724, w: 92, h: 54 },
  pause: { x: 372, y: 724, w: 92, h: 54 },
};
export const PICK = {
  cardX: 36, cardW: 408, cardH: 134, y0: 134, gap: 12,
  reroll: { x: 90, y: 600, w: 300, h: 50 },
};
export const pickRect = (i) => ({ x: PICK.cardX, y: PICK.y0 + i * (PICK.cardH + PICK.gap), w: PICK.cardW, h: PICK.cardH });

const skinOf = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

// ---------- iconos vectoriales ----------
export function drawCoin(ctx, x, y, s = 10) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, '#c9f6ff'); g.addColorStop(0.5, '#4cc8ff'); g.addColorStop(1, '#1c6fd6');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.2); ctx.lineTo(s * 0.5, s * 0.9); ctx.lineTo(-s * 0.5, s * 0.9); ctx.lineTo(-s * 0.8, -s * 0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(-s * 0.15, s * 0.2); ctx.lineTo(-s * 0.8, -s * 0.2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawGem(ctx, x, y, s = 10) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, '#ffd0f4'); g.addColorStop(0.5, '#ff5fd0'); g.addColorStop(1, '#a01a8a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.7); ctx.lineTo(s * 0.6, -s * 0.7); ctx.lineTo(s, -s * 0.1); ctx.lineTo(0, s); ctx.lineTo(-s, -s * 0.1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-s, -s * 0.1); ctx.lineTo(s, -s * 0.1); ctx.moveTo(-s * 0.3, -s * 0.7); ctx.lineTo(-s * 0.1, -s * 0.1); ctx.lineTo(0, s); ctx.moveTo(s * 0.3, -s * 0.7); ctx.lineTo(s * 0.1, -s * 0.1); ctx.stroke();
  ctx.restore();
}

export function drawShard(ctx, x, y, s = 10) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd96a';
  drawStar(ctx, 0, 0, 4, s, s * 0.42);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  drawStar(ctx, -s * 0.15, -s * 0.15, 4, s * 0.45, s * 0.2);
  ctx.restore();
}

// Iconos de las cartas: formas simples de un solo trazo.
export function drawCardIcon(ctx, id, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.11); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); };
  switch (id) {
    case 'dano': // espada
      ctx.beginPath(); ctx.moveTo(-0.6 * s, 0.6 * s); ctx.lineTo(0.55 * s, -0.55 * s); ctx.stroke();
      poly([[0.35, -0.75], [0.8, -0.8], [0.75, -0.35], [0.55, -0.55]], true);
      ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.2 * s); ctx.lineTo(-0.2 * s, 0.5 * s); ctx.stroke();
      break;
    case 'cadencia': // chevrones
      for (const dx of [-0.45, 0.1]) { ctx.beginPath(); ctx.moveTo(dx * s, -0.55 * s); ctx.lineTo((dx + 0.5) * s, 0); ctx.lineTo(dx * s, 0.55 * s); ctx.stroke(); }
      break;
    case 'multi': // tres flechas en abanico
      for (const a of [-0.7, 0, 0.7]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0.7 * s); ctx.lineTo(0, -0.65 * s); ctx.stroke(); poly([[-0.2, -0.45], [0, -0.8], [0.2, -0.45]], true); ctx.restore(); }
      break;
    case 'perfora': // flecha que atraviesa dos círculos
      ctx.beginPath(); ctx.arc(-0.05 * s, 0, 0.42 * s, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.85 * s, 0); ctx.lineTo(0.75 * s, 0); ctx.stroke();
      poly([[0.5, -0.28], [0.9, 0], [0.5, 0.28]], true);
      break;
    case 'critico': // destello
      drawStar(ctx, 0, 0, 4, s * 0.9, s * 0.25);
      break;
    case 'explosivo': // explosión
      drawStar(ctx, 0, 0, 8, s * 0.85, s * 0.45);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.fill();
      break;
    case 'rayo': // rayo
      poly([[0.15, -0.9], [-0.5, 0.1], [-0.05, 0.1], [-0.2, 0.9], [0.5, -0.15], [0.05, -0.15]], true);
      break;
    case 'orbita': // anillo con cuchilla
      ctx.beginPath(); ctx.arc(0, 0, 0.7 * s, 0, TAU); ctx.setLineDash([s * 0.25, s * 0.2]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(0.5 * s, -0.5 * s, 0.22 * s, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 0.18 * s, 0, TAU); ctx.fill();
      break;
    case 'escarcha': // copo
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate((i * Math.PI) / 3); ctx.beginPath(); ctx.moveTo(0, -0.85 * s); ctx.lineTo(0, 0.85 * s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-0.2 * s, -0.6 * s); ctx.lineTo(0, -0.4 * s); ctx.lineTo(0.2 * s, -0.6 * s); ctx.stroke(); ctx.restore(); }
      break;
    case 'dron': // dron con hélices
      ctx.beginPath(); ctx.arc(0, 0, 0.32 * s, 0, TAU); ctx.fill();
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 0.3 * s, -0.1 * s); ctx.lineTo(sx * 0.7 * s, -0.4 * s); ctx.stroke(); ctx.beginPath(); ctx.ellipse(sx * 0.72 * s, -0.5 * s, 0.28 * s, 0.1 * s, 0, 0, TAU); ctx.stroke(); }
      break;
    case 'regen': // corazón con cruz
    case 'vida': {
      ctx.beginPath(); ctx.moveTo(0, 0.75 * s); ctx.bezierCurveTo(-1.1 * s, -0.1 * s, -0.55 * s, -0.95 * s, 0, -0.35 * s); ctx.bezierCurveTo(0.55 * s, -0.95 * s, 1.1 * s, -0.1 * s, 0, 0.75 * s); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = s * 0.14;
      ctx.beginPath(); ctx.moveTo(0, -0.05 * s); ctx.lineTo(0, 0.4 * s); ctx.moveTo(-0.22 * s, 0.17 * s); ctx.lineTo(0.22 * s, 0.17 * s); ctx.stroke();
      break;
    }
    case 'escudo':
      ctx.beginPath(); ctx.moveTo(0, -0.85 * s); ctx.lineTo(0.7 * s, -0.55 * s); ctx.lineTo(0.62 * s, 0.2 * s); ctx.quadraticCurveTo(0.4 * s, 0.7 * s, 0, 0.9 * s); ctx.quadraticCurveTo(-0.4 * s, 0.7 * s, -0.62 * s, 0.2 * s); ctx.lineTo(-0.7 * s, -0.55 * s); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.45 * s); ctx.lineTo(0, 0.5 * s); ctx.stroke();
      break;
    case 'espinas':
      ctx.beginPath(); ctx.arc(0, 0, 0.42 * s, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; poly([[Math.cos(a - 0.2) * 0.5, Math.sin(a - 0.2) * 0.5], [Math.cos(a) * 0.95, Math.sin(a) * 0.95], [Math.cos(a + 0.2) * 0.5, Math.sin(a + 0.2) * 0.5]], true); }
      break;
    case 'fortuna':
      drawCoin(ctx, 0, 0, s * 0.85);
      break;
    case 'sabiduria': // libro/ojo: estrella con punto
      drawStar(ctx, 0, 0, 5, s * 0.9, s * 0.4);
      break;
    case 'verdugo': // calavera
      ctx.beginPath(); ctx.arc(0, -0.1 * s, 0.6 * s, 0, TAU); ctx.fill();
      ctx.fillRect(-0.3 * s, 0.3 * s, 0.6 * s, 0.4 * s);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.arc(-0.23 * s, -0.12 * s, 0.17 * s, 0, TAU); ctx.arc(0.23 * s, -0.12 * s, 0.17 * s, 0, TAU); ctx.fill();
      break;
    case 'nova':
      ctx.beginPath(); ctx.arc(0, 0, 0.3 * s, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 0.62 * s, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(0, 0, 0.92 * s, 0, TAU); ctx.stroke();
      break;
    default:
      drawStar(ctx, 0, 0, 5, s * 0.8, s * 0.35);
  }
  ctx.restore();
}

// ---------- el renderizador ----------
export class BastionRenderer {
  constructor() {
    this.sprites = bakeSprites();
    this.skin = SKINS[0];
    this.t = 0;
    this.rings = [];
    this.bolts = [];
    this.flashes = [];
    this.motes = Array.from({ length: 36 }, (_, i) => ({ x: (i * 97) % W, y: (i * 211) % H, s: 0.4 + ((i * 13) % 10) / 10, v: 6 + ((i * 7) % 9) }));
    this.coins = new Smooth(0, 10);
    this.xp = new Smooth(0, 9);
    this.hp = new Smooth(1, 12);
    this.novaGlow = 0;
    this.hurt = 0;
    this.bg = this._bakeBackground();
    this.runes = this._bakeRunes();
    this.reduceFx = false;
  }

  setSkin(id) { this.skin = skinOf(id); }

  // ---------- horneado ----------
  _bakeBackground() {
    const k = 2;
    const c = offscreen(W * k, H * k);
    const x = c.ctx;
    x.scale(k, k);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04051a'); g.addColorStop(0.45, '#0d0a30'); g.addColorStop(1, '#1a0e3d');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // Nebulosas.
    for (const [nx, ny, nr, col] of [[70, 160, 220, 'rgba(110,60,220,0.20)'], [420, 560, 260, 'rgba(30,150,200,0.16)'], [250, 760, 220, 'rgba(200,60,160,0.13)'], [380, 90, 150, 'rgba(70,90,230,0.14)']]) {
      const rg = x.createRadialGradient(nx, ny, 0, nx, ny, nr);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.fillRect(0, 0, W, H);
    }
    // Estrellas fijas.
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 160; i++) {
      x.fillStyle = `rgba(220,230,255,${0.15 + rnd() * 0.5})`;
      const r = rnd() < 0.1 ? 1.5 : 0.8;
      x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, TAU); x.fill();
    }
    // Plataforma de la arena.
    const ag = x.createRadialGradient(ARENA.cx, ARENA.cy, 20, ARENA.cx, ARENA.cy, 300);
    ag.addColorStop(0, 'rgba(70,50,170,0.55)'); ag.addColorStop(0.55, 'rgba(34,24,100,0.42)'); ag.addColorStop(1, 'rgba(10,8,40,0)');
    x.fillStyle = ag; x.beginPath(); x.arc(ARENA.cx, ARENA.cy, 300, 0, TAU); x.fill();
    // Losetas hexagonales dentro del disco.
    x.save();
    x.beginPath(); x.arc(ARENA.cx, ARENA.cy, 255, 0, TAU); x.clip();
    x.strokeStyle = 'rgba(150,130,255,0.10)'; x.lineWidth = 1;
    const hr = 26;
    const hw = Math.sqrt(3) * hr;
    for (let row = -12; row <= 12; row++) {
      for (let col = -12; col <= 12; col++) {
        const hx = ARENA.cx + col * hw + (row % 2 ? hw / 2 : 0);
        const hy = ARENA.cy + row * hr * 1.5;
        x.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; const px = hx + Math.cos(a) * hr; const py = hy + Math.sin(a) * hr; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
        x.closePath(); x.stroke();
      }
    }
    x.restore();
    // Borde del disco.
    x.strokeStyle = 'rgba(150,130,255,0.32)'; x.lineWidth = 2;
    x.beginPath(); x.arc(ARENA.cx, ARENA.cy, 256, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(100,220,255,0.12)'; x.lineWidth = 6;
    x.beginPath(); x.arc(ARENA.cx, ARENA.cy, 262, 0, TAU); x.stroke();
    // Viñeta.
    const vg = x.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 560);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.55)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    return c.canvas;
  }

  _bakeRunes() {
    const k = 2;
    const R = 270;
    const c = offscreen(R * 2 * k, R * 2 * k);
    const x = c.ctx;
    x.scale(k, k);
    x.translate(R, R);
    x.strokeStyle = 'rgba(170,150,255,0.35)'; x.lineWidth = 1.5;
    for (const r of [110, 178, 236]) { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.setLineDash(r === 178 ? [4, 8] : []); x.stroke(); }
    x.setLineDash([]);
    // Marcas y runas simples.
    x.strokeStyle = 'rgba(190,170,255,0.5)'; x.lineWidth = 2; x.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const r0 = 232; const r1 = i % 3 === 0 ? 246 : 240;
      x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke();
    }
    x.strokeStyle = 'rgba(120,230,255,0.45)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3; const r = 178;
      x.save(); x.translate(Math.cos(a) * r, Math.sin(a) * r); x.rotate(a + Math.PI / 2);
      x.beginPath(); x.moveTo(0, -9); x.lineTo(7, 7); x.lineTo(-7, 7); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(0, -3); x.lineTo(0, 4); x.stroke();
      x.restore();
    }
    return c.canvas;
  }

  // ---------- estado visual ----------
  update(dt, s) {
    this.t += dt;
    for (const m of this.motes) { m.y += m.v * dt; if (m.y > H + 4) { m.y = -4; } }
    this.rings = this.rings.filter((r) => (r.t += dt) < r.life);
    this.bolts = this.bolts.filter((b) => (b.t += dt) < b.life);
    this.flashes = this.flashes.filter((f) => (f.t += dt) < f.life);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 2.4);
    if (this.novaGlow > 0) this.novaGlow = Math.max(0, this.novaGlow - dt);
    if (s) {
      this.coins.set(s.coinsRun);
      this.xp.set(s.xpFrac);
      this.hp.set(s.hpFrac);
    }
    this.coins.update(dt); this.xp.update(dt); this.hp.update(dt);
  }

  resetRun(s) {
    this.rings.length = 0; this.bolts.length = 0; this.flashes.length = 0;
    this.coins.snap(0); this.xp.snap(0); this.hp.snap(s ? s.hpFrac : 1);
    this.hurt = 0; this.novaGlow = 0;
  }

  addRing(x, y, r1, { life = 0.5, color = '#fff', width = 4, r0 = 8 } = {}) { this.rings.push({ x, y, r0, r1, life, t: 0, color, width }); }
  addBolt(pts, color) { this.bolts.push({ pts, t: 0, life: 0.2, color: color || this.skin.bolt, seed: Math.random() * 100 }); }
  addFlash(x, y, color, r = 18) { this.flashes.push({ x, y, t: 0, life: 0.12, color, r }); }

  // ---------- escena ----------
  drawBackground(ctx) {
    ctx.drawImage(this.bg, 0, 0, W, H);
    // Anillo de runas girando muy despacio.
    ctx.save();
    ctx.translate(ARENA.cx, ARENA.cy);
    ctx.rotate(this.t * 0.05);
    ctx.drawImage(this.runes, -270, -270, 540, 540);
    ctx.restore();
    // Motas flotantes.
    if (!this.reduceFx) {
      ctx.fillStyle = 'rgba(200,210,255,0.35)';
      for (const m of this.motes) { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * m.s + m.x); ctx.beginPath(); ctx.arc(m.x, m.y, m.s * 1.1, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  draw(ctx, s) {
    this.drawBackground(ctx);
    const sk = this.skin;
    const st = s.stats;
    // Anillo de alcance.
    ctx.save();
    ctx.strokeStyle = sk.glow; ctx.globalAlpha = 0.16 + 0.06 * Math.sin(this.t * 2); ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -this.t * 10;
    ctx.beginPath(); ctx.arc(s.tower.x, s.tower.y, st.range, 0, TAU); ctx.stroke();
    ctx.restore();
    // Aura de escarcha.
    if (st.frost) {
      const g = ctx.createRadialGradient(s.tower.x, s.tower.y, st.frost.radius * 0.4, s.tower.x, s.tower.y, st.frost.radius);
      g.addColorStop(0, 'rgba(150,220,255,0)'); g.addColorStop(1, 'rgba(150,220,255,0.18)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.tower.x, s.tower.y, st.frost.radius, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(190,240,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.tower.x, s.tower.y, st.frost.radius, 0, TAU); ctx.stroke();
    }
    this.drawEnemies(ctx, s);
    this.drawTower(ctx, s);
    this.drawProjectiles(ctx, s);
    this.drawFx(ctx);
  }

  drawEnemies(ctx, s) {
    const list = s.enemies;
    // Sombras en el suelo.
    ctx.fillStyle = 'rgba(0,0,10,0.35)';
    for (const e of list) { ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.7, e.r * 0.95, e.r * 0.4, 0, 0, TAU); ctx.fill(); }
    const sorted = list.slice().sort((a, b) => a.y - b.y);
    const T = s.tower;
    for (const e of sorted) {
      const spr = this.sprites[e.boss ? e.bossId : e.type];
      if (!spr) continue;
      const size = (e.r / BODY_R) * SPRITE_SIZE * 1.18;   // el sprite sobresale un poco del radio de impacto
      ctx.save();
      ctx.translate(e.x, e.y);
      if (spr.rotates) {
        ctx.rotate(Math.atan2(T.y - e.y, T.x - e.x));
        const w = Math.sin(e.age * (4 + e.speed * 0.08) + e.phase);
        ctx.scale(1 + 0.07 * w, 1 - 0.07 * w);
      } else {
        ctx.translate(0, Math.sin(e.age * 2 + e.phase) * 2.5);
      }
      ctx.drawImage(spr.img, -size / 2, -size / 2, size, size);
      if (e.flash > 0) { ctx.globalAlpha = Math.min(1, e.flash / 0.09) * 0.85; ctx.drawImage(spr.white, -size / 2, -size / 2, size, size); }
      ctx.restore();
      if (e.stun > 0) {
        ctx.strokeStyle = 'rgba(255,230,120,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 5, 4, this.t * 8, this.t * 8 + 4.5); ctx.stroke();
      }
      if (!e.boss && e.hp < e.maxHp * 0.999) {
        const bw = e.r * 2.1;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw, 3.5);
        ctx.fillStyle = '#ff5a78'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw * Math.max(0, e.hp / e.maxHp), 3.5);
      }
    }
    // Objetivo marcado.
    if (s.focusId) {
      const f = list.find((e) => e.id === s.focusId);
      if (f) {
        ctx.save();
        ctx.strokeStyle = this.skin.bolt; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
        ctx.setLineDash([8, 6]); ctx.lineDashOffset = -this.t * 40;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 8, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(T.x, T.y); ctx.lineTo(f.x, f.y); ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawTower(ctx, s) {
    const T = s.tower;
    const sk = this.skin;
    const t = this.t;
    const x = T.x;
    const y = T.y;
    const rings = clamp(Math.floor((s.level - 1) / 5), 0, 5);
    // Halo.
    const halo = ctx.createRadialGradient(x, y, 6, x, y, 90 + rings * 6);
    halo.addColorStop(0, sk.glow + 'aa'); halo.addColorStop(1, sk.glow + '00');
    ctx.fillStyle = halo; ctx.globalAlpha = 0.5 + 0.12 * Math.sin(t * 2.4);
    ctx.beginPath(); ctx.arc(x, y, 90 + rings * 6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // Sombra y plataforma.
    ctx.fillStyle = 'rgba(0,0,10,0.45)'; ctx.beginPath(); ctx.ellipse(x, y + 22, 34, 12, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y + 8);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; const px = Math.cos(a) * 31; const py = Math.sin(a) * 31 * 0.62; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath();
    const pg = ctx.createLinearGradient(0, -20, 0, 20);
    pg.addColorStop(0, '#39406e'); pg.addColorStop(1, '#10122a');
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = sk.glow; ctx.lineWidth = 2; ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.restore();
    // Anillos orbitales (crecen con el nivel de la partida).
    for (let i = 0; i <= rings; i++) {
      ctx.save();
      ctx.translate(x, y + 2);
      ctx.rotate(t * (0.6 + i * 0.22) * (i % 2 ? -1 : 1));
      ctx.scale(1, 0.62);
      ctx.strokeStyle = sk.core; ctx.globalAlpha = 0.55 - i * 0.05; ctx.lineWidth = 2;
      ctx.setLineDash([14 + i * 4, 10]);
      ctx.beginPath(); ctx.arc(0, 0, 40 + i * 7, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // Cristal flotante.
    const bob = Math.sin(t * 2.2) * 2.5;
    const sc = 1 + T.recoil * 0.12;
    ctx.save();
    ctx.translate(x, y - 6 + bob);
    ctx.scale(sc, sc);
    const facets = [
      [[0, -34], [17, -13], [0, 4], 0.95],
      [[0, -34], [-17, -13], [0, 4], 0.55],
      [[17, -13], [12, 18], [0, 4], 0.7],
      [[-17, -13], [-12, 18], [0, 4], 0.35],
      [[12, 18], [0, 28], [0, 4], 0.45],
      [[-12, 18], [0, 28], [0, 4], 0.25],
    ];
    for (const [a, b, c, k] of facets) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
      ctx.fillStyle = k > 0.6 ? sk.bolt : k > 0.4 ? sk.core : sk.glow;
      ctx.globalAlpha = 0.55 + k * 0.4; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Núcleo.
    ctx.shadowColor = sk.bolt; ctx.shadowBlur = 16;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -4, 5 + Math.sin(t * 5) * 0.8 + T.recoil * 2, 0, TAU); ctx.fill();
    ctx.restore();
    // Emisor apuntando.
    ctx.save();
    ctx.translate(x, y - 4 + bob);
    ctx.rotate(T.aim);
    ctx.shadowColor = sk.glow; ctx.shadowBlur = 8;
    ctx.fillStyle = sk.core; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.moveTo(16, -4); ctx.lineTo(28 - T.recoil * 4, -2.5); ctx.lineTo(28 - T.recoil * 4, 2.5); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Escudo.
    const st = s.stats;
    if (st.shieldMax > 0 && T.shield > 1) {
      const k = clamp(T.shield / st.shieldMax, 0, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(140,230,255,${0.25 + 0.5 * k})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y - 4, 46, -Math.PI * (0.2 + k * 0.8) - t * 0.2, Math.PI * (0.2 + k * 0.8) - t * 0.2); ctx.stroke();
      ctx.fillStyle = `rgba(140,230,255,${0.05 + 0.08 * k})`; ctx.beginPath(); ctx.arc(x, y - 4, 46, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // Invulnerabilidad.
    if (T.invuln > 0) {
      ctx.strokeStyle = `rgba(255,226,120,${0.4 + 0.4 * Math.sin(t * 18)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 4, 50, 0, TAU); ctx.stroke();
    }
    // Daño reciente.
    if (this.hurt > 0) {
      ctx.fillStyle = `rgba(255,60,80,${this.hurt * 0.35})`;
      ctx.beginPath(); ctx.arc(x, y - 4, 48, 0, TAU); ctx.fill();
    }
    // Cuchillas y drones.
    for (const b of s.blades) this._blade(ctx, b);
    for (const d of s.drones) this._drone(ctx, d);
    // Barra de vida bajo la torre.
    if (s.menu) return;
    const bw = 104;
    const bx = x - bw / 2;
    const by = y + 46;
    fillRoundRect(ctx, bx - 2, by - 2, bw + 4, 12, 6, 'rgba(0,0,12,0.65)');
    const hk = clamp(this.hp.value, 0, 1);
    const hc = hk > 0.5 ? '#5cf2a0' : hk > 0.25 ? '#ffd24a' : '#ff5a6a';
    if (hk > 0) fillRoundRect(ctx, bx, by, Math.max(8, bw * hk), 8, 4, hc);
    if (st.shieldMax > 0 && T.shield > 1) fillRoundRect(ctx, bx, by - 5, bw * clamp(T.shield / st.shieldMax, 0, 1), 3, 2, '#8ee6ff');
    text(ctx, fmt(Math.ceil(Math.max(0, T.hp))), x, by + 22, { size: 11, align: 'center', color: 'rgba(255,255,255,0.8)', shadow: 'rgba(0,0,0,0.6)' });
  }

  _blade(ctx, b) {
    const sk = this.skin;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a + Math.PI / 2);
    ctx.shadowColor = sk.glow; ctx.shadowBlur = 10;
    ctx.fillStyle = sk.bolt;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(9, -1, 0, 11); ctx.quadraticCurveTo(3, -1, 0, -11); ctx.fill();
    ctx.restore();
  }

  _drone(ctx, d) {
    const sk = this.skin;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.shadowColor = sk.glow; ctx.shadowBlur = 10;
    ctx.fillStyle = '#10142e'; ctx.strokeStyle = sk.core; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sk.bolt; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawProjectiles(ctx, s) {
    const sk = this.skin;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of s.shots) {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const len = p.crit ? 26 : p.drone ? 12 : 18;
      const tx = p.x - (p.vx / sp) * len;
      const ty = p.y - (p.vy / sp) * len;
      ctx.strokeStyle = p.crit ? 'rgba(255,200,60,0.35)' : sk.glow + '59';
      ctx.lineWidth = p.crit ? 9 : 6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = p.crit ? '#fff2b0' : sk.bolt;
      ctx.lineWidth = p.crit ? 4 : 2.6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    // Disparos enemigos.
    for (const e of s.eshots) {
      ctx.fillStyle = 'rgba(255,90,150,0.35)'; ctx.beginPath(); ctx.arc(e.x, e.y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd0e4'; ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawFx(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3));
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }
    for (const f of this.flashes) {
      const k = f.t / f.life;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + k), 0, TAU); ctx.fill();
    }
    for (const b of this.bolts) {
      const k = b.t / b.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.shadowColor = b.color; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < b.pts.length - 1; i++) {
        const a = b.pts[i]; const c = b.pts[i + 1];
        ctx.moveTo(a.x, a.y);
        const segs = 4;
        for (let j = 1; j <= segs; j++) {
          const u = j / segs;
          const off = j === segs ? 0 : Math.sin(b.seed + i * 7 + j * 3.1 + this.t * 40) * 9;
          const nx = -(c.y - a.y); const ny = c.x - a.x;
          const nl = Math.hypot(nx, ny) || 1;
          ctx.lineTo(a.x + (c.x - a.x) * u + (nx / nl) * off, a.y + (c.y - a.y) * u + (ny / nl) * off);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- HUD ----------
  drawHud(ctx, s, o) {
    const sk = this.skin;
    // Oleada.
    fillRoundRect(ctx, 12, 10, 138, 46, 12, 'rgba(8,8,32,0.62)');
    text(ctx, 'OLEADA', 24, 26, { size: 11, color: 'rgba(190,200,255,0.8)', weight: '700' });
    text(ctx, String(s.wave), 24, 44, { size: 24, weight: '900', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
    if (o.modeLabel) text(ctx, o.modeLabel, 142, 44, { size: 11, align: 'right', color: sk.core, weight: '700' });
    // Progreso de la oleada o aviso de jefe.
    const nextBoss = Math.ceil((s.wave + 1) / BALANCE.wave.bossEvery) * BALANCE.wave.bossEvery;
    progressBar(ctx, 160, 22, 150, 10, s.waveFrac, { bg: 'rgba(8,8,32,0.62)', fg: s.boss ? '#ff5a78' : sk.glow });
    text(ctx, s.boss ? '¡JEFE!' : isBossWave(s.wave + 1) ? 'Jefe en la próxima' : `Jefe: oleada ${nextBoss}`, 235, 46, { size: 11, align: 'center', color: s.boss ? '#ff9aa8' : 'rgba(190,200,255,0.75)', weight: '700' });
    // Cristales de la partida.
    fillRoundRect(ctx, 322, 10, 146, 30, 15, 'rgba(8,8,32,0.62)');
    drawCoin(ctx, 342, 25, 9);
    text(ctx, fmt(this.coins.value), 458, 25, { size: 17, align: 'right', weight: '800', color: '#e8fbff', shadow: 'rgba(0,0,0,0.5)' });
    // Racha.
    if (s.combo.n >= 3) {
      text(ctx, `Racha ×${s.comboMult.toFixed(2).replace('.', ',')}`, 458, 54, { size: 12, align: 'right', color: '#ffd96a', weight: '800', shadow: 'rgba(0,0,0,0.5)' });
    }
    // XP.
    fillRoundRect(ctx, 12, 64, W - 24, 9, 4.5, 'rgba(8,8,32,0.62)');
    const xk = clamp(this.xp.value, 0, 1);
    if (xk > 0) fillRoundRect(ctx, 12, 64, Math.max(9, (W - 24) * xk), 9, 4.5, '#b88cff');
    text(ctx, `Nv ${s.level}`, 14, 87, { size: 11, color: 'rgba(210,190,255,0.9)', weight: '800' });
    // Fichas de las cartas elegidas (identidad de la build).
    let cx = 16;
    for (const [id, lv] of Object.entries(s.cards)) {
      if (cx > W - 30) break;
      const rar = RARITY[CARDS[id].rarity];
      fillRoundRect(ctx, cx - 2, 94, 30, 24, 8, 'rgba(8,8,32,0.62)');
      drawCardIcon(ctx, id, cx + 10, 106, 7.5, rar.color);
      text(ctx, String(lv), cx + 24, 113, { size: 9, align: 'right', weight: '900', color: '#fff', shadow: 'rgba(0,0,0,0.7)' });
      cx += 32;
    }
    // Barra del jefe.
    if (s.boss && !s.boss.dead) {
      const b = s.boss;
      const bw = 340; const bx = (W - bw) / 2; const by = 134;
      text(ctx, b.name, W / 2, by - 8, { size: 13, align: 'center', color: '#ffb0bc', weight: '800', shadow: 'rgba(0,0,0,0.7)' });
      fillRoundRect(ctx, bx - 2, by - 2, bw + 4, 16, 8, 'rgba(8,8,32,0.75)');
      fillRoundRect(ctx, bx, by, Math.max(10, bw * clamp(b.hp / b.maxHp, 0, 1)), 12, 6, '#ff4a6a');
      fillRoundRect(ctx, bx + 3, by + 2, Math.max(4, bw * clamp(b.hp / b.maxHp, 0, 1) - 6), 3, 1.5, 'rgba(255,255,255,0.35)');
    }
    // Pista contextual.
    if (o.hint) {
      const a = 0.6 + 0.35 * Math.sin(this.t * 4);
      fillRoundRect(ctx, 50, 640, W - 100, 34, 17, 'rgba(8,8,32,0.7)');
      text(ctx, o.hint, W / 2, 657, { size: 13, align: 'center', color: `rgba(255,255,255,${a})`, weight: '700' });
    }
    // Botones inferiores.
    this._pillButton(ctx, HUD.speed, `×${o.speed}`, o.speed > 1 ? sk.glow : 'rgba(255,255,255,0.14)');
    this._pillButton(ctx, HUD.pause, 'II', 'rgba(255,255,255,0.14)');
    this._novaButton(ctx, s);
  }

  _pillButton(ctx, r, label, color) {
    fillRoundRect(ctx, r.x, r.y + 3, r.w, r.h, 14, 'rgba(0,0,0,0.35)');
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 14, color);
    ctx.globalAlpha = 0.16; fillRoundRect(ctx, r.x + 3, r.y + 3, r.w - 6, r.h * 0.45, 11, '#fff'); ctx.globalAlpha = 1;
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 19, align: 'center', weight: '900', shadow: 'rgba(0,0,0,0.3)' });
  }

  _novaButton(ctx, s) {
    const { x, y, r } = HUD.nova;
    const sk = this.skin;
    const k = s.novaFrac;
    const ready = s.novaReady;
    const pulse = ready ? 1 + 0.06 * Math.sin(this.t * 10) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    if (ready) {
      const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.7);
      g.addColorStop(0, sk.glow + 'aa'); g.addColorStop(1, sk.glow + '00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(0, 4, r, 0, TAU); ctx.fill();
    const bg = ctx.createRadialGradient(-8, -10, 4, 0, 0, r);
    bg.addColorStop(0, ready ? sk.core : '#3a3f78'); bg.addColorStop(1, ready ? sk.glow : '#181a42');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = ready ? '#fff' : sk.core; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r - 4, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    drawCardIcon(ctx, 'nova', 0, -4, 17, ready ? '#fff' : 'rgba(255,255,255,0.7)');
    text(ctx, ready ? 'NOVA' : `${Math.floor(k * 100)}%`, 0, 24, { size: 12, align: 'center', weight: '900', color: ready ? '#fff' : 'rgba(255,255,255,0.8)', shadow: 'rgba(0,0,0,0.4)' });
    ctx.restore();
  }

  // ---------- elección de carta ----------
  drawPick(ctx, s, o) {
    ctx.fillStyle = 'rgba(2,2,16,0.78)'; ctx.fillRect(0, 0, W, H);
    const sk = this.skin;
    text(ctx, `¡NIVEL ${s.pending.level}!`, W / 2, 70, { size: 34, align: 'center', weight: '900', color: '#fff', shadow: 'rgba(0,0,0,0.6)' });
    text(ctx, 'Elige una mejora para esta partida', W / 2, 104, { size: 14, align: 'center', color: 'rgba(200,210,255,0.85)' });
    s.pending.choices.forEach((id, i) => {
      const c = CARDS[id];
      const r = pickRect(i);
      const lvl = s.cards[id] | 0;
      const rar = RARITY[c.rarity];
      const hover = o.hover === i;
      const lift = hover ? -3 : 0;
      const appear = clamp((o.age - i * 0.07) / 0.22, 0, 1);
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(0, (1 - appear) * 40 + lift);
      fillRoundRect(ctx, r.x, r.y + 4, r.w, r.h, 18, 'rgba(0,0,0,0.4)');
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, '#242a66'); g.addColorStop(1, '#121442');
      fillRoundRect(ctx, r.x, r.y, r.w, r.h, 18, g);
      ctx.strokeStyle = rar.color; ctx.lineWidth = hover ? 3.5 : 2.5; ctx.globalAlpha = appear * (hover ? 1 : 0.85);
      roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
      ctx.globalAlpha = appear;
      // Icono.
      const ix = r.x + 62; const iy = r.y + r.h / 2;
      const ig = ctx.createRadialGradient(ix, iy, 6, ix, iy, 46);
      ig.addColorStop(0, rar.color + '55'); ig.addColorStop(1, rar.color + '00');
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, 46, 0, TAU); ctx.fill();
      drawCardIcon(ctx, id, ix, iy, 30, rar.color);
      // Texto.
      text(ctx, c.name, r.x + 120, r.y + 32, { size: 21, weight: '900', color: '#fff', shadow: 'rgba(0,0,0,0.4)' });
      text(ctx, rar.name.toUpperCase(), r.x + r.w - 16, r.y + 26, { size: 11, align: 'right', weight: '900', color: rar.color });
      text(ctx, lvl === 0 ? '¡NUEVA!' : `Nv ${lvl} → ${lvl + 1}`, r.x + 120, r.y + 56, { size: 13, weight: '800', color: lvl === 0 ? '#9dffb4' : sk.core });
      const next = c.text(lvl + 1);
      this._wrap(ctx, next, r.x + 120, r.y + 82, r.w - 140, 18, 14);
      if (lvl > 0) text(ctx, `Ahora: ${c.text(lvl)}`, r.x + 120, r.y + r.h - 14, { size: 11, color: 'rgba(190,200,255,0.65)', maxWidth: r.w - 140 });
      text(ctx, String(i + 1), r.x + 16, r.y + 20, { size: 13, weight: '900', color: 'rgba(255,255,255,0.35)' });
      ctx.restore();
    });
    // Relanzar.
    const rr = PICK.reroll;
    const has = s.rerolls > 0;
    fillRoundRect(ctx, rr.x, rr.y + 4, rr.w, rr.h, 16, 'rgba(0,0,0,0.35)');
    fillRoundRect(ctx, rr.x, rr.y, rr.w, rr.h, 16, has ? '#2e6cff' : o.gems >= o.rerollGems ? '#6a3df0' : 'rgba(255,255,255,0.12)');
    text(ctx, has ? `Relanzar cartas (${s.rerolls})` : `Relanzar · ${o.rerollGems} gemas`, rr.x + rr.w / 2, rr.y + rr.h / 2 + 1, { size: 17, align: 'center', weight: '800', color: has || o.gems >= o.rerollGems ? '#fff' : 'rgba(255,255,255,0.5)' });
    if (!has) drawGem(ctx, rr.x + rr.w - 34, rr.y + rr.h / 2, 9);
    text(ctx, 'Toca una carta, o pulsa 1 · 2 · 3', W / 2, 676, { size: 12, align: 'center', color: 'rgba(200,210,255,0.55)' });
  }

  _wrap(ctx, str, x, y, maxW, lh, size) {
    ctx.save();
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const words = str.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        text(ctx, line, x, yy, { size, color: '#e9edff' });
        line = w; yy += lh;
      } else line = test;
    }
    if (line) text(ctx, line, x, yy, { size, color: '#e9edff' });
    ctx.restore();
  }

  // ---------- menús ----------
  // Torre y siluetas girando: fondo del menú y la pantalla de inicio.
  drawMenuBackdrop(ctx, fake) {
    this.drawBackground(ctx);
    const t = this.t;
    const s = fake;
    s.tower.aim = t * 0.8;
    s.tower.recoil = Math.max(0, Math.sin(t * 3)) * 0.6;
    const order = ['sombra', 'corredor', 'bruto', 'enjambre', 'arquero', 'divisor', 'blindado'];
    ctx.save();
    for (let i = 0; i < order.length; i++) {
      const a = t * 0.18 + (i / order.length) * TAU;
      const rad = 150 + 14 * Math.sin(t * 0.7 + i);
      const e = { type: order[i], x: ARENA.cx + Math.cos(a) * rad, y: ARENA.cy + Math.sin(a) * rad * 0.62, r: [10, 8, 17, 6, 9, 14, 13][i] * 1.2, age: t, phase: i, speed: 40, flash: 0, hp: 1, maxHp: 1, boss: false, stun: 0 };
      s.enemies[i] = e;
    }
    s.enemies.length = order.length;
    ctx.restore();
    this.drawEnemies(ctx, s);
    this.drawTower(ctx, s);
  }

  // Estado de torre inventado para el fondo de los menús.
  makeFake() {
    return {
      tower: { x: ARENA.cx, y: ARENA.cy, r: ARENA.towerR, hp: 1, aim: 0, recoil: 0, shield: 0, invuln: 0 },
      stats: { range: 170, frost: null, shieldMax: 0 },
      level: 12, enemies: [], blades: [], drones: [], focusId: 0, shots: [], eshots: [], menu: true,
    };
  }
}

