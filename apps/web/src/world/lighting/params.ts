// world/lighting/params.ts — the sun shadow and its geometry (plan estetica-c M1 item 12, D-208), as pure data to
// test them without GPU. Open-world-3d T7b (D-838, D-839): the light, fog, background and tone values from proposal C §5
// (SUN, HEMI, FOG, TONE, BACKGROUND) moved to the look (`WorldLook.light`, `fog`, `background` from @lg/art) and Lighting.tsx and
// GameCanvas read them from the diorama look; the distance `fogFor` from D-208 (uncalled since T5) was merged into the one in
// world/sky. What remains here is the core: the shadow box per tier and the sun direction.

/** Directional shadow of the high tier (03 §2.7.1): 1024 map in a 44 × 44 m box that follows the target. */
export const SUN_SHADOW = { mapSize: 1024, half: 22, near: 1, far: 90, bias: -0.0004, normalBias: 0.03, distance: 40 } as const;

/**
 * Shadow box for a camera distance (D-208): the 44 × 44 m one up to the reference and, farther, the box, the
 * distance from the sun to the target and the planes scale together, so the shadow covers what is seen and the depth suffices.
 */
export function sunShadowFor(scale: number): { half: number; distance: number; near: number; far: number } {
  const k = Math.max(1, scale);
  return { half: SUN_SHADOW.half * k, distance: SUN_SHADOW.distance * k, near: SUN_SHADOW.near, far: SUN_SHADOW.far * k };
}

/** Unit direction toward the sun (elevation above the horizon, azimuth around +y from +z toward +x), from the look. */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
