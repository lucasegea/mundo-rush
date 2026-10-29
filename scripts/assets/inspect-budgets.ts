// scripts/assets/inspect-budgets.ts: triángulos, tamaño y materiales por pieza y por diorama (plan estetica-c M2,
// 03 §6.4.1 y §2.7.3). Lo corre check:budgets: el primer diorama (muelle) entra en `assets_muelle_mb` y muelle + plaza
// en `assets_muelle_plaza_mb` (scripts/budgets/budgets.json, copia de la tabla de 03 §2.7.3; ningún umbral cambia acá).
// Los demás dioramas se informan sin tope, porque la tabla no les da uno; el de prueba (`test`) además se mide contra
// `assets_muelle_mb` y falla si se pasa (plan estetica-c M4, nota de QA M3). Además, toda pieza servida en
// apps/web/public/models tiene que haber salido del pipeline: sin texturas y con color por vértice. Desde M3 la descarga de
// cada diorama suma los archivos de personaje (los cuerpos base y el de clips, filas con bloque `personaje` del
// registro): todo diorama muestra al jugador y a sus vecinos, así que se cuentan enteros (cota de arriba). Desde M5 el
// estimador de presupuesto de validate:content usa los `triangulos` y `primitivas` de cada fila del registro (el
// compilador no lee .glb): acá se comparan con la pieza medida y una fila sin medida o con otra medida falla. Desde M6
// los cuerpos reducidos de `low` (`-bajo`) también son filas `personaje`: entran en la cota de arriba de cada diorama.
// Cambio registrado (open-world-3d T6, D-832, AC42): `assets_muelle_mb` (6 MB, sin cambio) cuenta TODO lo que baja el
// muelle del mundo abierto en `high`, no solo los `modelo/*` y los personajes: el muelle es el de U-GALEANO (un diorama
// con `terreno.relieve`), y su carga suma los .ktx2 del inventario de @lg/art que `high` crea y el transcodificador Basis
// (js y wasm). T7 SEAM: los árboles horneados (.glb de models/generated/trees) entran acá. Cada archivo de esa carga
// tiene que tener fila en content/assets-registry.yaml o content/code-registry.yaml; uno sin fila falla nombrándolo.
// Open-world-3d T7b (D-841): la carga del mundo abierto es la de un look (`cargaMundoAbierto(look)`: sus mapas y su
// vegetación) y run() recorre TODO el catálogo WORLD_LOOKS: cada look tiene que entrar solo en `assets_muelle_mb` y tener
// cada archivo registrado (un look nuevo no entra al juego si se pasa).
//
// Uso: node scripts/assets/inspect-budgets.ts   Sale con 1 si un presupuesto se pasa o una pieza no es del pipeline.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { natureModelFiles, WORLD_LOOKS, worldTextures, type WorldLook } from "@lg/art";
import { archivoDeModelo, compilarContenido, PREFIJO_MODELO } from "@lg/content-schema";
import { loadBudgets, type Budgets } from "../budgets/bundle-size.ts";
import { leerContenido } from "../content/build.ts";
import { crearIO } from "./optimize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const MODELOS = "apps/web/public/models";
const MB = 1_000_000;

export interface PiezaMedida {
  /** Ruta desde la raíz del repo. */
  archivo: string;
  bytes: number;
  triangulos: number;
  primitivas: number;
  materiales: number;
  texturas: number;
  conColor: boolean;
}

/** Un archivo de la carga de un diorama que no es un prop (texturas .ktx2, el transcodificador, T7: árboles y rocas). */
export interface ArchivoCarga {
  archivo: string;
  bytes: number;
}

/** El transcodificador Basis que baja todo mundo abierto (KTX2Loader lo carga desde /decoders/). */
export const DECODIFICADOR_BASIS = ["apps/web/public/decoders/basis_transcoder.js", "apps/web/public/decoders/basis_transcoder.wasm"] as const;
/** El universo cuyo muelle es el mundo abierto (open-world-3d): su carga entra en `assets_muelle_mb`. */
export const UNIVERSO_MUELLE = "U-GALEANO";

/**
 * Lo que baja un diorama con relieve en `high` con un look, además de sus props: los .ktx2 de su inventario, el
 * transcodificador y (T7) sus árboles y rocas.
 */
export function cargaMundoAbierto(look: WorldLook): string[] {
  const ktx2 = worldTextures(look).flatMap((t) => (t.file && t.count.high > 0 ? [t.file] : []));
  // T7: los árboles horneados y las rocas (el mundo los baja enteros: el tier cambia cuántos se dibujan, no cuáles).
  return [...new Set([...ktx2, ...natureModelFiles(look), ...DECODIFICADOR_BASIS])].sort();
}

export interface DioramaMedido {
  id: string;
  /** Archivos .glb distintos que usa (se bajan una vez), personajes incluidos. */
  modelos: string[];
  /** Open-world-3d T6: lo demás que baja (texturas .ktx2, transcodificador); vacío en un diorama sin relieve. */
  extras: ArchivoCarga[];
  bytes: number;
  /** Triángulos de los modelos por cada vez que aparecen. */
  triangulos: number;
}

/** Mide un .glb (ya optimizado o no). */
export async function medirPieza(archivo: string, bytes: Uint8Array): Promise<PiezaMedida> {
  const doc = await (await crearIO()).readBinary(bytes);
  const root = doc.getRoot();
  let triangulos = 0;
  let primitivas = 0;
  let conColor = true;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      primitivas += 1;
      triangulos += (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
      if (!prim.getAttribute("COLOR_0")) conColor = false;
    }
  }
  return { archivo, bytes: bytes.byteLength, triangulos, primitivas, materiales: root.listMaterials().length, texturas: root.listTextures().length, conColor };
}

/**
 * Los props `modelo/*` de cada diorama → archivos y peso de descarga. `personajes` son los archivos de personaje (se
 * bajan con cualquier diorama; sus triángulos se miden en el test del diorama, no acá).
 */
export function medirDioramas(
  dioramas: readonly { id: string; props?: readonly { asset: string }[] | undefined; terreno?: { relieve?: boolean | undefined } | undefined }[],
  piezas: ReadonlyMap<string, PiezaMedida>,
  personajes: readonly string[] = [],
  /** Open-world-3d T6: la carga extra de un diorama con relieve (cargaMundoAbierto con sus bytes). */
  cargaAbierta: readonly ArchivoCarga[] = [],
): DioramaMedido[] {
  return dioramas.map((d) => {
    const usos = (d.props ?? []).filter((p) => p.asset.startsWith(PREFIJO_MODELO)).map((p) => archivoDeModelo(p.asset));
    const modelos = [...new Set([...usos, ...personajes])].sort();
    const extras = d.terreno?.relieve === true ? [...cargaAbierta] : [];
    return {
      id: d.id,
      modelos,
      extras,
      bytes: modelos.reduce((n, m) => n + (piezas.get(m)?.bytes ?? 0), 0) + extras.reduce((n, e) => n + e.bytes, 0),
      triangulos: usos.reduce((n, m) => n + (piezas.get(m)?.triangulos ?? 0), 0),
    };
  });
}

export interface ChequeoDescarga {
  ok: boolean;
  lineas: string[];
}

const mb = (bytes: number): string => (bytes / MB).toFixed(3);

/** Presupuestos de 03 §2.7.3 sobre los dioramas medidos y las reglas del pipeline sobre cada pieza. */
export function chequearDescarga(piezas: readonly PiezaMedida[], dioramas: readonly DioramaMedido[], b: Budgets): ChequeoDescarga {
  const lineas: string[] = [];
  let ok = true;
  for (const p of piezas) {
    const malas = [p.texturas > 0 ? `${p.texturas} textura(s)` : "", p.conColor ? "" : "sin COLOR_0", p.materiales > 0 ? `${p.materiales} material(es) de origen` : ""].filter(Boolean);
    if (malas.length > 0) ok = false;
    lineas.push(`${malas.length > 0 ? "FAIL" : "OK  "} pieza ${p.archivo}: ${p.bytes} bytes, ${p.triangulos} triángulos, ${p.primitivas} primitiva(s)${malas.length > 0 ? `; no salió de scripts/assets/optimize.ts (${malas.join(", ")})` : ""}`);
  }
  const porId = new Map(dioramas.map((d) => [d.id, d]));
  const tope = (nombre: string, ids: readonly string[], capMb: number, clave: keyof Budgets): void => {
    const presentes = ids.filter((id) => porId.has(id));
    if (presentes.length === 0) {
      lineas.push(`n/a  ${nombre}: ${ids.join(" + ")} todavía no existe (${clave} = ${capMb} MB)`);
      return;
    }
    const archivos = new Set(presentes.flatMap((id) => porId.get(id)?.modelos ?? []));
    const modelos = [...archivos].reduce((n, a) => n + (piezas.find((p) => p.archivo === a)?.bytes ?? 0), 0);
    const extras = new Map(presentes.flatMap((id) => porId.get(id)?.extras ?? []).map((e) => [e.archivo, e.bytes]));
    const otros = [...extras.values()].reduce((n, b) => n + b, 0);
    const bytes = modelos + otros;
    const pasa = bytes / MB <= capMb;
    if (!pasa) ok = false;
    const detalle = extras.size > 0 ? ` (${mb(modelos)} de modelos y ${mb(otros)} de ${extras.size} archivo(s) más: texturas, transcodificador, árboles y rocas)` : "";
    lineas.push(`${pasa ? "OK  " : "FAIL"} ${nombre}: ${mb(bytes)} MB${extras.size > 0 ? "" : " de modelos"}${detalle} (tope ${capMb} MB, ${clave})`);
  };
  tope("assets del primer diorama", ["muelle"], b.assets_muelle_mb, "assets_muelle_mb");
  tope("descarga inicial del vertical slice", ["muelle", "plaza"], b.assets_muelle_plaza_mb, "assets_muelle_plaza_mb");
  for (const d of dioramas.filter((x) => x.id !== "muelle" && x.id !== "plaza")) {
    lineas.push(`info diorama ${d.id}: ${d.modelos.length} modelo(s), ${mb(d.bytes)} MB, ${d.triangulos} triángulos de modelos (sin tope en 03 §2.7.3)`);
    // El diorama de prueba contra el tope del primer diorama (plan estetica-c M3, con los personajes). Desde M4 (nota de
    // QA M3) pasarse FALLA el build: antes solo avisaba, y un aviso no frena a nadie.
    if (d.id === "test") {
      const pasa = d.bytes / MB <= b.assets_muelle_mb;
      if (!pasa) ok = false;
      lineas.push(`${pasa ? "OK  " : "FAIL"} diorama test contra assets_muelle_mb: ${mb(d.bytes)} de ${b.assets_muelle_mb} MB`);
    }
  }
  return { ok, lineas };
}

/**
 * Open-world-3d T6 (AC42): cada archivo de la carga del mundo abierto tiene fila en el registro de assets o en el de
 * código; uno sin fila (o que no existe en disco) falla nombrándolo.
 */
export function chequearCargaRegistrada(carga: readonly { archivo: string; bytes: number | null }[], registrados: ReadonlySet<string>): ChequeoDescarga {
  const lineas: string[] = [];
  let ok = true;
  for (const c of carga) {
    const falta = c.bytes === null ? "no existe en disco" : registrados.has(c.archivo) ? "" : "sin fila en content/assets-registry.yaml ni content/code-registry.yaml";
    if (falta) ok = false;
    lineas.push(`${falta ? "FAIL" : "OK  "} carga del muelle ${c.archivo}${c.bytes === null ? "" : `: ${c.bytes} bytes`}${falta ? `; ${falta}` : ""}`);
  }
  return { ok, lineas };
}

/** Lo que el registro dice de una pieza (plan estetica-c M5). */
export interface FilaMedida {
  id: string;
  archivo: string;
  triangulos?: number | undefined;
  primitivas?: number | undefined;
}

/**
 * Cada pieza servida contra su fila del registro: `triangulos` y `primitivas` tienen que estar y coincidir con lo medido,
 * porque el estimador de validate:content cuenta con ellos. Una pieza sin fila la informa el registro de licencias.
 */
export function chequearMedidasRegistro(piezas: readonly PiezaMedida[], filas: readonly FilaMedida[]): ChequeoDescarga {
  const lineas: string[] = [];
  let ok = true;
  const porArchivo = new Map(filas.map((f) => [f.archivo, f]));
  for (const p of piezas) {
    const f = porArchivo.get(p.archivo);
    if (!f) continue;
    if (f.triangulos === undefined || f.primitivas === undefined) {
      ok = false;
      lineas.push(`FAIL registro ${f.id}: sin triangulos/primitivas; medido ${p.triangulos} triángulos, ${p.primitivas} primitiva(s) en ${p.archivo}`);
    } else if (f.triangulos !== p.triangulos || f.primitivas !== p.primitivas) {
      ok = false;
      lineas.push(`FAIL registro ${f.id}: dice ${f.triangulos} triángulos, ${f.primitivas} primitiva(s); medido ${p.triangulos}, ${p.primitivas} en ${p.archivo}`);
    } else {
      lineas.push(`OK   registro ${f.id}: ${f.triangulos} triángulos, ${f.primitivas} primitiva(s) (medido)`);
    }
  }
  return { ok, lineas };
}

const aPosix = (p: string): string => p.split(sep).join("/");

/** Los .glb servidos, con su ruta desde root. */
export function listarModelos(root = ROOT): string[] {
  const out: string[] = [];
  const recorrer = (dir: string): void => {
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const e of entradas) {
      const p = join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".glb")) out.push(aPosix(relative(root, p)));
    }
  };
  recorrer(join(root, MODELOS));
  return out.sort();
}

export async function run(root = ROOT, log: (s: string) => void = console.log, budgets: Budgets = loadBudgets()): Promise<number> {
  const piezas = await Promise.all(listarModelos(root).map((a) => medirPieza(a, new Uint8Array(readFileSync(join(root, a))))));
  const contenido = compilarContenido(leerContenido(root));
  if (contenido.errores.length > 0) {
    log(`inspect-budgets: el contenido no compila (${contenido.errores.length} error(es)); corré validate:content`);
    return 1;
  }
  const universo = compilarContenido(leerContenido(root, UNIVERSO_MUELLE));
  if (universo.errores.length > 0) {
    log(`inspect-budgets: ${UNIVERSO_MUELLE} no compila (${universo.errores.length} error(es)); corré validate:content --universe=${UNIVERSO_MUELLE}`);
    return 1;
  }
  const personajes = (contenido.conjunto.registroAssets?.data.assets ?? []).filter((a) => a.personaje).map((a) => a.archivo).sort();
  const tamano = (a: string): number | null => {
    try {
      return statSync(join(root, a)).size;
    } catch {
      return null;
    }
  };
  const registrados = new Set([
    ...(contenido.conjunto.registroAssets?.data.assets ?? []).map((a) => a.archivo),
    ...(contenido.conjunto.registroCodigo?.data.codigo ?? []).map((c) => c.archivo),
  ]);
  const abiertos = universo.conjunto.dioramas.map((d) => d.data).filter((d) => d.terreno?.relieve === true);
  const m = chequearMedidasRegistro(piezas, contenido.conjunto.registroAssets?.data.assets ?? []);
  let ok = m.ok;
  // T7b (D-841): cada look del catálogo, solo, contra los mismos topes (los modelos y personajes son los mismos).
  for (const look of Object.values(WORLD_LOOKS)) {
    const carga = cargaMundoAbierto(look).map((archivo) => ({ archivo, bytes: tamano(archivo) }));
    const dioramas = medirDioramas(
      [...contenido.conjunto.dioramas.map((d) => d.data), ...abiertos],
      new Map(piezas.map((p) => [p.archivo, p])),
      personajes,
      carga.map((c) => ({ archivo: c.archivo, bytes: c.bytes ?? 0 })),
    );
    const r = chequearDescarga(piezas, dioramas, budgets);
    const k = chequearCargaRegistrada(carga, registrados);
    log(`look ${look.id}:`);
    for (const l of [...r.lineas, ...k.lineas]) log(l);
    ok = ok && r.ok && k.ok;
  }
  for (const l of m.lineas) log(l);
  return ok ? 0 : 1;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = await run();
}
