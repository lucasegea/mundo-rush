// Director-mode emitters over the HMR channel (03 §6.5.2, FD0 A4). Injected clock: tests use a fake one.
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

/** ≤ 4 sends per second: at least 250 ms pass between two sends. */
export const MIN_INTERVAL_MS = 250;

/** What matters for "changed": everything except the snapshot's timestamp. */
const changeKey = (s: DirectorSnapshot): string => JSON.stringify({ ...s, at: null });

/**
 * Sends the snapshot only if it changed and never more than once every 250 ms. Inside the window it keeps the latest and
 * sends it when the window opens (the final state is never lost). If the pending one equals the last one sent again, it does not send.
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

/** Collects journal events and sends them in batches (at most one every 250 ms); `flush` forces the send. */
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
