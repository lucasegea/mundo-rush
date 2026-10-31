// scripts/assets/bake-trees.ts: bakes the open world's trees (open-world-3d T7, PD-3, D-829, D-830). Runs the
// vendored copy of ez-tree 1.1.0 (tooling/vendor/ez-tree, MIT) in Node, with the mockup V6's fixed presets and seeds
// (scripts/assets/tree-presets.ts), for each TREE_SPECIES species of @lg/art in its full version and in the
// light one (mockup `liteCfg`), and writes each tree with our deterministic writer (glb-write.ts): one primitive with
// POSITION, NORMAL, TEXCOORD_0 and COLOR_0, no material, no texture, no image. The client never runs ez-tree: it downloads these
// .glb files (apps/web/public/models/generated/trees/) and paints them with the `follaje` material (leaf and bark .ktx2, PD-9).
//
// What changes with respect to ez-tree's geometry (the port of the mockup's `ezTree()`, world.js:1272):
//   · scaled to the species height; leaf normals pointing out of the crown (soft shading)
//   · UV in the mockup's atlas: bark at (u · 0.5, 0.12) and leaves at (0.75 · u, 0.25 + 0.75 · v); world/'s material
//     samples the bark below v = 0.25 and the leaf above (two .ktx2, without composing a canvas)
//   · COLOR_0: bark 0xcdbba4 darkened toward the base, leaves from `low` to `high` by height with a tint per leaf; the
//     leaves' gain (TREE_LEAF_GAIN) is applied by the material, so COLOR_0 stays in [0, 1]
//
// ez-tree is loaded with a dynamic import() by path: no file under apps/ or packages/ (nor a static import from here)
// names it, and eslint's ADR-026 rule (the product does not import tooling/) stays without exception.
//
//   node scripts/assets/bake-trees.ts           writes the missing or changed .glb files and lists sha256 and triangles
//   node scripts/assets/bake-trees.ts --check   bakes in memory and compares with the versioned files (exits 1 if it differs)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Color, type BufferGeometry, type Mesh } from "three";
import { hash2, TREE_BARK_COLOR, TREE_SPECIES, treeFile, type TreeSpecies } from "@lg/art";
import { writeGlb } from "./glb-write.ts";
import { TREE_PRESETS, type TreePreset } from "./tree-presets.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BAKE_SCRIPT = "scripts/assets/bake-trees.ts";
export const EZ_TREE = "tooling/vendor/ez-tree/tree.js";

interface EzTree {
  loadFromJson(json: unknown): void;
  branchesMesh: Mesh;
  leavesMesh: Mesh;
}
type EzTreeCtor = new () => EzTree;

let ctor: EzTreeCtor | null = null;
async function loadEzTree(root = ROOT): Promise<EzTreeCtor> {
  ctor ??= ((await import(pathToFileURL(join(root, EZ_TREE)).href)) as { Tree: EzTreeCtor }).Tree;
  return ctor;
}

/**
 * Fraction of leaves of the light version. The mockup's is 0.42; with it the poplar and the two shrubs end up at 38 to
 * 42 % of the full version's triangles and AC43 asks for 35 % at most: those drop to 0.3 (the remaining leaves grow in
 * proportion, so the crown covers the same). Recorded deviation from the mockup's `liteCfg`.
 */
export const LIGHT_LEAF_SHARE: Readonly<Record<string, number>> = { aspen: 0.3, bushA: 0.3, bushB: 0.3 };
/** The poplar has 2 leaves per twig anyway (the minimum): in its light version the trunk opens 3 branches instead of 5 (with 4 it stays at 35.5 %). */
export const LIGHT_TRUNK_CHILDREN: Readonly<Record<string, number>> = { aspen: 3 };
const MOCKUP_LEAF_SHARE = 0.42;

/** The mockup's light version (`liteCfg`): 40 % of the sections, 3 to 4 sides, 60 % of the twigs, 42 % of the leaves. */
export function lightPreset(p: TreePreset, name = ""): TreePreset {
  const share = LIGHT_LEAF_SHARE[name] ?? MOCKUP_LEAF_SHARE;
  const c = structuredClone(p);
  for (const k of Object.keys(c.branch.sections)) c.branch.sections[k] = Math.max(2, Math.round((c.branch.sections[k] as number) * 0.4));
  for (const k of Object.keys(c.branch.segments)) c.branch.segments[k] = k === "0" ? 4 : 3;
  const last = String(c.branch.levels - 1);
  c.branch.children[last] = Math.max(2, Math.round((c.branch.children[last] as number) * 0.6));
  const trunk = LIGHT_TRUNK_CHILDREN[name];
  if (trunk !== undefined) c.branch.children["0"] = trunk;
  c.leaves.count = Math.max(2, Math.round(c.leaves.count * share));
  c.leaves.size *= (c.branch.levels === 1 ? 1.75 : 1.45) * Math.sqrt(MOCKUP_LEAF_SHARE / share);
  return c;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface BakedTree {
  species: TreeSpecies;
  light: boolean;
  file: string;
  preset: string;
  seed: number;
  glb: Uint8Array;
  triangles: number;
  vertices: number;
}

/** A tree: ez-tree's geometry with the preset, converted to the pipeline's attributes (port of `ezTree()`). */
export async function bakeTree(species: TreeSpecies, light: boolean, root = ROOT): Promise<BakedTree> {
  const Tree = await loadEzTree(root);
  const base = TREE_PRESETS[species.name];
  if (!base) throw new Error(`bake-trees: no hay preset "${species.name}"`);
  const preset = light ? lightPreset(base, species.name) : structuredClone(base);
  const t = new Tree();
  t.loadFromJson(preset);
  const bg = t.branchesMesh.geometry as BufferGeometry;
  const lg = t.leavesMesh.geometry as BufferGeometry;
  const bp = bg.getAttribute("position");
  const bn = bg.getAttribute("normal");
  const bu = bg.getAttribute("uv");
  const lp = lg.getAttribute("position");
  const lu = lg.getAttribute("uv");
  const bi = bg.getIndex();
  const li = lg.getIndex();
  if (!bi || !li) throw new Error(`bake-trees: ${species.name}: ez-tree sin índices`);
  let maxY = 0;
  for (let i = 0; i < bp.count; i++) maxY = Math.max(maxY, bp.getY(i));
  for (let i = 0; i < lp.count; i++) maxY = Math.max(maxY, lp.getY(i));
  const H = species.height;
  const s = H / maxY;
  const nB = bp.count;
  const nL = lp.count;
  const n = nB + nL;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  // Center of the crown (average of the leaf vertices, in ez-tree units).
  let ccx = 0;
  let ccy = 0;
  let ccz = 0;
  for (let i = 0; i < nL; i++) {
    ccx += lp.getX(i);
    ccy += lp.getY(i);
    ccz += lp.getZ(i);
  }
  const kc = 1 / Math.max(1, nL);
  ccx *= kc;
  ccy *= kc;
  ccz *= kc;
  const bark = new Color(TREE_BARK_COLOR);
  const cl = new Color(species.low);
  const ch = new Color(species.high);
  const tmp = new Color();
  for (let i = 0; i < nB; i++) {
    pos[i * 3] = bp.getX(i) * s;
    pos[i * 3 + 1] = bp.getY(i) * s;
    pos[i * 3 + 2] = bp.getZ(i) * s;
    nor[i * 3] = bn.getX(i);
    nor[i * 3 + 1] = bn.getY(i);
    nor[i * 3 + 2] = bn.getZ(i);
    uv[i * 2] = bu.getX(i) * 0.5;
    uv[i * 2 + 1] = 0.12;
    const k = 0.55 + 0.3 * smooth(0, H, pos[i * 3 + 1] as number);
    col[i * 3] = bark.r * k;
    col[i * 3 + 1] = bark.g * k;
    col[i * 3 + 2] = bark.b * k;
  }
  for (let i = 0; i < nL; i++) {
    const o = nB + i;
    const y = lp.getY(i) * s;
    pos[o * 3] = lp.getX(i) * s;
    pos[o * 3 + 1] = y;
    pos[o * 3 + 2] = lp.getZ(i) * s;
    let vx = lp.getX(i) - ccx;
    let vy = (lp.getY(i) - ccy) * 0.8;
    let vz = lp.getZ(i) - ccz;
    let l = Math.hypot(vx, vy, vz) || 1;
    vx /= l;
    vy = vy / l + 0.3;
    vz /= l;
    l = Math.hypot(vx, vy, vz) || 1;
    nor[o * 3] = vx / l;
    nor[o * 3 + 1] = vy / l;
    nor[o * 3 + 2] = vz / l;
    uv[o * 2] = lu.getX(i) * 0.75;
    uv[o * 2 + 1] = 0.25 + lu.getY(i) * 0.75;
    const r = hash2(i >> 2, Math.round(species.tintSeed * 1000), 21);
    const h = smooth(0.1, 0.95, y / H);
    tmp.copy(cl).lerp(ch, h * (0.6 + 0.4 * r)).multiplyScalar(0.8 + 0.4 * r);
    col[o * 3] = Math.min(1, tmp.r);
    col[o * 3 + 1] = Math.min(1, tmp.g);
    col[o * 3 + 2] = Math.min(1, tmp.b);
  }
  const ni = bi.count + li.count;
  const idx = n > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  for (let i = 0; i < bi.count; i++) idx[i] = bi.getX(i);
  for (let i = 0; i < li.count; i++) idx[bi.count + i] = li.getX(i) + nB;
  bg.dispose();
  lg.dispose();
  const name = `${species.file}${light ? "-liviano" : ""}`;
  const glb = writeGlb([{ name, primitives: [{ attributes: { POSITION: pos, NORMAL: nor, TEXCOORD_0: uv, COLOR_0: col }, indices: idx }] }]);
  return { species, light, file: treeFile(species, light), preset: species.name + (light ? " (liviano)" : ""), seed: (preset as { seed?: number }).seed ?? 0, glb, triangles: ni / 3, vertices: n };
}

/** All the trees: each species full and light, in TREE_SPECIES order. */
export async function bakeAll(root = ROOT): Promise<BakedTree[]> {
  const out: BakedTree[] = [];
  for (const sp of TREE_SPECIES) for (const light of [false, true]) out.push(await bakeTree(sp, light, root));
  return out;
}

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

export async function run(argv: readonly string[] = process.argv.slice(2), log: (s: string) => void = console.log, root = ROOT): Promise<number> {
  const check = argv.includes("--check");
  const trees = await bakeAll(root);
  let ok = true;
  for (const t of trees) {
    const abs = join(root, t.file);
    const same = existsSync(abs) && sha256(new Uint8Array(readFileSync(abs))) === sha256(t.glb);
    if (check) {
      if (!same) ok = false;
    } else if (!same) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, t.glb);
    }
    log(`${check ? (same ? "MATCH " : "DIFF  ") : ""}${t.file} ${t.glb.byteLength} bytes, ${t.triangles} triángulos, ${t.vertices} vértices, sha256 ${sha256(t.glb)} (preset ${t.preset}, semilla ${t.seed})`);
  }
  log(`generador ${BAKE_SCRIPT} sha256 ${sha256(new Uint8Array(readFileSync(join(root, BAKE_SCRIPT))))}`);
  return ok ? 0 : 1;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = await run();
}
