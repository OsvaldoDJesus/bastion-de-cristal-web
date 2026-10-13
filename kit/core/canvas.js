// Lienzo con resolución lógica fija y escalado responsivo (letterbox).
// Los juegos dibujan siempre en coordenadas lógicas (p. ej. 480x800);
// aquí se resuelve DPR, tamaño CSS y la conversión de coordenadas del puntero.

// `width`/`height` definen la resolución lógica y por tanto la orientación (retrato o apaisado).
// `maxDpr` limita la densidad de píxeles; puede cambiarse en caliente con `setMaxDpr` (calidad
// dinámica: los juegos se ven nítidos a cualquier resolución, pero 4K cuesta relleno).
export function createCanvas({ parent = document.body, width = 480, height = 800, maxDpr = 2, background = '#000' } = {}) {
  let dprCap = maxDpr;
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';
  canvas.style.background = background;
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  const view = { width, height, scale: 1, offsetX: 0, offsetY: 0, cssWidth: 0, cssHeight: 0, dpr: 1 };
  const listeners = new Set();

  function resize() {
    const vw = parent === document.body ? window.innerWidth : parent.clientWidth;
    const vh = parent === document.body ? window.innerHeight : parent.clientHeight;
    const scale = Math.min(vw / width, vh / height);
    const cssW = Math.floor(width * scale);
    const cssH = Math.floor(height * scale);
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${Math.floor((vw - cssW) / 2)}px`;
    canvas.style.top = `${Math.floor((vh - cssH) / 2)}px`;
    view.scale = scale;
    view.cssWidth = cssW;
    view.cssHeight = cssH;
    view.dpr = dpr;
    view.offsetX = Math.floor((vw - cssW) / 2);
    view.offsetY = Math.floor((vh - cssH) / 2);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.imageSmoothingEnabled = true;
    for (const fn of listeners) fn(view);
  }

  // Convierte coordenadas de cliente (evento) a coordenadas lógicas del juego.
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  return {
    canvas,
    ctx,
    view,
    width,
    height,
    resize,
    setMaxDpr(n) { dprCap = Math.max(1, n); resize(); },
    get maxDpr() { return dprCap; },
    toLogical,
    onResize(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Posiciona un elemento DOM (overlay) exactamente sobre el lienzo.
    alignOverlay(el) {
      const apply = () => {
        el.style.position = 'absolute';
        el.style.left = `${view.offsetX}px`;
        el.style.top = `${view.offsetY}px`;
        el.style.width = `${view.cssWidth}px`;
        el.style.height = `${view.cssHeight}px`;
        el.style.setProperty('--scale', String(view.scale));
      };
      apply();
      return this.onResize(apply);
    },
  };
}

// Crea un lienzo fuera de pantalla (capas de pintura, cachés de sprites).
export function offscreen(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return { canvas: c, ctx: c.getContext('2d') };
}
