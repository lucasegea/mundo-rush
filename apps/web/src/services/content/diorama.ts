// services/content — carga del layout de diorama compilado (content/dioramas/*.yaml → public/content/dioramas.json,
// F1.2 + F2). El schema ya lo validó al compilar; acá solo se chequea la forma mínima y se entrega al store,
// donde el núcleo arma la grilla y las capas. Si algo falla, el mapa avisa y el modo solo-diálogo sigue.
import type { DioramaLayout } from "@lg/core";
import { browserFetchJson, ContentShapeError, type FetchJson } from "./dialogOnlyCatalog";

export const DIORAMAS_FILE = "dioramas.json";
/** El diorama del mapa en F2 (03 §4.2.1): el de prueba. F3.1 pasa a `muelle`. */
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

/** Carga un diorama y lo entrega al store. Devuelve true si cargó. */
export async function loadDiorama(sink: DioramaSink, baseUrl: string, id = WORLD_DIORAMA, fetchJson: FetchJson = browserFetchJson): Promise<boolean> {
  sink.dioramaLoading();
  try {
    sink.dioramaLoaded(pickDiorama(await fetchJson(`${baseUrl}content/${DIORAMAS_FILE}`), id));
    return true;
  } catch (err) {
    console.warn("[content] no se pudo cargar el diorama:", err instanceof Error ? err.message : err);
    sink.dioramaFailed();
    return false;
  }
}
