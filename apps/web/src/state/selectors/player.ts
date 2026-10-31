// Selectors of the `player` slice (R7): the UI reads the cell (low frequency); world/ reads the logical pose
// transiently inside useFrame (readGame) and interpolates between `previous` and `position` in refs.
import { SIM_DT } from "@lg/core";
import type { GameState } from "../store";

export const selectPlayerCell = (s: GameState): [number, number] | null => s.player.cell;

export interface PlayerPose {
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  /** Changes on every simulation step that moved something. */
  tick: number;
  /** Duration of a fixed step (s): world/ interpolates from previous to position over that time. */
  stepSec: number;
}

/** The player's logical pose (not memoized: read per frame with readGame, never with a hook). */
export const selectPlayerPose = (s: GameState): PlayerPose | null => {
  const p = s.player.position;
  if (!p) return null;
  const prev = s.player.previous ?? p;
  return { x: p.x, z: p.z, prevX: prev.x, prevZ: prev.z, vx: s.player.velocity.x, vz: s.player.velocity.z, tick: s.player.simTick, stepSec: SIM_DT };
};
