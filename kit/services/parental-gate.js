// Puerta parental: una pregunta aritmética sencilla antes de compras, enlaces externos
// o ajustes sensibles en juegos dirigidos a menores. No es seguridad fuerte; es la
// barrera que piden las políticas de tiendas para que un niño no actúe por accidente.

export function createParentalGate(ui, { rng = Math.random, attempts = 2 } = {}) {
  return async function parentalGate() {
    for (let i = 0; i < attempts; i++) {
      const a = 3 + Math.floor(rng() * 7);
      const b = 3 + Math.floor(rng() * 7);
      const answer = await ui.prompt('Zona para adultos', `Pide a un adulto que responda: ¿cuánto es ${a} × ${b}?`, { type: 'number', ok: 'Continuar' });
      if (answer === null) return false;
      if (parseInt(answer, 10) === a * b) return true;
      ui.toast('Respuesta incorrecta');
    }
    return false;
  };
}
