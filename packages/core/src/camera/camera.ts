// Camera rules that do not depend on rendering (R11, D-053, D-197, D-207, D-208): preset ids, angles, zoom
// steps and the "up on screen" direction in the world. The camera itself lives in apps/web/src/world/camera/.

/**
 * R11 presets. Plan estetica-c M7 (D-207, architecture review 2026-10-12): the two HD-2D ortho ones (top-down and
 * isometric) are gone; `xrTabletop` stays declared for the future (E-XR) and is not implemented yet.
 * Open-world-3d T5 (PD-5, D-820): `thirdPerson` is the map camera (behind the character, continuous zoom up to the
 * whole map); `perspective3D` stays registered and a saved setting with it opens `thirdPerson` at t = 1.
 */
export const CAMERA_PRESET_IDS = ["thirdPerson", "dialogueFrame", "perspective3D", "xrTabletop"] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export interface CameraAngles {
  pitchDeg: number;
  yawDeg: number;
}

/** `perspective3D` (D-207, proposal C §4): long lens tilted 50° and rotated 45°. */
export const PERSPECTIVE_PITCH_DEG = 50;
export const PERSPECTIVE_YAW_DEG = 45;
/** Two-shot of the chat (proposal C §4): the camera drops to 20°; the framing decides the rotation. */
export const DIALOGUE_PITCH_DEG = 20;

/**
 * Preset angles. `dialogueFrame` gives its tilt with the map's rotation (the real rotation is computed by the
 * two-shot framing in world/camera/rig.ts). `xrTabletop` is only declared: until it exists (E-XR) it gives the
 * long-lens ones. M7 SEAM: xrTabletop defines its own angles when it is implemented.
 */
export function presetAngles(preset: CameraPresetId): CameraAngles {
  if (preset === "dialogueFrame") return { pitchDeg: DIALOGUE_PITCH_DEG, yawDeg: PERSPECTIVE_YAW_DEG };
  return { pitchDeg: PERSPECTIVE_PITCH_DEG, yawDeg: PERSPECTIVE_YAW_DEG };
}

/**
 * `perspective3D` zoom ladder (D-208, which extends the 3 steps of D-053/D-197): camera distance to the
 * player in meters, from the farthest step (0) to the closest. The number of steps comes from this array. Each step is
 * ~1.3x the next, so each wheel notch feels similar; 30 m is still the starting step.
 */
export const ZOOM_DISTANCES = [160, 120, 90, 65, 48, 38, 30, 22] as const;
export const ZOOM_STEPS = ZOOM_DISTANCES.length;
/** Index into ZOOM_DISTANCES: 0 = farthest, ZOOM_STEPS - 1 = closest. */
export type ZoomStep = number;
export const DEFAULT_ZOOM_STEP: ZoomStep = ZOOM_DISTANCES.indexOf(30);

/** A valid step: an integer within the ladder (anything that is not a number falls back to the starting one). */
export function clampZoomStep(step: number): ZoomStep {
  if (!Number.isFinite(step)) return DEFAULT_ZOOM_STEP;
  return Math.min(ZOOM_STEPS - 1, Math.max(0, Math.round(step)));
}

/** One step closer (+1) or farther (-1), clamped to the two ends of the ladder. */
export function stepZoom(current: ZoomStep, direction: 1 | -1): ZoomStep {
  return clampZoomStep(clampZoomStep(current) + direction);
}

/** Camera distance (m) to the player at a zoom step. */
export function zoomDistance(step: ZoomStep): number {
  return ZOOM_DISTANCES[clampZoomStep(step)] as number;
}

/**
 * Screen direction (x = right, y = up) carried onto the world's XZ plane according to the camera yaw.
 * With yaw 0 the camera looks toward -z: up on screen is -z and right is +x.
 */
export function screenDirToWorld(dir: { x: number; y: number }, yawDeg: number): { x: number; z: number } {
  const y = (yawDeg * Math.PI) / 180;
  const c = Math.cos(y);
  const s = Math.sin(y);
  const x = dir.x * c - dir.y * s;
  const z = -dir.x * s - dir.y * c;
  return { x: Math.abs(x) < 1e-12 ? 0 : x, z: Math.abs(z) < 1e-12 ? 0 : z };
}

// ---------- thirdPerson (open-world-3d T4/T5, D-820, PD-5) ----------

/**
 * Third-person camera numbers (mockup V6, `main.js`): player tilt 6 to 55° (17 on entry), continuous zoom
 * in logarithmic distance from 2.5 m to the whole map (6 m on entry), look by dragging (degrees per pixel) or with
 * Q and R (degrees per second), recentering at most 90°/s after 1.5 s without looking.
 */
export const THIRD_PERSON = {
  defaultPitchDeg: 17,
  minPitchDeg: 6,
  maxPitchDeg: 55,
  /** Closest distance (t = 0) and the entry one, in meters. */
  minDistance: 2.5,
  defaultDistance: 6,
  /** Effective tilt with the whole map (t = 1). */
  overviewPitchDeg: 82,
  /** Drag: degrees of turn and tilt per pixel (right turns right, down raises the camera). */
  yawDegPerPx: 0.25,
  pitchDegPerPx: 0.18,
  /** Q and R held. */
  keyLookDegPerS: 95,
  /** Fraction of the logarithmic zoom range per key, button or wheel notch. */
  zoomStep: 0.07,
  /** With t below this, V goes to the whole map; otherwise it returns to the previous distance. */
  overviewToggleT: 0.9,
  /** Recentering: seconds without looking, degrees per second and maximum t at which it acts. */
  recenterIdleS: 1.5,
  recenterDegPerS: 90,
  recenterMaxT: 0.4,
} as const;

/** Yaw in [0, 360). */
export function normalizeYaw(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const y = deg % 360;
  return y < 0 ? y + 360 : y === 360 ? 0 : y;
}

/** Player tilt clamped to [6, 55]. */
export function clampPitch(deg: number): number {
  if (!Number.isFinite(deg)) return THIRD_PERSON.defaultPitchDeg;
  return Math.min(THIRD_PERSON.maxPitchDeg, Math.max(THIRD_PERSON.minPitchDeg, deg));
}

/** Drag or Q/R in pixels → new yaw and tilt (yaw normalized, tilt clamped). */
export function applyLook(yawDeg: number, pitchDeg: number, dx: number, dy: number): { yawDeg: number; pitchDeg: number } {
  return {
    yawDeg: normalizeYaw(yawDeg - (Number.isFinite(dx) ? dx : 0) * THIRD_PERSON.yawDegPerPx),
    pitchDeg: clampPitch(pitchDeg + (Number.isFinite(dy) ? dy : 0) * THIRD_PERSON.pitchDegPerPx),
  };
}

/** Look pixels per simulation step with Q or R held (95°/s at 30 Hz). */
export const KEY_LOOK_PX_PER_STEP = THIRD_PERSON.keyLookDegPerS / THIRD_PERSON.yawDegPerPx / 30;

/**
 * Zoom t in [0, 1] for a distance: log-linear from 2.5 m (t = 0) to `fit` (t = 1, the whole map). The same rule
 * lives in world/camera/zoom.ts (world/ does not import the core at runtime); a test compares the two.
 */
export function zoomTAt(distance: number, fit: number): number {
  const lo = Math.log(THIRD_PERSON.minDistance);
  const hi = Math.log(Math.max(fit, THIRD_PERSON.minDistance * 1.01));
  return Math.min(1, Math.max(0, (Math.log(Math.max(distance, THIRD_PERSON.minDistance)) - lo) / (hi - lo)));
}

/** Distance (m) at a zoom t, inverse of `zoomTAt`. */
export function zoomDistanceAt(t: number, fit: number): number {
  const f = Math.max(fit, THIRD_PERSON.minDistance * 1.01);
  return THIRD_PERSON.minDistance * Math.pow(f / THIRD_PERSON.minDistance, Math.min(1, Math.max(0, t)));
}

/** One zoom step: +1 zooms in, -1 zooms out, `zoomStep` of the logarithmic range, clamped to [2.5 m, fit]. */
export function stepZoomDistance(distance: number, fit: number, direction: 1 | -1): number {
  const t = zoomTAt(distance, fit) - direction * THIRD_PERSON.zoomStep;
  return zoomDistanceAt(t, fit);
}

/** Shortest angle difference (degrees), in (-180, 180]. */
export function yawDelta(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Camera yaw that puts `velocity` forward (up on screen): inverse of `screenDirToWorld({0, 1}, yaw)`. */
export function headingYaw(vx: number, vz: number): number {
  return normalizeYaw((Math.atan2(-vx, -vz) * 180) / Math.PI);
}

export interface RecenterInput {
  yawDeg: number;
  /** Yaw that would put the direction of travel forward (`headingYaw`). */
  headingDeg: number;
  /** Seconds since the last look (drag, Q or R). */
  sinceLookS: number;
  dt: number;
  /** Walks forward or toward a chosen point (a lateral shift does not recenter). */
  forward: boolean;
  reduceMotion: boolean;
  /** Zoom t: when far away (t > 0.4) it does not recenter. */
  t?: number;
}

/**
 * Camera recentering behind the character (D-820): only when walking forward or toward a click, from 1.5 s
 * after the last look, at most 90°/s. With "reduce motion" there is no recentering (the camera does not move by itself).
 */
export function recenterYaw(r: RecenterInput): number {
  if (r.reduceMotion || !r.forward || r.sinceLookS < THIRD_PERSON.recenterIdleS || (r.t ?? 0) > THIRD_PERSON.recenterMaxT) return r.yawDeg;
  const max = THIRD_PERSON.recenterDegPerS * Math.max(0, r.dt);
  const d = yawDelta(r.yawDeg, r.headingDeg);
  return normalizeYaw(r.yawDeg + Math.min(max, Math.max(-max, d)));
}
