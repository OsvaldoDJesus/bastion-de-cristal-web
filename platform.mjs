// Plataforma en la que corre el juego y qué puede hacer en ella. Un único sitio decide qué existe en cada build:
//   web      navegador. En el servidor de desarrollo (localhost) anuncios y compras SIMULADOS; en la web publicada, ninguno
//   android  Capacitor en Google Play     ios  Capacitor en App Store
//   steam    Electron lanzado desde Steam (puente `bastionDesktop`)   desktop  Electron sin Steam
import { RELEASE } from './config.mjs';

export function detectPlatform(g = globalThis, release = RELEASE) {
  const cap = g.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const bridge = g.bastionDesktop || null;
  let id = 'web';
  if (native) id = cap.getPlatform();
  else if (bridge) id = bridge.steam ? 'steam' : 'desktop';
  const mobile = id === 'android' || id === 'ios';
  const host = g.location && g.location.hostname;
  const devServer = !native && !bridge && ['localhost', '127.0.0.1'].includes(host);
  return {
    id,
    native,
    mobile,
    desktop: !!bridge,
    steam: id === 'steam',
    // Servidor de desarrollo: solo en el navegador. Dentro de Capacitor el host también es "localhost",
    // pero es una build de producción (el bucle se pausa en segundo plano y se registra el service worker).
    devServer,
    store: { android: 'play', ios: 'appstore', steam: 'steam' }[id] || null,
    caps: {
      // Solo en el servidor de desarrollo. La web publicada no finge anuncios ni compras: sin proveedor real, no se ofrecen.
      simulatedMonetization: id === 'web' && devServer,
      realAds: mobile && !!release.ads.enabled,
      realIap: mobile && !!release.iap.enabled,
      achievements: id === 'steam',
      fileSave: !!bridge,
      backButton: id === 'android',
      quit: !!bridge,
    },
  };
}

export const platform = detectPlatform();

// Plugins nativos de Capacitor. El juego no usa empaquetador, así que el runtime de Capacitor se incluye como archivo
// (src/vendor/capacitor-core.js) y los plugins se registran por nombre: `registerPlugin('AdMob')` enruta a la
// implementación nativa si el plugin está en el proyecto Android/iOS. Fuera de una app nativa devuelve null.
let nativeLoad = null;
export function loadNative(g = globalThis, importer = (p) => import(p)) {
  if (!detectPlatform(g).native) return Promise.resolve(null);
  if (!nativeLoad) {
    nativeLoad = importer('./vendor/capacitor-core.js').then((core) => {
      const get = (name) => {
        try { return core.Capacitor.isPluginAvailable(name) ? core.registerPlugin(name) : null; } catch { return null; }
      };
      return {
        core,
        App: get('App'),
        AdMob: get('AdMob'),
        Purchases: get('Purchases'),
        SplashScreen: get('SplashScreen'),
        SystemBars: core.SystemBars || null,
      };
    }).catch(() => null);
  }
  return nativeLoad;
}

// Puente con el escritorio (Electron): copia del guardado en archivo (Steam Auto-Cloud) y logros de Steam.
export function desktopBridge(g = globalThis) { return g.bastionDesktop || null; }
