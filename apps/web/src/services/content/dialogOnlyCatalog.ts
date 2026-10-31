// services/content — loading of the content compiled by F1.2 (apps/web/public/content/, D-159) for the
// dialogue-only mode: places in the region and where each NPC is. Network effect in services/ (R5); the result
// enters the store via actions. Minimal hand-written validation (no zod in the shell): if the shape is not the expected one,
// it fails clearly, with no invented data.
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
 * Plan estetica-c M5: the card's appearance (`apariencia`, already validated by the compiler). Absent or null: null (the
 * world draws the fallback one). Present but malformed: fails clearly, with no invented data.
 */
const lookOf = (file: string, n: Json): CharacterLook | null => {
  const v = n["apariencia"];
  if (v === undefined || v === null) return null;
  const r = parseApariencia(v);
  if (!r.ok) throw new ContentShapeError(file, `${String(n["id"])}: apariencia inválida (${r.error})`);
  return r.look;
};

/** Builds the catalog from the two client JSONs. Takes the first region (Region 1 in v0.2). */
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

/** real fetch: a non-2xx status is an error (an error page is not parsed as content). */
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

/** Loads the catalog and hands it to the store. Returns true if it loaded. `universeId` namespaces the path (S4/D-806). */
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
    // The player sees the error in the UI (aria-live); the detail stays in the console for whoever debugs.
    console.warn("[content] no se pudo cargar el catálogo de solo-diálogo:", err instanceof Error ? err.message : err);
    sink.contentFailed();
    return false;
  }
}
