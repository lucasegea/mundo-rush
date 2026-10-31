// @lg/art density.ts: scene density per tier (plan estetica-c M6, 03 §2.7.1). No threshold lives here (the
// caps are TIER_BUDGETS in costs.ts, a copy of §2.7.1): this says HOW the scene is trimmed so that `low` fits in its
// 60 calls and 25k triangles. A single table, as pure data, read by world/ (builds the scene with it) and by the validate:content
// estimator (counts with it): what is estimated is still what is drawn in each tier.
// Manager decision for M6 (architecture review 2026-10-12, §9 question 3): the `low` budget rules; density is trimmed
// (detail instances, canopy spheres, terrain and skirt resolution, character LOD), never a threshold.
// Measured in test.yaml with everything in view (the farthest zoom, 160 m): `low` 29 calls and 22,302 triangles.
// M6 SEAM: if the operator changes thresholds after measuring (§9), TIER_BUDGETS and TIER_PARAMS change, not this table; a
// new diorama (dock, plaza) that does not fit in `low` is stopped by validate:content and trimmed here (or asked about).

/** The tiers with a 3D world (`dialog-only` draws nothing; `xr` is reserved, R12). */
export const WORLD_TIERS = ["low", "medium", "high"] as const;
export type WorldTier = (typeof WORLD_TIERS)[number];

/** Scene density: the full one from the bible or the reduced one of `low`. */
export const SCENE_DENSITIES = ["full", "reduced"] as const;
export type SceneDensity = (typeof SCENE_DENSITIES)[number];

/** Terrain mesh resolution (terrain.ts): fine step near and inside the bounds, and how it grows on the skirt. */
export interface TerrainLod {
  /** Vertex spacing near and inside the bounds (m). */
  fineStep: number;
  /** Maximum grid step near the diorama; beyond that, each cell is `farGrowth` times the previous one. */
  nearMaxStep: number;
  farGrowth: number;
}

export interface DensitySpec {
  /** Geometry of code props, trees and bodies: the full one or the reduced one (fewer segments, simplified body). */
  lod: SceneDensity;
  /** Of every N detail instances (flowers, tufts, pebbles) one remains; the cobblestones stay whole (they are the ground). */
  detailKeepEvery: number;
  /** Pines planted on the skirt, outside the bounds. */
  borderPines: number;
  terrain: TerrainLod;
  /**
   * "Draw distance / fog" from 03 §2.7.1 (short at `low`): fog scale. At `low` the fog arrives sooner and
   * covers the coarser skirt with fewer pines.
   */
  fogScale: number;
}

export const DENSITY: Readonly<Record<SceneDensity, DensitySpec>> = {
  full: { lod: "full", detailKeepEvery: 1, borderPines: 16, terrain: { fineStep: 0.5, nearMaxStep: 3, farGrowth: 4 }, fogScale: 1 },
  reduced: { lod: "reduced", detailKeepEvery: 3, borderPines: 6, terrain: { fineStep: 1, nearMaxStep: 3, farGrowth: 8 }, fogScale: 0.85 },
};

/** The density of each tier: `low` reduced, `medium` and `high` full (the bible's). */
export const TIER_DENSITY: Readonly<Record<WorldTier, SceneDensity>> = { low: "reduced", medium: "full", high: "full" };

/** How many detail instances remain out of `n` with that density (those whose index is a multiple of `detailKeepEvery`). */
export const keptDetail = (n: number, density: SceneDensity): number => Math.ceil(n / DENSITY[density].detailKeepEvery);

/** Filters a list of detail instances according to the density (the same rule that `keptDetail` counts). */
export const keepDetail = <T>(items: readonly T[], density: SceneDensity): T[] =>
  items.filter((_, i) => i % DENSITY[density].detailKeepEvery === 0);

// ---------------------------------------------------------------------------------------------------------------------
// Open-world-3d (D-819, D-821, D-822, PD-7): the open world's density per tier. It is the same single table as above
// for dioramas with relief (`terreno.relieve`): terrain step and its tiles, fog, clouds, ground normal maps
// and, for T7 and T8, the counts of trees, rocks, detail and grass. The starting numbers are those of the V6 mockup
// (`fixture.js` TIERS, measured at the starting pose); the trimming order if a cap does not fit is PD-7 (grass, far pines
// and detail, light tree radius, full tree radius, terrain step, medium's maxDpr). The
// dioramas without relief (farmer) continue with DENSITY above, unchanged.

/** LOD radii of the trees (m): full up to `full`, light up to `mid`, impostors beyond (mockup LOD_R). */
export interface TreeLodRadii {
  full: number;
  mid: number;
}

export interface OpenWorldDensity {
  /** Terrain mesh: interior step (m) and skirt growth (D-819, mockup 3.5 / 2.6 / 2.2 m). */
  terrain: TerrainLod;
  /** Terrain tiles (columns, rows), each with its own box: three discards the ones that are not visible. */
  terrainTiles: readonly [number, number];
  /** The tier's fog scale (the "draw distance"). */
  fogScale: number;
  /** Is there a cloud mesh? (not at `low`). */
  clouds: boolean;
  /** Does the ground use normal maps? (not at `low`; PD-4 steps 3 and 4 remove them from `medium` if memory does not fit). */
  groundNormals: boolean;
  /** V6 grass (T8): tufts in the disc that follows the camera, radius, real-blade radius, and blades per tuft. */
  grass: { clumps: number; radius: number; nearRadius: number; blades: number };
  /** Trees and detail (T7). */
  trees: { pines: number; farPines: number; broads: number; bushes: number; rocks: number; ferns: number; flowers: number; pebbles: number };
  treeLod: TreeLodRadii;
}

export const OPEN_WORLD_DENSITY: Readonly<Record<WorldTier, OpenWorldDensity>> = {
  low: {
    terrain: { fineStep: 3.5, nearMaxStep: 3.5, farGrowth: 8 },
    terrainTiles: [1, 1],
    fogScale: 0.85,
    clouds: false,
    groundNormals: false,
    grass: { clumps: 1000, radius: 15, nearRadius: 4.5, blades: 8 },
    trees: { pines: 16, farPines: 90, broads: 3, bushes: 0, rocks: 8, ferns: 0, flowers: 500, pebbles: 120 },
    treeLod: { full: 0, mid: 24 },
  },
  medium: {
    terrain: { fineStep: 2.6, nearMaxStep: 3, farGrowth: 6 },
    terrainTiles: [6, 5],
    fogScale: 1,
    clouds: true,
    groundNormals: true,
    grass: { clumps: 2300, radius: 24, nearRadius: 6, blades: 8 },
    trees: { pines: 58, farPines: 150, broads: 8, bushes: 22, rocks: 30, ferns: 300, flowers: 1100, pebbles: 260 },
    treeLod: { full: 16, mid: 38 },
  },
  high: {
    terrain: { fineStep: 2.2, nearMaxStep: 3, farGrowth: 4 },
    terrainTiles: [4, 3],
    fogScale: 1.15,
    clouds: true,
    groundNormals: true,
    grass: { clumps: 7000, radius: 34, nearRadius: 8, blades: 10 },
    trees: { pines: 88, farPines: 170, broads: 12, bushes: 40, rocks: 40, ferns: 600, flowers: 1600, pebbles: 360 },
    treeLod: { full: 24, mid: 58 },
  },
};

/** Triangles of a grass tuft: the card (2) and each real blade (3, two segments and the tip). */
export const GRASS_CARD_TRIANGLES = 2;
export const GRASS_BLADE_TRIANGLES = 3;

/**
 * Worst case of the grass (AC31): all the tufts with their card, plus those that fall within the real-blade radius (the
 * fraction of that disc's area over the square of side 2 × radius where the tufts live) with all their blades.
 */
export function grassWorstTriangles(g: OpenWorldDensity["grass"]): number {
  const near = Math.ceil((g.clumps * Math.PI * g.nearRadius ** 2) / (2 * g.radius) ** 2);
  return g.clumps * GRASS_CARD_TRIANGLES + near * g.blades * GRASS_BLADE_TRIANGLES;
}
