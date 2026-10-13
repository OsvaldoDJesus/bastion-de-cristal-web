// Números grandes para economías incrementales de escala "infinita".
// Representación mantisa/exponente en base 10 (m en [1,10), e entero), inmutable.
// Precisión de double (~15 dígitos) pero sin tope de magnitud práctico (hasta e±9e15).

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];

export class Big {
  constructor(m = 0, e = 0) {
    if (m === 0 || !Number.isFinite(m)) { this.m = 0; this.e = 0; return; }
    const sign = m < 0 ? -1 : 1;
    let am = Math.abs(m);
    const shift = Math.floor(Math.log10(am));
    // Multiplicar por potencias enteras evita el ruido de dividir por 0.1, 0.01...
    am = shift >= 0 ? am / 10 ** shift : am * 10 ** -shift;
    e += shift;
    if (am >= 10) { am /= 10; e += 1; } else if (am < 1) { am *= 10; e -= 1; }
    // Recorta el ruido de coma flotante a 15 cifras significativas.
    am = parseFloat(am.toPrecision(15));
    if (am >= 10) { am /= 10; e += 1; }
    this.m = sign * am;
    this.e = e;
  }

  static from(v) {
    if (v instanceof Big) return v;
    if (typeof v === 'number') return new Big(v, 0);
    if (typeof v === 'string') {
      const mt = /^(-?\d+(?:\.\d+)?)e(-?\d+)$/i.exec(v.trim());
      if (mt) return new Big(parseFloat(mt[1]), parseInt(mt[2], 10));
      return new Big(parseFloat(v), 0);
    }
    if (v && typeof v === 'object' && 'm' in v && 'e' in v) return new Big(v.m, v.e);
    return Big.ZERO;
  }

  isZero() { return this.m === 0; }
  sign() { return this.m < 0 ? -1 : this.m > 0 ? 1 : 0; }

  add(o) {
    o = Big.from(o);
    if (this.isZero()) return o;
    if (o.isZero()) return this;
    const d = this.e - o.e;
    if (d > 17) return this;
    if (d < -17) return o;
    if (d >= 0) return new Big(this.m + o.m / 10 ** d, this.e);
    return new Big(this.m / 10 ** (-d) + o.m, o.e);
  }

  sub(o) { o = Big.from(o); return this.add(new Big(-o.m, o.e)); }
  mul(o) { o = Big.from(o); return new Big(this.m * o.m, this.e + o.e); }
  div(o) {
    o = Big.from(o);
    if (o.isZero()) throw new Error('División por cero');
    return new Big(this.m / o.m, this.e - o.e);
  }
  neg() { return new Big(-this.m, this.e); }

  // Potencia con exponente real (para curvas de coste: base^n).
  pow(n) {
    if (this.isZero()) return n === 0 ? Big.ONE : Big.ZERO;
    if (this.m < 0) throw new Error('pow de negativo no soportado');
    const log = Math.log10(this.m) + this.e; // log10(this)
    const total = log * n;
    const e = Math.floor(total);
    return new Big(10 ** (total - e), e);
  }

  log10() {
    if (this.m <= 0) return -Infinity;
    return Math.log10(this.m) + this.e;
  }

  cmp(o) {
    o = Big.from(o);
    if (this.m === 0 && o.m === 0) return 0;
    const sa = this.sign(), sb = o.sign();
    if (sa !== sb) return sa > sb ? 1 : -1;
    if (sa === 0) return 0;
    // Mismo signo.
    if (this.e !== o.e) return (this.e > o.e) === (sa > 0) ? 1 : -1;
    if (this.m === o.m) return 0;
    return this.m > o.m ? 1 : -1;
  }
  gt(o) { return this.cmp(o) > 0; }
  gte(o) { return this.cmp(o) >= 0; }
  lt(o) { return this.cmp(o) < 0; }
  lte(o) { return this.cmp(o) <= 0; }
  eq(o) { return this.cmp(o) === 0; }

  floor() {
    if (this.e >= 15) return this;
    return new Big(Math.floor(this.toNumber()), 0);
  }

  max(o) { return this.gte(o) ? this : Big.from(o); }
  min(o) { return this.lte(o) ? this : Big.from(o); }

  toNumber() {
    if (this.isZero()) return 0;
    if (this.e > 308) return this.m > 0 ? Infinity : -Infinity;
    if (this.e < -308) return 0;
    return this.m * 10 ** this.e;
  }

  // Formato legible: 1.23K, 45.6M, 7.89e45. Para e<3 muestra el número con decimales mínimos.
  format(precision = 2) {
    if (this.isZero()) return '0';
    const neg = this.m < 0 ? '-' : '';
    const am = Math.abs(this.m);
    if (this.e < 3) {
      const n = am * 10 ** this.e;
      if (this.e < 0) return neg + n.toFixed(Math.min(4, precision + (-this.e)));
      return neg + (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? precision : n < 100 ? 1 : 0));
    }
    const group = Math.floor(this.e / 3);
    if (group < SUFFIXES.length) {
      const v = am * 10 ** (this.e - group * 3);
      const digits = v >= 100 ? 0 : v >= 10 ? 1 : precision;
      return neg + v.toFixed(digits) + SUFFIXES[group];
    }
    return neg + am.toFixed(precision) + 'e' + this.e;
  }

  toJSON() { return { m: this.m, e: this.e }; }
  toString() { return this.format(); }
}

Big.ZERO = new Big(0, 0);
Big.ONE = new Big(1, 0);

export const big = (v) => Big.from(v);

// Suma geométrica: coste total de comprar `count` unidades desde el nivel `owned`
// con coste base y multiplicador por nivel r. Sum_{k=owned}^{owned+count-1} base*r^k.
export function geometricCost(base, r, owned, count = 1) {
  base = Big.from(base);
  if (r === 1) return base.mul(count);
  const rk = Big.from(r).pow(owned);
  const rn = Big.from(r).pow(count);
  return base.mul(rk).mul(rn.sub(1)).div(r - 1);
}

// Máximo de unidades comprables con `money` desde `owned`.
export function maxAffordable(money, base, r, owned) {
  money = Big.from(money);
  base = Big.from(base);
  if (r === 1) return Math.floor(money.div(base).toNumber());
  const rk = Big.from(r).pow(owned);
  const first = base.mul(rk);
  if (money.lt(first)) return 0;
  // n = floor(log_r(money*(r-1)/first + 1))
  const inner = money.mul(r - 1).div(first).add(1);
  const n = Math.floor(inner.log10() / Math.log10(r) + 1e-9);
  return Math.max(0, n);
}
