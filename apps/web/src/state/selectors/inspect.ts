// Lecturas planas del estado vivo (FD0, 03 §6.5.2): lo que una herramienta de desarrollo necesita para saber dónde
// está el jugador y qué pasa. Son selectores comunes (R14): no saben quién los usa y el juego no depende de ellos.
// Los campos de fases que todavía no existen salen null o vacíos; no se inventa nada.
import type { Facing } from "@lg/core";
import type { FoundationState } from "../slices";
import type { GameState } from "../store";

export const selectRegionName = (s: GameState): string | null => s.world.regionName;

export const selectCurrentDiorama = (s: GameState): string | null => s.world.currentDiorama;

/** Posición lógica del jugador en metros (null fuera del mapa). */
export const selectPlayerPosition = (s: GameState): { x: number; z: number } | null => s.player.position;

/** Tile de 1 m bajo el jugador (D-154: 1 tile = 1 m), en coordenadas del diorama: x → x, z → y. */
export const selectPlayerTile = (s: GameState): { x: number; y: number } | null => {
  const p = s.player.position;
  return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : null;
};

export const selectPlayerFacing = (s: GameState): Facing => s.player.facing;

/** Interactuables al alcance, del más cercano al más lejano (los calcula el núcleo). */
export const selectNearbyIds = (s: GameState): string[] => s.world.nearbyInteractables;

export interface OpenScene {
  missionId: string | null;
  sceneId: string | null;
  npcId: string | null;
  /** Estado de la máquina de escena (03 §3.5.1); `idle` mientras la escena es el placeholder de F2. */
  step: string;
  /** Turnos con línea final en esta escena. */
  turnIndex: number;
}

/**
 * La escena abierta: la de la máquina de escena (F4) o, mientras tanto, el panel placeholder de escena (F2).
 * La misión todavía no está en el store (llega con F4.1): sale null.
 */
export const selectOpenScene = (s: GameState): OpenScene | null => {
  const top = s.ui.panels[s.ui.panels.length - 1];
  const placeholderNpc = top?.kind === "scene" ? top.npcId : null;
  if (s.dialogue.sceneId === null && placeholderNpc === null) return null;
  return {
    missionId: null,
    sceneId: s.dialogue.sceneId,
    npcId: s.dialogue.npcId ?? placeholderNpc,
    step: s.dialogue.state,
    turnIndex: s.dialogue.subtitles.final.length,
  };
};

/** Líneas finales de la escena en curso (subtítulos finales; nunca audio, D-108). */
export const selectFinalLines = (s: GameState): readonly string[] => s.dialogue.subtitles.final;

export const selectWorldFlags = (s: GameState): Record<string, boolean> => s.world.flags;

export const selectFoundations = (s: GameState): Record<string, FoundationState> => s.world.foundations;

/** Presentaciones consumadas de la red de vecinos (`intro:NPC-*`, D-168). */
export const selectNetworkIntros = (s: GameState): string[] => s.world.network.intros;

export const selectLastPick = (s: GameState): { x: number; z: number } | null => s.world.lastPick;
