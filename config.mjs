// Configuración de publicación: todo lo que cambia entre desarrollo y tiendas vive aquí.
// Nada de lo que hay en este archivo es secreto: las claves privadas (firma, cuentas) NO van en el repositorio.

export const RELEASE = {
  // Anuncios reales (AdMob) en Android e iOS. Mientras `enabled` sea false, las builds nativas no muestran anuncios.
  ads: {
    enabled: false,
    // Con true se usan los identificadores de prueba de Google. Pásalo a false solo con los IDs propios publicados.
    testMode: true,
    // Identificadores de unidad de anuncio. Los de abajo son los de PRUEBA oficiales de Google.
    ids: {
      android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
      ios: { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
    },
    // Público general (no infantil). Si algún día se marca como apto para niños, pasar a true.
    childDirected: false,
    maxAdContentRating: 'Teen',
  },
  // Compras dentro de la app (RevenueCat sobre Google Play Billing y StoreKit).
  iap: {
    enabled: false,
    // Claves PÚBLICAS del SDK de RevenueCat por plataforma (se rellenan al crear el proyecto allí).
    apiKeys: { android: '', ios: '' },
  },
  // Enlaces que las tiendas exigen visibles dentro de la app. Rellenar antes de publicar.
  links: { privacyPolicy: '', support: '' },
};
