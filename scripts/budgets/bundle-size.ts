// check:budgets (03 §2.7.3, F1.1b): measures the `vite build` output against scripts/budgets/budgets.json.
// Reads Vite's manifest (build.manifest: true → dist/.vite/manifest.json): gzip size per chunk
// and the graph of STATIC imports from each HTML entry. Dynamic imports do not count in the initial
// load (the 3D chunk is downloaded in the background).
//
// F2 A6: also reads dist/.vite/chunk-modules.json (written by the lg-chunk-modules plugin of apps/web/vite.config.ts:
// chunk file → modules it contains) and fails if any chunk of index.html's static graph brings modules of
// three or @react-three/*. The text signature of F1.3 stays as a second net.
//
// Plan estetica-c M2: the self-hosted meshopt decoder (public/decoders/, 03 §4.2) is downloaded together with the 3D world, so
// its gzip is added to the 3D chunk (the files of dist/decoders/ enter as extras of each world entry).
//
// Plan estetica-c M6 (03 §2.9, D-160): post-processing is a separate chunk that `low` and `dialog-only` never download. If
// the manifest has the world canvas, it fails when Post is not its own dynamic entry or when the canvas's static graph
// (or the shell's) brings Post's entry or postprocessing / @react-three/postprocessing modules.
// M6 SEAM: M7 requires that the 3D chunk not grow compared with M6; the reference number is the one this check prints when
// M6 closes (it is in M6's build record).
//
// Usage: node scripts/budgets/bundle-size.ts [--dist <dir>]   (default apps/web/dist)
// Exits with 1 if a budget is exceeded or the manifest is missing; with 0 if everything fits.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export interface Budgets {
  shell_js_css_gzip_kb: number;
  chunk_3d_gzip_kb: number;
  docente_gzip_kb: number;
  assets_muelle_mb: number;
  assets_muelle_plaza_mb: number;
  audio_lineas_por_mision_mb: number;
}

export const BUDGET_KEYS = [
  "shell_js_css_gzip_kb",
  "chunk_3d_gzip_kb",
  "docente_gzip_kb",
  "assets_muelle_mb",
  "assets_muelle_plaza_mb",
  "audio_lineas_por_mision_mb",
] as const satisfies readonly (keyof Budgets)[];

/** An entry of Vite's manifest (only the fields the check uses). */
export interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}
export type Manifest = Record<string, ManifestChunk>;

export interface ChunkSize {
  key: string;
  file: string;
  gzipBytes: number;
}

export interface BudgetResult {
  name: string;
  budgetKey: keyof Budgets;
  capKb: number;
  totalKb: number;
  ok: boolean;
  chunks: ChunkSize[];
}

export interface CheckReport {
  ok: boolean;
  results: BudgetResult[];
  skipped: string[];
  /** Rules that are not about size (F1.3 A5): three inside the shell's initial load. */
  violations: string[];
}

/** Chunk file → ids of the modules it contains (relative paths: from node_modules/ or from the app). */
export type ChunkModules = Record<string, string[]>;

/** A module of three or of @react-three/* (03 §2.7.3: the shell loads without three). */
export const THREE_MODULE = /(^|\/)node_modules\/(three|@react-three\/[^/]+)\//;

/** Signature of three.js in a compiled chunk: its "THREE.WebGLRenderer: …" messages survive minification. */
export const THREE_SIGNATURE = /["'`]THREE\.[A-Z]\w+/;

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
export const BUDGETS_PATH = join(SCRIPT_DIR, "budgets.json");
export const DEFAULT_DIST = join(ROOT, "apps/web/dist");
export const MANIFEST_RELATIVE = ".vite/manifest.json";
export const CHUNK_MODULES_RELATIVE = ".vite/chunk-modules.json";
/** The dist folder with the self-hosted decoders (copy of apps/web/public/decoders/). */
export const DECODERS_RELATIVE = "decoders";

const SHELL_ENTRY = "index.html";
const DOCENTE_ENTRY = "docente.html";
const WORLD_PREFIX = "src/world/";
/** The world canvas and post-processing (plan estetica-c M6): Post is downloaded only if the tier uses it. */
export const WORLD_CANVAS_ENTRY = "src/world/GameCanvas.tsx";
export const POST_ENTRY = "src/world/post/Post.tsx";
/** A post-processing module (the library and its R3F wrapper). */
export const POST_MODULE = /(^|\/)node_modules\/(postprocessing|@react-three\/postprocessing)\//;

/** Reads and validates budgets.json: exactly the keys of 03 §2.7.3, all positive numbers. */
export function loadBudgets(path = BUDGETS_PATH): Budgets {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const keys = Object.keys(raw).sort();
  const expected = [...BUDGET_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`budgets.json: claves ${keys.join(", ")}; se esperaban ${expected.join(", ")}`);
  }
  for (const key of BUDGET_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`budgets.json: ${key} tiene que ser un número positivo`);
    }
  }
  return raw as unknown as Budgets;
}

/** Manifest keys reachable from `entry` by static imports (including the entry). */
export function staticClosure(manifest: Manifest, entry: string): string[] {
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`manifiesto: "${key}" se importa pero no está en el manifiesto`);
    seen.add(key);
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  visit(entry);
  return [...seen];
}

// KB = 1000 bytes, like the "kB" that `vite build` prints: the number the operator sees is the one that is compared.
const kb = (bytes: number): number => Math.round((bytes / 1000) * 100) / 100;

function measure(
  manifest: Manifest,
  keys: readonly string[],
  gzipSize: (file: string) => number,
): ChunkSize[] {
  const sizes: ChunkSize[] = [];
  for (const key of keys) {
    const chunk = manifest[key] as ManifestChunk;
    sizes.push({ key, file: chunk.file, gzipBytes: gzipSize(chunk.file) });
    for (const css of chunk.css ?? []) sizes.push({ key, file: css, gzipBytes: gzipSize(css) });
  }
  // A shared CSS may appear in two chunks: it is counted once.
  const unique = new Map(sizes.map((s) => [s.file, s]));
  return [...unique.values()].sort((a, b) => b.gzipBytes - a.gzipBytes);
}

function result(name: string, budgetKey: keyof Budgets, capKb: number, chunks: ChunkSize[]): BudgetResult {
  const totalKb = kb(chunks.reduce((sum, c) => sum + c.gzipBytes, 0));
  return { name, budgetKey, capKb, totalKb, ok: totalKb <= capKb, chunks };
}

/**
 * Checks the manifest against the bundle budgets. `gzipSize(file)` returns the gzip
 * bytes of a dist file (injected: the tests pass sizes without touching disk).
 */
export function checkBundle(
  manifest: Manifest,
  budgets: Budgets,
  gzipSize: (file: string) => number,
  fileText?: (file: string) => string,
  chunkModules?: ChunkModules,
  /** Dist files downloaded with the 3D world that are not Vite chunks (the meshopt decoder). */
  worldExtras: readonly string[] = [],
): CheckReport {
  if (!manifest[SHELL_ENTRY]) {
    throw new Error(`manifiesto: falta la entrada "${SHELL_ENTRY}" (¿build.manifest: true en apps/web/vite.config.ts?)`);
  }
  const results: BudgetResult[] = [];
  const skipped: string[] = [];

  const shellKeys = staticClosure(manifest, SHELL_ENTRY);
  results.push(result(`shell (${SHELL_ENTRY}, carga inicial)`, "shell_js_css_gzip_kb", budgets.shell_js_css_gzip_kb,
    measure(manifest, shellKeys, gzipSize)));

  // 03 §2.7.3: the shell loads without three. With the chunks' text at hand, their signature is searched for (F1.3 A5).
  const violations: string[] = [];
  if (fileText) {
    for (const key of shellKeys) {
      const file = (manifest[key] as ManifestChunk).file;
      if (file.endsWith(".js") && THREE_SIGNATURE.test(fileText(file))) violations.push(`three en la carga inicial del shell: ${file} (${key})`);
    }
  }
  // F2 A6: by modules. A chunk of the static graph with no entry in the map also fails (no false green).
  if (chunkModules) {
    for (const key of shellKeys) {
      const file = (manifest[key] as ManifestChunk).file;
      if (!file.endsWith(".js")) continue;
      const modules = chunkModules[file];
      if (!modules) {
        violations.push(`mapa de módulos sin el chunk ${file} (${key})`);
        continue;
      }
      const hit = modules.find((m) => THREE_MODULE.test(m));
      if (hit) violations.push(`three/@react-three en la carga inicial del shell: ${file} (${key}) trae ${hit}`);
    }
  }

  const shellSet = new Set(shellKeys);
  const worldEntries = Object.keys(manifest).filter(
    (key) => manifest[key]?.isDynamicEntry === true && (manifest[key]?.src ?? key).startsWith(WORLD_PREFIX),
  );
  if (worldEntries.length === 0) skipped.push("chunk_3d_gzip_kb: sin chunk 3D todavía (llega con F2)");
  for (const entry of worldEntries) {
    const own = staticClosure(manifest, entry).filter((key) => !shellSet.has(key));
    const extras = worldExtras.map((file): ChunkSize => ({ key: "public/decoders", file, gzipBytes: gzipSize(file) }));
    results.push(result(`chunk 3D (${entry})`, "chunk_3d_gzip_kb", budgets.chunk_3d_gzip_kb,
      [...measure(manifest, own, gzipSize), ...extras].sort((a, b) => b.gzipBytes - a.gzipBytes)));
  }

  violations.push(...checkPostChunk(manifest, shellKeys, chunkModules));

  if (manifest[DOCENTE_ENTRY]) {
    results.push(result(`panel docente (${DOCENTE_ENTRY})`, "docente_gzip_kb", budgets.docente_gzip_kb,
      measure(manifest, staticClosure(manifest, DOCENTE_ENTRY), gzipSize)));
  } else {
    skipped.push("docente_gzip_kb: sin docente.html (F11.2, postergada)");
  }
  skipped.push("assets_muelle_mb, assets_muelle_plaza_mb: los mide scripts/assets/inspect-budgets.ts (plan estetica-c M2)");
  skipped.push("audio_lineas_por_mision_mb: sin audio guionado todavía (F8)");

  return { ok: results.every((r) => r.ok) && violations.length === 0, results, skipped, violations };
}

/**
 * Plan estetica-c M6: post-processing in its own chunk. With the world canvas in the manifest, Post has to be
 * a dynamic entry and neither the canvas's static graph nor the shell's may bring it (or its modules): that way `low` and
 * `dialog-only`, which mount the canvas without Post, never download it. With nothing from `src/world/` in the manifest (before
 * F2) there is nothing to check; with world modules and without the canvas key, it fails (QA's note 4 in M6): a renamed
 * canvas cannot let the check pass vacuously.
 */
export function checkPostChunk(manifest: Manifest, shellKeys: readonly string[], chunkModules?: ChunkModules): string[] {
  if (!manifest[WORLD_CANVAS_ENTRY]) {
    const world = Object.keys(manifest).filter((key) => (manifest[key]?.src ?? key).startsWith(WORLD_PREFIX));
    return world.length === 0 ? [] : [`falta la entrada del canvas ${WORLD_CANVAS_ENTRY} en el manifiesto, con módulos del mundo (${world.join(", ")}): no se puede chequear el chunk del postprocesado`];
  }
  const violations: string[] = [];
  const post = manifest[POST_ENTRY];
  if (!post || post.isDynamicEntry !== true) violations.push(`postprocesado sin chunk propio: falta la entrada dinámica ${POST_ENTRY}`);
  const loadedWithoutPost = new Set([...shellKeys, ...staticClosure(manifest, WORLD_CANVAS_ENTRY)]);
  if (loadedWithoutPost.has(POST_ENTRY)) violations.push(`postprocesado en el grafo estático del canvas: ${POST_ENTRY}`);
  if (chunkModules) {
    for (const key of loadedWithoutPost) {
      const file = (manifest[key] as ManifestChunk).file;
      if (!file.endsWith(".js")) continue;
      const hit = (chunkModules[file] ?? []).find((m) => POST_MODULE.test(m));
      if (hit) violations.push(`postprocesado en el grafo estático del canvas: ${file} (${key}) trae ${hit}`);
    }
  }
  return violations;
}

/** Report text. If a budget is exceeded, it names each chunk of that graph with its size. */
export function formatReport(report: CheckReport): string {
  const lines: string[] = [];
  for (const r of report.results) {
    lines.push(`${r.ok ? "OK  " : "FAIL"} ${r.name}: ${r.totalKb} KB gzip (tope ${r.capKb} KB, ${r.budgetKey})`);
    if (!r.ok) {
      const heaviest = r.chunks[0];
      if (heaviest) lines.push(`     chunk más pesado: ${heaviest.file} (${heaviest.key})`);
      for (const c of r.chunks) lines.push(`     - ${c.file} (${c.key}): ${kb(c.gzipBytes)} KB`);
    }
  }
  for (const v of report.violations) lines.push(`FAIL ${v}`);
  for (const s of report.skipped) lines.push(`n/a  ${s}`);
  return lines.join("\n");
}

/** Runs the check over a real dist. Returns the exit code. */
export function run(distDir = DEFAULT_DIST, budgetsPath = BUDGETS_PATH, log: (line: string) => void = console.log): number {
  const manifestPath = join(distDir, MANIFEST_RELATIVE);
  if (!existsSync(manifestPath)) {
    log(`check:budgets: falta ${manifestPath}. Corré \`npm run build\` antes (build.manifest: true).`);
    return 1;
  }
  const modulesPath = join(distDir, CHUNK_MODULES_RELATIVE);
  if (!existsSync(modulesPath)) {
    log(`check:budgets: falta ${modulesPath} (lo escribe el plugin lg-chunk-modules de apps/web/vite.config.ts).`);
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const chunkModules = JSON.parse(readFileSync(modulesPath, "utf8")) as ChunkModules;
  const gzipSize = (file: string): number => gzipSync(readFileSync(join(distDir, file))).length;
  const fileText = (file: string): string => readFileSync(join(distDir, file), "utf8");
  const decodersDir = join(distDir, DECODERS_RELATIVE);
  const worldExtras = existsSync(decodersDir)
    ? readdirSync(decodersDir).filter((f) => f.endsWith(".js")).sort().map((f) => `${DECODERS_RELATIVE}/${f}`)
    : [];
  const report = checkBundle(manifest, loadBudgets(budgetsPath), gzipSize, fileText, chunkModules, worldExtras);
  log(formatReport(report));
  return report.ok ? 0 : 1;
}

function argValue(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const dist = argValue(process.argv.slice(2), "--dist");
  process.exitCode = run(dist ? resolve(dist) : DEFAULT_DIST);
}
