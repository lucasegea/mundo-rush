// Servidor de escenas falso para los tests del HUD (F4.2): un SceneConnector en memoria. El test empuja mensajes del
// protocolo como si vinieran del servidor y lee lo que el cliente mandó. Sin red (D-016, D-027).
import type { ClientMessage, ServerMessage } from "@lg/protocol";
import type { SceneConnector, SceneHandlers } from "../src/services/scene/connector";

export interface FakeSceneServer {
  connector: SceneConnector;
  /** Mensajes del cliente, ya parseados, en orden. */
  sent: ClientMessage[];
  /** F5.2: frames binarios del cliente (voz del jugador), en orden. */
  binary: ArrayBuffer[];
  /** Conexiones abiertas en total y cuántas se cerraron. */
  readonly opened: number;
  readonly closed: number;
  /** Manda un mensaje del servidor a la última conexión. */
  push(msg: ServerMessage | string): void;
  /** F5.2: manda un frame binario (voz del NPC) a la última conexión. */
  pushBinary(bytes: ArrayBuffer): void;
  /** El servidor cierra la conexión. */
  drop(): void;
  /** Espera a que haya `n` conexiones abiertas. */
  waitOpen(n?: number): Promise<void>;
}

export function fakeSceneServer(opts: { fail?: boolean } = {}): FakeSceneServer {
  const sent: ClientMessage[] = [];
  const binary: ArrayBuffer[] = [];
  let handlers: SceneHandlers | null = null;
  let opened = 0;
  let closed = 0;
  let waiters: { n: number; done(): void }[] = [];
  const server: FakeSceneServer = {
    sent,
    binary,
    get opened() { return opened; },
    get closed() { return closed; },
    connector: {
      open(h) {
        if (opts.fail) return Promise.reject(new Error("sin servidor"));
        handlers = h;
        opened++;
        waiters = waiters.filter((w) => (w.n <= opened ? (w.done(), false) : true));
        return Promise.resolve({
          send: (text: string) => { sent.push(JSON.parse(text) as ClientMessage); },
          sendBinary: (bytes: ArrayBuffer) => { binary.push(bytes); },
          close: () => { closed++; handlers = null; },
        });
      },
    },
    push(msg) {
      handlers?.onMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
    },
    pushBinary(bytes) {
      handlers?.onBinary?.(bytes);
    },
    drop() {
      const h = handlers;
      handlers = null;
      h?.onClose();
    },
    waitOpen(n = 1) {
      return opened >= n ? Promise.resolve() : new Promise((done) => waiters.push({ n, done }));
    },
  };
  return server;
}

/** Mensajes típicos del comienzo de M0.1 con Inés, hasta su turno. */
export const openingFor = (npcId: string | null, missionId = "M0.1", sceneId = "M0.1-E1"): ServerMessage[] => [
  { type: "scene.opened", sceneRunId: "run-1", missionId, sceneId, npcId, modality: "text" },
  { type: "scene.state", state: "pretask", sub: null, modality: "text", turnIndex: 0, softCapReached: false },
  { type: "npc.line", line: { lineId: "l-pre", speaker: "LUMI", kind: "pretask", text: null, template: "LUMI-M0.1-PRE" } },
  { type: "scene.state", state: "npcOpening", sub: null, modality: "text", turnIndex: 0, softCapReached: false },
  { type: "npc.line", line: { lineId: "l-open", speaker: npcId ?? "LUMI", kind: "opening", text: "Hello! Welcome to Kestrel Valley.", template: null } },
  { type: "scene.state", state: "playerTurn", sub: "waiting", modality: "text", turnIndex: 0, softCapReached: false },
];

export const stateMsg = (state: string, sub: string | null, turnIndex = 0): ServerMessage =>
  ({ type: "scene.state", state, sub, modality: "text", turnIndex, softCapReached: false }) as ServerMessage;
