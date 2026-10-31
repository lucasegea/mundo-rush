// scripts/assets/inspect-budgets.ts: triangles, size and materials per piece and per diorama (plan estetica-c M2,
// 03 §6.4.1 and §2.7.3). Run by check:budgets: the first diorama (dock) goes into `assets_muelle_mb` and dock + plaza
// into `assets_muelle_plaza_mb` (scripts/budgets/budgets.json, a copy of the 03 §2.7.3 table; no threshold changes here).
// The other dioramas are reported without a cap, because the table gives them none; the test one (`test`) is also measured against
// `assets_muelle_mb` and fails if it goes over (plan estetica-c M4, QA M3 note). Also, every piece served in
// apps/web/public/models must have come out of the pipeline: no textures and with vertex color. Since M3 each diorama's
// download adds the character files (the base bodies and the clips one, rows with a `personaje` block in the
// registry): every diorama shows the player and their neighbors, so they are counted whole (upper bound). Since M5 the
// budget estimator of validate:content uses each registry row's `triangulos` and `primitivas` (the
// compiler does not read .glb): here they are compared with the measured piece and a row with no measurement or a different one fails. Since M6
// the reduced `low` bodies (`-bajo`) are also `personaje` rows: they enter each diorama's upper bound.
// Recorded change (open-world-3d T6, D-832, AC42): `assets_muelle_mb` (6 MB, unchanged) counts EVERYTHING the open-world
// dock downloads on `high`, not only the `modelo/*` and the characters: the dock is U-GALEANO's (a diorama
// with `terreno.relieve`), and its load adds the .ktx2 files of the @lg/art inventory that `high` creates and the Basis transcoder
// (js and wasm). T7 SEAM: the baked trees (.glb of models/generated/trees) enter here. Each file of that load
// must have a row in content/assets-registry.yaml or content/code-registry.yaml; one without a row fails, naming it.
// Open-world-3d T7b (D-841): the open-world load is that of a look (`cargaMundoAbierto(look)`: its maps and its
// vegetation) and run() walks the WHOLE WORLD_LOOKS catalog: each look has to fit alone in `assets_muelle_mb` and have
// each file registered (a new look does not enter the game if it goes over).
//
// Usage: node scripts/assets/inspect-budgets.ts   Exits with 1 if a budget is exceeded or a piece is not from the pipeline.
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
  /** Path from the repo root. */
  archivo: string;
  bytes: number;
  triangulos: number;
  primitivas: number;
  materiales: number;
  texturas: number;
  conColor: boolean;
}

/** A file in a diorama's load that is not a prop (.ktx2 textures, the transcoder, T7: trees and rocks). */
export interface ArchivoCarga {
  archivo: string;
  bytes: number;
}

/** The Basis transcoder that every open world downloads (KTX2Loader loads it from /decoders/). */
export const DECODIFICADOR_BASIS = ["apps/web/public/decoders/basis_transcoder.js", "apps/web/public/decoders/basis_transcoder.wasm"] as const;
/** The universe whose dock is the open world (open-world-3d): its load enters `assets_muelle_mb`. */
export const UNIVERSO_MUELLE = "U-GALEANO";

/**
 * What a diorama with relief downloads on `high` with a look, besides its props: the .ktx2 of its inventory, the
 * transcoder and (T7) its trees and rocks.
 */
export function cargaMundoAbierto(look: WorldLook): string[] {
  const ktx2 = worldTextures(look).flatMap((t) => (t.file && t.count.high > 0 ? [t.file] : []));
  // T7: the baked trees and the rocks (the world downloads them whole: the tier changes how many are drawn, not which).
  return [...new Set([...ktx2, ...natureModelFiles(look), ...DECODIFICADOR_BASIS])].sort();
}

export interface DioramaMedido {
  id: string;
  /** Distinct .glb files it uses (downloaded once), characters included. */
  modelos: string[];
  /** Open-world-3d T6: the rest of what it downloads (.ktx2 textures, transcoder); empty in a diorama without relief. */
  extras: ArchivoCarga[];
  bytes: number;
  /** Triangles of the models for each time they appear. */
  triangulos: number;
}

/** Measures a .glb (already optimized or not). */
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
 * The `modelo/*` props of each diorama → files and download weight. `personajes` are the character files (downloaded
 * with any diorama; their triangles are measured in the diorama's test, not here).
 */
export function medirDioramas(
  dioramas: readonly { id: string; props?: readonly { asset: string }[] | undefined; terreno?: { relieve?: boolean | undefined } | undefined }[],
  piezas: ReadonlyMap<string, PiezaMedida>,
  personajes: readonly string[] = [],
  /** Open-world-3d T6: the extra load of a diorama with relief (cargaMundoAbierto with its bytes). */
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

/** Budgets of 03 §2.7.3 over the measured dioramas and the pipeline rules over each piece. */
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
    // The test diorama against the first diorama's cap (plan estetica-c M3, with the characters). Since M4 (QA
    // M3 note) going over FAILS the build: before it only warned, and a warning stops no one.
    if (d.id === "test") {
      const pasa = d.bytes / MB <= b.assets_muelle_mb;
      if (!pasa) ok = false;
      lineas.push(`${pasa ? "OK  " : "FAIL"} diorama test contra assets_muelle_mb: ${mb(d.bytes)} de ${b.assets_muelle_mb} MB`);
    }
  }
  return { ok, lineas };
}

/**
 * Open-world-3d T6 (AC42): each file in the open-world load has a row in the assets registry or in the
 * code one; one without a row (or that does not exist on disk) fails, naming it.
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

/** What the registry says about a piece (plan estetica-c M5). */
export interface FilaMedida {
  id: string;
  archivo: string;
  triangulos?: number | undefined;
  primitivas?: number | undefined;
}

/**
 * Each served piece against its registry row: `triangulos` and `primitivas` must be present and match the measurement,
 * because validate:content's estimator relies on them. A piece without a row is reported by the license registry.
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

/** The served .glb files, with their path from root. */
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
  // T7b (D-841): each look of the catalog, alone, against the same caps (the models and characters are the same).
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
