// services/content — carga del contenido compilado por F1.2 (apps/web/public/content/, D-159) para el modo
// solo-diálogo: lugares de la región y dónde está cada NPC. Efecto de red en services/ (R5); el resultado
// entra al store por acciones. Validación mínima a mano (sin zod en el shell): si la forma no es la esperada,
// falla claro, sin datos inventados.
import { parseApariencia, type CharacterLook } from "@lg/art";
import type { DialogOnlyCatalog } from "../../state/actions";
import type { NpcInfo, PlaceInfo } from "../../state/slices";
import { universeContentBase } from "./universe";

export const CONTENT_FILES = { places: "lugares.json", npcs: "npcs.json" } as const;
const LOCALE = "es-AR";

export class ContentShapeError extends Error {
  constructor(file: string, detail: string) {
    super(`${file}: ${detail}`);
    this.name = "ContentShapeError";
  }
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (file: string, o: Json, key: string): string => {
  const v = o[key];
  if (typeof v !== "string" || v.length === 0) throw new ContentShapeError(file, `falta "${key}" (texto)`);
  return v;
};
const localized = (file: string, o: Json, key: string): string => {
  const v = o[key];
  if (!isObj(v) || typeof v[LOCALE] !== "string") throw new ContentShapeError(file, `falta "${key}.${LOCALE}"`);
  return v[LOCALE];
};

/**
 * Plan estetica-c M5: la apariencia de la ficha (`apariencia`, ya validada por el compilador). Ausente o null: null (el
 * mundo dibuja la de reserva). Presente pero mal formada: falla claro, sin datos inventados.
 */
const lookOf = (file: string, n: Json): CharacterLook | null => {
  const v = n["apariencia"];
  if (v === undefined || v === null) return null;
  const r = parseApariencia(v);
  if (!r.ok) throw new ContentShapeError(file, `${String(n["id"])}: apariencia inválida (${r.error})`);
  return r.look;
};

/** Arma el catálogo desde los dos JSON del cliente. Toma la primera región (la Región 1 en v0.2). */
export function parseDialogOnlyCatalog(placesJson: unknown, npcsJson: unknown): DialogOnlyCatalog {
  const pf = CONTENT_FILES.places;
  if (!isObj(placesJson) || !Array.isArray(placesJson.regiones) || !Array.isArray(placesJson.lugares)) {
    throw new ContentShapeError(pf, "se esperaba { regiones: [], lugares: [] }");
  }
  const region = placesJson.regiones[0];
  if (!isObj(region)) throw new ContentShapeError(pf, "no hay regiones");
  const regionId = str(pf, region, "id");

  const places: PlaceInfo[] = placesJson.lugares.filter(isObj).filter((l) => l.region === regionId).map((l) => ({
    id: str(pf, l, "id"),
    name: localized(pf, l, "nombre"),
    en: typeof l.en === "string" ? l.en : null,
    diorama: str(pf, l, "diorama"),
    description: typeof l.descripcion === "string" ? l.descripcion : "",
  }));

  const nf = CONTENT_FILES.npcs;
  if (!Array.isArray(npcsJson)) throw new ContentShapeError(nf, "se esperaba una lista");
  const placeIds = new Set(places.map((p) => p.id));
  const npcs: NpcInfo[] = npcsJson.filter(isObj)
    .map((n) => ({ id: str(nf, n, "id"), name: str(nf, n, "nombre"), placeId: str(nf, n, "lugar"), look: lookOf(nf, n) }))
    .filter((n) => placeIds.has(n.placeId));

  return { regionName: localized(pf, region, "nombre"), places, npcs };
}

export type FetchJson = (url: string) => Promise<unknown>;

/** fetch real: un status que no es 2xx es un error (no se parsea una página de error como contenido). */
export const browserFetchJson: FetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.json() as Promise<unknown>;
};

export interface CatalogSink {
  contentLoading(): void;
  contentLoaded(catalog: DialogOnlyCatalog): void;
  contentFailed(): void;
}

/** Carga el catálogo y lo entrega al store. Devuelve true si cargó. `universeId` namespacea la ruta (S4/D-806). */
export async function loadDialogOnlyCatalog(sink: CatalogSink, baseUrl: string, universeId?: string, fetchJson: FetchJson = browserFetchJson): Promise<boolean> {
  sink.contentLoading();
  try {
    const base = universeContentBase(baseUrl, universeId);
    const [places, npcs] = await Promise.all([
      fetchJson(`${base}${CONTENT_FILES.places}`),
      fetchJson(`${base}${CONTENT_FILES.npcs}`),
    ]);
    sink.contentLoaded(parseDialogOnlyCatalog(places, npcs));
    return true;
  } catch (err) {
    // El jugador ve el error en la UI (aria-live); el detalle queda en la consola para quien depura.
    console.warn("[content] no se pudo cargar el catálogo de solo-diálogo:", err instanceof Error ? err.message : err);
    sink.contentFailed();
    return false;
  }
}
