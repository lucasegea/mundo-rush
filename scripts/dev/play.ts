// `npm run dev:play` (F5.2, docs/PLAY.md): un solo comando para jugar en la compu del operador. Compila el contenido
// (lo hace el script de npm antes de este archivo), lee el .env de la raíz SIN imprimir valores (solo presencia, contrato
// de secretos) y levanta dos procesos hijos con el mismo Node:
//   - apps/server en modo operador (LG_OPERATOR_MODE=1, D-158: 127.0.0.1, cuenta op-local, sin corte de presupuesto de
//     voz: el libro de costos solo alerta, D-027/D-135),
//   - Vite de apps/web en http://127.0.0.1:5173 (hace de proxy de /scene-token y del WebSocket /scene al servidor).
// Ctrl+C los para a los dos; si uno termina, se para el otro. Solo se matan los procesos que este script arrancó.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB_PORT = 5173;

/** Nombres de variables que se informan por presencia (nunca el valor). */
export const PRESENCE_VARS = ["LG_GEMINI_API_KEY", "LG_FAKE_MODELS", "LG_PORT"] as const;

/** Universo por defecto (S4/D-806): sin `--universe`, dev:play juega la campesino. */
export const UNIVERSO_DEFECTO = "U-CAMPESINO";

/**
 * Universo elegido en la línea de comandos (S4/D-806): acepta `--universe=U-GALEANO` y `--universe U-GALEANO`.
 * Vacío o ausente ⇒ undefined (el servidor y el cliente caen en U-CAMPESINO, un solo concepto build/run).
 */
export const parseUniverse = (argv: readonly string[]): string | undefined => {
  const igual = argv.find((a) => a.startsWith("--universe="))?.slice("--universe=".length);
  const i = argv.indexOf("--universe");
  const valor = igual ?? (i >= 0 ? argv[i + 1] : undefined);
  return valor === undefined || valor === "" ? undefined : valor;
};

/** Entorno de los hijos: el del proceso (ya con el .env cargado), el modo operador y, si se eligió, el universo (D-806). */
export const playEnv = (env: NodeJS.ProcessEnv, universe?: string): NodeJS.ProcessEnv =>
  ({ ...env, LG_OPERATOR_MODE: "1", ...(universe ? { LG_UNIVERSE: universe } : {}) });

/** Línea de diagnóstico: solo "sí/no" por variable. */
export const presenceLine = (env: NodeJS.ProcessEnv, envFileFound: boolean): string =>
  `[play] .env ${envFileFound ? "leído" : "no encontrado (copiá .env.example a .env)"} · ` +
  PRESENCE_VARS.map((name) => `${name} ${(env[name] ?? "") !== "" ? "presente" : "ausente"}`).join(" · ");

function main(): void {
  const envFile = join(REPO_ROOT, ".env");
  const found = existsSync(envFile);
  // loadEnvFile no pisa variables que ya estén en el entorno.
  if (found) process.loadEnvFile(envFile);
  const universe = parseUniverse(process.argv.slice(2));
  // Con un universo elegido se compila ACÁ (el prefijo `npm run build:content` del script solo compila la campesino,
  // D-805): así el servidor y el cliente leen una salida fresca del universo. Falla clara si no compila (sin fallback).
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
  // El cliente web lee el universo del query param (el servidor, de LG_UNIVERSE): un solo concepto build/run (D-806).
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
