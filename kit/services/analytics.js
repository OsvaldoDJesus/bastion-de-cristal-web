// Analítica de eventos con cola local. El sumidero (sink) es intercambiable:
// consola, memoria (pruebas), almacenamiento local o un SDK real más adelante.
// Nunca envía datos por red por sí misma.

export class Analytics {
  constructor({ sink, app = 'juego', version = '0.0.0', now = () => Date.now(), maxQueue = 500 } = {}) {
    this.sink = sink || new ConsoleSink();
    this.app = app;
    this.version = version;
    this.now = now;
    this.maxQueue = maxQueue;
    this.queue = [];
    this.sessionId = `${now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.sessionStart = now();
    this.counts = new Map();
  }

  track(event, props = {}) {
    const record = {
      event,
      props,
      t: this.now(),
      session: this.sessionId,
      app: this.app,
      v: this.version,
      sinceStart: Math.round((this.now() - this.sessionStart) / 1000),
    };
    this.queue.push(record);
    if (this.queue.length > this.maxQueue) this.queue.shift();
    this.counts.set(event, (this.counts.get(event) || 0) + 1);
    try { this.sink.write(record); } catch { /* el sumidero no debe romper el juego */ }
    return record;
  }

  count(event) { return this.counts.get(event) || 0; }

  flush() {
    if (this.sink.flush) this.sink.flush(this.queue);
    this.queue = [];
  }
}

export class ConsoleSink {
  constructor({ enabled = true } = {}) { this.enabled = enabled; }
  write(r) { if (this.enabled && typeof console !== 'undefined') console.debug('[analytics]', r.event, r.props); }
}

export class MemorySink {
  constructor() { this.records = []; }
  write(r) { this.records.push(r); }
  of(event) { return this.records.filter((r) => r.event === event); }
}

// Guarda los últimos N eventos en storage para depurar sesiones en dispositivo.
export class StorageSink {
  constructor({ storage, key = 'analytics.log', max = 300 } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.max = max;
  }
  write(r) {
    if (!this.storage) return;
    let arr = [];
    try { arr = JSON.parse(this.storage.getItem(this.key) || '[]'); } catch { arr = []; }
    arr.push(r);
    if (arr.length > this.max) arr = arr.slice(arr.length - this.max);
    try { this.storage.setItem(this.key, JSON.stringify(arr)); } catch { /* sin espacio */ }
  }
  read() {
    try { return JSON.parse(this.storage.getItem(this.key) || '[]'); } catch { return []; }
  }
}

// Nombres de evento estándar para comparar juegos entre sí.
export const Events = Object.freeze({
  SESSION_START: 'session_start',
  FIRST_ACTION: 'first_action',
  LEVEL_START: 'level_start',
  LEVEL_COMPLETE: 'level_complete',
  LEVEL_FAIL: 'level_fail',
  RETRY: 'retry',
  PURCHASE_OPEN: 'iap_open',
  PURCHASE_OK: 'iap_purchase',
  PURCHASE_CANCEL: 'iap_cancel',
  AD_REWARDED_REQUEST: 'ad_rewarded_request',
  AD_REWARDED_OK: 'ad_rewarded_ok',
  AD_REWARDED_SKIP: 'ad_rewarded_skip',
  AD_INTERSTITIAL: 'ad_interstitial',
  UNLOCK: 'unlock',
  PRESTIGE: 'prestige',
  ERA: 'era_unlock',
  OFFLINE: 'offline_collect',
  SHARE: 'share',
});
