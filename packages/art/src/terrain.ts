// @lg/art terrain.ts: the shape of the terrain mesh (plan estetica-c M1 item 8 and M5), as pure data and geometry. The
// grid lines come from here so that world/terrain/ (which builds the mesh) and the validate:content budget estimator
// (which counts its triangles without three) use the same count: what is estimated is what is drawn. Moved from
// world/terrain/buildTerrain.ts in M5 without changing values. Plan estetica-c M6: resolution depends on the tier's
// density (density.ts); the full one is the usual one.
import { DENSITY, type SceneDensity, type TerrainLod } from "./density.ts";

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Meters of terrain beyond the walkable bounds, on each side. Since D-208 the skirt reaches 160 m to cover the
 * farthest zoom (160 m) at any aspect ratio (A2). It is also the minimum of a diorama's `terreno.extension`: less
 * would let the edge of the world show.
 */
export const TERRAIN_SKIRT = 160;
/**
 * Open-world-3d M3 (AC35, D-837): the open world's apron. With the
 * whole map (t = 1) and a wide or tall aspect ratio (2:1, 19.5:9, 21:9, 9:19.5, 9:20) at a diagonal yaw, the corners of the
 * screen saw up to 27 m beyond the 160 m skirt: a hard edge against the background. The apron is a flat ring
 * of `width` m around the extent (8 triangles, one call, the same `terreno` material), `sink` m below the
 * mesh's lowest vertex and tucked `overlap` m under the skirt; the skirt fades to the fog color in its
 * last meters (`fade`: from `fade[0]` to `fade[1]` m before the edge of the extent) and the apron is all fog
 * color, same as the background: no visible seam is left anywhere. The validate:content estimator counts it
 * (`drawCalls`, `triangles`) inside the `terreno` part.
 */
export const TERRAIN_APRON = { width: 120, sink: 0.5, overlap: 2, fade: [44, 4], drawCalls: 1, triangles: 8 } as const;
/** Maximum height of the edge hills (proposal C §2) and cap of `terreno.lomas`. */
export const HILL_MAX = 5.5;
export const HILL_LIMIT = 12;
export const TERRAIN_SEED = 11;
/** Vertex spacing near and inside the bounds at full density (half a meter). */
export const FINE_STEP = DENSITY.full.terrain.fineStep;
export const FINE_MARGIN = 0.5;

/**
 * Grid lines: fine (`fineStep`) between fineMin and fineMax, and increasingly coarse toward min and max (from 2 to
 * `nearMaxStep` m one meter at a time, and then geometric by `farGrowth`; at full density: 2, 3, 12, 48 and the edge).
 * Plan estetica-c M3: the far skirt dropped in resolution so that skeletal characters fit in `medium`; the near part
 * (fine 0.5 m step) did not change. Plan estetica-c M6: `low` uses a 1 m fine step and a coarser skirt.
 */
export function terrainGridLines(min: number, max: number, fineMin: number, fineMax: number, lod: TerrainLod = DENSITY.full.terrain): Float64Array {
  const fine: number[] = [];
  const snap = 1 / lod.fineStep;
  for (let v = fineMin; v <= fineMax + 1e-9; v += lod.fineStep) fine.push(Math.round(v * snap) / snap);
  const grow = (from: number, to: number, dir: 1 | -1): number[] => {
    const out: number[] = [];
    let v = from;
    let step = 2;
    while (dir > 0 ? v < to - 1e-9 : v > to + 1e-9) {
      v = dir > 0 ? Math.min(to, v + step) : Math.max(to, v - step);
      out.push(v);
      step = step < lod.nearMaxStep ? step + 1 : step * lod.farGrowth;
    }
    return out;
  };
  const left = grow(fine[0] as number, min, -1).reverse();
  const right = grow(fine[fine.length - 1] as number, max, 1);
  return Float64Array.from([...left, ...fine, ...right]);
}

/** Terrain extent: the bounds plus the skirt on each side. */
export const terrainExtent = (b: TerrainBounds, skirt = TERRAIN_SKIRT): TerrainBounds =>
  ({ minX: b.minX - skirt, maxX: b.maxX + skirt, minZ: b.minZ - skirt, maxZ: b.maxZ + skirt });

/** The x and z lines of a diorama's terrain mesh, with the resolution of the given density. */
export function terrainLines(b: TerrainBounds, skirt = TERRAIN_SKIRT, density: SceneDensity | TerrainLod = "full"): { xs: Float64Array; zs: Float64Array } {
  const e = terrainExtent(b, skirt);
  // Open-world-3d T6 (D-819): the open world passes its tier's step (OPEN_WORLD_DENSITY) instead of a density.
  const lod = typeof density === "string" ? DENSITY[density].terrain : density;
  return {
    xs: terrainGridLines(e.minX, e.maxX, Math.floor(b.minX - FINE_MARGIN), Math.ceil(b.maxX + FINE_MARGIN), lod),
    zs: terrainGridLines(e.minZ, e.maxZ, Math.floor(b.minZ - FINE_MARGIN), Math.ceil(b.maxZ + FINE_MARGIN), lod),
  };
}

/** Triangles of the terrain mesh (two per cell). */
export function terrainTriangles(b: TerrainBounds, skirt = TERRAIN_SKIRT, density: SceneDensity | TerrainLod = "full"): number {
  const { xs, zs } = terrainLines(b, skirt, density);
  return 2 * (xs.length - 1) * (zs.length - 1);
}

/**
 * Terrain color roles that a diorama can change in its `paleta` (plan estetica-c M5): each role takes by
 * default the token of its same name; a zone can give it another token (for example, a drier grass at the Cruce).
 */
export const TERRAIN_PALETTE_ROLES = ["pasto", "pasto-luz", "pasto-sombra", "camino", "tierra-borde", "orilla", "agua-honda", "piedra"] as const;
export type TerrainPaletteRole = (typeof TERRAIN_PALETTE_ROLES)[number];

/** Cobblestones per square meter of cobbled path (the same two per tile as M3). */
export const PAVING_STONES_PER_M2 = 2;

/**
 * Stones of a cobbled path: the length of its control polyline times its width times the density. It is counted over the
 * control points (not over the sampled curve) so that the validate:content estimator, which does not sample curves,
 * gives the same number as world/terrain/.
 */
export function pavingStoneCount(points: readonly (readonly [number, number])[], width: number): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as readonly [number, number];
    const b = points[i] as readonly [number, number];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return Math.round(len * width * PAVING_STONES_PER_M2);
}
