// Injectable clock (R4): the core never calls Date.now(). Whoever starts the core
// (apps/web, apps/server) passes it a real Clock; tests use the manual one.

/** Time source in milliseconds since the Unix epoch. */
export interface Clock {
  now(): number;
}

/** Hand-controlled clock: it advances only when asked. */
export interface ManualClock extends Clock {
  advance(ms: number): number;
  set(ms: number): void;
}

function assertTime(ms: number, what: string): void {
  if (!Number.isFinite(ms)) throw new RangeError(`${what}: se esperaba un número finito, llegó ${ms}`);
}

/** Creates a manual clock that starts at `startMs` and never goes backward. */
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
 * Adapts an environment time function (e.g. `() => Date.now()` in apps/) to Clock.
 * It lives in the core so each app does not reinvent the validation; the function is supplied by the app.
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
