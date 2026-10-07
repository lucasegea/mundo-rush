// Diorama listo para jugar (03 §6.4.3): del layout de contenido (YAML compilado a JSON) a capas de tiles,
// volúmenes, NPCs, interactuables y grilla de caminabilidad. Puro: lo llama la acción que carga el diorama.
import {
  buildWalkGrid, DEFAULT_INTERACT_RADIUS, type Bounds, type Interactable, type Point, type Rect, type WalkGrid,
} from "../movement";

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

/** Forma del layout que consume el juego (la valida el schema de content-schema al compilar). */
export interface DioramaLayout {
  id: string;
  bounds: Bounds;
  /** Punto de aparición del jugador; sin él, el centro de los límites. */
  spawn?: Vec3;
  atlas_tiles?: string;
  /** Capas de tiles: cada fila es una lista de ids del atlas separados por espacios (0 = vacío); 1 tile = 1 m. */
  tiles?: readonly { capa: string; origen: Vec2; filas: readonly string[] }[];
  /** Volúmenes. Con `tam` (ancho, alto, profundidad) son cajas por código y su huella bloquea la grilla. */
  props?: readonly { asset: string; pos: Vec3; tam?: Vec3 }[];
  npcs?: readonly { id: string; spawn: Vec3; radio_interaccion?: number }[];
  interactuables?: readonly { id: string; pos: Vec3; radio?: number }[];
  no_caminable?: readonly { poligono: readonly Vec2[] }[];
}

export interface TileLayerData {
  name: string;
  /** Esquina (x, z) del tile [0, 0] en metros. */
  originX: number;
  originZ: number;
  width: number;
  height: number;
  /** Fila mayor: tiles[z * width + x]; 0 = vacío. */
  tiles: number[];
}

export interface PropBox {
  asset: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface DioramaRuntime {
  id: string;
  bounds: Bounds;
  atlas: string | null;
  spawn: Point;
  layers: TileLayerData[];
  boxes: PropBox[];
  npcs: { id: string; x: number; z: number }[];
  interactables: Interactable[];
  grid: WalkGrid;
}

/** Filas de texto → capa de tiles. Falla clara si una fila tiene otro largo o un id que no es entero ≥ 0. */
export function parseTileRows(name: string, origin: Vec2, rows: readonly string[]): TileLayerData {
  const parsed = rows.map((row, i) =>
    row.trim().split(/\s+/).filter(Boolean).map((cell) => {
      const n = Number(cell);
      if (!Number.isInteger(n) || n < 0) throw new Error(`capa ${name}, fila ${i}: id de tile inválido "${cell}"`);
      return n;
    }),
  );
  const width = parsed[0]?.length ?? 0;
  parsed.forEach((r, i) => {
    if (r.length !== width) throw new Error(`capa ${name}, fila ${i}: ${r.length} tiles, se esperaban ${width}`);
  });
  return { name, originX: origin[0], originZ: origin[1], width, height: parsed.length, tiles: parsed.flat() };
}

const footprint = (b: PropBox): Rect => ({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });

export function prepareDiorama(layout: DioramaLayout): DioramaRuntime {
  const { bounds } = layout;
  const boxes: PropBox[] = (layout.props ?? []).flatMap((p) =>
    p.tam ? [{ asset: p.asset, x: p.pos[0], y: p.pos[1], z: p.pos[2], w: p.tam[0], h: p.tam[1], d: p.tam[2] }] : [],
  );
  const npcs = (layout.npcs ?? []).map((n) => ({ id: n.id, x: n.spawn[0], z: n.spawn[2] }));
  const interactables: Interactable[] = [
    ...(layout.npcs ?? []).map((n): Interactable => ({ id: n.id, kind: "npc", x: n.spawn[0], z: n.spawn[2], radius: n.radio_interaccion ?? DEFAULT_INTERACT_RADIUS })),
    ...(layout.interactuables ?? []).map((o): Interactable => ({ id: o.id, kind: "object", x: o.pos[0], z: o.pos[2], radius: o.radio ?? DEFAULT_INTERACT_RADIUS })),
  ];
  // Los NPCs también ocupan su lugar: un cuadrado de medio metro donde están parados (no se los atraviesa).
  const npcRects: Rect[] = npcs.map((n) => ({ minX: n.x - 0.25, maxX: n.x + 0.25, minZ: n.z - 0.25, maxZ: n.z + 0.25 }));
  const grid = buildWalkGrid({
    bounds,
    polygons: (layout.no_caminable ?? []).map((n) => n.poligono),
    rects: [...boxes.map(footprint), ...npcRects],
  });
  return {
    id: layout.id,
    bounds,
    atlas: layout.atlas_tiles ?? null,
    spawn: layout.spawn ? { x: layout.spawn[0], z: layout.spawn[2] } : { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    layers: (layout.tiles ?? []).map((t) => parseTileRows(t.capa, t.origen, t.filas)),
    boxes,
    npcs,
    interactables,
    grid,
  };
}
