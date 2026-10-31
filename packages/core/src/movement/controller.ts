// Kinematic controller (03 §2.4 #3-#4): movement intents → velocity with acceleration → position with
// collision. Fixed simulation step (30 Hz) independent of framerate: same sequence of steps, same
// result. No physics (D-087).
import { findPath, smoothPath } from "./astar";
import { circleBlocked, moveCircle } from "./collision";
import { cellAt, nearestWalkable, type Point, type WalkGrid } from "./grid";

/** Fixed simulation step: 30 Hz (03 §2.4 #4, R7). */
export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
/** Cap on steps per frame: if the browser hangs, the simulation does not try to "catch up" endlessly. */
export const MAX_STEPS_PER_FRAME = 5;

export interface MovementConfig {
  /** Walking speed, m/s. */
  speed: number;
  /** Acceleration (and braking), m/s². */
  accel: number;
  /** Radius of the collision circle, m. */
  radius: number;
  /** Distance at which a waypoint counts as reached, m. */
  arriveRadius: number;
}

/**
 * Default values (game config, not content): relaxed pace of ~3.5 m/s. The radius is just under
 * half a cell (0.25 m): so a path between centers of walkable cells never grazes a blocked cell and a
 * 2-cell corridor (03 §6.4.5) is enough.
 */
export const DEFAULT_MOVEMENT: MovementConfig = { speed: 3.5, accel: 24, radius: 0.24, arriveRadius: 0.05 };
/** Open-world-3d T4 (D-820): run with Shift, 5.5 m/s (mockup V6 `SPEED.run`); everything else the same as walking. */
export const RUN_MOVEMENT: MovementConfig = { ...DEFAULT_MOVEMENT, speed: 5.5 };

export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Movement intent: still, held direction (keyboard) or planned path (click). */
export type MoveIntent =
  | { kind: "idle" }
  | { kind: "dir"; x: number; z: number }
  | { kind: "path"; waypoints: readonly Point[] };

export const IDLE: MoveIntent = { kind: "idle" };

export type Facing = "n" | "s" | "e" | "w";

/** Facing by the dominant component of velocity (n = -z, s = +z, e = +x, w = -x); standing still keeps the previous one. */
export function facingFrom(vx: number, vz: number, previous: Facing): Facing {
  if (Math.hypot(vx, vz) < 1e-3) return previous;
  if (Math.abs(vx) > Math.abs(vz)) return vx > 0 ? "e" : "w";
  return vz > 0 ? "s" : "n";
}

/**
 * Plans a click: target cell (or the nearest walkable one if it lands on an obstacle), A* and smoothing.
 * The last point is the exact clicked point if the circle fits there. null if there is no path.
 */
export function planPath(g: WalkGrid, from: Point, to: Point, cfg: MovementConfig = DEFAULT_MOVEMENT): Point[] | null {
  const start = nearestWalkable(g, cellAt(g, from.x, from.z), 1);
  const goal = nearestWalkable(g, cellAt(g, to.x, to.z));
  if (!start || !goal) return null;
  const cells = findPath(g, start, goal);
  if (!cells) return null;
  const waypoints = smoothPath(g, from, cells, cfg.radius);
  const [tc, tr] = cellAt(g, to.x, to.z);
  const exactFits = goal[0] === tc && goal[1] === tr && !circleBlocked(g, to.x, to.z, cfg.radius);
  if (exactFits) waypoints[waypoints.length - 1] = { x: to.x, z: to.z };
  return waypoints;
}

const approach = (v: number, target: number, maxDelta: number): number =>
  Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta;

/** Desired velocity and the intent that remains (consumes reached waypoints). */
function desired(body: Body, intent: MoveIntent, cfg: MovementConfig, dt: number): { vx: number; vz: number; intent: MoveIntent } {
  if (intent.kind === "dir") {
    const len = Math.hypot(intent.x, intent.z);
    if (len < 1e-9) return { vx: 0, vz: 0, intent: IDLE };
    return { vx: (intent.x / len) * cfg.speed, vz: (intent.z / len) * cfg.speed, intent };
  }
  if (intent.kind === "path") {
    let waypoints = intent.waypoints;
    while (waypoints.length > 0) {
      const w = waypoints[0] as Point;
      if (Math.hypot(w.x - body.x, w.z - body.z) > cfg.arriveRadius) break;
      waypoints = waypoints.slice(1);
    }
    const w = waypoints[0];
    if (!w) return { vx: 0, vz: 0, intent: IDLE };
    const dx = w.x - body.x;
    const dz = w.z - body.z;
    const dist = Math.hypot(dx, dz);
    // No segment overshoots its point: never faster than what is left in one step. Before, only the last one braked and
    // an intermediate point that sat 0.05-0.067 m before the step (more than arriveRadius, less than a step of
    // 0.117 m) was crossed back and forth forever (open-world-3d M2, AC29: the click ended up 3 m from the destination).
    const speed = Math.min(cfg.speed, dist / dt);
    return { vx: (dx / dist) * speed, vz: (dz / dist) * speed, intent: waypoints === intent.waypoints ? intent : { kind: "path", waypoints } };
  }
  return { vx: 0, vz: 0, intent: IDLE };
}

/**
 * One simulation step. Velocity approaches the desired one with `accel`; the position moves with collision and
 * the remaining velocity is the real one (sliding along a wall reduces the colliding component).
 */
export function stepBody(
  g: WalkGrid,
  body: Body,
  intent: MoveIntent,
  cfg: MovementConfig = DEFAULT_MOVEMENT,
  dt: number = SIM_DT,
): { body: Body; intent: MoveIntent } {
  const want = desired(body, intent, cfg, dt);
  // On a path, no lateral inertia: velocity points at the waypoint (otherwise it would cut around the corners).
  const maxDelta = cfg.accel * dt;
  const vx = want.intent.kind === "path" ? want.vx : approach(body.vx, want.vx, maxDelta);
  const vz = want.intent.kind === "path" ? want.vz : approach(body.vz, want.vz, maxDelta);
  // When a path ends it stops dead: the last segment already arrived exactly at the point.
  const pathDone = intent.kind === "path" && want.intent.kind === "idle";
  const p = pathDone ? body : moveCircle(g, body, vx * dt, vz * dt, cfg.radius);
  const next = { x: p.x, z: p.z, vx: (p.x - body.x) / dt, vz: (p.z - body.z) / dt };
  // A path that no longer advances (blocked by something new) is abandoned instead of pushing forever.
  const stuck = want.intent.kind === "path" && Math.hypot(next.vx, next.vz) < 1e-6;
  return { body: next, intent: stuck ? IDLE : want.intent };
}

/** How many fixed steps are due this frame and how much time remains accumulated. */
export function fixedSteps(accumulator: number, frameDt: number, step = SIM_DT, maxSteps = MAX_STEPS_PER_FRAME): { steps: number; accumulator: number } {
  let acc = accumulator + Math.max(0, frameDt);
  let steps = Math.floor(acc / step + 1e-9);
  acc -= steps * step;
  if (steps > maxSteps) {
    steps = maxSteps;
    acc = 0;
  }
  return { steps, accumulator: Math.max(0, acc) };
}
