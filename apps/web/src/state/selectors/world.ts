// Selectores del slice `world`: view-model del modo solo-diálogo (lugares de la región y quién está en cada uno)
// y, desde F2, lo que world/ dibuja, el aviso de interacción del HUD y los parámetros de render del mapa.
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

// ---------- mapa (F2) ----------

/** El mapa se juega (input y simulación): fase `world`, diorama cargado y ningún panel encima. */
export const selectMapActive = (s: GameState): boolean =>
  s.session.phase === "world" && s.ui.panels.length === 0 && s.world.diorama !== null;

export interface MapActor {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Apariencia de su ficha (plan estetica-c M5); null si el catálogo no cargó o la ficha no la trae. */
  look: CharacterLook | null;
}

export interface MapView {
  status: GameState["world"]["dioramaStatus"];
  diorama: DioramaRuntime | null;
  /** NPCs del diorama con su nombre del catálogo (o el id si el catálogo no cargó). */
  actors: MapActor[];
}

const npcName = (npcs: GameState["world"]["npcs"], id: string): string => npcs.find((n) => n.id === id)?.name ?? id;

/** Lo que world/ dibuja: el diorama (estático) y los NPCs. Cambia al cargar un diorama o el catálogo. */
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
 * Burbuja ámbar de pedido (propuesta C §3, plan estetica-c M5): los NPCs del diorama con un pedido abierto, según
 * `npcStates[id].requestIcon` del slice `world`, la señal más angosta que ya existe para "este NPC tiene un pedido". El
 * NPC de la charla en curso no la muestra (el panel ya lo nombra). M5 SEAM: hoy nadie escribe `requestIcon`, así que la
 * lista sale vacía en el juego; la llena el sistema de misiones o del tablero cuando abra pedidos por NPC.
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

/**
 * El NPC resaltado en el mundo (plan estetica-c M1 ítem 15): el mismo que nombra el aviso del HUD, porque los dos salen
 * de `selectInteractionPrompt` (A13). Sin nadie en rango, o si lo más cercano no es un NPC, no hay resaltado.
 */
export const selectHighlightedNpc = createViewSelector(
  (s: GameState) => [selectInteractionPrompt(s)] as const,
  (prompt): string | null => (prompt?.kind === "npc" ? prompt.id : null),
);

export interface WorldHudView {
  mapStatus: GameState["world"]["dioramaStatus"];
  prompt: InteractionPrompt | null;
  /** Zoom continuo (PD-5): la distancia pedida redondeada (m), o null con el mapa entero. */
  zoomMeters: number | null;
  /** En el tope cercano (2,5 m) o lejano (el mapa entero): los botones de zoom quedan aria-disabled. */
  zoomAtMin: boolean;
  zoomAtMax: boolean;
  /** Tier efectivo: el chip de calidad de abajo a la derecha (solo en desarrollo, plan estetica-c M4). */
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
 * Plano de a dos (plan estetica-c M1 ítem 3): mientras el panel de arriba es la escena con un NPC que está en el
 * diorama, world/ encuadra a los dos. Las posiciones son las lógicas (el jugador ya acomodado por `standoffPoint`).
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

/** Tope de cuadros con una escena de conversación arriba (03 §2.7.4): libera CPU para el audio y el WebSocket. */
export const CONVERSATION_MAX_FPS = 30;

export interface WorldRenderView {
  tier: SelectableTier;
  /**
   * `dialogueFrame` mientras dura una charla con un NPC del diorama; si no, `thirdPerson` (open-world-3d T5, PD-5: un
   * ajuste `perspective3D` abre la misma cámara con el mapa entero). Yaw, inclinación y zoom NO van acá: cambian con
   * cada arrastre y CameraRig los lee con `readGame(selectCameraView)` dentro de useFrame (D-820), sin re-render.
   */
  preset: CameraPresetId;
  /**
   * t de zoom pedido, cuantizado a 0,05 (lo que depende de él en React: qué etiquetas se dibujan). La cámara usa el
   * exacto de `selectCameraView`.
   */
  zoomBand: number;
  /** "Reducir movimiento" (D-053, F2 A7): la cámara corta en vez de seguir con suavizado. */
  cameraMotion: "follow" | "cut";
  /** Postprocesado permitido (el nivel por tier lo fija TIER_PARAMS); apagado con "reducir movimiento" (§2.9). */
  post: boolean;
  /**
   * Un panel tapa el mapa: el canvas pasa a frameloop "demand" (§2.7.4). Con la escena arriba sigue vivo (la
   * transición de cámara y el idle de los personajes, plan estetica-c M1 ítem 5), con el tope de `conversationFps`.
   */
  paused: boolean;
  /**
   * Plan estetica-c M6 (03 §2.7.4): con una escena de conversación arriba, el tope de cuadros (30); si no, null y manda
   * el `targetFps` del tier. world/ además congela lo no esencial (agua, NPCs de fondo) y no mide rendimiento mientras
   * dura (PerformanceMonitor nunca baja ni sube el tier por el tope propio de la charla).
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

// ---------- cámara en tercera persona (open-world-3d T4/T5, D-820, PD-5) ----------

const zoomTOf = (c: GameState["ui"]["camera"]): number => (c.overview ? 1 : zoomTAt(c.zoomDistance, c.fitDistance));

/** t de zoom pedido cuantizado (ver `WorldRenderView.zoomBand`). */
export const selectZoomBand = (s: GameState): number => Math.round(zoomTOf(s.ui.camera) / ZOOM_BAND) * ZOOM_BAND;

export interface CameraView {
  yawDeg: number;
  pitchDeg: number;
  /** Distancia pedida (m); world/camera la acota a su `fitDistance` vivo. */
  zoomDistance: number;
  /** Mapa entero: la distancia es la de `fitDistance`, sea cual sea. */
  overview: boolean;
  /** Distancia del mapa entero que tiene el store (world/camera la corrige con `bridge.cameraFit`). */
  fitDistance: number;
  /** t de zoom pedido (0 = 2,5 m, 1 = el mapa entero) con la distancia del mapa entero del store. */
  t: number;
  /** "Reducir movimiento": zoom, inclinación y pivote cortan, sin suavizado. */
  reduceMotion: boolean;
  /** Distancias del zoom (m): las del núcleo, que world/ no importa en tiempo de ejecución. */
  minDistance: number;
  userPitchMin: number;
  userPitchMax: number;
}

/**
 * Lo que CameraRig lee en cada cuadro con `readGame` (03 §2.3, D-820): sin suscripción ni re-render por arrastre. El
 * objeto se reusa mientras nada cambió.
 */
export const selectCameraView = createViewSelector(
  (s: GameState) => [s.ui.camera.yawDeg, s.ui.camera.pitchDeg, s.ui.camera.zoomDistance, s.ui.camera.overview, s.ui.camera.fitDistance, s.settings.accessibility.reduceMotion] as const,
  (yawDeg, pitchDeg, zoomDistance, overview, fitDistance, reduceMotion): CameraView => ({
    yawDeg, pitchDeg, zoomDistance, overview, fitDistance, reduceMotion, t: overview ? 1 : zoomTAt(zoomDistance, fitDistance),
    minDistance: THIRD_PERSON.minDistance, userPitchMin: THIRD_PERSON.minPitchDeg, userPitchMax: THIRD_PERSON.maxPitchDeg,
  }),
);
