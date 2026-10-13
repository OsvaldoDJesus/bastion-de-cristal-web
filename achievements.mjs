// Logros: se calculan solo a partir del guardado (puro, probable en Node) y se desbloquean una vez.
// En Steam cada logro se refleja con el nombre de API `ACH_<ID>` definido en Steamworks (ver docs/release/steam.md).

export const ACHIEVEMENTS = [
  { id: 'primer-jefe', name: 'Primer jefe', desc: 'Derrota al Coloso Umbrío (oleada 10).', test: (s) => !!s.milestones[10] },
  { id: 'jefe-20', name: 'Reina destronada', desc: 'Derrota a la Reina del Enjambre (oleada 20).', test: (s) => !!s.milestones[20] },
  { id: 'jefe-30', name: 'Vacío saciado', desc: 'Derrota al Devorador del Vacío (oleada 30).', test: (s) => !!s.milestones[30] },
  { id: 'jefe-50', name: 'Cazador de jefes', desc: 'Derrota al jefe de la oleada 50.', test: (s) => !!s.milestones[50] },
  { id: 'oleada-25', name: 'Cuarto de camino', desc: 'Llega a la oleada 25.', test: (s) => s.best >= 25 },
  { id: 'oleada-50', name: 'Medio centenar', desc: 'Llega a la oleada 50.', test: (s) => s.best >= 50 },
  { id: 'oleada-100', name: 'Bastión eterno', desc: 'Llega a la oleada 100.', test: (s) => s.best >= 100 },
  { id: 'primera-nova', name: 'Supernova', desc: 'Lanza tu primera Nova.', test: (s) => !!s.seen.nova },
  { id: 'mil-bajas', name: 'Mil sombras', desc: 'Acumula 1.000 bajas.', test: (s) => s.stats.kills >= 1000 },
  { id: 'diez-mil-bajas', name: 'Marea negra', desc: 'Acumula 10.000 bajas.', test: (s) => s.stats.kills >= 10000 },
  { id: 'reforja', name: 'Forjado de nuevo', desc: 'Haz tu primera Reforja.', test: (s) => s.reforges >= 1 },
  { id: 'racha-3', name: 'Guardia constante', desc: 'Juega el Asedio diario 3 días seguidos.', test: (s) => s.streak.count >= 3 },
  { id: 'maestro-taller', name: 'Maestro del Taller', desc: 'Lleva una mejora del Taller al nivel 25.', test: (s) => Object.values(s.lab).some((l) => l >= 25) },
  { id: 'coleccionista', name: 'Coleccionista', desc: 'Desbloquea 3 aspectos de la torre.', test: (s) => s.unlockedSkins.length >= 3 },
];

export const steamApiName = (id) => `ACH_${id.toUpperCase().replace(/-/g, '_')}`;

// Marca como desbloqueados los logros que ya se cumplen y devuelve los nuevos (para avisar al jugador y a Steam).
export function unlockNew(save, now = Date.now()) {
  if (!save.achievements) save.achievements = {};
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!save.achievements[a.id] && a.test(save)) {
      save.achievements[a.id] = now;
      fresh.push(a);
    }
  }
  return fresh;
}

export const achievementProgress = (save) => ({ done: Object.keys(save.achievements || {}).length, total: ACHIEVEMENTS.length });
