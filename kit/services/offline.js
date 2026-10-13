// Cálculo de progreso fuera de línea para juegos idle. Función pura.
// Devuelve segundos efectivos (con tope), si se aplicó el tope y el total ganado.

import { Big } from '../core/bignum.js';

export function computeOffline({ lastSeen, now, maxHours = 4, ratePerSec = 0, efficiency = 1, minSeconds = 30 }) {
  if (typeof lastSeen !== 'number' || typeof now !== 'number' || now <= lastSeen) return { seconds: 0, capped: false, earned: Big.ZERO, rawSeconds: 0 };
  const rawSeconds = Math.floor((now - lastSeen) / 1000);
  if (rawSeconds < minSeconds) return { seconds: 0, capped: false, earned: Big.ZERO, rawSeconds };
  const cap = Math.floor(maxHours * 3600);
  const seconds = Math.min(rawSeconds, cap);
  const earned = Big.from(ratePerSec).mul(seconds).mul(efficiency);
  return { seconds, capped: rawSeconds > cap, earned, rawSeconds };
}

export function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
