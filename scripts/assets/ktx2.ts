// scripts/assets/ktx2.ts: the open world's photographic maps as .ktx2 (open-world-3d T6, PD-4, D-832). Downloads
// the Poly Haven original (CC0) into assets-src/ (gitignored), checks its sha256 and encodes it to Basis with a
// PINNED basisu: version 2.50.0 compiled to single-threaded WASI (`basisu_st.wasm` from Binomial's repo, Apache-2.0),
// run with `node:wasi`, no new npm dependency and no installed binary. A single thread gives stable bytes: the same
// original and the same flags give the same .ktx2 (refetch.ts checks it over the network). Each map's format and size
// come from step 0's table (`npm run assets:texture-table`, AC74): 1024 ETC1S diffuse, 512 ETC1S normals.
//
//   node scripts/assets/ktx2.ts            encodes the missing (or changed) maps and writes their .ktx2
//   node scripts/assets/ktx2.ts --check    re-encodes everything in memory and compares with the versioned files (exits 1 if it differs)
//
// The encoder's .wasm is downloaded once into assets-src/tools/basisu/ and checked against its pinned sha256; if the
// local file does not match, encoding is refused (refetch.ts reports it as ENCODER-MISMATCH).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WASI } from "node:wasi";
import { GROUND_DIFFUSE_PX, GROUND_MAPS, GROUND_NORMAL_PX, groundTextureFile, type GroundMap } from "@lg/art";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The pinned encoder (D-832): version, origin and sha256 of the single-threaded .wasm. */
export const BASISU = {
  version: "2.50.0",
  url: "https://raw.githubusercontent.com/BinomialLLC/basis_universal/v2_50/bin/basisu_st.wasm",
  sha256: "b42d951b1bf146133578e8c7927ad4a4a857552846a46a3ee33b541b2a06bc7d",
  cache: "assets-src/tools/basisu/basisu_st-v2_50.wasm",
  licencia: "Apache-2.0",
} as const;

/** Flags per map type (each row records them in `modificaciones`). Single thread: the `_st` .wasm has no threads. */
export const KTX2_FLAGS = {
  diff: ["-ktx2", "-mipmap", "-q", "128"],
  nor: ["-ktx2", "-mipmap", "-normal_map", "-q", "160"],
} as const;
export type MapKind = keyof typeof KTX2_FLAGS;

/** Poly Haven original of a ground map (1k JPG; the normal is the OpenGL convention one). */
export const polyHavenUrl = (map: GroundMap, kind: MapKind): string =>
  `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${map}/${map}_${kind === "diff" ? "diff" : "nor_gl"}_1k.jpg`;
export const sourceCache = (map: GroundMap, kind: MapKind): string => `assets-src/polyhaven/${map}_${kind === "diff" ? "diff" : "nor_gl"}_1k.jpg`;
export const targetPx = (kind: MapKind): number => (kind === "diff" ? GROUND_DIFFUSE_PX : GROUND_NORMAL_PX);
/** The map type of a served .ktx2, by its name (`<map>-diff.ktx2` or `<map>-nor.ktx2`); null if it is not a ground one. */
export const mapKindOf = (file: string): MapKind | null => (file.endsWith("-diff.ktx2") ? "diff" : file.endsWith("-nor.ktx2") ? "nor" : null);

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** The command line recorded in the row (`modificaciones`). */
export function basisuCommand(kind: MapKind, sourcePx = 1024): string {
  const px = targetPx(kind);
  const resample = px !== sourcePx ? ` -resample ${px} ${px}` : "";
  return `basisu ${BASISU.version} (basisu_st.wasm, WASI, un hilo) ${KTX2_FLAGS[kind].join(" ")}${resample}`;
}

/** Downloads a url to bytes (used by the encoder and the originals; refetch.ts passes its own `bajar`). */
export const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** The pinned .wasm, read from the cache or downloaded; throws EncoderMismatch if its sha256 is not the pinned one. */
export async function loadEncoder(root = ROOT, download: ((url: string) => Promise<Uint8Array>) | null = fetchBytes): Promise<Uint8Array> {
  const abs = join(root, BASISU.cache);
  if (!existsSync(abs)) {
    if (!download) throw new Error(`falta el codificador ${BASISU.cache}`);
    const bytes = await download(BASISU.url);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
  }
  const bytes = new Uint8Array(readFileSync(abs));
  if (sha256(bytes) !== BASISU.sha256) throw new EncoderMismatch(`${BASISU.cache}: sha256 ${sha256(bytes)} != fijado ${BASISU.sha256} (basisu ${BASISU.version})`);
  return bytes;
}

/** The local encoder is not the pinned one: refetch.ts reports it as ENCODER-MISMATCH, never as MATCH. */
export class EncoderMismatch extends Error {
  constructor(m: string) {
    super(m);
    this.name = "EncoderMismatch";
  }
}

/** WebAssembly without the DOM lib (scripts/ compiles with Node's types, which do not declare the global namespace). */
const WASM = (globalThis as unknown as { WebAssembly: { compile(b: Uint8Array): Promise<object>; instantiate(m: object, imports: object): Promise<object> } }).WebAssembly;
let compiled: object | null = null;

/** Open-world-3d T7: a PNG original (derived in memory by scripts/assets/nature.ts) and its target side. */
export interface EncodeOptions {
  ext?: "jpg" | "png";
  targetPx?: number;
}

/**
 * Encodes an original (JPG or PNG) to .ktx2 with the pinned basisu, in a temporary folder deleted at the end. The
 * WASI process sees only that folder.
 */
export async function encodeKtx2(source: Uint8Array, kind: MapKind, encoder: Uint8Array, sourcePx = 1024, opts: EncodeOptions = {}): Promise<Uint8Array> {
  compiled ??= await WASM.compile(encoder);
  const dir = mkdtempSync(join(tmpdir(), "lg-basisu-"));
  try {
    const input = `in.${opts.ext ?? "jpg"}`;
    writeFileSync(join(dir, input), source);
    const px = opts.targetPx ?? targetPx(kind);
    const args = ["basisu", ...KTX2_FLAGS[kind], ...(px !== sourcePx ? ["-resample", String(px), String(px)] : []), "-file", input, "-output_file", "out.ktx2"];
    const wasi = new WASI({ version: "preview1", args, env: {}, preopens: { ".": dir }, returnOnExit: true, stdout: 2, stderr: 2 });
    const code = wasi.start(await WASM.instantiate(compiled, wasi.getImportObject()));
    if (code !== 0 || !existsSync(join(dir, "out.ktx2"))) throw new Error(`basisu salió con ${code} (${kind})`);
    return new Uint8Array(readFileSync(join(dir, "out.ktx2")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A map's original: from the assets-src cache or downloaded. */
export async function loadSource(map: GroundMap, kind: MapKind, root = ROOT): Promise<Uint8Array> {
  const abs = join(root, sourceCache(map, kind));
  if (!existsSync(abs)) {
    const bytes = await fetchBytes(polyHavenUrl(map, kind));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
  }
  return new Uint8Array(readFileSync(abs));
}

export interface EncodedMap {
  map: GroundMap;
  kind: MapKind;
  file: string;
  sourceSha: string;
  sha: string;
  bytes: number;
}

export async function run(argv: readonly string[] = process.argv.slice(2), log: (s: string) => void = console.log, root = ROOT): Promise<number> {
  const check = argv.includes("--check");
  // node:wasi warns that it is experimental on every run; the warning is not an error.
  const encoder = await loadEncoder(root);
  const out: EncodedMap[] = [];
  let ok = true;
  for (const map of GROUND_MAPS) {
    for (const kind of ["diff", "nor"] as const) {
      const source = await loadSource(map, kind, root);
      const bytes = await encodeKtx2(source, kind, encoder);
      const file = groundTextureFile(map, kind);
      const abs = join(root, file);
      if (check) {
        const same = existsSync(abs) && sha256(new Uint8Array(readFileSync(abs))) === sha256(bytes);
        if (!same) ok = false;
        log(`${same ? "MATCH" : "DIFF "} ${file}`);
      } else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, bytes);
      }
      out.push({ map, kind, file, sourceSha: sha256(source), sha: sha256(bytes), bytes: bytes.byteLength });
    }
  }
  for (const e of out) log(`${e.file} ${e.bytes} bytes sha256 ${e.sha} original ${e.sourceSha} (${polyHavenUrl(e.map, e.kind)})`);
  return ok ? 0 : 1;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = await run();
}
