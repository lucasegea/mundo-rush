// scripts/assets/optimize.ts: la única puerta de un glTF CC0 al juego (plan estetica-c M2, 03 §6.4.1, D-207).
// Entra un .glb bajado a assets-src/ (gitignored, D-099) y sale a apps/web/public/models/<pack>/<pieza>.glb:
//   dequantize · flatten (transformaciones horneadas) · weld · normales si faltan
//   · cada primitiva recibe el token de la paleta que dice la tabla del pack (material de origen → token) y se pinta
//     por vértice con paintColors de @lg/art (la MISMA implementación que usa world/; sin copia)
//   · regla del bisel con maxDihedralDeg de @lg/art: una arista ≥ 80° rechaza la pieza nombrándola, salvo que el
//     registro diga `bisel: rehecho_por_codigo` o `bisel: aceptado`
//   · se descartan texturas, materiales y atributos que el material toon no usa
//   · join (una primitiva por pieza = una llamada) · dedup · prune · meshopt (reorder + quantize + EXT_meshopt_compression)
//
// Personajes (plan estetica-c M3): una fila con `personaje` (cuerpo con esqueleto o archivo de clips) va por
// scripts/assets/characters.ts con las mismas reglas de fondo (paleta, bisel, sin texturas, meshopt).
//
// Uso: node scripts/assets/optimize.ts [--solo <pack>/<pieza>]
// Lee content/assets-registry.yaml: cada fila con `fuente` se optimiza con la tabla `pintura` de su pack. La fuente
// tiene que tener el sha256 registrado (si cambió, se frena). Sale con 1 si una pieza se rechaza o falla.
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

/** Atributos que el material toon usa; el resto se descarta. */
const ATRIBUTOS = new Set(["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"]);
/** Comodín de la tabla de pintura: cualquier material que no esté nombrado. */
export const OTRO_MATERIAL = "*";

export type Bisel = "rehecho_por_codigo" | "aceptado";

export interface OpcionesPieza {
  /** `<pack>/<pieza>`: lo nombran los mensajes. */
  id: string;
  /** Tabla del pack: nombre del material de origen → token de la paleta (`*` = el resto). */
  pintura: Readonly<Record<string, string>>;
  /** Del registro: qué se hace con una pieza que no pasa la regla del bisel. */
  bisel?: Bisel | undefined;
  /** Semilla base del temblor de pincel (cada primitiva suma su índice). */
  semilla?: number;
}

export interface ReportePieza {
  id: string;
  bytesEntrada: number;
  bytesSalida: number;
  triangulos: number;
  primitivas: number;
  /** Mayor diedro encontrado (grados) y si la pieza pasó la regla o la aceptó el registro. */
  diedroMax: number;
  bisel: "ok" | Bisel;
  /** Material de origen → token usado. */
  tokens: Record<string, PaletteToken>;
  texturasDescartadas: number;
  materialesDescartados: number;
}

/** Una pieza que el pipeline no deja entrar (el mensaje nombra la pieza). */
export class PiezaRechazada extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "PiezaRechazada";
  }
}

const esToken = (t: string): t is PaletteToken => Object.hasOwn(PALETTE, t);

/** E/S de glTF con meshopt (lee y escribe EXT_meshopt_compression). */
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

/** Hornea la transformación de cada nodo en su malla (después de flatten, la del nodo es la del mundo). */
function hornearTransformaciones(doc: Document, id: string): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    // Plan estetica-c M3: un prop no tiene esqueleto; los personajes entran por una fila con `personaje` (characters.ts).
    // M3 SEAM: los animales con esqueleto (V2, M5) entran por el mismo camino de personajes.
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
 * Optimiza un .glb: sin texturas ni materiales de origen, pintado por vértice con los tokens del pack, chequeado contra
 * la regla del bisel y comprimido con meshopt. Determinístico: la misma entrada da los mismos bytes.
 */
export async function optimizarGlb(entrada: Uint8Array, o: OpcionesPieza): Promise<{ glb: Uint8Array; reporte: ReportePieza }> {
  const io = await crearIO();
  const doc = await io.readBinary(entrada);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const root = doc.getRoot();
  // dedup va al final: antes juntaría materiales iguales con nombres distintos y la tabla de pintura es por nombre.
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

/** Lee y valida el registro (el mismo schema que usa validate:content). */
export function leerRegistro(root = ROOT): { packs: Map<string, PackAssets>; assets: RegistroAsset[] } {
  const data = ArchivoRegistroAssets.parse(parse(readFileSync(join(root, REGISTRO), "utf8")));
  return { packs: new Map(data.packs.map((p) => [p.id, p])), assets: data.assets };
}

/**
 * Una pieza de personaje (plan estetica-c M3): un cuerpo con esqueleto o el archivo de clips, por characters.ts.
 * Determinístico como los props.
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
 * Deriva el .glb servido de una fila desde los bytes del original (sin tocar disco). Lo usan optimizarFila y
 * scripts/assets/refetch.ts (open-world-3d T2(e)), que re-deriva desde una descarga fresca y compara byte a byte.
 */
export async function derivarFila(fila: RegistroAsset, pack: PackAssets | undefined, entrada: Uint8Array): Promise<{ glb: Uint8Array; linea: string }> {
  if (!fila.personaje && !pack?.pintura) throw new PiezaRechazada(`${fila.id}: el pack "${fila.pack}" no tiene tabla de pintura en ${REGISTRO}`);
  return fila.personaje
    ? optimizarPersonajeGlb(entrada, fila.id, fila.personaje, fila.bisel)
    : optimizarGlb(entrada, { id: fila.id, pintura: pack?.pintura ?? {}, bisel: fila.bisel }).then((r) => ({ glb: r.glb, linea: formatearReporte(r.reporte) }));
}

/** Optimiza una fila del registro desde su fuente en assets-src/. Devuelve la línea del reporte. */
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
