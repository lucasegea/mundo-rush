// Semantic input actions (R10, D-145, D-197). Devices (keyboard, mouse, touch, gamepad, XR)
// are translated into these actions in apps/web/src/services/input/ or, for a click on a mesh, in the
// R3F handler via state/bridge.ts. The core, the store and world/ only see actions.

export const SEMANTIC_ACTIONS = [
  "move", "moveTo", "interact", "talk", "cancel", "openNotebook", "zoomIn", "zoomOut", "look", "run", "toggleOverview",
] as const;
export type SemanticActionType = (typeof SEMANTIC_ACTIONS)[number];

export type SemanticAction =
  /** Direction held on screen (x = right, y = up); {0, 0} = release. */
  | { type: "move"; dir: { x: number; y: number } }
  /** Walk to a point on the ground (meters, XZ plane). */
  | { type: "moveTo"; x: number; z: number }
  /** Interact: with a chosen id (click) or, without an id, with the nearest one. */
  | { type: "interact"; target: string | null }
  | { type: "talk" }
  | { type: "cancel" }
  | { type: "openNotebook" }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  /**
   * Open-world-3d T4 (D-820): look. `dx`/`dy` in screen pixels (a drag past LOOK_DRAG_PX, or Q and R
   * held, which services/input translates to pixels per step); the reducer turns them into yaw and tilt.
   */
  | { type: "look"; dx: number; dy: number }
  /** Run while held (Shift): 5.5 m/s instead of 3.5. */
  | { type: "run"; on: boolean }
  /** V: the whole map (t = 1) or back to the previous distance (PD-5). */
  | { type: "toggleOverview" };

/**
 * Open-world-3d T4 (D-820): single threshold between click and drag, in pixels. services/input imports it from the core; world/
 * (which does not import the core at runtime) receives it through state/bridge.ts. A longer drag looks and never
 * walks; a shorter one is a click.
 */
export const LOOK_DRAG_PX = 6;

/** What the pointer touched in the world (resolved by the R3F raycast in world/). */
export type PointerHit = { kind: "ground"; x: number; z: number } | { kind: "interactable"; id: string };

/** Primary button: walks or interacts. The other buttons do nothing yet. */
export function pointerAction(hit: PointerHit, button = 0): SemanticAction | null {
  if (button !== 0) return null;
  return hit.kind === "ground" ? { type: "moveTo", x: hit.x, z: hit.z } : { type: "interact", target: hit.id };
}

/** Wheel: forward (deltaY < 0) zooms in, backward zooms out (D-197). */
export function wheelAction(deltaY: number): SemanticAction | null {
  if (!Number.isFinite(deltaY) || deltaY === 0) return null;
  return { type: deltaY < 0 ? "zoomIn" : "zoomOut" };
}

/** Wheel pixels worth one notch (a mouse wheel gives ~100 per notch; a trackpad, many small events). */
export const WHEEL_NOTCH_PX = 50;

/**
 * Accumulated wheel (D-208): one zoom step per notch, also with a trackpad. In pixels (`deltaMode` 0) it adds up to
 * WHEEL_NOTCH_PX and then gives a step and returns to zero; a change of direction discards what was accumulated. In lines or pages
 * (`deltaMode` 1 or 2) each event is a notch.
 */
export function wheelZoom(acc: number, deltaY: number, deltaMode = 0): { acc: number; action: SemanticAction | null } {
  if (!Number.isFinite(deltaY) || deltaY === 0) return { acc, action: null };
  if (deltaMode !== 0) return { acc: 0, action: wheelAction(deltaY) };
  const sum = Math.sign(acc) === Math.sign(deltaY) ? acc + deltaY : deltaY;
  return Math.abs(sum) >= WHEEL_NOTCH_PX ? { acc: 0, action: wheelAction(sum) } : { acc: sum, action: null };
}

export type HeldDirection = "up" | "down" | "left" | "right";

/** Screen direction from the held keys; opposites cancel out; diagonal normalized. */
export function dirFromHeld(held: ReadonlySet<HeldDirection>): { x: number; y: number } {
  const x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  const y = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0);
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}
