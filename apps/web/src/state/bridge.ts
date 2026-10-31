// state/bridge.ts — the ONLY door from world/ to the store (03 §4.2.1, §4.3): the explicit list of actions the
// 3D world may dispatch. world/ reads only from state/selectors/ and never writes `nearbyInteractables` (the core derives
// it on every simulation step). An R3F click on a mesh enters as a semantic action (R10, P0
// ADR-025): the same core translator that services/input uses.
import { LOOK_DRAG_PX as CORE_LOOK_DRAG_PX, markWorldFirstFrame, pointerAction, type PointerHit } from "@lg/core";
import { actions } from "./actions";

export type { PointerHit };

/**
 * Open-world-3d T4 (D-820): the core's click/drag threshold, as a number for world/ (which uses the core only as
 * types). An R3F click with a larger `event.delta` was a look drag and does not walk.
 */
export const LOOK_DRAG_PX: number = CORE_LOOK_DRAG_PX;

export const bridge = {
  /** Walk to a point on the ground (meters, XZ plane). */
  moveTo: (x: number, z: number): void => actions.moveTo(x, z),
  /** Interact with an interactable by id (or with the nearest one). */
  interact: (target: string | null = null): void => actions.interact(target),
  /** Pointer click on the world (R3F raycast) → semantic action. */
  pointer(hit: PointerHit, button = 0): void {
    const action = pointerAction(hit, button);
    if (action) actions.dispatch(action);
  },
  /** drei's PerformanceMonitor: FPS fell below the floor (§2.7.2.2). */
  performanceDeclined: (): void => actions.performanceDeclined(),
  /** world/camera: the whole-map distance changed (aspect or yaw); continuous zoom uses it as a cap (PD-5). */
  cameraFit: (fitDistance: number): void => actions.cameraFitted(fitDistance),
  /** `webglcontextlost` (§2.7.2.4). */
  contextLost: (): void => actions.contextLost(),
  /**
   * Open-world-3d T10 (d): the world's first frame was drawn, with `programs` = renderer.info.programs.length. Marks
   * `lg:world-first-frame` (once, and only after `lg:world-enter`; the rule belongs to @lg/core). Does not touch the store.
   */
  worldFirstFrame: (programs: number): boolean => markWorldFirstFrame(globalThis.performance, { programs }),
} as const;

export type WorldBridge = typeof bridge;
