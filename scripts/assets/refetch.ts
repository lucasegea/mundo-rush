// scripts/assets/refetch.ts: network provenance proof (open-world-3d T2(e), D-830, D-831, AC11). Port of
// tools/fetch-sources.py and tools/derive-assets.mjs of the mockup V6. For each row of content/assets-registry.yaml and of
// content/code-registry.yaml: downloads the original into an EMPTY scratch folder, checks its sha256 against the registry,
// rebuilds the versioned file (derived: the same optimize.ts pipeline; refetched: the bytes as they are; edited
// code: the upstream with its `<file>.patch` applied) and compares it byte by byte with the versioned one. It does not run anything
// it downloads. It goes over the network, so it is outside `verify`.
//
//   node scripts/assets/refetch.ts [--out <empty folder>]
//
// One line per row (the line count is that of the rows of the two registries):
//   MATCH            the rebuilt file is byte-for-byte identical to the versioned one
//   DIFF             the rebuilt file differs (fails)
//   SOURCE-MISMATCH  the downloaded original does not have the registry's sha256 (fails)
//   ENCODER-MISMATCH the local encoder is not the pinned version; reported separately, NEVER counts as MATCH
//   ERROR            could not download or rebuild (fails)
// Exits with 0 if every row is MATCH or ENCODER-MISMATCH.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import { ArchivoRegistroCodigo, type PackAssets, type RegistroAsset, type RegistroCodigo } from "@lg/content-schema";
import { BASISU, basisuCommand, encodeKtx2, EncoderMismatch, loadEncoder, mapKindOf } from "./ktx2.ts";
import { derivarFila, leerRegistro } from "./optimize.ts";
import { bakeAll, sha256 as shaArchivo } from "./bake-trees.ts";
import { NATURE_CACHE, natureJob } from "./nature.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const REGISTRO_CODIGO = "content/code-registry.yaml";

export type Estado = "MATCH" | "DIFF" | "SOURCE-MISMATCH" | "ENCODER-MISMATCH" | "ERROR";
export interface Linea {
  estado: Estado;
  archivo: string;
  detalle: string;
}

/** Downloads a URL to bytes (injectable for tests, no network). */
export type Bajar = (url: string) => Promise<Uint8Array>;

export const bajarHttp: Bajar = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "learning-game-refetch/1.0" }, redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/**
 * The URL of a row's original file. GitHub `/blob/` → `/raw/` (the same commit or branch); a poly.pizza model
 * page → the only `static.poly.pizza/<uuid>.glb` its HTML names (read as text, not executed).
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

/** Writes bytes into the scratch folder, at the versioned file's path. */
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

/** An asset row: download, verify the original, rebuild, compare. */
export const refetchAsset = async (fila: RegistroAsset, pack: PackAssets | undefined, scratch: string, bajar: Bajar, root = ROOT): Promise<Linea> => {
  const archivo = fila.archivo;
  try {
    if (fila.procedencia === "generated") return await rehornear(fila, scratch, root);
    const job = natureJob(archivo);
    if (job) return await refetchNature(fila, job, scratch, bajar, root);
    if (!fila.url_origen || !fila.sha256_original) return { estado: "ERROR", archivo, detalle: "la fila no tiene url_origen o sha256_original" };
    const url = await urlDescarga(fila.url_origen, bajar);
    const original = await bajar(url);
    guardar(scratch, `originales/${fila.id}`, original);
    if (sha(original) !== fila.sha256_original) {
      return { estado: "SOURCE-MISMATCH", archivo, detalle: `${url}: sha256 ${sha(original)} != registro ${fila.sha256_original}` };
    }
    if (archivo.endsWith(".ktx2")) {
      // Open-world-3d T6 (PD-4, D-832): re-encoded with the pinned basisu (scripts/assets/ktx2.ts) and compared byte by
      // byte. If the local encoder is not the pinned one, the line is ENCODER-MISMATCH (never MATCH, never a false failure).
      const kind = mapKindOf(archivo);
      if (!kind) return { estado: "ERROR", archivo, detalle: "un .ktx2 que no es -diff ni -nor: ktx2.ts no sabe codificarlo" };
      let encoder: Uint8Array;
      try {
        encoder = await loadEncoder(root, bajar);
      } catch (e) {
        if (e instanceof EncoderMismatch) return { estado: "ENCODER-MISMATCH", archivo, detalle: `${e.message}; se esperaba basisu ${BASISU.version}` };
        throw e;
      }
      const rehecho = await encodeKtx2(original, kind, encoder);
      guardar(scratch, archivo, rehecho);
      return comparar(root, archivo, rehecho, ` (${url}, ${basisuCommand(kind)})`);
    }
    const rehecho = fila.procedencia === "refetched" ? original : (await derivarFila(fila, pack, original)).glb;
    guardar(scratch, archivo, rehecho);
    return comparar(root, archivo, rehecho, ` (${url})`);
  } catch (e) {
    return { estado: "ERROR", archivo, detalle: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Open-world-3d T7: a generated row is rebuilt by running its generator (bake-trees.ts, no network) if the script is the one
 * the row says (sha256), and compared byte by byte.
 */
let horneados: Promise<{ file: string; glb: Uint8Array }[]> | null = null;
const rehornear = async (fila: RegistroAsset, scratch: string, root: string): Promise<Linea> => {
  const archivo = fila.archivo;
  const g = fila.generador;
  if (!g) return { estado: "ERROR", archivo, detalle: "fila generated sin generador" };
  const actual = shaArchivo(new Uint8Array(readFileSync(join(root, g.archivo))));
  if (actual !== g.sha256) return { estado: "SOURCE-MISMATCH", archivo, detalle: `${g.archivo}: sha256 ${actual} != registro ${g.sha256}` };
  horneados ??= bakeAll(root);
  const t = (await horneados).find((h) => h.file === archivo);
  if (!t) return { estado: "ERROR", archivo, detalle: `${g.archivo} no hornea ${archivo}` };
  guardar(scratch, archivo, t.glb);
  return comparar(root, archivo, t.glb, ` (${g.archivo} preset ${g.preset}, semilla ${g.semilla})`);
};

/**
 * Open-world-3d T7: a file of scripts/assets/nature.ts. Downloads each original of the row (`url_origen` and
 * `fuentes_extra`) into the scratch folder's cache, checks its sha256 and derives with those bytes.
 */
const refetchNature = async (fila: RegistroAsset, job: NonNullable<ReturnType<typeof natureJob>>, scratch: string, bajar: Bajar, root: string): Promise<Linea> => {
  const archivo = fila.archivo;
  const fuentes = [{ url: fila.url_origen ?? "", sha256: fila.sha256_original ?? "" }, ...(fila.fuentes_extra ?? [])];
  for (const o of job.sources) {
    const f = fuentes.find((x) => x.url === o.url);
    if (!f) return { estado: "ERROR", archivo, detalle: `la fila no nombra el original ${o.url}` };
    const bytes = await bajar(o.url);
    if (sha(bytes) !== f.sha256) return { estado: "SOURCE-MISMATCH", archivo, detalle: `${o.url}: sha256 ${sha(bytes)} != registro ${f.sha256}` };
    guardar(scratch, join(NATURE_CACHE, o.file), bytes);
  }
  let encoder: Uint8Array;
  try {
    encoder = await loadEncoder(root, bajar);
  } catch (e) {
    if (e instanceof EncoderMismatch) return { estado: "ENCODER-MISMATCH", archivo, detalle: `${e.message}; se esperaba basisu ${BASISU.version}` };
    throw e;
  }
  const { bytes } = await job.make(scratch, encoder);
  guardar(scratch, archivo, bytes);
  return comparar(root, archivo, bytes, ` (scripts/assets/nature.ts, ${job.sources.length} original(es))`);
};

/** Applies `parche` (paths relative to the repo root, `git diff` format) over the scratch copy. */
const aplicarParche = (scratch: string, parcheAbs: string): void => {
  // Without core.autocrlf: with `true` (the operator's machine) git apply writes CRLF and the bytes do not match (T7, measured).
  const r = spawnSync("git", ["-c", "core.autocrlf=false", "apply", "--whitespace=nowarn", parcheAbs], { cwd: scratch, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git apply ${parcheAbs}: ${r.stderr.trim()}`);
};

/** A code row: download the upstream, check its hash, apply the patch if edited, compare. */
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
