// Gancho de desarrollo (03 §6.5.1, ADR-026). El modo director se carga con `import()` SOLO bajo la doble llave
// `import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1"`. En `vite build` `import.meta.env.DEV` es false:
// la rama se elimina y sus chunks no se emiten (check:dev-only lo comprueba sobre el dist, con y sin la variable).
// Plan estetica-c M3 (D-030): con `?retratos` en la url, además, el panel de retratos (dev/portraits/) con el estudio
// de world/portraits/ inyectado (dev/ no conoce three ni world/; boot es la raíz de composición). Plan estetica-c M6: el
// lector de los contadores del renderer (world/budget/renderStats) se inyecta igual en el modo director.
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
  /** Query de la url (por defecto la de la página): `?retratos` monta el panel de retratos. */
  search?: string;
  /** Dónde montar el panel de retratos (por defecto document.body). */
  portraitsMount?: HTMLElement;
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
  // Plan estetica-c M6: los contadores del renderer los lee la sonda de world/ (boot es la raíz de composición; dev/ no
  // conoce world/). El módulo es de solo-desarrollo y GameCanvas monta la sonda bajo la misma doble llave.
  const { readRenderStats } = await import("../world/budget/renderStats");
  const stopDirector = startDirector({ hot, store: deps.store, render: readRenderStats, ...(deps.pageEvents ? { pageEvents: deps.pageEvents } : {}) });
  const stopReload = startContentHotReload({
    hot, store: deps.store, actions: deps.actions, baseUrl: deps.baseUrl, ...(deps.fetchJson ? { fetchJson: deps.fetchJson } : {}),
  });
  let stopPortraits: (() => void) | null = null;
  const search = deps.search ?? globalThis.location?.search ?? "";
  const mount = deps.portraitsMount ?? globalThis.document?.body;
  if (new URLSearchParams(search).has("retratos") && mount) {
    // Open-world-3d T7b: el look de los retratos llega con import() como el estudio (fuera de la carga inicial del build).
    const [{ startPortraitPanel }, studio, { PAINTED_LOOK }] = await Promise.all([import("../dev/portraits"), import("../world/portraits/studio"), import("@lg/art")]);
    // Plan estetica-c M5: las apariencias vienen del catálogo de contenido (boot ya lo cargó antes de este gancho).
    const looks = new Map(deps.store.getState().world.npcs.flatMap((n) => (n.look ? [[n.id, n.look] as const] : [])));
    stopPortraits = startPortraitPanel({
      ids: studio.portraitIds(looks),
      render: (id) => {
        const look = looks.get(id);
        // Open-world-3d T7b: los retratos son del look C pintado (KayKit, cabeza por código), con su luz y su fondo.
        return look ? studio.renderPortrait(id, look, PAINTED_LOOK) : Promise.reject(new Error(`retrato ${id}: sin apariencia en el catálogo`));
      },
      mount,
    });
  }
  return () => {
    stopPortraits?.();
    stopReload();
    stopDirector();
  };
}
