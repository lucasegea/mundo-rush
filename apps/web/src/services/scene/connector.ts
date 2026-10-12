// Conector del servidor de escenas (F4.2): POST /scene-token (D-158) + WebSocket. Va en un archivo aparte, sin zod ni
// @lg/protocol, porque lo importa la raíz de composición (main.tsx) y entra al chunk inicial; el resto del servicio de
// escena se carga diferido. Las rutas son las de @lg/protocol (un test lo comprueba).

/** Mismas rutas que SCENE_TOKEN_PATH / SCENE_WS_PATH de @lg/protocol. */
export const SCENE_TOKEN_PATH = "/scene-token";
export const SCENE_WS_PATH = "/scene";

/** Una conexión abierta con el servidor de escenas. */
export interface SceneSocket {
  send(text: string): void;
  /** F5.2: frame binario (voz del jugador, PCM16 16 kHz; ADR-017). */
  sendBinary(bytes: ArrayBuffer): void;
  close(): void;
}

export interface SceneHandlers {
  onMessage(text: string): void;
  /** F5.2: frame binario del servidor (voz del NPC, PCM16 24 kHz). */
  onBinary?(bytes: ArrayBuffer): void;
  onClose(): void;
}

/** Abre una conexión de escena (en la app: token + WebSocket; en tests: un servidor falso o el real). */
export interface SceneConnector {
  open(handlers: SceneHandlers): Promise<SceneSocket>;
}

export interface BrowserConnectorOptions {
  /** Origen HTTP del servidor (en la app, el mismo de la página: Vite hace de proxy, 03 §7.8 connect-src propio). */
  httpBase: string;
  /** Origen WS (ws:// o wss://). */
  wsBase: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
}

/** Conector real: POST /scene-token (modo operador, D-158) y WebSocket al `wsPath` que devuelve. */
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
      ws.binaryType = "arraybuffer"; // la voz del NPC llega como ArrayBuffer (no Blob)
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
