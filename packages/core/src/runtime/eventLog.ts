// EventLog<T>: append-only log of typed events, with deterministic replay (folding).
// It is the basis of "progress as a fold of events" (ADR-004): state is derived from the
// events, never edited. Time comes from the injected Clock (R4).
import type { Clock } from "./clock";

/** Every event has a `type` discriminant. */
export interface TypedEvent {
  readonly type: string;
}

/** An already recorded event: sequence number (from 1), instant and the frozen event. */
export interface LoggedEvent<E extends TypedEvent> {
  readonly seq: number;
  readonly at: number;
  readonly event: E;
}

export type Reducer<E extends TypedEvent, S> = (state: S, event: E, entry: LoggedEvent<E>) => S;

/** One handler per event type; types without a handler leave the state unchanged. */
export type Handlers<E extends TypedEvent, S> = {
  readonly [K in E["type"]]?: (state: S, event: Extract<E, { readonly type: K }>, entry: LoggedEvent<E>) => S;
};

export interface EventLog<E extends TypedEvent> {
  /** Appends an event at the end. Returns the created record. */
  append(event: E): LoggedEvent<E>;
  /** Number of recorded events. */
  readonly size: number;
  /** All records, in order (a copy: mutating it does not touch the log). */
  entries(): readonly LoggedEvent<E>[];
  /** The records with seq greater than `seq`. */
  since(seq: number): readonly LoggedEvent<E>[];
  /** Folds all events, in order, from `initial`. */
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
 * Creates an empty log or resumes it from saved records (`restored`), which must have
 * seq 1..n with no gaps and finite instants; otherwise it throws EventLogError.
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

/** Builds a Reducer from one handler per event type. */
export function reducerFrom<E extends TypedEvent, S>(handlers: Handlers<E, S>): Reducer<E, S> {
  return (state, event, entry) => {
    const handler = (handlers as Record<string, Reducer<E, S> | undefined>)[event.type];
    return handler ? handler(state, event, entry) : state;
  };
}
