// Slice `player` (03 §3.3). F2: logical position at 30 Hz (R7), movement intent and speed, written by
// the movement core through actions. The avatar arrives with onboarding.
import { IDLE, type Facing, type MoveIntent } from "@lg/core";

export interface PlayerState {
  /** Logical position (grid cell and simulation coordinates, R7). */
  cell: [number, number] | null;
  position: { x: number; z: number } | null;
  path: [number, number][];
  /** Logical position of the previous step: world/ interpolates between the two (R7). */
  previous: { x: number; z: number } | null;
  velocity: { x: number; z: number };
  intent: MoveIntent;
  /**
   * Open-world-3d T4 (D-820): the held screen direction (WASD), so the intent in the world is recomputed when
   * the camera yaw changes (movement is camera-relative). {0, 0} = none.
   */
  heldDir: { x: number; y: number };
  /** Shift held: runs at 5.5 m/s. */
  running: boolean;
  /** Simulation steps applied (changes on every step that moved something). */
  simTick: number;
  facing: Facing;
  avatar: string | null;
  gameName: string | null;
  pronouns: string | null;
  /** Basket: borrowed mission objects. */
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
