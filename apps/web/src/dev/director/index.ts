// dev/director/ — director-mode client (FD0, 03 §6.5.2, ADR-026). Only boot/dev.ts loads it, with
// `import()` under `import.meta.env.DEV && VITE_LG_DIRECTOR === "1"`: it does not exist in `vite build`.
// It reads the game only through state/selectors/ (the store is injected as a reader) and sends over the HMR channel
// the snapshot (≤ 4 per second and only if it changed) and the journal events.
import { JOURNAL_EVENT, SNAPSHOT_EVENT, type JournalBatch, type JournalEventInput, type RenderStats } from "@lg/protocol/director";
import { selectEffectiveTier, type GameState } from "../../state/selectors";
import { browserClock, createJournalEmitter, createSnapshotEmitter, type DirectorClock } from "./emitter";
import { journalEvents } from "./journal";
import { advanceHistory, emptyHistory, selectDirectorSnapshot } from "./snapshot";

export { advanceHistory, emptyHistory, selectDirectorSnapshot, type DirectorHistory, type SnapshotMeta } from "./snapshot";
export { createJournalEmitter, createSnapshotEmitter, MIN_INTERVAL_MS, type DirectorClock } from "./emitter";
export { journalEvents } from "./journal";

/** The minimum of Vite's HMR channel (`import.meta.hot`). */
export interface HotSender {
  send(event: string, data?: unknown): void;
}

/** Store reader: current state and subscription (new state, previous state). */
export interface GameReader {
  getState(): GameState;
  subscribe(listener: (state: GameState, prev: GameState) => void): () => void;
}

export interface DirectorDeps {
  hot: HotSender;
  store: GameReader;
  clock?: DirectorClock;
  sessionId?: string;
  /** Receives `pagehide` to close the journal session (the app passes window). */
  pageEvents?: EventTarget;
  /**
   * Plan estetica-c M6: reader of the renderer counters (boot/dev.ts injects world/budget/renderStats; dev/ does not
   * know world/ or three). With it, the snapshot carries `render` and is rebuilt every RENDER_SAMPLE_MS even if the store
   * does not change (the emitter only sends if it changed).
   */
  render?: () => RenderStats | null;
}

/** How often the snapshot is rebuilt to refresh the renderer counters. */
export const RENDER_SAMPLE_MS = 1000;

/** Session id sortable by date and safe as a file name: `20261007-183012-k3f9`. */
export const newSessionId = (now: number, random: () => number = Math.random): string => {
  const stamp = new Date(now).toISOString().replace(/\D/g, ""); // YYYYMMDDhhmmssmmm (UTC)
  return `${stamp.slice(0, 8)}-${stamp.slice(8, 14)}-${random().toString(36).slice(2, 6).padEnd(4, "0")}`;
};

/** Starts director mode. Returns a function that stops it (closes the journal session). */
export function startDirector(deps: DirectorDeps): () => void {
  const clock = deps.clock ?? browserClock;
  const sessionId = deps.sessionId ?? newSessionId(clock.now());
  const iso = (): string => new Date(clock.now()).toISOString();

  const snapshots = createSnapshotEmitter((s) => deps.hot.send(SNAPSHOT_EVENT, s), clock);
  const journal = createJournalEmitter((events) => {
    const batch: JournalBatch = { sessionId, events };
    deps.hot.send(JOURNAL_EVENT, batch);
  }, clock);

  let history = emptyHistory();
  const onState = (state: GameState, prev: GameState | null): void => {
    const at = iso();
    history = advanceHistory(history, state, at);
    snapshots.push(selectDirectorSnapshot(state, history, { sessionId, at, ...(deps.render ? { render: deps.render() } : {}) }));
    journal.add(journalEvents(prev, state, at));
  };

  // The plugin fills in gitSha and contentHash of session.start (Node knows them, the browser does not).
  const start: JournalEventInput = { type: "session.start", at: iso(), gitSha: null, contentHash: null, tier: selectEffectiveTier(deps.store.getState()) };
  journal.add([start]);
  onState(deps.store.getState(), null);
  const unsubscribe = deps.store.subscribe(onState);

  let stopped = false;
  let sampler: unknown = null;
  const sample = (): void => {
    sampler = clock.setTimeout(sample, RENDER_SAMPLE_MS);
    const at = iso();
    snapshots.push(selectDirectorSnapshot(deps.store.getState(), history, { sessionId, at, render: deps.render ? deps.render() : null }));
  };
  if (deps.render) sampler = clock.setTimeout(sample, RENDER_SAMPLE_MS);
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (sampler !== null) clock.clearTimeout(sampler);
    unsubscribe();
    snapshots.stop();
    journal.add([{ type: "session.end", at: iso() }]);
    journal.flush();
    deps.pageEvents?.removeEventListener("pagehide", stop);
  };
  deps.pageEvents?.addEventListener("pagehide", stop);
  return stop;
}
