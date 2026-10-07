/** Sheet layout: rows = directions, columns = [idle, walk1, walk2, walk3]. Sprite cell 32x48 px (D-154). */
export const DIRECTIONS = ["down", "left", "right", "up"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const SPRITE_W_PX = 32;
export const SPRITE_H_PX = 48;
export const SHEET_COLUMNS = 4;
export const WALK_FPS = 8;
const MOVE_EPSILON = 1e-3;

/**
 * Y-only billboard: the rotation.y that turns a plane (facing +Z) against the camera's forward
 * direction projected on XZ. With an ortho camera every sprite gets the same angle.
 */
export function billboardYaw(cameraForward: { x: number; z: number }): number {
  if (Math.abs(cameraForward.x) < 1e-9 && Math.abs(cameraForward.z) < 1e-9) return 0;
  return Math.atan2(-cameraForward.x, -cameraForward.z);
}

/**
 * A vertical plane seen by an ortho camera pitched down by p shows only cos(p) of its height
 * (57 deg -> 0.54: a 32x48 sprite reads as 32x26). Scaling the plane on Y by 1/cos(p) restores the
 * drawn proportions without tilting it (rotation stays Y-only, feet stay anchored). Clamped at 3x.
 */
export function spriteHeightCompensation(cameraForward: { x: number; y: number; z: number }): number {
  const len = Math.hypot(cameraForward.x, cameraForward.y, cameraForward.z);
  if (len === 0) return 1;
  const cosPitch = Math.hypot(cameraForward.x, cameraForward.z) / len;
  return Math.min(3, 1 / Math.max(cosPitch, 1e-6));
}

/** Facing relative to the camera: velocity rotated into camera space, then the dominant axis wins. */
export function directionFromVelocity(
  vx: number,
  vz: number,
  cameraYaw: number,
  previous: Direction = "down",
): Direction {
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

/** Frame selection by movement direction: idle column when still, walk cycle columns 1..3 when moving. */
export function selectSpriteFrame(
  vx: number,
  vz: number,
  cameraYaw: number,
  timeSec: number,
  previous: Direction = "down",
): SpriteFrame {
  const moving = Math.hypot(vx, vz) >= MOVE_EPSILON;
  const direction = directionFromVelocity(vx, vz, cameraYaw, previous);
  const col = moving ? 1 + (Math.floor(timeSec * WALK_FPS) % (SHEET_COLUMNS - 1)) : 0;
  return { direction, col, row: DIRECTIONS.indexOf(direction), moving };
}

/** Texture repeat/offset for one sheet cell (canvas textures use flipY = true: row 0 is the top). */
export function sheetCellTransform(col: number, row: number, rows: number = DIRECTIONS.length) {
  return {
    repeatX: 1 / SHEET_COLUMNS,
    repeatY: 1 / rows,
    offsetX: col / SHEET_COLUMNS,
    offsetY: 1 - (row + 1) / rows,
  };
}
