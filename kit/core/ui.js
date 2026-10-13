// Interfaz DOM superpuesta al lienzo: botones, modales, avisos.
// Los juegos personalizan colores mediante variables CSS (--kit-*).

let stylesInjected = false;

export function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
  .kit-overlay{position:absolute;inset:0;pointer-events:none;font-family:var(--kit-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color:var(--kit-fg,#fff)}
  .kit-overlay *{box-sizing:border-box}
  .kit-overlay > *{pointer-events:auto}
  .kit-modal-back{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;pointer-events:auto;animation:kit-fade .18s ease-out;z-index:50}
  .kit-modal{background:var(--kit-panel,#1d1f2b);color:var(--kit-fg,#fff);border-radius:var(--kit-radius,18px);padding:20px 18px;width:min(88%,360px);box-shadow:0 18px 50px rgba(0,0,0,.45);text-align:center;animation:kit-pop .25s cubic-bezier(.2,1.4,.4,1);max-height:90%;overflow:auto}
  .kit-modal h2{margin:0 0 10px;font-size:1.3rem}
  .kit-modal p{margin:0 0 14px;line-height:1.4;opacity:.92}
  .kit-btn{appearance:none;border:0;border-radius:var(--kit-radius,14px);padding:12px 18px;font:inherit;font-weight:700;font-size:1rem;cursor:pointer;background:var(--kit-accent,#ff5d8f);color:var(--kit-accent-fg,#fff);box-shadow:0 4px 0 rgba(0,0,0,.25);transition:transform .08s;min-height:44px;min-width:44px}
  .kit-btn:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.25)}
  .kit-btn.secondary{background:var(--kit-muted,#3a3d4f);color:var(--kit-fg,#fff)}
  .kit-btn:disabled{opacity:.5;cursor:default}
  .kit-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px}
  .kit-toast{position:absolute;left:50%;bottom:14%;transform:translateX(-50%);background:rgba(20,20,30,.9);color:#fff;padding:10px 16px;border-radius:999px;font-weight:600;animation:kit-toast 2.2s ease forwards;pointer-events:none;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis;z-index:60}
  .kit-input{width:100%;padding:10px;border-radius:10px;border:2px solid var(--kit-muted,#3a3d4f);font:inherit;font-size:1.1rem;text-align:center;background:#fff;color:#222}
  .kit-ad{background:#111;border-radius:12px;padding:14px;margin:8px 0;min-height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#ddd;font-size:.95rem}
  .kit-ad .bar{height:8px;background:#333;border-radius:4px;width:100%;overflow:hidden}
  .kit-ad .bar > i{display:block;height:100%;background:var(--kit-accent,#ff5d8f);width:0;transition:width .25s linear}
  @keyframes kit-fade{from{opacity:0}to{opacity:1}}
  @keyframes kit-pop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes kit-toast{0%{opacity:0;transform:translate(-50%,20px)}12%{opacity:1;transform:translate(-50%,0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-10px)}}
  `;
  document.head.appendChild(style);
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export class UI {
  constructor({ surface, parent = document.body } = {}) {
    injectStyles();
    this.root = el('div', { class: 'kit-overlay' });
    parent.appendChild(this.root);
    if (surface) surface.alignOverlay(this.root);
    this.openModals = 0;
  }

  toast(message, { duration = 2200 } = {}) {
    const t = el('div', { class: 'kit-toast', text: message });
    this.root.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // Modal genérico. buttons: [{ label, value, secondary }]. Devuelve Promise<value>.
  modal({ title, body, buttons = [{ label: 'OK', value: true }], dismissible = false, content } = {}) {
    return new Promise((resolve) => {
      const box = el('div', { class: 'kit-modal', role: 'dialog', 'aria-modal': 'true' });
      if (title) box.appendChild(el('h2', { text: title }));
      if (body) box.appendChild(el('p', { text: body }));
      if (content) box.appendChild(content);
      const row = el('div', { class: 'kit-row' });
      const back = el('div', { class: 'kit-modal-back' }, box);
      const close = (v) => { back.remove(); this.openModals--; resolve(v); };
      for (const b of buttons) {
        row.appendChild(el('button', { class: `kit-btn${b.secondary ? ' secondary' : ''}`, text: b.label, onClick: () => close(b.value) }));
      }
      box.appendChild(row);
      if (dismissible) back.addEventListener('click', (e) => { if (e.target === back) close(null); });
      this.openModals++;
      this.root.appendChild(back);
    });
  }

  confirm(title, body, { ok = 'Sí', cancel = 'No' } = {}) {
    return this.modal({ title, body, buttons: [{ label: cancel, value: false, secondary: true }, { label: ok, value: true }] });
  }

  // Pide un texto; devuelve string o null.
  prompt(title, body, { placeholder = '', type = 'text', ok = 'Aceptar', cancel = 'Cancelar' } = {}) {
    const input = el('input', { class: 'kit-input', placeholder, type, inputmode: type === 'number' ? 'numeric' : 'text' });
    return this.modal({ title, body, content: input, buttons: [{ label: cancel, value: null, secondary: true }, { label: ok, value: true }] })
      .then((v) => (v ? input.value : null));
  }

  get busy() { return this.openModals > 0; }
}
