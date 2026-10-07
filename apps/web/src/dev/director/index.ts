// dev/director/ — cliente del modo director (FD0, 03 §6.5.2, ADR-026). Solo lo carga boot/dev.ts con
// `import()` bajo `import.meta.env.DEV && VITE_LG_DIRECTOR === "1"`: en `vite build` no existe.
// Lee el juego solo por state/selectors/ (el store le llega inyectado como lector) y manda por el canal de HMR
// el snapshot (≤ 4 por segundo y solo si cambió) y los eventos del diario.
import { JOURNAL_EVENT, SNAPSHOT_EVENT, type JournalBatch, type JournalEventInput } from "@lg/protocol/director";
import { selectEffectiveTier, type GameState } from "../../state/selectors";
import { browserClock, createJournalEmitter, createSnapshotEmitter, type DirectorClock } from "./emitter";
import { journalEvents } from "./journal";
import { advanceHistory, emptyHistory, selectDirectorSnapshot } from "./snapshot";

export { advanceHistory, emptyHistory, selectDirectorSnapshot, type DirectorHistory, type SnapshotMeta } from "./snapshot";
export { createJournalEmitter, createSnapshotEmitter, MIN_INTERVAL_MS, type DirectorClock } from "./emitter";
export { journalEvents } from "./journal";

/** Lo mínimo del canal de HMR de Vite (`import.meta.hot`). */
export interface HotSender {
  send(event: string, data?: unknown): void;
}

/** Lector del store: estado actual y suscripción (estado nuevo, estado anterior). */
export interface GameReader {
  getState(): GameState;
  subscribe(listener: (state: GameState, prev: GameState) => void): () => void;
}

export interface DirectorDeps {
  hot: HotSender;
  store: GameReader;
  clock?: DirectorClock;
  sessionId?: string;
  /** Recibe `pagehide` para cerrar la sesión del diario (la app pasa window). */
  pageEvents?: EventTarget;
}

/** Id de sesión ordenable por fecha y seguro como nombre de archivo: `20261007-183012-k3f9`. */
export const newSessionId = (now: number, random: () => number = Math.random): string => {
  const stamp = new Date(now).toISOString().replace(/\D/g, ""); // AAAAMMDDhhmmssmmm (UTC)
  return `${stamp.slice(0, 8)}-${stamp.slice(8, 14)}-${random().toString(36).slice(2, 6).padEnd(4, "0")}`;
};

/** Arranca el modo director. Devuelve una función que lo detiene (cierra la sesión del diario). */
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
    snapshots.push(selectDirectorSnapshot(state, history, { sessionId, at }));
    journal.add(journalEvents(prev, state, at));
  };

  // El plugin completa gitSha y contentHash de session.start (los sabe Node, no el navegador).
  const start: JournalEventInput = { type: "session.start", at: iso(), gitSha: null, contentHash: null, tier: selectEffectiveTier(deps.store.getState()) };
  journal.add([start]);
  onState(deps.store.getState(), null);
  const unsubscribe = deps.store.subscribe(onState);

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    snapshots.stop();
    journal.add([{ type: "session.end", at: iso() }]);
    journal.flush();
    deps.pageEvents?.removeEventListener("pagehide", stop);
  };
  deps.pageEvents?.addEventListener("pagehide", stop);
  return stop;
}
