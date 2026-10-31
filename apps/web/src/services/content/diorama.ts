// services/content — loading of the compiled diorama layout (content/dioramas/*.yaml → public/content/dioramas.json,
// F1.2 + F2). The schema already validated it at compile time; here only the minimal shape is checked and it is handed to the store,
// where the core builds the grid and the layers. If something fails, the map says so and dialogue-only mode carries on.
import type { DioramaLayout } from "@lg/core";
import { browserFetchJson, ContentShapeError, type FetchJson } from "./dialogOnlyCatalog";
import { universeContentBase } from "./universe";

export const DIORAMAS_FILE = "dioramas.json";
/** The map's diorama in F2 (03 §4.2.1): the test one. F3.1 switches to `muelle`. */
export const WORLD_DIORAMA = "test";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isBounds = (b: unknown): boolean =>
  isObj(b) && ["minX", "maxX", "minZ", "maxZ"].every((k) => typeof b[k] === "number");

export function pickDiorama(json: unknown, id: string): DioramaLayout {
  if (!Array.isArray(json)) throw new ContentShapeError(DIORAMAS_FILE, "se esperaba una lista");
  const layout = json.find((d) => isObj(d) && d.id === id);
  if (!isObj(layout)) throw new ContentShapeError(DIORAMAS_FILE, `no está el diorama "${id}"`);
  if (!isBounds(layout.bounds)) throw new ContentShapeError(DIORAMAS_FILE, `"${id}" sin bounds`);
  return layout as unknown as DioramaLayout;
}

export interface DioramaSink {
  dioramaLoading(): void;
  dioramaLoaded(layout: DioramaLayout): void;
  dioramaFailed(): void;
}

/** Loads a diorama and hands it to the store. Returns true if it loaded. `universeId` namespaces the path (S4/D-806). */
export async function loadDiorama(sink: DioramaSink, baseUrl: string, id = WORLD_DIORAMA, universeId?: string, fetchJson: FetchJson = browserFetchJson): Promise<boolean> {
  sink.dioramaLoading();
  try {
    sink.dioramaLoaded(pickDiorama(await fetchJson(`${universeContentBase(baseUrl, universeId)}${DIORAMAS_FILE}`), id));
    return true;
  } catch (err) {
    console.warn("[content] no se pudo cargar el diorama:", err instanceof Error ? err.message : err);
    sink.dioramaFailed();
    return false;
  }
}
