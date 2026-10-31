// HTTP server of @lg/server (F1.1b): /health; F4.1 adds routes via `createHttpServer(rutas)` (scene token). node:http, no framework.
// Single JSON response envelope:
//   success → { ok: true,  data: … }
//   error  → { ok: false, error: { code, message } }   (stable code, readable message)
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const SERVICE_NAME = "@lg/server";

/** D-158: the operator-mode server listens only on loopback. */
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

export type ErrorCode = "not_found" | "method_not_allowed" | "internal" | "forbidden" | "unauthorized" | "bad_request";
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export interface HealthBody {
  status: "ok";
  service: typeof SERVICE_NAME;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;
/** route → method → handler. */
export type Routes = Record<string, Record<string, Handler>>;

export function send<T>(res: ServerResponse, status: number, body: Envelope<T>, method?: string, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(method === "HEAD" ? undefined : json);
}

export const fail = (res: ServerResponse, status: number, code: ErrorCode, message: string, method?: string, headers?: Record<string, string>): void =>
  send(res, status, { ok: false, error: { code, message } }, method, headers);

const health: Handler = (req, res) => {
  const body: HealthBody = { status: "ok", service: SERVICE_NAME };
  send(res, 200, { ok: true, data: body }, req.method);
};

const BASE_ROUTES: Routes = {
  "/health": { GET: health, HEAD: health },
};

/** Request handler with the base routes plus `extra`. */
export function createHandler(extra: Routes = {}): Handler {
  const routes: Routes = { ...BASE_ROUTES, ...extra };
  return (req, res) => routeRequest(routes, req, res);
}

/** Request handler; exported so it can be tested without network if needed. */
export const handle: Handler = createHandler();

function routeRequest(routes: Routes, req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? "GET";
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const route = routes[pathname];
    if (!route) {
      fail(res, 404, "not_found", "Ruta desconocida.", method);
      return;
    }
    const handler = route[method];
    if (!handler) {
      const allow = Object.keys(route).join(", ");
      fail(res, 405, "method_not_allowed", `Método no permitido. Permitidos: ${allow}.`, method, { allow });
      return;
    }
    handler(req, res);
  } catch {
    // The error detail is never leaked to the client.
    if (!res.headersSent) fail(res, 500, "internal", "Error interno.", method);
    else res.destroy();
  }
}

export function createHttpServer(extra: Routes = {}): Server {
  return createServer(createHandler(extra));
}

/** Reads host and port from the environment: LG_PORT (integer 0-65535; 0 = ephemeral). The host is always loopback. */
export function listenOptions(env: Record<string, string | undefined>): { host: string; port: number } {
  const raw = env["LG_PORT"];
  if (raw === undefined || raw === "") return { host: DEFAULT_HOST, port: DEFAULT_PORT };
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port > 65535) {
    throw new Error(`LG_PORT inválido: ${JSON.stringify(raw)} (entero entre 0 y 65535)`);
  }
  return { host: DEFAULT_HOST, port };
}
