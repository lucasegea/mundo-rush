// check:dev-only (03 §6.5.1 point 3, FD0 A1): proves that nothing of director mode reaches a production build.
// Walks apps/web/dist/** (the `verify` build, without the variable) and also runs `vite build` with VITE_LG_DIRECTOR=1
// in the environment into a temporary folder and walks that too. Fails if it finds a marker or a chunk whose
// name starts with `director`. A test seeds a marker in a fixture dist (no false green).
//
// Usage: node scripts/budgets/dev-only.ts [--dist <dir>] [--skip-flag-build]
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Director mode markers (03 §6.5.1). Case-sensitive: they are the exact texts. */
// Open-world-3d T10 (b): `data-lg-dev-factors` is the attribute GameCanvas sets only with the development measurement
// factors (world/budget/devFactors.ts); in a production dist it means the development branch slipped in.
export const DEV_ONLY_MARKERS = ["__lg_director", "/__director/", "lg:director:", "DirectorPanel", "claude-agent-sdk", "LG_ANTHROPIC", "data-lg-dev-factors"] as const;

/** Text files of the dist that are read (binaries, like images, count only by name). */
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map", ".txt", ".svg", ".webmanifest"]);

export interface Finding {
  file: string;
  reason: string;
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** Looks for markers and `director*` chunks in a dist. Returns the findings (empty = clean). */
export function scanDist(dist: string): Finding[] {
  if (!existsSync(dist)) throw new Error(`check:dev-only: no existe ${dist} (¿corriste el build?)`);
  const files = walk(dist);
  if (files.length === 0) throw new Error(`check:dev-only: ${dist} está vacío: no se mediría nada`);
  const findings: Finding[] = [];
  for (const abs of files) {
    const file = relative(dist, abs).split("\\").join("/");
    if (basename(abs).toLowerCase().startsWith("director")) findings.push({ file, reason: "chunk con nombre director*" });
    if (!TEXT_EXT.has(extname(abs).toLowerCase())) continue;
    const text = readFileSync(abs, "utf8");
    for (const marker of DEV_ONLY_MARKERS) if (text.includes(marker)) findings.push({ file, reason: `marcador ${JSON.stringify(marker)}` });
  }
  return findings;
}

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const WEB = join(ROOT, "apps/web");
export const DEFAULT_DIST = join(WEB, "dist");

/** `vite build` of apps/web with VITE_LG_DIRECTOR=1 into `outDir`. Returns vite's exit code. */
export function buildWithFlag(outDir: string): number {
  const vite = join(ROOT, "node_modules/vite/bin/vite.js");
  const r = spawnSync(process.execPath, [vite, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"], {
    cwd: WEB,
    // open-world-3d T2(g): the performance probe has its own key; the build with both set does not emit it either.
    env: { ...process.env, VITE_LG_DIRECTOR: "1", VITE_LG_PERF_PROBE: "1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  return r.status ?? 1;
}

const report = (label: string, findings: Finding[], log: (s: string) => void): boolean => {
  if (findings.length === 0) {
    log(`OK   dev-only (${label}): sin marcadores del modo director ni chunks director*`);
    return true;
  }
  for (const f of findings) log(`FAIL dev-only (${label}): ${f.file}: ${f.reason}`);
  return false;
};

/** Runs the check. Returns the exit code. */
export function run(dist = DEFAULT_DIST, withFlagBuild = true, log: (s: string) => void = console.log): number {
  let ok = report("build de verify", scanDist(dist), log);
  if (withFlagBuild) {
    const out = mkdtempSync(join(tmpdir(), "lg-dev-only-"));
    try {
      if (buildWithFlag(out) !== 0) {
        log("FAIL dev-only: `vite build` con VITE_LG_DIRECTOR=1 falló");
        return 1;
      }
      ok = report("build con VITE_LG_DIRECTOR=1", scanDist(out), log) && ok;
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }
  return ok ? 0 : 1;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--dist");
  const dist = i >= 0 && args[i + 1] ? resolve(args[i + 1] as string) : DEFAULT_DIST;
  try {
    process.exitCode = run(dist, !args.includes("--skip-flag-build"));
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
