// `npm run dev:play` (F5.2, docs/PLAY.md): un solo comando para jugar en la compu del operador. Compila el contenido
// (lo hace el script de npm antes de este archivo), lee el .env de la raíz SIN imprimir valores (solo presencia, contrato
// de secretos) y levanta dos procesos hijos con el mismo Node:
//   - apps/server en modo operador (LG_OPERATOR_MODE=1, D-158: 127.0.0.1, cuenta op-local, sin corte de presupuesto de
//     voz: el libro de costos solo alerta, D-027/D-135),
//   - Vite de apps/web en http://127.0.0.1:5173 (hace de proxy de /scene-token y del WebSocket /scene al servidor).
// Ctrl+C los para a los dos; si uno termina, se para el otro. Solo se matan los procesos que este script arrancó.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB_PORT = 5173;

/** Nombres de variables que se informan por presencia (nunca el valor). */
export const PRESENCE_VARS = ["LG_GEMINI_API_KEY", "LG_FAKE_MODELS", "LG_PORT"] as const;

/** Entorno de los hijos: el del proceso (ya con el .env cargado) más el modo operador. */
export const playEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({ ...env, LG_OPERATOR_MODE: "1" });

/** Línea de diagnóstico: solo "sí/no" por variable. */
export const presenceLine = (env: NodeJS.ProcessEnv, envFileFound: boolean): string =>
  `[play] .env ${envFileFound ? "leído" : "no encontrado (copiá .env.example a .env)"} · ` +
  PRESENCE_VARS.map((name) => `${name} ${(env[name] ?? "") !== "" ? "presente" : "ausente"}`).join(" · ");

function main(): void {
  const envFile = join(REPO_ROOT, ".env");
  const found = existsSync(envFile);
  // loadEnvFile no pisa variables que ya estén en el entorno.
  if (found) process.loadEnvFile(envFile);
  const env = playEnv(process.env);
  console.log(presenceLine(env, found));
  if ((env["LG_GEMINI_API_KEY"] ?? "") === "") console.log("[play] sin LG_GEMINI_API_KEY la escena sigue por texto (el NPC no tiene modelo).");

  const webDir = join(REPO_ROOT, "apps/web");
  const viteBin = join(dirname(createRequire(join(webDir, "package.json")).resolve("vite/package.json")), "bin/vite.js");
  const children: ChildProcess[] = [
    spawn(process.execPath, [join(REPO_ROOT, "apps/server/src/main.ts")], { cwd: REPO_ROOT, env, stdio: "inherit" }),
    spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], { cwd: webDir, env, stdio: "inherit" }),
  ];
  console.log(`[play] abrí http://127.0.0.1:${WEB_PORT} · Ctrl+C para salir`);

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
