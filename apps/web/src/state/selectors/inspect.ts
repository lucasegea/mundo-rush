// Flat reads of the live state (FD0, 03 §6.5.2): what a development tool needs to know where
// the player is and what is happening. They are ordinary selectors (R14): they do not know who uses them and the game does not depend on them.
// Fields of phases that do not exist yet come out null or empty; nothing is invented.
import type { Facing } from "@lg/core";
import type { FoundationState } from "../slices";
import type { GameState } from "../store";

export const selectRegionName = (s: GameState): string | null => s.world.regionName;

export const selectCurrentDiorama = (s: GameState): string | null => s.world.currentDiorama;

/** Player's logical position in meters (null outside the map). */
export const selectPlayerPosition = (s: GameState): { x: number; z: number } | null => s.player.position;

/** 1 m tile under the player (D-154: 1 tile = 1 m), in diorama coordinates: x → x, z → y. */
export const selectPlayerTile = (s: GameState): { x: number; y: number } | null => {
  const p = s.player.position;
  return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : null;
};

export const selectPlayerFacing = (s: GameState): Facing => s.player.facing;

/** Interactables within reach, nearest to farthest (computed by the core). */
export const selectNearbyIds = (s: GameState): string[] => s.world.nearbyInteractables;

export interface OpenScene {
  missionId: string | null;
  sceneId: string | null;
  npcId: string | null;
  /** Scene machine state (03 §3.5.1); `idle` until the server opens the scene. */
  step: string;
  /** Turns with a final line in this scene. */
  turnIndex: number;
}

/** The open scene: the dialogue HUD (F4.2) with what the server reported (mission, scene, machine step). */
export const selectOpenScene = (s: GameState): OpenScene | null => {
  const top = s.ui.panels[s.ui.panels.length - 1];
  const panelOpen = top?.kind === "scene";
  if (s.dialogue.sceneId === null && !panelOpen) return null;
  return {
    missionId: s.dialogue.missionId,
    sceneId: s.dialogue.sceneId,
    npcId: s.dialogue.npcId ?? (panelOpen ? top.npcId : null),
    step: s.dialogue.state,
    turnIndex: s.dialogue.subtitles.final.length,
  };
};

/** Final lines of the current scene (final subtitles; never audio, D-108). */
export const selectFinalLines = (s: GameState): readonly string[] => s.dialogue.subtitles.final;

export const selectWorldFlags = (s: GameState): Record<string, boolean> => s.world.flags;

export const selectFoundations = (s: GameState): Record<string, FoundationState> => s.world.foundations;

/** Completed introductions of the neighbor network (`intro:NPC-*`, D-168). */
export const selectNetworkIntros = (s: GameState): string[] => s.world.network.intros;

export const selectLastPick = (s: GameState): { x: number; z: number } | null => s.world.lastPick;
