// Motor de una partida de Bastión de Cristal: oleadas, torre, proyectiles, cartas y Nova.
// Sin DOM ni Canvas: se prueba en Node y un bot puede jugarlo miles de veces.
// Determinista: todo el azar sale de un Rng con semilla. `update(dt)` devuelve los eventos del paso
// (la misma lista se reutiliza: hay que consumirla antes de la siguiente llamada).
import { Rng } from './kit/core/rng.js';
import { ARENA, BALANCE, BOSSES, CARDS, ENEMIES, OPENING_CARDS } from './content.mjs';
import { computeStats } from './stats.mjs';

export const STEP = 1 / 60;
const TAU = Math.PI * 2;

// ---------- curvas (funciones de la oleada o del nivel) ----------
export const waveDuration = (w) => Math.min(BALANCE.wave.maxDur, BALANCE.wave.baseDur + BALANCE.wave.durPerWave * w);
// Las primeras oleadas son más suaves (rampa hasta la 6.ª) para que nadie caiga en el primer minuto.
export const waveRamp = (w) => Math.min(1, BALANCE.wave.rampStart + BALANCE.wave.rampPerWave * (w - 1));
export const waveBudget = (w) => (BALANCE.wave.budgetBase + BALANCE.wave.budgetPerWave * w) * BALANCE.density * waveRamp(w);
export const enemyHp = (w) => BALANCE.hpBase * Math.pow(BALANCE.hpGrowth, w - 1) / BALANCE.density;
export const enemyDmg = (w) => 4 * Math.pow(BALANCE.dmgGrowth, w - 1) / BALANCE.density;
export const enemyCoin = (w) => Math.pow(BALANCE.coinGrowth, w - 1) / BALANCE.density;
export const xpNeeded = (level) => Math.round(BALANCE.xp.base * Math.pow(BALANCE.xp.growth, level - 1));
export const xpPerKill = (w) => (1 + BALANCE.xp.perWave * (w - 1)) / BALANCE.density;
export const isBossWave = (w) => w % BALANCE.wave.bossEvery === 0;
export const bossFor = (w) => BOSSES[(Math.floor(w / BALANCE.wave.bossEvery) - 1) % BOSSES.length];

// Distancia al cuadrado de un segmento a un círculo: devuelve t∈[0,1] del punto de impacto o -1.
function segHit(px, py, x, y, cx, cy, r) {
  const dx = x - px;
  const dy = y - py;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - px) * dx + (cy - py) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = px + dx * t - cx;
  const qy = py + dy * t - cy;
  return qx * qx + qy * qy <= r * r ? t : -1;
}

export class Siege {
  // `collect: false` descarta los eventos (los bots de prueba no los necesitan).
  constructor({ seed = 1, lab = {}, shards = 0, mode = 'normal', id, collect = true } = {}) {
    this.collect = collect;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.mode = mode;
    this.id = id || `${mode}-${this.seed}`;
    this.lab = lab;
    this.shards = shards;
    this.cards = {};
    this.stats = this._stats();
    this.t = 0;
    this.events = [];

    this.tower = { x: ARENA.cx, y: ARENA.cy, r: ARENA.towerR, hp: this.stats.maxHp, shield: this.stats.shieldMax, shieldDelay: 0, invuln: 0, fireT: 0, aim: -Math.PI / 2, recoil: 0 };
    this.enemies = [];
    this.shots = [];
    this.eshots = [];
    this.blades = [];   // posiciones calculadas (para dibujar y chocar)
    this.drones = [];
    this.nextId = 1;
    this.focusId = 0;

    this.wave = 1;
    this.waveT = 0;
    this.spawnAcc = 0;
    this.nextSpawn = null;
    this.boss = null;
    this.bossWaves = [];

    this.level = 1;
    this.xp = 0;
    this.queuedPicks = this.stats.startPicks;
    this.pending = null;
    this.rerolls = this.stats.rerolls;
    this.picks = 0;

    this.coinsRun = 0;
    this.kills = 0;
    this.novaCharge = 0;
    this.combo = { n: 0, t: 0 };
    this.bladeAngle = 0;
    this.droneAngle = 0;
    this.droneT = [];

    this.over = false;
    this.revived = false;
    this.killedBy = null;
    this.result = null;

    this._startWave();
    if (this.queuedPicks > 0) this._openPick();
  }

  _stats() {
    return computeStats({ lab: this.lab, shards: this.shards, cards: this.cards, daily: this.mode === 'daily' });
  }

  // ---------- consultas ----------
  get hpFrac() { return Math.max(0, this.tower.hp / this.stats.maxHp); }
  get xpFrac() { return Math.min(1, this.xp / xpNeeded(this.level)); }
  get novaReady() { return this.novaCharge >= BALANCE.nova.need; }
  get novaFrac() { return Math.min(1, this.novaCharge / BALANCE.nova.need); }
  get waveFrac() { return this.boss ? 1 : Math.min(1, this.waveT / waveDuration(this.wave)); }
  get comboMult() { return Math.min(BALANCE.combo.cap, 1 + BALANCE.combo.perStep * this.combo.n); }
  get alive() { return this.enemies.length; }

  // ---------- bucle ----------
  // Los eventos se acumulan (también los de acciones del jugador entre pasos): quien los muestre
  // llama a `drain()` después de cada paso o acción.
  _ev(e) { if (this.collect) this.events.push(e); }

  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }

  update(dt) {
    if (this.over || this.pending) return this.events;
    this.t += dt;

    this._updateWave(dt);
    this._updateTower(dt);
    this._updateBlades(dt);
    this._updateDrones(dt);
    this._updateShots(dt);
    this._updateEnemies(dt);
    this._updateEnemyShots(dt);
    this._separate();

    // Quitar los muertos de una vez (los bucles anteriores solo los marcan).
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.dead) this.enemies[w++] = e;
    }
    this.enemies.length = w;
    if (this.focusId && !this.enemies.some((e) => e.id === this.focusId)) this.focusId = 0;

    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }
    if (!this.pending && this.queuedPicks > 0) this._openPick();
    return this.events;
  }

  // ---------- oleadas y generación ----------
  _startWave() {
    this._ev({ type: 'wave', wave: this.wave, boss: isBossWave(this.wave) });
    this.nextSpawn = null;
    if (isBossWave(this.wave)) this._spawnBoss();
    this._burst();
  }

  // Al empezar la oleada llega una ráfaga: parte del presupuesto entra de golpe por un mismo lado,
  // para que se vea la horda acercándose. El resto entra goteando durante la oleada.
  _burst() {
    let budget = waveBudget(this.wave) * BALANCE.wave.burstShare;
    if (this.enemies.length >= BALANCE.wave.maxAlive) return;
    const a0 = this.rng.next() * TAU;
    for (let guard = 0; guard < 80 && budget > 0.3; guard++) {
      const id = this._pickType();
      const d = ENEMIES[id];
      const cost = d.cost * (d.pack || 1);
      if (cost > budget && guard > 0) break;
      budget -= cost;
      const a = a0 + this.rng.range(-0.55, 0.55);
      const rad = ARENA.spawnR + this.rng.range(0, 70);
      const cx = ARENA.cx + Math.cos(a) * rad;
      const cy = ARENA.cy + Math.sin(a) * rad;
      const n = d.pack || 1;
      for (let i = 0; i < n; i++) {
        const jx = n > 1 ? this.rng.range(-16, 16) : 0;
        const jy = n > 1 ? this.rng.range(-16, 16) : 0;
        this.enemies.push(this._makeEnemy(id, cx + jx, cy + jy));
      }
    }
  }

  _updateWave(dt) {
    const dur = waveDuration(this.wave);
    let share = BALANCE.wave.spawnShare * (1 - BALANCE.wave.burstShare);
    if (this.boss && !this.boss.dead) share *= BALANCE.wave.bossTrickle;
    else {
      this.boss = null;
      this.waveT += dt;
      if (this.waveT >= dur) {
        this.wave++;
        this.waveT = 0;
        this._startWave();
      }
    }
    this.spawnAcc += (waveBudget(this.wave) * share / dur) * dt;
    if (this.enemies.length >= BALANCE.wave.maxAlive) { this.spawnAcc = Math.min(this.spawnAcc, 12); return; }
    for (let guard = 0; guard < 8; guard++) {
      if (!this.nextSpawn) this.nextSpawn = this._pickType();
      const d = ENEMIES[this.nextSpawn];
      const cost = d.cost * (d.pack || 1);
      if (this.spawnAcc < cost) break;
      this.spawnAcc -= cost;
      this._spawnGroup(this.nextSpawn);
      this.nextSpawn = null;
    }
  }

  _pickType() {
    const pool = [];
    for (const [id, d] of Object.entries(ENEMIES)) {
      if (d.w <= 0 || d.from > this.wave) continue;
      // Un tipo recién desbloqueado pesa el doble durante tres oleadas: así se nota que llegó.
      pool.push({ id, w: d.w * (this.wave - d.from < 3 ? 2 : 1) });
    }
    return this.rng.weighted(pool).id;
  }

  _spawnGroup(typeId) {
    const d = ENEMIES[typeId];
    const a = this.rng.next() * TAU;
    const rad = ARENA.spawnR + this.rng.next() * 24;
    const cx = ARENA.cx + Math.cos(a) * rad;
    const cy = ARENA.cy + Math.sin(a) * rad;
    const n = d.pack || 1;
    for (let i = 0; i < n; i++) {
      const jx = n > 1 ? this.rng.range(-16, 16) : 0;
      const jy = n > 1 ? this.rng.range(-16, 16) : 0;
      this.enemies.push(this._makeEnemy(typeId, cx + jx, cy + jy));
    }
  }

  _makeEnemy(typeId, x, y) {
    const d = ENEMIES[typeId];
    const w = this.wave;
    const hp = enemyHp(w) * d.hp;
    return {
      id: this.nextId++, type: typeId, name: d.name, boss: false, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      hp, maxHp: hp, r: d.r, speed: d.speed * (0.92 + this.rng.next() * 0.16),
      dmg: enemyDmg(w) * d.dmg, atkT: this.rng.next() * 0.4, coin: d.coin, xp: d.xp, cost: d.cost || 0.3,
      armored: !!d.armored, projTaken: d.projTaken || 1, range: d.range || 0,
      shootT: d.shotEvery ? this.rng.range(0.6, d.shotEvery) : 0, shotEvery: d.shotEvery || 0,
      flash: 0, stun: 0, bladeCd: 0, dead: false, phase: this.rng.next() * TAU, age: 0,
    };
  }

  _spawnBoss() {
    const w = this.wave;
    const b = bossFor(w);
    const a = this.rng.next() * TAU;
    const hp = enemyHp(w) * b.hp;
    const e = {
      id: this.nextId++, type: 'boss', bossId: b.id, name: b.name, boss: true,
      x: ARENA.cx + Math.cos(a) * (ARENA.spawnR + 40), y: ARENA.cy + Math.sin(a) * (ARENA.spawnR + 40),
      vx: 0, vy: 0, kx: 0, ky: 0, hp, maxHp: hp, r: b.r, speed: b.speed, dmg: enemyDmg(w) * b.dmg, atkT: 0.6,
      coin: ENEMIES.bruto.coin, xp: ENEMIES.bruto.xp, cost: 0, armored: false, projTaken: 1, range: 0, shootT: 0, shotEvery: 0,
      flash: 0, stun: 0, bladeCd: 0, dead: false, phase: 0, age: 0, minionT: b.minions ? b.minions.every * 0.6 : 0,
      chargeT: b.charge ? b.charge.every : 0, charging: 0,
    };
    this.enemies.push(e);
    this.boss = e;
    this._ev({ type: 'bossSpawn', name: b.name, id: b.id });
  }

  // ---------- torre ----------
  _updateTower(dt) {
    const T = this.tower;
    const s = this.stats;
    T.hp = Math.min(s.maxHp, T.hp + s.regen * dt);
    if (T.invuln > 0) T.invuln -= dt;
    if (T.recoil > 0) T.recoil = Math.max(0, T.recoil - dt * 8);
    if (s.shieldMax > 0) {
      if (T.shieldDelay > 0) T.shieldDelay -= dt;
      else T.shield = Math.min(s.shieldMax, T.shield + s.shieldMax / 3 * dt);
    }
    T.fireT -= dt;
    for (let guard = 0; guard < 3 && T.fireT <= 0; guard++) {
      const targets = this._targets(T.x, T.y, s.range, s.projectiles, true);
      if (!targets.length) { T.fireT = 0; break; }
      this._volley(targets);
      T.fireT += 1 / s.fireRate;
    }
  }

  _volley(targets) {
    const T = this.tower;
    const s = this.stats;
    const n = s.projectiles;
    const primary = targets[0];
    T.aim = Math.atan2(primary.y - T.y, primary.x - T.x);
    T.recoil = 1;
    for (let i = 0; i < n; i++) {
      let target = targets[i];
      let spread = 0;
      if (!target) {
        // Sobran proyectiles: se abren en abanico alrededor del objetivo principal.
        target = primary;
        const k = i - targets.length + 1;
        spread = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;
      }
      this._shoot(T.x, T.y, target, s.damage, spread, false);
    }
    this._ev({ type: 'shoot', x: T.x, y: T.y, angle: T.aim, drone: false });
  }

  _shoot(x, y, target, dmg, spread, drone) {
    const s = this.stats;
    const sp = s.projectileSpeed;
    const dist = Math.hypot(target.x - x, target.y - y);
    const lead = dist / sp;
    const tx = target.x + target.vx * lead;
    const ty = target.y + target.vy * lead;
    const ang = Math.atan2(ty - y, tx - x) + spread;
    const crit = this.rng.next() < s.critChance;
    this.shots.push({
      x: x + Math.cos(ang) * 20, y: y + Math.sin(ang) * 20, px: x, py: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      dmg: dmg * (crit ? s.critMult : 1), crit, pierce: s.pierce, hit: [], life: (s.range + 160) / sp, drone,
    });
  }

  // Los n enemigos más cercanos dentro del alcance; el objetivo marcado va primero.
  _targets(x, y, range, n, useFocus) {
    const out = [];
    const dist2 = [];
    let focus = null;
    if (useFocus && this.focusId) {
      focus = this.enemies.find((e) => e.id === this.focusId && !e.dead) || null;
      if (focus) {
        const d = Math.hypot(focus.x - x, focus.y - y);
        if (d > range + focus.r) focus = null;
      }
    }
    for (const e of this.enemies) {
      if (e.dead || e === focus) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      const lim = range + e.r;
      if (d2 > lim * lim) continue;
      if (out.length === n && d2 >= dist2[n - 1]) continue;
      let i = out.length < n ? out.length : n - 1;
      while (i > 0 && dist2[i - 1] > d2) { out[i] = out[i - 1]; dist2[i] = dist2[i - 1]; i--; }
      out[i] = e;
      dist2[i] = d2;
    }
    if (focus) { out.unshift(focus); if (out.length > n) out.length = n; }
    return out;
  }

  // ---------- cuchillas y drones ----------
  _updateBlades(dt) {
    const b = this.stats.blades;
    this.blades.length = 0;
    if (!b) return;
    this.bladeAngle += b.speed * dt;
    const T = this.tower;
    for (let i = 0; i < b.n; i++) {
      const a = this.bladeAngle + (i * TAU) / b.n;
      const bx = T.x + Math.cos(a) * b.radius;
      const by = T.y + Math.sin(a) * b.radius;
      this.blades.push({ x: bx, y: by, a });
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.bladeCd -= dt / b.n; // cada enemigo recibe un golpe por vuelta aunque haya varias cuchillas
        const dx = e.x - bx;
        const dy = e.y - by;
        const lim = e.r + 8;
        if (dx * dx + dy * dy <= lim * lim && e.bladeCd <= 0) {
          e.bladeCd = 0.3;
          this._damage(e, b.dmg, 'blade', false, bx, by);
        }
      }
      for (let k = this.eshots.length - 1; k >= 0; k--) {
        const sh = this.eshots[k];
        if (Math.hypot(sh.x - bx, sh.y - by) < 14) { this.eshots.splice(k, 1); this._ev({ type: 'block', x: sh.x, y: sh.y }); }
      }
    }
  }

  _updateDrones(dt) {
    const d = this.stats.drones;
    this.drones.length = 0;
    if (!d) return;
    this.droneAngle += 1.3 * dt;
    const T = this.tower;
    while (this.droneT.length < d.n) this.droneT.push(this.rng.next() * 0.5);
    for (let i = 0; i < d.n; i++) {
      const a = this.droneAngle + (i * TAU) / d.n + 0.6;
      const x = T.x + Math.cos(a) * 92;
      const y = T.y + Math.sin(a) * 92;
      this.drones.push({ x, y, a });
      this.droneT[i] -= dt;
      if (this.droneT[i] <= 0) {
        const tg = this._targets(x, y, d.range, 1, false)[0];
        if (tg) {
          this._shoot(x, y, tg, d.dmg, 0, true);
          this.droneT[i] += 1 / d.rate;
          this._ev({ type: 'shoot', x, y, angle: Math.atan2(tg.y - y, tg.x - x), drone: true });
        } else this.droneT[i] = 0;
      }
    }
  }

  // ---------- proyectiles ----------
  _updateShots(dt) {
    const shots = this.shots;
    let w = 0;
    for (let i = 0; i < shots.length; i++) {
      const p = shots[i];
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let alive = p.life > 0;
      while (alive) {
        let best = null;
        let bestT = 2;
        for (const e of this.enemies) {
          if (e.dead || p.hit.includes(e.id)) continue;
          const t = segHit(p.px, p.py, p.x, p.y, e.x, e.y, e.r + 3);
          if (t >= 0 && t < bestT) { bestT = t; best = e; }
        }
        if (!best) break;
        p.hit.push(best.id);
        this._projectileHit(p, best);
        if (p.pierce-- <= 0) alive = false;
      }
      if (alive) shots[w++] = p;
    }
    shots.length = w;
  }

  _projectileHit(p, e) {
    const s = this.stats;
    this._damage(e, p.dmg * (e.armored ? e.projTaken : 1), 'proj', p.crit, p.x, p.y);
    if (s.splash) {
      const r = s.splash.radius;
      for (const o of this.enemies) {
        if (o.dead || o === e) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const lim = r + o.r;
        if (dx * dx + dy * dy <= lim * lim) this._damage(o, p.dmg * s.splash.frac, 'splash', false, o.x, o.y);
      }
      this._ev({ type: 'explosion', x: e.x, y: e.y, r });
    }
    if (s.chain && this.rng.next() < s.chain.chance) this._chain(e, p.dmg);
  }

  _chain(from, dmg) {
    const c = this.stats.chain;
    const pts = [{ x: from.x, y: from.y }];
    const used = [from.id];
    let cur = from;
    let amount = dmg * c.frac;
    for (let j = 0; j < c.jumps; j++) {
      let next = null;
      let nd = c.reach * c.reach;
      for (const o of this.enemies) {
        if (o.dead || used.includes(o.id)) continue;
        const dx = o.x - cur.x;
        const dy = o.y - cur.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nd) { nd = d2; next = o; }
      }
      if (!next) break;
      used.push(next.id);
      pts.push({ x: next.x, y: next.y });
      this._damage(next, amount, 'chain', false, next.x, next.y);
      cur = next;
      amount *= 0.85;
    }
    if (pts.length > 1) this._ev({ type: 'chain', pts });
  }

  // ---------- daño y bajas ----------
  _damage(e, amount, kind, crit, x, y) {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 0.09;
    this._ev({ type: 'hit', x, y, amount, crit, kind });
    const ex = this.stats.execute;
    if (ex > 0 && !e.boss && e.hp > 0 && e.hp / e.maxHp <= ex) { e.hp = 0; this._ev({ type: 'execute', x: e.x, y: e.y }); }
    if (e.hp <= 0) this._kill(e);
  }

  _kill(e) {
    e.dead = true;
    this.kills++;
    const s = this.stats;
    const d = e.boss ? null : ENEMIES[e.type];
    if (this.combo.t > 0) this.combo.n = Math.min(BALANCE.combo.max, this.combo.n + 1); else this.combo.n = 1;
    this.combo.t = BALANCE.combo.window;
    let coins = e.coin * enemyCoin(this.wave) * s.coinMult * this.comboMult;
    let xp = e.xp * xpPerKill(this.wave) * s.xpMult;
    let charge = e.cost * BALANCE.nova.chargePerCost * s.novaCharge / BALANCE.density;
    if (e.boss) {
      coins *= BALANCE.boss.coinMult;
      xp *= BALANCE.boss.xpMult;
      charge = BALANCE.boss.chargeBonus * s.novaCharge;
      this.bossWaves.push(this.wave);
      this._ev({ type: 'bossDown', name: e.name, wave: this.wave, x: e.x, y: e.y });
    }
    this.coinsRun += coins;
    if (!this.over) this.novaCharge = Math.min(BALANCE.nova.need, this.novaCharge + charge);
    this._ev({ type: 'kill', x: e.x, y: e.y, r: e.r, kind: e.type, boss: e.boss, coins });
    if (d && d.splits) {
      for (let i = 0; i < d.splits; i++) {
        const c = this._makeEnemy('cria', e.x + this.rng.range(-8, 8), e.y + this.rng.range(-8, 8));
        c.kx = this.rng.range(-80, 80);
        c.ky = this.rng.range(-80, 80);
        this.enemies.push(c);
      }
    }
    this._gainXp(xp);
  }

  _gainXp(v) {
    this.xp += v;
    let need = xpNeeded(this.level);
    while (this.xp >= need) {
      this.xp -= need;
      this.level++;
      this.queuedPicks++;
      need = xpNeeded(this.level);
    }
  }

  // ---------- cartas ----------
  _openPick() {
    this.queuedPicks--;
    this.pending = { choices: this._drawChoices(), level: this.level };
    this._ev({ type: 'levelup', level: this.level });
  }

  _drawChoices(exclude = []) {
    const ids = Object.keys(CARDS).filter((id) => (this.cards[id] | 0) < CARDS[id].max);
    const weight = (id) => CARDS[id].w * ((this.cards[id] | 0) > 0 ? 1.5 : 1);
    const out = [];
    const take = (list) => {
      const pool = list.filter((id) => !out.includes(id)).map((id) => ({ id, w: weight(id) }));
      if (!pool.length) return;
      out.push(this.rng.weighted(pool).id);
    };
    const fresh = ids.filter((id) => !exclude.includes(id));
    const source = fresh.length >= 3 ? fresh : ids;
    // En las primeras elecciones, la primera carta siempre da un cambio visible en el disparo.
    if (this.picks < 3) take(OPENING_CARDS.filter((id) => source.includes(id)));
    while (out.length < 3 && out.length < source.length) take(source);
    return out;
  }

  pickCard(index) {
    if (!this.pending) return false;
    const id = this.pending.choices[index];
    if (!id) return false;
    const T = this.tower;
    const oldMax = this.stats.maxHp;
    const oldShield = this.stats.shieldMax;
    this.cards[id] = (this.cards[id] | 0) + 1;
    this.picks++;
    this.stats = this._stats();
    T.hp += this.stats.maxHp - oldMax;
    if (id === 'vida') T.hp += this.stats.maxHp * 0.3;
    T.hp = Math.min(this.stats.maxHp, T.hp);
    T.shield += this.stats.shieldMax - oldShield;
    this._ev({ type: 'pick', id, level: this.cards[id] });
    this.pending = null;
    if (this.queuedPicks > 0) this._openPick();
    return true;
  }

  // Cambia las 3 cartas por otras. Devuelve false si no quedan relanzamientos.
  reroll() {
    if (!this.pending || this.rerolls <= 0) return false;
    this.rerolls--;
    this.pending.choices = this._drawChoices(this.pending.choices);
    return true;
  }

  grantReroll(n = 1) { this.rerolls += n; }

  // ---------- enemigos ----------
  _updateEnemies(dt) {
    const T = this.tower;
    const s = this.stats;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt;
      if (e.flash > 0) e.flash -= dt;
      const dx = T.x - e.x;
      const dy = T.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Retroceso (Nova, cría de un Divisor).
      if (e.kx || e.ky) {
        e.x += e.kx * dt;
        e.y += e.ky * dt;
        const k = Math.exp(-5 * dt);
        e.kx *= k;
        e.ky *= k;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) { e.kx = 0; e.ky = 0; }
      }
      if (e.stun > 0) { e.stun -= dt; e.vx = 0; e.vy = 0; continue; }

      let slow = 1;
      if (s.frost && dist <= s.frost.radius) slow = 1 - s.frost.slow;
      let speed = e.speed * slow;
      if (e.boss) this._bossBehavior(e, dt);
      if (e.charging > 0) { e.charging -= dt; speed *= BOSSES.find((b) => b.id === e.bossId).charge.mult; }

      const stop = e.range ? e.range : T.r + e.r - 1;
      if (dist > stop) {
        const step = Math.min(speed * dt, dist - stop);
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
        e.vx = (dx / dist) * speed;
        e.vy = (dy / dist) * speed;
      } else { e.vx = 0; e.vy = 0; }

      if (e.range) {
        if (dist <= e.range + 6) {
          e.shootT -= dt;
          if (e.shootT <= 0) {
            e.shootT = e.shotEvery;
            const sp = ENEMIES.arquero.shotSpeed;
            this.eshots.push({ x: e.x, y: e.y, vx: (dx / dist) * sp, vy: (dy / dist) * sp, dmg: e.dmg, from: e.name });
            this._ev({ type: 'eshot', x: e.x, y: e.y });
          }
        }
      } else if (dist <= T.r + e.r + BALANCE.contact.margin) {
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.atkT = e.boss ? 1.2 : BALANCE.contact.cooldown;
          this._hitTower(e.dmg, e);
          if (s.thorns > 0) this._damage(e, s.thorns, 'thorns', false, e.x, e.y);
        }
      }
    }
  }

  _bossBehavior(e, dt) {
    const b = BOSSES.find((x) => x.id === e.bossId);
    if (b.minions) {
      e.minionT -= dt;
      if (e.minionT <= 0) {
        e.minionT = b.minions.every;
        const md = ENEMIES[b.minions.type];
        const count = md.pack || b.minions.n;
        for (let i = 0; i < count; i++) {
          const a = this.rng.next() * TAU;
          this.enemies.push(this._makeEnemy(b.minions.type, e.x + Math.cos(a) * (e.r + 10), e.y + Math.sin(a) * (e.r + 10)));
        }
        this._ev({ type: 'summon', x: e.x, y: e.y });
      }
    }
    if (b.charge) {
      e.chargeT -= dt;
      if (e.chargeT <= 0) { e.chargeT = b.charge.every; e.charging = b.charge.dur; this._ev({ type: 'charge', x: e.x, y: e.y }); }
    }
  }

  _updateEnemyShots(dt) {
    const T = this.tower;
    let w = 0;
    for (let i = 0; i < this.eshots.length; i++) {
      const sh = this.eshots[i];
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      if (Math.hypot(sh.x - T.x, sh.y - T.y) <= T.r + 4) { this._hitTower(sh.dmg, { name: sh.from }); continue; }
      if (sh.x < -80 || sh.x > 560 || sh.y < -80 || sh.y > 880) continue;
      this.eshots[w++] = sh;
    }
    this.eshots.length = w;
  }

  _hitTower(raw, src) {
    const T = this.tower;
    if (this.over || T.invuln > 0) return;
    let dmg = raw * (1 - this.stats.armor);
    if (T.shield > 0) {
      const take = Math.min(T.shield, dmg);
      T.shield -= take;
      dmg -= take;
    }
    T.shieldDelay = 4;
    T.hp -= dmg;
    this._ev({ type: 'hurt', dmg: raw, x: src.x, y: src.y });
    if (T.hp <= 0) {
      T.hp = 0;
      this.over = true;
      this.killedBy = src.name || 'Enemigo';
      this.result = this._summary();
      this._ev({ type: 'death', killedBy: this.killedBy });
    }
  }

  // Separación blanda: los enemigos se rodean unos a otros en vez de apilarse en un punto.
  _separate() {
    const list = this.enemies;
    const T = this.tower;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        if (dx > 80 || dx < -80) continue;
        const dy = b.y - a.y;
        const lim = (a.r + b.r) * 0.9;
        const d2 = dx * dx + dy * dy;
        if (d2 >= lim * lim) continue;
        const d = Math.sqrt(d2);
        const push = (lim - d) * 0.5;
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const fa = mb / (ma + mb);
        const fb = ma / (ma + mb);
        let nx;
        let ny;
        if (d < 0.01) {
          // Misma posición exacta (p. ej. dos enemigos aplastados contra la torre): dirección fija por id.
          const ang = (a.id * 2.399963) % TAU;
          nx = Math.cos(ang);
          ny = Math.sin(ang);
        } else { nx = dx / d; ny = dy / d; }
        a.x -= nx * push * fa;
        a.y -= ny * push * fa;
        b.x += nx * push * fb;
        b.y += ny * push * fb;
      }
      // Nadie entra en la torre.
      const tx = a.x - T.x;
      const ty = a.y - T.y;
      const td = Math.hypot(tx, ty);
      const min = T.r + a.r - 2;
      if (td < min && td > 0) { a.x = T.x + (tx / td) * min; a.y = T.y + (ty / td) * min; }
    }
  }

  // ---------- acciones del jugador ----------
  nova() {
    if (this.over || this.pending || !this.novaReady) return false;
    const s = this.stats;
    this.novaCharge = 0;
    this.tower.invuln = Math.max(this.tower.invuln, BALANCE.nova.invuln);
    const T = this.tower;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - T.x;
      const dy = e.y - T.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!e.boss) { e.kx += (dx / d) * 520; e.ky += (dy / d) * 520; e.stun = BALANCE.nova.stun; }
      else { e.kx += (dx / d) * 120; e.ky += (dy / d) * 120; }
      this._damage(e, s.damage * s.novaDamage * (e.boss ? 0.5 : 1), 'nova', false, e.x, e.y);
    }
    this.eshots.length = 0;
    this._ev({ type: 'nova' });
    return true;
  }

  // Marca el enemigo más cercano al punto como objetivo prioritario.
  focusAt(x, y) {
    let best = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d < 18 && d < bd) { bd = d; best = e; }
    }
    this.focusId = best ? best.id : 0;
    return !!best;
  }

  // Revivir una vez: vuelta con parte de la vida, limpieza de pantalla y unos segundos de invulnerabilidad.
  revive() {
    if (!this.over || this.revived) return false;
    this.revived = true;
    this.over = false;
    this.result = null;
    this.killedBy = null;
    const T = this.tower;
    T.hp = this.stats.maxHp * BALANCE.revive.hpFrac;
    T.invuln = BALANCE.revive.invuln;
    for (const e of this.enemies) {
      if (e.dead || e.boss) continue;
      const dx = e.x - T.x;
      const dy = e.y - T.y;
      const d = Math.hypot(dx, dy) || 1;
      e.kx += (dx / d) * 600;
      e.ky += (dy / d) * 600;
      e.stun = 1.5;
    }
    this.eshots.length = 0;
    this._ev({ type: 'revive' });
    return true;
  }

  // ---------- resultado ----------
  _summary() {
    const bonus = BALANCE.endBonus.k * Math.pow(Math.max(0, this.wave - 1), BALANCE.endBonus.exp) * this.stats.coinMult;
    return {
      id: this.id, mode: this.mode, wave: this.wave, kills: this.kills, level: this.level,
      killCoins: this.coinsRun, bonus, coins: this.coinsRun + bonus,
      time: this.t, bossWaves: this.bossWaves.slice(), killedBy: this.killedBy, doubled: false,
    };
  }

  // Resultado "ahora mismo": sirve para cobrar una partida abandonada a medias.
  summary() { return this.result || this._summary(); }
}
