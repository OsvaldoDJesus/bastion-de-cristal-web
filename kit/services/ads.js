// Servicio de anuncios con límites de frecuencia y proveedores intercambiables.
// En web se usa MockAdsProvider (simula un anuncio con cuenta atrás).
// En Capacitor se conecta un proveedor real (ver docs/monetizacion.md); la lógica
// de topes, "sin anuncios" y métricas vive aquí y no cambia entre proveedores.

import { Events } from './analytics.js';

export class AdsService {
  constructor({ provider, analytics, now = () => Date.now(), caps = {}, childDirected = false } = {}) {
    this.provider = provider || new NullAdsProvider();
    this.analytics = analytics;
    this.now = now;
    this.childDirected = childDirected;
    this.caps = {
      interstitialMinIntervalSec: 120,   // tiempo mínimo entre intersticiales
      interstitialMinActions: 3,         // acciones "naturales" (fin de nivel, etc.) entre intersticiales
      interstitialGraceSec: 180,         // nada de intersticiales en los primeros minutos de la sesión
      rewardedMinIntervalSec: 5,
      ...caps,
    };
    this.noAds = false;
    this.sessionStart = now();
    this.lastInterstitial = 0;
    this.actionsSinceInterstitial = 0;
    this.lastRewarded = -Infinity;
    this.stats = { rewardedOk: 0, rewardedSkip: 0, interstitials: 0 };
    if (this.provider.init) this.provider.init({ childDirected });
  }

  setNoAds(v) { this.noAds = !!v; }

  get rewardedAvailable() {
    return this.provider.rewardedAvailable ? !!this.provider.rewardedAvailable() : true;
  }

  // Cuenta un punto natural de pausa (fin de nivel, cambio de era...).
  // Devuelve true si se mostró un intersticial.
  async maybeInterstitial(placement = 'natural_break') {
    this.actionsSinceInterstitial++;
    if (this.noAds) return false;
    const now = this.now();
    const sinceStart = (now - this.sessionStart) / 1000;
    const sinceLast = (now - (this.lastInterstitial || this.sessionStart)) / 1000;
    if (sinceStart < this.caps.interstitialGraceSec) return false;
    if (sinceLast < this.caps.interstitialMinIntervalSec) return false;
    if (this.actionsSinceInterstitial < this.caps.interstitialMinActions) return false;
    if (!this.provider.showInterstitial) return false;
    const shown = await this.provider.showInterstitial({ placement });
    if (shown) {
      this.lastInterstitial = now;
      this.actionsSinceInterstitial = 0;
      this.stats.interstitials++;
      this.analytics?.track(Events.AD_INTERSTITIAL, { placement });
    }
    return shown;
  }

  // Anuncio con recompensa. Devuelve { rewarded: boolean, reason }.
  async showRewarded(placement = 'reward') {
    const now = this.now();
    if ((now - this.lastRewarded) / 1000 < this.caps.rewardedMinIntervalSec) {
      return { rewarded: false, reason: 'too_soon' };
    }
    if (!this.provider.showRewarded) return { rewarded: false, reason: 'unavailable' };
    this.analytics?.track(Events.AD_REWARDED_REQUEST, { placement });
    this.lastRewarded = now;
    const result = await this.provider.showRewarded({ placement });
    if (result?.rewarded) {
      this.stats.rewardedOk++;
      this.analytics?.track(Events.AD_REWARDED_OK, { placement });
      return { rewarded: true, reason: 'ok' };
    }
    this.stats.rewardedSkip++;
    this.analytics?.track(Events.AD_REWARDED_SKIP, { placement, reason: result?.reason || 'skip' });
    return { rewarded: false, reason: result?.reason || 'skip' };
  }
}

// Proveedor nulo: no hay anuncios disponibles (útil en pruebas y en modo "sin anuncios").
export class NullAdsProvider {
  rewardedAvailable() { return false; }
  async showInterstitial() { return false; }
  async showRewarded() { return { rewarded: false, reason: 'unavailable' }; }
}

// Proveedor simulado para web/desarrollo: muestra un modal con cuenta atrás.
// La recompensa solo se concede si el usuario espera hasta el final.
export class MockAdsProvider {
  constructor({ ui, rewardedSeconds = 5, interstitialSeconds = 3, label = 'Anuncio de prueba' } = {}) {
    this.ui = ui;
    this.rewardedSeconds = rewardedSeconds;
    this.interstitialSeconds = interstitialSeconds;
    this.label = label;
  }

  rewardedAvailable() { return true; }

  async showInterstitial({ placement } = {}) {
    await this._show({ seconds: this.interstitialSeconds, title: this.label, placement, allowSkipAfter: 1 });
    return true;
  }

  async showRewarded({ placement } = {}) {
    const completed = await this._show({ seconds: this.rewardedSeconds, title: `${this.label} (recompensa)`, placement, allowSkipAfter: 0.5, isRewarded: true });
    return { rewarded: completed, reason: completed ? 'ok' : 'skip' };
  }

  _show({ seconds, title, placement, allowSkipAfter, isRewarded }) {
    if (!this.ui) return Promise.resolve(true);
    return new Promise((resolve) => {
      const bar = document.createElement('i');
      const barWrap = document.createElement('div');
      barWrap.className = 'bar';
      barWrap.appendChild(bar);
      const text = document.createElement('div');
      text.textContent = `Simulación de anuncio · ${placement || ''}`;
      const timer = document.createElement('div');
      timer.style.fontSize = '1.6rem';
      timer.style.fontWeight = '700';
      const box = document.createElement('div');
      box.className = 'kit-ad';
      box.append(text, timer, barWrap);
      const btn = document.createElement('button');
      btn.className = 'kit-btn secondary';
      btn.textContent = isRewarded ? 'Cerrar (sin recompensa)' : 'Cerrar';
      btn.disabled = true;
      const back = document.createElement('div');
      back.className = 'kit-modal-back';
      const modal = document.createElement('div');
      modal.className = 'kit-modal';
      const h = document.createElement('h2');
      h.textContent = title;
      modal.append(h, box, btn);
      back.appendChild(modal);
      this.ui.root.appendChild(back);
      this.ui.openModals++;
      const start = performance.now();
      let done = false;
      const finish = (completed) => {
        if (done) return;
        done = true;
        clearInterval(iv);
        back.remove();
        this.ui.openModals--;
        resolve(completed);
      };
      const iv = setInterval(() => {
        const t = (performance.now() - start) / 1000;
        const left = Math.max(0, seconds - t);
        timer.textContent = `${Math.ceil(left)} s`;
        bar.style.width = `${Math.min(100, (t / seconds) * 100)}%`;
        if (t >= allowSkipAfter) btn.disabled = false;
        if (left <= 0) {
          if (isRewarded) {
            btn.textContent = 'Recibir recompensa';
            btn.className = 'kit-btn';
            btn.onclick = () => finish(true);
            clearInterval(iv);
          } else finish(true);
        }
      }, 100);
      btn.onclick = () => finish(false);
    });
  }
}

// Esqueleto para un proveedor nativo (Capacitor + AdMob u otro). No está conectado:
// lanza un error claro para que nadie crea que ya hay anuncios reales.
export class CapacitorAdsProvider {
  constructor({ plugin, ids = {} } = {}) {
    this.plugin = plugin;
    this.ids = ids; // { rewarded, interstitial }
  }
  init({ childDirected } = {}) {
    this.childDirected = childDirected;
    if (!this.plugin) throw new Error('CapacitorAdsProvider: falta el plugin nativo; ver docs/monetizacion.md');
  }
  rewardedAvailable() { return false; }
  async showInterstitial() { throw new Error('CapacitorAdsProvider no conectado'); }
  async showRewarded() { throw new Error('CapacitorAdsProvider no conectado'); }
}
