// Slice `world` (03 §3.3). F1.3 fills only what dialogue-only mode needs: the region's places
// and where each NPC is (compiled F1.2 content, loaded by services/content). The rest (dioramas,
// flags, foundations, network, NPCs on the map, interactables) starts empty and is filled by F2-F3.3.
// F2: the loaded diorama, ready to play (diorama floor, boxes, NPCs, interactables and walkability grid).
import type { DioramaRuntime } from "@lg/core";
import type { CharacterLook } from "@lg/art";

export type FoundationState = "idea" | "en_marcha" | "fundado" | "crece";

export interface PlaceInfo {
  id: string;
  name: string;
  /** English name of the sign, if it has one (e.g. "Bunkhouse"). */
  en: string | null;
  diorama: string;
  description: string;
}

export interface NpcInfo {
  id: string;
  name: string;
  placeId: string;
  /** Plan estetica-c M5: the look of its sheet (`apariencia`); null or absent if the sheet does not carry it. */
  look?: CharacterLook | null;
}

export interface WorldState {
  /** Loading state of the compiled content (places and NPCs). */
  catalog: "idle" | "loading" | "ready" | "error";
  regionName: string | null;
  places: PlaceInfo[];
  npcs: NpcInfo[];
  currentDiorama: string | null;
  /** Diorama map loading (services/content). */
  dioramaStatus: "idle" | "loading" | "ready" | "error";
  diorama: DioramaRuntime | null;
  loadedDioramas: string[];
  timeOfDay: "amanecer" | "dia" | "atardecer" | "noche";
  weather: string | null;
  lightByArea: Record<string, number>;
  flags: Record<string, boolean>;
  /** `SITIO-*` foundations by state (D-169). */
  foundations: Record<string, FoundationState>;
  /** Neighbor network: completed introductions (`intro:<NPC>`) and ties (D-168). */
  network: { intros: string[]; links: [string, string][] };
  /** Last point chosen in inspect mode (director mode only, §6.5.3). */
  lastPick: { x: number; z: number } | null;
  /**
   * Per-NPC state. `requestIcon`: the NPC has an open request (amber bubble over the head, proposal C §3; plan
   * estetica-c M5 draws it from `selectRequestBubbles`). M5 SEAM: today nobody writes it; it is written by the system of
   * missions or the request board when it opens requests per NPC (not invented here).
   */
  npcStates: Record<string, { cell: [number, number] | null; available: boolean; requestIcon: boolean }>;
  /** Per-NPC relationship, 0-5, never decreases. */
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
