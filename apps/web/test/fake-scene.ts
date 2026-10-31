// Fake scene server for the HUD tests (F4.2): an in-memory SceneConnector. The test pushes protocol messages as
// if they came from the server and reads what the client sent. No network (D-016, D-027).
import type { ClientMessage, ServerMessage } from "@lg/protocol";
import type { SceneConnector, SceneHandlers } from "../src/services/scene/connector";

export interface FakeSceneServer {
  connector: SceneConnector;
  /** Client messages, already parsed, in order. */
  sent: ClientMessage[];
  /** F5.2: binary frames from the client (player voice), in order. */
  binary: ArrayBuffer[];
  /** Connections opened in total and how many were closed. */
  readonly opened: number;
  readonly closed: number;
  /** Sends a server message to the latest connection. */
  push(msg: ServerMessage | string): void;
  /** F5.2: sends a binary frame (NPC voice) to the latest connection. */
  pushBinary(bytes: ArrayBuffer): void;
  /** The server closes the connection. */
  drop(): void;
  /** Waits until `n` connections are open. */
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

/** Typical messages from the start of M0.1 with Inés, up to her turn. */
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
