// state/bridge.ts — ÚNICA puerta de world/ al store (03 §4.2.1, §4.3): la lista explícita de acciones que el
// mundo 3D puede despachar. world/ lee solo de state/selectors/ y nunca escribe `nearbyInteractables` (lo deriva
// el núcleo en cada paso de simulación). Un clic de R3F sobre una malla entra como acción semántica (R10, P0
// ADR-025): el mismo traductor del núcleo que usa services/input.
import { LOOK_DRAG_PX as CORE_LOOK_DRAG_PX, markWorldFirstFrame, pointerAction, type PointerHit } from "@lg/core";
import { actions } from "./actions";

export type { PointerHit };

/**
 * Open-world-3d T4 (D-820): el umbral clic/arrastre del núcleo, como número para world/ (que usa el núcleo solo como
 * tipos). Un clic de R3F con `event.delta` mayor fue un arrastre de mirada y no camina.
 */
export const LOOK_DRAG_PX: number = CORE_LOOK_DRAG_PX;

export const bridge = {
  /** Caminar hasta un punto del suelo (metros, plano XZ). */
  moveTo: (x: number, z: number): void => actions.moveTo(x, z),
  /** Interactuar con un interactuable por id (o con el más cercano). */
  interact: (target: string | null = null): void => actions.interact(target),
  /** Clic del puntero sobre el mundo (raycast de R3F) → acción semántica. */
  pointer(hit: PointerHit, button = 0): void {
    const action = pointerAction(hit, button);
    if (action) actions.dispatch(action);
  },
  /** PerformanceMonitor de drei: el FPS cayó por debajo del piso (§2.7.2.2). */
  performanceDeclined: (): void => actions.performanceDeclined(),
  /** world/camera: la distancia del mapa entero cambió (aspecto o yaw); el zoom continuo la usa de tope (PD-5). */
  cameraFit: (fitDistance: number): void => actions.cameraFitted(fitDistance),
  /** `webglcontextlost` (§2.7.2.4). */
  contextLost: (): void => actions.contextLost(),
  /**
   * Open-world-3d T10 (d): el primer cuadro del mundo se dibujó, con `programs` = renderer.info.programs.length. Marca
   * `lg:world-first-frame` (una vez, y solo después de `lg:world-enter`; la regla es de @lg/core). No toca el store.
   */
  worldFirstFrame: (programs: number): boolean => markWorldFirstFrame(globalThis.performance, { programs }),
} as const;

export type WorldBridge = typeof bridge;
