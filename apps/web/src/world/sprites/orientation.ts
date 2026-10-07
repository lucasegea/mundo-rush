// Billboard HD-2D (03 §2.9, D-154): orientación solo en Y hacia la cámara y cuadro de la hoja según la dirección
// relativa a la cámara. Funciones puras (portadas del spike F0.2, medido).
// Hoja: filas = direcciones, columnas = [quieto, paso 1, paso 2, paso 3]; celda de 32×48 px.
export const DIRECTIONS = ["down", "left", "right", "up"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const SPRITE_W_PX = 32;
export const SPRITE_H_PX = 48;
export const SHEET_COLUMNS = 4;
export const WALK_FPS = 8;
const MOVE_EPSILON = 1e-3;

export interface Vec3Like { x: number; y: number; z: number }

/** Dirección "hacia adelante" de una cámara con ese pitch y yaw (yaw 0: la cámara está en +z mirando a -z). */
export function cameraForward(pitchDeg: number, yawDeg: number): Vec3Like {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  return { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: -Math.cos(y) * Math.cos(p) };
}

/** rotation.y que pone un plano (que mira a +z) de frente a la cámara, solo en Y. */
export function billboardYaw(forward: { x: number; z: number }): number {
  if (Math.abs(forward.x) < 1e-9 && Math.abs(forward.z) < 1e-9) return 0;
  return Math.atan2(-forward.x, -forward.z);
}

/**
 * Un plano vertical visto por una ortográfica inclinada muestra cos(pitch) de su alto (a 57°, el 54 %). Escalar
 * el plano en Y por 1/cos(pitch) devuelve las proporciones dibujadas sin inclinarlo (sigue solo en Y, pies
 * anclados). Tope 3×. Propuesta de F0.2 §8 (D-154).
 */
export function spriteHeightCompensation(forward: Vec3Like): number {
  const len = Math.hypot(forward.x, forward.y, forward.z);
  if (len === 0) return 1;
  const cosPitch = Math.hypot(forward.x, forward.z) / len;
  return Math.min(3, 1 / Math.max(cosPitch, 1e-6));
}

/** Dirección relativa a la cámara: la velocidad pasa a espacio de cámara y gana el eje dominante. */
export function directionFromVelocity(vx: number, vz: number, cameraYaw: number, previous: Direction = "down"): Direction {
  if (Math.hypot(vx, vz) < MOVE_EPSILON) return previous;
  const c = Math.cos(cameraYaw);
  const s = Math.sin(cameraYaw);
  const right = vx * c - vz * s;
  const towardsCamera = vx * s + vz * c;
  if (Math.abs(right) > Math.abs(towardsCamera)) return right > 0 ? "right" : "left";
  return towardsCamera > 0 ? "down" : "up";
}

export interface SpriteFrame {
  readonly direction: Direction;
  readonly col: number;
  readonly row: number;
  readonly moving: boolean;
}

/** Quieto: columna 0; caminando: ciclo de columnas 1..3 a WALK_FPS. */
export function selectSpriteFrame(vx: number, vz: number, cameraYaw: number, timeSec: number, previous: Direction = "down"): SpriteFrame {
  const moving = Math.hypot(vx, vz) >= MOVE_EPSILON;
  const direction = directionFromVelocity(vx, vz, cameraYaw, previous);
  const col = moving ? 1 + (Math.floor(timeSec * WALK_FPS) % (SHEET_COLUMNS - 1)) : 0;
  return { direction, col, row: DIRECTIONS.indexOf(direction), moving };
}

/** repeat/offset de la textura para una celda de la hoja (la fila 0 está arriba). */
export function sheetCellTransform(col: number, row: number, rows: number = DIRECTIONS.length) {
  return { repeatX: 1 / SHEET_COLUMNS, repeatY: 1 / rows, offsetX: col / SHEET_COLUMNS, offsetY: 1 - (row + 1) / rows };
}
