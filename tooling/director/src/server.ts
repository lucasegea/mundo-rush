// Director mode scene server (F4.1, A8; 03 §6.5.2, 04 FD0): `npm run dev:director` also starts
// apps/server as a child process with LG_DEV_CONTENT_WATCH=1 (re-reads the compiled content for the next scene) and
// LG_OPERATOR_MODE=1 (D-158: scenes on 127.0.0.1 with the op-local account). It imports nothing from apps/server: it runs it
// with the same Node, like `npm start --workspace @lg/server`. Keys go through the environment, never through arguments.
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { join } from "node:path";
import { REPO_ROOT } from "./files.ts";

export const SERVER_ENTRY = join(REPO_ROOT, "apps/server/src/main.ts");

export interface ServerLaunch {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
}

/** How the server is started: same Node, apps/server entry and the two director mode flags. */
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

/** Starts the child server; a failure (port in use, uncompiled content) is logged and does not take down Vite. */
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
