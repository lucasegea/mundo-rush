// Selectores del slice `world`: view-model del modo solo-diálogo (lugares de la región y quién está en cada uno)
// y, desde F2, lo que world/ dibuja, el aviso de interacción del HUD y los parámetros de render del mapa.
import { presetAngles, ZOOM_STEPS, type CameraPreset, type DioramaRuntime, type SelectableTier, type ZoomStep } from "@lg/core";
import type { GameState } from "../store";
import { selectEffectiveTier } from "./settings";
import { createViewSelector } from "./view";

export interface DialogOnlyPlaceItem {
  id: string;
  name: string;
  en: string | null;
  npcNames: string[];
  selected: boolean;
}

export interface DialogOnlyView {
  status: GameState["world"]["catalog"];
  regionName: string | null;
  places: DialogOnlyPlaceItem[];
  selected: {
    id: string;
    name: string;
    en: string | null;
    description: string;
    npcs: { id: string; name: string }[];
  } | null;
}

export const selectDialogOnlyView = createViewSelector(
  (s: GameState) => [s.world.catalog, s.world.regionName, s.world.places, s.world.npcs, s.ui.dialogOnlyPlaceId] as const,
  (status, regionName, places, npcs, selectedId): DialogOnlyView => {
    const npcsAt = (placeId: string) => npcs.filter((n) => n.placeId === placeId);
    const place = places.find((p) => p.id === selectedId) ?? null;
    return {
      status,
      regionName,
      places: places.map((p) => ({ id: p.id, name: p.name, en: p.en, npcNames: npcsAt(p.id).map((n) => n.name), selected: p.id === selectedId })),
      selected: place && {
        id: place.id, name: place.name, en: place.en, description: place.description,
        npcs: npcsAt(place.id).map((n) => ({ id: n.id, name: n.name })),
      },
    };
  },
);

// ---------- mapa (F2) ----------

/** El mapa se juega (input y simulación): fase `world`, diorama cargado y ningún panel encima. */
export const selectMapActive = (s: GameState): boolean =>
  s.session.phase === "world" && s.ui.panels.length === 0 && s.world.diorama !== null;

export interface MapActor {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface MapView {
  status: GameState["world"]["dioramaStatus"];
  diorama: DioramaRuntime | null;
  /** NPCs del diorama con su nombre del catálogo (o el id si el catálogo no cargó). */
  actors: MapActor[];
}

const npcName = (npcs: GameState["world"]["npcs"], id: string): string => npcs.find((n) => n.id === id)?.name ?? id;

/** Lo que world/ dibuja: el diorama (estático) y los NPCs. Cambia solo al cargar un diorama. */
export const selectMapView = createViewSelector(
  (s: GameState) => [s.world.dioramaStatus, s.world.diorama, s.world.npcs] as const,
  (status, diorama, npcs): MapView => ({
    status,
    diorama,
    actors: (diorama?.npcs ?? []).map((n) => ({ id: n.id, name: npcName(npcs, n.id), x: n.x, z: n.z })),
  }),
);

export interface InteractionPrompt {
  id: string;
  name: string;
  kind: "npc" | "object";
}

/**
 * Aviso de interacción (03 §2.4 #5, F2 A8): el interactuable más cercano que el núcleo dejó en
 * `nearbyInteractables`. Solo en el mapa y sin paneles encima.
 */
export const selectInteractionPrompt = createViewSelector(
  (s: GameState) => [s.session.phase, s.ui.panels.length, s.world.nearbyInteractables, s.world.diorama, s.world.npcs] as const,
  (phase, panels, nearby, diorama, npcs): InteractionPrompt | null => {
    if (phase !== "world" || panels > 0) return null;
    const item = diorama?.interactables.find((i) => i.id === nearby[0]);
    return item ? { id: item.id, name: item.kind === "npc" ? npcName(npcs, item.id) : item.id, kind: item.kind } : null;
  },
);

export interface WorldHudView {
  mapStatus: GameState["world"]["dioramaStatus"];
  prompt: InteractionPrompt | null;
  zoomStep: ZoomStep;
  zoomSteps: number;
}

export const selectWorldHudView = createViewSelector(
  (s: GameState) => [s.world.dioramaStatus, selectInteractionPrompt(s), s.ui.zoomStep] as const,
  (mapStatus, prompt, zoomStep): WorldHudView => ({ mapStatus, prompt, zoomStep, zoomSteps: ZOOM_STEPS }),
);

export interface WorldRenderView {
  tier: SelectableTier;
  preset: CameraPreset;
  pitchDeg: number;
  yawDeg: number;
  zoomStep: ZoomStep;
  /** "Reducir movimiento" (D-053, F2 A7): la cámara corta en vez de seguir con suavizado. */
  cameraMotion: "follow" | "cut";
  /** Postprocesado permitido (el nivel por tier lo fija TIER_PARAMS); apagado con "reducir movimiento" (§2.9). */
  post: boolean;
  /** Un panel tapa el mapa: el canvas pasa a frameloop "demand" (§2.7.4). */
  paused: boolean;
}

export const selectWorldRender = createViewSelector(
  (s: GameState) => [selectEffectiveTier(s), s.settings.camera, s.settings.accessibility.reduceMotion, s.ui.zoomStep, s.ui.panels.length] as const,
  (tier, preset, reduceMotion, zoomStep, panels): WorldRenderView => {
    const { pitchDeg, yawDeg } = presetAngles(preset);
    return {
      tier, preset, pitchDeg, yawDeg, zoomStep,
      cameraMotion: reduceMotion ? "cut" : "follow",
      post: !reduceMotion && tier !== "low" && tier !== "dialog-only",
      paused: panels > 0,
    };
  },
);
