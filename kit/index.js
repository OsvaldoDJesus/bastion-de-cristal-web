// Punto de entrada del kit. Los juegos importan desde './kit/index.js' (copia sincronizada).
export const KIT_VERSION = '0.2.0';

export { GameLoop } from './core/loop.js';
export { SceneManager } from './core/scenes.js';
export { createCanvas, offscreen } from './core/canvas.js';
export { Pointer, hit, hitCircle } from './core/input.js';
export { SaveStore, MemoryStorage } from './core/save.js';
export { Rng, hashString, dailySeed } from './core/rng.js';
export { Big, big, geometricCost, maxAffordable } from './core/bignum.js';
export { Sfx } from './core/audio.js';
export { Particles, FloatingTexts, Shake, drawStar, drawHeart } from './core/particles.js';
export { Ease, Tweens, Smooth, lerp, clamp, clamp01 } from './core/tween.js';
export { UI, el, injectStyles } from './core/ui.js';
export { roundRect, fillRoundRect, text, measure, Button, progressBar, ScrollList, Tabs } from './core/widgets.js';
export { Analytics, ConsoleSink, MemorySink, StorageSink, Events } from './services/analytics.js';
export { AdsService, MockAdsProvider, NullAdsProvider, CapacitorAdsProvider } from './services/ads.js';
export { IapService, MockIapProvider, NullIapProvider, CapacitorIapProvider } from './services/iap.js';
export { createParentalGate } from './services/parental-gate.js';
export { computeOffline, formatDuration } from './services/offline.js';
