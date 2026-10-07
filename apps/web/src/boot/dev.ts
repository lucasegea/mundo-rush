// Gancho de desarrollo (03 §6.5.1, ADR-026). El modo director se carga con `import()` SOLO bajo la doble llave
// `import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1"`. En `vite build` `import.meta.env.DEV` es false:
// la rama se elimina y sus chunks no se emiten (check:dev-only lo comprueba sobre el dist, con y sin la variable).
import type { GameActions } from "../state/actions";
import type { GameStore } from "../state/store";
import type { FetchJson } from "../services/content";

/** Lo mínimo de `import.meta.hot` que usa el modo director. */
export interface DevHot {
  send(event: string, data?: unknown): void;
  on(event: string, cb: (data: unknown) => void): void;
  off?(event: string, cb: (data: unknown) => void): void;
}

export interface DevHookDeps {
  store: GameStore;
  actions: GameActions;
  baseUrl: string;
  fetchJson?: FetchJson;
  /** Para tests; por defecto `import.meta.hot` del servidor de desarrollo. */
  hot?: DevHot;
  /** Recibe `pagehide` para cerrar la sesión del diario (la app pasa window). */
  pageEvents?: EventTarget;
}

/** Arranca el modo director si corresponde. Devuelve con qué detenerlo, o null si no arrancó. */
export async function runDevHook(deps: DevHookDeps): Promise<(() => void) | null> {
  if (!import.meta.env.DEV) return null;
  if (import.meta.env.VITE_LG_DIRECTOR !== "1") return null;
  const hot = deps.hot ?? import.meta.hot;
  if (!hot) return null;
  const [{ startDirector }, { startContentHotReload }] = await Promise.all([
    import("../dev/director"),
    import("../services/content/hotReload"),
  ]);
  const stopDirector = startDirector({ hot, store: deps.store, ...(deps.pageEvents ? { pageEvents: deps.pageEvents } : {}) });
  const stopReload = startContentHotReload({
    hot, store: deps.store, actions: deps.actions, baseUrl: deps.baseUrl, ...(deps.fetchJson ? { fetchJson: deps.fetchJson } : {}),
  });
  return () => {
    stopReload();
    stopDirector();
  };
}
