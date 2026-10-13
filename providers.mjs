// Proveedores reales de anuncios (AdMob) y compras (RevenueCat) para las builds nativas, con la misma interfaz que los
// simulados del kit. Reciben el plugin ya resuelto (ver platform.loadNative), así que se prueban con plugins falsos.
// Estado: probado contra plugins simulados en Node; PENDIENTE probar en dispositivo con cuentas de prueba de cada tienda.
import { MockAdsProvider, NullAdsProvider, MockIapProvider, NullIapProvider } from './kit/index.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REWARD_EVENTS = { rewarded: 'onRewardedVideoAdReward', dismissed: 'onRewardedVideoAdDismissed', failed: 'onRewardedVideoAdFailedToShow' };
const INTERSTITIAL_EVENTS = { dismissed: 'interstitialAdDismissed', failed: 'interstitialAdFailedToShow' };

// Espera un evento del plugin una sola vez. Devuelve { promise, cancel }: la promesa se resuelve con { ok } y
// el oyente se retira siempre (al llegar el evento, al cancelar o al agotar el tiempo).
function once(plugin, event, ms) {
  let resolveFn;
  let handle = null;
  let done = false;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const finish = (v) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (handle) Promise.resolve(handle.remove()).catch(() => {});
    resolveFn(v);
  };
  const timer = setTimeout(() => finish({ ok: false, timeout: true }), ms);
  Promise.resolve(plugin.addListener(event, (data) => finish({ ok: true, data })))
    .then((h) => { handle = h; if (done && h) Promise.resolve(h.remove()).catch(() => {}); })
    .catch(() => finish({ ok: false }));
  return { promise, cancel: () => finish({ ok: false, cancelled: true }) };
}

export class AdMobAdsProvider {
  constructor({ plugin, ids, testMode = true, platformId = 'android', childDirected = false, maxAdContentRating = 'Teen', trackingPrompt = platformId === 'ios', adTimeoutMs = 180000, log = () => {} } = {}) {
    this.plugin = plugin;
    this.ids = ids;
    this.testMode = testMode;
    this.platformId = platformId;
    this.childDirected = childDirected;
    this.maxAdContentRating = maxAdContentRating;
    this.trackingPrompt = trackingPrompt;
    this.adTimeoutMs = adTimeoutMs;
    this.log = log;
    this.rewardedReady = false;
    this.interstitialReady = false;
    this.ready = null;
    this.canRequestAds = true;
  }

  // AdsService lo llama sin esperar: la inicialización continúa en segundo plano y nunca lanza.
  init({ childDirected } = {}) {
    if (childDirected !== undefined) this.childDirected = childDirected;
    this.ready = this._init().catch((e) => { this.log('admob init', e); this.canRequestAds = false; });
    return this.ready;
  }

  async _init() {
    const p = this.plugin;
    // 1) Consentimiento (UMP): obligatorio en el EEE y Reino Unido para anuncios personalizados.
    try {
      const info = await p.requestConsentInfo({ tagForUnderAgeOfConsent: false });
      if (info.status === 'REQUIRED' && info.isConsentFormAvailable) await p.showConsentForm();
      const after = await p.requestConsentInfo({ tagForUnderAgeOfConsent: false });
      this.canRequestAds = after.canRequestAds !== false;
    } catch (e) { this.log('consent', e); }
    // 2) iOS: transparencia de seguimiento (ATT) antes de iniciar el SDK.
    if (this.trackingPrompt) {
      try {
        const s = await p.trackingAuthorizationStatus();
        if (s && s.status === 'notDetermined') await p.requestTrackingAuthorization();
      } catch (e) { this.log('att', e); }
    }
    if (!this.canRequestAds) return;
    await p.initialize({ initializeForTesting: this.testMode, tagForChildDirectedTreatment: this.childDirected, maxAdContentRating: this.maxAdContentRating });
    await Promise.all([this._loadRewarded(), this._loadInterstitial()]);
  }

  get unit() { return this.ids[this.platformId]; }

  async _loadRewarded() {
    this.rewardedReady = false;
    try { await this.plugin.prepareRewardVideoAd({ adId: this.unit.rewarded, isTesting: this.testMode }); this.rewardedReady = true; } catch (e) { this.log('rewarded load', e); }
  }

  async _loadInterstitial() {
    this.interstitialReady = false;
    try { await this.plugin.prepareInterstitial({ adId: this.unit.interstitial, isTesting: this.testMode }); this.interstitialReady = true; } catch (e) { this.log('interstitial load', e); }
  }

  rewardedAvailable() { return this.canRequestAds && this.rewardedReady; }

  async showInterstitial() {
    if (!this.canRequestAds || !this.interstitialReady) { this._loadInterstitial(); return false; }
    this.interstitialReady = false;
    const T = this.adTimeoutMs;
    const dismissed = once(this.plugin, INTERSTITIAL_EVENTS.dismissed, T);
    const failed = once(this.plugin, INTERSTITIAL_EVENTS.failed, T);
    const outcome = new Promise((resolve) => {
      dismissed.promise.then(() => resolve('dismissed'));
      failed.promise.then((r) => { if (r.ok) resolve('failed'); });
      Promise.resolve(this.plugin.showInterstitial()).catch(() => resolve('error'));
    });
    const how = await outcome;
    dismissed.cancel(); failed.cancel();
    this._loadInterstitial();
    return how === 'dismissed';
  }

  async showRewarded() {
    if (!this.canRequestAds) return { rewarded: false, reason: 'unavailable' };
    if (!this.rewardedReady) await this._loadRewarded();
    if (!this.rewardedReady) return { rewarded: false, reason: 'not_ready' };
    this.rewardedReady = false;
    const T = this.adTimeoutMs;
    let rewarded = false;
    const earned = once(this.plugin, REWARD_EVENTS.rewarded, T);
    earned.promise.then((r) => { if (r.ok) rewarded = true; });
    const dismissed = once(this.plugin, REWARD_EVENTS.dismissed, T);
    const failed = once(this.plugin, REWARD_EVENTS.failed, T);
    const outcome = new Promise((resolve) => {
      dismissed.promise.then(() => resolve('dismissed'));
      failed.promise.then((r) => { if (r.ok) resolve('failed'); });
      // En Android la llamada se resuelve con la recompensa cuando el usuario la gana.
      Promise.resolve(this.plugin.showRewardVideoAd()).then((item) => { if (item) rewarded = true; }, () => resolve('error'));
    });
    const how = await outcome;
    await wait(20); // el evento de recompensa puede llegar justo al cerrar
    earned.cancel(); dismissed.cancel(); failed.cancel();
    this._loadRewarded();
    if (how === 'error' || how === 'failed') return { rewarded: false, reason: how };
    return { rewarded, reason: rewarded ? 'ok' : 'skip' };
  }
}

export class RevenueCatIapProvider {
  constructor({ plugin, apiKey, log = () => {} } = {}) {
    this.plugin = plugin;
    this.apiKey = apiKey;
    this.log = log;
    this.ready = null;
    this.products = new Map();
  }

  configure() {
    if (!this.ready) this.ready = Promise.resolve(this.plugin.configure({ apiKey: this.apiKey })).then(() => true).catch((e) => { this.log('rc configure', e); return false; });
    return this.ready;
  }

  async _product(sku) {
    if (this.products.has(sku)) return this.products.get(sku);
    const { products } = await this.plugin.getProducts({ productIdentifiers: [sku], type: 'NON_SUBSCRIPTION' });
    const p = products && products[0];
    if (p) this.products.set(sku, p);
    return p || null;
  }

  // Sustituye las etiquetas de precio de referencia por las localizadas de la tienda (requisito: mostrar el precio real).
  async decorate(catalog) {
    if (!(await this.configure())) return catalog;
    for (const item of catalog) {
      try { const p = await this._product(item.sku); if (p && p.priceString) item.priceLabel = p.priceString; } catch (e) { this.log('rc price', e); }
    }
    return catalog;
  }

  async purchase(product) {
    if (!(await this.configure())) return { ok: false, reason: 'unavailable' };
    try {
      const p = await this._product(product.sku);
      if (!p) return { ok: false, reason: 'unavailable' };
      await this.plugin.purchaseStoreProduct({ product: p });
      return { ok: true, reason: 'ok' };
    } catch (e) {
      return { ok: false, reason: e && e.userCancelled ? 'cancel' : 'error' };
    }
  }

  async restore() {
    if (!(await this.configure())) return [];
    try {
      const { customerInfo } = await this.plugin.restorePurchases();
      return (customerInfo && customerInfo.allPurchasedProductIdentifiers) || [];
    } catch (e) { this.log('rc restore', e); return []; }
  }
}

// ---------- fábricas: eligen el proveedor según plataforma, configuración y plugins disponibles ----------
export function createAdsProvider({ platform, release, native, ui, log }) {
  if (platform.caps.simulatedMonetization) return new MockAdsProvider({ ui, rewardedSeconds: 5, interstitialSeconds: 3 });
  if (platform.caps.realAds && native && native.AdMob) {
    return new AdMobAdsProvider({
      plugin: native.AdMob, ids: release.ads.ids, testMode: release.ads.testMode, platformId: platform.id,
      childDirected: release.ads.childDirected, maxAdContentRating: release.ads.maxAdContentRating, log,
    });
  }
  return new NullAdsProvider(); // Steam, escritorio y builds nativas sin anuncios activados: no hay anuncios.
}

export function createIapProvider({ platform, release, native, ui, log }) {
  if (platform.caps.simulatedMonetization) return new MockIapProvider({ ui });
  if (iapAvailable(platform, release, native)) return new RevenueCatIapProvider({ plugin: native.Purchases, apiKey: release.iap.apiKeys[platform.id], log });
  return new NullIapProvider();
}

// ¿Se pueden ofrecer compras en esta build? (la interfaz oculta la tienda de pago si no.)
export function iapAvailable(platform, release, native) {
  if (platform.caps.simulatedMonetization) return true;
  return !!(platform.caps.realIap && native && native.Purchases && release.iap.apiKeys[platform.id]);
}
