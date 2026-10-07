// buildTileChunk (03 §2.9, D-138, D-154): fusiona 16×16 tiles de una capa en UNA BufferGeometry con las UV del
// atlas (1 draw call por chunk y capa). 1 tile = 1 m = 32 px. Tiles vacíos (id 0) no generan geometría.
// Coordenadas de mundo: los bordes de dos chunks vecinos coinciden exactos. Portado del spike F0.2 (medido) y
// adaptado a capas con origen (formato de 03 §6.4.3).
import { BufferAttribute, BufferGeometry } from "three";
import type { TileLayerData } from "@lg/core";

export const TILE_PX = 32;
export const CHUNK_SIZE = 16;
export const EMPTY_TILE = 0;

/** revisión de arquitectura como grilla de celdas de TILE_PX; celda = fila * columnas + columna; id de tile = celda + 1. */
export interface AtlasLayout {
  readonly columns: number;
  readonly rows: number;
  /** Margen en texels en cada borde de la UV: el muestreo `nearest` nunca toma la celda vecina. */
  readonly insetTexels?: number;
}

export interface TileChunkArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly tileCount: number;
}

/** UV [u0, vAbajo, u1, vArriba] de una celda del atlas (la fila 0 está arriba, v crece hacia arriba). */
export function atlasCellUv(cell: number, atlas: AtlasLayout): [number, number, number, number] {
  const col = cell % atlas.columns;
  const row = Math.floor(cell / atlas.columns);
  if (cell < 0 || row >= atlas.rows) throw new RangeError(`celda de atlas ${cell} fuera de rango`);
  const widthPx = atlas.columns * TILE_PX;
  const heightPx = atlas.rows * TILE_PX;
  const inset = atlas.insetTexels ?? 0.01;
  const u0 = (col * TILE_PX + inset) / widthPx;
  const u1 = ((col + 1) * TILE_PX - inset) / widthPx;
  const vTop = 1 - (row * TILE_PX + inset) / heightPx;
  const vBottom = 1 - ((row + 1) * TILE_PX - inset) / heightPx;
  return [u0, vBottom, u1, vTop];
}

/** Núcleo puro: un quad por tile no vacío del chunk (chunkX, chunkZ), en el plano XZ a la altura y. */
export function buildTileChunkArrays(layer: TileLayerData, chunkX: number, chunkZ: number, atlas: AtlasLayout, y = 0): TileChunkArrays {
  const x0 = chunkX * CHUNK_SIZE;
  const z0 = chunkZ * CHUNK_SIZE;
  const x1 = Math.min(x0 + CHUNK_SIZE, layer.width);
  const z1 = Math.min(z0 + CHUNK_SIZE, layer.height);

  const placed: [number, number, number][] = [];
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const id = layer.tiles[z * layer.width + x] ?? EMPTY_TILE;
      if (id !== EMPTY_TILE) placed.push([layer.originX + x, layer.originZ + z, id]);
    }
  }

  const n = placed.length;
  const positions = new Float32Array(n * 12);
  const normals = new Float32Array(n * 12);
  const uvs = new Float32Array(n * 8);
  const indices = new Uint32Array(n * 6);
  placed.forEach(([x, z, id], i) => {
    const [u0, vBottom, u1, vTop] = atlasCellUv(id - 1, atlas);
    // v0 (x, z) arriba-izq., v1 (x+1, z) arriba-der., v2 (x+1, z+1) abajo-der., v3 (x, z+1) abajo-izq.
    // "Arriba" = z menor = más lejos de la cámara (que está del lado +z mirando hacia -z).
    positions.set([x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1], i * 12);
    normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], i * 12);
    uvs.set([u0, vTop, u1, vTop, u1, vBottom, u0, vBottom], i * 8);
    const b = i * 4;
    indices.set([b, b + 3, b + 2, b, b + 2, b + 1], i * 6); // antihorario visto desde +Y: normal +Y
  });
  return { positions, normals, uvs, indices, tileCount: n };
}

/** La geometría fusionada de un chunk (1 draw call por chunk y capa). */
export function buildTileChunk(layer: TileLayerData, chunkX: number, chunkZ: number, atlas: AtlasLayout, y = 0): BufferGeometry {
  const a = buildTileChunkArrays(layer, chunkX, chunkZ, atlas, y);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(a.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(a.normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(a.uvs, 2));
  geometry.setIndex(new BufferAttribute(a.indices, 1));
  if (a.tileCount > 0) geometry.computeBoundingSphere();
  return geometry;
}

export function chunkCount(layer: Pick<TileLayerData, "width" | "height">): { x: number; z: number } {
  return { x: Math.ceil(layer.width / CHUNK_SIZE), z: Math.ceil(layer.height / CHUNK_SIZE) };
}
