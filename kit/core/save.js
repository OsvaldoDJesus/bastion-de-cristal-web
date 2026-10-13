// Guardado versionado con migraciones, validación y respaldo de archivos corruptos.
// `storage` es inyectable (localStorage por defecto) para poder probar sin navegador.

export class SaveStore {
  constructor({ key, version = 1, defaults, migrations = {}, validate, storage, debounceMs = 400, now } = {}) {
    if (!key) throw new Error('SaveStore requiere key');
    this.key = key;
    this.version = version;
    this.defaults = defaults || (() => ({}));
    this.migrations = migrations; // { 2: (data) => data, 3: (data) => data }
    this.validate = validate || (() => true);
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : new MemoryStorage());
    this.debounceMs = debounceMs;
    this.now = now || (() => Date.now());
    this._timer = null;
    this._pending = null;
    this.lastError = null;
  }

  // Devuelve { data, fresh, migratedFrom, recovered }.
  load() {
    const raw = this.storage.getItem(this.key);
    if (!raw) return { data: this._fresh(), fresh: true };
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch (err) {
      this._quarantine(raw, 'json');
      this.lastError = err;
      return { data: this._fresh(), fresh: true, recovered: true };
    }
    if (!envelope || typeof envelope !== 'object' || typeof envelope.v !== 'number' || !envelope.d) {
      this._quarantine(raw, 'envelope');
      return { data: this._fresh(), fresh: true, recovered: true };
    }
    let data = envelope.d;
    const from = envelope.v;
    if (from > this.version) {
      // Archivo de una versión futura: se conserva y se arranca limpio.
      this._quarantine(raw, 'future');
      return { data: this._fresh(), fresh: true, recovered: true };
    }
    for (let v = from + 1; v <= this.version; v++) {
      const mig = this.migrations[v];
      if (typeof mig === 'function') {
        try {
          data = mig(data) ?? data;
        } catch (err) {
          this._quarantine(raw, `migration-${v}`);
          this.lastError = err;
          return { data: this._fresh(), fresh: true, recovered: true };
        }
      }
    }
    if (!this.validate(data)) {
      this._quarantine(raw, 'validate');
      return { data: this._fresh(), fresh: true, recovered: true };
    }
    return { data, fresh: false, migratedFrom: from !== this.version ? from : undefined };
  }

  save(data) {
    this._pending = data;
    if (this.debounceMs <= 0) return this.flush();
    if (this._timer) return;
    this._timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._pending == null) return false;
    const envelope = { v: this.version, t: this.now(), d: this._pending };
    try {
      this.storage.setItem(this.key, JSON.stringify(envelope));
      this._pending = null;
      return true;
    } catch (err) {
      this.lastError = err;
      return false;
    }
  }

  exportJSON(data) {
    return JSON.stringify({ v: this.version, t: this.now(), d: data, app: this.key }, null, 2);
  }

  // Importa un respaldo exportado; devuelve { ok, data | error }.
  importJSON(text) {
    try {
      const env = JSON.parse(text);
      if (!env || typeof env.v !== 'number' || !env.d) return { ok: false, error: 'formato' };
      if (env.app && env.app !== this.key) return { ok: false, error: 'otra-app' };
      if (env.v > this.version) return { ok: false, error: 'version-futura' };
      let data = env.d;
      for (let v = env.v + 1; v <= this.version; v++) {
        const mig = this.migrations[v];
        if (mig) data = mig(data) ?? data;
      }
      if (!this.validate(data)) return { ok: false, error: 'invalido' };
      return { ok: true, data };
    } catch {
      return { ok: false, error: 'json' };
    }
  }

  clear() {
    this.storage.removeItem(this.key);
  }

  _fresh() {
    return typeof this.defaults === 'function' ? this.defaults() : structuredClone(this.defaults);
  }

  _quarantine(raw, reason) {
    try {
      this.storage.setItem(`${this.key}.corrupt`, JSON.stringify({ reason, t: this.now(), raw }));
    } catch { /* sin espacio: se descarta el respaldo */ }
  }
}

export class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  get length() { return this.map.size; }
}
