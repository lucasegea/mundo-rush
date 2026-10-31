// @lg/art relief.ts: the open world's interior relief (open-world-3d T6, D-819), pure and without three. A single function
// `reliefAt(x, z, seed, pads)` read by world/terrain (the mesh) and the estimator: low-frequency noise between
// RELIEF.min and RELIEF.max meters, with a flat area around each "pad" (the player's spawn and each NPC): flat for
// the first `padFlat` m and a smooth blend over the next `padBlend`. Paths flatten their section (the center
// follows the relief and the width takes the center's height): that is done by buildTerrain, which has the sampled curves.
// Deterministic: the same seed gives the same relief. The core's walk grid stays flat and 2D (S-OW-3).
import { noise2 } from "./paint.ts";

export const RELIEF = {
  /** Relief heights (m): AC36 asks for the 2 to 8 m range inside the walkable bounds. */
  min: 2,
  max: 8,
  /** Flat area around each pad (m) and the blend that follows (D-819: 8 m flat and 8 m blend). */
  padFlat: 8,
  padBlend: 8,
} as const;

export interface ReliefPad {
  x: number;
  z: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * The raw relief (without pads), between RELIEF.min and RELIEF.max: wide hills of 46 m, a soft ridge of 34 m, waves of
 * 17 m and a 6.5 m jitter (the scales of the V6 mockup `reliefRaw` with other weights, without its edge ramp: outside
 * the bounds the hills are placed by buildTerrain).
 */
export function reliefRaw(x: number, z: number, seed: number): number {
  const broad = noise2(x / 46 + 3.1, z / 46 + 7.7, seed);
  const ridge = (1 - Math.abs(2 * noise2(x / 34 + 40, z / 34 + 13, seed + 5) - 1)) ** 3;
  const waves = noise2(x / 17, z / 17, seed + 1);
  const tremor = noise2(x / 6.5, z / 6.5, seed + 2);
  const c = (0.6 * broad + 0.25 * ridge + 0.1 * waves + 0.02 * tremor) / 0.97;
  // Value noise clusters in the middle: it is stretched around 0.5 to use almost the whole range without flattening the
  // extremes (with 1.25 the point slope stays under 24° in the tested seeds; AC36 measures it on the mesh).
  const k = clamp01((c - 0.5) * 1.25 + 0.5);
  return RELIEF.min + (RELIEF.max - RELIEF.min) * k;
}

/**
 * The relief with its pads (AC33): within `padFlat` m of a pad it is exactly the raw height at its center; between
 * `padFlat` and `padFlat + padBlend` it blends with smoothstep. If two pads touch, the nearer one rules.
 */
export function reliefAt(x: number, z: number, seed: number, pads: readonly ReliefPad[] = []): number {
  let h = reliefRaw(x, z, seed);
  let nearest = Infinity;
  let padH = 0;
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < nearest) {
      nearest = d;
      padH = reliefRaw(p.x, p.z, seed);
    }
  }
  if (nearest < RELIEF.padFlat + RELIEF.padBlend) h = padH + (h - padH) * smooth(RELIEF.padFlat, RELIEF.padFlat + RELIEF.padBlend, nearest);
  return h;
}
