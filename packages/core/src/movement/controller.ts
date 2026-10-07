// Controlador cinemático (03 §2.4 #3-#4): intenciones de movimiento → velocidad con aceleración → posición con
// colisión. Paso fijo de simulación (30 Hz) independiente del framerate: misma secuencia de pasos, mismo
// resultado. Sin física (D-087).
import { findPath, smoothPath } from "./astar";
import { circleBlocked, moveCircle } from "./collision";
import { cellAt, nearestWalkable, type Point, type WalkGrid } from "./grid";

/** Paso fijo de simulación: 30 Hz (03 §2.4 #4, R7). */
export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
/** Tope de pasos por cuadro: si el navegador se cuelga, la simulación no intenta "ponerse al día" sin fin. */
export const MAX_STEPS_PER_FRAME = 5;

export interface MovementConfig {
  /** Velocidad de caminata, m/s. */
  speed: number;
  /** Aceleración (y frenado), m/s². */
  accel: number;
  /** Radio del círculo de colisión, m. */
  radius: number;
  /** Distancia a la que un punto de paso cuenta como alcanzado, m. */
  arriveRadius: number;
}

/**
 * Valores por defecto (config del juego, no contenido): paso tranquilo de ~3,5 m/s. El radio es apenas menor que
 * media celda (0,25 m): así un camino entre centros de celdas caminables nunca roza una celda bloqueada y un
 * pasillo de 2 celdas (03 §6.4.5) alcanza.
 */
export const DEFAULT_MOVEMENT: MovementConfig = { speed: 3.5, accel: 24, radius: 0.24, arriveRadius: 0.05 };

export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Intención de movimiento: quieto, dirección mantenida (teclado) o camino planificado (clic). */
export type MoveIntent =
  | { kind: "idle" }
  | { kind: "dir"; x: number; z: number }
  | { kind: "path"; waypoints: readonly Point[] };

export const IDLE: MoveIntent = { kind: "idle" };

export type Facing = "n" | "s" | "e" | "w";

/** Orientación por la componente dominante de la velocidad (n = -z, s = +z, e = +x, w = -x); quieto conserva la anterior. */
export function facingFrom(vx: number, vz: number, previous: Facing): Facing {
  if (Math.hypot(vx, vz) < 1e-3) return previous;
  if (Math.abs(vx) > Math.abs(vz)) return vx > 0 ? "e" : "w";
  return vz > 0 ? "s" : "n";
}

/**
 * Planifica un clic: celda objetivo (o la caminable más cercana si cae sobre un obstáculo), A* y suavizado.
 * El último punto es el punto exacto clickeado si el círculo cabe ahí. null si no hay camino.
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

/** Velocidad deseada y la intención que queda (consume puntos de paso alcanzados). */
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
    // El último tramo frena para no pasarse: nunca más rápido que lo que falta en un paso.
    const speed = waypoints.length === 1 ? Math.min(cfg.speed, dist / dt) : cfg.speed;
    return { vx: (dx / dist) * speed, vz: (dz / dist) * speed, intent: waypoints === intent.waypoints ? intent : { kind: "path", waypoints } };
  }
  return { vx: 0, vz: 0, intent: IDLE };
}

/**
 * Un paso de simulación. La velocidad se acerca a la deseada con `accel`; la posición se mueve con colisión y
 * la velocidad que queda es la real (deslizar sobre una pared reduce la componente que choca).
 */
export function stepBody(
  g: WalkGrid,
  body: Body,
  intent: MoveIntent,
  cfg: MovementConfig = DEFAULT_MOVEMENT,
  dt: number = SIM_DT,
): { body: Body; intent: MoveIntent } {
  const want = desired(body, intent, cfg, dt);
  // En un camino, sin inercia lateral: la velocidad apunta al punto de paso (si no, rodearía las esquinas).
  const maxDelta = cfg.accel * dt;
  const vx = want.intent.kind === "path" ? want.vx : approach(body.vx, want.vx, maxDelta);
  const vz = want.intent.kind === "path" ? want.vz : approach(body.vz, want.vz, maxDelta);
  // Al terminar un camino se frena en seco: el último tramo ya llegó justo al punto.
  const pathDone = intent.kind === "path" && want.intent.kind === "idle";
  const p = pathDone ? body : moveCircle(g, body, vx * dt, vz * dt, cfg.radius);
  const next = { x: p.x, z: p.z, vx: (p.x - body.x) / dt, vz: (p.z - body.z) / dt };
  // Un camino que ya no avanza (bloqueado por algo nuevo) se abandona en vez de empujar para siempre.
  const stuck = want.intent.kind === "path" && Math.hypot(next.vx, next.vz) < 1e-6;
  return { body: next, intent: stuck ? IDLE : want.intent };
}

/** Cuántos pasos fijos tocan en este cuadro y cuánto tiempo queda acumulado. */
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
