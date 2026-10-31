// `npm run dev:play` (F5.2, docs/PLAY.md): a single command to play on the operator's computer. Compiles the content
// (the npm script does it before this file), reads the root .env WITHOUT printing values (presence only, secrets
// contract) and starts two child processes with the same Node:
//   - apps/server in operator mode (LG_OPERATOR_MODE=1, D-158: 127.0.0.1, op-local account, no voice budget
//     cutoff: the cost ledger only alerts, D-027/D-135),
//   - Vite of apps/web at http://127.0.0.1:5173 (proxies /scene-token and the /scene WebSocket to the server).
// Ctrl+C stops both; if one ends, the other stops. Only the processes this script started are killed.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB_PORT = 5173;

/** Names of variables reported by presence (never the value). */
export const PRESENCE_VARS = ["LG_GEMINI_API_KEY", "LG_FAKE_MODELS", "LG_PORT"] as const;

/** Default universe (S4/D-806): without `--universe`, dev:play plays the farmer universe. */
export const UNIVERSO_DEFECTO = "U-CAMPESINO";

/**
 * Universe chosen on the command line (S4/D-806): accepts `--universe=U-GALEANO` and `--universe U-GALEANO`.
 * Empty or absent ⇒ undefined (the server and the client fall back to U-CAMPESINO, a single build/run concept).
 */
export const parseUniverse = (argv: readonly string[]): string | undefined => {
  const igual = argv.find((a) => a.startsWith("--universe="))?.slice("--universe=".length);
  const i = argv.indexOf("--universe");
  const valor = igual ?? (i >= 0 ? argv[i + 1] : undefined);
  return valor === undefined || valor === "" ? undefined : valor;
};

/**
 * Children's environment: the process's (already with .env loaded), operator mode and, if chosen, the universe (D-806):
 * `LG_UNIVERSE` for the server and `VITE_LG_UNIVERSE` for the client, so a URL without `?universe=` still plays it (J-3).
 */
export const playEnv = (env: NodeJS.ProcessEnv, universe?: string): NodeJS.ProcessEnv =>
  ({ ...env, LG_OPERATOR_MODE: "1", ...(universe ? { LG_UNIVERSE: universe, VITE_LG_UNIVERSE: universe } : {}) });

/** Diagnostic line: only "yes/no" per variable. */
export const presenceLine = (env: NodeJS.ProcessEnv, envFileFound: boolean): string =>
  `[play] .env ${envFileFound ? "leído" : "no encontrado (copiá .env.example a .env)"} · ` +
  PRESENCE_VARS.map((name) => `${name} ${(env[name] ?? "") !== "" ? "presente" : "ausente"}`).join(" · ");

function main(): void {
  const envFile = join(REPO_ROOT, ".env");
  const found = existsSync(envFile);
  // loadEnvFile does not override variables already in the environment.
  if (found) process.loadEnvFile(envFile);
  const universe = parseUniverse(process.argv.slice(2));
  // With a chosen universe it is compiled HERE (the script's `npm run build:content` prefix only compiles the farmer universe,
  // D-805): so the server and the client read a fresh output of the universe. Clear failure if it does not compile (no fallback).
  if (universe) {
    console.log(`[play] universo ${universe}: compilando content/universes/${universe}/ …`);
    const built = spawnSync(process.execPath, [join(REPO_ROOT, "scripts/content/build.ts"), `--universe=${universe}`], { cwd: REPO_ROOT, stdio: "inherit" });
    if (built.status !== 0) {
      console.error(`[play] el universo ${universe} no compiló; no se arranca nada.`);
      process.exitCode = 1;
      return;
    }
  }
  const env = playEnv(process.env, universe);
  console.log(presenceLine(env, found));
  console.log(`[play] universo ${universe ?? `${UNIVERSO_DEFECTO} (por defecto)`}`);
  if ((env["LG_GEMINI_API_KEY"] ?? "") === "") console.log("[play] sin LG_GEMINI_API_KEY la escena sigue por texto (el NPC no tiene modelo).");

  const webDir = join(REPO_ROOT, "apps/web");
  const viteBin = join(dirname(createRequire(join(webDir, "package.json")).resolve("vite/package.json")), "bin/vite.js");
  const children: ChildProcess[] = [
    spawn(process.execPath, [join(REPO_ROOT, "apps/server/src/main.ts")], { cwd: REPO_ROOT, env, stdio: "inherit" }),
    spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], { cwd: webDir, env, stdio: "inherit" }),
  ];
  // The web client reads the universe from the query param (the server, from LG_UNIVERSE): a single build/run concept (D-806).
  const url = `http://127.0.0.1:${WEB_PORT}${universe ? `/?universe=${universe}` : ""}`;
  console.log(`[play] abrí ${url} · Ctrl+C para salir`);

  let stopping = false;
  const stopAll = (code: number): void => {
    if (stopping) return;
    stopping = true;
    for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill();
    process.exitCode = code;
  };
  for (const c of children) {
    c.once("exit", (code) => stopAll(code ?? 0));
    c.once("error", (err) => {
      console.error(`[play] no se pudo arrancar un proceso: ${err.message}`);
      stopAll(1);
    });
  }
  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
