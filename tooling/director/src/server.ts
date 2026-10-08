// Servidor de escenas del modo director (F4.1, A8; 03 §6.5.2, 04 FD0): `npm run dev:director` también levanta
// apps/server como proceso hijo con LG_DEV_CONTENT_WATCH=1 (relee el contenido compilado para la próxima escena) y
// LG_OPERATOR_MODE=1 (D-158: escenas en 127.0.0.1 con la cuenta op-local). No importa nada de apps/server: lo corre
// con el mismo Node, como `npm start --workspace @lg/server`. Las claves pasan por el entorno, nunca por argumentos.
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { join } from "node:path";
import { REPO_ROOT } from "./files.ts";

export const SERVER_ENTRY = join(REPO_ROOT, "apps/server/src/main.ts");

export interface ServerLaunch {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
}

/** Cómo se arranca el servidor: mismo Node, entrada de apps/server y las dos banderas del modo director. */
export const serverLaunch = (env: Record<string, string | undefined>, entry: string = SERVER_ENTRY): ServerLaunch => ({
  command: process.execPath,
  args: [entry],
  env: { ...env, LG_DEV_CONTENT_WATCH: "1", LG_OPERATOR_MODE: "1" },
});

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => Pick<ChildProcess, "kill" | "once" | "exitCode">;

export interface ScenesServer {
  readonly launch: ServerLaunch;
  stop(): void;
}

/** Arranca el servidor hijo; un fallo (puerto ocupado, contenido sin compilar) se loguea y no tumba Vite. */
export function startScenesServer(log: (m: string) => void, env: Record<string, string | undefined> = process.env,
  spawnFn: SpawnFn = spawn): ScenesServer {
  const launch = serverLaunch(env);
  const child = spawnFn(launch.command, launch.args, { cwd: REPO_ROOT, env: launch.env, stdio: "inherit" });
  let stopped = false;
  child.once("exit", (code) => {
    if (!stopped) log(`[director] apps/server terminó (código ${String(code)}); las escenas no están disponibles.`);
  });
  child.once("error", (err: Error) => log(`[director] no se pudo arrancar apps/server: ${err.message}`));
  log("[director] apps/server arrancado con LG_DEV_CONTENT_WATCH=1 y LG_OPERATOR_MODE=1");
  return {
    launch,
    stop() {
      if (stopped) return;
      stopped = true;
      if (child.exitCode === null) child.kill();
    },
  };
}
