// Playable diorama (03 §6.4.3): from the content layout (YAML compiled to JSON) to the painted diorama's ground,
// volumes, NPCs, interactables and walkability grid. Pure: called by the action that loads the diorama.
// Plan estetica-c M5 (D-207): the painted diorama format (paths and rivers by curves, water by polygons, detail by
// zones, props with rotation, tint and instances). The core samples the curves once and leaves the data ready; it knows
// nothing about the look (heights and colors are decided by world/terrain/). The grid comes from the props, the water, the rivers, the
// `no_caminable` polygons and the NPCs. Plan estetica-c M7 (D-207): the HD-2D `tiles` and `atlas_tiles` layers were
// removed; the schema rejects them and the core no longer reads them.
import {
  buildWalkGrid, DEFAULT_INTERACT_RADIUS, type Bounds, type Interactable, type Point, type Rect, type WalkGrid,
} from "../movement";
import { sampleCatmullRom } from "./curves";
import { blockingFootprints, TERRAIN_SEED, vegetationScatter, type VegetationScatter } from "@lg/art";

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

/** Layout shape consumed by the game (validated by the content-schema schema at compile time). */
export interface DioramaLayout {
  id: string;
  bounds: Bounds;
  /** Player spawn point; without it, the center of the bounds. */
  spawn?: Vec3;
  /**
   * Volumes. With `tam` (width, height, depth) its footprint blocks the grid. `rotY` in degrees; `tinte`, token that
   * replaces the main color; `instancias`, the places of a repeated prop (instead of `pos`).
   */
  props?: readonly LayoutProp[];
  npcs?: readonly { id: string; spawn: Vec3; radio_interaccion?: number }[];
  interactuables?: readonly { id: string; pos: Vec3; radio?: number }[];
  no_caminable?: readonly { poligono: readonly Vec2[] }[];
  // Painted diorama format (plan estetica-c M5).
  terreno?: { extension?: number; lomas?: number; semilla?: number; relieve?: boolean };
  paleta?: Readonly<Record<string, string>>;
  caminos?: readonly { puntos: readonly Vec2[]; ancho: number; superficie?: "camino" | "empedrado" }[];
  rio?: readonly { puntos: readonly Vec2[]; ancho: number }[];
  agua?: readonly { poligono: readonly Vec2[] }[];
  detalle?: readonly { tipo: string; centro: Vec2; radio: number; cantidad: number; semilla?: number }[];
}

export interface LayoutProp {
  asset: string;
  pos?: Vec3;
  tam?: Vec3;
  rotY?: number;
  tinte?: string;
  instancias?: readonly { pos: Vec3; rotY?: number; tam?: Vec3 }[];
}

export interface PropBox {
  asset: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** Rotation around the vertical axis, in radians (the layout writes it in degrees); null if the layout did not give it. */
  rotY: number | null;
  /** Palette token that replaces the main color; null = the builder's. */
  tint: string | null;
}

/** A sampled path or river: the curve's polyline and its width. */
export interface PathLine {
  width: number;
  line: Point[];
}

/** What world/terrain/ needs from the painted diorama format (plan estetica-c M5). */
export interface DioramaGround {
  /** null = the look's defaults (world/ takes them from @lg/art). */
  terrain: { extension: number | null; hills: number | null; seed: number | null; relief: boolean };
  /**
   * Open-world-3d T6: the relief's flats (the spawn and each NPC), in layout order. Empty without relief: the
   * interior ground is flat.
   */
  pads: Vec2[];
  /** Terrain role → palette token. */
  palette: Readonly<Record<string, string>>;
  /** Paths: the sampled polyline and its control points (the cobblestones are counted over these). */
  paths: (PathLine & { surface: "camino" | "empedrado"; points: Vec2[] })[];
  rivers: PathLine[];
  ponds: Vec2[][];
  detail: { kind: string; x: number; z: number; radius: number; count: number; seed: number }[];
}

export interface DioramaRuntime {
  id: string;
  bounds: Bounds;
  spawn: Point;
  /** Painted diorama format (plan estetica-c M5). */
  ground: DioramaGround;
  boxes: PropBox[];
  npcs: { id: string; x: number; z: number }[];
  interactables: Interactable[];
  grid: WalkGrid;
  /**
   * Open-world-3d T7 (AC46): the open world's planting (trees, rocks and detail from @lg/art, the same one drawn by
   * world/), with its trunks and large rocks already blocked in `grid`. null without relief (farmer does not change).
   */
  vegetation: VegetationScatter | null;
}

const DEG = Math.PI / 180;

/** Footprint of a box: rectangle if the rotation is a multiple of 90°, polygon of its four corners otherwise. */
function footprint(b: PropBox): { rect: Rect } | { polygon: Vec2[] } {
  const deg = b.rotY === null ? 0 : (((Math.round((b.rotY / DEG) * 1e6) / 1e6) % 180) + 180) % 180;
  if (deg === 0 || deg === 90) {
    const [w, d] = deg === 0 ? [b.w, b.d] : [b.d, b.w];
    return { rect: { minX: b.x - w / 2, maxX: b.x + w / 2, minZ: b.z - d / 2, maxZ: b.z + d / 2 } };
  }
  const c = Math.cos(b.rotY as number);
  const s = Math.sin(b.rotY as number);
  // Three rotation around +y: x' = x cos + z sin, z' = -x sin + z cos.
  const corner = (dx: number, dz: number): Vec2 => [b.x + dx * c + dz * s, b.z - dx * s + dz * c];
  return { polygon: [corner(-b.w / 2, -b.d / 2), corner(b.w / 2, -b.d / 2), corner(b.w / 2, b.d / 2), corner(-b.w / 2, b.d / 2)] };
}

/** Expands `instancias` (each inherits `tam` and `rotY` from the prop if it does not bring its own). Without `tam` there is no box. */
function propBoxes(props: readonly LayoutProp[]): PropBox[] {
  return props.flatMap((p) => {
    const items: readonly { pos: Vec3; rotY?: number; tam?: Vec3 }[] = p.instancias ?? (p.pos ? [{ pos: p.pos }] : []);
    return items.flatMap((i): PropBox[] => {
      const tam = i.tam ?? p.tam;
      if (!tam) return [];
      const rot = i.rotY ?? p.rotY;
      return [{
        asset: p.asset, x: i.pos[0], y: i.pos[1], z: i.pos[2], w: tam[0], h: tam[1], d: tam[2],
        rotY: rot === undefined ? null : rot * DEG, tint: p.tinte ?? null,
      }];
    });
  });
}

/** The spawn (or the center of the bounds) and each NPC: the relief's flats (open-world-3d T6, D-819). */
function reliefPads(layout: DioramaLayout): Vec2[] {
  const b = layout.bounds;
  const spawn: Vec2 = layout.spawn ? [layout.spawn[0], layout.spawn[2]] : [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
  return [spawn, ...(layout.npcs ?? []).map((n): Vec2 => [n.spawn[0], n.spawn[2]])];
}

function groundOf(layout: DioramaLayout): DioramaGround {
  return {
    terrain: {
      extension: layout.terreno?.extension ?? null, hills: layout.terreno?.lomas ?? null, seed: layout.terreno?.semilla ?? null,
      relief: layout.terreno?.relieve === true,
    },
    pads: layout.terreno?.relieve === true ? reliefPads(layout) : [],
    palette: { ...(layout.paleta ?? {}) },
    paths: (layout.caminos ?? []).map((c) => ({
      surface: c.superficie ?? "camino", width: c.ancho, line: sampleCatmullRom(c.puntos), points: c.puntos.map((p): Vec2 => [p[0], p[1]]),
    })),
    rivers: (layout.rio ?? []).map((r) => ({ width: r.ancho, line: sampleCatmullRom(r.puntos) })),
    ponds: (layout.agua ?? []).map((a) => a.poligono.map((p): Vec2 => [p[0], p[1]])),
    detail: (layout.detalle ?? []).map((z, i) => ({ kind: z.tipo, x: z.centro[0], z: z.centro[1], radius: z.radio, count: z.cantidad, seed: z.semilla ?? i + 1 })),
  };
}

export function prepareDiorama(layout: DioramaLayout): DioramaRuntime {
  const { bounds } = layout;
  const boxes = propBoxes(layout.props ?? []);
  const npcs = (layout.npcs ?? []).map((n) => ({ id: n.id, x: n.spawn[0], z: n.spawn[2] }));
  const interactables: Interactable[] = [
    ...(layout.npcs ?? []).map((n): Interactable => ({ id: n.id, kind: "npc", x: n.spawn[0], z: n.spawn[2], radius: n.radio_interaccion ?? DEFAULT_INTERACT_RADIUS })),
    ...(layout.interactuables ?? []).map((o): Interactable => ({ id: o.id, kind: "object", x: o.pos[0], z: o.pos[2], radius: o.radio ?? DEFAULT_INTERACT_RADIUS })),
  ];
  // NPCs also take up their space: a half-meter square where they stand (they cannot be walked through).
  const npcRects: Rect[] = npcs.map((n) => ({ minX: n.x - 0.25, maxX: n.x + 0.25, minZ: n.z - 0.25, maxZ: n.z + 0.25 }));
  const ground = groundOf(layout);
  const prints = boxes.map(footprint);
  const spawnPoint: Point = layout.spawn ? { x: layout.spawn[0], z: layout.spawn[2] } : { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  // Open-world-3d T7 (AC46): with relief, the open world's forest; each trunk (and each large rock) blocks its cell.
  const vegetation = ground.terrain.relief
    ? vegetationScatter({
      bounds, spawn: spawnPoint, npcs, seed: ground.terrain.seed ?? TERRAIN_SEED,
      pads: ground.pads.map(([x, z]) => ({ x, z })),
      paths: ground.paths.filter((p) => p.surface === "camino").map((p) => ({ points: p.points, width: p.width })),
    })
    : null;
  const trunks: Rect[] = vegetation
    ? blockingFootprints(vegetation, bounds).map((f) => ({ minX: f.x - f.r, maxX: f.x + f.r, minZ: f.z - f.r, maxZ: f.z + f.r }))
    : [];
  const grid = buildWalkGrid({
    bounds,
    polygons: [
      ...(layout.no_caminable ?? []).map((n) => n.poligono),
      ...ground.ponds,
      ...prints.flatMap((f) => ("polygon" in f ? [f.polygon] : [])),
    ],
    rects: [...prints.flatMap((f) => ("rect" in f ? [f.rect] : [])), ...npcRects, ...trunks],
    bands: ground.rivers.map((r) => ({ line: r.line, halfWidth: r.width / 2 })),
  });
  return {
    id: layout.id,
    bounds,
    spawn: spawnPoint,
    ground,
    boxes,
    npcs,
    interactables,
    grid,
    vegetation,
  };
}
