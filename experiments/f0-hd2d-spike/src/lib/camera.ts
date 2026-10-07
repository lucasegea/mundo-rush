import { TILE_PX } from "./tileChunk";

export type CameraPreset = "topdownOrtho" | "isoOrtho";
export const PITCH_OPTIONS = [55, 56, 57, 58, 59, 60] as const;
export const DEFAULT_PITCH = 57;
/** ~15 tiles visible across the screen (D-053, D-154). */
export const TARGET_TILES_WIDE = 15;
/** True isometric elevation (atan(1/sqrt 2)); isoOrtho ignores the pitch selector. */
export const ISO_PITCH = 35.264;
export const CAMERA_DISTANCE = 40;

const DEG = Math.PI / 180;
type Vec3 = [number, number, number];

export function presetAngles(preset: CameraPreset, pitchDeg: number): { pitchDeg: number; yawDeg: number } {
  return preset === "isoOrtho" ? { pitchDeg: ISO_PITCH, yawDeg: 45 } : { pitchDeg, yawDeg: 0 };
}

/** Offset from the look target to the camera: elevated by pitch, rotated around Y by yaw (yaw 0 = camera on +Z). */
export function cameraOffset(pitchDeg: number, yawDeg: number, distance = CAMERA_DISTANCE): Vec3 {
  const p = pitchDeg * DEG;
  const y = yawDeg * DEG;
  const flat = Math.cos(p) * distance;
  return [Math.sin(y) * flat, Math.sin(p) * distance, Math.cos(y) * flat];
}

/** Ortho frustum for a view `widthM` metres wide. */
export function orthoFrustum(widthM: number, aspect: number) {
  const halfW = widthM / 2;
  const halfH = halfW / aspect;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

/**
 * View width (m) that gives an integer number of screen pixels per texel, as close as possible to
 * `targetTiles` across. Example: 1366 px, 15 tiles -> scale 3 -> 14.23 m.
 */
export function integerScaleViewWidth(canvasPx: number, targetTiles = TARGET_TILES_WIDE, texelsPerTile = TILE_PX): number {
  const scale = Math.max(1, Math.round(canvasPx / (targetTiles * texelsPerTile)));
  return canvasPx / (scale * texelsPerTile);
}

/**
 * Snaps a camera position to the screen pixel grid: its components along the camera's right and up
 * axes become multiples of one pixel's world size. Static texels then land on the same pixels from
 * frame to frame (anti-shimmer). right/up must be unit vectors.
 */
export function snapToPixelGrid(pos: Vec3, right: Vec3, up: Vec3, worldPerPx: number): Vec3 {
  if (!(worldPerPx > 0)) return pos;
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const r = dot(pos, right) / worldPerPx;
  const u = dot(pos, up) / worldPerPx;
  const dr = (Math.round(r) - r) * worldPerPx;
  const du = (Math.round(u) - u) * worldPerPx;
  return [
    pos[0] + dr * right[0] + du * up[0],
    pos[1] + dr * right[1] + du * up[1],
    pos[2] + dr * right[2] + du * up[2],
  ];
}

/** Frame-rate independent exponential smoothing factor. */
export function followAlpha(dtSec: number, rate = 6): number {
  return 1 - Math.exp(-rate * Math.max(0, dtSec));
}
