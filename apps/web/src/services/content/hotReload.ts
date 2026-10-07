// Recarga en caliente del contenido (03 §6.5.2, FD0 A6). Solo la arranca boot/dev.ts dentro de la doble llave
// del modo director. Cuando el servidor de desarrollo avisa `lg:content:updated` con los ids tocados, se vuelve a
// pedir el JSON compilado y se despacha `contentReloaded`. Con una escena abierta el cambio espera a que se cierre:
// aplica en la PRÓXIMA escena, nunca a mitad de una.
import type { DioramaLayout } from "@lg/core";
import { CONTENT_UPDATED_EVENT } from "@lg/protocol/director";
import type { ContentUpdate, GameActions } from "../../state/actions";
import { selectOpenScene } from "../../state/selectors";
import type { GameStore } from "../../state/store";
import { browserFetchJson, CONTENT_FILES, parseDialogOnlyCatalog, type FetchJson } from "./dialogOnlyCatalog";
import { DIORAMAS_FILE, pickDiorama } from "./diorama";

/** El evento que manda el plugin del modo director. */
export const CONTENT_UPDATED = CONTENT_UPDATED_EVENT;

/** Lo mínimo del canal de HMR de Vite para escuchar. */
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

/** Pide el contenido compilado de nuevo: el catálogo siempre; el diorama actual solo si está entre los ids tocados. */
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

/** Escucha el aviso del servidor de desarrollo. Devuelve una función que deja de escuchar. */
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
      // Dos avisos durante la misma escena: gana el contenido más nuevo, con la unión de ids.
      pending = {
        ids: [...new Set([...(pending?.ids ?? []), ...ids])].sort(),
        update: { catalog: update.catalog, diorama: update.diorama ?? pending?.update.diorama ?? null },
      };
      apply();
    }).catch((err: unknown) => {
      // El juego sigue con el último contenido bueno; el detalle queda en la consola de desarrollo.
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
