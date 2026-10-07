// check:budgets (03 §2.7.3, F1.1b): mide la salida de `vite build` contra scripts/budgets/budgets.json.
// Lee el manifiesto de Vite (build.manifest: true → dist/.vite/manifest.json): tamaño gzip por chunk
// y grafo de imports ESTÁTICOS desde cada entrada HTML. Los imports dinámicos no cuentan en la carga
// inicial (el chunk 3D se descarga en segundo plano).
//
// F2 A6: además lee dist/.vite/chunk-modules.json (lo escribe el plugin lg-chunk-modules de apps/web/vite.config.ts:
// archivo de chunk → módulos que contiene) y falla si algún chunk del grafo estático de index.html trae módulos de
// three o @react-three/*. La firma de texto de F1.3 queda como segunda red.
//
// Uso: node scripts/budgets/bundle-size.ts [--dist <dir>]   (por defecto apps/web/dist)
// Sale con 1 si un presupuesto se pasa o si falta el manifiesto; con 0 si todo entra.
import { existsSync, readFileSync } from "node:fs";
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

/** Una entrada del manifiesto de Vite (solo los campos que usa el chequeo). */
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
  /** Reglas que no son de tamaño (F1.3 A5): three dentro de la carga inicial del shell. */
  violations: string[];
}

/** Archivo del chunk → ids de los módulos que contiene (rutas relativas: desde node_modules/ o desde la app). */
export type ChunkModules = Record<string, string[]>;

/** Un módulo de three o de @react-three/* (03 §2.7.3: el shell carga sin three). */
export const THREE_MODULE = /(^|\/)node_modules\/(three|@react-three\/[^/]+)\//;

/** Firma de three.js en un chunk compilado: sus mensajes "THREE.WebGLRenderer: …" sobreviven a la minificación. */
export const THREE_SIGNATURE = /["'`]THREE\.[A-Z]\w+/;

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
export const BUDGETS_PATH = join(SCRIPT_DIR, "budgets.json");
export const DEFAULT_DIST = join(ROOT, "apps/web/dist");
export const MANIFEST_RELATIVE = ".vite/manifest.json";
export const CHUNK_MODULES_RELATIVE = ".vite/chunk-modules.json";

const SHELL_ENTRY = "index.html";
const DOCENTE_ENTRY = "docente.html";
const WORLD_PREFIX = "src/world/";

/** Lee y valida budgets.json: exactamente las claves de 03 §2.7.3, todas números positivos. */
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

/** Claves del manifiesto alcanzables desde `entry` por imports estáticos (incluida la entrada). */
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

// KB = 1000 bytes, como los "kB" que imprime `vite build`: el número que ve el operador es el que se compara.
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
  // Un CSS compartido puede aparecer en dos chunks: se cuenta una vez.
  const unique = new Map(sizes.map((s) => [s.file, s]));
  return [...unique.values()].sort((a, b) => b.gzipBytes - a.gzipBytes);
}

function result(name: string, budgetKey: keyof Budgets, capKb: number, chunks: ChunkSize[]): BudgetResult {
  const totalKb = kb(chunks.reduce((sum, c) => sum + c.gzipBytes, 0));
  return { name, budgetKey, capKb, totalKb, ok: totalKb <= capKb, chunks };
}

/**
 * Chequea el manifiesto contra los presupuestos de bundle. `gzipSize(file)` devuelve los bytes
 * gzip de un archivo del dist (inyectado: los tests pasan tamaños sin tocar disco).
 */
export function checkBundle(
  manifest: Manifest,
  budgets: Budgets,
  gzipSize: (file: string) => number,
  fileText?: (file: string) => string,
  chunkModules?: ChunkModules,
): CheckReport {
  if (!manifest[SHELL_ENTRY]) {
    throw new Error(`manifiesto: falta la entrada "${SHELL_ENTRY}" (¿build.manifest: true en apps/web/vite.config.ts?)`);
  }
  const results: BudgetResult[] = [];
  const skipped: string[] = [];

  const shellKeys = staticClosure(manifest, SHELL_ENTRY);
  results.push(result(`shell (${SHELL_ENTRY}, carga inicial)`, "shell_js_css_gzip_kb", budgets.shell_js_css_gzip_kb,
    measure(manifest, shellKeys, gzipSize)));

  // 03 §2.7.3: el shell carga sin three. Con el texto de los chunks a mano, se busca su firma (F1.3 A5).
  const violations: string[] = [];
  if (fileText) {
    for (const key of shellKeys) {
      const file = (manifest[key] as ManifestChunk).file;
      if (file.endsWith(".js") && THREE_SIGNATURE.test(fileText(file))) violations.push(`three en la carga inicial del shell: ${file} (${key})`);
    }
  }
  // F2 A6: por módulos. Un chunk del grafo estático sin entrada en el mapa también falla (nada de falso verde).
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
    results.push(result(`chunk 3D (${entry})`, "chunk_3d_gzip_kb", budgets.chunk_3d_gzip_kb,
      measure(manifest, own, gzipSize)));
  }

  if (manifest[DOCENTE_ENTRY]) {
    results.push(result(`panel docente (${DOCENTE_ENTRY})`, "docente_gzip_kb", budgets.docente_gzip_kb,
      measure(manifest, staticClosure(manifest, DOCENTE_ENTRY), gzipSize)));
  } else {
    skipped.push("docente_gzip_kb: sin docente.html (F11.2, postergada)");
  }
  skipped.push("assets_muelle_mb, assets_muelle_plaza_mb: sin assets todavía (F3)");
  skipped.push("audio_lineas_por_mision_mb: sin audio guionado todavía (F8)");

  return { ok: results.every((r) => r.ok) && violations.length === 0, results, skipped, violations };
}

/** Texto del reporte. Si un presupuesto se pasa, nombra cada chunk de ese grafo con su tamaño. */
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

/** Corre el chequeo sobre un dist real. Devuelve el código de salida. */
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
  const report = checkBundle(manifest, loadBudgets(budgetsPath), gzipSize, fileText, chunkModules);
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
