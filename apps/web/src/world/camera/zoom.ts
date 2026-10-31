// world/camera/zoom.ts — the continuous zoom of `thirdPerson` (open-world-3d T5, PD-5), pure: the lens by aspect,
// the whole-map distance (`fitDistance`, which depends on yaw and aspect) and the pose that comes from t in [0, 1]: the
// log-linear distance from 2.5 m (t = 0) to `fitDistance` (t = 1), the effective tilt rising to 82°, the pivot that
// goes from the player to the map center, the fog and far plane that grow, the labels that fade out and the beacons
// that appear. The numbers are the V6 mockup's (`main.js` updateCamera, `world.js` applyView).
// Open-world-3d T6 (AC40): the far plane comes from `farPlaneFor(t)` of world/sky. Open-world-3d T7b (D-839): the fog
// is no longer in the pose (its range belongs to the look; the camera is core): `fogFor(look.fog.range, fogScale, t)` of
// world/sky builds it with the same t (Lighting).
import { farPlaneFor } from "../sky/palette";

/** Lens and measurements of the third person (plan v3 T5; V6 mockup `fixture.js` ZOOM_MIN, ZOOM_DEFAULT). */
export const THIRD_PERSON_VIEW = {
  /** Vertical FOV landscape and portrait (aspect < 1). */
  fovDeg: 50,
  portraitFovDeg: 74,
  /** Pivot height above the ground (m): the character's chest. */
  targetHeight: 1.4,
  /** Closest distance (t = 0) and the entry one (m); the same as the core's THIRD_PERSON (a test compares them). */
  minDistance: 2.5,
  defaultDistance: 6,
  /** Effective tilt at t = 1. */
  overviewPitchDeg: 82,
  /** At t = 1, the farthest corner of the map falls at this fraction of the screen edge (NDC). */
  fitNdc: 0.94,
  /** The whole-map distance is never less than this (small maps). */
  minFitDistance: 20,
  /** How far from the pivot it looks ahead (the gaze drops toward the horizon). */
  lookAhead: 30,
} as const;

const RAD = Math.PI / 180;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Vertical FOV (degrees) of the third person by the canvas aspect. */
export function thirdPersonFov(aspect: number): number {
  return aspect < 1 ? THIRD_PERSON_VIEW.portraitFovDeg : THIRD_PERSON_VIEW.fovDeg;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

type Vec3 = [number, number, number];

/** Offset from the pivot to the camera (yaw 0 = camera on the +z side, looking toward -z), like `cameraOffset` of rig.ts. */
function offset(pitchDeg: number, yawDeg: number, distance: number): Vec3 {
  const p = pitchDeg * RAD;
  const y = yawDeg * RAD;
  const flat = Math.cos(p) * distance;
  return [Math.sin(y) * flat, Math.sin(p) * distance, Math.cos(y) * flat];
}

/** Projection of a point to NDC for a camera at `eye` looking at `at` (no roll, up = +y). null if it is behind. */
export function projectNdc(eye: Vec3, at: Vec3, fovDeg: number, aspect: number, p: Vec3): [number, number] | null {
  const f: Vec3 = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  // right = f × up, up' = right × f
  const r: Vec3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[2]) || 1;
  r[0] /= rl; r[2] /= rl;
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (z <= 1e-6) return null;
  const th = Math.tan((fovDeg * RAD) / 2);
  const x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
  const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  return [x / (z * th * aspect), y / (z * th)];
}

/** Map center at the pivot height: where the pivot goes on the whole map. */
export function boundsCenter(b: Bounds, groundY = 0): Vec3 {
  return [(b.minX + b.maxX) / 2, groundY + THIRD_PERSON_VIEW.targetHeight, (b.minZ + b.maxZ) / 2];
}

/**
 * The whole-map distance for a yaw and an aspect (PD-5, AC26): the smallest at which, with the t = 1 pose
 * (tilt 82°, pivot at the center, looking at the pivot), the four corners of `bounds` (at height `groundY`)
 * fall inside `fitNdc` of the screen. Binary search over the real projection (the apparent size drops with
 * distance).
 */
export function fitDistance(yawDeg: number, aspect: number, bounds: Bounds, groundY = 0): number {
  const fov = thirdPersonFov(aspect);
  const at = boundsCenter(bounds, groundY);
  const corners: Vec3[] = [
    [bounds.minX, groundY, bounds.minZ], [bounds.maxX, groundY, bounds.minZ], [bounds.maxX, groundY, bounds.maxZ], [bounds.minX, groundY, bounds.maxZ],
  ];
  const fits = (d: number): boolean => {
    const o = offset(THIRD_PERSON_VIEW.overviewPitchDeg, yawDeg, d);
    const eye: Vec3 = [at[0] + o[0], at[1] + o[1], at[2] + o[2]];
    return corners.every((c) => {
      const p = projectNdc(eye, at, fov, aspect, c);
      return p !== null && Math.abs(p[0]) <= THIRD_PERSON_VIEW.fitNdc && Math.abs(p[1]) <= THIRD_PERSON_VIEW.fitNdc;
    });
  };
  let lo = 1;
  let hi = 8000;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return Math.max(THIRD_PERSON_VIEW.minFitDistance, hi);
}

/** Distance (m) at a t: log-linear from 2.5 m to `fit`. Same as the core's `zoomDistanceAt`. */
export function zoomDistanceAt(t: number, fit: number): number {
  const min = THIRD_PERSON_VIEW.minDistance;
  const f = Math.max(fit, min * 1.01);
  return min * Math.pow(f / min, clamp01(t));
}

/** t for a distance, inverse of `zoomDistanceAt`. Same as the core's `zoomTAt`. */
export function zoomTAt(distance: number, fit: number): number {
  const min = THIRD_PERSON_VIEW.minDistance;
  const lo = Math.log(min);
  const hi = Math.log(Math.max(fit, min * 1.01));
  return clamp01((Math.log(Math.max(distance, min)) - lo) / (hi - lo));
}

export interface ZoomPose {
  t: number;
  /** Camera distance to the pivot (m). */
  distance: number;
  /** Effective tilt (degrees): the player's at t = 0, 82 at t = 1. */
  pitchDeg: number;
  /** How far down it looks (degrees): up close toward the horizon (55 % of the tilt), from afar at the pivot. */
  lookPitchDeg: number;
  /** 0 = the pivot is the player, 1 = the map center. */
  pivotBlend: number;
  /** Camera clipping planes (m). */
  near: number;
  far: number;
  /** Opacity of the name labels and the whole-map beacons. */
  labelAlpha: number;
  beaconAlpha: number;
}

/**
 * The pose at a zoom t (PD-5, AC26). `fit` is `fitDistance` of the current yaw and aspect; `userPitchDeg` the
 * player's tilt.
 */
export function zoomPose(t: number, fit: number, userPitchDeg: number): ZoomPose {
  const tt = clamp01(t);
  const distance = zoomDistanceAt(tt, fit);
  const pitchDeg = lerp(userPitchDeg, THIRD_PERSON_VIEW.overviewPitchDeg, smoothstep(0.3, 1, tt));
  const lookPitchDeg = lerp(pitchDeg * 0.55, pitchDeg, smoothstep(0.3, 0.8, tt));
  return {
    t: tt,
    distance,
    pitchDeg,
    lookPitchDeg,
    pivotBlend: smoothstep(0.55, 1, tt),
    near: Math.min(4, Math.max(0.1, distance * 0.03)),
    far: farPlaneFor(tt),
    labelAlpha: 1 - smoothstep(0.3, 0.55, tt),
    beaconAlpha: smoothstep(0.4, 0.7, tt),
  };
}

/**
 * Exponential smoothing independent of framerate toward a target (1/s). With "reduce motion" (`cut`) it arrives in
 * the same frame (AC26: a `zoomOut` reaches its target in that frame).
 */
export function approach(current: number, target: number, dtSec: number, rate: number, cut: boolean): number {
  if (cut) return target;
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dtSec)));
}
