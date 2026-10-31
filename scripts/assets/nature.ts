// scripts/assets/nature.ts: the open world's maps and rocks that are not the ground (open-world-3d T7, D-829, PD-9,
// D-832). Everything comes from CC0 Poly Haven originals downloaded into assets-src/polyhaven/models/ (gitignored) and verified by
// sha256, with the same pinned basisu of ktx2.ts and the glTF pipeline of optimize.ts (gltf-transform and meshoptimizer, already
// dependencies); nothing new is installed. The derived files are versioned and content/assets-registry.yaml has one row per file.
//
//   · leaf (`hoja-diff.ktx2`, 512, ETC1S with alpha): the mockup V6's crop of the jacaranda leaf (680 × 370 from
//     x 330), alpha = (max(r, g, b) − 22) · 10 (the original's background is black) and "contain" in 512 × 512
//   · bark (`corteza-diff.ktx2`, 512): the jacaranda trunk halved (the mockup's "cover" in a square)
//   · rocks (`rocas-diff.ktx2` and `rocas-nor.ktx2`, 1024): a 2 × 2 atlas with the four scans at 512 (ROCK_SCANS from
//     @lg/art in order: top left rock_07, right rock_09, bottom rock_moss_set_01 and rock_face_01). A single
//     material per band for all rocks (AC71: toon at most 4), each rock's UV goes to its quarter
//   · rocks (`models/polyhaven/<scan>.glb` and `-lejos.glb`): the 1k glTF without materials or textures, weld, meshopt
//     simplify to the mockup's target (near and far), each mesh centered with the base at y = 0 and the larger horizontal side
//     of 1 m (world/ scales it), white COLOR_0, UV to the atlas quarter, meshopt (optimize.ts's rules, D-829)
//
//   node scripts/assets/nature.ts           downloads what is missing, derives and writes what changed
//   node scripts/assets/nature.ts --check   derives everything in memory and compares with the versioned files (exits 1 if it differs)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Document, type JSONDocument } from "@gltf-transform/core";
import { dedup, flatten, meshopt, prune, simplify, transformMesh, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { NATURE_TEXTURES, ROCK_SCANS, rockFile, type RockScan } from "@lg/art";
import { encodeKtx2, fetchBytes, loadEncoder, type MapKind } from "./ktx2.ts";
import { crearIO } from "./optimize.ts";
import { codificarPng, decodificarPng, type Imagen } from "./png.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PH = "https://dl.polyhaven.org/file/ph-assets/Models";
export const NATURE_CACHE = "assets-src/polyhaven/models";

/** An original: url and the name in the cache. */
export interface Original {
  url: string;
  file: string;
}
const png = (asset: string, map: string): Original => ({ url: `${PH}/png/1k/${asset}/${asset}_${map}_1k.png`, file: `${asset}_${map}_1k.png` });
export const LEAF_SOURCE = png("jacaranda_tree", "leaves_diff");
export const BARK_SOURCE = png("jacaranda_tree", "trunk_diff");
export const rockMap = (scan: RockScan, kind: MapKind): Original => png(scan, kind === "diff" ? "diff" : "nor_gl");
export const rockGltf = (scan: RockScan): Original => ({ url: `${PH}/gltf/1k/${scan}/${scan}_1k.gltf`, file: `${scan}_1k.gltf` });
/** Poly Haven serves the .bin of any resolution from the 8k folder (its API gives it that way in `include`). */
export const rockBin = (scan: RockScan): Original => ({ url: `${PH}/gltf/8k/${scan}/${scan}.bin`, file: `${scan}.bin` });

export const LEAF_FILE = NATURE_TEXTURES.leaf;
export const BARK_FILE = NATURE_TEXTURES.bark;
export const rockAtlasFile = (kind: MapKind): string => (kind === "diff" ? NATURE_TEXTURES.rockDiff : NATURE_TEXTURES.rockNor);
/** Side of the leaf, the bark and each quarter of the rock atlas. */
export const NATURE_PX = { leaf: 512, bark: 512, rockCell: 512 } as const;
/** Crop of the leaf in the 1024 original (mockup `derive-assets.mjs`). */
export const LEAF_CROP = { left: 330, top: 0, width: 680, height: 370 } as const;

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** Area reduction (coverage-weighted average): deterministic and dependency-free. */
export function resizeArea(src: Imagen, w: number, h: number, crop = { left: 0, top: 0, width: src.ancho, height: src.alto }): Imagen {
  const out = new Uint8Array(w * h * 4);
  const sx = crop.width / w;
  const sy = crop.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = crop.top + y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = crop.left + x * sx;
      const x1 = x0 + sx;
      const acc = [0, 0, 0, 0];
      let wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const k = (yy * src.ancho + xx) * 4;
          const wgt = wx * wy;
          for (let c = 0; c < 4; c++) acc[c] = (acc[c] as number) + (src.rgba[k + c] as number) * wgt;
          wsum += wgt;
        }
      }
      for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = Math.round((acc[c] as number) / wsum);
    }
  }
  return { ancho: w, alto: h, rgba: out };
}

/** The leaf: crop, alpha by luminance of the black background, "contain" in a transparent square (mockup V6). */
export function deriveLeaf(source: Uint8Array): Uint8Array {
  const img = decodificarPng(source);
  const keyed = new Uint8Array(img.rgba);
  for (let i = 0; i < img.ancho * img.alto; i++) {
    const m = Math.max(keyed[i * 4] as number, keyed[i * 4 + 1] as number, keyed[i * 4 + 2] as number);
    keyed[i * 4 + 3] = Math.max(0, Math.min(255, (m - 22) * 10));
  }
  const S = NATURE_PX.leaf;
  const k = Math.min(S / LEAF_CROP.width, S / LEAF_CROP.height);
  const w = Math.round(LEAF_CROP.width * k);
  const h = Math.round(LEAF_CROP.height * k);
  const small = resizeArea({ ...img, rgba: keyed }, w, h, LEAF_CROP);
  const out = new Uint8Array(S * S * 4);
  const ox = Math.floor((S - w) / 2);
  const oy = Math.floor((S - h) / 2);
  for (let y = 0; y < h; y++) out.set(small.rgba.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * S + ox) * 4);
  return codificarPng({ ancho: S, alto: S, rgba: out });
}

/** The bark: the trunk at 512 (the original is square: the mockup's "cover" is a downscale). */
export function deriveBark(source: Uint8Array): Uint8Array {
  return codificarPng(resizeArea(decodificarPng(source), NATURE_PX.bark, NATURE_PX.bark));
}

/** architecture review quarter of each scan (column, row; row 0 on top = glTF v in [0, 0.5)). */
export const rockCell = (i: number): [number, number] => [i % 2, Math.floor(i / 2)];

/** The 2 × 2 atlas of the four scans (diffuse or normals) in ROCK_SCANS order. */
export function deriveRockAtlas(sources: readonly Uint8Array[]): Uint8Array {
  const C = NATURE_PX.rockCell;
  const S = C * 2;
  const out = new Uint8Array(S * S * 4);
  sources.forEach((src, i) => {
    const small = resizeArea(decodificarPng(src), C, C);
    const [cx, cy] = rockCell(i);
    for (let y = 0; y < C; y++) out.set(small.rgba.subarray(y * C * 4, (y + 1) * C * 4), ((cy * C + y) * S + cx * C) * 4);
  });
  return codificarPng({ ancho: S, alto: S, rgba: out });
}

/** Poly Haven's 1k glTF without images, textures or materials (not downloaded: the atlas is separate). */
function geometryOnly(gltf: Uint8Array): JSONDocument["json"] {
  const j = JSON.parse(new TextDecoder().decode(gltf)) as JSONDocument["json"];
  delete j.images;
  delete j.textures;
  delete j.samplers;
  delete j.materials;
  for (const m of j.meshes ?? []) for (const p of m.primitives) delete p.material;
  return j;
}

export interface RockGlb {
  glb: Uint8Array;
  triangles: number;
  meshes: number;
}

/** A scan as a pipeline .glb (see the header). `index` is its place in ROCK_SCANS (the atlas quarter). */
export async function deriveRock(gltf: Uint8Array, bin: Uint8Array, index: number, target: number): Promise<RockGlb> {
  const io = await crearIO();
  const json = geometryOnly(gltf);
  const uri = (json.buffers?.[0]?.uri ?? "") as string;
  const doc: Document = await io.readJSON({ json, resources: { [uri]: new Uint8Array(bin) } });
  const root = doc.getRoot();
  await doc.transform(flatten());
  // The nodes' transforms into the vertices (each mesh of a set stays in its place in the set and recenters itself).
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    transformMesh(mesh, node.getWorldMatrix());
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  const tris = (): number => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  await MeshoptSimplifier.ready;
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / tris()), error: 0.08, lockBorder: false }));
  const [cx, cy] = rockCell(index);
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  for (const mesh of root.listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute("POSITION");
      const uv = p.getAttribute("TEXCOORD_0");
      if (!pos || !uv) throw new Error(`nature: una malla de roca sin POSITION o TEXCOORD_0`);
      const P = pos.getArray() as Float32Array;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < P.length; i += 3) {
        minX = Math.min(minX, P[i] as number); maxX = Math.max(maxX, P[i] as number);
        minY = Math.min(minY, P[i + 1] as number);
        minZ = Math.min(minZ, P[i + 2] as number); maxZ = Math.max(maxZ, P[i + 2] as number);
      }
      const k = 1 / Math.max(maxX - minX, maxZ - minZ);
      const ox = (minX + maxX) / 2;
      const oz = (minZ + maxZ) / 2;
      const out = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) {
        out[i] = ((P[i] as number) - ox) * k;
        out[i + 1] = ((P[i + 1] as number) - minY) * k;
        out[i + 2] = ((P[i + 2] as number) - oz) * k;
      }
      pos.setArray(out);
      const U = uv.getArray() as Float32Array;
      const remap = new Float32Array(U.length);
      const frac = (t: number): number => Math.min(0.999, Math.max(0.001, t - Math.floor(t)));
      for (let i = 0; i < U.length; i += 2) {
        remap[i] = (frac(U[i] as number) + cx) / 2;
        remap[i + 1] = (frac(U[i + 1] as number) + cy) / 2;
      }
      uv.setArray(remap);
      for (const sem of p.listSemantics()) if (!["POSITION", "NORMAL", "TEXCOORD_0"].includes(sem)) p.setAttribute(sem, null);
      p.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos.getCount() * 3).fill(1)).setBuffer(buffer));
    }
  }
  await doc.transform(prune({ keepLeaves: false }), dedup(), meshopt({ encoder: MeshoptEncoder }));
  const glb = await io.writeBinary(doc);
  return { glb, triangles: tris(), meshes: root.listMeshes().length };
}

/** An original from the cache or downloaded (unverified: the sha256 is compared by the registry, in refetch and in the test). */
export async function loadOriginal(o: Original, root = ROOT): Promise<Uint8Array> {
  const abs = join(root, NATURE_CACHE, o.file);
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, await fetchBytes(o.url));
  }
  return new Uint8Array(readFileSync(abs));
}

export interface Derived {
  bytes: Uint8Array;
  triangles?: number;
  primitives?: number;
}

/** A file of this script: its originals and how to derive it (refetch.ts rebuilds one alone with the downloaded originals). */
export interface NatureJob {
  file: string;
  sources: Original[];
  make(root: string, encoder: Uint8Array): Promise<Derived>;
}

const ktx2Job = (file: string, sources: Original[], kind: MapKind, px: number, derive: (src: Uint8Array[]) => Uint8Array): NatureJob => ({
  file,
  sources,
  make: async (root, enc) => ({ bytes: await encodeKtx2(derive(await Promise.all(sources.map((s) => loadOriginal(s, root)))), kind, enc, px, { ext: "png", targetPx: px }) }),
});

/** Everything in this script, in the order of the registry rows. */
export const NATURE_JOBS: readonly NatureJob[] = [
  ktx2Job(LEAF_FILE, [LEAF_SOURCE], "diff", NATURE_PX.leaf, ([s]) => deriveLeaf(s as Uint8Array)),
  ktx2Job(BARK_FILE, [BARK_SOURCE], "diff", NATURE_PX.bark, ([s]) => deriveBark(s as Uint8Array)),
  ...(["diff", "nor"] as const).map((kind) => ktx2Job(rockAtlasFile(kind), ROCK_SCANS.map((r) => rockMap(r.scan, kind)), kind, NATURE_PX.rockCell * 2, deriveRockAtlas)),
  ...ROCK_SCANS.flatMap((r, i) => [false, true].map((far): NatureJob => ({
    file: rockFile(r.scan, far),
    sources: [rockGltf(r.scan), rockBin(r.scan)],
    make: async (root) => {
      const g = await deriveRock(await loadOriginal(rockGltf(r.scan), root), await loadOriginal(rockBin(r.scan), root), i, far ? r.far : r.near);
      return { bytes: g.glb, triangles: g.triangles, primitives: g.meshes };
    },
  }))),
];

export const natureJob = (file: string): NatureJob | undefined => NATURE_JOBS.find((j) => j.file === file);

export async function run(argv: readonly string[] = process.argv.slice(2), log: (s: string) => void = console.log, root = ROOT): Promise<number> {
  const check = argv.includes("--check");
  let ok = true;
  const enc = await loadEncoder(root);
  for (const job of NATURE_JOBS) {
    const d = { ...(await job.make(root, enc)), file: job.file, sources: job.sources };
    const abs = join(root, d.file);
    const same = existsSync(abs) && sha256(new Uint8Array(readFileSync(abs))) === sha256(d.bytes);
    if (check && !same) ok = false;
    if (!check && !same) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, d.bytes);
    }
    const src = await Promise.all(d.sources.map(async (s) => `${s.url} ${sha256(await loadOriginal(s, root))}`));
    log(`${check ? (same ? "MATCH " : "DIFF  ") : ""}${d.file} ${d.bytes.byteLength} bytes sha256 ${sha256(d.bytes)}${d.triangles !== undefined ? ` ${d.triangles} triángulos ${d.primitives} primitiva(s)` : ""} <- ${src.join(" + ")}`);
  }
  return ok ? 0 : 1;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = await run();
}
