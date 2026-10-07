// FD0 A5 y A6: el plugin se niega fuera de loopback, escribe state.json atómico, sus manejadores devuelven JSON y
// la recarga en caliente compila incremental (avisa los ids tocados) o, si no valida, no escribe nada y dice archivo + clave.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DirectorSnapshotSchema } from "@lg/protocol/director";
import { construir, SALIDA_CLIENTE, SALIDA_SERVIDOR } from "../../../scripts/content/build.ts";
import { statePath, writeJsonAtomic, type AtomicFs } from "../src/files.ts";
import { createDirectorHandler, createDirectorRuntime, directorPlugin, isLocalHost, type DirectorOutput } from "../src/plugin.ts";
import { AT, fakeHttp, removeRoot, sampleEvents, snapshot, tempRoot, writeSession, writeState } from "./helpers.ts";

let root = "";
afterEach(() => removeRoot(root));

const fakeOut = () => {
  const sent: { event: string; data: unknown }[] = [];
  const overlays: { message: string; id?: string }[] = [];
  const out: DirectorOutput = { send: (event, data) => sent.push({ event, data }), overlay: (err) => overlays.push(err), log: () => undefined };
  return { out, sent, overlays };
};

/** Un ViteDevServer falso: solo lo que toca configureServer. */
const fakeServer = (host: string | boolean | undefined) => {
  const calls = { ws: [] as string[], middleware: 0, watched: [] as string[], warn: [] as string[] };
  const server = {
    config: { server: { host }, logger: { warn: (m: string) => calls.warn.push(m), info: () => undefined, error: (m: string) => calls.warn.push(m) } },
    ws: { on: (event: string) => calls.ws.push(event), send: () => undefined },
    middlewares: { use: () => { calls.middleware++; } },
    watcher: { add: (p: string) => calls.watched.push(p), on: () => undefined },
  };
  return { server, calls };
};

const configure = (root: string, host: string | boolean | undefined) => {
  const { server, calls } = fakeServer(host);
  const plugin = directorPlugin({ root });
  (plugin.configureServer as unknown as (s: unknown) => void)(server);
  return calls;
};

describe("A5: solo local", () => {
  test("isLocalHost: 127.0.0.1, localhost y el default de Vite; nada más", () => {
    expect([undefined, "localhost", "127.0.0.1"].map(isLocalHost)).toEqual([true, true, true]);
    expect([true, "0.0.0.0", "::", "192.168.0.10", "example.test", "::1"].map(isLocalHost)).toEqual([false, false, false, false, false, false]);
  });

  test.each([[true], ["0.0.0.0"], ["192.168.0.10"]] as const)("con host %s el plugin no se activa y lo dice", (host) => {
    root = tempRoot();
    const calls = configure(root, host);
    expect(calls.ws).toEqual([]);
    expect(calls.middleware).toBe(0);
    expect(calls.watched).toEqual([]);
    expect(calls.warn.join(" ")).toMatch(/127\.0\.0\.1\/localhost/);
  });

  test("con 127.0.0.1 escucha los dos canales, sirve las rutas y observa content/", () => {
    root = tempRoot(true);
    const calls = configure(root, "127.0.0.1");
    expect(calls.ws.sort()).toEqual(["lg:director:journal", "lg:director:snapshot"]);
    expect(calls.middleware).toBe(1);
    expect(calls.watched).toEqual([join(root, "content")]);
  });

  test("apply: serve (nunca build)", () => {
    expect(directorPlugin().apply).toBe("serve");
  });
});

describe("A5: state.json atómico", () => {
  test("temporal en la misma carpeta + rename; nunca se escribe el destino directo", () => {
    root = tempRoot();
    const ops: string[] = [];
    const target = join(root, ".director", "state.json");
    const fs: AtomicFs = {
      writeFileSync: (p, d) => { ops.push(`write ${p}`); writeFileSync(p, d); },
      renameSync: (a, b) => { ops.push(`rename ${a} -> ${b}`); writeFileSync(b, readFileSync(a)); },
      rmSync: () => undefined,
    };
    writeJsonAtomic(target, { a: 1 }, fs);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatch(/^write .*state\.json\.\d+\.\d+\.tmp$/);
    expect(ops[0]?.startsWith(`write ${join(root, ".director")}`)).toBe(true);
    expect(ops[1]).toBe(`rename ${ops[0]?.slice(6)} -> ${target}`);
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ a: 1 });
  });

  test("en disco real no quedan temporales y el archivo se reemplaza entero", () => {
    root = tempRoot();
    const target = statePath(root);
    writeJsonAtomic(target, { n: 1 });
    writeJsonAtomic(target, { n: 2 });
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ n: 2 });
    expect(readdirSync(join(root, ".director"))).toEqual(["state.json"]);
  });

  test("si el rename falla con otro error, se borra el temporal y se propaga", () => {
    root = tempRoot();
    const removed: string[] = [];
    const fs: AtomicFs = {
      writeFileSync: () => undefined,
      renameSync: () => { throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }); },
      rmSync: (p) => removed.push(p),
    };
    expect(() => writeJsonAtomic(statePath(root), {}, fs)).toThrow("ENOSPC");
    expect(removed).toHaveLength(1);
  });

  test("el runtime escribe el snapshot con build y contentErrors de Node, y valida contra el esquema", () => {
    root = tempRoot();
    const { out } = fakeOut();
    const rt = createDirectorRuntime({ root, out, build: { gitSha: "abc123", contentHash: "h1" } });
    expect(rt.onSnapshot(snapshot())).toBe(true);
    const written = DirectorSnapshotSchema.parse(JSON.parse(readFileSync(statePath(root), "utf8")));
    expect(written.build).toEqual({ gitSha: "abc123", contentHash: "h1" });
    expect(rt.onSnapshot({ ...snapshot(), v: 2 })).toBe(false);
    expect(rt.onSnapshot({ ...snapshot(), audio: "x" })).toBe(false);
  });

  test("el runtime agrega al diario lo que manda el cliente, con gitSha en session.start", () => {
    root = tempRoot();
    const { out } = fakeOut();
    const rt = createDirectorRuntime({ root, out, build: { gitSha: "abc123", contentHash: "h1" } });
    const n = rt.onJournal({ sessionId: "s1", events: [{ type: "session.start", at: AT, gitSha: null, contentHash: null, tier: "low" }, { type: "interact", at: AT, targetId: "NPC-NELL" }] });
    expect(n).toBe(2);
    const first = JSON.parse(readFileSync(join(root, ".director/journal/s1.jsonl"), "utf8").split("\n")[0] ?? "{}") as Record<string, unknown>;
    expect(first).toMatchObject({ seq: 0, type: "session.start", gitSha: "abc123", contentHash: "h1" });
    expect(rt.onJournal({ sessionId: "../x", events: [] })).toBe(0);
  });
});

describe("A5: GET /__director/state y /__director/journal (req/res falsos, sin red)", () => {
  beforeEach(() => {
    root = tempRoot();
  });

  const call = (url: string, method = "GET") => {
    const { req, res } = fakeHttp(url, method);
    let nexted = false;
    createDirectorHandler(root)(req as never, res as never, () => { nexted = true; });
    return { res, nexted, json: res.body ? (JSON.parse(res.body) as { ok: boolean; data?: unknown; error?: { code: string } }) : null };
  };

  test("state sin snapshot: 200 con data null (JSON válido)", () => {
    const r = call("/__director/state");
    expect(r.res.statusCode).toBe(200);
    expect(r.res.headers["content-type"]).toMatch(/application\/json/);
    expect(r.json).toEqual({ ok: true, data: null });
  });

  test("state con snapshot: el snapshot validado", () => {
    writeState(root, snapshot());
    const r = call("/__director/state");
    expect(DirectorSnapshotSchema.parse(r.json?.data)).toMatchObject({ diorama: "test" });
  });

  test("journal: la sesión más reciente, ?session= y ?tail=", () => {
    writeSession(root, "viejo", sampleEvents(), 1_700_000_000);
    writeSession(root, "nuevo", sampleEvents().slice(0, 2), 1_700_000_100);
    expect(call("/__director/journal").json?.data).toMatchObject({ sessionId: "nuevo" });
    const tail = call("/__director/journal?session=viejo&tail=2").json?.data as { sessionId: string; events: { seq: number }[] };
    expect(tail.sessionId).toBe("viejo");
    expect(tail.events.map((e) => e.seq)).toEqual([3, 4]);
  });

  test("errores en JSON: ruta desconocida 404, método 405, sesión inválida 400; lo demás pasa de largo", () => {
    expect(call("/__director/nada").res.statusCode).toBe(404);
    expect(call("/__director/state", "POST").json?.error?.code).toBe("method_not_allowed");
    const bad = call("/__director/journal?session=../x");
    expect(bad.res.statusCode).toBe(400);
    expect(bad.json?.ok).toBe(false);
    expect(call("/assets/app.js").nexted).toBe(true);
  });
});

describe("A6: recarga en caliente sobre una copia temporal de content/", () => {
  const mission = "content/missions/M1.1.yaml";
  const server = (r: string) => join(r, SALIDA_SERVIDOR, "misiones.json");

  beforeEach(() => {
    root = tempRoot(true);
    expect(construir({ root, modo: "dev", log: () => undefined })).toBe(0);
  });

  test("un cambio válido escribe la salida y avisa lg:content:updated con los ids tocados", () => {
    const { out, sent, overlays } = fakeOut();
    const rt = createDirectorRuntime({ root, out, build: { gitSha: null, contentHash: "h0" } });
    rt.onSnapshot(snapshot());
    const abs = join(root, mission);
    writeFileSync(abs, readFileSync(abs, "utf8").replace("duracion_objetivo_min: 3", "duracion_objetivo_min: 4"));
    expect(rt.onContentChange([mission])).toMatchObject({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.event).toBe("lg:content:updated");
    expect((sent[0]?.data as { ids: string[] }).ids).toEqual(expect.arrayContaining(["M1.1", "M1.1-E1"]));
    expect(overlays).toEqual([]);
    expect(readFileSync(server(root), "utf8")).toContain('"duracion_objetivo_min": 4');
    expect(existsSync(join(root, SALIDA_CLIENTE, "lugares.json"))).toBe(true);
    // state.json lleva el hash nuevo y el diario la recarga.
    const state = DirectorSnapshotSchema.parse(JSON.parse(readFileSync(statePath(root), "utf8")));
    expect(state.build.contentHash).not.toBe("h0");
    const journal = readFileSync(join(root, ".director/journal", `${snapshot().sessionId}.jsonl`), "utf8");
    expect(journal).toContain('"type":"content.reload"');
  });

  test("un cambio inválido no escribe nada, no avisa y reporta archivo + clave (overlay y contentErrors)", () => {
    const { out, sent, overlays } = fakeOut();
    const rt = createDirectorRuntime({ root, out, build: { gitSha: null, contentHash: "h0" } });
    rt.onSnapshot(snapshot());
    const before = { text: readFileSync(server(root), "utf8"), mtime: statSync(server(root)).mtimeMs };
    const abs = join(root, mission);
    writeFileSync(abs, readFileSync(abs, "utf8").replace("    npc: NPC-NELL\n", "    npc: NPC-NADIE\n"));
    expect(rt.onContentChange([mission])).toMatchObject({ ok: false });
    expect(sent).toEqual([]);
    expect(readFileSync(server(root), "utf8")).toBe(before.text);
    expect(statSync(server(root)).mtimeMs).toBe(before.mtime);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.id).toBe(mission);
    expect(overlays[0]?.message).toContain(`${mission} › escenas[0].npc`);
    expect(rt.contentErrors()).toEqual(expect.arrayContaining([expect.objectContaining({ file: mission, key: "escenas[0].npc" })]));
    const state = DirectorSnapshotSchema.parse(JSON.parse(readFileSync(statePath(root), "utf8")));
    expect(state.contentErrors).toEqual(expect.arrayContaining([expect.objectContaining({ file: mission, key: "escenas[0].npc" })]));
    // Al arreglarlo, los errores se limpian y vuelve el aviso.
    writeFileSync(abs, readFileSync(abs, "utf8").replace("    npc: NPC-NADIE\n", "    npc: NPC-NELL\n"));
    expect(rt.onContentChange([mission]).ok).toBe(true);
    expect(rt.contentErrors()).toEqual([]);
    expect(sent.map((s) => s.event)).toEqual(["lg:content:updated"]);
  });

  test("un diorama tocado aparece entre los ids (el cliente re-deriva grilla y chunks)", () => {
    const { out, sent } = fakeOut();
    const rt = createDirectorRuntime({ root, out, build: { gitSha: null, contentHash: null } });
    const file = "content/dioramas/test.yaml";
    const abs = join(root, file);
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\n`);
    expect(rt.onContentChange([file]).ok).toBe(true);
    expect((sent[0]?.data as { ids: string[] }).ids).toContain("test");
  });
});

describe("el watcher del plugin junta los eventos de un guardado", () => {
  test("varios eventos seguidos → una sola compilación con las rutas relativas", async () => {
    vi.useFakeTimers();
    try {
      root = tempRoot(true);
      const listeners: ((event: string, file: string) => void)[] = [];
      const { server } = fakeServer("127.0.0.1");
      const sends: string[] = [];
      Object.assign(server.watcher, { on: (_e: string, cb: (event: string, file: string) => void) => listeners.push(cb) });
      Object.assign(server.ws, { send: (event: unknown) => sends.push(typeof event === "string" ? event : "error") });
      (directorPlugin({ root, debounceMs: 50 }).configureServer as unknown as (s: unknown) => void)(server);
      const file = join(root, "content/missions/M1.1.yaml");
      writeFileSync(file, readFileSync(file, "utf8").replace("duracion_objetivo_min: 3", "duracion_objetivo_min: 5"));
      for (const cb of listeners) {
        cb("change", file);
        cb("change", file);
        cb("change", join(root, "apps/web/src/x.ts"));
        cb("addDir", join(root, "content/nueva"));
      }
      expect(sends).toEqual([]);
      await vi.advanceTimersByTimeAsync(60);
      expect(sends).toEqual(["lg:content:updated"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
