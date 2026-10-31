// Scene gateway (03 §4.2 gateway/, §5.3, D-158): POST /scene-token issues a single-use token (operator mode:
// no login, `op-local` account) and the WebSocket /scene?token=… opens a scene session with it. F5.1a: binary
// frames are PCM16 audio (ADR-017, framing in @lg/protocol): the client's go to the session (`not_voice` if the scene
// is not in voice) and the NPC's voice goes out as binary frames. HTTP errors use the { ok: false, error } envelope.
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
  /** true only once per token, and only before it expires. */
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

/** HTTP scene routes. Without operator mode they answer 403 with the error envelope. */
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

/** Upgrade rejection with the same JSON envelope as the rest of the server. */
function refuse(socket: Duplex, status: number, code: "unauthorized" | "forbidden" | "not_found", message: string): void {
  const body = JSON.stringify({ ok: false, error: { code, message } });
  const reason = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not Found";
  socket.end(`HTTP/1.1 ${status} ${reason}\r\ncontent-type: application/json; charset=utf-8\r\ncontent-length: ${Buffer.byteLength(body)}\r\ncache-control: no-store\r\nconnection: close\r\n\r\n${body}`);
}

/** Binary frame → PCM16 little-endian (a stray trailing byte is dropped). */
export function pcm16FromFrame(data: RawData): Int16Array {
  const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  const out = new Int16Array(Math.floor(buf.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

export interface GatewayOptions {
  tokens: TokenRegistry;
  operatorMode: boolean;
  /** Creates the scene session for a connection; `send` sends a protocol message and `sendAudio`, the NPC's voice. */
  openSession(send: (msg: ServerMessage) => void, sendAudio: (pcm16: Int16Array) => void): SceneSession;
}

/** Hooks the scene WebSocket into the HTTP server. Returns the close function. */
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
    const audioOut = (pcm16: Int16Array): void => {
      if (ws.readyState === ws.OPEN) ws.send(Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength), { binary: true });
    };
    const session = opts.openSession(out, audioOut);
    // A connection's messages are processed in order.
    let chain = Promise.resolve();
    ws.on("message", (data: RawData, isBinary: boolean) => {
      chain = chain.then(async () => {
        if (isBinary) {
          if (!session.receiveAudio(pcm16FromFrame(data))) out({ type: "error", code: "not_voice", message: "Audio en una escena que no está en voz." });
          return;
        }
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
