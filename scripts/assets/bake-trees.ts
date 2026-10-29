// scripts/assets/bake-trees.ts: hornea los árboles del mundo abierto (open-world-3d T7, PD-3, D-829, D-830). Corre la
// copia vendorizada de ez-tree 1.1.0 (tooling/vendor/ez-tree, MIT) en Node, con los presets y semillas fijos del mockup
// V6 (scripts/assets/tree-presets.ts), para cada especie de TREE_SPECIES de @lg/art en su versión completa y en la
// liviana (mockup `liteCfg`), y escribe cada árbol con nuestro escritor determinístico (glb-write.ts): una primitiva con
// POSITION, NORMAL, TEXCOORD_0 y COLOR_0, sin material, sin textura, sin imagen. El cliente nunca corre ez-tree: baja estos
// .glb (apps/web/public/models/generated/trees/) y los pinta con el material `follaje` (hoja y corteza .ktx2, PD-9).
//
// Lo que cambia respecto de la geometría de ez-tree (el puerto de `ezTree()` del mockup, world.js:1272):
//   · escala al alto de la especie; normales de las hojas hacia afuera de la copa (sombreado suave)
//   · UV en el atlas del mockup: corteza en (u · 0,5, 0,12) y hojas en (0,75 · u, 0,25 + 0,75 · v); el material de world/
//     muestrea la corteza abajo de v = 0,25 y la hoja arriba (dos .ktx2, sin componer un lienzo)
//   · COLOR_0: corteza 0xcdbba4 oscurecida hacia la base, hojas de `low` a `high` por altura con un tinte por hoja; la
//     ganancia de las hojas (TREE_LEAF_GAIN) la aplica el material, así COLOR_0 queda en [0, 1]
//
// ez-tree se carga con import() dinámico por ruta: ningún archivo bajo apps/ o packages/ (ni un import estático de acá)
// lo nombra, y la regla ADR-026 de eslint (el producto no importa tooling/) sigue sin excepción.
//
//   node scripts/assets/bake-trees.ts           escribe los .glb que faltan o cambiaron y lista sha256 y triángulos
//   node scripts/assets/bake-trees.ts --check   hornea en memoria y compara con lo versionado (sale 1 si difiere)
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
 * Fracción de hojas de la versión liviana. La del mockup es 0,42; con ella el álamo y los dos arbustos quedan en 38 a
 * 42 % de los triángulos de la completa y AC43 pide 35 % como mucho: esos bajan a 0,3 (las hojas restantes crecen en
 * proporción, así la copa cubre lo mismo). Desviación registrada del `liteCfg` del mockup.
 */
export const LIGHT_LEAF_SHARE: Readonly<Record<string, number>> = { aspen: 0.3, bushA: 0.3, bushB: 0.3 };
/** El álamo tiene 2 hojas por ramita aun así (el mínimo): en su versión liviana el tronco abre 3 ramas en vez de 5 (con 4 queda en 35,5 %). */
export const LIGHT_TRUNK_CHILDREN: Readonly<Record<string, number>> = { aspen: 3 };
const MOCKUP_LEAF_SHARE = 0.42;

/** La versión liviana del mockup (`liteCfg`): 40 % de las secciones, 3 a 4 lados, 60 % de las ramitas, 42 % de las hojas. */
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

/** Un árbol: la geometría de ez-tree con el preset, pasada a los atributos del pipeline (puerto de `ezTree()`). */
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
  // Centro de la copa (promedio de los vértices de hoja, en unidades de ez-tree).
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

/** Todos los árboles: cada especie completa y liviana, en el orden de TREE_SPECIES. */
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
