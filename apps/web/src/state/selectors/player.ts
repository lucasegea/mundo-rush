// Selectores del slice `player` (R7): la UI lee la celda (baja frecuencia); world/ lee la pose lógica de forma
// transitoria dentro de useFrame (readGame) e interpola entre `previous` y `position` en refs.
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
  /** Cambia en cada paso de simulación que movió algo. */
  tick: number;
  /** Duración de un paso fijo (s): world/ interpola de previous a position en ese tiempo. */
  stepSec: number;
}

/** Pose lógica del jugador (sin memorizar: se lee por cuadro con readGame, nunca con un hook). */
export const selectPlayerPose = (s: GameState): PlayerPose | null => {
  const p = s.player.position;
  if (!p) return null;
  const prev = s.player.previous ?? p;
  return { x: p.x, z: p.z, prevX: prev.x, prevZ: prev.z, vx: s.player.velocity.x, vz: s.player.velocity.z, tick: s.player.simTick, stepSec: SIM_DT };
};
