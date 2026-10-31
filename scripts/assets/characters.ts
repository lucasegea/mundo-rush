// scripts/assets/characters.ts: the characters part of the asset pipeline (plan estetica-c M3). Called by
// scripts/assets/optimize.ts for registry rows with `personaje` (the only gate is still optimize.ts).
//
// A BODY (`tipo: cuerpo`) comes from a skinned glTF (KayKit Rig_Medium):
//   · only the skinned meshes named by `nodos` remain (weapons, helmets, capes and the head go: the head, hair
//     and accessories are assembled by world/ in code and hung from the `head` bone; M5 moves them to content)
//   · they are merged into ONE skinned primitive (one call per body); animations go (they live in the clips file)
//   · each vertex takes a palette token by rules, in order: the bone that moves it most and/or the color of the pack's
//     palette texture sampled at its UV (the texture is discarded afterwards). A rule may mark the vertex as
//     `remera` or `pantalon`: it is painted with a default token and stays in the `_ROPA` attribute so world/
//     repaints it with each neighbor's color (casa-1..6) without one .glb per color
//   · the bevel rule same as the props; textures and materials out; meshopt
//   · with `simplificar` (plan estetica-c M6, the `low` body): the same piece with meshopt simplify down to that fraction
//     of the triangles, on the same skeleton and the same paint (simplify only removes indices: colors, `_ROPA` and
//     weights of the remaining vertices are those of the full body)
//   · open-world-3d T7 (AC47): a mesh WITHOUT a skeleton hung from a skeleton bone (the hair and face of the Quaternius
//     rig hang from the `Head` bone) enters rigid: its vertices move to that bone's bind space and take
//     weight 1 on it, so it joins the same skinned primitive. A mesh without a skeleton that does not hang from a bone is
//     rejected as before.
// The CLIPS (`tipo: animaciones`) come from a glTF of the same skeleton: the clips named by `clips` remain (one missing:
// it is rejected naming it), without meshes or textures; they are resampled and compressed with meshopt.
import { Document, Primitive, type Accessor, type Animation, type Node, type Skin, type TypedArray } from "@gltf-transform/core";
import { dedup, dequantize, meshopt, prune, resample, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { MAX_DIHEDRAL_DEG, maxDihedralDeg, paintColors, PALETTE, tokenRgb, type PaletteToken } from "@lg/art";
import { decodificarPng, muestrear, type Imagen } from "./png.ts";

/** Vertex attribute with the garment that world/ repaints per character (glTF: custom attributes start with `_`). */
export const ATRIBUTO_ROPA = "_ROPA";
/** Values of `_ROPA`. */
export const ROPA = { fija: 0, remera: 1, pantalon: 2 } as const;
export type Prenda = "remera" | "pantalon";
/** What garments are painted with in the file (world/ repaints them with each one's color). */
export const TOKEN_PRENDA: Readonly<Record<Prenda, PaletteToken>> = { remera: "casa-1", pantalon: "pantalon" };
/** Default radius of a color rule (Euclidean distance in sRGB from 0 to 1). */
export const RADIO_COLOR = 0.12;

export interface ReglaPintura {
  /** The vertex enters if the bone that moves it most is one of these. */
  huesos?: readonly string[] | undefined;
  /** The vertex enters if the texture color at its UV is within `radio` of this hex. */
  color?: string | undefined;
  radio?: number | undefined;
  token?: string | undefined;
  ropa?: Prenda | undefined;
}

export interface OpcionesCuerpo {
  id: string;
  nodos: readonly string[];
  pintura: readonly ReglaPintura[];
  bisel?: "rehecho_por_codigo" | "aceptado" | undefined;
  semilla?: number;
  /** Fraction of triangles meshopt simplify leaves (0 to 1); without this the body stays complete. */
  simplificar?: number | undefined;
}

/** Maximum simplification error, as a fraction of the mesh radius (lets it reach the requested fraction). */
export const ERROR_SIMPLIFICAR = 0.02;

export interface ReporteCuerpo {
  triangulos: number;
  vertices: number;
  huesos: string[];
  /** Vertices per token (and per garment). */
  tokens: Record<string, number>;
  ropa: Record<Prenda, number>;
  diedroMax: number;
  texturasDescartadas: number;
  animacionesDescartadas: number;
}

export interface ReporteClips {
  clips: string[];
  huesos: string[];
  animacionesDescartadas: number;
  /** Channels that moved nodes outside the skeleton (weapons, shields, helmets). */
  canalesDescartados: number;
}

export class PersonajeRechazado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "PersonajeRechazado";
  }
}

const esToken = (t: string): t is PaletteToken => Object.hasOwn(PALETTE, t);
const hexASrgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** The bone that moves each vertex most (joint name in the skeleton). */
function huesoDominante(prim: Primitive, nombres: readonly string[]): string[] {
  const j = prim.getAttribute("JOINTS_0");
  const w = prim.getAttribute("WEIGHTS_0");
  const n = prim.getAttribute("POSITION")?.getCount() ?? 0;
  if (!j || !w) return new Array<string>(n).fill("");
  const out: string[] = [];
  const je: number[] = [];
  const we: number[] = [];
  for (let i = 0; i < n; i++) {
    j.getElement(i, je);
    w.getElement(i, we);
    let mejor = 0;
    for (let k = 1; k < 4; k++) if ((we[k] as number) > (we[mejor] as number)) mejor = k;
    out.push(nombres[je[mejor] as number] ?? "");
  }
  return out;
}

/** The source color (sRGB 0 to 1) of each vertex: the base texture at its UV, or the material factor. */
function coloresDeOrigen(prim: Primitive, cache: Map<unknown, Imagen>): [number, number, number][] {
  const n = prim.getAttribute("POSITION")?.getCount() ?? 0;
  const material = prim.getMaterial();
  const textura = material?.getBaseColorTexture();
  const uv = prim.getAttribute("TEXCOORD_0");
  if (textura && uv) {
    let img = cache.get(textura);
    if (!img) {
      const bytes = textura.getImage();
      if (!bytes) throw new PersonajeRechazado(`la textura "${textura.getName()}" no tiene imagen`);
      img = decodificarPng(bytes);
      cache.set(textura, img);
    }
    const t: number[] = [];
    return Array.from({ length: n }, (_, i) => {
      uv.getElement(i, t);
      return muestrear(img as Imagen, t[0] as number, t[1] as number);
    });
  }
  const f = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
  return Array.from({ length: n }, () => [f[0], f[1], f[2]] as [number, number, number]);
}

/** The first rule that takes the vertex. */
export function reglaDe(reglas: readonly ReglaPintura[], hueso: string, color: readonly [number, number, number]): ReglaPintura | null {
  for (const r of reglas) {
    if (r.huesos && !r.huesos.includes(hueso)) continue;
    if (r.color) {
      const ref = hexASrgb(r.color);
      if (Math.hypot(color[0] - ref[0], color[1] - ref[1], color[2] - ref[2]) > (r.radio ?? RADIO_COLOR)) continue;
    }
    return r;
  }
  return null;
}

const hex = (c: readonly number[]): string => `#${c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

/** Concatenates the attributes of several primitives (same skeleton) into new arrays of the first one's type. */
function concatenar(prims: readonly Primitive[], semantica: string): { array: TypedArray; tipo: ReturnType<Accessor["getType"]>; normalizado: boolean } | null {
  const accs = prims.map((p) => p.getAttribute(semantica));
  if (accs.some((a) => !a)) {
    if (accs.every((a) => !a)) return null;
    throw new PersonajeRechazado(`las mallas no comparten el atributo ${semantica}`);
  }
  const primero = accs[0] as Accessor;
  const total = accs.reduce((n, a) => n + ((a as Accessor).getArray() as TypedArray).length, 0);
  const Ctor = (primero.getArray() as TypedArray).constructor as new (n: number) => TypedArray;
  const out = new Ctor(total);
  let o = 0;
  for (const a of accs as Accessor[]) {
    out.set(a.getArray() as TypedArray, o);
    o += (a.getArray() as TypedArray).length;
  }
  return { array: out, tipo: primero.getType(), normalizado: primero.getNormalized() };
}

/** A clip out with its channels and samplers (otherwise prune leaves its accessors hanging from the samplers). */
function descartarClip(a: Animation): void {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

/** Removes textures, materials and whatever is left unused. */
function limpiar(doc: Document): { texturas: number } {
  const root = doc.getRoot();
  const texturas = root.listTextures().length;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setMaterial(null);
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  return { texturas };
}

type Mat4 = number[];

const at = (m: readonly number[], i: number): number => m[i] as number;

/** a · b (column-major, like glTF). */
function mul(a: readonly number[], b: readonly number[]): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += at(a, k * 4 + r) * at(b, c * 4 + k);
    out[c * 4 + r] = v;
  }
  return out;
}

/** Inverse of an affine 4 × 4 (column-major); rejects a singular one. */
function invertir(m: readonly number[], id: string): Mat4 {
  const [a, b, c, d, e, f, g, h, i] = [0, 1, 2, 4, 5, 6, 8, 9, 10].map((k) => at(m, k)) as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(b * i - c * h), C = b * f - c * e;
  const det = a * A + d * B + g * C;
  if (Math.abs(det) < 1e-30) throw new PersonajeRechazado(`${id}: una matriz del esqueleto no se puede invertir`);
  const k = 1 / det;
  const r = [
    A * k, B * k, C * k, 0,
    -(d * i - f * g) * k, (a * i - c * g) * k, -(a * f - c * d) * k, 0,
    (d * h - e * g) * k, -(a * h - b * g) * k, (a * e - b * d) * k, 0,
    0, 0, 0, 1,
  ];
  const [tx, ty, tz] = [at(m, 12), at(m, 13), at(m, 14)];
  for (let row = 0; row < 3; row++) r[12 + row] = -(at(r, row) * tx + at(r, 4 + row) * ty + at(r, 8 + row) * tz);
  return r;
}

/** The index of the nearest bone that `n` hangs from (or -1). */
function huesoPadre(n: Node, articulaciones: readonly Node[]): number {
  for (let p = n.getParentNode(); p; p = p.getParentNode()) {
    const j = articulaciones.indexOf(p);
    if (j >= 0) return j;
  }
  return -1;
}

/**
 * A rigid mesh hung from bone `j` moves to the body's bind space. A skinned vertex ends up at
 * bone · IBM · v (glTF ignores the skinned mesh node's transform; measured on the Quaternius rig: that way it
 * is 2.74 tall, as three draws it), so v' = (bone_j · IBM_j)⁻¹ · nodeWorld · v, with weight 1 on `j`.
 * Changes its primitives' attributes in place (the rigid mesh goes afterwards) with the types of the body's,
 * so they concatenate.
 */
function enlazarRigida(doc: Document, nodo: Node, j: number, skin: Skin, molde: Primitive, id: string): void {
  const ibm = Array.from((skin.getInverseBindMatrices()?.getElement(j, []) ?? []) as number[]);
  if (ibm.length !== 16) throw new PersonajeRechazado(`${id}: el esqueleto no trae la matriz de enlace del hueso ${j}`);
  const hueso = skin.listJoints()[j] as Node;
  const m = mul(invertir(mul(hueso.getWorldMatrix(), ibm), id), nodo.getWorldMatrix());
  const inv = invertir(m, id); // normals: the inverse transpose of the 3 × 3 part
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const jMolde = molde.getAttribute("JOINTS_0") as Accessor;
  const wMolde = molde.getAttribute("WEIGHTS_0") as Accessor;
  const JC = (jMolde.getArray() as TypedArray).constructor as new (n: number) => TypedArray;
  const WC = (wMolde.getArray() as TypedArray).constructor as new (n: number) => TypedArray;
  for (const p of nodo.getMesh()?.listPrimitives() ?? []) {
    const pos = p.getAttribute("POSITION");
    const n = pos?.getCount() ?? 0;
    const xyz = new Float32Array(n * 3);
    const v: number[] = [];
    for (let i = 0; i < n; i++) {
      pos?.getElement(i, v);
      const [x, y, z] = v as [number, number, number];
      for (let r = 0; r < 3; r++) xyz[i * 3 + r] = at(m, r) * x + at(m, 4 + r) * y + at(m, 8 + r) * z + at(m, 12 + r);
    }
    p.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(xyz).setBuffer(buffer));
    const nor = p.getAttribute("NORMAL");
    if (nor) {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        nor.getElement(i, v);
        const [x, y, z] = v as [number, number, number];
        const t = [0, 1, 2].map((r) => at(inv, r * 4) * x + at(inv, r * 4 + 1) * y + at(inv, r * 4 + 2) * z) as [number, number, number];
        const l = Math.hypot(t[0], t[1], t[2]) || 1;
        out.set([t[0] / l, t[1] / l, t[2] / l], i * 3);
      }
      p.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(out).setBuffer(buffer));
    }
    const joints = new JC(n * 4);
    const weights = new WC(n * 4);
    const uno = wMolde.getNormalized() ? (weights instanceof Uint8Array ? 255 : 65535) : 1;
    for (let i = 0; i < n; i++) {
      joints[i * 4] = j;
      weights[i * 4] = uno;
    }
    p.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(joints).setBuffer(buffer));
    p.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(weights).setNormalized(wMolde.getNormalized()).setBuffer(buffer));
  }
}

/** A skinned body: one skinned primitive, painted by rules, without textures or animations. */
export async function optimizarCuerpo(doc: Document, o: OpcionesCuerpo): Promise<ReporteCuerpo> {
  const root = doc.getRoot();
  await doc.transform(dequantize());
  const porNombre = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const nodos: Node[] = o.nodos.map((nombre) => {
    const n = porNombre.get(nombre);
    if (!n?.getMesh()) throw new PersonajeRechazado(`${o.id}: no hay una malla "${nombre}" en el archivo`);
    return n;
  });
  const conPiel = nodos.find((n) => n.getSkin());
  const skin = conPiel?.getSkin() ?? null;
  const articulaciones = skin ? skin.listJoints() : [];
  const rigidas = new Map<Node, number>();
  for (const n of nodos) {
    if (n.getSkin()) {
      if (n.getSkin() !== skin) throw new PersonajeRechazado(`${o.id}: las mallas de "nodos" no comparten esqueleto`);
      continue;
    }
    const j = huesoPadre(n, articulaciones);
    if (j < 0) throw new PersonajeRechazado(`${o.id}: la malla "${n.getName()}" no tiene esqueleto`);
    rigidas.set(n, j);
  }
  if (!skin || !conPiel) throw new PersonajeRechazado(`${o.id}: ninguna malla de "nodos" tiene esqueleto`);
  const huesos = articulaciones.map((j) => j.getName());
  const molde = conPiel.getMesh()?.listPrimitives()[0] as Primitive;
  for (const [n, j] of rigidas) enlazarRigida(doc, n, j, skin, molde, o.id);

  const prims = nodos.flatMap((n) => n.getMesh()?.listPrimitives() ?? []);
  for (const p of prims) if (p.getMode() !== Primitive.Mode.TRIANGLES) throw new PersonajeRechazado(`${o.id}: una malla no es de triángulos`);
  const cache = new Map<unknown, Imagen>();
  const dominantes = prims.flatMap((p) => huesoDominante(p, huesos));
  const origen = prims.flatMap((p) => coloresDeOrigen(p, cache));

  // A single primitive: the attributes one after another and the indices shifted.
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const unida = doc.createPrimitive();
  for (const sem of ["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"]) {
    const c = concatenar(prims, sem);
    if (c) unida.setAttribute(sem, doc.createAccessor().setType(c.tipo).setArray(c.array).setNormalized(c.normalizado).setBuffer(buffer));
  }
  const indices: number[] = [];
  let base = 0;
  for (const p of prims) {
    const n = p.getAttribute("POSITION")?.getCount() ?? 0;
    const idx = p.getIndices()?.getArray();
    if (idx) for (const i of idx) indices.push(base + i);
    else for (let i = 0; i < n; i++) indices.push(base + i);
    base += n;
  }
  unida.setIndices(doc.createAccessor().setType("SCALAR").setArray(base > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices)).setBuffer(buffer));
  const posiciones = unida.getAttribute("POSITION")?.getArray() as Float32Array;

  // Rules → token and garment of each vertex.
  const tokens: Record<string, number> = {};
  const ropa: Record<Prenda, number> = { remera: 0, pantalon: 0 };
  const tokenDe: PaletteToken[] = [];
  const prenda = new Uint8Array(base);
  for (let i = 0; i < base; i++) {
    const r = reglaDe(o.pintura, dominantes[i] as string, origen[i] as [number, number, number]);
    if (!r) throw new PersonajeRechazado(`${o.id}: ninguna regla de pintura toma el color ${hex(origen[i] as number[])} del hueso "${dominantes[i]}"`);
    const token = r.ropa ? TOKEN_PRENDA[r.ropa] : r.token;
    if (!token || !esToken(token)) throw new PersonajeRechazado(`${o.id}: la regla apunta a "${token ?? "(nada)"}", que no es un token de la paleta`);
    tokenDe.push(token);
    tokens[r.ropa ?? token] = (tokens[r.ropa ?? token] ?? 0) + 1;
    if (r.ropa) {
      prenda[i] = ROPA[r.ropa];
      ropa[r.ropa] += 1;
    }
  }
  // The same paint as world/: each token over the whole body (the gradient goes from feet to shoulders).
  const colores = new Float32Array(base * 3);
  const usados = [...new Set(tokenDe)].sort();
  usados.forEach((token, k) => {
    const pintado = paintColors(posiciones, tokenRgb(token), (o.semilla ?? 0) + k);
    for (let i = 0; i < base; i++) if (tokenDe[i] === token) colores.set(pintado.subarray(i * 3, i * 3 + 3), i * 3);
  });
  unida.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(colores).setBuffer(buffer));
  unida.setAttribute(ATRIBUTO_ROPA, doc.createAccessor().setType("SCALAR").setArray(prenda).setBuffer(buffer));

  const diedroMax = maxDihedralDeg(posiciones, unida.getIndices()?.getArray() ?? null);
  if (diedroMax >= MAX_DIHEDRAL_DEG && !o.bisel) {
    throw new PersonajeRechazado(`${o.id}: arista dura de ${diedroMax.toFixed(1)}° (tope ${MAX_DIHEDRAL_DEG}°); registrala con bisel: rehecho_por_codigo | aceptado`);
  }

  // The body stays on the first skinned node; the rest of the meshes (the other parts, weapons, helmets) go.
  const cuerpo = conPiel as Node;
  cuerpo.setMesh(doc.createMesh(o.id.split("/").pop() ?? "cuerpo").addPrimitive(unida)).setName("cuerpo");
  for (const n of root.listNodes()) {
    if (n === cuerpo) continue;
    if (n.getMesh()) n.setMesh(null);
    n.setSkin(null); // one skeleton per body: those of the weapons and the head go with their meshes
  }
  for (const k of root.listSkins()) if (k !== skin) k.dispose();
  const animacionesDescartadas = root.listAnimations().length;
  for (const a of root.listAnimations()) descartarClip(a);
  const { texturas } = limpiar(doc);
  if (o.simplificar !== undefined) {
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: o.simplificar, error: ERROR_SIMPLIFICAR }));
  }
  await doc.transform(prune({ keepLeaves: false }), dedup(), meshopt({ encoder: MeshoptEncoder }));

  const final = cuerpo.getMesh()?.listPrimitives()[0];
  return {
    triangulos: (final?.getIndices()?.getCount() ?? indices.length) / 3, vertices: final?.getAttribute("POSITION")?.getCount() ?? base,
    huesos, tokens, ropa, diedroMax, texturasDescartadas: texturas, animacionesDescartadas,
  };
}

/** The clips of a skeleton, without meshes: the requested ones remain, in file order. */
export async function optimizarClips(doc: Document, o: { id: string; clips: readonly string[] }): Promise<ReporteClips> {
  const root = doc.getRoot();
  const presentes = new Set(root.listAnimations().map((a) => a.getName()));
  const faltan = o.clips.filter((c) => !presentes.has(c));
  if (faltan.length > 0) throw new PersonajeRechazado(`${o.id}: el archivo no trae los clips ${faltan.join(", ")}`);
  let animacionesDescartadas = 0;
  for (const a of root.listAnimations()) {
    if (o.clips.includes(a.getName())) continue;
    descartarClip(a);
    animacionesDescartadas += 1;
  }
  // Only the channels that move skeleton bones remain: those of the source character's weapons, shields and helmets have no
  // node in the bodies (three would warn for each track without a target) and the manifest requires bones that exist.
  const articulaciones = new Set(root.listSkins().flatMap((sk) => sk.listJoints()));
  if (articulaciones.size === 0) throw new PersonajeRechazado(`${o.id}: el archivo de clips no trae esqueleto`);
  let canalesDescartados = 0;
  for (const a of root.listAnimations()) {
    for (const c of a.listChannels()) {
      const n = c.getTargetNode();
      if (n && articulaciones.has(n)) continue;
      c.getSampler()?.dispose();
      c.dispose();
      canalesDescartados += 1;
    }
  }
  const huesos = [...new Set(root.listAnimations().flatMap((a) => a.listChannels().map((c) => c.getTargetNode()?.getName() ?? "")))].sort();
  for (const n of root.listNodes()) {
    n.setMesh(null);
    n.setSkin(null);
  }
  limpiar(doc);
  await doc.transform(resample(), prune({ keepLeaves: false }), dedup(), meshopt({ encoder: MeshoptEncoder }));
  return { clips: root.listAnimations().map((a) => a.getName()), huesos, animacionesDescartadas, canalesDescartados };
}
