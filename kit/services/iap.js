// Compras dentro de la app con catálogo, derechos (entitlements) y proveedores intercambiables.
// El servicio no conoce precios reales: el catálogo declara etiquetas de referencia y el
// proveedor nativo (tienda) es la fuente de verdad cuando exista.

import { Events } from './analytics.js';

export class IapService {
  constructor({ provider, catalog = [], analytics, entitlements = {}, onGrant, parentalGate } = {}) {
    this.provider = provider || new NullIapProvider();
    this.catalog = catalog; // [{ sku, title, desc, priceLabel, type: 'consumable'|'nonconsumable', grant: {...} }]
    this.analytics = analytics;
    this.entitlements = { ...entitlements }; // sku -> true | cantidad
    this.onGrant = onGrant || (() => {});
    this.parentalGate = parentalGate; // async () => boolean
  }

  product(sku) { return this.catalog.find((p) => p.sku === sku); }
  owns(sku) { return !!this.entitlements[sku]; }

  // Devuelve { ok, sku, reason }.
  async purchase(sku) {
    const product = this.product(sku);
    if (!product) return { ok: false, sku, reason: 'unknown_sku' };
    if (product.type === 'nonconsumable' && this.owns(sku)) return { ok: false, sku, reason: 'already_owned' };
    this.analytics?.track(Events.PURCHASE_OPEN, { sku });
    if (this.parentalGate) {
      const allowed = await this.parentalGate();
      if (!allowed) { this.analytics?.track(Events.PURCHASE_CANCEL, { sku, reason: 'parental_gate' }); return { ok: false, sku, reason: 'parental_gate' }; }
    }
    const res = await this.provider.purchase(product);
    if (!res?.ok) {
      this.analytics?.track(Events.PURCHASE_CANCEL, { sku, reason: res?.reason || 'cancel' });
      return { ok: false, sku, reason: res?.reason || 'cancel' };
    }
    this._grant(product);
    this.analytics?.track(Events.PURCHASE_OK, { sku, type: product.type });
    return { ok: true, sku, reason: 'ok' };
  }

  async restore() {
    if (!this.provider.restore) return [];
    const skus = await this.provider.restore();
    const restored = [];
    for (const sku of skus) {
      const p = this.product(sku);
      if (p && p.type === 'nonconsumable' && !this.owns(sku)) { this._grant(p); restored.push(sku); }
    }
    return restored;
  }

  _grant(product) {
    if (product.type === 'nonconsumable') this.entitlements[product.sku] = true;
    else this.entitlements[product.sku] = (this.entitlements[product.sku] || 0) + 1;
    this.onGrant(product);
  }

  snapshot() { return { ...this.entitlements }; }
}

export class NullIapProvider {
  async purchase() { return { ok: false, reason: 'unavailable' }; }
  async restore() { return []; }
}

// Simula la hoja de compra de la tienda con un modal de confirmación. Sin dinero real.
export class MockIapProvider {
  constructor({ ui, storageKey = 'iap.mock', storage } = {}) {
    this.ui = ui;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.storageKey = storageKey;
  }
  async purchase(product) {
    if (!this.ui) return { ok: true };
    const ok = await this.ui.confirm(`Comprar ${product.title}`, `${product.desc}\n\nPrecio de referencia: ${product.priceLabel}. (Simulación: no se cobra nada.)`, { ok: 'Comprar', cancel: 'Cancelar' });
    if (ok && product.type === 'nonconsumable') this._remember(product.sku);
    return { ok: !!ok, reason: ok ? 'ok' : 'cancel' };
  }
  async restore() {
    try { return JSON.parse(this.storage?.getItem(this.storageKey) || '[]'); } catch { return []; }
  }
  _remember(sku) {
    try {
      const arr = JSON.parse(this.storage?.getItem(this.storageKey) || '[]');
      if (!arr.includes(sku)) arr.push(sku);
      this.storage?.setItem(this.storageKey, JSON.stringify(arr));
    } catch { /* ignorar */ }
  }
}

// Esqueleto para tienda real (Capacitor + Google Play Billing / StoreKit). No conectado.
export class CapacitorIapProvider {
  constructor({ plugin } = {}) { this.plugin = plugin; }
  async purchase() { throw new Error('CapacitorIapProvider no conectado; ver docs/monetizacion.md'); }
  async restore() { throw new Error('CapacitorIapProvider no conectado'); }
}
