// scripts/assets/characters.ts: la parte de personajes del pipeline de assets (plan estetica-c M3). La llama
// scripts/assets/optimize.ts para las filas del registro con `personaje` (la única puerta sigue siendo optimize.ts).
//
// Un CUERPO (`tipo: cuerpo`) sale de un glTF con esqueleto (KayKit Rig_Medium):
//   · quedan solo las mallas con esqueleto que nombra `nodos` (se van armas, cascos, capas y la cabeza: la cabeza, el
//     pelo y los accesorios los arma world/ por código y los cuelga del hueso `head`; M5 los pasa al contenido)
//   · se unen en UNA primitiva con piel (una llamada por cuerpo); se van las animaciones (viven en el archivo de clips)
//   · cada vértice toma un token de la paleta por reglas, en orden: el hueso que más lo mueve y/o el color de la textura
//     de paleta del pack muestreado en su UV (se descarta la textura después). Una regla puede marcar el vértice como
//     `remera` o `pantalon`: se pinta con un token por defecto y queda en el atributo `_ROPA` para que world/ lo
//     repinte con el color de cada vecino (casa-1..6) sin un .glb por color
//   · la regla del bisel igual que los props; texturas y materiales afuera; meshopt
// Los CLIPS (`tipo: animaciones`) salen de un glTF del mismo esqueleto: quedan los clips que nombra `clips` (falta uno:
// se rechaza nombrándolo), sin mallas ni texturas; se remuestrean y se comprimen con meshopt.
import { Document, Primitive, type Accessor, type Animation, type Node, type Skin, type TypedArray } from "@gltf-transform/core";
import { dedup, dequantize, meshopt, prune, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { MAX_DIHEDRAL_DEG, maxDihedralDeg, paintColors, PALETTE, tokenRgb, type PaletteToken } from "@lg/art";
import { decodificarPng, muestrear, type Imagen } from "./png.ts";

/** Atributo de vértice con la prenda que world/ repinta por personaje (glTF: los atributos propios empiezan con `_`). */
export const ATRIBUTO_ROPA = "_ROPA";
/** Valores de `_ROPA`. */
export const ROPA = { fija: 0, remera: 1, pantalon: 2 } as const;
export type Prenda = "remera" | "pantalon";
/** Con qué se pintan las prendas en el archivo (world/ las repinta con el color de cada uno). */
export const TOKEN_PRENDA: Readonly<Record<Prenda, PaletteToken>> = { remera: "casa-1", pantalon: "pantalon" };
/** Radio por defecto de una regla de color (distancia euclídea en sRGB de 0 a 1). */
export const RADIO_COLOR = 0.12;

export interface ReglaPintura {
  /** El vértice entra si el hueso que más lo mueve es uno de estos. */
  huesos?: readonly string[] | undefined;
  /** El vértice entra si el color de la textura en su UV está a menos de `radio` de este hex. */
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
}

export interface ReporteCuerpo {
  triangulos: number;
  vertices: number;
  huesos: string[];
  /** Vértices por token (y por prenda). */
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
  /** Canales que movían nodos fuera del esqueleto (armas, escudos, cascos). */
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

/** El hueso que más mueve a cada vértice (nombre del joint del esqueleto). */
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

/** El color de origen (sRGB 0 a 1) de cada vértice: la textura base en su UV, o el factor del material. */
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

/** La primera regla que toma el vértice. */
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

/** Concatena los atributos de varias primitivas (mismo esqueleto) en arreglos nuevos del tipo del primero. */
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

/** Un clip afuera con sus canales y muestreadores (si no, prune deja sus accesores colgados de los muestreadores). */
function descartarClip(a: Animation): void {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

/** Saca texturas, materiales y lo que quede sin uso. */
function limpiar(doc: Document): { texturas: number } {
  const root = doc.getRoot();
  const texturas = root.listTextures().length;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setMaterial(null);
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  return { texturas };
}

/** Un cuerpo con esqueleto: una primitiva con piel, pintada por reglas, sin texturas ni animaciones. */
export async function optimizarCuerpo(doc: Document, o: OpcionesCuerpo): Promise<ReporteCuerpo> {
  const root = doc.getRoot();
  await doc.transform(dequantize());
  const porNombre = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const nodos: Node[] = o.nodos.map((nombre) => {
    const n = porNombre.get(nombre);
    if (!n?.getMesh()) throw new PersonajeRechazado(`${o.id}: no hay una malla "${nombre}" en el archivo`);
    if (!n.getSkin()) throw new PersonajeRechazado(`${o.id}: la malla "${nombre}" no tiene esqueleto`);
    return n;
  });
  const skin = nodos[0]?.getSkin() as Skin;
  if (nodos.some((n) => n.getSkin() !== skin)) throw new PersonajeRechazado(`${o.id}: las mallas de "nodos" no comparten esqueleto`);
  const huesos = skin.listJoints().map((j) => j.getName());

  const prims = nodos.flatMap((n) => n.getMesh()?.listPrimitives() ?? []);
  for (const p of prims) if (p.getMode() !== Primitive.Mode.TRIANGLES) throw new PersonajeRechazado(`${o.id}: una malla no es de triángulos`);
  const cache = new Map<unknown, Imagen>();
  const dominantes = prims.flatMap((p) => huesoDominante(p, huesos));
  const origen = prims.flatMap((p) => coloresDeOrigen(p, cache));

  // Una sola primitiva: los atributos uno detrás del otro y los índices corridos.
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

  // Reglas → token y prenda de cada vértice.
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
  // La misma pintura que world/: cada token sobre el cuerpo entero (el degradé va de los pies a los hombros).
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

  // El cuerpo queda en el primer nodo; el resto de las mallas (las otras partes, armas, cascos) se va.
  const cuerpo = nodos[0] as Node;
  cuerpo.setMesh(doc.createMesh(o.id.split("/").pop() ?? "cuerpo").addPrimitive(unida)).setName("cuerpo");
  for (const n of root.listNodes()) {
    if (n === cuerpo) continue;
    if (n.getMesh()) n.setMesh(null);
    n.setSkin(null); // un esqueleto por cuerpo: los de las armas y la cabeza se van con sus mallas
  }
  for (const k of root.listSkins()) if (k !== skin) k.dispose();
  const animacionesDescartadas = root.listAnimations().length;
  for (const a of root.listAnimations()) descartarClip(a);
  const { texturas } = limpiar(doc);
  await doc.transform(prune({ keepLeaves: false }), dedup(), meshopt({ encoder: MeshoptEncoder }));

  return {
    triangulos: indices.length / 3, vertices: base, huesos, tokens, ropa, diedroMax,
    texturasDescartadas: texturas, animacionesDescartadas,
  };
}

/** Los clips de un esqueleto, sin mallas: quedan los pedidos, en el orden del archivo. */
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
  // Solo quedan los canales que mueven huesos del esqueleto: los de armas, escudos y cascos del personaje de origen no
  // tienen nodo en los cuerpos (three avisaría por cada pista sin destino) y el manifiesto exige huesos que existen.
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
