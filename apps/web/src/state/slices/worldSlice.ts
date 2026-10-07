// Slice `world` (03 §3.3). F1.3 llena solo lo que necesita el modo solo-diálogo: los lugares de la región
// y dónde está cada NPC (contenido compilado de F1.2, cargado por services/content). El resto (dioramas,
// flags, fundaciones, red, NPCs en el mapa, interactuables) arranca vacío y lo llenan F2-F3.3.
// F2: el diorama cargado, listo para jugar (capas de tiles, cajas, NPCs, interactuables y grilla de caminabilidad).
import type { DioramaRuntime } from "@lg/core";

export type FoundationState = "idea" | "en_marcha" | "fundado" | "crece";

export interface PlaceInfo {
  id: string;
  name: string;
  /** Nombre en inglés del cartel, si tiene (p. ej. "Bunkhouse"). */
  en: string | null;
  diorama: string;
  description: string;
}

export interface NpcInfo {
  id: string;
  name: string;
  placeId: string;
}

export interface WorldState {
  /** Estado de la carga del contenido compilado (lugares y NPCs). */
  catalog: "idle" | "loading" | "ready" | "error";
  regionName: string | null;
  places: PlaceInfo[];
  npcs: NpcInfo[];
  currentDiorama: string | null;
  /** Carga del diorama del mapa (services/content). */
  dioramaStatus: "idle" | "loading" | "ready" | "error";
  diorama: DioramaRuntime | null;
  loadedDioramas: string[];
  timeOfDay: "amanecer" | "dia" | "atardecer" | "noche";
  weather: string | null;
  lightByArea: Record<string, number>;
  flags: Record<string, boolean>;
  /** Fundaciones `SITIO-*` por estado (D-169). */
  foundations: Record<string, FoundationState>;
  /** Red de vecinos: presentaciones consumadas (`intro:<NPC>`) y vínculos (D-168). */
  network: { intros: string[]; links: [string, string][] };
  /** Último punto elegido en modo inspección (solo modo director, §6.5.3). */
  lastPick: { x: number; z: number } | null;
  npcStates: Record<string, { cell: [number, number] | null; available: boolean; requestIcon: boolean }>;
  /** Relación por NPC, 0-5, nunca baja. */
  relationships: Record<string, number>;
  nearbyInteractables: string[];
  focusedInteractable: string | null;
}

export const WORLD_PERSIST = "server" as const;

export const initialWorld = (): WorldState => ({
  catalog: "idle",
  regionName: null,
  places: [],
  npcs: [],
  currentDiorama: null,
  dioramaStatus: "idle",
  diorama: null,
  loadedDioramas: [],
  timeOfDay: "amanecer",
  weather: null,
  lightByArea: {},
  flags: {},
  foundations: {},
  network: { intros: [], links: [] },
  lastPick: null,
  npcStates: {},
  relationships: {},
  nearbyInteractables: [],
  focusedInteractable: null,
});
