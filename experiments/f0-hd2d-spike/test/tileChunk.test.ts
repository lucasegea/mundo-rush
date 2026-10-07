import { describe, expect, it } from "vitest";
import { atlasCellUv, buildTileChunk, buildTileChunkArrays, CHUNK_SIZE, chunkCount, type TileLayer } from "../src/lib/tileChunk";
import { buildTilemap, MAP_H, MAP_W } from "../src/lib/world";

const ATLAS = { columns: 4, rows: 4, insetTexels: 0 };

/** 20x18 map: chunk (0,0) full 16x16, chunk (1,0) 4x16, chunk (0,1) 16x2, chunk (1,1) 4x2; a few holes. */
function sample(): TileLayer {
  const width = 20;
  const height = 18;
  const tiles = new Uint8Array(width * height).fill(1);
  tiles[0] = 0; // hole in chunk (0,0)
  tiles[5 * width + 17] = 0; // hole in chunk (1,0)
  tiles[17 * width + 19] = 3; // atlas cell 2 in chunk (1,1)
  return { width, height, tiles };
}

describe("buildTileChunk", () => {
  it("emits 4 vertices, 4 UVs and 6 indices per non-empty tile", () => {
    const layer = sample();
    const cases: Array<[number, number, number]> = [
      [0, 0, 16 * 16 - 1],
      [1, 0, 4 * 16 - 1],
      [0, 1, 16 * 2],
      [1, 1, 4 * 2],
    ];
    for (const [cx, cz, tiles] of cases) {
      const g = buildTileChunk(layer, cx, cz, ATLAS);
      expect(g.getAttribute("position").count).toBe(tiles * 4);
      expect(g.getAttribute("uv").count).toBe(tiles * 4);
      expect(g.getAttribute("normal").count).toBe(tiles * 4);
      expect(g.index?.count).toBe(tiles * 6);
    }
  });

  it("produces no geometry for empty tiles or an all-empty chunk", () => {
    const empty: TileLayer = { width: 16, height: 16, tiles: new Uint8Array(256) };
    const a = buildTileChunkArrays(empty, 0, 0, ATLAS);
    expect(a.tileCount).toBe(0);
    expect(a.positions.length).toBe(0);
    expect(a.indices.length).toBe(0);
    expect(buildTileChunk(empty, 0, 0, ATLAS).getAttribute("position").count).toBe(0);

    const one = new Uint8Array(256);
    one[3 * 16 + 7] = 2;
    const b = buildTileChunkArrays({ width: 16, height: 16, tiles: one }, 0, 0, ATLAS);
    expect(b.tileCount).toBe(1);
    expect(Array.from(b.positions)).toEqual([7, 0, 3, 8, 0, 3, 8, 0, 4, 7, 0, 4]);
  });

  it("maps each tile id to its atlas cell UVs (1 tile = 32 px)", () => {
    const tiles = new Uint8Array(256);
    tiles[0] = 1; // cell 0: top-left of the atlas
    tiles[1] = 6; // cell 5: column 1, row 1
    const a = buildTileChunkArrays({ width: 16, height: 16, tiles }, 0, 0, ATLAS);
    expect(Array.from(a.uvs.subarray(0, 8))).toEqual([0, 1, 0.25, 1, 0.25, 0.75, 0, 0.75]);
    expect(Array.from(a.uvs.subarray(8, 16))).toEqual([0.25, 0.75, 0.5, 0.75, 0.5, 0.5, 0.25, 0.5]);
    const [u0, v0, u1, v1] = atlasCellUv(0, { columns: 4, rows: 4, insetTexels: 0.5 });
    expect(u0).toBeCloseTo(0.5 / 128);
    expect(u1).toBeCloseTo(31.5 / 128);
    expect(v1).toBeCloseTo(1 - 0.5 / 128);
    expect(v0).toBeCloseTo(1 - 31.5 / 128);
    expect(() => atlasCellUv(16, ATLAS)).toThrow(RangeError);
  });

  it("faces +Y (counter-clockwise seen from above)", () => {
    const tiles = new Uint8Array(256);
    tiles[0] = 1;
    const g = buildTileChunk({ width: 16, height: 16, tiles }, 0, 0, ATLAS);
    const p = g.getAttribute("position");
    const idx = g.index!;
    const v = (i: number) => [p.getX(idx.getX(i)), p.getY(idx.getX(i)), p.getZ(idx.getX(i))] as const;
    for (const t of [0, 3]) {
      const [a, b, c] = [v(t), v(t + 1), v(t + 2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      expect(ny).toBeGreaterThan(0);
    }
  });

  it("lines up borders: adjacent chunks share exact edge coordinates", () => {
    const layer: TileLayer = { width: 32, height: 32, tiles: new Uint8Array(32 * 32).fill(1) };
    const xs = (cx: number, cz: number) => {
      const a = buildTileChunkArrays(layer, cx, cz, ATLAS);
      const pts = new Set<string>();
      for (let i = 0; i < a.positions.length; i += 3) pts.add(`${a.positions[i]},${a.positions[i + 2]}`);
      return pts;
    };
    const left = xs(0, 0);
    const right = xs(1, 0);
    const below = xs(0, 1);
    for (let z = 0; z <= CHUNK_SIZE; z++) {
      expect(left.has(`${CHUNK_SIZE},${z}`)).toBe(true);
      expect(right.has(`${CHUNK_SIZE},${z}`)).toBe(true);
    }
    for (let x = 0; x <= CHUNK_SIZE; x++) {
      expect(left.has(`${x},${CHUNK_SIZE}`)).toBe(true);
      expect(below.has(`${x},${CHUNK_SIZE}`)).toBe(true);
    }
    // No gap and no overlap: the right chunk starts exactly where the left one ends.
    expect(Math.max(...[...left].map((k) => Number(k.split(",")[0])))).toBe(CHUNK_SIZE);
    expect(Math.min(...[...right].map((k) => Number(k.split(",")[0])))).toBe(CHUNK_SIZE);
  });

  it("covers the spike map (48x32, 2 layers) with 3x2 chunks and no empty ground tile", () => {
    const { ground, details } = buildTilemap();
    expect(chunkCount(ground)).toEqual({ x: 3, z: 2 });
    let groundTiles = 0;
    let detailTiles = 0;
    for (let cz = 0; cz < 2; cz++) {
      for (let cx = 0; cx < 3; cx++) {
        groundTiles += buildTileChunkArrays(ground, cx, cz, ATLAS).tileCount;
        detailTiles += buildTileChunkArrays(details, cx, cz, ATLAS).tileCount;
      }
    }
    expect(groundTiles).toBe(MAP_W * MAP_H);
    expect(detailTiles).toBeGreaterThan(0);
    expect(detailTiles).toBeLessThan(MAP_W * MAP_H);
  });
});
