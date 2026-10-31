// Open-world-3d T7 (AC43): the own .glb writer. Header (magic and version 2), JSON and BIN chunks of length a multiple
// of 4, JSON keys in fixed order, no date or version in `generator`, the same data gives the same bytes, and what is
// written, read by inspect-budgets's reader (gltf-transform), gives the geometry's triangles and primitives.
import { describe, expect, test } from "vitest";
import { GLB_ATTRIBUTES, readGlbChunks, writeGlb, type GlbMesh } from "./glb-write.ts";
import { medirPieza } from "./inspect-budgets.ts";

/** A quad (2 triangles) and a triangle, in two meshes; with all attributes. */
const fixture = (): GlbMesh[] => [
  {
    name: "quad",
    primitives: [{
      attributes: {
        POSITION: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        NORMAL: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        TEXCOORD_0: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
        COLOR_0: Float32Array.from([1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      },
      indices: Uint16Array.from([0, 1, 2, 0, 2, 3]),
    }],
  },
  {
    name: "tri",
    primitives: [{
      attributes: { POSITION: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]), COLOR_0: Float32Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]) },
      indices: Uint32Array.from([0, 2, 1]),
    }],
  },
];

describe("glb-write (AC43)", () => {
  test("cabecera y chunks: magic glTF, versión 2, largos múltiplos de 4 que suman el total", () => {
    const glb = writeGlb(fixture());
    const c = readGlbChunks(glb);
    expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe("glTF");
    expect(c.version).toBe(2);
    expect(c.length).toBe(glb.byteLength);
    expect(c.jsonLength % 4).toBe(0);
    expect(c.binLength % 4).toBe(0);
    expect(12 + 8 + c.jsonLength + 8 + c.binLength).toBe(glb.byteLength);
  });

  test("claves del JSON en orden fijo, sin fecha ni versión en el generador; los mismos datos dan los mismos bytes", () => {
    const glb = writeGlb(fixture());
    const { json } = readGlbChunks(glb);
    expect(Object.keys(json)).toEqual(["asset", "scene", "scenes", "nodes", "meshes", "accessors", "bufferViews", "buffers"]);
    expect(json["asset"]).toEqual({ version: "2.0", generator: "learning-game scripts/assets/glb-write.ts" });
    const text = new TextDecoder().decode(glb.subarray(20, 20 + readGlbChunks(glb).jsonLength));
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|\bdate\b|\btime\b/i);
    const meshes = json["meshes"] as { primitives: { attributes: Record<string, number> }[] }[];
    expect(Object.keys(meshes[0]?.primitives[0]?.attributes ?? {})).toEqual(Object.keys(GLB_ATTRIBUTES));
    expect(Object.keys(meshes[1]?.primitives[0]?.attributes ?? {})).toEqual(["POSITION", "COLOR_0"]);
    expect([...writeGlb(fixture())]).toEqual([...glb]);
  });

  test("leído por el lector de inspect-budgets: los triángulos y primitivas de la geometría, sin material ni textura", async () => {
    const m = await medirPieza("fixture.glb", writeGlb(fixture()));
    expect(m).toMatchObject({ triangulos: 3, primitivas: 2, materiales: 0, texturas: 0, conColor: true });
  });

  test("rechaza índices fuera de rango y atributos de otro largo", () => {
    const bad = fixture();
    (bad[1]?.primitives[0] as { indices: Uint32Array }).indices = Uint32Array.from([0, 1, 9]);
    expect(() => writeGlb(bad)).toThrow(/índice 9 fuera de 3 vértices/);
    const short = fixture();
    (short[0]?.primitives[0]?.attributes as { NORMAL: Float32Array }).NORMAL = new Float32Array(3);
    expect(() => writeGlb(short)).toThrow(/NORMAL tiene 1 vértices, POSITION 4/);
  });
});
