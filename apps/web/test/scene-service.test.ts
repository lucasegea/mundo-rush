// F4.2: servicio de escena (services/scene) y su conector, sin red. El conector real con fetch/WebSocket falsos; el
// servicio contra un servidor de escenas falso y el store real.
import { SCENE_TOKEN_PATH as PROTO_TOKEN, SCENE_WS_PATH as PROTO_WS } from "@lg/protocol";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { browserSceneConnector, SCENE_TOKEN_PATH, SCENE_WS_PATH, type SceneHandlers } from "../src/services/scene/connector";
import { startSceneService } from "../src/services/scene";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { fakeSceneServer, openingFor } from "./fake-scene";
import { fakeEngineFactory } from "./fake-audio";
import { compiledClientContent, fetchFromContent, resetStore } from "./helpers";

describe("conector", () => {
  test("las rutas son las de @lg/protocol (el conector no importa protocol para no meter zod en el chunk inicial)", () => {
    expect(SCENE_TOKEN_PATH).toBe(PROTO_TOKEN);
    expect(SCENE_WS_PATH).toBe(PROTO_WS);
  });

  class FakeWs {
    static last: FakeWs | null = null;
    static failOpen = false;
    static OPEN = 1;
    readonly OPEN = 1;
    readyState = 1;
    binaryType = "blob";
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    sent: (string | ArrayBuffer)[] = [];
    closed = false;
    constructor(public url: string) {
      FakeWs.last = this;
      queueMicrotask(() => (FakeWs.failOpen ? this.onerror?.() : this.onopen?.()));
    }
    send(t: string | ArrayBuffer) { this.sent.push(t); }
    close() { this.closed = true; }
  }
  const asWs = FakeWs as unknown as typeof WebSocket;
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const handlers = (): SceneHandlers & { got: string[]; bin: ArrayBuffer[]; closes: number } => {
    const h = {
      got: [] as string[], bin: [] as ArrayBuffer[], closes: 0,
      onMessage: (t: string) => { h.got.push(t); }, onBinary: (b: ArrayBuffer) => { h.bin.push(b); }, onClose: () => { h.closes++; },
    };
    return h;
  };

  beforeEach(() => { FakeWs.last = null; FakeWs.failOpen = false; });

  test("pide el token por POST, abre el WebSocket en wsPath y pasa mensajes y cierre", async () => {
    const fetchImpl = reply(200, { ok: true, data: { token: "t".repeat(32), wsPath: "/scene?token=abc" } });
    const c = browserSceneConnector({ httpBase: "http://h", wsBase: "ws://h", fetchImpl, WebSocketImpl: asWs });
    const h = handlers();
    const s = await c.open(h);
    expect(fetchImpl).toHaveBeenCalledWith("http://h/scene-token", { method: "POST" });
    const ws = FakeWs.last;
    if (!ws) throw new Error("sin WebSocket");
    expect(ws.url).toBe("ws://h/scene?token=abc");
    expect(ws.binaryType).toBe("arraybuffer"); // F5.2: la voz del NPC llega como ArrayBuffer
    s.send("x");
    const bytes = new ArrayBuffer(4);
    s.sendBinary(bytes);
    expect(ws.sent).toEqual(["x", bytes]);
    ws.onmessage?.({ data: "{\"a\":1}" });
    const npc = new ArrayBuffer(2);
    ws.onmessage?.({ data: npc }); // binario: va a onBinary, no a onMessage
    ws.onmessage?.({ data: 42 }); // ni texto ni ArrayBuffer: se ignora
    expect(h.got).toEqual(["{\"a\":1}"]);
    expect(h.bin).toEqual([npc]);
    ws.onclose?.();
    expect(h.closes).toBe(1);
    s.close();
    expect(ws.closed).toBe(true);
  });

  test("token rechazado (fuera de modo operador) → error claro, sin WebSocket", async () => {
    const fetchImpl = reply(403, { ok: false, error: { code: "operatorOnly" } });
    const c = browserSceneConnector({ httpBase: "", wsBase: "ws://h", fetchImpl, WebSocketImpl: asWs });
    await expect(c.open(handlers())).rejects.toThrow("scene-token: 403 operatorOnly");
    expect(FakeWs.last).toBeNull();
  });

  test("wsPath ajeno a /scene → error (no abre a otra ruta)", async () => {
    const fetchImpl = reply(200, { ok: true, data: { token: "t".repeat(32), wsPath: "//evil/x" } });
    const c = browserSceneConnector({ httpBase: "", wsBase: "ws://h", fetchImpl, WebSocketImpl: asWs });
    await expect(c.open(handlers())).rejects.toThrow("sin wsPath");
  });

  test("el WebSocket no abre → error", async () => {
    FakeWs.failOpen = true;
    const fetchImpl = reply(200, { ok: true, data: { token: "t".repeat(32), wsPath: "/scene?token=a" } });
    const c = browserSceneConnector({ httpBase: "", wsBase: "ws://h", fetchImpl, WebSocketImpl: asWs });
    await expect(c.open(handlers())).rejects.toThrow("no se pudo abrir");
  });
});

describe("servicio de escena", () => {
  let stop: (() => void) | null = null;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { resetStore(); warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { stop?.(); stop = null; warn.mockRestore(); });

  const start = (server = fakeSceneServer(), fetchJson = fetchFromContent(compiledClientContent())) => {
    stop = startSceneService({ store: gameStore, actions, connector: server.connector, baseUrl: "/", fetchJson });
    return server;
  };

  test("pedido → conecta, manda scene.start, carga el glosario una vez; lo encolado sale en orden", async () => {
    const fetchJson = vi.fn(fetchFromContent(compiledClientContent()));
    const server = start(fakeSceneServer(), fetchJson);
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
    await vi.waitFor(() => expect(gameStore.getState().dialogue.connection).toBe("open"));
    for (const m of openingFor("NPC-INES")) server.push(m);
    actions.submitTurn("Hello!");
    expect(server.sent).toEqual([{ type: "scene.start", npcId: "NPC-INES" }, { type: "turn.text", text: "Hello!" }]);
    expect(gameStore.getState().dialogue.outbox).toEqual([]);
    await vi.waitFor(() => expect(gameStore.getState().dialogue.lexicon.status).toBe("ready"));
    actions.leaveScene();
    actions.enterScene("NPC-INES", null);
    await server.waitOpen(2);
    expect(fetchJson).toHaveBeenCalledTimes(3); // manifiesto + glosario + lumi, una sola vez
  });

  test("salir cierra la conexión; un pedido que se reemplaza antes de abrir no se usa", async () => {
    const server = start();
    actions.enterScene("NPC-INES", null);
    actions.leaveScene();
    actions.enterScene(null, null);
    await server.waitOpen(2);
    await vi.waitFor(() => expect(gameStore.getState().dialogue.connection).toBe("open"));
    // La primera conexión (pedido viejo) se cerró sin mandar nada; la segunda arrancó la escena de Lumi.
    expect(server.closed).toBe(1);
    expect(server.sent).toEqual([{ type: "scene.start", npcId: null }]);
    actions.leaveScene();
    expect(server.closed).toBe(2);
  });

  test("lo que no valida contra el protocolo se descarta; el servidor que cierra deja la escena sin conexión", async () => {
    const server = start();
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
    await vi.waitFor(() => expect(gameStore.getState().dialogue.connection).toBe("open"));
    const before = gameStore.getState().dialogue;
    server.push("no json");
    server.push(JSON.stringify({ type: "scene.state", state: "hack" }));
    server.push(JSON.stringify({ type: "npc.line", line: { lineId: "x", speaker: "NPC-INES", kind: "reply", text: "hi", template: null }, extra: 1 }));
    expect(gameStore.getState().dialogue.history).toBe(before.history);
    expect(warn).toHaveBeenCalledTimes(3);
    server.drop();
    expect(gameStore.getState().dialogue.connection).toBe("closed");
  });
});

describe("servicio de escena con voz (F5.2)", () => {
  let stop: (() => void) | null = null;
  beforeEach(() => resetStore());
  afterEach(() => { stop?.(); stop = null; });

  const start = (engines = fakeEngineFactory(), server = fakeSceneServer()) => {
    stop = startSceneService({
      store: gameStore, actions, connector: server.connector, baseUrl: "/", fetchJson: fetchFromContent(compiledClientContent()),
      audio: { createEngine: engines.createEngine },
    });
    return { server, engines };
  };
  const voiceOpening = (): void => {
    const { server } = current;
    server.push({ type: "scene.opened", sceneRunId: "run-1", missionId: "M0.1", sceneId: "M0.1-E1", npcId: "NPC-INES", modality: "voice" });
    server.push({ type: "scene.state", state: "playerTurn", sub: "waiting", modality: "voice", turnIndex: 0, softCapReached: false });
  };
  let current: ReturnType<typeof start>;

  test("con micrófono: pide la escena en voz; la voz del jugador sale en binario y la del NPC llega al motor", async () => {
    current = start();
    const { server, engines } = current;
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
    await vi.waitFor(() => expect(server.sent[0]).toEqual({ type: "scene.start", npcId: "NPC-INES", modality: "voice" }));
    voiceOpening();
    actions.voiceTalkStart();
    engines.last?.speak(0.2, 258); // 258 = 0x0102
    expect(server.sent[1]).toEqual({ type: "voice.turnStart" });
    expect(server.binary).toHaveLength(1);
    expect(new Uint8Array(server.binary[0] ?? new ArrayBuffer(0)).slice(0, 2)).toEqual(Uint8Array.from([2, 1])); // PCM16 LE
    const npc = new ArrayBuffer(4);
    new DataView(npc).setInt16(0, -2, true);
    server.pushBinary(npc);
    expect([...(engines.last?.played[0] ?? [])]).toEqual([-2, 0]);
  });

  test("sin permiso de micrófono: pide la escena por texto y suelta el motor", async () => {
    current = start(fakeEngineFactory({ ok: false, problem: "denied" }));
    const { server, engines } = current;
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
    await vi.waitFor(() => expect(server.sent[0]).toEqual({ type: "scene.start", npcId: "NPC-INES", modality: "text" }));
    expect(engines.last?.closed).toBe(true);
    expect(gameStore.getState().dialogue.voice.micProblem).toBe("denied");
  });

  test("salir de la escena suelta el micrófono; volver a entrar lo pide de nuevo", async () => {
    current = start();
    const { server, engines } = current;
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
    await vi.waitFor(() => expect(server.sent).toHaveLength(1));
    const first = engines.last;
    actions.leaveScene();
    expect(first?.closed).toBe(true);
    actions.enterScene("NPC-INES", null);
    await server.waitOpen(2);
    expect(engines.created).toBe(2);
  });
});
