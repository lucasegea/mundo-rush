import { BufferAttribute, BufferGeometry } from "three";

/** 1 tile = 1 m = 32 px of texture (D-154). */
export const TILE_PX = 32;
export const CHUNK_SIZE = 16;
/** Tile id 0 means "no tile": it produces no geometry. Ids >= 1 map to atlas cell id - 1. */
export const EMPTY_TILE = 0;

/** One layer of a tilemap, row-major: tiles[z * width + x]. */
export interface TileLayer {
  readonly width: number;
  readonly height: number;
  readonly tiles: ArrayLike<number>;
}

/** Atlas laid out as a grid of TILE_PX cells; cell index = row * columns + col. */
export interface AtlasLayout {
  readonly columns: number;
  readonly rows: number;
  /** Inset in texels applied to every UV edge, so nearest sampling never bleeds into the neighbour cell. */
  readonly insetTexels?: number;
}

export interface TileChunkArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly tileCount: number;
}

/** UV rectangle [u0, vBottom, u1, vTop] of an atlas cell (v grows upwards; canvas textures use flipY = true). */
export function atlasCellUv(cell: number, atlas: AtlasLayout): [number, number, number, number] {
  const col = cell % atlas.columns;
  const row = Math.floor(cell / atlas.columns);
  if (cell < 0 || row >= atlas.rows) throw new RangeError(`atlas cell ${cell} out of range`);
  const widthPx = atlas.columns * TILE_PX;
  const heightPx = atlas.rows * TILE_PX;
  const inset = atlas.insetTexels ?? 0.01;
  const u0 = (col * TILE_PX + inset) / widthPx;
  const u1 = ((col + 1) * TILE_PX - inset) / widthPx;
  const vTop = 1 - (row * TILE_PX + inset) / heightPx;
  const vBottom = 1 - ((row + 1) * TILE_PX - inset) / heightPx;
  return [u0, vBottom, u1, vTop];
}

/**
 * Pure core of buildTileChunk: one quad per non-empty tile of the 16x16 chunk (chunkX, chunkZ),
 * on the XZ plane at height y, in WORLD coordinates (tile (x, z) spans [x, x+1] x [z, z+1]) so
 * neighbouring chunks share exact border coordinates. Tiles outside the map are skipped.
 */
export function buildTileChunkArrays(
  layer: TileLayer,
  chunkX: number,
  chunkZ: number,
  atlas: AtlasLayout,
  y = 0,
): TileChunkArrays {
  const x0 = chunkX * CHUNK_SIZE;
  const z0 = chunkZ * CHUNK_SIZE;
  const x1 = Math.min(x0 + CHUNK_SIZE, layer.width);
  const z1 = Math.min(z0 + CHUNK_SIZE, layer.height);

  const placed: Array<[number, number, number]> = [];
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const id = layer.tiles[z * layer.width + x] ?? EMPTY_TILE;
      if (id !== EMPTY_TILE) placed.push([x, z, id]);
    }
  }

  const n = placed.length;
  const positions = new Float32Array(n * 12);
  const normals = new Float32Array(n * 12);
  const uvs = new Float32Array(n * 8);
  const indices = new Uint32Array(n * 6);

  placed.forEach(([x, z, id], i) => {
    const [u0, vBottom, u1, vTop] = atlasCellUv(id - 1, atlas);
    // v0 (x, z) top-left, v1 (x+1, z) top-right, v2 (x+1, z+1) bottom-right, v3 (x, z+1) bottom-left.
    // "Top" = smaller z = further from a camera that sits on +z looking towards -z.
    positions.set([x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1], i * 12);
    normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], i * 12);
    uvs.set([u0, vTop, u1, vTop, u1, vBottom, u0, vBottom], i * 8);
    const b = i * 4;
    // Counter-clockwise seen from +Y, so the face normal is +Y.
    indices.set([b, b + 3, b + 2, b, b + 2, b + 1], i * 6);
  });

  return { positions, normals, uvs, indices, tileCount: n };
}

/** Merges a 16x16 chunk of one layer into a single BufferGeometry (1 draw call per chunk and layer). */
export function buildTileChunk(
  layer: TileLayer,
  chunkX: number,
  chunkZ: number,
  atlas: AtlasLayout,
  y = 0,
): BufferGeometry {
  const a = buildTileChunkArrays(layer, chunkX, chunkZ, atlas, y);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(a.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(a.normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(a.uvs, 2));
  geometry.setIndex(new BufferAttribute(a.indices, 1));
  if (a.tileCount > 0) geometry.computeBoundingSphere();
  return geometry;
}

export function chunkCount(layer: TileLayer): { x: number; z: number } {
  return { x: Math.ceil(layer.width / CHUNK_SIZE), z: Math.ceil(layer.height / CHUNK_SIZE) };
}
