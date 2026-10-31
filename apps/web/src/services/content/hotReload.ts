// Content hot reload (03 §6.5.2, FD0 A6). Only boot/dev.ts starts it, inside the double key
// of director mode. When the dev server signals `lg:content:updated` with the touched ids, the compiled JSON is
// fetched again and `contentReloaded` is dispatched. With a scene open the change waits until it closes:
// it applies on the NEXT scene, never in the middle of one.
import type { DioramaLayout } from "@lg/core";
import { CONTENT_UPDATED_EVENT } from "@lg/protocol/director";
import type { ContentUpdate, GameActions } from "../../state/actions";
import { selectOpenScene } from "../../state/selectors";
import type { GameStore } from "../../state/store";
import { browserFetchJson, CONTENT_FILES, parseDialogOnlyCatalog, type FetchJson } from "./dialogOnlyCatalog";
import { DIORAMAS_FILE, pickDiorama } from "./diorama";

/** The event sent by the director mode plugin. */
export const CONTENT_UPDATED = CONTENT_UPDATED_EVENT;

/** The minimum of Vite's HMR channel to listen on. */
export interface HotListener {
  on(event: string, cb: (data: unknown) => void): void;
  off?(event: string, cb: (data: unknown) => void): void;
}

export interface HotReloadDeps {
  hot: HotListener;
  store: GameStore;
  actions: Pick<GameActions, "contentReloaded">;
  baseUrl: string;
  fetchJson?: FetchJson;
}

const idsOf = (data: unknown): string[] | null => {
  const ids = (data as { ids?: unknown } | null)?.ids;
  return Array.isArray(ids) && ids.every((x) => typeof x === "string") ? ids : null;
};

/** Fetches the compiled content again: the catalog always; the current diorama only if it is among the touched ids. */
export async function fetchContentUpdate(store: GameStore, ids: readonly string[], baseUrl: string, fetchJson: FetchJson = browserFetchJson): Promise<ContentUpdate> {
  const [places, npcs] = await Promise.all([
    fetchJson(`${baseUrl}content/${CONTENT_FILES.places}`),
    fetchJson(`${baseUrl}content/${CONTENT_FILES.npcs}`),
  ]);
  const current = store.getState().world.diorama?.id ?? null;
  let diorama: DioramaLayout | null = null;
  if (current !== null && ids.includes(current)) diorama = pickDiorama(await fetchJson(`${baseUrl}content/${DIORAMAS_FILE}`), current);
  return { catalog: parseDialogOnlyCatalog(places, npcs), diorama };
}

/** Listens for the dev server notice. Returns a function that stops listening. */
export function startContentHotReload(deps: HotReloadDeps): () => void {
  let pending: { ids: string[]; update: ContentUpdate } | null = null;
  let stopped = false;

  const apply = (): void => {
    if (!pending || selectOpenScene(deps.store.getState()) !== null) return;
    const { ids, update } = pending;
    pending = null;
    deps.actions.contentReloaded(ids, update);
  };

  const onUpdated = (data: unknown): void => {
    const ids = idsOf(data);
    if (!ids) return;
    fetchContentUpdate(deps.store, ids, deps.baseUrl, deps.fetchJson).then((update) => {
      if (stopped) return;
      // Two notices during the same scene: the newest content wins, with the union of ids.
      pending = {
        ids: [...new Set([...(pending?.ids ?? []), ...ids])].sort(),
        update: { catalog: update.catalog, diorama: update.diorama ?? pending?.update.diorama ?? null },
      };
      apply();
    }).catch((err: unknown) => {
      // The game carries on with the last good content; the detail stays in the dev console.
      console.warn("[content] recarga en caliente fallida:", err instanceof Error ? err.message : err);
    });
  };

  deps.hot.on(CONTENT_UPDATED, onUpdated);
  const unsubscribe = deps.store.subscribe((s) => selectOpenScene(s) === null, (closed) => {
    if (closed) apply();
  });
  return () => {
    stopped = true;
    unsubscribe();
    deps.hot.off?.(CONTENT_UPDATED, onUpdated);
  };
}
