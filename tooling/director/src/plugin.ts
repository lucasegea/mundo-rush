// Director mode Vite plugin (03 §6.5.1-§6.5.2, FD0). Registered ONLY in tooling/director/vite.config.ts and
// only in `serve` (never in build). It refuses to activate if the server listens outside 127.0.0.1/localhost.
//   - lg:director:snapshot → .director/state.json (atomic), with `build` and `contentErrors` that Node knows.
//   - lg:director:journal  → .director/journal/<sessionId>.jsonl (append-only, numbered and validated).
//   - GET /__director/state and GET /__director/journal?session=<id>&tail=<n> (JSON).
//   - content/** changes → F1.2 incremental compilation → lg:content:updated { ids } or, if it does not validate, nothing is
//     written and the error (file + key) goes to the Vite overlay and to contentErrors.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";
import { formatearHallazgo, type Hallazgo } from "@lg/content-schema";
import {
  CONTENT_UPDATED_EVENT, DirectorSnapshotSchema, JOURNAL_EVENT, JournalBatchSchema, SNAPSHOT_EVENT,
  type DirectorSnapshot,
} from "@lg/protocol/director";
import { construir, crearCompiladorIncremental, leerContenido } from "../../../scripts/content/build.ts";
import { REPO_ROOT, statePath, writeJsonAtomic } from "./files.ts";
import { createJournalWriter, pruneJournal } from "./journal.ts";
import { readJournal, readState } from "./read.ts";
import { startScenesServer, type ScenesServer } from "./server.ts";

export const PLUGIN_NAME = "lg-director";
export const ROUTE_PREFIX = "/__director/";

type ContentError = DirectorSnapshot["contentErrors"][number];
type Build = DirectorSnapshot["build"];

/** D-158 rule applied to the development server: loopback by name only. `undefined` is Vite's default (localhost). */
export const isLocalHost = (host: string | boolean | undefined): boolean =>
  host === undefined || host === "localhost" || host === "127.0.0.1";

export const contentHash = (root: string): string => {
  const h = createHash("sha256");
  for (const f of leerContenido(root).sort((a, b) => a.ruta.localeCompare(b.ruta))) h.update(`${f.ruta}\0${f.texto}\0`);
  return h.digest("hex").slice(0, 12);
};

export const gitSha = (root: string): string | null => {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
};

const toContentError = (h: Hallazgo): ContentError => ({ file: h.archivo, key: h.clave, message: h.mensaje });

/** What the plugin sends the client: its own events over HMR and errors to the overlay. */
export interface DirectorOutput {
  send(event: string, data: unknown): void;
  overlay(err: { message: string; stack: string; id?: string; plugin: string }): void;
  log(message: string): void;
}

export interface Compiler {
  actualizar(rutas: readonly string[]): { tocados: string[]; errores: Hallazgo[]; escrito: boolean };
}

export interface RuntimeOptions {
  root: string;
  out: DirectorOutput;
  /** Incremental compiler (by default scripts/content/build.ts over `root`). */
  compiler?: Compiler;
  build?: Build;
}

/** The heart of the plugin, without Vite: the tests use it with fake outputs and a temp directory. */
export function createDirectorRuntime(options: RuntimeOptions) {
  const { root, out } = options;
  const build: Build = { ...(options.build ?? { gitSha: gitSha(root), contentHash: contentHash(root) }) };
  let compiler = options.compiler ?? null;
  let contentErrors: ContentError[] = [];
  let last: DirectorSnapshot | null = null;
  let warned = false;

  const journal = createJournalWriter(root, (e) =>
    e["type"] === "session.start" ? { ...e, gitSha: build.gitSha, contentHash: build.contentHash } : e);

  const writeState = (s: DirectorSnapshot): void => {
    last = { ...s, build: { ...build }, contentErrors };
    writeJsonAtomic(statePath(root), last);
  };

  return {
    onSnapshot(data: unknown): boolean {
      const parsed = DirectorSnapshotSchema.safeParse(data);
      if (!parsed.success) {
        if (!warned) out.log(`[director] snapshot inválido, no se escribe: ${parsed.error.issues[0]?.message ?? "?"}`);
        warned = true;
        return false;
      }
      writeState(parsed.data);
      return true;
    },

    onJournal(data: unknown): number {
      const batch = JournalBatchSchema.safeParse(data);
      if (!batch.success) return 0;
      const { written, rejected } = journal.append(batch.data.sessionId, batch.data.events);
      if (rejected > 0) out.log(`[director] ${rejected} evento(s) del diario no validan y no se escribieron`);
      if (written.some((e) => e.type === "session.start")) pruneJournal(root);
      return written.length;
    },

    /** Something changed in content/ (paths relative to root, with /). Compiles incrementally and notifies. */
    onContentChange(rutas: readonly string[]): { ok: boolean; ids: string[] } {
      compiler ??= crearCompiladorIncremental(root);
      const r = compiler.actualizar(rutas);
      const ok = r.escrito;
      contentErrors = ok ? [] : r.errores.map(toContentError);
      if (ok) {
        build.contentHash = contentHash(root);
        out.send(CONTENT_UPDATED_EVENT, { ids: r.tocados });
        out.log(`[director] contenido recompilado: ${r.tocados.join(", ") || "(sin ids)"}`);
      } else {
        out.overlay({ message: r.errores.map(formatearHallazgo).join("\n"), stack: "", id: r.errores[0]?.archivo ?? rutas[0] ?? "content/", plugin: PLUGIN_NAME });
      }
      if (last) {
        journal.append(last.sessionId, [{ type: "content.reload", at: new Date().toISOString(), ids: r.tocados, ok, errors: contentErrors }]);
        writeState(last);
      }
      return { ok, ids: r.tocados };
    },

    contentErrors: (): ContentError[] => contentErrors,
  };
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(json);
};

/**
 * Handler of GET /__director/state and GET /__director/journal (connect middleware). JSON responses with the
 * apps/server envelope: { ok: true, data } or { ok: false, error: { code, message } }.
 */
export function createDirectorHandler(root: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(ROUTE_PREFIX)) {
      next();
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: { code: "method_not_allowed", message: "Solo GET." } });
      return;
    }
    try {
      if (url.pathname === `${ROUTE_PREFIX}state`) {
        sendJson(res, 200, { ok: true, data: readState(root) });
      } else if (url.pathname === `${ROUTE_PREFIX}journal`) {
        const session = url.searchParams.get("session") ?? undefined;
        const tailRaw = url.searchParams.get("tail");
        const tail = tailRaw !== null && /^\d+$/.test(tailRaw) ? Number(tailRaw) : undefined;
        sendJson(res, 200, { ok: true, data: readJournal(root, { ...(session ? { session } : {}), ...(tail !== undefined ? { tail } : {}) }) });
      } else {
        sendJson(res, 404, { ok: false, error: { code: "not_found", message: "Ruta desconocida." } });
      }
    } catch (err) {
      sendJson(res, 400, { ok: false, error: { code: "bad_request", message: err instanceof Error ? err.message.split("\n")[0] ?? "error" : "error" } });
    }
  };
}

export interface DirectorPluginOptions {
  root?: string;
  /** Wait to batch content/ changes (one save usually fires several events). */
  debounceMs?: number;
  /**
   * Start apps/server with LG_DEV_CONTENT_WATCH=1 (F4.1, A8). `true` uses the real startup; a function replaces it
   * (tests). Off by default: only tooling/director/vite.config.ts turns it on.
   */
  scenesServer?: boolean | ((log: (m: string) => void) => ScenesServer);
}

/** What the plugin exposes to whoever inspects it (the director config, its tests). */
export interface DirectorPluginApi {
  readonly startsScenesServer: boolean;
}

/** The plugin. `serve` only; with a non-loopback host it does nothing and says so. */
export function directorPlugin(options: DirectorPluginOptions = {}): Plugin {
  const root = options.root ?? REPO_ROOT;
  const debounceMs = options.debounceMs ?? 120;
  const launchServer = options.scenesServer === true ? startScenesServer : options.scenesServer || null;
  const api: DirectorPluginApi = { startsScenesServer: launchServer !== null };
  return {
    name: PLUGIN_NAME,
    apply: "serve",
    api,
    configureServer(server) {
      const host = server.config.server.host;
      if (!isLocalHost(host)) {
        server.config.logger.warn(`[director] el servidor escucha en ${String(host)}: el modo director solo se activa en 127.0.0.1/localhost (D-158).`);
        return;
      }
      // Compiled output up to date on startup (it is outside git and may not exist).
      if (construir({ root, modo: "dev", log: () => undefined }) !== 0) server.config.logger.warn("[director] el contenido no compila; se ve el error al guardar un archivo.");
      const runtime = createDirectorRuntime({
        root,
        out: {
          send: (event, data) => server.ws.send(event, data),
          overlay: (err) => server.ws.send({ type: "error", err }),
          log: (m) => server.config.logger.info(m),
        },
      });
      server.ws.on(SNAPSHOT_EVENT, (data: unknown) => { runtime.onSnapshot(data); });
      server.ws.on(JOURNAL_EVENT, (data: unknown) => { runtime.onJournal(data); });
      server.middlewares.use(createDirectorHandler(root));

      const contentDir = join(root, "content");
      const queued = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | null = null;
      server.watcher.add(contentDir);
      server.watcher.on("all", (event: string, file: string) => {
        // Files only (a new folder is not content); add/unlink cover creating and deleting a YAML.
        if (event !== "add" && event !== "change" && event !== "unlink") return;
        const rel = relative(root, file).split(sep).join("/");
        if (!rel.startsWith("content/")) return;
        // D-816: book universes (content/universes/) are written by EMIT and are not farmer-universe content; queuing them would break the reload.
        if (rel.startsWith("content/universes/")) return;
        queued.add(rel);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const rutas = [...queued];
          queued.clear();
          try {
            runtime.onContentChange(rutas);
          } catch (err) {
            // An IO error (e.g. a half-saved file) does not take down the development server.
            server.config.logger.error(`[director] recarga fallida: ${err instanceof Error ? err.message : String(err)}`);
          }
        }, debounceMs);
      });
      if (launchServer) {
        // After compiling: the server reads apps/server/generated/content/ with the first scene.
        const scenes = launchServer((m) => server.config.logger.info(m));
        server.httpServer?.once("close", () => scenes.stop());
        process.once("exit", () => scenes.stop());
      }
      server.config.logger.info(`[director] activo: .director/state.json, ${ROUTE_PREFIX}state, ${ROUTE_PREFIX}journal; observando content/`);
    },
  };
}
