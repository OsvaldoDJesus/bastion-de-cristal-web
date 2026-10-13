// Arte de los enemigos, horneado una sola vez en lienzos fuera de pantalla (sin imágenes externas).
// Cada sprite se dibuja en un lienzo de 128×128 con el cuerpo de radio 40 mirando hacia +x;
// en juego se escala según el radio del enemigo y se gira hacia la torre.
import { offscreen } from './kit/index.js';

export const SPRITE_SIZE = 128;
export const BODY_R = 40;
const C = SPRITE_SIZE / 2;
const TAU = Math.PI * 2;

// ---------- utilidades ----------
function radial(ctx, x, y, r0, r1, stops, cx = x, cy = y) {
  const g = ctx.createRadialGradient(x, y, r0, cx, cy, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

function blobPath(ctx, r, { lobes = 3, amp = 0.08, phase = 1, lobes2 = 5, amp2 = 0.05, stretch = 1 } = {}) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const k = 1 + amp * Math.sin(lobes * a + phase) + amp2 * Math.sin(lobes2 * a);
    const x = C + Math.cos(a) * r * k * stretch;
    const y = C + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function glow(ctx, color, blur, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

function eye(ctx, x, y, rx, ry, color, core = '#fff', blur = 12) {
  glow(ctx, color, blur, () => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  });
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.ellipse(x + rx * 0.15, y, rx * 0.45, ry * 0.45, 0, 0, TAU); ctx.fill();
}

function rim(ctx, r, color, from = Math.PI * 0.9, to = Math.PI * 1.55, width = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(C, C, r - width, from, to); ctx.stroke();
  ctx.restore();
}

// ---------- enemigos pequeños (giran hacia la torre) ----------
function sombra(ctx) {
  // Colas atrás.
  ctx.fillStyle = '#241466';
  for (const [dy, len] of [[-18, 26], [0, 32], [18, 24]]) {
    ctx.beginPath();
    ctx.moveTo(C - 24, C + dy - 8);
    ctx.quadraticCurveTo(C - 24 - len, C + dy + 6, C - 28 - len, C + dy + 2);
    ctx.quadraticCurveTo(C - 24 - len * 0.5, C + dy - 2, C - 20, C + dy + 8);
    ctx.fill();
  }
  blobPath(ctx, BODY_R, { amp: 0.07 });
  ctx.fillStyle = radial(ctx, C - 10, C - 12, 4, BODY_R + 6, [[0, '#9a7bff'], [0.5, '#4b2fba'], [1, '#150b3d']], C, C);
  ctx.fill();
  rim(ctx, BODY_R, 'rgba(206,190,255,0.7)');
  eye(ctx, C + 15, C - 11, 6, 8, '#ff58e1');
  eye(ctx, C + 15, C + 11, 6, 8, '#ff58e1');
}

function corredor(ctx) {
  // Cuerpo afilado con púas.
  ctx.fillStyle = '#7a1f12';
  for (let i = 0; i < 4; i++) {
    const x = C - 8 - i * 9;
    ctx.beginPath(); ctx.moveTo(x, C - 22 + i * 2); ctx.lineTo(x - 14, C - 38 - i * 2); ctx.lineTo(x - 18, C - 18); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, C + 22 - i * 2); ctx.lineTo(x - 14, C + 38 + i * 2); ctx.lineTo(x - 18, C + 18); ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(C + 46, C);
  ctx.bezierCurveTo(C + 28, C - 34, C - 14, C - 34, C - 42, C - 8);
  ctx.lineTo(C - 42, C + 8);
  ctx.bezierCurveTo(C - 14, C + 34, C + 28, C + 34, C + 46, C);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, C + 6, C - 8, 3, 54, [[0, '#ffb25a'], [0.45, '#ff5a2c'], [1, '#5a0e0e']], C, C);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,160,0.6)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(C + 38, C - 6); ctx.bezierCurveTo(C + 18, C - 26, C - 8, C - 26, C - 30, C - 12); ctx.stroke();
  eye(ctx, C + 20, C - 7, 7, 3.5, '#ffe45a');
  eye(ctx, C + 20, C + 7, 7, 3.5, '#ffe45a');
}

function bruto(ctx) {
  // Cuernos.
  ctx.fillStyle = '#d9c7a0';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(C + 8, C + s * 34); ctx.lineTo(C + 30, C + s * 52); ctx.lineTo(C + 26, C + s * 28); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(C, C, BODY_R, 0, TAU);
  ctx.fillStyle = radial(ctx, C - 12, C - 14, 4, BODY_R + 8, [[0, '#d6705a'], [0.5, '#8a2f26'], [1, '#2c0a0a']], C, C);
  ctx.fill();
  // Placas.
  ctx.strokeStyle = 'rgba(40,8,8,0.7)'; ctx.lineWidth = 4;
  for (const a of [-0.9, 0, 0.9]) { ctx.beginPath(); ctx.arc(C, C, BODY_R - 10, a - 0.5 + Math.PI, a + 0.5 + Math.PI); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,170,140,0.55)'; ctx.lineWidth = 2.5;
  for (const a of [-0.9, 0, 0.9]) { ctx.beginPath(); ctx.arc(C, C, BODY_R - 13, a - 0.45 + Math.PI, a + 0.45 + Math.PI); ctx.stroke(); }
  rim(ctx, BODY_R, 'rgba(255,196,170,0.6)');
  // Cara.
  eye(ctx, C + 18, C - 12, 5.5, 5.5, '#ffd23c');
  eye(ctx, C + 18, C + 12, 5.5, 5.5, '#ffd23c');
  ctx.strokeStyle = '#2c0a0a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(C + 10, C - 22); ctx.lineTo(C + 28, C - 15); ctx.moveTo(C + 10, C + 22); ctx.lineTo(C + 28, C + 15); ctx.stroke();
  ctx.fillStyle = '#f4e8c8';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(C + 30, C + i * 5 - 2); ctx.lineTo(C + 37, C + i * 5); ctx.lineTo(C + 30, C + i * 5 + 2); ctx.fill(); }
}

function enjambre(ctx) {
  ctx.strokeStyle = '#1f5a1c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(C + i * 10, C + s * 18); ctx.lineTo(C + i * 14 - 4, C + s * 36); ctx.stroke(); }
  }
  // Alas.
  ctx.fillStyle = 'rgba(200,255,210,0.35)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(C - 8, C + s * 26, 22, 11, s * 0.5, 0, TAU); ctx.fill(); }
  blobPath(ctx, 30, { amp: 0.05 });
  ctx.fillStyle = radial(ctx, C - 6, C - 8, 3, 38, [[0, '#d8ff9a'], [0.5, '#6fd048'], [1, '#1c5a1a']], C, C);
  ctx.fill();
  rim(ctx, 30, 'rgba(240,255,210,0.7)', Math.PI * 0.9, Math.PI * 1.6, 3);
  eye(ctx, C + 12, C - 8, 5, 6, '#ffffff', '#101010', 4);
  eye(ctx, C + 12, C + 8, 5, 6, '#ffffff', '#101010', 4);
}

function arquero(ctx) {
  // Capa.
  ctx.beginPath();
  ctx.moveTo(C + 40, C);
  ctx.bezierCurveTo(C + 20, C - 40, C - 20, C - 44, C - 44, C - 22);
  ctx.quadraticCurveTo(C - 30, C, C - 44, C + 22);
  ctx.bezierCurveTo(C - 20, C + 44, C + 20, C + 40, C + 40, C);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, C, C - 10, 4, 54, [[0, '#2fb3c0'], [0.55, '#14697a'], [1, '#06242e']], C, C);
  ctx.fill();
  rim(ctx, 42, 'rgba(160,250,255,0.55)');
  // Capucha vacía.
  ctx.beginPath(); ctx.ellipse(C + 16, C, 15, 20, 0, 0, TAU);
  ctx.fillStyle = '#020a10'; ctx.fill();
  eye(ctx, C + 22, C, 5, 8, '#5cf3ff');
  // Arco de energía.
  glow(ctx, '#5cf3ff', 10, () => {
    ctx.strokeStyle = '#baffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(C + 30, C, 26, -1.05, 1.05); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(C + 30 + Math.cos(-1.05) * 26, C + Math.sin(-1.05) * 26); ctx.lineTo(C + 30 + Math.cos(1.05) * 26, C + Math.sin(1.05) * 26); ctx.stroke();
  });
}

function slime(ctx, { mini = false } = {}) {
  blobPath(ctx, BODY_R, { amp: 0.1, lobes: 4, phase: 0.4 });
  ctx.fillStyle = radial(ctx, C - 10, C - 12, 3, BODY_R + 6, [[0, 'rgba(180,255,220,0.95)'], [0.5, 'rgba(46,214,140,0.85)'], [1, 'rgba(6,90,70,0.95)']], C, C);
  ctx.fill();
  if (!mini) {
    // Núcleo con línea de división.
    ctx.beginPath(); ctx.arc(C - 2, C + 4, 14, 0, TAU);
    ctx.fillStyle = 'rgba(8,70,60,0.75)'; ctx.fill();
    glow(ctx, '#aaffd8', 8, () => {
      ctx.strokeStyle = '#d8fff0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(C - 2, C - 10); ctx.lineTo(C - 2, C + 18); ctx.stroke();
    });
  }
  // Brillo.
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(C - 14, C - 18, 12, 6, -0.6, 0, TAU); ctx.fill();
  rim(ctx, BODY_R, 'rgba(220,255,240,0.6)');
  eye(ctx, C + 18, C - 10, 5, 6.5, '#0a0a14', '#fff', 0);
  eye(ctx, C + 18, C + 10, 5, 6.5, '#0a0a14', '#fff', 0);
}

function blindado(ctx) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const x = C + Math.cos(a) * BODY_R * 1.02;
    const y = C + Math.sin(a) * BODY_R * 1.02;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, C - 12, C - 14, 4, BODY_R + 10, [[0, '#e3eef8'], [0.4, '#8397ae'], [1, '#232d3b']], C, C);
  ctx.fill();
  ctx.strokeStyle = '#1a222d'; ctx.lineWidth = 3; ctx.stroke();
  // Costuras.
  ctx.strokeStyle = 'rgba(20,28,40,0.7)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(C, C, BODY_R * 0.62, 0, TAU); ctx.stroke();
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * BODY_R * 0.62, C + Math.sin(a) * BODY_R * 0.62); ctx.lineTo(C + Math.cos(a) * BODY_R * 0.98, C + Math.sin(a) * BODY_R * 0.98); ctx.stroke(); }
  // Remaches.
  ctx.fillStyle = '#f6fbff';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.arc(C + Math.cos(a) * BODY_R * 0.8, C + Math.sin(a) * BODY_R * 0.8, 2.4, 0, TAU); ctx.fill(); }
  rim(ctx, BODY_R, 'rgba(255,255,255,0.7)');
  // Visor.
  ctx.fillStyle = '#0a0d12';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(C + 6, C - 9, 28, 18, 5) : ctx.rect(C + 6, C - 9, 28, 18);
  ctx.fill();
  glow(ctx, '#ff7a2f', 12, () => { ctx.fillStyle = '#ff9a4a'; ctx.fillRect(C + 10, C - 3, 22, 6); });
}

// ---------- jefes (no giran: se dibujan de frente) ----------
function coloso(ctx) {
  // Piedra oscura con grietas de lava.
  blobPath(ctx, BODY_R, { amp: 0.06, lobes: 5 });
  ctx.fillStyle = radial(ctx, C - 12, C - 16, 6, BODY_R + 10, [[0, '#6a4aa8'], [0.5, '#2c1a58'], [1, '#0a0418']], C, C);
  ctx.fill();
  glow(ctx, '#ff7a1a', 10, () => {
    ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pts of [[[-26, -4], [-14, 4], [-18, 16], [-6, 24]], [[24, -20], [14, -8], [22, 2], [12, 14]], [[-4, -28], [2, -16], [-6, -8]]]) {
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(C + x, C + y) : ctx.moveTo(C + x, C + y))); ctx.stroke();
    }
  });
  // Corona.
  ctx.fillStyle = '#d9b44a';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(C + i * 12 - 7, C - 34); ctx.lineTo(C + i * 12, C - 52 + Math.abs(i) * 4); ctx.lineTo(C + i * 12 + 7, C - 34); ctx.fill(); }
  rim(ctx, BODY_R, 'rgba(210,190,255,0.5)');
  // Ojos.
  for (const [x, y, r] of [[-16, -6, 7], [0, -2, 9], [16, -6, 7], [-8, 14, 5], [8, 14, 5]]) eye(ctx, C + x, C + y, r, r * 1.1, '#ff4a2e');
}

function reina(ctx) {
  // Alas.
  ctx.fillStyle = 'rgba(255,170,240,0.28)';
  ctx.strokeStyle = 'rgba(255,200,250,0.6)'; ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(C + s * 40, C - 4, 24, 40, s * 0.5, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // Abdomen y tórax.
  ctx.beginPath(); ctx.ellipse(C, C + 14, 24, 32, 0, 0, TAU);
  ctx.fillStyle = radial(ctx, C - 6, C + 4, 3, 40, [[0, '#ff8ad8'], [0.5, '#b0287f'], [1, '#3a0a30']], C, C + 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,8,50,0.6)'; ctx.lineWidth = 3;
  for (const y of [8, 18, 28]) { ctx.beginPath(); ctx.arc(C, C + y + 6, 20, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(C, C - 14, 20, 0, TAU);
  ctx.fillStyle = radial(ctx, C - 6, C - 20, 3, 28, [[0, '#ffa6e6'], [0.6, '#c43898'], [1, '#4a0c3c']], C, C - 14);
  ctx.fill();
  rim(ctx, 22, 'rgba(255,220,250,0.6)', Math.PI * 0.95, Math.PI * 1.7, 2.5);
  // Corona.
  ctx.fillStyle = '#ffd24a';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(C + i * 7 - 4, C - 30); ctx.lineTo(C + i * 7, C - 44 + Math.abs(i) * 3); ctx.lineTo(C + i * 7 + 4, C - 30); ctx.fill(); }
  eye(ctx, C - 8, C - 16, 5, 6, '#ffee66');
  eye(ctx, C + 8, C - 16, 5, 6, '#ffee66');
  eye(ctx, C, C - 6, 3, 3.5, '#ffee66', '#fff', 6);
}

function devorador(ctx) {
  // Tentáculos del vacío.
  glow(ctx, '#2affd0', 8, () => {
    ctx.strokeStyle = '#0c2a30'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * 34, C + Math.sin(a) * 34);
      ctx.quadraticCurveTo(C + Math.cos(a + 0.4) * 50, C + Math.sin(a + 0.4) * 50, C + Math.cos(a + 0.2) * 58, C + Math.sin(a + 0.2) * 58);
      ctx.stroke();
    }
  });
  ctx.beginPath(); ctx.arc(C, C, BODY_R, 0, TAU);
  ctx.fillStyle = radial(ctx, C - 12, C - 14, 4, BODY_R + 8, [[0, '#2a3a46'], [0.5, '#0c1218'], [1, '#020406']], C, C);
  ctx.fill();
  rim(ctx, BODY_R, 'rgba(110,255,230,0.5)');
  // Boca.
  ctx.beginPath(); ctx.ellipse(C, C + 8, 28, 20, 0, 0, TAU);
  ctx.fillStyle = '#05080b'; ctx.fill();
  glow(ctx, '#2affd0', 14, () => { ctx.fillStyle = '#2affd0'; ctx.beginPath(); ctx.ellipse(C, C + 12, 11, 8, 0, 0, TAU); ctx.fill(); });
  ctx.fillStyle = '#f2f6f4';
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.18 + (i / 8) * (Math.PI - 0.36);
    const x = C + Math.cos(a) * 26; const y = C + 8 + Math.sin(a) * 18;
    ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x, y + 10); ctx.lineTo(x + 3, y); ctx.fill();
    const a2 = -0.18 - (i / 8) * (Math.PI - 0.36) + Math.PI * 2;
    const x2 = C + Math.cos(a2) * 26; const y2 = C + 8 + Math.sin(a2) * 18;
    ctx.beginPath(); ctx.moveTo(x2 - 3, y2); ctx.lineTo(x2, y2 - 10); ctx.lineTo(x2 + 3, y2); ctx.fill();
  }
  eye(ctx, C - 17, C - 16, 6, 5, '#2affd0');
  eye(ctx, C + 17, C - 16, 6, 5, '#2affd0');
}

const DRAWERS = {
  sombra, corredor, bruto, enjambre, arquero, divisor: (c) => slime(c), cria: (c) => slime(c, { mini: true }), blindado,
  coloso, reina, devorador,
};
const BOSS_IDS = new Set(['coloso', 'reina', 'devorador']);

function whiteVersion(src) {
  const w = offscreen(SPRITE_SIZE, SPRITE_SIZE);
  w.ctx.drawImage(src.canvas, 0, 0);
  w.ctx.globalCompositeOperation = 'source-in';
  w.ctx.fillStyle = '#ffffff';
  w.ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return w.canvas;
}

// Devuelve { id: { img, white, rotates } } para todos los enemigos y jefes.
export function bakeSprites() {
  const out = {};
  for (const [id, fn] of Object.entries(DRAWERS)) {
    const c = offscreen(SPRITE_SIZE, SPRITE_SIZE);
    fn(c.ctx);
    out[id] = { img: c.canvas, white: whiteVersion(c), rotates: !BOSS_IDS.has(id) };
  }
  return out;
}
