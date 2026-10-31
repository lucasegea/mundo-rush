// world/terrain/buildTerrain.ts: terrain by heights from proposal C (plan estetica-c M1 item 8 and M5), pure and without
// three: a continuous height mesh (a single indexed grid: no duplicate vertices) with vertex color. It reads
// the ground of the diorama format (M5) behind `GroundSource`: paths and rivers by curves (polylines the core
// sampled), water by polygons. The terrain flattens under paths (also between the outer hills), sinks under
// the water and has a shore; the path is painted `camino` (or stone if paved) with a noisy `tierra-borde` edge.
// Plan estetica-c M7 (D-207): the M1 tiles adapter was removed along with the schema `tiles` layers.
// Inside the walkable bounds the ground is flat at y = 0 (the ground raycast is still the invisible plane);
// outside it rises in hills of up to `lomas` m, far enough that no game camera sees the edge (A2).
// The grid lines come from @lg/art (the same count the validate:content estimator uses). Deterministic
// with the same seed.
// Open-world-3d T6 (D-819): a diorama with `terreno.relieve` has interior relief (`reliefAt` from @lg/art, with flats
// at the spawn and at each NPC), paths flatten their section (the center follows the relief, the width takes its height),
// the mesh step is the tier one (OPEN_WORLD_DENSITY) and each vertex carries its dirt weight (`dirt`: paths and
// flats, with D-819 soft rule) for the ground shader. `heightAt` interpolates over the mesh triangles
// (not bilinear, which stays for dioramas without relief): what is drawn is what is measured (actors, props,
// camera, grass and the ground raycast).
// Open-world-3d T7b (D-839): colors come from the look palette (`spec.look`): the terrain roles take their token
// of the same name (or the look path one) and each diorama `paleta` re-points them WITHIN that palette.
import type { Bounds, DioramaGround, WalkGrid } from "@lg/core";
import {
  DENSITY, FINE_STEP as ART_FINE_STEP, HILL_MAX as ART_HILL_MAX, insidePolygon, noise2, OPEN_WORLD_DENSITY, pavingStoneCount,
  polygonEdgeDistance, polylineDistance, polylineNearest, reliefAt, TERRAIN_SEED as ART_TERRAIN_SEED,
  TERRAIN_SKIRT as ART_TERRAIN_SKIRT, terrainExtent, terrainLines, hexToLinear, type PaletteToken, type ReliefPad, type Rgb,
  type SceneDensity, type TerrainLod, type TerrainPaletteRole, type WorldLook, type WorldTier,
} from "@lg/art";
import { mixRgb, scaleRgb } from "./color";
import { rng } from "../materials/rng";

/** Meters of terrain beyond the walkable bounds, on each side (D-208; see @lg/art terrain.ts). */
export const TERRAIN_SKIRT = ART_TERRAIN_SKIRT;
/** Vertex spacing near and inside the bounds (half of a 1 m cell). */
export const FINE_STEP = ART_FINE_STEP;
export const HILL_MAX = ART_HILL_MAX;
export const TERRAIN_SEED = ART_TERRAIN_SEED;
/**
 * The brush texture repeats over the terrain UVs: its scale in meters is fixed with the M1 skirt (48 m), so
 * lengthening the skirt does not enlarge the brushstroke.
 */
const BRUSH_UV_SKIRT = 48;
const HILL_RAMP = 16;

export interface TerrainSpec {
  bounds: Bounds;
  /** The ground of the diorama format (plan estetica-c M5). */
  ground: DioramaGround;
  seed?: number;
  /** Plan estetica-c M6: mesh resolution per tier (the reduced one of `low`: fine 1 m step and coarser skirt). */
  density?: SceneDensity;
  /** Open-world-3d T6: the open-world tier (terrain step of OPEN_WORLD_DENSITY if the ground has relief). */
  tier?: WorldTier;
  /** Open-world-3d T7b: the diorama look (its palette, its path and the open-world ground colors). */
  look: Pick<WorldLook, "palette" | "road" | "ground">;
}

export interface Terrain {
  /** Grid lines in x and in z (increasing). */
  xs: Float64Array;
  zs: Float64Array;
  /** x, y, z interleaved; vertex (i, j) = j * xs.length + i. */
  positions: Float32Array;
  /** r, g, b linear interleaved. */
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  extent: Bounds;
  /** Open-world-3d T6: dirt weight per vertex (0 grass, 1 path or flat; D-819 soft rule). */
  dirt: Float32Array;
  /** Interior relief? (the open-world ground shader uses it; without relief, the farmer ground). */
  relief: boolean;
  /** The fine mesh step (m). */
  step: number;
  /** Terrain height: with relief, over the mesh triangles (open-world-3d T6); without relief, bilinear. */
  heightAt(x: number, z: number): number;
  /** Dirt weight interpolated the same as the height (the G channel of the grass texture, PD-2). */
  dirtAt(x: number, z: number): number;
  /** Index of the vertex exactly at (x, z), or -1. */
  vertexAt(x: number, z: number): number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to the bounds (0 inside). */
export function outsideDistance(b: Bounds, x: number, z: number): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Index of the cell [lines[k], lines[k+1]] that contains v (clamped). */
function lineCell(lines: Float64Array, v: number): number {
  let lo = 0;
  let hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((lines[mid] as number) <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** What the terrain asks of the ground. */
export interface GroundSource {
  /** Surface at (x, z): path, paved or grass. */
  surface(x: number, z: number): "camino" | "empedrado" | "pasto";
  /** Water at (x, z)? */
  isWater(x: number, z: number): boolean;
  /** For a point in the water: distance to the shore (m, clamped to 1.5). */
  shoreDistance(x: number, z: number): number;
  /** Distance to the nearest path edge (0 on top; Infinity far away), up to `maxR`. */
  roadDistance(x: number, z: number, maxR: number): number;
  /** Distance to the water (0 on top; Infinity far away), up to `maxR`. */
  waterDistance(x: number, z: number, maxR: number): number;
  /** Outside the bounds: how much the hills flatten here (0 none, 1 fully), by a path or a river. */
  flatten(x: number, z: number): number;
}

/** The ground of the diorama format (plan estetica-c M5): sampled curves and polygons. */
export function curveGround(g: DioramaGround): GroundSource {
  const roads = g.paths.filter((p) => p.surface === "camino");
  const waterDepth = (x: number, z: number): number => {
    // >0 inside the water: distance to the shore; 0 outside.
    let best = 0;
    for (const poly of g.ponds) if (insidePolygon(x, z, poly)) best = Math.max(best, polygonEdgeDistance(x, z, poly));
    for (const r of g.rivers) best = Math.max(best, r.width / 2 - polylineDistance(x, z, r.line));
    return best;
  };
  return {
    surface: (x, z) => {
      for (const p of g.paths) if (polylineDistance(x, z, p.line) < p.width / 2) return p.surface;
      return "pasto";
    },
    isWater: (x, z) => waterDepth(x, z) > 0,
    shoreDistance: (x, z) => Math.min(1.5, waterDepth(x, z)),
    roadDistance: (x, z, maxR) => {
      let best = Infinity;
      for (const p of roads) best = Math.min(best, Math.max(0, polylineDistance(x, z, p.line) - p.width / 2));
      return best <= maxR ? best : Infinity;
    },
    waterDistance: (x, z, maxR) => {
      let best = Infinity;
      for (const poly of g.ponds) best = Math.min(best, insidePolygon(x, z, poly) ? 0 : polygonEdgeDistance(x, z, poly));
      for (const r of g.rivers) best = Math.min(best, Math.max(0, polylineDistance(x, z, r.line) - r.width / 2));
      return best <= maxR ? best : Infinity;
    },
    flatten: (x, z) => {
      let f = 0;
      for (const p of [...g.paths, ...g.rivers]) f = Math.max(f, 1 - smooth(p.width / 2, p.width / 2 + 2.5, polylineDistance(x, z, p.line)));
      return f;
    },
  };
}

export interface TerrainShape {
  bounds: Bounds;
  hillMax: number;
  seed: number;
  /** Open-world-3d T6: interior relief with these flats; null = flat ground inside (farmer). */
  pads: readonly ReliefPad[] | null;
  /** Paths (sampled curves) that flatten their section. */
  roads: readonly { width: number; line: readonly { x: number; z: number }[] }[];
}

/** Over the path width plus this margin the section is flat; up to `+ ROAD_BANK` it blends with the relief. */
const ROAD_FLAT = 0.8;
const ROAD_BANK = 6;

/**
 * Relief with the paths flattened (open-world-3d T6, D-819): near a path the ground takes the relief height at
 * the nearest point of its center (the section stays flat) and blends with the relief on the slope.
 */
function reliefHeight(shape: TerrainShape, x: number, z: number): number {
  const pads = shape.pads ?? [];
  const base = reliefAt(x, z, shape.seed, pads);
  let best: { x: number; z: number; d: number; hw: number } | null = null;
  for (const r of shape.roads) {
    const q = polylineNearest(x, z, r.line);
    if (q && q.d - r.width / 2 < (best ? best.d - best.hw : Infinity)) best = { ...q, hw: r.width / 2 };
  }
  if (!best || best.d >= best.hw + ROAD_BANK) return base;
  const t = smooth(best.hw + ROAD_FLAT, best.hw + ROAD_BANK, best.d);
  return reliefAt(best.x, best.z, shape.seed, pads) + (base - reliefAt(best.x, best.z, shape.seed, pads)) * t;
}

/** Water: only a vertex strictly inside sinks (all four quadrants are water). */
function waterSink(src: GroundSource, x: number, z: number): number | null {
  const e = 1e-3;
  const water = [[-e, -e], [e, -e], [-e, e], [e, e]].every(([dx, dz]) => src.isWater(x + (dx as number), z + (dz as number)));
  if (!water) return null;
  return -(0.3 + 0.6 * smooth(0, 1.5, src.shoreDistance(x, z)));
}

function groundHeight(shape: TerrainShape, src: GroundSource, x: number, z: number): number {
  const out = outsideDistance(shape.bounds, x, z);
  const sink = waterSink(src, x, z);
  if (shape.pads) {
    // Relief (open-world-3d T6): the water sinks from the relief; outside, the hills rise over it.
    const r = reliefHeight(shape, x, z);
    const hill = out > 0
      ? smooth(0, HILL_RAMP, out) * Math.max(0, shape.hillMax - 0.25) * (0.55 + 0.45 * noise2(x * 0.05 + 9, z * 0.05, shape.seed)) * (1 - src.flatten(x, z))
      : 0;
    return r + hill + (sink ?? 0);
  }
  if (out > 0) {
    // Hills: rise smoothly from the edge of the bounds, with height variation by noise; a path or a river
    // flattens them (the path comes out of the valley between the hills).
    const hill = smooth(0, HILL_RAMP, out) * Math.max(0, shape.hillMax - 0.25) * (0.55 + 0.45 * noise2(x * 0.05 + 9, z * 0.05, shape.seed));
    const wobble = (noise2(x * 0.21 + 5, z * 0.21, shape.seed) - 0.5) * 0.5 * smooth(0, 4, out);
    const h = Math.min(shape.hillMax, hill + wobble) * (1 - src.flatten(x, z));
    return sink === null ? h : Math.min(h, sink);
  }
  return sink ?? 0;
}

type Palette = Record<"pasto" | "luz" | "sombra" | "camino" | "borde" | "orilla" | "honda" | "piedra", Rgb>;

type TerrainLook = TerrainSpec["look"];

/** A token (or a loose hex from the diorama `paleta`) in linear, in the look palette. */
const lookRgb = (look: TerrainLook, v: string): Rgb => hexToLinear(v.startsWith("#") ? v : look.palette[v as PaletteToken]);

function palette(look: TerrainLook, overrides: Readonly<Record<string, string>> = {}): Palette {
  const tone = (role: TerrainPaletteRole, token: PaletteToken = role): Rgb => lookRgb(look, overrides[role] ?? token);
  return {
    pasto: tone("pasto"), luz: tone("pasto-luz"), sombra: tone("pasto-sombra"), camino: tone("camino", look.road.surface),
    borde: tone("tierra-borde", look.road.border), orilla: tone("orilla"), honda: tone("agua-honda"), piedra: tone("piedra", look.road.paving),
  };
}

function groundColor(p: Palette, shape: TerrainShape, src: GroundSource, x: number, z: number, h: number): Rgb {
  const seed = shape.seed;
  const n1 = noise2(x * 0.15, z * 0.15, seed);
  const n2 = noise2(x * 0.6 + 3, z * 0.6, seed);
  let c = mixRgb(mixRgb(p.pasto, p.luz, smooth(0.45, 0.8, n1) * 0.8), p.sombra, smooth(0.55, 0.9, n2) * 0.25);
  const outside = outsideDistance(shape.bounds, x, z) > 0;
  // Outside, the hills can end up just below 0 without being water: there only a river paints water.
  if (h < 0 && (!outside || src.isWater(x, z))) return mixRgb(p.orilla, p.honda, smooth(-0.3, -0.9, h));
  // Noisy query offset: the edges between surfaces are hand-painted, not in steps.
  const jx = x + (noise2(x * 1.9 + 7, z * 1.9, seed) - 0.5) * 0.4;
  const jz = z + (noise2(x * 1.9, z * 1.9 + 7, seed) - 0.5) * 0.4;
  const surface = src.surface(jx, jz);
  if (surface === "camino") return scaleRgb(p.camino, 1 + (n2 - 0.5) * 0.06);
  if (surface === "empedrado") return mixRgb(p.piedra, p.borde, smooth(0.4, 0.8, n2) * 0.5);
  if (outside) return mixRgb(c, p.luz, Math.min(0.5, Math.max(0, h / 6)));
  const dRoad = src.roadDistance(jx, jz, 1);
  if (dRoad < 1) c = mixRgb(c, p.borde, 1 - smooth(0.1, 0.6, dRoad));
  const dWater = src.waterDistance(jx, jz, 1.2);
  if (dWater < 1.2) c = mixRgb(c, p.orilla, 1 - smooth(0.3, 1.2, dWater));
  return c;
}

/** The open-world ground colors (V6 mockup `buildTerrain`, with the height and the alternate ones greener). */
function openPalette(look: TerrainLook): Record<"bajo" | "alto" | "alterno" | "bosque" | "roca" | "rocaCalida", Rgb> {
  const v = look.ground.vertex;
  return {
    bajo: lookRgb(look, v.low), alto: lookRgb(look, v.high), alterno: lookRgb(look, v.alternate),
    bosque: lookRgb(look, v.forest), roca: lookRgb(look, v.rock), rocaCalida: lookRgb(look, v.rockWarm),
  };
}

/** Per-vertex normals weighted by area (the same as three `computeVertexNormals` over this mesh). */
export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const n = new Float32Array(positions.length);
  const p = (k: number): number => positions[k] as number;
  for (let t = 0; t < indices.length; t += 3) {
    const a = (indices[t] as number) * 3;
    const b = (indices[t + 1] as number) * 3;
    const c = (indices[t + 2] as number) * 3;
    const e1x = p(b) - p(a);
    const e1y = p(b + 1) - p(a + 1);
    const e1z = p(b + 2) - p(a + 2);
    const e2x = p(c) - p(a);
    const e2y = p(c + 1) - p(a + 1);
    const e2z = p(c + 2) - p(a + 2);
    // (b - a) × (c - a) of each triangle as it is in the index: with the mesh (a, c, b) order it points to +y.
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      n[v] = (n[v] as number) + cx;
      n[v + 1] = (n[v + 1] as number) + cy;
      n[v + 2] = (n[v + 2] as number) + cz;
    }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v] as number, n[v + 1] as number, n[v + 2] as number) || 1;
    n[v] = (n[v] as number) / l;
    n[v + 1] = (n[v + 1] as number) / l;
    n[v + 2] = (n[v + 2] as number) / l;
  }
  return n;
}

/**
 * Dirt weight of a vertex (D-819, V6 mockup): 1 on the path (half width with a noisy edge of +-0.45 m) and on
 * each NPC flat (3.4 m), dropping to 0 in 0.75 mesh steps, so at any step the path has no gaps
 * (AC32). The slope rock eats up to 80 % (buildTerrain applies that).
 */
export function roadWeight(shape: TerrainShape, x: number, z: number, step: number): number {
  let w = 0;
  const fall = step * 0.75;
  for (const r of shape.roads) {
    const q = polylineNearest(x, z, r.line);
    if (!q) continue;
    const hw = r.width / 2 + (noise2(x / 3, z / 3, shape.seed + 21) - 0.5) * 0.9;
    w = Math.max(w, Math.min(1, Math.max(0, 1 - (q.d - hw) / fall)));
  }
  // The first pad is the spawn (a flat with no dirt); the others, the NPCs.
  for (const p of (shape.pads ?? []).slice(1)) w = Math.max(w, Math.min(1, Math.max(0, 1 - (Math.hypot(x - p.x, z - p.z) - 3.4) / fall)));
  return w;
}

function openColor(p: ReturnType<typeof openPalette>, shape: TerrainShape, x: number, z: number, h: number, rockT: number): Rgb {
  const seed = shape.seed;
  const n1 = noise2(x / 9, z / 9, seed + 9);
  const n2 = noise2(x / 3.2, z / 3.2, seed + 4);
  const n3 = noise2(x / 22, z / 22, seed + 12);
  let c = mixRgb(p.bajo, p.alto, Math.min(1, Math.max(0, smooth(3.2, 9.5, h) * 0.9 + (n3 - 0.5) * 0.4)));
  c = mixRgb(c, p.alterno, Math.min(0.55, Math.max(0, (n1 - 0.45) * 1.1)));
  c = scaleRgb(c, 0.9 + n2 * 0.22);
  const b = shape.bounds;
  const e = Math.max(b.minX + 8 - x, x - (b.maxX - 8), b.minZ + 6 - z, z - (b.maxZ - 6), 0);
  c = mixRgb(c, p.bosque, smooth(0, 26, e) * 0.5);
  if (rockT > 0) c = mixRgb(c, mixRgb(p.roca, p.rocaCalida, n2), rockT * 0.9);
  return c;
}

/** Height over the cell triangles: (a, c, b) if u + v <= 1, otherwise (b, c, e); a = (i, j), e = (i + 1, j + 1). */
function triangleHeight(ha: number, hb: number, hc: number, he: number, u: number, v: number): number {
  return u + v <= 1 ? ha + (hb - ha) * u + (hc - ha) * v : he + (hc - he) * (1 - u) + (hb - he) * (1 - v);
}

export function buildTerrain(spec: TerrainSpec): Terrain {
  const { bounds } = spec;
  const t = spec.ground.terrain;
  const relief = t?.relief === true;
  const shape: TerrainShape = {
    bounds,
    hillMax: t?.hills ?? HILL_MAX,
    seed: spec.seed ?? t?.seed ?? TERRAIN_SEED,
    pads: relief ? spec.ground.pads.map(([x, z]) => ({ x, z })) : null,
    roads: relief ? spec.ground.paths.filter((p) => p.surface === "camino") : [],
  };
  const skirt = t?.extension ?? TERRAIN_SKIRT;
  const src = curveGround(spec.ground);
  const extent: Bounds = terrainExtent(bounds, skirt);
  const lod: SceneDensity | TerrainLod = relief ? OPEN_WORLD_DENSITY[spec.tier ?? "medium"].terrain : (spec.density ?? "full");
  const { xs, zs } = terrainLines(bounds, skirt, lod);
  const step = (typeof lod === "string" ? DENSITY[lod].terrain : lod).fineStep;
  const nx = xs.length;
  const nz = zs.length;
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const dirt = new Float32Array(nx * nz);
  const heights = new Float64Array(nx * nz);
  const u0 = bounds.minX - BRUSH_UV_SKIRT;
  const v0 = bounds.minZ - BRUSH_UV_SKIRT;
  const w = bounds.maxX - bounds.minX + 2 * BRUSH_UV_SKIRT;
  const d = bounds.maxZ - bounds.minZ + 2 * BRUSH_UV_SKIRT;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i] as number;
      const z = zs[j] as number;
      const k = j * nx + i;
      const h = groundHeight(shape, src, x, z);
      heights[k] = h;
      positions.set([x, h, z], k * 3);
      uvs.set([(x - u0) / w, (z - v0) / d], k * 2);
    }
  }
  // Two triangles per cell, counterclockwise seen from above (normal +y).
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const e = c + 1;
      indices.set([a, c, b, b, c, e], o);
      o += 6;
    }
  }
  if (relief) {
    // Open world: color and dirt depend on the slope (rock), so they are painted after the normals.
    const normals = vertexNormals(positions, indices);
    const op = openPalette(spec.look);
    for (let k = 0; k < nx * nz; k++) {
      const x = positions[k * 3] as number;
      const z = positions[k * 3 + 2] as number;
      const rockT = smooth(0.9, 0.74, normals[k * 3 + 1] as number);
      colors.set(openColor(op, shape, x, z, heights[k] as number, rockT), k * 3);
      dirt[k] = roadWeight(shape, x, z, step) * (1 - rockT * 0.8);
    }
  } else {
    const p = palette(spec.look, spec.ground.palette);
    for (let k = 0; k < nx * nz; k++) {
      colors.set(groundColor(p, shape, src, positions[k * 3] as number, positions[k * 3 + 2] as number, heights[k] as number), k * 3);
    }
  }
  // One value per vertex interpolated over the mesh triangles (what is drawn is what is measured) in the open world.
  const onMesh = (values: ArrayLike<number>) => (x: number, z: number): number => {
    const i = lineCell(xs, x);
    const j = lineCell(zs, z);
    const x0 = xs[i] as number;
    const z0 = zs[j] as number;
    const u = Math.min(1, Math.max(0, (x - x0) / ((xs[i + 1] as number) - x0)));
    const v = Math.min(1, Math.max(0, (z - z0) / ((zs[j + 1] as number) - z0)));
    const h = (ii: number, jj: number) => values[jj * nx + ii] as number;
    // Without relief (farmer) the estetica-c bilinear holds: inside the ground is flat and the water is measured by its tests.
    if (!relief) return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
    return triangleHeight(h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1), u, v);
  };
  const heightAt = onMesh(heights);
  const dirtAt = onMesh(dirt);
  const vertexAt = (x: number, z: number): number => {
    const i = lineCell(xs, x);
    const j = lineCell(zs, z);
    for (const [ii, jj] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const) {
      if (Math.abs((xs[ii] ?? NaN) - x) < 1e-9 && Math.abs((zs[jj] ?? NaN) - z) < 1e-9) return jj * nx + ii;
    }
    return -1;
  };
  return { xs, zs, positions, colors, uvs, indices, extent, dirt, relief, step, heightAt, dirtAt, vertexAt };
}

export interface Scatter {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

/** Edge pines: outside the bounds (3 m or more), seeded with a minimum separation. */
export function borderPines(bounds: Bounds, seed = TERRAIN_SEED, count = 16): Scatter[] {
  const r = rng(seed * 31 + 7);
  const out: Scatter[] = [];
  const reach = 26;
  for (let tries = 0; out.length < count && tries < count * 80; tries++) {
    const x = bounds.minX - reach + r() * (bounds.maxX - bounds.minX + 2 * reach);
    const z = bounds.minZ - reach + r() * (bounds.maxZ - bounds.minZ + 2 * reach);
    const d = outsideDistance(bounds, x, z);
    if (d < 3 || d > reach) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 2.8)) continue;
    out.push({ x, z, rot: r() * Math.PI * 2, scale: 0.85 + r() * 0.55 });
  }
  return out;
}

export type DetailScatter = Record<"flores" | "matas" | "piedritas" | "empedrado", Scatter[]>;

const SCALES = { flores: [0.9, 1.4], matas: [0.7, 1.1], piedritas: [0.7, 1.2], empedrado: [0.8, 1.2] } as const;
/** Attempts per instance before giving up on a full zone (the estimator counts `cantidad`: upper bound). */
const TRIES_PER_ITEM = 60;

const walkableAt = (g: WalkGrid, x: number, z: number): boolean => {
  const col = Math.floor((x - g.originX) / g.cellSize);
  const row = Math.floor((z - g.originZ) / g.cellSize);
  return col >= 0 && row >= 0 && col < g.cols && row < g.rows && g.walkable[row * g.cols + col] === 1;
};

/**
 * Diorama format detail (plan estetica-c M5): `cantidad` instances per zone, seeded inside
 * the circle, never over a path, the water or a blocked cell (props, NPCs); and the stones of each
 * paved path along its line (as many as `pavingStoneCount`, the same count as the estimator).
 */
export function curveDetailScatter(ground: DioramaGround, grid: WalkGrid, seed = TERRAIN_SEED): DetailScatter {
  const out: DetailScatter = { flores: [], matas: [], piedritas: [], empedrado: [] };
  const src = curveGround(ground);
  for (const zone of ground.detail) {
    if (!(zone.kind in SCALES) || zone.kind === "empedrado") continue;
    const kind = zone.kind as "flores" | "matas" | "piedritas";
    const r = rng(seed * 101 + zone.seed * 7919);
    const [s0, s1] = SCALES[kind];
    let placed = 0;
    for (let tries = 0; placed < zone.count && tries < zone.count * TRIES_PER_ITEM; tries++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * zone.radius;
      const x = zone.x + Math.cos(a) * rad;
      const z = zone.z + Math.sin(a) * rad;
      if (!walkableAt(grid, x, z) || src.isWater(x, z) || src.surface(x, z) !== "pasto" || src.roadDistance(x, z, 0.3) < 0.3) continue;
      out[kind].push({ x, z, rot: r() * Math.PI * 2, scale: s0 + r() * (s1 - s0) });
      placed += 1;
    }
  }
  ground.paths.forEach((p, i) => {
    if (p.surface !== "empedrado") return;
    const n = pavingStoneCount(p.points, p.width);
    const r = rng(seed * 53 + i * 131);
    const cum = [0];
    for (let k = 1; k < p.line.length; k++) cum.push((cum[k - 1] as number) + Math.hypot((p.line[k] as { x: number }).x - (p.line[k - 1] as { x: number }).x, (p.line[k] as { z: number }).z - (p.line[k - 1] as { z: number }).z));
    const total = cum[cum.length - 1] as number;
    for (let s = 0; s < n; s++) {
      const target = r() * total;
      let k = 1;
      while (k < cum.length - 1 && (cum[k] as number) < target) k++;
      const a = p.line[k - 1] as { x: number; z: number };
      const b = p.line[k] as { x: number; z: number };
      const seg = Math.max(1e-9, (cum[k] as number) - (cum[k - 1] as number));
      const t = Math.min(1, Math.max(0, (target - (cum[k - 1] as number)) / seg));
      const nxDir = -(b.z - a.z) / seg;
      const nzDir = (b.x - a.x) / seg;
      const off = (r() - 0.5) * p.width * 0.85;
      const [e0, e1] = SCALES.empedrado;
      out.empedrado.push({ x: a.x + (b.x - a.x) * t + nxDir * off, z: a.z + (b.z - a.z) * t + nzDir * off, rot: r() * Math.PI * 2, scale: e0 + r() * (e1 - e0) });
    }
  });
  return out;
}
