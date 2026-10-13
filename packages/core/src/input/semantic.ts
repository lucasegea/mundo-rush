// Acciones semánticas de input (R10, D-145, D-197). Los dispositivos (teclado, mouse, táctil, gamepad, XR)
// se traducen a estas acciones en apps/web/src/services/input/ o, para un clic sobre una malla, en el handler
// de R3F vía state/bridge.ts. El núcleo, el store y world/ solo ven acciones.

export const SEMANTIC_ACTIONS = ["move", "moveTo", "interact", "talk", "cancel", "openNotebook", "zoomIn", "zoomOut"] as const;
export type SemanticActionType = (typeof SEMANTIC_ACTIONS)[number];

export type SemanticAction =
  /** Dirección mantenida en pantalla (x = derecha, y = arriba); {0, 0} = soltar. */
  | { type: "move"; dir: { x: number; y: number } }
  /** Caminar hasta un punto del suelo (metros, plano XZ). */
  | { type: "moveTo"; x: number; z: number }
  /** Interactuar: con un id elegido (clic) o, sin id, con el más cercano. */
  | { type: "interact"; target: string | null }
  | { type: "talk" }
  | { type: "cancel" }
  | { type: "openNotebook" }
  | { type: "zoomIn" }
  | { type: "zoomOut" };

/** Lo que el puntero tocó en el mundo (lo resuelve el raycast de R3F en world/). */
export type PointerHit = { kind: "ground"; x: number; z: number } | { kind: "interactable"; id: string };

/** Botón principal: camina o interactúa. Los demás botones no hacen nada todavía. */
export function pointerAction(hit: PointerHit, button = 0): SemanticAction | null {
  if (button !== 0) return null;
  return hit.kind === "ground" ? { type: "moveTo", x: hit.x, z: hit.z } : { type: "interact", target: hit.id };
}

/** Rueda: hacia adelante (deltaY < 0) acerca, hacia atrás aleja (D-197). */
export function wheelAction(deltaY: number): SemanticAction | null {
  if (!Number.isFinite(deltaY) || deltaY === 0) return null;
  return { type: deltaY < 0 ? "zoomIn" : "zoomOut" };
}

/** Píxeles de rueda que valen una muesca (una rueda de mouse da ~100 por muesca; un trackpad, muchos eventos chicos). */
export const WHEEL_NOTCH_PX = 50;

/**
 * Rueda acumulada (D-208): un paso de zoom por muesca, también con trackpad. En píxeles (`deltaMode` 0) suma hasta
 * WHEEL_NOTCH_PX y ahí da un paso y vuelve a cero; un cambio de sentido descarta lo acumulado. En líneas o páginas
 * (`deltaMode` 1 o 2) cada evento es una muesca.
 */
export function wheelZoom(acc: number, deltaY: number, deltaMode = 0): { acc: number; action: SemanticAction | null } {
  if (!Number.isFinite(deltaY) || deltaY === 0) return { acc, action: null };
  if (deltaMode !== 0) return { acc: 0, action: wheelAction(deltaY) };
  const sum = Math.sign(acc) === Math.sign(deltaY) ? acc + deltaY : deltaY;
  return Math.abs(sum) >= WHEEL_NOTCH_PX ? { acc: 0, action: wheelAction(sum) } : { acc: sum, action: null };
}

export type HeldDirection = "up" | "down" | "left" | "right";

/** Dirección de pantalla a partir de las teclas mantenidas; opuestas se anulan; diagonal normalizada. */
export function dirFromHeld(held: ReadonlySet<HeldDirection>): { x: number; y: number } {
  const x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  const y = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0);
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}
