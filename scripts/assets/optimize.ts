// scripts/assets/optimize.ts: the only gate of a CC0 glTF into the game (plan estetica-c M2, 03 §6.4.1, D-207).
// A .glb downloaded into assets-src/ (gitignored, D-099) comes in and goes out to apps/web/public/models/<pack>/<piece>.glb:
//   dequantize · flatten (baked transforms) · weld · normals if missing
//   · each primitive receives the palette token given by the pack's table (source material → token) and is painted
//     per vertex with paintColors from @lg/art (the SAME implementation world/ uses; no copy)
//   · bevel rule with maxDihedralDeg from @lg/art: an edge ≥ 80° rejects the piece, naming it, unless the
//     registry says `bisel: rehecho_por_codigo` or `bisel: aceptado`
//   · textures, materials and attributes the toon material does not use are dropped
//   · join (one primitive per piece = one call) · dedup · prune · meshopt (reorder + quantize + EXT_meshopt_compression)
//
// Characters (plan estetica-c M3): a row with `personaje` (skinned body or clips file) goes through
// scripts/assets/characters.ts with the same underlying rules (palette, bevel, no textures, meshopt).
//
// Usage: node scripts/assets/optimize.ts [--solo <pack>/<piece>]
// Reads content/assets-registry.yaml: each row with `fuente` is optimized with its pack's `pintura` table. The source
// must have the registered sha256 (if it changed, it stops). Exits with 1 if a piece is rejected or fails.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Document, Logger, NodeIO, Primitive, type Mesh } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, dequantize, flatten, join as joinPrimitives, meshopt, normals, prune, transformMesh, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { parse } from "yaml";
import { ArchivoRegistroAssets, type PackAssets, type PiezaPersonaje, type RegistroAsset } from "@lg/content-schema";
import { MAX_DIHEDRAL_DEG, maxDihedralDeg, paintColors, PALETTE, tokenRgb, type PaletteToken } from "@lg/art";
import { optimizarClips, optimizarCuerpo, PersonajeRechazado } from "./characters.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const REGISTRO = "content/assets-registry.yaml";

/** Attributes the toon material uses; the rest are dropped. */
const ATRIBUTOS = new Set(["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"]);
/** Wildcard of the paint table: any material that is not named. */
export const OTRO_MATERIAL = "*";

export type Bisel = "rehecho_por_codigo" | "aceptado";

export interface OpcionesPieza {
  /** `<pack>/<piece>`: named by the messages. */
  id: string;
  /** The pack's table: source material name → palette token (`*` = the rest). */
  pintura: Readonly<Record<string, string>>;
  /** From the registry: what is done with a piece that fails the bevel rule. */
  bisel?: Bisel | undefined;
  /** Base seed of the brush jitter (each primitive adds its index). */
  semilla?: number;
}

export interface ReportePieza {
  id: string;
  bytesEntrada: number;
  bytesSalida: number;
  triangulos: number;
  primitivas: number;
  /** Largest dihedral found (degrees) and whether the piece passed the rule or the registry accepted it. */
  diedroMax: number;
  bisel: "ok" | Bisel;
  /** Source material → token used. */
  tokens: Record<string, PaletteToken>;
  texturasDescartadas: number;
  materialesDescartados: number;
}

/** A piece the pipeline does not let in (the message names the piece). */
export class PiezaRechazada extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "PiezaRechazada";
  }
}

const esToken = (t: string): t is PaletteToken => Object.hasOwn(PALETTE, t);

/** glTF I/O with meshopt (reads and writes EXT_meshopt_compression). */
export async function crearIO(): Promise<NodeIO> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
}

function tokenDe(o: OpcionesPieza, material: string): PaletteToken {
  const token = o.pintura[material] ?? o.pintura[OTRO_MATERIAL];
  if (token === undefined) throw new PiezaRechazada(`${o.id}: el material "${material}" no tiene token en la tabla de pintura del pack`);
  if (!esToken(token)) throw new PiezaRechazada(`${o.id}: el material "${material}" apunta a "${token}", que no es un token de la paleta`);
  return token;
}

/** Bakes each node's transform into its mesh (after flatten, the node's is the world one). */
function hornearTransformaciones(doc: Document, id: string): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    // Plan estetica-c M3: a prop has no skeleton; characters enter through a row with `personaje` (characters.ts).
    // M3 SEAM: skinned animals (V2, M5) enter through the same characters path.
    if (node.getSkin()) throw new PiezaRechazada(`${id}: la pieza tiene esqueleto; un personaje se registra con un bloque \`personaje\``);
    const m = node.getWorldMatrix();
    const identidad = m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
    if (identidad) continue;
    const propia: Mesh = mesh.listParents().filter((p) => p.propertyType === "Node").length > 1 ? mesh.clone() : mesh;
    transformMesh(propia, m);
    node.setMesh(propia).setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
}

/**
 * Optimizes a .glb: no source textures or materials, painted per vertex with the pack's tokens, checked against
 * the bevel rule and compressed with meshopt. Deterministic: the same input gives the same bytes.
 */
export async function optimizarGlb(entrada: Uint8Array, o: OpcionesPieza): Promise<{ glb: Uint8Array; reporte: ReportePieza }> {
  const io = await crearIO();
  const doc = await io.readBinary(entrada);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const root = doc.getRoot();
  // dedup goes last: earlier it would merge equal materials with different names and the paint table is by name.
  await doc.transform(dequantize(), flatten());
  hornearTransformaciones(doc, o.id);
  await doc.transform(weld());
  if (root.listMeshes().some((m) => m.listPrimitives().some((p) => !p.getAttribute("NORMAL")))) await doc.transform(normals({ overwrite: false }));

  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const tokens: Record<string, PaletteToken> = {};
  let diedroMax = 0;
  let k = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) throw new PiezaRechazada(`${o.id}: la malla "${mesh.getName()}" no es de triángulos`);
      const material = prim.getMaterial()?.getName() ?? "";
      const token = tokenDe(o, material);
      tokens[material] = token;
      const pos = prim.getAttribute("POSITION");
      if (!pos) throw new PiezaRechazada(`${o.id}: la malla "${mesh.getName()}" no tiene POSITION`);
      const posiciones = pos.getArray() as Float32Array;
      const diedro = maxDihedralDeg(posiciones, prim.getIndices()?.getArray() ?? null);
      diedroMax = Math.max(diedroMax, diedro);
      if (diedro >= MAX_DIHEDRAL_DEG && !o.bisel) {
        throw new PiezaRechazada(`${o.id}: arista dura de ${diedro.toFixed(1)}° (tope ${MAX_DIHEDRAL_DEG}°) en el material "${material}"; rehacela por código o registrala con bisel: rehecho_por_codigo | aceptado`);
      }
      for (const sem of prim.listSemantics()) if (!ATRIBUTOS.has(sem)) prim.setAttribute(sem, null);
      const colores = paintColors(posiciones, tokenRgb(token), (o.semilla ?? 0) + k++);
      prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(colores).setBuffer(buffer));
      prim.setMaterial(null);
    }
  }
  const texturas = root.listTextures();
  const materiales = root.listMaterials();
  const reporteBase = { texturasDescartadas: texturas.length, materialesDescartados: materiales.length };
  for (const t of texturas) t.dispose();
  for (const m of materiales) m.dispose();
  await doc.transform(joinPrimitives(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder }));

  const glb = await io.writeBinary(doc);
  let triangulos = 0;
  let primitivas = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      primitivas += 1;
      triangulos += (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    }
  }
  return {
    glb,
    reporte: {
      id: o.id, bytesEntrada: entrada.byteLength, bytesSalida: glb.byteLength, triangulos, primitivas, diedroMax,
      bisel: diedroMax >= MAX_DIHEDRAL_DEG ? (o.bisel as Bisel) : "ok", tokens, ...reporteBase,
    },
  };
}

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Reads and validates the registry (the same schema validate:content uses). */
export function leerRegistro(root = ROOT): { packs: Map<string, PackAssets>; assets: RegistroAsset[] } {
  const data = ArchivoRegistroAssets.parse(parse(readFileSync(join(root, REGISTRO), "utf8")));
  return { packs: new Map(data.packs.map((p) => [p.id, p])), assets: data.assets };
}

/**
 * A character piece (plan estetica-c M3): a skinned body or the clips file, through characters.ts.
 * Deterministic like the props.
 */
export async function optimizarPersonajeGlb(entrada: Uint8Array, id: string, pieza: PiezaPersonaje, bisel?: Bisel): Promise<{ glb: Uint8Array; linea: string }> {
  const io = await crearIO();
  const doc = await io.readBinary(entrada);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  try {
    if (pieza.tipo === "cuerpo") {
      const r = await optimizarCuerpo(doc, { id, nodos: pieza.nodos, pintura: pieza.pintura, bisel, simplificar: pieza.simplificar });
      const glb = await io.writeBinary(doc);
      return {
        glb,
        linea: `OK   ${id}: cuerpo, ${entrada.byteLength} → ${glb.byteLength} bytes, ${r.triangulos} triángulos, ${r.vertices} vértices, ` +
          `${r.huesos.length} huesos, diedro máx ${r.diedroMax.toFixed(1)}°, ${r.texturasDescartadas} textura(s) y ${r.animacionesDescartadas} clip(s) descartados, ` +
          `remera ${r.ropa.remera} y pantalón ${r.ropa.pantalon} vértices, tokens ${Object.entries(r.tokens).map(([t, n]) => `${t}:${n}`).join(" ")}`,
      };
    }
    const r = await optimizarClips(doc, { id, clips: pieza.clips });
    const glb = await io.writeBinary(doc);
    return { glb, linea: `OK   ${id}: clips, ${entrada.byteLength} → ${glb.byteLength} bytes, ${r.clips.join(" ")} sobre ${r.huesos.length} huesos (${r.animacionesDescartadas} clips y ${r.canalesDescartados} canales fuera del esqueleto descartados)` };
  } catch (e) {
    throw e instanceof PersonajeRechazado ? new PiezaRechazada(e.message) : e;
  }
}

/**
 * Derives a row's served .glb from the original's bytes (without touching disk). Used by optimizarFila and
 * scripts/assets/refetch.ts (open-world-3d T2(e)), which re-derives from a fresh download and compares byte by byte.
 */
export async function derivarFila(fila: RegistroAsset, pack: PackAssets | undefined, entrada: Uint8Array): Promise<{ glb: Uint8Array; linea: string }> {
  if (!fila.personaje && !pack?.pintura) throw new PiezaRechazada(`${fila.id}: el pack "${fila.pack}" no tiene tabla de pintura en ${REGISTRO}`);
  return fila.personaje
    ? optimizarPersonajeGlb(entrada, fila.id, fila.personaje, fila.bisel)
    : optimizarGlb(entrada, { id: fila.id, pintura: pack?.pintura ?? {}, bisel: fila.bisel }).then((r) => ({ glb: r.glb, linea: formatearReporte(r.reporte) }));
}

/** Optimizes a registry row from its source in assets-src/. Returns the report line. */
export async function optimizarFila(fila: RegistroAsset, pack: PackAssets | undefined, root = ROOT): Promise<string> {
  if (!fila.fuente) throw new PiezaRechazada(`${fila.id}: la fila no tiene fuente en assets-src/`);
  const entrada = new Uint8Array(readFileSync(join(root, fila.fuente)));
  const hash = sha256(entrada);
  if (hash !== fila.sha256_original) throw new PiezaRechazada(`${fila.id}: la fuente ${fila.fuente} tiene sha256 ${hash}, el registro dice ${fila.sha256_original}`);
  const { glb, linea } = await derivarFila(fila, pack, entrada);
  const salida = join(root, fila.archivo);
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, glb);
  return linea;
}

export const formatearReporte = (r: ReportePieza): string =>
  `OK   ${r.id}: ${r.bytesEntrada} → ${r.bytesSalida} bytes, ${r.triangulos} triángulos, ${r.primitivas} primitiva(s), ` +
  `diedro máx ${r.diedroMax.toFixed(1)}° (${r.bisel}), ${r.texturasDescartadas} textura(s) y ${r.materialesDescartados} material(es) descartados, ` +
  `tokens ${Object.entries(r.tokens).map(([m, t]) => `${m || "(sin material)"}→${t}`).join(", ")}`;

export async function run(args: readonly string[], log: (s: string) => void = console.log, root = ROOT): Promise<number> {
  const i = args.indexOf("--solo");
  const solo = i >= 0 ? args[i + 1] : undefined;
  const { packs, assets } = leerRegistro(root);
  const filas = assets.filter((a) => a.fuente && (solo === undefined || a.id === solo));
  if (solo !== undefined && filas.length === 0) {
    log(`optimize: no hay una fila "${solo}" con fuente en ${REGISTRO}`);
    return 1;
  }
  let fallas = 0;
  for (const fila of filas) {
    if (!existsSync(join(root, fila.fuente as string))) {
      log(`n/a  ${fila.id}: falta ${fila.fuente} (assets-src/ no se versiona; bajalo de ${fila.url_origen})`);
      if (solo !== undefined) fallas += 1;
      continue;
    }
    try {
      log(await optimizarFila(fila, packs.get(fila.pack), root));
    } catch (e) {
      fallas += 1;
      log(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return fallas === 0 ? 0 : 1;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = await run(process.argv.slice(2));
}
