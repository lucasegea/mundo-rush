// /health on an ephemeral port (F1.1b A4): native fetch against node:http, no supertest.
import { spawn, type ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createHttpServer, DEFAULT_HOST, DEFAULT_PORT, listenOptions } from "../src/index";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createHttpServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

describe("/health", () => {
  test("GET /health → 200 con el sobre de éxito", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, data: { status: "ok", service: "@lg/server" } });
  });

  test("la query string no cambia la ruta", async () => {
    expect((await fetch(`${base}/health?x=1`)).status).toBe(200);
  });

  test("HEAD /health → 200 sin cuerpo", async () => {
    const res = await fetch(`${base}/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  test("ruta desconocida → 404 con el sobre de error", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: "not_found", message: "Ruta desconocida." } });
  });

  test("método no permitido → 405 con Allow", async () => {
    const res = await fetch(`${base}/health`, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("listenOptions", () => {
  test("por defecto 127.0.0.1:8787 (D-158)", () => {
    expect(listenOptions({})).toEqual({ host: DEFAULT_HOST, port: DEFAULT_PORT });
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(listenOptions({ LG_PORT: "" }).port).toBe(DEFAULT_PORT);
  });

  test("LG_PORT válido se usa; 0 = efímero", () => {
    expect(listenOptions({ LG_PORT: "9100" })).toEqual({ host: "127.0.0.1", port: 9100 });
    expect(listenOptions({ LG_PORT: "0" }).port).toBe(0);
  });

  test("LG_PORT inválido falla claro", () => {
    expect(() => listenOptions({ LG_PORT: "abc" })).toThrow(/LG_PORT/);
    expect(() => listenOptions({ LG_PORT: "-1" })).toThrow(/LG_PORT/);
    expect(() => listenOptions({ LG_PORT: "70000" })).toThrow(/LG_PORT/);
  });
});

// The real process (src/main.ts with Node's type stripping) starts, responds and shuts down.
describe("proceso src/main.ts", () => {
  const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let child: ChildProcess | undefined;

  afterAll(() => {
    if (child && child.exitCode === null) child.kill();
  });

  test("escucha en un puerto efímero de loopback y sirve /health", async () => {
    child = spawn(process.execPath, ["src/main.ts"], {
      cwd: SERVER_DIR,
      env: { ...process.env, LG_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const proc = child;
    const url = await new Promise<string>((ok, ko) => {
      let out = "";
      const timer = setTimeout(() => ko(new Error(`sin "escuchando" en 10 s; salida: ${out}`)), 10_000);
      proc.stdout?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
        const m = /escuchando en (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
        if (m?.[1]) {
          clearTimeout(timer);
          ok(m[1]);
        }
      });
      proc.on("exit", (code) => ko(new Error(`el proceso salió con ${code}`)));
    });
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    proc.kill();
  }, 15_000);
});
