// Selectors of the `world` slice: dialogue-only mode view-model (the region's places and who is at each one)
// and, since F2, what world/ draws, the HUD's interaction prompt and the map's render parameters.
import { THIRD_PERSON, zoomTAt, type CameraPresetId, type DioramaRuntime, type Panel, type SelectableTier } from "@lg/core";
import type { CharacterLook } from "@lg/art";
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

// ---------- map (F2) ----------

/** The map is being played (input and simulation): phase `world`, diorama loaded and no panel on top. */
export const selectMapActive = (s: GameState): boolean =>
  s.session.phase === "world" && s.ui.panels.length === 0 && s.world.diorama !== null;

export interface MapActor {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Look of its sheet (plan estetica-c M5); null if the catalog did not load or the sheet does not carry it. */
  look: CharacterLook | null;
}

export interface MapView {
  status: GameState["world"]["dioramaStatus"];
  diorama: DioramaRuntime | null;
  /** The diorama's NPCs with their catalog name (or the id if the catalog did not load). */
  actors: MapActor[];
}

const npcName = (npcs: GameState["world"]["npcs"], id: string): string => npcs.find((n) => n.id === id)?.name ?? id;

/** What world/ draws: the diorama (static) and the NPCs. Changes when a diorama or the catalog loads. */
export const selectMapView = createViewSelector(
  (s: GameState) => [s.world.dioramaStatus, s.world.diorama, s.world.npcs] as const,
  (status, diorama, npcs): MapView => ({
    status,
    diorama,
    actors: (diorama?.npcs ?? []).map((n) => {
      const info = npcs.find((x) => x.id === n.id);
      return { id: n.id, name: info?.name ?? n.id, x: n.x, z: n.z, look: info?.look ?? null };
    }),
  }),
);

/**
 * Amber request bubble (proposal C §3, plan estetica-c M5): the diorama's NPCs with an open request, according to
 * `npcStates[id].requestIcon` of the `world` slice, the narrowest signal that already exists for "this NPC has a request". The
 * NPC of the ongoing conversation does not show it (the panel already names them). M5 SEAM: today nobody writes `requestIcon`, so the
 * list comes out empty in the game; it is filled by the mission system or the board when it opens requests per NPC.
 */
export const selectRequestBubbles = createViewSelector(
  (s: GameState) => [s.world.diorama, s.world.npcStates, selectConversationFrame(s)?.npcId ?? null] as const,
  (diorama, states, talking): string[] =>
    (diorama?.npcs ?? []).filter((n) => states[n.id]?.requestIcon === true && n.id !== talking).map((n) => n.id),
);

export interface InteractionPrompt {
  id: string;
  name: string;
  kind: "npc" | "object";
}

/**
 * Interaction prompt (03 §2.4 #5, F2 A8): the nearest interactable the core left in
 * `nearbyInteractables`. Only on the map and with no panels on top.
 */
export const selectInteractionPrompt = createViewSelector(
  (s: GameState) => [s.session.phase, s.ui.panels.length, s.world.nearbyInteractables, s.world.diorama, s.world.npcs] as const,
  (phase, panels, nearby, diorama, npcs): InteractionPrompt | null => {
    if (phase !== "world" || panels > 0) return null;
    const item = diorama?.interactables.find((i) => i.id === nearby[0]);
    return item ? { id: item.id, name: item.kind === "npc" ? npcName(npcs, item.id) : item.id, kind: item.kind } : null;
  },
);

/**
 * The NPC highlighted in the world (plan estetica-c M1 item 15): the same one the HUD prompt names, because both come
 * from `selectInteractionPrompt` (A13). With nobody in range, or if the nearest is not an NPC, there is no highlight.
 */
export const selectHighlightedNpc = createViewSelector(
  (s: GameState) => [selectInteractionPrompt(s)] as const,
  (prompt): string | null => (prompt?.kind === "npc" ? prompt.id : null),
);

export interface WorldHudView {
  mapStatus: GameState["world"]["dioramaStatus"];
  prompt: InteractionPrompt | null;
  /** Continuous zoom (PD-5): the requested distance rounded (m), or null with the whole map. */
  zoomMeters: number | null;
  /** At the near cap (2.5 m) or far cap (the whole map): the zoom buttons stay aria-disabled. */
  zoomAtMin: boolean;
  zoomAtMax: boolean;
  /** Effective tier: the quality chip at the bottom right (development only, plan estetica-c M4). */
  tier: SelectableTier;
}

export const selectWorldHudView = createViewSelector(
  (s: GameState) => [s.world.dioramaStatus, selectInteractionPrompt(s), s.ui.camera.zoomDistance, s.ui.camera.fitDistance, s.ui.camera.overview, selectEffectiveTier(s)] as const,
  (mapStatus, prompt, zoomDistance, fit, overview, tier): WorldHudView => {
    const t = overview ? 1 : zoomTAt(zoomDistance, fit);
    return {
      mapStatus, prompt, tier,
      zoomMeters: t >= 1 ? null : Math.round(Math.min(zoomDistance, fit) * 10) / 10,
      zoomAtMin: t <= 0, zoomAtMax: t >= 1,
    };
  },
);

/**
 * Two-shot (plan estetica-c M1 item 3): while the top panel is the scene with an NPC who is in the
 * diorama, world/ frames both. The positions are the logical ones (the player already settled by `standoffPoint`).
 */
export interface ConversationFrame {
  npcId: string;
  npc: { x: number; z: number };
  player: { x: number; z: number };
}

const topPanel = (panels: readonly Panel[]): Panel | undefined => panels[panels.length - 1];

export const selectConversationFrame = createViewSelector(
  (s: GameState) => [s.session.phase, s.ui.panels, s.world.diorama, s.player.position] as const,
  (phase, panels, diorama, player): ConversationFrame | null => {
    const top = topPanel(panels);
    if (phase !== "world" || top?.kind !== "scene" || top.npcId === null || !player) return null;
    const npc = diorama?.npcs.find((n) => n.id === top.npcId);
    return npc ? { npcId: npc.id, npc: { x: npc.x, z: npc.z }, player: { x: player.x, z: player.z } } : null;
  },
);

/** Frame cap with a conversation scene on top (03 §2.7.4): frees CPU for audio and the WebSocket. */
export const CONVERSATION_MAX_FPS = 30;

export interface WorldRenderView {
  tier: SelectableTier;
  /**
   * `dialogueFrame` during a conversation with a diorama NPC; otherwise `thirdPerson` (open-world-3d T5, PD-5: a
   * `perspective3D` setting opens the same camera with the whole map). Yaw, pitch and zoom do NOT go here: they change with
   * every drag and CameraRig reads them with `readGame(selectCameraView)` inside useFrame (D-820), without re-render.
   */
  preset: CameraPresetId;
  /**
   * Requested zoom t, quantized to 0.05 (what depends on it in React: which labels are drawn). The camera uses the
   * exact one from `selectCameraView`.
   */
  zoomBand: number;
  /** "Reduce motion" (D-053, F2 A7): the camera cuts instead of following with smoothing. */
  cameraMotion: "follow" | "cut";
  /** Postprocessing allowed (the level per tier is set by TIER_PARAMS); off with "reduce motion" (§2.9). */
  post: boolean;
  /**
   * A panel covers the map: the canvas goes to frameloop "demand" (§2.7.4). With the scene on top it stays alive (the
   * camera transition and the characters' idle, plan estetica-c M1 item 5), with the `conversationFps` cap.
   */
  paused: boolean;
  /**
   * Plan estetica-c M6 (03 §2.7.4): with a conversation scene on top, the frame cap (30); otherwise null and the tier's
   * `targetFps` rules. world/ also freezes the non-essential (water, background NPCs) and does not measure performance while
   * it lasts (PerformanceMonitor never lowers or raises the tier because of the conversation's own cap).
   */
  conversationFps: number | null;
}

const ZOOM_BAND = 0.05;

export const selectWorldRender = createViewSelector(
  (s: GameState) => [selectEffectiveTier(s), s.settings.accessibility.reduceMotion, selectZoomBand(s), s.ui.panels, selectConversationFrame(s) !== null] as const,
  (tier, reduceMotion, zoomBand, panels, talking): WorldRenderView => {
    const top = topPanel(panels);
    return {
      tier, preset: talking ? "dialogueFrame" : "thirdPerson", zoomBand,
      cameraMotion: reduceMotion ? "cut" : "follow",
      post: !reduceMotion && tier !== "low" && tier !== "dialog-only",
      paused: top !== undefined && top.kind !== "scene",
      conversationFps: top?.kind === "scene" ? CONVERSATION_MAX_FPS : null,
    };
  },
);

// ---------- third-person camera (open-world-3d T4/T5, D-820, PD-5) ----------

const zoomTOf = (c: GameState["ui"]["camera"]): number => (c.overview ? 1 : zoomTAt(c.zoomDistance, c.fitDistance));

/** Quantized requested zoom t (see `WorldRenderView.zoomBand`). */
export const selectZoomBand = (s: GameState): number => Math.round(zoomTOf(s.ui.camera) / ZOOM_BAND) * ZOOM_BAND;

export interface CameraView {
  yawDeg: number;
  pitchDeg: number;
  /** Requested distance (m); world/camera clamps it to its live `fitDistance`. */
  zoomDistance: number;
  /** Whole map: the distance is that of `fitDistance`, whatever it is. */
  overview: boolean;
  /** Whole-map distance held by the store (world/camera corrects it with `bridge.cameraFit`). */
  fitDistance: number;
  /** Requested zoom t (0 = 2.5 m, 1 = the whole map) with the store's whole-map distance. */
  t: number;
  /** "Reduce motion": zoom, pitch and pivot cut, without smoothing. */
  reduceMotion: boolean;
  /** Zoom distances (m): the core's, which world/ does not import at runtime. */
  minDistance: number;
  userPitchMin: number;
  userPitchMax: number;
}

/**
 * What CameraRig reads every frame with `readGame` (03 §2.3, D-820): no subscription or re-render per drag. The
 * object is reused while nothing changed.
 */
export const selectCameraView = createViewSelector(
  (s: GameState) => [s.ui.camera.yawDeg, s.ui.camera.pitchDeg, s.ui.camera.zoomDistance, s.ui.camera.overview, s.ui.camera.fitDistance, s.settings.accessibility.reduceMotion] as const,
  (yawDeg, pitchDeg, zoomDistance, overview, fitDistance, reduceMotion): CameraView => ({
    yawDeg, pitchDeg, zoomDistance, overview, fitDistance, reduceMotion, t: overview ? 1 : zoomTAt(zoomDistance, fitDistance),
    minDistance: THIRD_PERSON.minDistance, userPitchMin: THIRD_PERSON.minPitchDeg, userPitchMax: THIRD_PERSON.maxPitchDeg,
  }),
);
