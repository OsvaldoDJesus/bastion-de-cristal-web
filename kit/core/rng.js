// Generador pseudoaleatorio con semilla (mulberry32). Reproducible para retos diarios y pruebas.

export class Rng {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    let t = (this.state += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Entero en [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Elige por pesos: items = [{ w: 3, ... }, ...]
  weighted(items, weightKey = 'w') {
    let total = 0;
    for (const it of items) total += it[weightKey] || 0;
    let r = this.next() * total;
    for (const it of items) {
      r -= it[weightKey] || 0;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// Hash determinista de cadena (FNV-1a) para semillas como "2026-10-07".
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailySeed(date = new Date()) {
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return { key, seed: hashString(key) };
}
