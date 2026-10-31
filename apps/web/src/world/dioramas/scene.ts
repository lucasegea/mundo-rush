// world/dioramas/scene.ts — the diorama's static graph in look C (plan estetica-c M1), built without GPU: terrain by
// heights, water, props by builder (one per mesh; repeated ones as InstancedMesh, one call per type, size and
// tint), trees and pines (the layout's and the edge's), instanced detail and the blob shadow anchors of the
// trunks. Diorama.tsx mounts it as is; the budget estimator (A15) and the material auditor (A4) measure THIS
// same graph, so what is measured is what is drawn. Plan estetica-c M5: reads the diorama format (paths and rivers by
// curves, water by polygons, detail by zones, props with rotation and tint); since M7 it is the only format (D-207).
// Plan estetica-c M6: it is built with the tier's density (DENSITY from @lg/art): on `low`, coarser terrain, props and
// trees of reduced geometry, fewer pines on the skirt and one in three detail instances; the
// validate:content estimator counts with the same table.
// Open-world-3d T6 (D-819, D-823): a diorama with `terreno.relieve` is the open world: tiled terrain with the
// ground shader (class `terreno`) and the tier's step, a ground picker that raycasts on the mesh (the
// click walks over the relief), props and trees resting on `heightAt` (bases 0.1 m down) and the sky (dome and clouds)
// inside the graph, so the estimator and the auditor count it. Without relief, everything stays as in estetica-c.
// Open-world-3d T7: with relief, trees, rocks and detail come from `diorama.vegetation` (the V6 mockup's seeding
// that also blocks the grid) via world/nature; the code-built edge pines remain for dioramas without relief.
// Open-world-3d T8: with relief, world/terrain builds the height and dirt texture and the V6 grass receives it (PD-2); its bed
// moves the ground's `grassBed` uniform.
// Open-world-3d T7b (D-839): the scene is built with the diorama's look (`look`, resolved once by lookForDiorama) and
// stores it in `scene.look`: terrain, ground, sky, water and nature read it from there; the relief decides only the shape.
import {
  Box3, BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Object3D, PlaneGeometry, Quaternion, Sphere, Vector3,
  type Intersection, type Raycaster,
} from "three";
import type { DioramaRuntime, PropBox } from "@lg/core";
import {
  DENSITY, keepDetail, OPEN_WORLD_DENSITY, TERRAIN_APRON, TERRAIN_SEED as ART_SEED, type PaletteToken, type SceneDensity, type TreeLodRadii,
  type WorldLook, type WorldTier,
} from "@lg/art";
import type { Obstacle } from "../camera/rig";
import { toonMaterial } from "../materials/registry";
import { blob, mergeParts, painted, sphere } from "../props/geometry";
import { buildProp, isTreeAsset, TREE_CANOPY_RADIUS, TREE_HEIGHT } from "../props/builders";
import { isModelAsset } from "../props/gltf";
import type { ModelSlot } from "../props/ModelProps";
import {
  borderPines, buildTerrain, curveDetailScatter, type DetailScatter, type Scatter, type Terrain,
} from "../terrain/buildTerrain";
import { waterMaterial } from "../water/waterMaterial";
import { rng } from "../materials/rng";
import { buildSky, type Sky } from "../sky/sky";
import { groundMaterial, type GroundMaterial } from "../terrain/groundMaterial";
import { buildNature, type Nature } from "../nature/buildNature";
import { buildGrass, type Grass } from "../nature/grass";
import { heightDirtTexture, type HeightDirtMap } from "../terrain/heightTexture";
import { lookForDiorama } from "./look";

/** Height of the water plane (the terrain sinks below it). */
export const WATER_LEVEL = -0.15;
/** Open-world-3d T6 (D-819): actors go 0.02 m above `heightAt`; the bases of props and trees, 0.1 m below. */
export const ACTOR_LIFT = 0.02;
export const PROP_SINK = 0.1;

export interface BlobAnchor {
  x: number;
  z: number;
  size: number;
}

export interface DioramaScene {
  /** Open-world-3d T7b: the look it was built with (characters take their skeleton from here, D-840). */
  look: WorldLook;
  root: Group;
  terrain: Terrain;
  /** What can block the two-person shot (A8). */
  obstacles: Obstacle[];
  /** Fixed blob shadows (trunks), besides the characters'. */
  blobAnchors: BlobAnchor[];
  /** `modelo/*` props (glTF from the M2 pipeline): loaded separately and fit into their `tam` box. */
  models: ModelSlot[];
  /** Open-world-3d T6: the ground material (its .ktx2 maps are downloaded by Diorama with the renderer); null without relief. */
  ground: GroundMaterial | null;
  /** The open world's sky (dome and clouds, already inside `root`); null without relief. */
  sky: Sky | null;
  /** What receives the ground click: with relief, a raycast over the terrain tiles; null without relief. */
  picker: Object3D | null;
  /** Open-world-3d T7: trees, rocks and detail of the open world (already inside `root`); null without relief. */
  nature: Nature | null;
  /**
   * Open-world-3d T8: the V6 grass (already inside `root`) and the RG16F height and dirt texture that world/terrain builds and the
   * grass only reads (PD-2: the only one in the scene); null without relief.
   */
  grass: Grass | null;
  heightDirt: HeightDirtMap | null;
  dispose(): void;
}

const Y = new Vector3(0, 1, 0);

/**
 * Open-world-3d T10 (b): open-world scene knobs. Without them (or without a field), the tier's from
 * OPEN_WORLD_DENSITY. Today only the development measurement factors move them (world/budget/devFactors.ts).
 */
export interface SceneKnobs {
  /** false = no V6 grass. */
  grass?: boolean;
  /** Ground normal maps; by default the tier's. */
  groundNormals?: boolean;
  /** "light" = no full trees; "impostor" = impostors only. */
  treeBand?: "light" | "impostor";
}

/** The LOD radii of the tier's trees with the requested band (full and light ones at 0 depending on the band). */
export function treeLodFor(tier: WorldTier, band: SceneKnobs["treeBand"]): TreeLodRadii {
  const base = OPEN_WORLD_DENSITY[tier].treeLod;
  if (band === "impostor") return { full: 0, mid: 0 };
  if (band === "light") return { full: 0, mid: base.mid };
  return base;
}

function instanced(name: string, geo: BufferGeometry, items: readonly { x: number; y: number; z: number; rot: number; scale: number }[], castShadow = false): InstancedMesh {
  const m = new InstancedMesh(geo, toonMaterial(), Math.max(1, items.length));
  const mat = new Matrix4();
  const q = new Quaternion();
  items.forEach((it, i) => {
    q.setFromAxisAngle(Y, it.rot);
    mat.compose(new Vector3(it.x, it.y, it.z), q, new Vector3(it.scale, it.scale, it.scale));
    m.setMatrixAt(i, mat);
  });
  m.count = items.length;
  m.name = name;
  m.castShadow = castShadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

function terrainMesh(t: Terrain): Mesh {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(t.positions, 3));
  g.setAttribute("color", new BufferAttribute(t.colors, 3));
  g.setAttribute("uv", new BufferAttribute(t.uvs, 2));
  g.setIndex(new BufferAttribute(t.indices, 1));
  g.computeVertexNormals();
  const m = new Mesh(g, toonMaterial());
  m.name = "terreno";
  m.receiveShadow = true;
  return m;
}

/**
 * The open world's terrain in tiles (D-819): the same vertex buffers and one index per tile, with its box
 * (and from -40 to 80 m), so three discards the ones not visible. `tiles` is columns by rows, like OPEN_WORLD_DENSITY.
 */
export function terrainTiles(t: Terrain, tiles: readonly [number, number], material: GroundMaterial): Group {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(t.positions, 3));
  g.setAttribute("color", new BufferAttribute(t.colors, 3));
  g.setAttribute("uv", new BufferAttribute(t.uvs, 2));
  g.setAttribute("aDirt", new BufferAttribute(t.dirt, 1));
  g.setIndex(new BufferAttribute(t.indices, 1));
  g.computeVertexNormals();
  const nx = t.xs.length;
  const cellsX = nx - 1;
  const cellsZ = t.zs.length - 1;
  const group = new Group();
  group.name = "terreno";
  const [tx, tz] = tiles;
  for (let a = 0; a < tz; a++) {
    for (let b = 0; b < tx; b++) {
      const i0 = Math.round((b * cellsX) / tx);
      const i1 = Math.round(((b + 1) * cellsX) / tx);
      const j0 = Math.round((a * cellsZ) / tz);
      const j1 = Math.round(((a + 1) * cellsZ) / tz);
      const idx = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
      let q = 0;
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const v = j * nx + i;
          idx.set([v, v + nx, v + 1, v + 1, v + nx, v + nx + 1], q);
          q += 6;
        }
      }
      const tg = new BufferGeometry();
      for (const k of ["position", "normal", "uv", "color", "aDirt"]) tg.setAttribute(k, g.getAttribute(k));
      tg.setIndex(new BufferAttribute(idx, 1));
      const box = new Box3(new Vector3(t.xs[i0], -40, t.zs[j0]), new Vector3(t.xs[i1], 80, t.zs[j1]));
      tg.boundingBox = box;
      tg.boundingSphere = box.getBoundingSphere(new Sphere());
      const m = new Mesh(tg, material.material);
      m.name = `terreno:${b},${a}`;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  return group;
}

/**
 * The open world's apron (open-world-3d M3, AC35, TERRAIN_APRON): a flat ring of 8 triangles from
 * `overlap` m inside the extent to `width` m outside, `sink` m below the mesh's lowest vertex (so it stays
 * under the skirt where they overlap). It uses the ground material, whose edge fade paints it entirely the fog color:
 * with the whole map in a wide or tall aspect, what shows beyond the skirt is fog-colored ground.
 */
export function terrainApron(t: Terrain, material: GroundMaterial): Mesh {
  const e = t.extent;
  let lowest = Infinity;
  for (let i = 1; i < t.positions.length; i += 3) lowest = Math.min(lowest, t.positions[i] as number);
  const y = lowest - TERRAIN_APRON.sink;
  const o = TERRAIN_APRON.overlap;
  const w = TERRAIN_APRON.width;
  const ring = (d: number): [number, number][] => [[e.minX - d, e.minZ - d], [e.maxX + d, e.minZ - d], [e.maxX + d, e.maxZ + d], [e.minX - d, e.maxZ + d]];
  const pts = [...ring(-o), ...ring(w)];
  const idx: number[] = [];
  // Each triangle with its normal toward +y: (b - a) × (c - a) with a positive y component.
  const tri = (a: number, b: number, c: number): void => {
    const [ax, az] = pts[a] as [number, number];
    const [bx, bz] = pts[b] as [number, number];
    const [cx, cz] = pts[c] as [number, number];
    idx.push(...((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0 ? [a, b, c] : [a, c, b]));
  };
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    tri(k, k1, 4 + k1);
    tri(k, 4 + k1, 4 + k);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(Float32Array.from(pts.flatMap(([x, z]) => [x, y, z])), 3));
  g.setAttribute("normal", new BufferAttribute(Float32Array.from(pts.flatMap(() => [0, 1, 0])), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(pts.length * 3).fill(1), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(pts.length * 2), 2));
  g.setAttribute("aDirt", new BufferAttribute(new Float32Array(pts.length), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new Mesh(g, material.material);
  m.name = "terreno:delantal";
  return m;
}

/**
 * The ground picker (open-world-3d T6): a meshless object whose raycast is the terrain tiles', so the
 * ground click lands on the visible relief point (and not on a plane at y = 0). Diorama puts the `onClick` on it.
 */
export function groundPicker(tiles: Object3D): Object3D {
  const picker = new Object3D();
  picker.name = "suelo:clic";
  picker.raycast = (raycaster: Raycaster, intersects: Intersection[]): void => {
    for (const hit of raycaster.intersectObject(tiles, true)) intersects.push({ ...hit, object: picker });
  };
  return picker;
}

interface Box2 { minX: number; maxX: number; minZ: number; maxZ: number }

/** Box of all the water: the diorama's ponds and rivers. null if there is no water. */
function waterBox(diorama: DioramaRuntime): Box2 | null {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const add = (x0: number, x1: number, z0: number, z1: number): void => {
    b.minX = Math.min(b.minX, x0); b.maxX = Math.max(b.maxX, x1); b.minZ = Math.min(b.minZ, z0); b.maxZ = Math.max(b.maxZ, z1);
  };
  for (const poly of diorama.ground.ponds) for (const [x, z] of poly) add(x, x, z, z);
  for (const r of diorama.ground.rivers) for (const p of r.line) add(p.x - r.width / 2, p.x + r.width / 2, p.z - r.width / 2, p.z + r.width / 2);
  return Number.isFinite(b.minX) ? b : null;
}

/** A single water plane under all the ponds and rivers (the higher terrain covers it where there is no water). */
function waterMesh(diorama: DioramaRuntime, look: WorldLook): Mesh | null {
  const b = waterBox(diorama);
  if (!b) return null;
  const m = new Mesh(new PlaneGeometry(b.maxX - b.minX + 0.6, b.maxZ - b.minZ + 0.6).rotateX(-Math.PI / 2), waterMaterial(look));
  m.position.set((b.minX + b.maxX) / 2, WATER_LEVEL, (b.minZ + b.maxZ) / 2);
  m.name = "agua";
  return m;
}

const tintOf = (b: PropBox): PaletteToken | undefined => (b.tint === null ? undefined : (b.tint as PaletteToken));
const groupKey = (b: PropBox) => `${b.asset}|${b.w}|${b.h}|${b.d}|${b.tint ?? ""}`;

/** Footprint of the box on the plane (axis-aligned; with rotation, the box that contains it). */
function footprintBox(b: PropBox): Box2 {
  const r = b.rotY ?? 0;
  const hw = (Math.abs(Math.cos(r)) * b.w + Math.abs(Math.sin(r)) * b.d) / 2;
  const hd = (Math.abs(Math.sin(r)) * b.w + Math.abs(Math.cos(r)) * b.d) / 2;
  return { minX: b.x - hw, maxX: b.x + hw, minZ: b.z - hd, maxZ: b.z + hd };
}

/** Ground detail geometries (each type a single instanced mesh). */
function detailGeometries() {
  return {
    flores: mergeParts([
      painted(sphere(0.07, 5, 3).translate(0, 0.1, 0), "flor-centro"),
      painted(sphere(0.07, 5, 3).translate(0.14, 0.08, 0.05), "casa-2"),
      painted(sphere(0.07, 5, 3).translate(-0.08, 0.09, 0.12), "casa-1"),
    ]),
    matas: mergeParts([
      painted(blob(0.42, 1).translate(0, 0.26, 0), "copa", 1, { top: 0.3, bottomDark: 0.35 }),
      painted(blob(0.3, 0).translate(0.34, 0.2, 0.08), "copa", 2, { top: 0.3, bottomDark: 0.35 }),
    ]),
    piedritas: painted(blob(0.13, 0).scale(1.3, 0.55, 1).translate(0, 0.03, 0), "piedra", 3, { jitter: 0.12 }),
    empedrado: painted(blob(0.22, 0).scale(1.35, 0.32, 1.1).translate(0, 0.02, 0), "piedra", 4, { jitter: 0.14 }),
  };
}

/** The ground detail: the `detalle` zones and the cobblestones of the paved paths. */
export function dioramaDetail(diorama: DioramaRuntime): DetailScatter {
  return curveDetailScatter(diorama.ground, diorama.grid, diorama.ground.terrain.seed ?? ART_SEED);
}

export function buildDioramaScene(
  diorama: DioramaRuntime, density: SceneDensity = "full", tier: WorldTier = "medium", look: WorldLook = lookForDiorama(diorama),
  knobs: SceneKnobs = {},
): DioramaScene {
  const root = new Group();
  root.name = `diorama:${diorama.id}`;
  const spec = DENSITY[density];
  const relief = diorama.ground.terrain.relief;
  const terrain = buildTerrain({ bounds: diorama.bounds, ground: diorama.ground, density, tier, look });
  let ground: GroundMaterial | null = null;
  let sky: Sky | null = null;
  let picker: Object3D | null = null;
  let heightDirt: HeightDirtMap | null = null;
  let grass: Grass | null = null;
  if (relief) {
    // AC35: the skirt fades into the fog in its last meters and the apron continues in that color (TERRAIN_APRON).
    const skirt = terrain.extent.maxX - diorama.bounds.maxX;
    ground = groundMaterial(tier, look, { bounds: diorama.bounds, fade: [skirt - TERRAIN_APRON.fade[0], skirt - TERRAIN_APRON.fade[1]] }, knobs.groundNormals);
    const tiles = terrainTiles(terrain, OPEN_WORLD_DENSITY[tier].terrainTiles, ground);
    tiles.add(terrainApron(terrain, ground));
    root.add(tiles);
    picker = groundPicker(tiles);
    sky = buildSky(tier, look);
    root.add(sky.group);
    heightDirt = heightDirtTexture(terrain, diorama.bounds);
    if (knobs.grass !== false) {
      grass = buildGrass({ tier, look, heightDirt, bed: ground.grassBed });
      root.add(grass.group);
    }
  } else {
    root.add(terrainMesh(terrain));
  }
  // With relief, the base of what rests follows the terrain (0.1 m below); without relief, the layout's `y` as is.
  const baseY = (x: number, z: number, y: number): number => (relief ? terrain.heightAt(x, z) - PROP_SINK + y : y);
  const water = waterMesh(diorama, look);
  if (water) root.add(water);

  const obstacles: Obstacle[] = [];
  const blobAnchors: BlobAnchor[] = [];
  const models: ModelSlot[] = [];
  const geometries: BufferGeometry[] = [];

  // Solid props: grouped by asset, size and tint (equal ones share geometry and are instanced).
  const groups = new Map<string, PropBox[]>();
  const trees = new Map<string, { asset: keyof typeof TREE_HEIGHT; tint: PaletteToken | undefined; items: (Scatter & { y: number })[] }>();
  const r = rng(29);
  for (const b of diorama.boxes) {
    const fp = footprintBox(b);
    if (isTreeAsset(b.asset)) {
      const k = `${b.asset}|${b.tint ?? ""}`;
      const t = trees.get(k) ?? { asset: b.asset, tint: tintOf(b), items: [] };
      const scale = b.h / TREE_HEIGHT[b.asset];
      const rot = r() * Math.PI * 2; // the draw always runs: a given rotation does not change the next trees'
      t.items.push({ x: b.x, z: b.z, y: relief ? baseY(b.x, b.z, b.y) : b.y - 0.05, rot: b.rotY ?? rot, scale });
      trees.set(k, t);
      obstacles.push({ kind: "circle", x: b.x, z: b.z, r: TREE_CANOPY_RADIUS[b.asset] * scale, height: b.h });
      blobAnchors.push({ x: b.x, z: b.z, size: 1.6 * scale });
      continue;
    }
    if (isModelAsset(b.asset)) {
      models.push({ asset: b.asset, x: b.x, y: baseY(b.x, b.z, b.y), z: b.z, w: b.w, h: b.h, d: b.d, rotY: b.rotY ?? 0 });
      obstacles.push({ kind: "rect", ...fp, height: b.h });
      continue;
    }
    const k = groupKey(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
    obstacles.push({ kind: "rect", ...fp, height: b.h });
  }
  for (const list of groups.values()) {
    const first = list[0] as PropBox;
    const geo = buildProp(first.asset, { w: first.w, h: first.h, d: first.d }, 0, tintOf(first), spec.lod);
    geometries.push(geo);
    if (list.length === 1) {
      const m = new Mesh(geo, toonMaterial());
      m.position.set(first.x, baseY(first.x, first.z, first.y), first.z);
      m.rotation.y = first.rotY ?? 0;
      m.receiveShadow = true;
      m.name = first.asset;
      root.add(m);
    } else {
      // Without rotation in the layout, the same slight sway from M1 between neighbors (so they do not look cloned).
      root.add(instanced(first.asset, geo, list.map((b, i) => ({ x: b.x, y: baseY(b.x, b.z, b.y), z: b.z, rot: b.rotY ?? (i % 2) * 0.08, scale: 1 }))));
    }
  }

  // Layout trees and edge pines (outside the bounds): one call per type and tint. With relief, the edge is
  // the world/nature forest (T7).
  let nature: Nature | null = null;
  if (relief && diorama.vegetation) {
    nature = buildNature({ scatter: diorama.vegetation, bounds: diorama.bounds, tier, heightAt: terrain.heightAt, look, treeLod: treeLodFor(tier, knobs.treeBand) });
    root.add(nature.group);
    for (const o of nature.obstacles) obstacles.push({ kind: "circle", x: o.x, z: o.z, r: o.r, height: o.height });
  } else {
    const seed = diorama.ground.terrain.seed ?? ART_SEED;
    const border = borderPines(diorama.bounds, seed, spec.borderPines).map((p) => ({ ...p, y: terrain.heightAt(p.x, p.z) - PROP_SINK }));
    const pines = trees.get("codigo/pino|") ?? { asset: "codigo/pino" as const, tint: undefined, items: [] };
    pines.items.push(...border);
    trees.set("codigo/pino|", pines);
  }
  for (const t of trees.values()) {
    if (t.items.length === 0) continue;
    const geo = buildProp(t.asset, { w: 0.6, h: TREE_HEIGHT[t.asset], d: 0.6 }, 1, t.tint, spec.lod);
    geometries.push(geo);
    root.add(instanced(t.asset, geo, t.items));
  }

  // Ground detail (the cobblestones are the little plaza's ground: whole at every density).
  const detail = dioramaDetail(diorama);
  const dg = detailGeometries();
  for (const kind of ["flores", "matas", "piedritas", "empedrado"] as const) {
    const items = kind === "empedrado" ? detail[kind] : keepDetail(detail[kind], density);
    if (items.length === 0) continue;
    geometries.push(dg[kind]);
    root.add(instanced(`detalle:${kind}`, dg[kind], items.map((s) => ({ ...s, y: terrain.heightAt(s.x, s.z) }))));
  }
  // M5 SEAM: animals (V2 deferred). Here the diorama's animals are added (skeleton model from the pack that closes
  // V2, blob shadow and a spot in the animation governor); their cost enters the validate:content estimator.

  return {
    look,
    root,
    terrain,
    obstacles,
    blobAnchors,
    models,
    ground,
    sky,
    picker,
    nature,
    grass,
    heightDirt,
    dispose() {
      root.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); });
      for (const g of geometries) g.dispose();
      sky?.dispose();
      ground?.dispose();
      nature?.dispose();
      grass?.dispose();
      heightDirt?.texture.dispose();
    },
  };
}
