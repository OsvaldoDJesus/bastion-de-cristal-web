// Datos de Bastión de Cristal. Cambiar números y textos aquí no exige tocar el motor.
// Intención de cada curva en docs/bastion-cristal-diseno.md.

export const GAME = {
  id: 'bastion-cristal',
  title: 'Bastión de Cristal',
  version: '0.1.0',
  saveVersion: 1,
  width: 480,
  height: 800,
};

// La torre está en el centro del campo; los enemigos nacen en un círculo de radio `spawnR`
// (parte queda fuera de pantalla, así entran caminando).
export const ARENA = { cx: 240, cy: 392, towerR: 26, spawnR: 300 };

export const BALANCE = {
  // Torre sin mejoras.
  base: {
    damage: 6, fireRate: 2.0, range: 170, hp: 120, regen: 0.6,
    critChance: 0.05, critMult: 1.8, projectileSpeed: 540,
  },
  // Oleadas: duración, presupuesto de enemigos (unidades de "coste") y tope de vivos.
  wave: { baseDur: 13, durPerWave: 0.45, maxDur: 24, budgetBase: 12, budgetPerWave: 6, spawnShare: 0.85, maxAlive: 240, bossEvery: 10, bossTrickle: 0.5, burstShare: 0.3, rampStart: 0.5, rampPerWave: 0.1 },
  // Densidad: más cuerpos en pantalla con menos valor cada uno (vida, daño, cristales, XP y carga de Nova
  // se dividen entre `density`), para que la horda se vea llena sin cambiar el total de cada oleada.
  density: 1.6,
  // La vida y el daño de los enemigos crecen geométricamente con la oleada.
  hpBase: 8, hpGrowth: 1.20,
  dmgGrowth: 1.075,
  coinGrowth: 1.07,
  // Experiencia de la partida: la curva de nivel crece más rápido que la XP por baja, así las
  // subidas se espacian a medida que avanza la partida.
  xp: { base: 5, growth: 1.26, perWave: 0.06 },
  // Nova: carga por baja (coste del enemigo ×1,6); se pulsa al llenarse.
  nova: { need: 100, chargePerCost: 1.6, damageMult: 7, push: 110, stun: 0.9, invuln: 1.4 },
  combo: { window: 1.6, max: 30, perStep: 0.02, cap: 1.5 }, // racha de bajas -> más cristales
  contact: { cooldown: 0.9, margin: 2 },
  boss: { coinMult: 12, xpMult: 10, chargeBonus: 30 },
  revive: { hpFrac: 0.6, invuln: 3 },
  rerollBase: 1,
  gemMilestoneEvery: 10, gemMilestoneReward: 5,
  // Recompensa de la partida al terminar: cristales por bajas + bono por oleada.
  endBonus: { k: 5, exp: 1.35 },
  // Fuera de línea: una partida buena equivale a `offline.runSeconds` s de Guardia.
  offline: { runSeconds: 1200, baseHours: 4, baseEfficiency: 0.5, minSeconds: 60 },
  // Mejoras del Taller que se multiplican por nivel (el resto suma): así cada compra sigue notándose.
  lab: { dano: 1.09, cadencia: 1.04, vida: 1.08, monedas: 1.07 },
  // Reforja (prestigio).
  reforge: { minWave: 30, divisor: 6, exp: 1.4, perShard: 0.05 },
};

// ---------- enemigos ----------
// hp/dmg/coin/xp son factores sobre el valor de referencia de la oleada; `cost` es lo que gasta del presupuesto.
export const ENEMIES = {
  sombra:   { name: 'Sombra',   hp: 1.0,  speed: 38, r: 10,  dmg: 1.0, coin: 1.0, xp: 1.0, cost: 1.0, from: 1,  w: 10 },
  corredor: { name: 'Corredor', hp: 0.55, speed: 80, r: 8,   dmg: 0.8, coin: 1.1, xp: 1.1, cost: 1.3, from: 3,  w: 6 },
  bruto:    { name: 'Bruto',    hp: 5.0,  speed: 24, r: 17,  dmg: 2.5, coin: 4.5, xp: 4.5, cost: 4.5, from: 5,  w: 3 },
  enjambre: { name: 'Enjambre', hp: 0.28, speed: 58, r: 5.5, dmg: 0.5, coin: 0.35, xp: 0.35, cost: 0.35, from: 7, w: 4, pack: 7 },
  arquero:  { name: 'Arquero',  hp: 0.9,  speed: 36, r: 9,   dmg: 1.8, coin: 2.5, xp: 2.5, cost: 2.5, from: 9,  w: 3, range: 150, shotEvery: 2.2, shotSpeed: 170 },
  divisor:  { name: 'Divisor',  hp: 2.4,  speed: 32, r: 14,  dmg: 1.2, coin: 3.0, xp: 3.0, cost: 3.2, from: 12, w: 3, splits: 2 },
  blindado: { name: 'Blindado', hp: 3.5,  speed: 30, r: 13,  dmg: 1.8, coin: 4.0, xp: 4.0, cost: 4.0, from: 15, w: 3, armored: true, projTaken: 0.5 },
  // Cría de un Divisor.
  cria:     { name: 'Cría',     hp: 0.5,  speed: 52, r: 7,   dmg: 0.6, coin: 0.5, xp: 0.5, cost: 0, from: 999, w: 0 },
};

export const BOSSES = [
  { id: 'coloso',    name: 'Coloso Umbrío',       hp: 28, speed: 20, r: 34, dmg: 3.9, minions: { type: 'sombra', n: 4, every: 7 } },
  { id: 'reina',     name: 'Reina del Enjambre',  hp: 24, speed: 24, r: 30, dmg: 2.6, minions: { type: 'enjambre', n: 1, every: 5 } },
  { id: 'devorador', name: 'Devorador del Vacío', hp: 34, speed: 18, r: 36, dmg: 5.2, charge: { every: 8, dur: 1.4, mult: 3.2 } },
];

// ---------- cartas de la partida ----------
// Se ofrecen 3 al subir de nivel. `per` documenta el efecto por nivel (lo aplica stats.mjs).
export const CARDS = {
  dano:      { name: 'Cristal afilado',     rarity: 'comun', max: 12, w: 10, text: (l) => `Daño +${25 * l}%` },
  cadencia:  { name: 'Resonancia',          rarity: 'comun', max: 12, w: 10, text: (l) => `Cadencia +${18 * l}%` },
  multi:     { name: 'Dispersión',          rarity: 'rara',  max: 5,  w: 7,  text: (l) => `${l} proyectil${l > 1 ? 'es' : ''} extra por salva` },
  perfora:   { name: 'Lanza de luz',        rarity: 'rara',  max: 5,  w: 5,  text: (l) => `Atraviesan ${l} enemigo${l > 1 ? 's' : ''} más` },
  critico:   { name: 'Filo letal',          rarity: 'comun', max: 8,  w: 7,  text: (l) => `Crítico +${6 * l}% · daño crítico +${15 * l}%` },
  explosivo: { name: 'Fragmentación',       rarity: 'rara',  max: 6,  w: 6,  text: (l) => `Los impactos explotan (radio ${38 + 7 * l})` },
  rayo:      { name: 'Cadena de rayos',     rarity: 'rara',  max: 5,  w: 5,  text: (l) => `${30 + 5 * l}% de saltar a ${l + 1} enemigos` },
  orbita:    { name: 'Cuchillas orbitales', rarity: 'rara',  max: 6,  w: 5,  text: (l) => `${l} cuchilla${l > 1 ? 's' : ''} giratoria${l > 1 ? 's' : ''}` },
  escarcha:  { name: 'Aura de escarcha',    rarity: 'rara',  max: 6,  w: 4,  text: (l) => `Enemigos cercanos ${Math.round((0.18 + 0.06 * l) * 100)}% más lentos` },
  dron:      { name: 'Dron guardián',       rarity: 'rara',  max: 4,  w: 4,  text: (l) => `${l} dron${l > 1 ? 'es' : ''} disparan solos` },
  regen:     { name: 'Savia de cristal',    rarity: 'comun', max: 8,  w: 6,  text: (l) => `Regeneras ${(0.6 * l).toFixed(1)}% de vida por segundo` },
  escudo:    { name: 'Barrera',             rarity: 'comun', max: 6,  w: 5,  text: (l) => `Escudo de ${12 * l}% de vida, se recarga` },
  vida:      { name: 'Núcleo reforzado',    rarity: 'comun', max: 10, w: 8,  text: (l) => `Vida máxima +${25 * l}% y curas 30%` },
  espinas:   { name: 'Espinas',             rarity: 'comun', max: 5,  w: 4,  text: (l) => `Quien te ataque recibe ${l * 80}% de tu daño` },
  fortuna:   { name: 'Fortuna',             rarity: 'comun', max: 8,  w: 5,  text: (l) => `Cristales de la partida +${20 * l}%` },
  sabiduria: { name: 'Sabiduría',           rarity: 'comun', max: 5,  w: 4,  text: (l) => `Experiencia +${18 * l}%` },
  verdugo:   { name: 'Verdugo',             rarity: 'epica', max: 4,  w: 2.5, text: (l) => `Ejecuta enemigos con menos de ${10 + 4 * l}% de vida` },
  nova:      { name: 'Supernova',           rarity: 'epica', max: 5,  w: 2.5, text: (l) => `Nova carga +${25 * l}% más rápido y pega +${25 * l}%` },
};

export const RARITY = {
  comun: { name: 'Común', color: '#9fb4c7', weight: 1 },
  rara:  { name: 'Rara',  color: '#58a6ff', weight: 1 },
  epica: { name: 'Épica', color: '#c77dff', weight: 1 },
};

// Con pocas subidas hechas, siempre se ofrece algo que se note en pantalla.
export const OPENING_CARDS = ['dano', 'cadencia', 'multi', 'perfora', 'explosivo'];

// ---------- Taller (mejoras permanentes) ----------
// coste(nivel) = base · growth^nivel. `eff(l)` es el texto del efecto con l niveles.
export const LAB = [
  { id: 'dano',      tab: 'ataque',  name: 'Daño',              base: 15,  growth: 1.45, max: 999, eff: (l) => `Daño ×${Math.pow(1.09, l).toFixed(2).replace('.', ',')}` },
  { id: 'cadencia',  tab: 'ataque',  name: 'Cadencia',          base: 25,  growth: 1.45, max: 80,  eff: (l) => `Cadencia ×${Math.pow(1.04, l).toFixed(2).replace('.', ',')}` },
  { id: 'alcance',   tab: 'ataque',  name: 'Alcance',           base: 40,  growth: 1.45, max: 25,  eff: (l) => `+${4 * l} de alcance` },
  { id: 'critico',   tab: 'ataque',  name: 'Probabilidad crítica', base: 60, growth: 1.45, max: 40, eff: (l) => `+${l}% de crítico` },
  { id: 'letalidad', tab: 'ataque',  name: 'Letalidad',         base: 90,  growth: 1.45, max: 60,  eff: (l) => `+${5 * l}% de daño crítico` },
  { id: 'salvas',    tab: 'ataque',  name: 'Arsenal',           base: 900, growth: 12,   max: 3,   eff: (l) => `+${l} proyectil${l === 1 ? '' : 'es'} base` },
  { id: 'vida',      tab: 'defensa', name: 'Vida del núcleo',   base: 15,  growth: 1.45, max: 999, eff: (l) => `Vida ×${Math.pow(1.08, l).toFixed(2).replace('.', ',')}` },
  { id: 'regen',     tab: 'defensa', name: 'Regeneración',      base: 30,  growth: 1.45, max: 50,  eff: (l) => `+${(0.4 * l).toFixed(1)}% de vida por segundo` },
  { id: 'armadura',  tab: 'defensa', name: 'Armadura',          base: 50,  growth: 1.45, max: 40,  eff: (l) => `-${(1.5 * l).toFixed(1)}% de daño recibido` },
  { id: 'escudo0',   tab: 'defensa', name: 'Escudo inicial',    base: 90,  growth: 1.45, max: 20,  eff: (l) => `Escudo de ${8 * l}% de vida` },
  { id: 'monedas',   tab: 'utilidad', name: 'Cristales',        base: 40,  growth: 1.45, max: 999, eff: (l) => `Cristales ×${Math.pow(1.07, l).toFixed(2).replace('.', ',')}` },
  { id: 'xp',        tab: 'utilidad', name: 'Experiencia',      base: 35,  growth: 1.45, max: 40,  eff: (l) => `+${6 * l}% de XP` },
  { id: 'nova',      tab: 'utilidad', name: 'Nova',             base: 70,  growth: 1.45, max: 40,  eff: (l) => `Carga +${8 * l}% y daño +${10 * l}%` },
  { id: 'reroll',    tab: 'utilidad', name: 'Relanzamientos',   base: 120, growth: 4,    max: 5,   eff: (l) => `+${l} relanzamiento${l === 1 ? '' : 's'} por partida` },
  { id: 'inicio',    tab: 'utilidad', name: 'Impulso inicial',  base: 300, growth: 6,    max: 4,   eff: (l) => `Empiezas con ${l} carta${l === 1 ? '' : 's'}` },
  { id: 'guardia',   tab: 'utilidad', name: 'Guardia nocturna', base: 500, growth: 1.8,  max: 8,   eff: (l) => `Fuera de línea: ${4 + l} h al ${Math.round((0.5 + 0.03 * l) * 100)}%` },
];
export const LAB_TABS = [
  { id: 'ataque', name: 'Ataque' },
  { id: 'defensa', name: 'Defensa' },
  { id: 'utilidad', name: 'Utilidad' },
];

// ---------- aspectos de la torre ----------
export const SKINS = [
  { id: 'cristal',   name: 'Cristal',       core: '#7ae7ff', glow: '#2bb6ff', bolt: '#d4f8ff', dark: '#0c2a44', cost: 0 },
  { id: 'rubi',      name: 'Rubí',          core: '#ff9aae', glow: '#ff3b5c', bolt: '#ffd6de', dark: '#3a0c1c', cost: 1500 },
  { id: 'esmeralda', name: 'Esmeralda',     core: '#8ff7b4', glow: '#1fd172', bolt: '#d9ffe8', dark: '#0a2e1d', cost: 1500 },
  { id: 'ambar',     name: 'Ámbar dorado',  core: '#ffe08a', glow: '#ffb000', bolt: '#fff4cc', dark: '#3b2a05', cost: 0, iap: 'skin_ambar' },
];

export const IAP_CATALOG = [
  { sku: 'no_ads', title: 'Sin anuncios', desc: 'Quita los anuncios entre partidas para siempre. Los anuncios con recompensa siguen siendo opcionales.', priceLabel: '2,99 USD', type: 'nonconsumable', grant: { noAds: true } },
  { sku: 'gems_small', title: 'Puñado de gemas', desc: '80 gemas: revivir, relanzar cartas.', priceLabel: '0,99 USD', type: 'consumable', grant: { gems: 80 } },
  { sku: 'gems_big', title: 'Cofre de gemas', desc: '500 gemas.', priceLabel: '3,99 USD', type: 'consumable', grant: { gems: 500 } },
  { sku: 'skin_ambar', title: 'Torre Ámbar dorado', desc: 'Aspecto cosmético: no cambia las estadísticas.', priceLabel: '1,99 USD', type: 'nonconsumable', grant: { skins: ['ambar'] } },
];

export const GEM_COSTS = { revive: 8, reroll: 2 };

// Consejo al caer, según quién te derrotó (el Taller ofrece la respuesta).
export const DEATH_TIPS = [
  { by: ['Bruto', 'Blindado', 'Coloso Umbrío', 'Devorador del Vacío'], tip: 'Aguantan golpes: sube Daño y Armadura en el Taller, o marca al jefe con un toque.' },
  { by: ['Corredor', 'Enjambre', 'Reina del Enjambre', 'Cría'], tip: 'Te desbordan por número: la Nova, la Cadencia y las cartas de área ayudan.' },
  { by: ['Arquero'], tip: 'Disparan desde lejos: marca al Arquero con un toque y sube Alcance o el Escudo inicial.' },
  { by: ['Divisor'], tip: 'Se parten al morir: Fragmentación y Cadena de rayos limpian las crías.' },
  { by: ['Sombra'], tip: 'Sube Vida y Regeneración en el Taller para aguantar más.' },
];

export const TEXT = {
  play: 'Jugar',
  daily: 'Asedio diario',
  lab: 'Taller',
  shop: 'Tienda',
  tapToStart: 'Toca para empezar',
  gameOver: 'La torre cayó',
  retry: 'Otra vez',
  doubleReward: 'Duplicar cristales (anuncio)',
  hintFocus: 'Toca un enemigo para marcarlo como objetivo',
  hintNova: '¡Nova lista! Tócala para limpiar el campo',
};
