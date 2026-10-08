// F4.1 A8 (pendiente de FD0): `npm run dev:director` levanta apps/server con LG_DEV_CONTENT_WATCH=1. Sin levantar
// nada real: el arranque se prueba con un spawn falso y la config del director se carga con loadConfigFromFile.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadConfigFromFile, type Plugin } from "vite";
import { directorPlugin, type DirectorPluginApi } from "../src/plugin.ts";
import { SERVER_ENTRY, serverLaunch, startScenesServer, type SpawnFn } from "../src/server.ts";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function fakeSpawn() {
  const calls: { command: string; args: string[]; env: Record<string, string | undefined> }[] = [];
  let killed = 0;
  const handlers: Record<string, (arg: unknown) => void> = {};
  const spawnFn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, env: (options.env ?? {}) as Record<string, string | undefined> });
    const child = {
      exitCode: null,
      kill: () => { killed++; return true; },
      once: (event: string, fn: (arg: unknown) => void) => { handlers[event] = fn; return child; },
    };
    return child as unknown as ReturnType<SpawnFn>;
  };
  return { spawnFn, calls, handlers, killed: () => killed };
}

describe("arranque de apps/server desde el modo director", () => {
  test("serverLaunch: mismo Node, la entrada de apps/server y las dos banderas", () => {
    expect(SERVER_ENTRY).toBe(join(ROOT, "apps/server/src/main.ts"));
    expect(existsSync(SERVER_ENTRY)).toBe(true);
    const launch = serverLaunch({ PATH: "x", LG_DEV_CONTENT_WATCH: "0" });
    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual([SERVER_ENTRY]);
    expect(launch.env).toMatchObject({ PATH: "x", LG_DEV_CONTENT_WATCH: "1", LG_OPERATOR_MODE: "1" });
  });

  test("startScenesServer pasa LG_DEV_CONTENT_WATCH=1 al hijo y lo para una sola vez", () => {
    const fake = fakeSpawn();
    const logs: string[] = [];
    const scenes = startScenesServer((m) => logs.push(m), { PATH: "x" }, fake.spawnFn);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.args).toEqual([SERVER_ENTRY]);
    expect(fake.calls[0]?.env["LG_DEV_CONTENT_WATCH"]).toBe("1");
    expect(fake.calls[0]?.env["LG_OPERATOR_MODE"]).toBe("1");
    scenes.stop();
    scenes.stop();
    expect(fake.killed()).toBe(1);
    expect(logs.join("\n")).toContain("LG_DEV_CONTENT_WATCH=1");
  });

  test("si el hijo muere solo, se avisa (y no tumba Vite)", () => {
    const fake = fakeSpawn();
    const logs: string[] = [];
    startScenesServer((m) => logs.push(m), {}, fake.spawnFn);
    fake.handlers["exit"]?.(1);
    expect(logs.at(-1)).toMatch(/apps\/server terminó/);
  });

  test("el plugin lo arranca en configureServer y lo para cuando cierra el servidor de Vite", () => {
    const fake = fakeSpawn();
    let onClose: (() => void) | null = null;
    const server = {
      config: { server: { host: "127.0.0.1" }, logger: { warn: () => undefined, info: () => undefined, error: () => undefined } },
      ws: { on: () => undefined, send: () => undefined },
      middlewares: { use: () => undefined },
      watcher: { add: () => undefined, on: () => undefined },
      httpServer: { once: (_e: string, fn: () => void) => { onClose = fn; } },
    };
    const plugin = directorPlugin({ root: ROOT, scenesServer: (log) => startScenesServer(log, {}, fake.spawnFn) });
    (plugin.configureServer as unknown as (s: unknown) => void)(server);
    expect(fake.calls[0]?.env["LG_DEV_CONTENT_WATCH"]).toBe("1");
    (onClose as (() => void) | null)?.();
    expect(fake.killed()).toBe(1);
  });

  test("con un host que no es loopback no arranca nada (D-158)", () => {
    const fake = fakeSpawn();
    const server = {
      config: { server: { host: "0.0.0.0" }, logger: { warn: () => undefined, info: () => undefined, error: () => undefined } },
    };
    const plugin = directorPlugin({ root: ROOT, scenesServer: (log) => startScenesServer(log, {}, fake.spawnFn) });
    (plugin.configureServer as unknown as (s: unknown) => void)(server);
    expect(fake.calls).toEqual([]);
  });

  test("solo la config del director lo prende; directorPlugin() por defecto no", async () => {
    expect((directorPlugin().api as DirectorPluginApi).startsScenesServer).toBe(false);
    const r = await loadConfigFromFile({ command: "serve", mode: "development" }, join(ROOT, "tooling/director/vite.config.ts"), ROOT, "silent");
    const plugin = (r?.config.plugins ?? []).flat(Infinity as 10)
      .find((p): p is Plugin => !!p && typeof p === "object" && "name" in p && p.name === "lg-director");
    expect((plugin?.api as DirectorPluginApi | undefined)?.startsScenesServer).toBe(true);
  });
});
