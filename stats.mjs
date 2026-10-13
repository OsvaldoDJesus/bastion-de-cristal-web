// Estadísticas derivadas de la torre: Taller (permanente) × cartas (partida) × esquirlas (Reforja).
// Función pura: el motor la recalcula cada vez que se elige una carta.
import { BALANCE } from './content.mjs';

export const shardMult = (shards) => 1 + BALANCE.reforge.perShard * (shards | 0);

// El Asedio diario ignora el Taller y las esquirlas: todos juegan con la misma torre base.
export function computeStats({ lab = {}, shards = 0, cards = {}, daily = false } = {}) {
  const L = daily ? {} : lab;
  const sm = daily ? 1 : shardMult(shards);
  const l = (id) => (L[id] | 0);
  const c = (id) => (cards[id] | 0);
  const B = BALANCE.base;

  const damage = B.damage * Math.pow(BALANCE.lab.dano, l('dano')) * (1 + 0.25 * c('dano')) * sm;
  const fireRate = B.fireRate * Math.pow(BALANCE.lab.cadencia, l('cadencia')) * (1 + 0.18 * c('cadencia'));
  const maxHp = B.hp * Math.pow(BALANCE.lab.vida, l('vida')) * (1 + 0.25 * c('vida')) * sm;

  return {
    damage,
    fireRate,
    range: B.range + 4 * l('alcance'),
    projectiles: 1 + l('salvas') + c('multi'),
    pierce: c('perfora'),
    projectileSpeed: B.projectileSpeed,
    critChance: Math.min(0.95, B.critChance + 0.01 * l('critico') + 0.06 * c('critico')),
    critMult: B.critMult + 0.05 * l('letalidad') + 0.15 * c('critico'),
    splash: c('explosivo') ? { radius: 38 + 7 * c('explosivo'), frac: 0.45 + 0.06 * c('explosivo') } : null,
    chain: c('rayo') ? { jumps: c('rayo') + 1, chance: 0.30 + 0.05 * c('rayo'), frac: 0.5, reach: 120 } : null,
    blades: c('orbita') ? { n: c('orbita'), dmg: damage * 0.55, radius: 62 + 3 * c('orbita'), speed: 3.2 } : null,
    drones: c('dron') ? { n: c('dron'), dmg: damage * 0.5, rate: fireRate * 0.7, range: 230 } : null,
    frost: c('escarcha') ? { slow: 0.18 + 0.06 * c('escarcha'), radius: 105 + 8 * c('escarcha') } : null,
    maxHp,
    regen: B.regen + maxHp * (0.004 * l('regen') + 0.006 * c('regen')),
    armor: Math.min(0.7, 0.015 * l('armadura')),
    shieldMax: maxHp * (0.08 * l('escudo0') + 0.12 * c('escudo')),
    thorns: damage * 0.8 * c('espinas'),
    coinMult: Math.pow(BALANCE.lab.monedas, l('monedas')) * (1 + 0.20 * c('fortuna')) * sm,
    xpMult: (1 + 0.06 * l('xp')) * (1 + 0.18 * c('sabiduria')),
    execute: c('verdugo') ? 0.10 + 0.04 * c('verdugo') : 0,
    novaCharge: (1 + 0.08 * l('nova')) * (1 + 0.25 * c('nova')),
    novaDamage: BALANCE.nova.damageMult * (1 + 0.10 * l('nova')) * (1 + 0.25 * c('nova')),
    rerolls: BALANCE.rerollBase + l('reroll'),
    startPicks: l('inicio'),
  };
}

// Daño por segundo teórico (sin crítico ni área): sirve para mostrar el poder en el Taller.
export function dps(stats) {
  const crit = 1 + stats.critChance * (stats.critMult - 1);
  return stats.damage * stats.fireRate * stats.projectiles * crit;
}
