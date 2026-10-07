// Reloj inyectable (R4): el núcleo nunca llama Date.now(). Quien arranca el núcleo
// (apps/web, apps/server) le pasa un Clock real; los tests usan el manual.

/** Fuente de tiempo en milisegundos desde la época Unix. */
export interface Clock {
  now(): number;
}

/** Reloj controlado a mano: avanza solo cuando se le pide. */
export interface ManualClock extends Clock {
  advance(ms: number): number;
  set(ms: number): void;
}

function assertTime(ms: number, what: string): void {
  if (!Number.isFinite(ms)) throw new RangeError(`${what}: se esperaba un número finito, llegó ${ms}`);
}

/** Crea un reloj manual que arranca en `startMs` y nunca retrocede. */
export function createManualClock(startMs = 0): ManualClock {
  assertTime(startMs, "createManualClock");
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      assertTime(ms, "advance");
      if (ms < 0) throw new RangeError(`advance: el reloj no retrocede (${ms} ms)`);
      current += ms;
      return current;
    },
    set(ms) {
      assertTime(ms, "set");
      if (ms < current) throw new RangeError(`set: el reloj no retrocede (${ms} < ${current})`);
      current = ms;
    },
  };
}

/**
 * Adapta una función de tiempo del entorno (p. ej. `() => Date.now()` en apps/) a Clock.
 * Vive en el núcleo para que cada app no reinvente la validación; la función la pone la app.
 */
export function clockFrom(source: () => number): Clock {
  return {
    now() {
      const ms = source();
      assertTime(ms, "clockFrom");
      return ms;
    },
  };
}
