// scripts/assets/ktx2.ts: los mapas fotográficos del mundo abierto como .ktx2 (open-world-3d T6, PD-4, D-832). Baja
// el original de Poly Haven (CC0) a assets-src/ (gitignored), verifica su sha256 y lo codifica a Basis con basisu
// FIJADO: la versión 2.50.0 compilada a WASI de un solo hilo (`basisu_st.wasm` del repo de Binomial, Apache-2.0),
// corrida con `node:wasi`, sin dependencia npm nueva y sin binario instalado. Un solo hilo da bytes estables: el mismo
// original y los mismos flags dan el mismo .ktx2 (refetch.ts lo comprueba por red). El formato y el tamaño de cada mapa
// salen de la tabla del paso 0 (`npm run assets:texture-table`, AC74): difusos ETC1S de 1024, normales ETC1S de 512.
//
//   node scripts/assets/ktx2.ts            codifica los mapas que faltan (o cambiaron) y escribe sus .ktx2
//   node scripts/assets/ktx2.ts --check    re-codifica todo en memoria y compara con lo versionado (sale 1 si difiere)
//
// El .wasm del codificador se baja una vez a assets-src/tools/basisu/ y se verifica contra su sha256 fijado; si el
// archivo local no coincide, la codificación se niega (refetch.ts lo informa como ENCODER-MISMATCH).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WASI } from "node:wasi";
import { GROUND_DIFFUSE_PX, GROUND_MAPS, GROUND_NORMAL_PX, groundTextureFile, type GroundMap } from "@lg/art";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** El codificador fijado (D-832): versión, origen y sha256 del .wasm de un solo hilo. */
export const BASISU = {
  version: "2.50.0",
  url: "https://raw.githubusercontent.com/BinomialLLC/basis_universal/v2_50/bin/basisu_st.wasm",
  sha256: "b42d951b1bf146133578e8c7927ad4a4a857552846a46a3ee33b541b2a06bc7d",
  cache: "assets-src/tools/basisu/basisu_st-v2_50.wasm",
  licencia: "Apache-2.0",
} as const;

/** Flags por tipo de mapa (los registra cada fila en `modificaciones`). Un solo hilo: el .wasm `_st` no tiene hilos. */
export const KTX2_FLAGS = {
  diff: ["-ktx2", "-mipmap", "-q", "128"],
  nor: ["-ktx2", "-mipmap", "-normal_map", "-q", "160"],
} as const;
export type MapKind = keyof typeof KTX2_FLAGS;

/** Original de Poly Haven de un mapa del suelo (1k JPG; el normal es el de convención OpenGL). */
export const polyHavenUrl = (map: GroundMap, kind: MapKind): string =>
  `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${map}/${map}_${kind === "diff" ? "diff" : "nor_gl"}_1k.jpg`;
export const sourceCache = (map: GroundMap, kind: MapKind): string => `assets-src/polyhaven/${map}_${kind === "diff" ? "diff" : "nor_gl"}_1k.jpg`;
export const targetPx = (kind: MapKind): number => (kind === "diff" ? GROUND_DIFFUSE_PX : GROUND_NORMAL_PX);
/** El tipo de mapa de un .ktx2 servido, por su nombre (`<mapa>-diff.ktx2` o `<mapa>-nor.ktx2`); null si no es del suelo. */
export const mapKindOf = (file: string): MapKind | null => (file.endsWith("-diff.ktx2") ? "diff" : file.endsWith("-nor.ktx2") ? "nor" : null);

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** La línea de comando registrada en la fila (`modificaciones`). */
export function basisuCommand(kind: MapKind, sourcePx = 1024): string {
  const px = targetPx(kind);
  const resample = px !== sourcePx ? ` -resample ${px} ${px}` : "";
  return `basisu ${BASISU.version} (basisu_st.wasm, WASI, un hilo) ${KTX2_FLAGS[kind].join(" ")}${resample}`;
}

/** Baja una url a bytes (lo usan el codificador y los originales; refetch.ts pasa su propio `bajar`). */
export const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** El .wasm fijado, leído del caché o bajado; lanza EncoderMismatch si su sha256 no es el fijado. */
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

/** El codificador local no es el fijado: refetch.ts lo informa como ENCODER-MISMATCH, nunca como MATCH. */
export class EncoderMismatch extends Error {
  constructor(m: string) {
    super(m);
    this.name = "EncoderMismatch";
  }
}

/** WebAssembly sin la lib DOM (scripts/ compila con los tipos de Node, que no declaran el espacio global). */
const WASM = (globalThis as unknown as { WebAssembly: { compile(b: Uint8Array): Promise<object>; instantiate(m: object, imports: object): Promise<object> } }).WebAssembly;
let compiled: object | null = null;

/**
 * Codifica un original (JPG o PNG) a .ktx2 con el basisu fijado, en una carpeta temporal que se borra al final. El
 * proceso WASI solo ve esa carpeta.
 */
export async function encodeKtx2(source: Uint8Array, kind: MapKind, encoder: Uint8Array, sourcePx = 1024): Promise<Uint8Array> {
  compiled ??= await WASM.compile(encoder);
  const dir = mkdtempSync(join(tmpdir(), "lg-basisu-"));
  try {
    writeFileSync(join(dir, "in.jpg"), source);
    const px = targetPx(kind);
    const args = ["basisu", ...KTX2_FLAGS[kind], ...(px !== sourcePx ? ["-resample", String(px), String(px)] : []), "-file", "in.jpg", "-output_file", "out.ktx2"];
    const wasi = new WASI({ version: "preview1", args, env: {}, preopens: { ".": dir }, returnOnExit: true, stdout: 2, stderr: 2 });
    const code = wasi.start(await WASM.instantiate(compiled, wasi.getImportObject()));
    if (code !== 0 || !existsSync(join(dir, "out.ktx2"))) throw new Error(`basisu salió con ${code} (${kind})`);
    return new Uint8Array(readFileSync(join(dir, "out.ktx2")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** El original de un mapa: del caché de assets-src o bajado. */
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
  // node:wasi avisa que es experimental en cada corrida; el aviso no es un error.
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
