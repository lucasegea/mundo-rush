// EventLog<T>: registro append-only de eventos tipados, con replay (plegado) determinístico.
// Es la base de "progreso como plegado de eventos" (ADR-004): el estado se deriva de los
// eventos, nunca se edita. El tiempo sale del Clock inyectado (R4).
import type { Clock } from "./clock";

/** Todo evento tiene un discriminante `type`. */
export interface TypedEvent {
  readonly type: string;
}

/** Un evento ya registrado: número de secuencia (desde 1), instante y el evento congelado. */
export interface LoggedEvent<E extends TypedEvent> {
  readonly seq: number;
  readonly at: number;
  readonly event: E;
}

export type Reducer<E extends TypedEvent, S> = (state: S, event: E, entry: LoggedEvent<E>) => S;

/** Un manejador por tipo de evento; los tipos sin manejador dejan el estado igual. */
export type Handlers<E extends TypedEvent, S> = {
  readonly [K in E["type"]]?: (state: S, event: Extract<E, { readonly type: K }>, entry: LoggedEvent<E>) => S;
};

export interface EventLog<E extends TypedEvent> {
  /** Agrega un evento al final. Devuelve el registro creado. */
  append(event: E): LoggedEvent<E>;
  /** Cantidad de eventos registrados. */
  readonly size: number;
  /** Todos los registros, en orden (copia: mutarla no toca el log). */
  entries(): readonly LoggedEvent<E>[];
  /** Los registros con seq mayor que `seq`. */
  since(seq: number): readonly LoggedEvent<E>[];
  /** Pliega todos los eventos, en orden, desde `initial`. */
  replay<S>(reducer: Reducer<E, S>, initial: S): S;
}

export class EventLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventLogError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function assertEvent(event: TypedEvent, where: string): void {
  if (event === null || typeof event !== "object" || typeof event.type !== "string" || event.type === "") {
    throw new EventLogError(`${where}: el evento necesita un "type" de texto no vacío`);
  }
}

/**
 * Crea un log vacío o lo retoma desde registros guardados (`restored`), que tienen que tener
 * seq 1..n sin huecos e instantes finitos; si no, lanza EventLogError.
 */
export function createEventLog<E extends TypedEvent>(
  clock: Clock,
  restored: readonly LoggedEvent<E>[] = [],
): EventLog<E> {
  const log: LoggedEvent<E>[] = [];
  restored.forEach((entry, i) => {
    if (entry.seq !== i + 1) {
      throw new EventLogError(`restore: seq ${entry.seq} en la posición ${i}; se esperaba ${i + 1}`);
    }
    if (!Number.isFinite(entry.at)) throw new EventLogError(`restore: instante inválido en seq ${entry.seq}`);
    assertEvent(entry.event, `restore seq ${entry.seq}`);
    log.push(deepFreeze({ seq: entry.seq, at: entry.at, event: entry.event }));
  });

  return {
    append(event) {
      assertEvent(event, "append");
      const entry = deepFreeze({ seq: log.length + 1, at: clock.now(), event });
      log.push(entry);
      return entry;
    },
    get size() {
      return log.length;
    },
    entries: () => log.slice(),
    since: (seq) => log.slice(Math.max(0, Math.floor(seq))),
    replay: (reducer, initial) => log.reduce((state, entry) => reducer(state, entry.event, entry), initial),
  };
}

/** Arma un Reducer a partir de un manejador por tipo de evento. */
export function reducerFrom<E extends TypedEvent, S>(handlers: Handlers<E, S>): Reducer<E, S> {
  return (state, event, entry) => {
    const handler = (handlers as Record<string, Reducer<E, S> | undefined>)[event.type];
    return handler ? handler(state, event, entry) : state;
  };
}
