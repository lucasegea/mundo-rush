// Scene server connector (F4.2): POST /scene-token (D-158) + WebSocket. It lives in a separate file, without zod or
// @lg/protocol, because the composition root (main.tsx) imports it and it enters the initial chunk; the rest of the
// scene service is loaded deferred. The routes are those of @lg/protocol (a test checks it).

/** Same routes as SCENE_TOKEN_PATH / SCENE_WS_PATH from @lg/protocol. */
export const SCENE_TOKEN_PATH = "/scene-token";
export const SCENE_WS_PATH = "/scene";

/** An open connection to the scene server. */
export interface SceneSocket {
  send(text: string): void;
  /** F5.2: binary frame (player voice, PCM16 16 kHz; ADR-017). */
  sendBinary(bytes: ArrayBuffer): void;
  close(): void;
}

export interface SceneHandlers {
  onMessage(text: string): void;
  /** F5.2: binary frame from the server (NPC voice, PCM16 24 kHz). */
  onBinary?(bytes: ArrayBuffer): void;
  onClose(): void;
}

/** Opens a scene connection (in the app: token + WebSocket; in tests: a fake server or the real one). */
export interface SceneConnector {
  open(handlers: SceneHandlers): Promise<SceneSocket>;
}

export interface BrowserConnectorOptions {
  /** HTTP origin of the server (in the app, the same as the page: Vite acts as proxy, 03 §7.8 own connect-src). */
  httpBase: string;
  /** WS origin (ws:// or wss://). */
  wsBase: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
}

/** Real connector: POST /scene-token (operator mode, D-158) and WebSocket to the `wsPath` it returns. */
export function browserSceneConnector(o: BrowserConnectorOptions): SceneConnector {
  const fetchImpl = o.fetchImpl ?? fetch;
  const WS = o.WebSocketImpl ?? WebSocket;
  return {
    async open(handlers) {
      const res = await fetchImpl(`${o.httpBase}${SCENE_TOKEN_PATH}`, { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; data?: unknown; error?: { code?: string } };
      if (!res.ok || body.ok !== true) throw new Error(`scene-token: ${res.status} ${body.error?.code ?? ""}`.trim());
      const wsPath = (body.data as { wsPath?: unknown } | undefined)?.wsPath;
      if (typeof wsPath !== "string" || !wsPath.startsWith(SCENE_WS_PATH)) throw new Error("scene-token: respuesta sin wsPath");
      const ws = new WS(`${o.wsBase}${wsPath}`);
      ws.binaryType = "arraybuffer"; // the NPC voice arrives as an ArrayBuffer (not a Blob)
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("WebSocket de escena: no se pudo abrir"));
      });
      ws.onerror = null;
      ws.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data === "string") handlers.onMessage(ev.data);
        else if (ev.data instanceof ArrayBuffer) handlers.onBinary?.(ev.data);
      };
      ws.onclose = () => handlers.onClose();
      return {
        send: (text) => ws.send(text),
        sendBinary: (bytes) => { if (ws.readyState === ws.OPEN) ws.send(bytes); },
        close: () => ws.close(),
      };
    },
  };
}
