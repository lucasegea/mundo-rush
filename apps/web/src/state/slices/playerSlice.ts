// Slice `player` (03 §3.3). F2: posición lógica a 30 Hz (R7), intención de movimiento y velocidad, que escribe
// el núcleo de movimiento por acciones. El avatar llega con el onboarding.
import { IDLE, type Facing, type MoveIntent } from "@lg/core";

export interface PlayerState {
  /** Posición lógica (celda de la grilla y coordenadas de simulación, R7). */
  cell: [number, number] | null;
  position: { x: number; z: number } | null;
  path: [number, number][];
  /** Posición lógica del paso anterior: world/ interpola entre las dos (R7). */
  previous: { x: number; z: number } | null;
  velocity: { x: number; z: number };
  intent: MoveIntent;
  /**
   * Open-world-3d T4 (D-820): la dirección de pantalla mantenida (WASD), así la intención en el mundo se recalcula cuando
   * cambia el yaw de la cámara (moverse es relativo a la cámara). {0, 0} = ninguna.
   */
  heldDir: { x: number; y: number };
  /** Shift mantenida: corre a 5,5 m/s. */
  running: boolean;
  /** Pasos de simulación aplicados (cambia en cada paso que movió algo). */
  simTick: number;
  facing: Facing;
  avatar: string | null;
  gameName: string | null;
  pronouns: string | null;
  /** Canasta: objetos prestados de misión. */
  basket: string[];
}

export const PLAYER_PERSIST = "server" as const;

export const initialPlayer = (): PlayerState => ({
  cell: null,
  position: null,
  path: [],
  previous: null,
  velocity: { x: 0, z: 0 },
  intent: IDLE,
  heldDir: { x: 0, y: 0 },
  running: false,
  simTick: 0,
  facing: "s",
  avatar: null,
  gameName: null,
  pronouns: null,
  basket: [],
});
