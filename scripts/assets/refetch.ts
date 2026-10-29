// scripts/assets/refetch.ts: prueba de procedencia por red (open-world-3d T2(e), D-830, D-831, AC11). Puerto de
// tools/fetch-sources.py y tools/derive-assets.mjs del mockup V6. Para cada fila de content/assets-registry.yaml y de
// content/code-registry.yaml: baja el original a una carpeta de scratch VACÍA, verifica su sha256 contra el registro,
// rehace el archivo versionado (derived: el mismo pipeline de optimize.ts; refetched: los bytes tal cual; código
// editado: el upstream con su `<archivo>.patch` aplicado) y lo compara byte a byte con lo versionado. No ejecuta nada
// de lo que baja. Va por red, así que está fuera de `verify`.
//
//   node scripts/assets/refetch.ts [--out <carpeta vacía>]
//
// Una línea por fila (la cuenta de líneas es la de filas de los dos registros):
//   MATCH            el archivo rehecho es idéntico byte a byte al versionado
//   DIFF             el archivo rehecho difiere (falla)
//   SOURCE-MISMATCH  el original bajado no tiene el sha256 del registro (falla)
//   ENCODER-MISMATCH el codificador local no es la versión fijada; se informa aparte, NUNCA cuenta como MATCH
//   ERROR            no se pudo bajar o rehacer (falla)
// Sale con 0 si toda fila es MATCH o ENCODER-MISMATCH.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import { ArchivoRegistroCodigo, type PackAssets, type RegistroAsset, type RegistroCodigo } from "@lg/content-schema";
import { derivarFila, leerRegistro } from "./optimize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const REGISTRO_CODIGO = "content/code-registry.yaml";

export type Estado = "MATCH" | "DIFF" | "SOURCE-MISMATCH" | "ENCODER-MISMATCH" | "ERROR";
export interface Linea {
  estado: Estado;
  archivo: string;
  detalle: string;
}

/** Baja una URL a bytes (inyectable para los tests, sin red). */
export type Bajar = (url: string) => Promise<Uint8Array>;

export const bajarHttp: Bajar = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "learning-game-refetch/1.0" }, redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/**
 * La URL del archivo original de una fila. GitHub `/blob/` → `/raw/` (el mismo commit o rama); una página de modelo de
 * poly.pizza → el único `static.poly.pizza/<uuid>.glb` que nombra su HTML (se lee como texto, no se ejecuta).
 */
export const urlDescarga = async (url: string, bajar: Bajar): Promise<string> => {
  const gh = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/.exec(url);
  if (gh) return `https://github.com/${gh[1]}/raw/${gh[2]}`;
  if (/^https:\/\/poly\.pizza\/m\/[A-Za-z0-9]+$/.test(url)) {
    const html = new TextDecoder().decode(await bajar(url));
    const glbs = [...new Set(html.match(/https:\/\/static\.poly\.pizza\/[0-9a-f-]+\.glb/g) ?? [])];
    if (glbs.length !== 1) throw new Error(`la página ${url} nombra ${glbs.length} .glb (se esperaba 1)`);
    return glbs[0] as string;
  }
  return url;
};

/** Escribe bytes en la carpeta de scratch, en la ruta del archivo versionado. */
const guardar = (scratch: string, rel: string, bytes: Uint8Array): string => {
  const abs = join(scratch, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  return abs;
};

const comparar = (root: string, archivo: string, rehecho: Uint8Array, extra = ""): Linea => {
  const versionado = readFileSync(join(root, archivo));
  const ok = Buffer.compare(Buffer.from(rehecho), versionado) === 0;
  return { estado: ok ? "MATCH" : "DIFF", archivo, detalle: `${sha(rehecho)}${ok ? "" : ` != ${sha(versionado)}`}${extra}` };
};

/** Una fila de asset: bajar, verificar el original, rehacer, comparar. */
export const refetchAsset = async (fila: RegistroAsset, pack: PackAssets | undefined, scratch: string, bajar: Bajar, root = ROOT): Promise<Linea> => {
  const archivo = fila.archivo;
  try {
    if (fila.procedencia === "generated") {
      // SEAM (T7, bake-trees): una fila generated se rehace corriendo su `generador` con su preset y semilla, no por red.
      return { estado: "ERROR", archivo, detalle: "procedencia generated: el re-horneado llega con scripts/assets/bake-trees.ts (T7)" };
    }
    if (archivo.endsWith(".ktx2")) {
      // SEAM (T6, PD-4): re-codificar con el basisu fijado en la config versionada; si la versión local difiere, la
      // línea es ENCODER-MISMATCH con las dos versiones (y el sha256 del original igual se verifica).
      return { estado: "ERROR", archivo, detalle: "KTX2: la re-codificación con basisu fijado llega con T6" };
    }
    if (!fila.url_origen || !fila.sha256_original) return { estado: "ERROR", archivo, detalle: "la fila no tiene url_origen o sha256_original" };
    const url = await urlDescarga(fila.url_origen, bajar);
    const original = await bajar(url);
    guardar(scratch, `originales/${fila.id}`, original);
    if (sha(original) !== fila.sha256_original) {
      return { estado: "SOURCE-MISMATCH", archivo, detalle: `${url}: sha256 ${sha(original)} != registro ${fila.sha256_original}` };
    }
    const rehecho = fila.procedencia === "refetched" ? original : (await derivarFila(fila, pack, original)).glb;
    guardar(scratch, archivo, rehecho);
    return comparar(root, archivo, rehecho, ` (${url})`);
  } catch (e) {
    return { estado: "ERROR", archivo, detalle: e instanceof Error ? e.message : String(e) };
  }
};

/** Aplica `parche` (rutas relativas a la raíz del repo, formato `git diff`) sobre la copia de scratch. */
const aplicarParche = (scratch: string, parcheAbs: string): void => {
  const r = spawnSync("git", ["apply", "--whitespace=nowarn", parcheAbs], { cwd: scratch, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git apply ${parcheAbs}: ${r.stderr.trim()}`);
};

/** Una fila de código: bajar el upstream, verificar su hash, aplicar el parche si está editado, comparar. */
export const refetchCodigo = async (fila: RegistroCodigo, scratch: string, bajar: Bajar, root = ROOT): Promise<Linea> => {
  const archivo = fila.archivo;
  try {
    const original = await bajar(fila.url_origen);
    if (sha(original) !== fila.sha256_original) {
      return { estado: "SOURCE-MISMATCH", archivo, detalle: `${fila.url_origen}: sha256 ${sha(original)} != registro ${fila.sha256_original}` };
    }
    const abs = guardar(scratch, archivo, original);
    if (fila.editado && fila.parche) aplicarParche(scratch, join(root, fila.parche));
    return comparar(root, archivo, new Uint8Array(readFileSync(abs)), fila.editado ? ` (upstream + ${fila.parche})` : "");
  } catch (e) {
    return { estado: "ERROR", archivo, detalle: e instanceof Error ? e.message : String(e) };
  }
};

export const leerRegistroCodigo = (root = ROOT): RegistroCodigo[] => {
  const abs = join(root, REGISTRO_CODIGO);
  return existsSync(abs) ? ArchivoRegistroCodigo.parse(parse(readFileSync(abs, "utf8"))).codigo : [];
};

export const correr = async (scratch: string, bajar: Bajar, root = ROOT): Promise<Linea[]> => {
  const { packs, assets } = leerRegistro(root);
  const lineas: Linea[] = [];
  for (const fila of assets) lineas.push(await refetchAsset(fila, packs.get(fila.pack), scratch, bajar, root));
  for (const fila of leerRegistroCodigo(root)) lineas.push(await refetchCodigo(fila, scratch, bajar, root));
  return lineas;
};

export const resumen = (lineas: readonly Linea[]): { ok: boolean; cuenta: Record<Estado, number> } => {
  const cuenta: Record<Estado, number> = { "MATCH": 0, "DIFF": 0, "SOURCE-MISMATCH": 0, "ENCODER-MISMATCH": 0, "ERROR": 0 };
  for (const l of lineas) cuenta[l.estado] += 1;
  return { ok: cuenta.DIFF + cuenta["SOURCE-MISMATCH"] + cuenta.ERROR === 0, cuenta };
};

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  const i = process.argv.indexOf("--out");
  const out = i > 0 ? resolve(process.argv[i + 1] as string) : mkdtempSync(join(tmpdir(), "lg-refetch-"));
  if (existsSync(out) && readdirSync(out).length > 0) {
    console.error(`refetch: ${out} no está vacía`);
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const lineas = await correr(out, bajarHttp);
  for (const l of lineas) console.log(`${l.estado.padEnd(16)} ${l.archivo} ${l.detalle}`);
  const { ok, cuenta } = resumen(lineas);
  console.log(`refetch: ${lineas.length} filas, ${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(", ")}; scratch ${out}`);
  process.exitCode = ok ? 0 : 1;
}
