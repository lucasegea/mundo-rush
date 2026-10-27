// Plugin de Vite del modo director (03 §6.5.1-§6.5.2, FD0). Se registra SOLO en tooling/director/vite.config.ts y
// solo en `serve` (nunca en build). Se niega a activarse si el servidor escucha fuera de 127.0.0.1/localhost.
//   - lg:director:snapshot → .director/state.json (atómico), con `build` y `contentErrors` que sabe Node.
//   - lg:director:journal  → .director/journal/<sessionId>.jsonl (solo agregar, numerado y validado).
//   - GET /__director/state y GET /__director/journal?session=<id>&tail=<n> (JSON).
//   - content/** cambia → compilación incremental de F1.2 → lg:content:updated { ids } o, si no valida, nada se
//     escribe y el error (archivo + clave) va al overlay de Vite y a contentErrors.
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

/** Regla de D-158 aplicada al servidor de desarrollo: solo loopback por nombre. `undefined` es el default de Vite (localhost). */
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

/** Lo que el plugin le manda al cliente: eventos propios por HMR y errores al overlay. */
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
  /** Compilador incremental (por defecto el de scripts/content/build.ts sobre `root`). */
  compiler?: Compiler;
  build?: Build;
}

/** El corazón del plugin, sin Vite: los tests lo usan con salidas falsas y un directorio temporal. */
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

    /** Cambió algo en content/ (rutas relativas a root, con /). Compila incremental y avisa. */
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
 * Manejador de GET /__director/state y GET /__director/journal (middleware de connect). Respuestas JSON con el
 * sobre de apps/server: { ok: true, data } o { ok: false, error: { code, message } }.
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
  /** Espera para juntar cambios de content/ (un guardado suele disparar varios eventos). */
  debounceMs?: number;
  /**
   * Levantar apps/server con LG_DEV_CONTENT_WATCH=1 (F4.1, A8). `true` usa el arranque real; una función lo reemplaza
   * (tests). Apagado por defecto: solo tooling/director/vite.config.ts lo prende.
   */
  scenesServer?: boolean | ((log: (m: string) => void) => ScenesServer);
}

/** Lo que el plugin expone a quien lo inspecciona (la config del director, sus tests). */
export interface DirectorPluginApi {
  readonly startsScenesServer: boolean;
}

/** El plugin. Solo `serve`; con un host que no es loopback no hace nada y lo dice. */
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
      // Salida compilada al día al arrancar (está fuera de git y puede no existir).
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
        // Solo archivos (una carpeta nueva no es contenido); add/unlink cubren crear y borrar un YAML.
        if (event !== "add" && event !== "change" && event !== "unlink") return;
        const rel = relative(root, file).split(sep).join("/");
        if (!rel.startsWith("content/")) return;
        // D-816: los universos de libro (content/universes/) los escribe EMIT y no son contenido campesino; encolarlos rompería la recarga.
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
            // Un error de IO (p. ej. un archivo a medio guardar) no tumba el servidor de desarrollo.
            server.config.logger.error(`[director] recarga fallida: ${err instanceof Error ? err.message : String(err)}`);
          }
        }, debounceMs);
      });
      if (launchServer) {
        // Después de compilar: el servidor lee apps/server/generated/content/ con la primera escena.
        const scenes = launchServer((m) => server.config.logger.info(m));
        server.httpServer?.once("close", () => scenes.stop());
        process.once("exit", () => scenes.stop());
      }
      server.config.logger.info(`[director] activo: .director/state.json, ${ROUTE_PREFIX}state, ${ROUTE_PREFIX}journal; observando content/`);
    },
  };
}
