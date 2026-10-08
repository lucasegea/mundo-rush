// Gateway de escena (03 §4.2 gateway/, §5.3, D-158): POST /scene-token emite un token de un solo uso (modo operador:
// sin login, cuenta `op-local`) y el WebSocket /scene?token=… abre una sesión de escena con él. Solo texto en F4.1:
// un frame binario (audio, F5) se contesta `not_implemented`. Los errores HTTP usan el sobre { ok: false, error }.
import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { SCENE_TOKEN_PATH, SCENE_WS_PATH, type ServerMessage } from "@lg/protocol";
import type { Clock } from "@lg/core";
import { fail, send, type Routes } from "../http.ts";
import type { SceneSession } from "../scene-runtime/runtime.ts";

export const TOKEN_TTL_MS = 60_000;

export interface TokenRegistry {
  issue(): string;
  /** true una sola vez por token, y solo antes de vencer. */
  consume(token: string): boolean;
}

export function createTokenRegistry(clock: Clock, ttlMs = TOKEN_TTL_MS, newToken = () => randomBytes(24).toString("base64url")): TokenRegistry {
  const live = new Map<string, number>();
  return {
    issue() {
      const now = clock.now();
      for (const [t, exp] of live) if (exp <= now) live.delete(t);
      const token = newToken();
      live.set(token, now + ttlMs);
      return token;
    },
    consume(token) {
      const exp = live.get(token);
      live.delete(token);
      return exp !== undefined && exp > clock.now();
    },
  };
}

/** Rutas HTTP de escena. Sin modo operador responden 403 con el sobre de error. */
export function sceneRoutes(tokens: TokenRegistry, operatorMode: boolean): Routes {
  return {
    [SCENE_TOKEN_PATH]: {
      POST: (req, res) => {
        if (!operatorMode) return fail(res, 403, "forbidden", "Escenas solo en modo operador (LG_OPERATOR_MODE=1).", req.method);
        const token = tokens.issue();
        send(res, 200, { ok: true, data: { token, wsPath: `${SCENE_WS_PATH}?token=${token}` } }, req.method);
      },
    },
  };
}

/** Rechazo del upgrade con el mismo sobre JSON que el resto del servidor. */
function refuse(socket: Duplex, status: number, code: "unauthorized" | "forbidden" | "not_found", message: string): void {
  const body = JSON.stringify({ ok: false, error: { code, message } });
  const reason = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not Found";
  socket.end(`HTTP/1.1 ${status} ${reason}\r\ncontent-type: application/json; charset=utf-8\r\ncontent-length: ${Buffer.byteLength(body)}\r\ncache-control: no-store\r\nconnection: close\r\n\r\n${body}`);
}

export interface GatewayOptions {
  tokens: TokenRegistry;
  operatorMode: boolean;
  /** Crea la sesión de escena de una conexión; `send` manda un mensaje del protocolo. */
  openSession(send: (msg: ServerMessage) => void): SceneSession;
}

/** Engancha el WebSocket de escena al servidor HTTP. Devuelve el cierre. */
export function attachSceneGateway(server: Server, opts: GatewayOptions): { close(): void } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== SCENE_WS_PATH) return refuse(socket, 404, "not_found", "Ruta desconocida.");
    if (!opts.operatorMode) return refuse(socket, 403, "forbidden", "Escenas solo en modo operador (LG_OPERATOR_MODE=1).");
    if (!opts.tokens.consume(url.searchParams.get("token") ?? "")) return refuse(socket, 401, "unauthorized", "Token de escena inválido o vencido.");
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws));
  };

  const connect = (ws: WebSocket): void => {
    const out = (msg: ServerMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    const session = opts.openSession(out);
    // Los mensajes de una conexión se procesan en orden.
    let chain = Promise.resolve();
    ws.on("message", (data: RawData, isBinary: boolean) => {
      chain = chain.then(async () => {
        if (isBinary) return out({ type: "error", code: "not_implemented", message: "Audio binario: llega con la voz (F5)." });
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString());
        } catch {
          return out({ type: "error", code: "bad_message", message: "Mensaje inválido." });
        }
        await session.receive(raw);
      }).catch(() => out({ type: "error", code: "bad_message", message: "Error al procesar el mensaje." }));
    });
    ws.on("close", () => session.close());
  };

  server.on("upgrade", onUpgrade);
  return {
    close() {
      server.off("upgrade", onUpgrade);
      for (const c of wss.clients) c.terminate();
      wss.close();
    },
  };
}
