// Development hook (03 §6.5.1, ADR-026). Director mode is loaded with `import()` ONLY under the double key
// `import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1"`. In `vite build` `import.meta.env.DEV` is false:
// the branch is eliminated and its chunks are not emitted (check:dev-only verifies this on the dist, with and without the variable).
// Plan estetica-c M3 (D-030): with `?retratos` in the url, additionally, the portrait panel (dev/portraits/) with the studio
// from world/portraits/ injected (dev/ knows neither three nor world/; boot is the composition root). Plan estetica-c M6: the
// reader of the renderer counters (world/budget/renderStats) is injected the same way in director mode.
import type { GameActions } from "../state/actions";
import type { GameStore } from "../state/store";
import type { FetchJson } from "../services/content";

/** The minimum of `import.meta.hot` that director mode uses. */
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
  /** For tests; by default `import.meta.hot` of the dev server. */
  hot?: DevHot;
  /** Receives `pagehide` to close the journal session (the app passes window). */
  pageEvents?: EventTarget;
  /** Url query (by default the page's): `?retratos` mounts the portrait panel. */
  search?: string;
  /** Where to mount the portrait panel (by default document.body). */
  portraitsMount?: HTMLElement;
}

/** Starts director mode if applicable. Returns what stops it, or null if it did not start. */
export async function runDevHook(deps: DevHookDeps): Promise<(() => void) | null> {
  if (!import.meta.env.DEV) return null;
  if (import.meta.env.VITE_LG_DIRECTOR !== "1") return null;
  const hot = deps.hot ?? import.meta.hot;
  if (!hot) return null;
  const [{ startDirector }, { startContentHotReload }] = await Promise.all([
    import("../dev/director"),
    import("../services/content/hotReload"),
  ]);
  // Plan estetica-c M6: the renderer counters are read by world/'s probe (boot is the composition root; dev/ does not
  // know world/). The module is development-only and GameCanvas mounts the probe under the same double key.
  const { readRenderStats } = await import("../world/budget/renderStats");
  const stopDirector = startDirector({ hot, store: deps.store, render: readRenderStats, ...(deps.pageEvents ? { pageEvents: deps.pageEvents } : {}) });
  const stopReload = startContentHotReload({
    hot, store: deps.store, actions: deps.actions, baseUrl: deps.baseUrl, ...(deps.fetchJson ? { fetchJson: deps.fetchJson } : {}),
  });
  let stopPortraits: (() => void) | null = null;
  const search = deps.search ?? globalThis.location?.search ?? "";
  const mount = deps.portraitsMount ?? globalThis.document?.body;
  if (new URLSearchParams(search).has("retratos") && mount) {
    // Open-world-3d T7b: the portraits' look arrives with import() like the studio (outside the build's initial load).
    const [{ startPortraitPanel }, studio, { PAINTED_LOOK }] = await Promise.all([import("../dev/portraits"), import("../world/portraits/studio"), import("@lg/art")]);
    // Plan estetica-c M5: the appearances come from the content catalog (boot already loaded it before this hook).
    const looks = new Map(deps.store.getState().world.npcs.flatMap((n) => (n.look ? [[n.id, n.look] as const] : [])));
    stopPortraits = startPortraitPanel({
      ids: studio.portraitIds(looks),
      render: (id) => {
        const look = looks.get(id);
        // Open-world-3d T7b: the portraits are the painted look C (KayKit, head from code), with their light and background.
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
