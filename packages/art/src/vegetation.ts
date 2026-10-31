// @lg/art vegetation.ts: trees, rocks and detail of the open world (open-world-3d T7, D2, PD-3, D-822), as pure data and
// without three. Three places read it and that is why it lives here, once:
//   · scripts/assets/bake-trees.ts bakes each TREE_SPECIES species (height, colors, tint seed from the V6 mockup)
//   · @lg/core prepareDiorama blocks the footprint of each trunk in the walk grid (AC46)
//   · world/nature builds the instanced meshes with the same positions, and chooses LOD band and card fade
// The planting is that of the V6 mockup (`world.js` spots): pines in forest patches and a far tree line, broadleaves
// near the path, shrubs at the path edge, rocks (outcrops on the hillside), flowers, ferns and pebbles, with
// their seeds (4242 and 5150) and their rules (away from the path, the NPCs and the spawn; no steep slopes).
// The slope is measured with `reliefAt` (T6's pure relief), not with the mesh: that way the core, which has no three, plants
// exactly the same as world/.

import { OPEN_WORLD_DENSITY, type OpenWorldDensity, type WorldTier } from "./density.ts";
import { reliefAt, type ReliefPad } from "./relief.ts";
import { RUNTIME_TEXTURE_PX, TEXTURES_DIR } from "./textures.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Baked species (V6 mockup world.js PINES, BROADS, BUSHES; presets in scripts/assets/tree-presets.ts).

export type TreeKind = "pine" | "broad" | "bush";

export interface TreeSpecies {
  /** Name of the preset (mockup) and of the served file (`pine-a.glb`, `pine-a-liviano.glb`). */
  name: string;
  file: string;
  kind: TreeKind;
  /** Height of the baked tree (m). */
  height: number;
  /** Leaf color at the bottom and top (sRGB hex) and per-leaf tint seed. */
  low: number;
  high: number;
  tintSeed: number;
}

export const TREE_LEAF_GAIN = 3.4;
export const TREE_BARK_COLOR = 0xcdbba4;

export const TREE_SPECIES: readonly TreeSpecies[] = [
  { name: "pineA", file: "pine-a", kind: "pine", height: 11.5, low: 0x1f5a45, high: 0x4f9a6a, tintSeed: 1 },
  { name: "pineB", file: "pine-b", kind: "pine", height: 13.5, low: 0x1b5440, high: 0x469468, tintSeed: 2 },
  { name: "pineC", file: "pine-c", kind: "pine", height: 8.5, low: 0x24604a, high: 0x58a070, tintSeed: 3 },
  { name: "oak", file: "oak", kind: "broad", height: 8.5, low: 0x4f8f35, high: 0xa4d05a, tintSeed: 11 },
  { name: "aspen", file: "aspen", kind: "broad", height: 10, low: 0x5c9a3a, high: 0xb6d85e, tintSeed: 12 },
  { name: "bushA", file: "bush-a", kind: "bush", height: 1.15, low: 0x4a8a35, high: 0x9ccb55, tintSeed: 21 },
  { name: "bushB", file: "bush-b", kind: "bush", height: 1.0, low: 0x558f38, high: 0xa8d25a, tintSeed: 22 },
];
/** Suffix of the light version's file (mockup `liteCfg`). */
export const LIGHT_TREE_SUFFIX = "-liviano";
/** Served folder of the baked trees (from the repo root and from the site root). */
export const TREES_DIR = "apps/web/public/models/generated/trees";
export const TREES_URL = "/models/generated/trees";
export const treeFile = (s: Pick<TreeSpecies, "file">, light: boolean): string => `${TREES_DIR}/${s.file}${light ? LIGHT_TREE_SUFFIX : ""}.glb`;
/** AC43: the light version has at most this fraction of the full one's triangles. */
export const LIGHT_TREE_MAX_SHARE = 0.35;

// ---------------------------------------------------------------------------------------------------------------------
// LOD (AC44): full up to `full`, light up to `mid`, impostors beyond; the handoff is a ±4 m dither.

export type TreeBand = "full" | "light" | "impostor";
/** Width of the dithered handoff on each side of the radius (m, the shader's `smoothstep(r - 4, r + 4)`). */
export const BAND_DITHER = 4;
/** CPU counting margin: an instance goes to every band that could draw it (mockup `M = 4.5`). */
export const BAND_MARGIN = 4.5;

/** The band of a tree at `distance` m from the player (the center of the handoff). */
export function treeBand(distance: number, tier: WorldTier): TreeBand {
  const r = OPEN_WORLD_DENSITY[tier].treeLod;
  if (distance < r.full) return "full";
  if (distance < r.mid) return "light";
  return "impostor";
}

/**
 * Open-world-3d T8 (mockup V6 `applyView`, AC51): with zoom the LOD radii shrink down to 0 (from t 0.3 to 0.72, and
 * at 0 from t 0.7): from afar every tree is an impostor, whose horizontal canopy at 58 % reads solid from above. T7 used
 * the tier's radii at every zoom and the real canopies seen from above failed AC51's solidity at t 0.65 to 0.8.
 */
export function treeLodShrink(t: number): number {
  if (t > 0.7) return 0;
  const x = Math.min(1, Math.max(0, (t - 0.3) / (0.72 - 0.3)));
  return 1 - x * x * (3 - 2 * x);
}

/** The shader bands (mockup `BAND`): [from, to] in meters, against uLod = (full, mid). */
export const SHADER_BANDS = ["near", "mid", "far", "nearMid", "midFar"] as const;
export type ShaderBand = (typeof SHADER_BANDS)[number];

/** The distance interval (with the margin) in which an instance enters the band. */
export function bandLimits(band: ShaderBand, full: number, mid: number): [number, number] {
  const M = BAND_MARGIN;
  switch (band) {
    case "near": return [-1, full + M];
    case "mid": return [full - M, mid + M];
    case "far": return [mid - M, Infinity];
    case "nearMid": return [-1, mid + M];
    case "midFar": return [full - M, Infinity];
  }
}

/** |cos| thresholds of the card fade (AC44): 0 up to `edge`, 1 from `face`. The shader reads them from here. */
export const CARD_FADE = { edge: 0.4, face: 0.6 } as const;
/** Fade of an impostor card according to |cos| between its normal and the view (AC44): 1 head-on, 0 edge-on. */
export function cardFade(cosAngle: number): number {
  const t = Math.min(1, Math.max(0, (Math.abs(cosAngle) - CARD_FADE.edge) / (CARD_FADE.face - CARD_FADE.edge)));
  return t * t * (3 - 2 * t);
}
/** The impostor's canopy card goes horizontal at this fraction of the tree's height (mockup `world.js:1365`). */
export const IMPOSTOR_CROWN_HEIGHT = 0.58;
/** Side of the impostor: side view on the left, canopy from above on the right (mockup 512 × 256). */
export const IMPOSTOR_PX = RUNTIME_TEXTURE_PX.impostor;

// ---------------------------------------------------------------------------------------------------------------------
// Rocks (Poly Haven, CC0): the pieces re-derived by scripts/assets/nature.ts. Each mesh of each scan is a
// variant; `outcrop` is the large outcrop.

export const ROCK_SCANS = [
  { scan: "rock_07", kind: "small", near: 900, far: 200, meshes: 1 },
  { scan: "rock_09", kind: "small", near: 900, far: 200, meshes: 1 },
  { scan: "rock_moss_set_01", kind: "small", near: 1800, far: 600, meshes: 6 },
  { scan: "rock_face_01", kind: "outcrop", near: 2200, far: 420, meshes: 1 },
] as const;
/** Open-world-3d T7b: `meshes` is how many meshes (variants) of each scan world/nature draws (formerly a literal there). */
export type RockScan = (typeof ROCK_SCANS)[number]["scan"];
export const ROCK_MODELS_DIR = "apps/web/public/models/polyhaven";
/** The .glb of a scan (scripts/assets/nature.ts): near or far. */
export const rockFile = (scan: RockScan, far: boolean): string => `${ROCK_MODELS_DIR}/${scan.replace(/_/g, "-")}${far ? "-lejos" : ""}.glb`;
/** The nature maps (scripts/assets/nature.ts): 2 × 2 atlas of rocks, leaf and bark. */
export const NATURE_TEXTURES = {
  rockDiff: `${TEXTURES_DIR}/rocas-diff.ktx2`,
  rockNor: `${TEXTURES_DIR}/rocas-nor.ktx2`,
  leaf: `${TEXTURES_DIR}/hoja-diff.ktx2`,
  bark: `${TEXTURES_DIR}/corteza-diff.ktx2`,
} as const;
/** Repo path → served URL (`apps/web/public/x` → `/x`). */
export const publicUrl = (file: string): string => file.slice("apps/web/public".length);
/**
 * Colors of the code-made detail (V6 mockup): ferns (bottom and top, like a tree's leaves), pebbles
 * (rock, warm rock and moss on top) and the four flowers of the canvas atlas (petal and center: daisy, buttercup,
 * lilac, poppy, with their petal count and radius in px). Numbers and not "#hex": the world palette is palette.ts.
 */
export const NATURE_COLORS = {
  fern: { low: 0x3f7a2e, high: 0x8cbf4a },
  pebble: { rock: 0x8c928a, warm: 0x9a8f80, moss: 0x6f9a45 },
  flowerStem: [0x4f8a2e, 0x3f7426],
  flowerLeaf: 0x5c9a34,
  flowers: [
    { petal: 0xf7f4ea, centre: 0xf2c531, petals: 5, radius: 3.2 },
    { petal: 0xf5cf2a, centre: 0xd98c12, petals: 5, radius: 2.6 },
    { petal: 0xb79be6, centre: 0xf1e2a0, petals: 4, radius: 2.8 },
    { petal: 0xe5532d, centre: 0x2b1d14, petals: 4, radius: 3.6 },
  ],
  /** Per-instance tint of the flowers (mockup FLOWER_TINT). */
  flowerTint: [[1, 1, 1], [1.05, 0.98, 0.92], [0.94, 1, 1.04], [1.08, 1.04, 0.96]],
} as const;

/** Small rocks vanish into the haze past this many meters (outcrops do not). */
export const SMALL_ROCK_MAX_DISTANCE = 70;

// ---------------------------------------------------------------------------------------------------------------------
// Planting (mockup V6 `spots`).

export interface VegetationSpot {
  x: number;
  z: number;
  /** Scale, rotation (rad) and variant (species or rock index, modulo what there is). */
  s: number;
  r: number;
  v: number;
  /** Pine of the far tree line (more than 55 m from the spawn). */
  distant?: boolean;
  /** Afloramiento (roca grande). */
  out?: boolean;
}

export interface VegetationInput {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Path control points (Catmull-Rom) and their width. */
  paths: readonly { points: readonly (readonly [number, number])[]; width: number }[];
  spawn: { x: number; z: number };
  /** The diorama's NPCs: the first one orients the spawn forest (mockup `startYaw`). */
  npcs: readonly { x: number; z: number }[];
  /** Relief seed and its flats (the slope is measured over `reliefAt`). */
  seed: number;
  pads: readonly ReliefPad[];
}

export interface VegetationScatter {
  pines: VegetationSpot[];
  broads: VegetationSpot[];
  bushes: VegetationSpot[];
  rocks: VegetationSpot[];
  flowers: VegetationSpot[];
  ferns: VegetationSpot[];
  pebbles: VegetationSpot[];
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** mulberry32 from the mockup (the same seeds give the same forest). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** hash2 from the mockup: a number in [0, 1) per integer cell and seed. */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Catmull-Rom from the mockup (`per` points per segment). */
export function catmull(points: readonly (readonly [number, number])[], per: number): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as readonly [number, number];
    const p1 = points[i] as readonly [number, number];
    const p2 = points[i + 1] as readonly [number, number];
    const p3 = points[Math.min(n - 1, i + 2)] as readonly [number, number];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (j: 0 | 1): number => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  if (n > 0) out.push([...(points[n - 1] as readonly [number, number])]);
  return out;
}

/** Distance to the nearest path (to its sampled center line). */
function pathDistance(polys: readonly [number, number][][], x: number, z: number): number {
  let best = 1e9;
  for (const poly of polys) {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, az] = poly[i] as [number, number];
      const [bx, bz] = poly[i + 1] as [number, number];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
  }
  return best;
}

/**
 * The complete planting of the open world (all lists in the mockup's order; each tier takes the first ones, see
 * `takeVegetation`). Pure and deterministic: the same diorama gives the same forest in the core and in world/.
 */
export function vegetationScatter(input: VegetationInput): VegetationScatter {
  // The core asks for it in every prepareDiorama and world/ when building the scene: the same diorama is planted only once.
  const key = JSON.stringify(input);
  const hit = SCATTER_CACHE.get(key);
  if (hit) return hit;
  const out = scatter(input);
  if (SCATTER_CACHE.size > 8) SCATTER_CACHE.clear();
  SCATTER_CACHE.set(key, out);
  return out;
}
const SCATTER_CACHE = new Map<string, VegetationScatter>();

function scatter(input: VegetationInput): VegetationScatter {
  const { spawn, npcs, seed, pads } = input;
  const polys = input.paths.map((p) => catmull(p.points, 8));
  const halfWidth = input.paths[0] ? input.paths[0].width / 2 : 1.6;
  const near = (x: number, z: number): number => pathDistance(polys, x, z);
  const padDist = (x: number, z: number): number => npcs.reduce((d, n) => Math.min(d, Math.hypot(x - n.x, z - n.z)), 1e9);
  const h = (x: number, z: number): number => reliefAt(x, z, seed, pads);
  const slope = (x: number, z: number): number => Math.abs(h(x + 1, z) - h(x - 1, z)) / 2 + Math.abs(h(x, z + 1) - h(x, z - 1)) / 2;
  const cx = (input.bounds.minX + input.bounds.maxX) / 2;
  const cz = (input.bounds.minZ + input.bounds.maxZ) / 2;
  // The mockup plants over a map centered on the origin with half width 70 × 50; here, relative to the bounds' center.
  const edge = (x: number, z: number): number => Math.max(Math.abs(x - cx) - 62, Math.abs(z - cz) - 44, 0);
  const first = npcs[0] ?? { x: spawn.x, z: spawn.z + 1 };
  const startYaw = Math.atan2(first.x - spawn.x, first.z - spawn.z);
  const fwd = [Math.sin(startYaw), Math.cos(startYaw)] as const;
  const right = [-Math.cos(startYaw), Math.sin(startYaw)] as const;
  const at = (f: number, l: number): [number, number] => [spawn.x + fwd[0] * f + right[0] * l, spawn.z + fwd[1] * f + right[1] * l];
  const okTree = (x: number, z: number): boolean => near(x, z) > 4.2 && padDist(x, z) > 6 && Math.hypot(x - spawn.x, z - spawn.z) > 7;

  const pines: VegetationSpot[] = [];
  const rocks: VegetationSpot[] = [];
  const broads: VegetationSpot[] = [];
  const bushes: VegetationSpot[] = [];
  const rnd = mulberry32(4242);
  const pineScale = (): number => 0.6 + 1.0 * Math.pow(rnd(), 1.5);
  const hero: [number, number][] = [[12, 9], [18, 13], [26, 10], [36, 16], [22, 20], [9, 16], [16, -12], [24, -17], [32, -11], [40, -19], [14, -22], [28, -26], [48, 6], [52, -8]];
  for (const [f, l] of hero) {
    let [x, z] = at(f, l);
    if (!okTree(x, z)) [x, z] = at(f, l + (l > 0 ? 5 : -5));
    if (okTree(x, z)) pines.push({ x, z, s: pineScale(), r: rnd() * 6.28, v: pines.length % 5 });
  }
  let tries = 0;
  while (pines.length < 130 && tries++ < 40000) {
    const x = cx + (rnd() * 2 - 1) * 128;
    const z = cz + (rnd() * 2 - 1) * 104;
    if (!okTree(x, z)) continue;
    const f = vnoise(x / 26 + 9, z / 26 + 4, 5);
    const dp = near(x, z);
    const e = edge(x, z);
    const prob = (0.03 + 0.9 * smooth(0.42, 0.7, f) + smooth(0, 14, e) * 0.5) * (0.25 + 0.75 * Math.exp(-((dp / 42) ** 2)));
    if (rnd() > prob) continue;
    if (slope(x, z) > 0.55) continue;
    pines.push({ x, z, s: pineScale(), r: rnd() * 6.28, v: pines.length % 5 });
  }
  const heroB: [number, number][] = [[20, 5.5], [30, -5.5], [44, 12], [8, -9]];
  for (const [f, l] of heroB) {
    const [x, z] = at(f, l);
    if (okTree(x, z)) broads.push({ x, z, s: 0.7 + rnd() * 0.8, r: rnd() * 6.28, v: broads.length % 3 });
  }
  tries = 0;
  while (broads.length < 24 && tries++ < 40000) {
    const x = cx + (rnd() * 2 - 1) * 100;
    const z = cz + (rnd() * 2 - 1) * 80;
    if (!okTree(x, z)) continue;
    const dp = near(x, z);
    if (rnd() > 0.25 + 0.75 * Math.exp(-((dp / 36) ** 2))) continue;
    if (vnoise(x / 26 + 9, z / 26 + 4, 5) > 0.55) continue;
    broads.push({ x, z, s: 0.7 + rnd() * 0.8, r: rnd() * 6.28, v: broads.length % 3 });
  }
  // Shrubs at the edge of the path and the tree line.
  const poly = polys[0] ?? [];
  for (let i = 3; i < poly.length - 3 && bushes.length < 80; i += 3) {
    const [ax, az] = poly[i] as [number, number];
    const [bx, bz] = poly[i + 1] as [number, number];
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const side = rnd() < 0.5 ? -1 : 1;
    const off = 2.7 + rnd() * 1.6;
    const x = ax + (-dz / l) * off * side;
    const z = az + (dx / l) * off * side;
    if (padDist(x, z) > 4 && rnd() < 0.8) bushes.push({ x, z, s: 0.6 + rnd() * 1.0, r: rnd() * 6.28, v: bushes.length % 2 });
  }
  tries = 0;
  while (bushes.length < 80 && tries++ < 20000) {
    const x = cx + (rnd() * 2 - 1) * 90;
    const z = cz + (rnd() * 2 - 1) * 70;
    if (near(x, z) < 3 || padDist(x, z) < 4.5) continue;
    if (rnd() > 0.2 + 0.8 * Math.exp(-((near(x, z) / 25) ** 2))) continue;
    bushes.push({ x, z, s: 0.6 + rnd() * 1.0, r: rnd() * 6.28, v: bushes.length % 2 });
  }
  // Rocks: outcrops on the right hillside first (as on the reference board), then planted ones.
  const heroRocks: [number, number, number][] = [[8, 8, 2.2], [11, 9.5, 1.4], [14, 13, 4.2], [20, 15.5, 3.4], [21, -9, 1.3], [30, 8.5, 1.8], [6, -8, 1.0], [44, -3, 1.6], [26, 17, 2.6], [34, -22, 3.6]];
  for (const [f, l, s] of heroRocks) {
    const [x, z] = at(f, l);
    const rr = hash2(Math.round(x), Math.round(z), 2) * 6.28;
    if (near(x, z) > 2.8) rocks.push(s >= 3.4 ? { x, z, s: s * 1.7, r: rr, v: 0, out: true } : { x, z, s, r: rr, v: rocks.length });
  }
  tries = 0;
  while (rocks.length < 70 && tries++ < 40000) {
    const x = cx + (rnd() * 2 - 1) * 120;
    const z = cz + (rnd() * 2 - 1) * 100;
    if (near(x, z) < 2.8 || padDist(x, z) < 4) continue;
    const dp = near(x, z);
    const e = edge(x, z);
    const prob = (0.06 + 0.5 * smooth(0, 12, e)) * (0.3 + 0.7 * Math.exp(-((dp / 30) ** 2)));
    if (rnd() > prob) continue;
    const s = 0.5 + rnd() * rnd() * 2.8;
    rocks.push(s > 2.3 && e > 10 ? { x, z, s: 3.5 + rnd() * 2.5, r: rnd() * 6.28, v: 0, out: true } : { x, z, s, r: rnd() * 6.28, v: rocks.length });
  }
  // Far tree line: extra pines only far from the spawn (impostors on the horizon).
  const basePines = pines.length;
  tries = 0;
  while (pines.length < basePines + 170 && tries++ < 60000) {
    const x = cx + (rnd() * 2 - 1) * 150;
    const z = cz + (rnd() * 2 - 1) * 126;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 55 || !okTree(x, z)) continue;
    const e = edge(x, z);
    if (rnd() > 0.12 + 0.5 * smooth(0.4, 0.68, vnoise(x / 26 + 9, z / 26 + 4, 5)) + 0.6 * smooth(0, 16, e)) continue;
    if (slope(x, z) > 0.6) continue;
    pines.push({ x, z, s: pineScale(), r: rnd() * 6.28, v: pines.length % 5, distant: true });
  }
  // Flowers in meadow patches, ferns near trees and rocks, pebbles at the path edge.
  const flowers: VegetationSpot[] = [];
  const ferns: VegetationSpot[] = [];
  const pebbles: VegetationSpot[] = [];
  const rndD = mulberry32(5150);
  tries = 0;
  while (flowers.length < 1600 && tries++ < 80000) {
    const x = cx + (rndD() * 2 - 1) * 70;
    const z = cz + (rndD() * 2 - 1) * 54;
    if (near(x, z) < halfWidth + 0.6 || padDist(x, z) < 4.2) continue;
    if (rndD() > smooth(0.45, 0.72, vnoise(x / 11 + 3, z / 11 + 8, 31)) * 0.9 + 0.04) continue;
    flowers.push({ x, z, s: 0.7 + rndD() * 0.7, r: rndD() * 6.28, v: 0 });
  }
  // 4 m cells with the pines and rocks (the same box test as the mockup, without walking the whole lists).
  const cells = (list: readonly VegetationSpot[]): Map<string, VegetationSpot[]> => {
    const m = new Map<string, VegetationSpot[]>();
    for (const t of list) {
      const k = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`;
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  };
  const nearAny = (m: Map<string, VegetationSpot[]>, x: number, z: number, r: number): boolean => {
    const i = Math.floor(x / 4);
    const j = Math.floor(z / 4);
    for (let a = i - 1; a <= i + 1; a++) {
      for (let b = j - 1; b <= j + 1; b++) {
        if ((m.get(`${a},${b}`) ?? []).some((t) => Math.abs(t.x - x) < r && Math.abs(t.z - z) < r)) return true;
      }
    }
    return false;
  };
  const pineCells = cells(pines);
  const rockCells = cells(rocks);
  tries = 0;
  while (ferns.length < 600 && tries++ < 80000) {
    const x = cx + (rndD() * 2 - 1) * 90;
    const z = cz + (rndD() * 2 - 1) * 72;
    if (near(x, z) < halfWidth + 1 || padDist(x, z) < 4.5) continue;
    const nearTree = nearAny(pineCells, x, z, 4) || nearAny(rockCells, x, z, 3.5);
    if (!nearTree && rndD() > 0.08) continue;
    ferns.push({ x, z, s: 0.8 + rndD() * 0.9, r: rndD() * 6.28, v: ferns.length % 2 });
  }
  for (let i = 2; i < poly.length - 2 && pebbles.length < 260; i++) {
    const [ax, az] = poly[i] as [number, number];
    const [bx, bz] = poly[i + 1] as [number, number];
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 2; k++) {
      const side = rndD() < 0.5 ? -1 : 1;
      const off = halfWidth * (0.6 + rndD() * 0.9);
      const t = rndD();
      pebbles.push({ x: ax + dx * t + (-dz / l) * off * side, z: az + dz * t + (dx / l) * off * side, s: 0.1 + rndD() * rndD() * 0.35, r: rndD() * 6.28, v: 0 });
    }
  }
  tries = 0;
  while (pebbles.length < 360 && tries++ < 20000) {
    const x = cx + (rndD() * 2 - 1) * 80;
    const z = cz + (rndD() * 2 - 1) * 64;
    if (padDist(x, z) < 3.5) continue;
    pebbles.push({ x, z, s: 0.12 + rndD() * rndD() * 0.4, r: rndD() * 6.28, v: 0 });
  }
  const shuffle = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rndD() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  };
  return { pines, broads, bushes, rocks, flowers: shuffle(flowers), ferns: shuffle(ferns), pebbles: shuffle(pebbles) };
}

/** Is the point inside the walkable bounds? (what is inside is the same in every tier: see `takeVegetation`). */
const inside = (b: VegetationInput["bounds"], s: VegetationSpot): boolean => s.x >= b.minX && s.x <= b.maxX && s.z >= b.minZ && s.z <= b.maxZ;

/**
 * What a tier draws (OPEN_WORLD_DENSITY.trees). Trees and rocks INSIDE the bounds are the same in every tier:
 * the core's walk grid has no tier and blocks their trunks (AC46), so a trunk that blocks is always
 * seen. The tier's count trims what is outside (the skirt, which the grid no longer walks): first what is inside, then what
 * is outside in planting order up to the count (if what is inside already exceeds it, nothing outside gets in).
 */
export function takeVegetation(
  scatter: VegetationScatter, bounds: VegetationInput["bounds"], tier: WorldTier,
  /** Open-world-3d T7b: the look's multipliers (<= 1, `WorldLook.vegetation.density`); without them, 1. */
  scale: Readonly<Partial<Record<keyof OpenWorldDensity["trees"], number>>> = {},
): VegetationScatter {
  const base = OPEN_WORLD_DENSITY[tier].trees;
  const t = Object.fromEntries(Object.entries(base).map(([k, n]) => [k, Math.floor(n * Math.min(1, scale[k as keyof typeof base] ?? 1))])) as typeof base;
  const keep = (list: readonly VegetationSpot[], n: number): VegetationSpot[] => {
    const inner = list.filter((s) => inside(bounds, s));
    const outer = list.filter((s) => !inside(bounds, s));
    return [...inner, ...outer.slice(0, Math.max(0, n - inner.length))];
  };
  const near = scatter.pines.filter((s) => !s.distant);
  const far = scatter.pines.filter((s) => s.distant);
  return {
    pines: [...keep(near, t.pines), ...keep(far, t.farPines)],
    broads: keep(scatter.broads, t.broads),
    bushes: scatter.bushes.slice(0, t.bushes),
    rocks: keep(scatter.rocks, t.rocks),
    flowers: scatter.flowers.slice(0, t.flowers),
    ferns: scatter.ferns.slice(0, t.ferns),
    pebbles: scatter.pebbles.slice(0, t.pebbles),
  };
}

/** Radius of a trunk's footprint (m per unit of scale) that blocks the grid (AC46). */
export const TRUNK_FOOTPRINT = { pine: 0.35, broad: 0.4 } as const;
/** Radius of the footprint of a rock that blocks (m per unit of scale; small stones do not block). */
export const ROCK_FOOTPRINT = 0.3;
export const ROCK_BLOCK_MIN_SCALE = 1.2;

/** The footprints that block the grid: pine and broadleaf trunks and large rocks, inside the bounds. */
export function blockingFootprints(scatter: VegetationScatter, bounds: VegetationInput["bounds"]): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const s of scatter.pines) if (inside(bounds, s)) out.push({ x: s.x, z: s.z, r: TRUNK_FOOTPRINT.pine * s.s });
  for (const s of scatter.broads) if (inside(bounds, s)) out.push({ x: s.x, z: s.z, r: TRUNK_FOOTPRINT.broad * s.s });
  for (const s of scatter.rocks) if (inside(bounds, s) && (s.out || s.s >= ROCK_BLOCK_MIN_SCALE)) out.push({ x: s.x, z: s.z, r: ROCK_FOOTPRINT * s.s * (s.out ? 1.6 : 1) });
  return out;
}
