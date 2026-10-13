// Perfil del jugador: guardado, Taller, recompensas de partida, Reforja y ganancias sin conexión.
// Todo es puro (recibe el guardado y devuelve resultados) para probarlo en Node.
import { computeOffline } from './kit/services/offline.js';
import { BALANCE, GAME, LAB, SKINS } from './content.mjs';

export function createSave() {
  return {
    version: GAME.saveVersion,
    best: 0,            // mejor oleada de siempre
    cycleBest: 0,       // mejor oleada desde la última Reforja
    coins: 0,           // cristales
    gems: 10,           // premium: revivir y relanzar
    shards: 0,          // esquirlas de Reforja
    reforges: 0,
    lab: {},            // id -> nivel
    skin: 'cristal',
    unlockedSkins: ['cristal'],
    noAds: false,
    entitlements: {},
    stats: { runs: 0, kills: 0, bossKills: 0, bestRunCoins: 0, playSeconds: 0 },
    dailyBest: {},      // 'YYYY-MM-DD' -> oleada
    streak: { last: '', count: 0 },
    milestones: {},     // oleada de jefe -> true (gemas ya cobradas)
    lastRunId: '',
    achievements: {},   // id -> marca de tiempo del desbloqueo
    seen: {},
    settings: { sound: true, reduceFx: false, numbers: true, speed: 1 },
    lastSeen: 0,
  };
}

export function validateSave(s) {
  return !!(s && typeof s === 'object' && typeof s.best === 'number' && typeof s.coins === 'number'
    && typeof s.gems === 'number' && s.lab && typeof s.lab === 'object' && Array.isArray(s.unlockedSkins)
    && s.stats && typeof s.stats === 'object' && s.settings && typeof s.settings === 'object');
}

export const MIGRATIONS = {
  // 2: (s) => ({ ...s, nuevoCampo: 0 }),
};

// ---------- Taller ----------
export const labDef = (id) => LAB.find((d) => d.id === id);
export const labCost = (def, level) => Math.round(def.base * Math.pow(def.growth, level));
export const labLevel = (save, id) => (save.lab[id] | 0);

export function buyLab(save, id) {
  const def = labDef(id);
  if (!def) return { ok: false, reason: 'desconocida' };
  const level = labLevel(save, id);
  if (level >= def.max) return { ok: false, reason: 'maximo' };
  const cost = labCost(def, level);
  if (save.coins < cost) return { ok: false, reason: 'cristales', cost };
  save.coins -= cost;
  save.lab[id] = level + 1;
  return { ok: true, cost, level: level + 1 };
}

// ---------- Aspectos ----------
export function buySkin(save, id) {
  const s = SKINS.find((x) => x.id === id);
  if (!s) return { ok: false, reason: 'desconocido' };
  if (save.unlockedSkins.includes(id)) { save.skin = id; return { ok: true, free: true }; }
  if (s.iap) return { ok: false, reason: 'tienda' };
  if (save.coins < s.cost) return { ok: false, reason: 'cristales', cost: s.cost };
  save.coins -= s.cost;
  save.unlockedSkins.push(id);
  save.skin = id;
  return { ok: true, cost: s.cost };
}

// ---------- Fin de partida ----------
const dayNumber = (key) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);

// Cobra la partida UNA sola vez (por identificador). Devuelve lo cobrado para mostrarlo.
export function settleRun(save, run, { dayKey = '' } = {}) {
  if (save.lastRunId === run.id) return { duplicate: true, coins: 0, gems: 0, newBest: false };
  save.lastRunId = run.id;
  const coins = Math.floor(run.coins);
  save.coins += coins;
  save.stats.runs += 1;
  save.stats.kills += run.kills;
  save.stats.bossKills += run.bossWaves.length;
  save.stats.playSeconds += Math.floor(run.time);
  if (run.mode !== 'daily') save.stats.bestRunCoins = Math.max(save.stats.bestRunCoins, coins);

  let gems = 0;
  for (const w of run.bossWaves) {
    if (!save.milestones[w]) { save.milestones[w] = true; gems += BALANCE.gemMilestoneReward; }
  }
  let dailyBonus = 0;
  let firstDaily = false;
  const newBest = run.wave > save.best;
  if (run.mode === 'daily') {
    firstDaily = !(dayKey in save.dailyBest);
    save.dailyBest[dayKey] = Math.max(save.dailyBest[dayKey] || 0, run.wave);
    if (firstDaily) {
      const yesterday = save.streak.last && dayNumber(dayKey) - dayNumber(save.streak.last) === 1;
      save.streak.count = yesterday ? save.streak.count + 1 : 1;
      save.streak.last = dayKey;
      gems += 3;
      dailyBonus = 40 * Math.min(7, save.streak.count);
      save.coins += dailyBonus;
    }
  } else {
    save.best = Math.max(save.best, run.wave);
    save.cycleBest = Math.max(save.cycleBest, run.wave);
  }
  save.gems += gems;
  return { duplicate: false, coins, gems, newBest: newBest && run.mode !== 'daily', dailyBonus, firstDaily };
}

// Duplica los cristales de una partida ya cobrada (anuncio con recompensa). Una vez por partida.
export function doubleRun(save, run) {
  if (run.doubled || save.lastRunId !== run.id) return 0;
  run.doubled = true;
  const extra = Math.floor(run.coins);
  save.coins += extra;
  save.stats.bestRunCoins = Math.max(save.stats.bestRunCoins, extra);
  return extra;
}

// ---------- Reforja (prestigio) ----------
export function reforgeShards(cycleBest) {
  const r = BALANCE.reforge;
  if (cycleBest < r.minWave) return 0;
  return Math.max(1, Math.floor(Math.pow(cycleBest, r.exp) / r.divisor));
}

export const canReforge = (save) => reforgeShards(save.cycleBest) > 0;

export function reforge(save) {
  const gain = reforgeShards(save.cycleBest);
  if (gain <= 0) return { ok: false, gain: 0 };
  save.shards += gain;
  save.reforges += 1;
  save.lab = {};
  save.coins = 0;
  save.cycleBest = 0;
  return { ok: true, gain };
}

// ---------- Fuera de línea ("Guardia") ----------
export function offlineReward(save, now) {
  const g = labLevel(save, 'guardia');
  const o = BALANCE.offline;
  const r = computeOffline({
    lastSeen: save.lastSeen, now, maxHours: o.baseHours + g, efficiency: o.baseEfficiency + 0.03 * g,
    ratePerSec: (save.stats.bestRunCoins || 0) / o.runSeconds, minSeconds: o.minSeconds,
  });
  return { seconds: r.seconds, capped: r.capped, coins: Math.floor(r.earned.toNumber()) };
}

// Formato corto para cifras grandes (1,2 K · 3,4 M …).
export function fmt(n) {
  n = Math.floor(n);
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = -1;
  let v = abs;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${n < 0 ? '-' : ''}${s.replace('.', ',')} ${units[i]}`;
}
