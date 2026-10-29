// scripts/assets/glb-write.ts: escritor mínimo y determinístico de .glb (open-world-3d T7, D-830, PD-3). Lo usa
// scripts/assets/bake-trees.ts para los árboles horneados en lugar de `GLTFExporter` de three, que en Node 22 no corre
// (usa `FileReader`, que Node no tiene) y además escribe un `generator` con versión. Acá no hay polyfill ni dependencia:
//   · un chunk JSON y un chunk BIN, cada uno rellenado a 4 bytes (JSON con espacios, BIN con ceros)
//   · las claves del JSON en un orden fijo (las escribe este archivo, no `JSON.stringify` de un objeto armado a mano en
//     otro lado), sin fecha, sin `generator` con versión: los mismos datos dan los mismos bytes
//   · una malla por nodo, primitivas de triángulos indexadas, sin material, sin textura, sin imagen (las piezas del
//     pipeline: inspect-budgets falla una pieza con material o textura, D-829)
//   · atributos en el orden POSITION, NORMAL, TEXCOORD_0, COLOR_0 (los que haya), cada uno en su bufferView
// El lector de inspect-budgets (gltf-transform) lo lee de vuelta; glb-write.test.ts lo prueba.

/** Los atributos que puede llevar una primitiva y su tipo glTF (componentes float, sin normalizar). */
export const GLB_ATTRIBUTES = { POSITION: "VEC3", NORMAL: "VEC3", TEXCOORD_0: "VEC2", COLOR_0: "VEC3" } as const;
export type GlbAttribute = keyof typeof GLB_ATTRIBUTES;
const ORDER = Object.keys(GLB_ATTRIBUTES) as GlbAttribute[];
const SIZE: Readonly<Record<string, number>> = { VEC2: 2, VEC3: 3 };

export interface GlbPrimitive {
  attributes: Partial<Record<GlbAttribute, Float32Array>> & { POSITION: Float32Array };
  indices: Uint16Array | Uint32Array;
}

export interface GlbMesh {
  name: string;
  primitives: readonly GlbPrimitive[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const pad4 = (n: number): number => (n + 3) & ~3;

/** Un número en el JSON: los enteros tal cual, los float con la representación más corta de JS (estable). */
const num = (v: number): string => {
  if (!Number.isFinite(v)) throw new Error(`glb-write: valor no finito ${v}`);
  return Object.is(v, -0) ? "0" : String(v);
};
const arr = (a: readonly number[]): string => `[${a.map(num).join(",")}]`;
const str = (s: string): string => JSON.stringify(s);

/** Mínimo y máximo por componente (glTF los exige en POSITION). */
function bounds(data: Float32Array, size: number): { min: number[]; max: number[] } {
  const min = new Array<number>(size).fill(Infinity);
  const max = new Array<number>(size).fill(-Infinity);
  for (let i = 0; i < data.length; i++) {
    const k = i % size;
    const v = data[i] as number;
    if (v < (min[k] as number)) min[k] = v;
    if (v > (max[k] as number)) max[k] = v;
  }
  return { min: min.map((v) => Math.fround(v)), max: max.map((v) => Math.fround(v)) };
}

/** Escribe las mallas como un .glb (un nodo por malla, en el orden dado). */
export function writeGlb(meshes: readonly GlbMesh[]): Uint8Array {
  const views: { offset: number; length: number; target: number }[] = [];
  const accessors: string[] = [];
  const chunks: Uint8Array[] = [];
  let bin = 0;
  const pushView = (bytes: Uint8Array, target: number): number => {
    const offset = bin;
    chunks.push(bytes);
    const padded = pad4(bytes.byteLength);
    if (padded > bytes.byteLength) chunks.push(new Uint8Array(padded - bytes.byteLength));
    bin += padded;
    views.push({ offset, length: bytes.byteLength, target });
    return views.length - 1;
  };
  const meshJson: string[] = [];
  for (const mesh of meshes) {
    const prims: string[] = [];
    for (const p of mesh.primitives) {
      const count = p.attributes.POSITION.length / 3;
      if (!Number.isInteger(count) || count === 0) throw new Error(`glb-write: ${mesh.name}: POSITION vacío o no múltiplo de 3`);
      const attrs: string[] = [];
      for (const name of ORDER) {
        const data = p.attributes[name];
        if (!data) continue;
        const type = GLB_ATTRIBUTES[name];
        const size = SIZE[type] as number;
        if (data.length !== count * size) throw new Error(`glb-write: ${mesh.name}: ${name} tiene ${data.length / size} vértices, POSITION ${count}`);
        const view = pushView(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ARRAY_BUFFER);
        const mm = name === "POSITION" ? bounds(data, size) : null;
        accessors.push(`{"bufferView":${view},"componentType":${FLOAT},"count":${count},"type":${str(type)}${mm ? `,"min":${arr(mm.min)},"max":${arr(mm.max)}` : ""}}`);
        attrs.push(`${str(name)}:${accessors.length - 1}`);
      }
      if (p.indices.length % 3 !== 0) throw new Error(`glb-write: ${mesh.name}: índices no múltiplo de 3`);
      for (const i of p.indices) if (i >= count) throw new Error(`glb-write: ${mesh.name}: índice ${i} fuera de ${count} vértices`);
      const idxView = pushView(new Uint8Array(p.indices.buffer, p.indices.byteOffset, p.indices.byteLength), ELEMENT_ARRAY_BUFFER);
      const ctype = p.indices instanceof Uint16Array ? UNSIGNED_SHORT : UNSIGNED_INT;
      accessors.push(`{"bufferView":${idxView},"componentType":${ctype},"count":${p.indices.length},"type":"SCALAR"}`);
      prims.push(`{"attributes":{${attrs.join(",")}},"indices":${accessors.length - 1},"mode":4}`);
    }
    meshJson.push(`{"name":${str(mesh.name)},"primitives":[${prims.join(",")}]}`);
  }
  const nodes = meshes.map((m, i) => `{"name":${str(m.name)},"mesh":${i}}`);
  const json = [
    `{"asset":{"version":"2.0","generator":"learning-game scripts/assets/glb-write.ts"}`,
    `,"scene":0,"scenes":[{"nodes":${arr(meshes.map((_, i) => i))}}]`,
    `,"nodes":[${nodes.join(",")}]`,
    `,"meshes":[${meshJson.join(",")}]`,
    `,"accessors":[${accessors.join(",")}]`,
    `,"bufferViews":[${views.map((v) => `{"buffer":0,"byteOffset":${v.offset},"byteLength":${v.length},"target":${v.target}}`).join(",")}]`,
    `,"buffers":[{"byteLength":${bin}}]}`,
  ].join("");
  const jsonBytes = new TextEncoder().encode(json);
  const jsonLen = pad4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLen + 8 + bin;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLen);
  let o = 20 + jsonLen;
  dv.setUint32(o, bin, true);
  dv.setUint32(o + 4, CHUNK_BIN, true);
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Lee la cabecera y los dos chunks (para los tests y para comprobar lo escrito). */
export function readGlbChunks(glb: Uint8Array): { version: number; length: number; json: Record<string, unknown>; jsonLength: number; binLength: number } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("glb-write: no es un .glb (magic)");
  const jsonLength = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new Error("glb-write: el primer chunk no es JSON");
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  const b = 20 + jsonLength;
  const binLength = dv.getUint32(b, true);
  if (dv.getUint32(b + 4, true) !== CHUNK_BIN) throw new Error("glb-write: el segundo chunk no es BIN");
  return { version: dv.getUint32(4, true), length: dv.getUint32(8, true), json, jsonLength, binLength };
}
