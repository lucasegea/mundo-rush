// Emisores del modo director por el canal de HMR (03 §6.5.2, FD0 A4). Reloj inyectado: los tests usan uno falso.
import type { DirectorSnapshot, JournalEventInput } from "@lg/protocol/director";

export interface DirectorClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserClock: DirectorClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/** ≤ 4 envíos por segundo: entre dos envíos pasan al menos 250 ms. */
export const MIN_INTERVAL_MS = 250;

/** Lo que importa para "cambió": todo menos la marca de tiempo del snapshot. */
const changeKey = (s: DirectorSnapshot): string => JSON.stringify({ ...s, at: null });

/**
 * Manda el snapshot solo si cambió y nunca más de una vez cada 250 ms. Dentro de la ventana guarda el último y lo
 * manda al abrirse (el estado final nunca se pierde). Si el pendiente vuelve a ser igual al último enviado, no manda.
 */
export function createSnapshotEmitter(send: (s: DirectorSnapshot) => void, clock: DirectorClock, minIntervalMs = MIN_INTERVAL_MS) {
  let lastKey: string | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: DirectorSnapshot | null = null;
  let timer: unknown = null;

  const flush = (): void => {
    timer = null;
    if (!pending) return;
    const snapshot = pending;
    pending = null;
    const key = changeKey(snapshot);
    if (key === lastKey) return;
    lastKey = key;
    lastSentAt = clock.now();
    send(snapshot);
  };

  return {
    push(snapshot: DirectorSnapshot): void {
      pending = snapshot;
      if (timer !== null) return;
      const wait = lastSentAt + minIntervalMs - clock.now();
      if (wait <= 0) flush();
      else timer = clock.setTimeout(flush, wait);
    },
    stop(): void {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

/** Junta eventos del diario y los manda en lotes (a lo sumo uno cada 250 ms); `flush` fuerza el envío. */
export function createJournalEmitter(send: (events: JournalEventInput[]) => void, clock: DirectorClock, intervalMs = MIN_INTERVAL_MS) {
  let queue: JournalEventInput[] = [];
  let timer: unknown = null;
  const flush = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    send(batch);
  };
  return {
    add(events: readonly JournalEventInput[]): void {
      if (events.length === 0) return;
      queue.push(...events);
      if (timer === null) timer = clock.setTimeout(flush, intervalMs);
    },
    flush,
  };
}
