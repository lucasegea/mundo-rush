// world/sky/palette.ts: the fog that follows the zoom (open-world-3d T5/T6, AC40) and the camera far plane. Since
// T7b (D-838, D-839) the sky and fog colors and the fog range belong to the look (`WorldLook.sky` and
// `WorldLook.fog` from @lg/art); here only the calculation remains, one for every diorama (the distance `fogFor` from
// lighting/params.ts, D-208's that nobody called since T5, was merged into this one).
import type { FogRange } from "@lg/art";

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Camera far plane of the continuous zoom at t = 0 and t = 1 (world/camera/zoom.ts uses it). Core, not look. */
export const FAR_RANGE = [700, 2200] as const;

/**
 * Fog of the look range for the tier scale (density `fogScale`: 0.85 / 1 / 1.15 in the open world) and
 * the zoom t (AC40): grows with smoothstep(0.3, 0.95, t) from `near` to `far` of the range, all scaled by the tier, so
 * `low` has the shortest fog at every t. With DEFAULT_LOOK, from 45-250 m to 520-1,500 m; the far one (1,725 m on
 * `high`) never passes the far plane (2,200 m): a test requires it for each look in the catalog.
 */
export function fogFor(range: FogRange, scale: number, t: number): { near: number; far: number } {
  const sT = smooth(0.3, 0.95, clamp01(t));
  return { near: lerp(range.near[0], range.near[1], sT) * scale, far: lerp(range.far[0], range.far[1], sT) * scale };
}

/** Far plane (m) for a zoom t. */
export function farPlaneFor(t: number): number {
  return Math.round(lerp(FAR_RANGE[0], FAR_RANGE[1], smooth(0.3, 0.95, clamp01(t))));
}
