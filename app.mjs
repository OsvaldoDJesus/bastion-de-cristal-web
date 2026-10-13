// Bastión de Cristal: pantallas, entrada y servicios. Aquí se conectan motor, dibujo y kit.
import {
  GameLoop, SceneManager, createCanvas, Pointer, hit, hitCircle, SaveStore, Sfx, Particles, FloatingTexts, Shake, Tweens, Ease, UI, el,
  Analytics, StorageSink, Events, AdsService, IapService, dailySeed,
  Button, Tabs, ScrollList, fillRoundRect, text, clamp,
} from './kit/index.js';
import { GAME, ARENA, BALANCE, LAB, LAB_TABS, SKINS, IAP_CATALOG, GEM_COSTS, TEXT, DEATH_TIPS } from './content.mjs';
import { Siege } from './engine.mjs';
import { computeStats, dps } from './stats.mjs';
import {
  createSave, validateSave, MIGRATIONS, buyLab, labCost, labLevel, buySkin, settleRun, doubleRun,
  reforge, reforgeShards, canReforge, offlineReward, fmt,
} from './profile.mjs';
import { BastionRenderer, HUD, PICK, pickRect, drawCoin, drawGem, drawShard } from './renderer.mjs';
import { RELEASE } from './config.mjs';
import { platform, loadNative, desktopBridge } from './platform.mjs';
import { createAdsProvider, createIapProvider, iapAvailable } from './providers.mjs';
import { unlockNew, ACHIEVEMENTS, achievementProgress } from './achievements.mjs';

// ---------- infraestructura ----------
const root = document.getElementById('game');
const surface = createCanvas({ parent: root, width: GAME.width, height: GAME.height, background: '#04051a', maxDpr: 2 });
const ui = new UI({ surface, parent: root });
const sfx = new Sfx({ volume: 0.45 });
const particles = new Particles({ max: 900 });
const floats = new FloatingTexts();
const shake = new Shake();
const tweens = new Tweens();
const analytics = new Analytics({ app: GAME.id, version: GAME.version, sink: new StorageSink({ key: `${GAME.id}.analytics` }) });

// Plugins nativos (Android/iOS) y puente de escritorio (Electron/Steam). En el navegador ambos son null.
const native = await loadNative();
const bridge = desktopBridge();
const SAVE_KEY = `${GAME.id}.save`;
// Escritorio: si el almacenamiento del navegador está vacío, se restaura el guardado desde el archivo (Steam Auto-Cloud).
if (bridge) {
  try {
    if (!localStorage.getItem(SAVE_KEY)) { const text = await bridge.loadFile(); if (text) localStorage.setItem(SAVE_KEY, text); }
  } catch { /* sin archivo: se empieza de cero */ }
}

const store = new SaveStore({ key: SAVE_KEY, version: GAME.saveVersion, defaults: createSave, migrations: MIGRATIONS, validate: validateSave });
const loaded = store.load();
const save = loaded.data;
if (loaded.recovered) ui.toast('El guardado anterior estaba dañado; se empezó de nuevo.');
sfx.setEnabled(save.settings.sound !== false);
// Escritorio: copia del guardado en un archivo, para que Steam Auto-Cloud lo sincronice.
let mirrorTimer = null;
const flushMirror = () => {
  if (!bridge) return;
  clearTimeout(mirrorTimer);
  try { store.flush(); const text = localStorage.getItem(SAVE_KEY); if (text) bridge.saveFile(text); } catch { /* sin disco */ }
};
const persist = () => {
  save.lastSeen = Date.now();
  store.save(save);
  if (bridge) { clearTimeout(mirrorTimer); mirrorTimer = setTimeout(flushMirror, 1500); }
};

const adsProvider = createAdsProvider({ platform, release: RELEASE, native, ui, log: (...a) => console.debug('[ads]', ...a) });
const ads = new AdsService({
  provider: adsProvider, analytics, childDirected: RELEASE.ads.childDirected,
  caps: { interstitialGraceSec: 240, interstitialMinIntervalSec: 180, interstitialMinActions: 2 },
});
ads.setNoAds(platform.steam || !!save.noAds); // Steam: sin anuncios
const iapProvider = createIapProvider({ platform, release: RELEASE, native, ui, log: (...a) => console.debug('[iap]', ...a) });
const iapOn = iapAvailable(platform, RELEASE, native);
const iap = new IapService({
  provider: iapProvider, catalog: IAP_CATALOG, analytics, entitlements: save.entitlements,
  onGrant: (p) => {
    if (p.grant.noAds) { save.noAds = true; ads.setNoAds(true); }
    if (p.grant.gems) save.gems += p.grant.gems;
    if (p.grant.skins) for (const s of p.grant.skins) if (!save.unlockedSkins.includes(s)) save.unlockedSkins.push(s);
    save.entitlements = iap.snapshot();
    persist();
  },
});
analytics.track(Events.SESSION_START, { fresh: loaded.fresh, best: save.best, platform: platform.id });

// Logros: se calculan desde el guardado; en Steam se reflejan también en la cuenta del jugador.
function checkAchievements() {
  const fresh = unlockNew(save);
  for (const a of fresh) {
    ui.toast(`Logro: ${a.name}`);
    analytics.track('achievement', { id: a.id });
    if (bridge && bridge.unlockAchievement) bridge.unlockAchievement(a.id);
  }
  if (fresh.length) { sfx.success(); persist(); }
}
if (bridge && bridge.syncAchievements) bridge.syncAchievements(Object.keys(save.achievements || {}));

let clock = 0;
const renderer = new BastionRenderer();
renderer.setSkin(save.skin);
renderer.reduceFx = !!save.settings.reduceFx;
const scenes = new SceneManager({ ctx: surface.ctx, width: GAME.width, height: GAME.height });
const skin = () => renderer.skin;
const rnd = (a, b) => a + Math.random() * (b - a);

// Limita cuántas veces por segundo suena o aparece algo (si no, 100 proyectiles = ruido).
const gate = (hz) => { let last = -1; return () => { if (clock - last >= 1 / hz) { last = clock; return true; } return false; }; };
const okShot = gate(12);
const okNum = gate(18);
const okThud = gate(6);
const okPop = gate(24);
const okBoom = gate(8);

const KILL_COLORS = { sombra: '#8b6bff', corredor: '#ff7a3d', bruto: '#d0604a', enjambre: '#8dff6a', arquero: '#3fd0e0', divisor: '#3dffa0', cria: '#3dffa0', blindado: '#9fb4cc', boss: '#ffb04a' };
const HIT_COLORS = { proj: '#ffffff', splash: '#ffb86b', chain: '#9fe8ff', blade: '#bff4ff', nova: '#ffe27a', thorns: '#ffa0a0' };

// ---------- pantalla de inicio ----------
const fakeMenu = renderer.makeFake();
scenes.register('splash', {
  enter() { this.t = 0; this.logo = { s: 0.4, a: 0 }; tweens.to(this.logo, { s: 1, a: 1 }, 0.9, Ease.outBack, { delay: 0.15 }); },
  update(dt) { this.t += dt; renderer.update(dt, null); if (this.t > 3.2) scenes.switch('menu'); },
  render(ctx) {
    renderer.drawMenuBackdrop(ctx, fakeMenu);
    ctx.save(); ctx.globalAlpha = this.logo.a; ctx.translate(240, 150); ctx.scale(this.logo.s, this.logo.s);
    text(ctx, 'BASTIÓN', 0, -6, { size: 62, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(40,20,120,0.9)' });
    text(ctx, 'DE CRISTAL', 0, 48, { size: 38, weight: '900', align: 'center', color: skin().core, shadow: 'rgba(0,10,40,0.9)' });
    ctx.restore();
    if (this.t > 1.2) text(ctx, TEXT.tapToStart, 240, 700, { size: 18, align: 'center', color: `rgba(255,255,255,${0.5 + Math.sin(this.t * 4) * 0.4})` });
  },
  pointer(e) { if (e.type === 'tap' && this.t > 0.5) scenes.switch('menu'); },
});

// ---------- menú ----------
let offlineChecked = false;
scenes.register('menu', {
  enter() {
    const today = dailySeed().key;
    const dailyLabel = today in save.dailyBest ? `${TEXT.daily} · mejor ${save.dailyBest[today]}` : `${TEXT.daily} · nuevo${save.streak.count ? ` · racha ${save.streak.count}` : ''}`;
    this.buttons = [
      new Button({ x: 70, y: 548, w: 340, h: 66, label: TEXT.play, color: '#3d6bff', size: 28, onTap: () => { sfx.tap(); scenes.switch('game', { mode: 'normal' }); } }),
      new Button({ x: 70, y: 626, w: 340, h: 54, label: dailyLabel, color: '#c23a8f', size: 17, onTap: () => { sfx.tap(); scenes.switch('game', { mode: 'daily' }); } }),
      new Button({ x: 70, y: 692, w: 164, h: 52, label: TEXT.lab, color: '#2f9f78', size: 20, onTap: () => { sfx.tap(); scenes.switch('lab'); } }),
      new Button({ x: 246, y: 692, w: 100, h: 52, label: TEXT.shop, color: 'rgba(255,255,255,0.16)', size: 17, onTap: () => { sfx.tap(); openShop(); } }),
      new Button({ x: 358, y: 692, w: 52, h: 52, label: '⚙', color: 'rgba(255,255,255,0.16)', size: 24, onTap: () => { sfx.tap(); openSettings(); } }),
    ];
    this.canBuy = LAB.some((d) => { const lv = labLevel(save, d.id); return lv < d.max && save.coins >= labCost(d, lv); });
    this.t = 0;
    if (!offlineChecked) { offlineChecked = true; checkOffline(); }
  },
  update(dt) { this.t += dt; renderer.update(dt, null); for (const b of this.buttons) b.update(dt); },
  render(ctx) {
    renderer.drawMenuBackdrop(ctx, fakeMenu);
    text(ctx, 'BASTIÓN', 240, 92, { size: 50, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(40,20,120,0.9)' });
    text(ctx, 'DE CRISTAL', 240, 136, { size: 30, weight: '900', align: 'center', color: skin().core, shadow: 'rgba(0,10,40,0.9)' });
    text(ctx, 'La torre dispara sola. Tú decides cómo crece.', 240, 168, { size: 13, align: 'center', color: 'rgba(210,220,255,0.75)' });
    fillRoundRect(ctx, 40, 500, 400, 34, 17, 'rgba(8,8,32,0.62)');
    text(ctx, `Récord: oleada ${save.best}`, 56, 517, { size: 14, weight: '800', color: '#fff' });
    drawCoin(ctx, 232, 517, 8);
    text(ctx, fmt(save.coins), 246, 517, { size: 14, weight: '800', color: '#e8fbff' });
    drawGem(ctx, 330, 517, 8);
    text(ctx, String(save.gems), 344, 517, { size: 14, weight: '800', color: '#ffd0f4' });
    if (save.shards) { drawShard(ctx, 396, 517, 8); text(ctx, String(save.shards), 408, 517, { size: 14, weight: '800', color: '#ffe9a8' }); }
    for (const b of this.buttons) b.render(ctx);
    if (this.canBuy) {
      const pulse = 1 + 0.15 * Math.sin(this.t * 6);
      ctx.fillStyle = '#ff4a6a'; ctx.beginPath(); ctx.arc(224, 700, 9 * pulse, 0, Math.PI * 2); ctx.fill();
      text(ctx, '!', 224, 701, { size: 13, weight: '900', align: 'center' });
    }
    particles.render(ctx); floats.render(ctx);
  },
  pointer(e) { if (ui.busy) return; for (const b of this.buttons) if (b.handle(e)) return; },
});

// ---------- partida ----------
const game = {
  siege: null,
  enter({ mode = 'normal' } = {}) {
    this.mode = mode;
    this.dayKey = dailySeed().key;
    const seed = mode === 'daily' ? dailySeed().seed : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.siege = new Siege({ seed, lab: save.lab, shards: save.shards, mode, id: `${mode}-${Date.now().toString(36)}-${seed.toString(36)}` });
    this.speed = clamp(save.settings.speed | 0 || 1, 1, 3);
    this.ended = false;
    this.settled = null;
    this.banner = null;
    this.pickAge = 0;
    this.hover = -1;
    this.wasPending = false;
    renderer.resetRun(this.siege);
    particles.clear();
    floats.items.length = 0;
    analytics.track(Events.LEVEL_START, { mode, best: save.best });
    this.say(mode === 'daily' ? `ASEDIO ${this.dayKey}` : 'OLEADA 1', mode === 'daily' ? 'Sin Taller: todos con la misma torre' : '', '#fff');
  },

  exit() { this.settle(); },

  get modeLabel() { return this.mode === 'daily' ? 'DIARIO' : this.siege.revived ? 'REVIVIDO' : ''; },

  say(title, sub, color) { this.banner = { title, sub, color, t: 0 }; },

  // Cobra la partida una sola vez (también si se abandona a medias).
  settle() {
    if (!this.siege || this.settled) return this.settled;
    this.settled = settleRun(save, this.siege.summary(), { dayKey: this.dayKey });
    persist();
    checkAchievements();
    analytics.track(this.siege.over ? Events.LEVEL_FAIL : Events.LEVEL_COMPLETE, { wave: this.siege.wave, coins: Math.floor(this.siege.summary().coins), mode: this.mode });
    return this.settled;
  },

  hintText() {
    const s = this.siege;
    if (s.novaReady && !save.seen.nova) return TEXT.hintNova;
    if (!save.seen.focus && s.t > 9 && s.t < 60 && s.alive > 2) return TEXT.hintFocus;
    return '';
  },

  // ---------- acciones ----------
  useNova() {
    const s = this.siege;
    if (!s.nova()) { if (!s.novaReady) { sfx.error(); } return; }
    save.seen.nova = true;
    checkAchievements();
    this.events();
  },
  cycleSpeed() {
    this.speed = this.speed % 3 + 1;
    save.settings.speed = this.speed;
    sfx.tap();
    persist();
  },
  choose(i) {
    if (this.siege.pickCard(i)) { sfx.coin(); this.events(); this.pickAge = 0; }
  },
  doReroll() {
    const s = this.siege;
    if (s.rerolls <= 0) {
      if (save.gems < GEM_COSTS.reroll) { ui.toast(`Te faltan gemas (${GEM_COSTS.reroll})`); sfx.error(); return; }
      save.gems -= GEM_COSTS.reroll;
      s.grantReroll(1);
      persist();
    }
    if (s.reroll()) { sfx.whoosh(); this.pickAge = 0; }
  },
  async pause() {
    const v = await ui.modal({
      title: 'Pausa',
      buttons: [
        { label: 'Abandonar', value: 'quit', secondary: true },
        { label: save.settings.sound ? 'Silenciar' : 'Sonido', value: 'sound', secondary: true },
        { label: 'Seguir', value: null },
      ],
    });
    if (v === 'quit') scenes.switch('menu');
    else if (v === 'sound') toggleSound();
  },

  // ---------- eventos del motor -> sonido, partículas y números ----------
  events() {
    const evs = this.siege.drain();
    const fx = !save.settings.reduceFx;
    const T = this.siege.tower;
    for (const ev of evs) {
      switch (ev.type) {
        case 'shoot': {
          const mx = ev.x + Math.cos(ev.angle) * (ev.drone ? 6 : 28);
          const my = ev.y - (ev.drone ? 0 : 4) + Math.sin(ev.angle) * (ev.drone ? 6 : 28);
          if (!ev.drone) { renderer.addFlash(mx, my, skin().bolt, 9); if (okShot()) sfx.tone({ freq: [980, 520], dur: 0.05, type: 'square', gain: 0.045 }); }
          else if (fx) renderer.addFlash(mx, my, skin().core, 5);
          break;
        }
        case 'hit': {
          if (ev.crit) floats.add(ev.x, ev.y - 10, fmt(ev.amount), { color: '#ffe27a', size: 22, life: 0.8 });
          else if (save.settings.numbers && okNum()) floats.add(ev.x + rnd(-7, 7), ev.y - 8, fmt(ev.amount), { color: HIT_COLORS[ev.kind] || '#fff', size: 12, life: 0.5, vy: -42 });
          if (fx && ev.kind === 'proj') particles.emit({ x: ev.x, y: ev.y, count: 2, speed: 90, colors: [skin().bolt, '#fff'], life: 0.22, gravity: 0, size: 3, drag: 0.9 });
          break;
        }
        case 'kill': {
          const col = KILL_COLORS[ev.kind] || '#fff';
          particles.emit({ x: ev.x, y: ev.y, count: ev.boss ? 70 : fx ? 8 + Math.min(10, Math.round(ev.r)) : 3, speed: ev.boss ? 280 : 150, colors: [col, '#fff', skin().core], life: ev.boss ? 1.1 : 0.5, gravity: 0, drag: 0.91, size: ev.boss ? 7 : 3.6 });
          if (okPop()) sfx.pop(0.9 + Math.min(0.9, this.siege.combo.n * 0.03));
          if (ev.r >= 16 && !ev.boss) floats.add(ev.x, ev.y - ev.r - 8, `+${fmt(ev.coins)}`, { color: '#9fe8ff', size: 15, life: 0.9 });
          break;
        }
        case 'explosion':
          renderer.addRing(ev.x, ev.y, ev.r, { life: 0.28, color: '#ffb86b', width: 3, r0: 6 });
          if (okBoom()) sfx.thud();
          break;
        case 'chain': renderer.addBolt(ev.pts); sfx.tone({ freq: [1400, 300], dur: 0.08, type: 'sawtooth', gain: 0.05 }); break;
        case 'block': particles.emit({ x: ev.x, y: ev.y, count: 5, speed: 100, colors: ['#ff9ac8', '#fff'], life: 0.25, gravity: 0, size: 3 }); break;
        case 'execute': floats.add(ev.x, ev.y - 16, '¡Ejecutado!', { color: '#ff7a8a', size: 14, life: 0.8 }); break;
        case 'eshot': break;
        case 'hurt':
          renderer.hurt = 1;
          if (fx) shake.hit(Math.min(8, 2 + ev.dmg * 0.02), 0.18);
          if (okThud()) sfx.thud();
          break;
        case 'levelup': sfx.success(); break;
        case 'pick': floats.add(T.x, T.y - 70, '¡Mejora!', { color: '#c9b4ff', size: 18, life: 0.9 }); break;
        case 'wave':
          if (ev.wave > 1) { this.say(ev.boss ? `¡JEFE · OLEADA ${ev.wave}!` : `OLEADA ${ev.wave}`, '', ev.boss ? '#ff6a86' : '#fff'); sfx.whoosh(); }
          if (ev.boss && fx) shake.hit(7, 0.5);
          break;
        case 'bossSpawn': sfx.tone({ freq: [120, 60], dur: 0.7, type: 'sawtooth', gain: 0.16 }); ui.toast(`¡${ev.name}!`); break;
        case 'bossDown':
          sfx.fanfare();
          if (fx) shake.hit(14, 0.7);
          renderer.addRing(ev.x, ev.y, 220, { life: 0.8, color: '#ffd96a', width: 6 });
          floats.add(ev.x, ev.y - 20, '¡JEFE DERROTADO!', { color: '#ffd96a', size: 26, life: 1.6 });
          break;
        case 'summon': renderer.addRing(ev.x, ev.y, 60, { life: 0.5, color: '#c77dff', width: 3 }); break;
        case 'charge': renderer.addRing(ev.x, ev.y, 70, { life: 0.45, color: '#ff4a4a', width: 4 }); sfx.tone({ freq: [300, 900], dur: 0.35, type: 'sawtooth', gain: 0.08 }); break;
        case 'nova':
          renderer.addRing(T.x, T.y, 420, { life: 0.7, color: skin().bolt, width: 9 });
          renderer.addRing(T.x, T.y, 300, { life: 0.5, color: skin().core, width: 5 });
          renderer.novaGlow = 0.45;
          if (fx) shake.hit(10, 0.45);
          sfx.whoosh(); sfx.tone({ freq: [200, 1200], dur: 0.4, type: 'sine', gain: 0.18 });
          break;
        case 'revive':
          renderer.addRing(T.x, T.y, 380, { life: 0.8, color: '#ffe27a', width: 8 });
          sfx.success();
          break;
        case 'death':
          if (fx) shake.hit(16, 0.8);
          sfx.error();
          break;
        default: break;
      }
    }
  },

  // ---------- bucle ----------
  update(dt) {
    const s = this.siege;
    renderer.update(dt, s);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.7) this.banner = null; }
    if (ui.busy) return;
    if (s.pending) {
      if (!this.wasPending) { this.pickAge = 0; this.hover = -1; }
      this.pickAge += dt;
    }
    this.wasPending = !!s.pending;
    if (!s.pending && !s.over) {
      for (let i = 0; i < this.speed; i++) {
        s.update(dt);
        this.events();
        if (s.pending || s.over) break;
      }
    }
    if (s.pending) this.events();
    if (s.over && !this.ended) { this.ended = true; this.finish(); }
  },

  render(ctx) {
    const s = this.siege;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    renderer.draw(ctx, s);
    particles.render(ctx);
    floats.render(ctx);
    ctx.restore();
    if (renderer.novaGlow > 0) { ctx.fillStyle = `rgba(255,255,255,${renderer.novaGlow * 0.5})`; ctx.fillRect(0, 0, GAME.width, GAME.height); }
    if (renderer.hurt > 0.01) {
      const g = ctx.createRadialGradient(240, 400, 220, 240, 400, 520);
      g.addColorStop(0, 'rgba(255,40,70,0)'); g.addColorStop(1, `rgba(255,40,70,${renderer.hurt * 0.35})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, GAME.width, GAME.height);
    }
    renderer.drawHud(ctx, s, { speed: this.speed, hint: this.hintText(), modeLabel: this.modeLabel });
    if (this.banner) {
      const b = this.banner;
      const k = b.t / 1.7;
      const a = Math.sin(Math.PI * clamp(k, 0, 1));
      ctx.save(); ctx.globalAlpha = clamp(a * 1.6, 0, 1); ctx.translate(240, 210); const sc = 0.9 + 0.2 * Math.min(1, k * 3); ctx.scale(sc, sc);
      text(ctx, b.title, 0, 0, { size: 38, align: 'center', weight: '900', color: b.color, shadow: 'rgba(0,0,20,0.85)' });
      if (b.sub) text(ctx, b.sub, 0, 32, { size: 14, align: 'center', color: 'rgba(230,235,255,0.9)', shadow: 'rgba(0,0,20,0.85)' });
      ctx.restore();
    }
    if (s.pending) renderer.drawPick(ctx, s, { hover: this.hover, age: this.pickAge, gems: save.gems, rerollGems: GEM_COSTS.reroll });
  },

  // ---------- entrada ----------
  pointer(e) {
    if (ui.busy) return;
    const s = this.siege;
    if (s.pending) {
      if (e.type === 'hover' || e.type === 'move') { this.hover = [0, 1, 2].find((i) => hit(e.x, e.y, pickRect(i))) ?? -1; return; }
      if (e.type !== 'tap' || this.pickAge < 0.25) return;
      const i = [0, 1, 2].find((k) => k < s.pending.choices.length && hit(e.x, e.y, pickRect(k)));
      if (i !== undefined) this.choose(i);
      else if (hit(e.x, e.y, PICK.reroll)) this.doReroll();
      return;
    }
    if (s.over) return;
    if (e.type === 'down') {
      if (hitCircle(e.x, e.y, HUD.nova.x, HUD.nova.y, HUD.nova.r + 6)) { this.useNova(); return; }
      if (hit(e.x, e.y, HUD.speed) || hit(e.x, e.y, HUD.pause)) return;
      if (e.y > 124 && e.y < 706 && s.focusAt(e.x, e.y)) {
        save.seen.focus = true;
        sfx.tap();
        renderer.addRing(e.x, e.y, 26, { life: 0.25, color: skin().bolt, width: 2, r0: 6 });
      }
      return;
    }
    if (e.type === 'tap') {
      if (hit(e.x, e.y, HUD.speed)) this.cycleSpeed();
      else if (hit(e.x, e.y, HUD.pause)) this.pause();
    }
  },

  // ---------- fin de partida ----------
  async finish() {
    const s = this.siege;
    for (;;) {
      const sum = s.summary();
      const previewBest = sum.wave > save.best && this.mode !== 'daily';
      const coins = Math.floor(sum.coins);
      const tip = (DEATH_TIPS.find((d) => d.by.includes(sum.killedBy)) || DEATH_TIPS[4]).tip;
      const mm = Math.floor(sum.time / 60);
      const ss = String(Math.floor(sum.time % 60)).padStart(2, '0');
      const content = el('div', { class: 'bc-res' }, [
        el('div', { class: 'bc-sub', text: `Te derrotó: ${sum.killedBy}` }),
        el('div', { class: 'bc-big', text: `Oleada ${sum.wave}` }),
        previewBest ? el('div', { class: 'bc-new', text: '¡Nuevo récord!' }) : el('div', { class: 'bc-sub', text: `Récord: oleada ${Math.max(save.best, sum.wave)}` }),
        el('div', { class: 'bc-stats' }, [
          el('div', {}, [el('b', { text: String(sum.kills) }), 'bajas']),
          el('div', {}, [el('b', { text: String(sum.level) }), 'nivel']),
          el('div', {}, [el('b', { text: `${mm}:${ss}` }), 'tiempo']),
          el('div', {}, [el('b', { text: `+${fmt(coins)}` }), 'cristales']),
        ]),
        el('div', { class: 'bc-tip', text: tip }),
      ]);
      const buttons = [];
      const byGems = save.gems >= GEM_COSTS.revive;
      if (!this.settled && !s.revived && (byGems || ads.rewardedAvailable)) buttons.push({ label: byGems ? `Revivir · ${GEM_COSTS.revive} gemas` : 'Revivir (anuncio)', value: 'revive' });
      if (!sum.doubled && ads.rewardedAvailable) buttons.push({ label: 'Duplicar cristales (anuncio)', value: 'double' });
      buttons.push({ label: TEXT.lab, value: 'lab', secondary: true }, { label: 'Menú', value: 'menu', secondary: true }, { label: TEXT.retry, value: 'retry' });
      const choice = await ui.modal({ title: TEXT.gameOver, content, buttons });

      if (choice === 'revive') {
        let ok = false;
        if (save.gems >= GEM_COSTS.revive) { save.gems -= GEM_COSTS.revive; ok = true; } else ok = (await ads.showRewarded('revive')).rewarded;
        if (ok && s.revive()) { persist(); this.ended = false; this.events(); analytics.track('revive', { wave: s.wave }); return; }
        continue;
      }
      if (choice === 'double') {
        const r = await ads.showRewarded('double_coins');
        if (r.rewarded) {
          this.settle();
          const extra = doubleRun(save, sum);
          persist(); sfx.coin(); ui.toast(`+${fmt(extra)} cristales`);
        }
        continue;
      }
      const res = this.settle();
      if (res && !res.duplicate) {
        const parts = [];
        if (res.gems) parts.push(`+${res.gems} gemas`);
        if (res.dailyBonus) parts.push(`+${res.dailyBonus} del asedio`);
        if (parts.length) ui.toast(parts.join(' · '));
      }
      if (previewBest) sfx.fanfare();
      await ads.maybeInterstitial('run_end');
      if (choice === 'retry') { analytics.track(Events.RETRY, { mode: this.mode }); scenes.switch('game', { mode: this.mode }, { duration: 0.3 }); }
      else if (choice === 'lab') scenes.switch('lab');
      else scenes.switch('menu');
      return;
    }
  },
};
scenes.register('game', game);

// ---------- Taller ----------
const SECTION_COLORS = { ataque: '#ff6a6a', defensa: '#4cd0ff', utilidad: '#ffd24a' };
const lab = {
  enter({ tab = 0 } = {}) {
    this.tab = tab;
    this.t = 0;
    this.tabs = new Tabs({ x: 16, y: 120, w: 448, h: 40, tabs: [...LAB_TABS.map((x) => x.name), 'Reforja'], active: tab, color: '#5b6cff', onChange: (i) => { this.tab = i; this.refresh(); sfx.tap(); } });
    this.list = new ScrollList({
      x: 16, y: 170, w: 448, h: 528, itemHeight: 82, gap: 8, padding: 6,
      renderItem: (ctx, d, i, r, pressed) => this.row(ctx, d, r, pressed),
      onTap: (d) => this.buy(d),
    });
    this.buttons = [
      new Button({ x: 16, y: 722, w: 130, h: 56, label: 'Volver', color: 'rgba(255,255,255,0.16)', size: 18, onTap: () => { sfx.tap(); scenes.switch('menu'); } }),
      new Button({ x: 158, y: 722, w: 306, h: 56, label: TEXT.play, color: '#3d6bff', size: 24, onTap: () => { sfx.tap(); scenes.switch('game', { mode: 'normal' }); } }),
    ];
    this.reforgeBtn = new Button({ x: 70, y: 560, w: 340, h: 60, label: 'Reforjar', color: '#d2892b', size: 24, onTap: () => this.doReforge() });
    this.refresh();
  },
  refresh() {
    const id = LAB_TABS[this.tab]?.id;
    this.list.setItems(this.tab < LAB_TABS.length ? LAB.filter((d) => d.tab === id) : []);
    this.list.offset = 0;
  },
  buy(d) {
    const lv = labLevel(save, d.id);
    const cost = labCost(d, lv);
    const res = buyLab(save, d.id);
    if (res.ok) {
      persist(); sfx.coin(); checkAchievements();
      analytics.track(Events.UNLOCK, { lab: d.id, level: res.level });
      particles.emit({ x: 240, y: 300, count: 14, speed: 160, colors: ['#9fe8ff', '#fff', '#b88cff'], life: 0.6, gravity: 80, size: 4, shape: 'star' });
    } else if (res.reason === 'cristales') {
      sfx.error(); shake.hit(4, 0.2);
      ui.toast(`Te faltan ${fmt(cost - save.coins)} cristales`);
    } else if (res.reason === 'maximo') ui.toast('Nivel máximo');
  },
  async doReforge() {
    const gain = reforgeShards(save.cycleBest);
    if (gain <= 0) { ui.toast(`Necesitas llegar a la oleada ${BALANCE.reforge.minWave}`); return; }
    const ok = await ui.confirm('Reforjar el bastión', `Reinicias el Taller y tus cristales. Ganas ${gain} esquirlas: cada una da +${Math.round(BALANCE.reforge.perShard * 100)}% de daño, vida y cristales para siempre.`, { ok: 'Reforjar', cancel: 'Ahora no' });
    if (!ok) return;
    const r = reforge(save);
    persist(); checkAchievements(); analytics.track(Events.PRESTIGE, { gain: r.gain, shards: save.shards });
    sfx.fanfare(); shake.hit(10, 0.5);
    ui.toast(`+${r.gain} esquirlas`);
    this.tab = 0; this.tabs.active = 0; this.refresh();
  },
  row(ctx, d, r, pressed) {
    const lv = labLevel(save, d.id);
    const maxed = lv >= d.max;
    const cost = labCost(d, lv);
    const can = !maxed && save.coins >= cost;
    const y = r.y + (pressed ? 2 : 0);
    fillRoundRect(ctx, r.x, y + 3, r.w, r.h - 2, 16, 'rgba(0,0,10,0.35)');
    fillRoundRect(ctx, r.x, y, r.w, r.h - 2, 16, can ? 'rgba(62,78,190,0.78)' : 'rgba(26,30,80,0.8)');
    fillRoundRect(ctx, r.x, y, 7, r.h - 2, 3, SECTION_COLORS[d.tab] || '#fff');
    text(ctx, d.name, r.x + 20, y + 22, { size: 18, weight: '800', color: '#fff' });
    text(ctx, lv > 0 ? d.eff(lv) : 'Sin mejorar', r.x + 20, y + 44, { size: 13, color: 'rgba(210,220,255,0.75)', maxWidth: 250 });
    if (!maxed) text(ctx, `→ ${d.eff(lv + 1)}`, r.x + 20, y + 62, { size: 13, weight: '700', color: can ? '#9dffb4' : 'rgba(180,255,200,0.55)', maxWidth: 250 });
    text(ctx, `Nv ${lv}`, r.x + 262, y + 22, { size: 13, weight: '800', color: 'rgba(210,220,255,0.7)' });
    const bx = r.x + r.w - 130; const bw = 118; const bh = 54;
    fillRoundRect(ctx, bx, y + 10, bw, bh, 14, maxed ? 'rgba(255,255,255,0.1)' : can ? '#27b86e' : 'rgba(0,0,0,0.35)');
    if (maxed) text(ctx, 'MÁX', bx + bw / 2, y + 10 + bh / 2, { size: 18, align: 'center', weight: '900', color: '#ffd96a' });
    else {
      drawCoin(ctx, bx + 18, y + 10 + bh / 2, 8);
      text(ctx, fmt(cost), bx + bw - 10, y + 10 + bh / 2, { size: 17, align: 'right', weight: '900', color: can ? '#fff' : 'rgba(255,255,255,0.55)' });
    }
  },
  update(dt) {
    this.t += dt;
    renderer.update(dt, null);
    this.list.update(dt);
    for (const b of this.buttons) b.update(dt);
    this.reforgeBtn.update(dt);
  },
  render(ctx) {
    renderer.drawBackground(ctx);
    text(ctx, 'TALLER', 240, 38, { size: 32, align: 'center', weight: '900', color: '#fff', shadow: 'rgba(40,20,120,0.9)' });
    fillRoundRect(ctx, 16, 62, 448, 36, 18, 'rgba(8,8,32,0.65)');
    drawCoin(ctx, 40, 80, 9);
    text(ctx, fmt(save.coins), 56, 80, { size: 17, weight: '900', color: '#e8fbff' });
    drawGem(ctx, 190, 80, 9);
    text(ctx, String(save.gems), 206, 80, { size: 17, weight: '900', color: '#ffd0f4' });
    drawShard(ctx, 290, 80, 9);
    text(ctx, `${save.shards}`, 306, 80, { size: 17, weight: '900', color: '#ffe9a8' });
    const st = computeStats({ lab: save.lab, shards: save.shards });
    text(ctx, `${fmt(dps(st))} DPS · ${fmt(st.maxHp)} vida`, 454, 80, { size: 12, weight: '800', align: 'right', color: 'rgba(210,220,255,0.8)' });
    this.tabs.render(ctx);
    if (this.tab < LAB_TABS.length) this.list.render(ctx);
    else this.renderReforge(ctx);
    for (const b of this.buttons) b.render(ctx);
    particles.render(ctx); floats.render(ctx);
  },
  renderReforge(ctx) {
    fillRoundRect(ctx, 16, 170, 448, 528, 16, 'rgba(8,8,32,0.6)');
    text(ctx, 'REFORJA', 240, 214, { size: 30, align: 'center', weight: '900', color: '#ffd96a', shadow: 'rgba(0,0,0,0.6)' });
    const lines = [
      'Cuando el Taller ya no te basta, reinicia el bastión:',
      'pierdes las mejoras del Taller y los cristales,',
      'pero ganas Esquirlas que dan daño, vida y',
      `cristales ×${(1 + BALANCE.reforge.perShard).toFixed(2).replace('.', ',')} cada una, para siempre.`,
    ];
    lines.forEach((l, i) => text(ctx, l, 240, 252 + i * 22, { size: 14, align: 'center', color: 'rgba(225,230,255,0.9)' }));
    const gain = reforgeShards(save.cycleBest);
    text(ctx, `Mejor oleada de este ciclo: ${save.cycleBest} (mínimo ${BALANCE.reforge.minWave})`, 240, 372, { size: 15, align: 'center', weight: '700', color: '#fff' });
    drawShard(ctx, 150, 420, 14);
    text(ctx, `Tienes ${save.shards} · +${Math.round(save.shards * BALANCE.reforge.perShard * 100)}% al poder`, 176, 420, { size: 15, weight: '800', color: '#ffe9a8' });
    text(ctx, gain > 0 ? `Ahora ganarías ${gain} esquirlas` : 'Aún no puedes reforjar', 240, 470, { size: 20, align: 'center', weight: '900', color: gain > 0 ? '#9dffb4' : 'rgba(255,255,255,0.5)' });
    text(ctx, `Reforjas hechas: ${save.reforges}`, 240, 502, { size: 13, align: 'center', color: 'rgba(210,220,255,0.65)' });
    this.reforgeBtn.disabled = gain <= 0;
    this.reforgeBtn.render(ctx);
  },
  pointer(e) {
    if (ui.busy) return;
    for (const b of this.buttons) if (b.handle(e)) return;
    if (this.tabs.handle(e)) return;
    if (this.tab < LAB_TABS.length) this.list.handle(e);
    else this.reforgeBtn.handle(e);
  },
};
scenes.register('lab', lab);

// ---------- ajustes ----------
function toggleSound() {
  save.settings.sound = !save.settings.sound;
  sfx.setEnabled(save.settings.sound);
  persist();
}

async function openSettings() {
  const content = el('div', {});
  const rows = [
    ['Sonido', () => save.settings.sound, () => toggleSound()],
    ['Reducir efectos (menos destellos y sacudidas)', () => save.settings.reduceFx, () => { save.settings.reduceFx = !save.settings.reduceFx; renderer.reduceFx = save.settings.reduceFx; persist(); }],
    ['Números de daño', () => save.settings.numbers, () => { save.settings.numbers = !save.settings.numbers; persist(); }],
  ];
  for (const [label, get, flip] of rows) {
    const b = el('button', { class: 'kit-btn secondary', style: { margin: '5px 0', width: '100%', fontSize: '.9rem' } });
    const paint = () => { b.textContent = `${get() ? '✔' : '✖'} ${label}`; };
    paint();
    b.onclick = () => { flip(); paint(); sfx.tap(); };
    content.appendChild(b);
  }
  const prog = achievementProgress(save);
  const ach = el('button', { class: 'kit-btn secondary', style: { margin: '5px 0', width: '100%', fontSize: '.9rem' }, text: `Logros (${prog.done}/${prog.total})` });
  ach.onclick = () => openAchievements();
  content.appendChild(ach);
  if (RELEASE.links.privacyPolicy) {
    const pp = el('button', { class: 'kit-btn secondary', style: { margin: '5px 0', width: '100%', fontSize: '.9rem' }, text: 'Política de privacidad' });
    pp.onclick = () => window.open(RELEASE.links.privacyPolicy, '_blank');
    content.appendChild(pp);
  }
  if (bridge && bridge.quit) {
    const q = el('button', { class: 'kit-btn secondary', style: { margin: '5px 0', width: '100%', fontSize: '.9rem' }, text: 'Salir del juego' });
    q.onclick = () => { flushMirror(); persist(); store.flush(); bridge.quit(); };
    content.appendChild(q);
  }
  content.appendChild(el('p', { style: { fontSize: '.75rem', opacity: '.7', margin: '8px 0 0' }, text: `Versión ${GAME.version} · estadísticas: ${save.stats.runs} partidas, ${save.stats.kills} bajas, ${save.stats.bossKills} jefes.` }));
  await ui.modal({ title: 'Ajustes', content, buttons: [{ label: 'Cerrar', value: null }] });
}

// ---------- logros ----------
async function openAchievements() {
  const content = el('div', { style: { textAlign: 'left' } });
  for (const a of ACHIEVEMENTS) {
    const done = !!(save.achievements && save.achievements[a.id]);
    content.appendChild(el('div', { style: { padding: '6px 4px', opacity: done ? '1' : '.55', borderBottom: '1px solid rgba(255,255,255,.08)' } }, [
      el('div', { style: { fontWeight: '800' }, text: `${done ? '✔' : '○'} ${a.name}` }),
      el('div', { style: { fontSize: '.8rem', opacity: '.85' }, text: a.desc }),
    ]));
  }
  await ui.modal({ title: 'Logros', content, buttons: [{ label: 'Cerrar', value: null }] });
}

// ---------- tienda ----------
function openShop() {
  const content = el('div', {});
  const note = el('p', { style: { fontSize: '.75rem', opacity: '.7', margin: '8px 0 0' } });
  const back = el('div', { class: 'kit-modal-back' });
  const refresh = () => {
    content.innerHTML = '';
    content.appendChild(el('div', { style: { fontWeight: '800', margin: '4px 0' }, text: 'Aspectos de la torre' }));
    for (const s of SKINS) {
      const owned = save.unlockedSkins.includes(s.id);
      if (!owned && s.iap && !iapOn) continue; // aspecto de pago real: solo si hay tienda
      const price = owned ? (save.skin === s.id ? '✓ en uso' : 'Usar') : s.iap ? 'En la tienda' : `${fmt(s.cost)} cristales`;
      const b = el('button', { class: `kit-btn${save.skin === s.id ? '' : ' secondary'}`, style: { margin: '4px 0', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.9rem' } }, [
        el('span', { text: s.name }),
        el('span', { html: `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${s.core};margin-right:6px;vertical-align:-2px"></i>${price}` }),
      ]);
      b.onclick = async () => {
        if (!owned && s.iap) { ui.toast('Cómpralo abajo'); return; }
        const r = buySkin(save, s.id);
        if (!r.ok) { sfx.error(); ui.toast(r.reason === 'cristales' ? `Te faltan ${fmt(r.cost - save.coins)} cristales` : 'No disponible'); return; }
        renderer.setSkin(s.id); persist(); checkAchievements(); sfx.tap(); refresh();
      };
      content.appendChild(b);
    }
    const iapRow = el('div', { style: { marginTop: '10px', borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: '8px' } });
    for (const p of iapOn ? IAP_CATALOG : []) {
      const owned = iap.owns(p.sku) && p.type === 'nonconsumable';
      const b = el('button', { class: 'kit-btn secondary', style: { margin: '4px 0', width: '100%', fontSize: '.9rem' }, text: owned ? `${p.title} ✓` : `${p.title} — ${p.priceLabel}` });
      b.disabled = owned;
      b.onclick = async () => { const r = await iap.purchase(p.sku); if (r.ok) { sfx.coin(); ui.toast('¡Gracias!'); refresh(); } };
      iapRow.appendChild(b);
    }
    if (iapOn) {
      const restore = el('button', { class: 'kit-btn secondary', style: { margin: '4px 0', width: '100%', fontSize: '.9rem' }, text: 'Restaurar compras' });
      restore.onclick = async () => { const got = await iap.restore(); ui.toast(got.length ? `Restauradas: ${got.length}` : 'No hay compras que restaurar'); refresh(); };
      iapRow.appendChild(restore);
      content.appendChild(iapRow);
    }
    note.textContent = `💎 ${save.gems} · ${fmt(save.coins)} cristales${platform.caps.simulatedMonetization ? ' · Versión web: compras simuladas, no se cobra nada.' : ''}`;
  };
  refresh();
  // Precios localizados de la tienda (solo si hay proveedor real).
  if (iapOn && iapProvider.decorate) iapProvider.decorate(IAP_CATALOG).then(refresh).catch(() => {});
  const box = el('div', { class: 'kit-modal' });
  const h = el('h2', { text: TEXT.shop });
  const close = el('button', { class: 'kit-btn', text: 'Cerrar', style: { marginTop: '10px', position: 'sticky', bottom: '0' } });
  close.onclick = () => { back.remove(); ui.openModals--; };
  box.append(h, content, note, close);
  back.appendChild(box);
  ui.root.appendChild(back);
  ui.openModals++;
}

// ---------- ganancias sin conexión ----------
async function checkOffline() {
  if (!save.lastSeen) { persist(); return; }
  const r = offlineReward(save, Date.now());
  if (r.coins <= 0) { persist(); return; }
  const h = (r.seconds / 3600).toFixed(1).replace('.', ',');
  const v = await ui.modal({
    title: 'La Guardia defendió el bastión',
    body: `Mientras no estabas, la Guardia nocturna vigiló ${h} h${r.capped ? ' (tope alcanzado)' : ''} y juntó ${fmt(r.coins)} cristales.`,
    buttons: [...(ads.rewardedAvailable ? [{ label: 'Duplicar (anuncio)', value: 'double' }] : []), { label: 'Recoger', value: 'ok', secondary: true }],
  });
  let total = r.coins;
  if (v === 'double') { const a = await ads.showRewarded('offline_double'); if (a.rewarded) total *= 2; }
  save.coins += total;
  analytics.track(Events.OFFLINE, { coins: total, seconds: r.seconds });
  persist(); sfx.coin(); ui.toast(`+${fmt(total)} cristales`);
}

// ---------- teclado ----------
window.addEventListener('keydown', (e) => {
  if (ui.busy || scenes.currentName !== 'game') return;
  const s = game.siege;
  if (!s) return;
  if (s.pending) {
    if (e.key >= '1' && e.key <= '3') game.choose(Number(e.key) - 1);
    else if (e.key === 'r' || e.key === 'R') game.doReroll();
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); game.useNova(); }
  else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') game.pause();
  else if (e.key === 'f' || e.key === 'F') game.cycleSpeed();
});

// ---------- arranque ----------
new Pointer(surface, (e) => {
  if (e.type === 'down' && analytics.count(Events.FIRST_ACTION) === 0) analytics.track(Events.FIRST_ACTION, { scene: scenes.currentName });
  scenes.pointer(e);
});
window.addEventListener('pagehide', () => { if (scenes.currentName === 'game') game.settle(); persist(); store.flush(); flushMirror(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); store.flush(); flushMirror(); } });

// Android/iOS: botón atrás y paso a segundo plano (las barras del sistema se ocultan desde capacitor.config.json).
if (native) {
  if (native.App) {
    native.App.addListener('appStateChange', ({ isActive }) => { if (!isActive) { persist(); store.flush(); } });
    native.App.addListener('backButton', () => {
      if (ui.busy) return;
      const n = scenes.currentName;
      if (n === 'game') { if (!game.siege.pending && !game.siege.over) game.pause(); }
      else if (n === 'lab') scenes.switch('menu');
      else if (n === 'menu') native.App.exitApp();
    });
  }
}

const loop = new GameLoop({
  pauseWhenHidden: !platform.devServer,
  update(dt) { clock += dt; tweens.update(dt); particles.update(dt); floats.update(dt); shake.update(dt); scenes.update(dt); },
  render(alpha) { scenes.render(alpha); },
});
scenes.switch('splash', {}, { duration: 0 });
loop.start();
// El service worker solo sirve para la versión web publicada: las apps nativas ya llevan sus archivos dentro.
if ('serviceWorker' in navigator && !platform.native && !platform.desktop && location.protocol !== 'file:' && !platform.devServer) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Exposición mínima para depuración y pruebas automatizadas: solo con el servidor de desarrollo, nunca en una build de tienda.
if (platform.devServer) window.__bastion = { platform, bridge, save, persist, loop, scenes, game, renderer, lab, ads, ui, ARENA, Siege, checkOffline, openSettings, openShop };
