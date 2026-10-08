// F4.1 A4 + gateway: el servidor real (HTTP + WebSocket) con modelos falsos. Inspección del protocolo: ningún byte
// que llega al cliente lleva texto de prompt, nombre de modelo o clave; todo frame valida contra el esquema estricto.
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ServerMessageSchema, type ServerMessage } from "@lg/protocol";
import { createGameServer, type GameServer } from "../src/app.ts";
import { GEMINI_KEY_VAR, loadModelsConfig } from "../src/config/models.ts";
import { observerPrompt } from "../src/observer/observer.ts";
import { readCatalog } from "../src/scene-runtime/catalog.ts";
import { createMemoryEvidenceStore } from "../src/store/evidence.ts";
import { fakeNpcModel, fakeObserverModel, M01_RULES, observerJson } from "./fakes/text-model.ts";
import { realContent } from "./helpers.ts";

/** Valor de clave falso: si aparece en cualquier frame, se filtró. */
const FAKE_KEY = "lg-test-key-0123456789abcdef";

let game: GameServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) if (s.readyState === WebSocket.OPEN) s.terminate();
  const g = game;
  game = null;
  if (g) {
    g.close();
    await new Promise<void>((done) => g.server.close(() => done()));
  }
});

async function start(operator: boolean) {
  const npc = fakeNpcModel(["Hello! And your name?"]);
  const observer = fakeObserverModel((c) => observerJson(c, M01_RULES));
  const env = { ...(operator ? { LG_OPERATOR_MODE: "1" } : {}), [GEMINI_KEY_VAR]: FAKE_KEY };
  game = createGameServer({ env, content: realContent, models: loadModelsConfig(), evidence: createMemoryEvidenceStore(), npcModel: npc, observerModel: observer });
  const g = game;
  await new Promise<void>((done) => g.server.listen(0, "127.0.0.1", done));
  const port = (g.server.address() as AddressInfo).port;
  return { npc, observer, http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

interface Client {
  frames: string[];
  messages: ServerMessage[];
  socket: WebSocket;
  send(msg: unknown): void;
  until(pred: (m: ServerMessage) => boolean): Promise<ServerMessage>;
}

function connect(url: string): Promise<Client> {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const frames: string[] = [];
  const messages: ServerMessage[] = [];
  let waiters: { pred: (m: ServerMessage) => boolean; done: (m: ServerMessage) => void }[] = [];
  socket.on("message", (data) => {
    const text = data.toString();
    frames.push(text);
    const msg = ServerMessageSchema.parse(JSON.parse(text));
    messages.push(msg);
    const hits = waiters.filter((w) => w.pred(msg));
    waiters = waiters.filter((w) => !hits.includes(w));
    for (const w of hits) w.done(msg);
  });
  return new Promise((resolveOpen, reject) => {
    socket.once("error", reject);
    socket.once("open", () => resolveOpen({
      frames, messages, socket,
      send: (msg) => socket.send(JSON.stringify(msg)),
      until: (pred) => {
        const hit = messages.find(pred);
        return hit ? Promise.resolve(hit) : new Promise((done) => waiters.push({ pred, done }));
      },
    }));
  });
}

interface TokenReply {
  status: number;
  raw: string;
  body: { ok: boolean; data?: { token: string; wsPath: string }; error?: { code: string; message: string } };
}

async function token(http: string): Promise<TokenReply> {
  const res = await fetch(`${http}/scene-token`, { method: "POST" });
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) as TokenReply["body"] };
}

/** Rechazo del upgrade: status y cuerpo crudo de la respuesta HTTP. */
function upgradeRefusal(url: string): Promise<{ status: number; body: string }> {
  return new Promise((done, reject) => {
    const socket = new WebSocket(url);
    sockets.push(socket);
    socket.once("unexpected-response", (_req, res) => {
      let body = "";
      res.on("data", (c: Buffer) => { body += c.toString(); });
      res.on("end", () => done({ status: res.statusCode ?? 0, body }));
    });
    socket.once("open", () => reject(new Error("el upgrade no debía aceptarse")));
  });
}

const wsUrl = (ws: string, t: TokenReply): string => `${ws}${t.body.data?.wsPath ?? ""}`;

describe("gateway de escena (modo operador)", () => {
  test("token → WebSocket → M0.1 por texto hasta scene.end con éxito", async () => {
    const { http, ws } = await start(true);
    const t = await token(http);
    expect(t.status).toBe(200);
    expect(t.body.ok).toBe(true);
    const client = await connect(wsUrl(ws, t));
    client.send({ type: "scene.start", npcId: "NPC-INES" });
    await client.until((m) => m.type === "scene.state" && m.state === "playerTurn");
    client.send({ type: "turn.text", text: "Hello! I'm Nico." });
    const end = await client.until((m) => m.type === "scene.end");
    expect(end).toMatchObject({ outcome: "success", criteriaMet: ["C1", "C2"] });
    expect(client.messages.find((m) => m.type === "scene.effects")).toMatchObject({ effects: [{ flag: "lamp_bunk_on" }, { intro: "NPC-MAYA" }] });
  });

  test("el token es de un solo uso", async () => {
    const { http, ws } = await start(true);
    const t = await token(http);
    await connect(wsUrl(ws, t));
    const again = await upgradeRefusal(wsUrl(ws, t));
    expect(again.status).toBe(401);
    expect(JSON.parse(again.body)).toEqual({ ok: false, error: { code: "unauthorized", message: "Token de escena inválido o vencido." } });
  });

  test("frame binario (audio, F5) → not_implemented; JSON roto → bad_message", async () => {
    const { http, ws } = await start(true);
    const client = await connect(wsUrl(ws, await token(http)));
    client.socket.send(Buffer.from([1, 2, 3]));
    await client.until((m) => m.type === "error" && m.code === "not_implemented");
    client.socket.send("{nope");
    await client.until((m) => m.type === "error" && m.code === "bad_message");
  });

  test("ruta WS desconocida → 404 con el sobre de error", async () => {
    const { ws } = await start(true);
    const r = await upgradeRefusal(`${ws}/nope`);
    expect(r.status).toBe(404);
    expect(JSON.parse(r.body)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("sin LG_OPERATOR_MODE=1 no hay escenas", () => {
  test("POST /scene-token → 403 con el sobre de error", async () => {
    const { http } = await start(false);
    const t = await token(http);
    expect(t.status).toBe(403);
    expect(t.body).toEqual({ ok: false, error: { code: "forbidden", message: "Escenas solo en modo operador (LG_OPERATOR_MODE=1)." } });
  });

  test("upgrade a /scene → 403", async () => {
    const { ws } = await start(false);
    const r = await upgradeRefusal(`${ws}/scene?token=x`);
    expect(r.status).toBe(403);
    expect(JSON.parse(r.body)).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("A4: inspección del protocolo", () => {
  test("ningún frame ni respuesta HTTP lleva texto de prompt, nombre de modelo o clave", async () => {
    const { http, ws, npc, observer } = await start(true);
    const t = await token(http);
    const client = await connect(wsUrl(ws, t));
    // Recorrido por todos los caminos de salida: pasar el turno (nota [DIRECTOR]), turno con respuesta, cierre, bloqueo.
    client.send({ type: "scene.start", npcId: "NPC-INES" });
    await client.until((m) => m.type === "scene.state" && m.state === "playerTurn");
    client.send({ type: "turn.pass" });
    await client.until((m) => m.type === "scene.state" && m.sub === "passMenu");
    client.send({ type: "turn.choose", option: "simpler" });
    await client.until((m) => m.type === "scene.state" && m.sub === "waiting" && m.turnIndex === 1);
    client.send({ type: "turn.text", text: "Hi, I'm Nico." });
    await client.until((m) => m.type === "scene.end");
    client.send({ type: "scene.start", npcId: "NPC-NELL" }); // no presentada: línea guionada
    await client.until((m) => m.type === "scene.blocked");

    const wire = [t.raw, ...client.frames].join("\n");
    const lowerWire = wire.toLowerCase();
    const models = loadModelsConfig();
    const catalog = readCatalog(realContent());
    const systems = [...npc.calls, ...observer.calls].map((c) => c.system);
    expect(npc.calls.length).toBeGreaterThanOrEqual(1);
    expect(observer.calls.length).toBeGreaterThanOrEqual(1);
    // Cada línea larga de cada prompt de sistema que recibió un modelo: ninguna cruza el cable.
    const promptChunks = systems.flatMap((s) => s.split("\n").map((l) => l.trim()).filter((l) => l.length >= 24));
    expect(promptChunks.length).toBeGreaterThan(20);
    expect(promptChunks.filter((chunk) => wire.includes(chunk))).toEqual([]);
    const observerHead = observerPrompt({ turnId: "x", playerText: "", lastNpcLine: null, criteria: [], structures: [], cefrBand: "A1" }).slice(0, 60);
    for (const needle of [
      "=== PERSONA", "[DIRECTOR]", "OBSERVER", catalog.npcBase.slice(0, 60), observerHead,
      models.roles.textNpc.model, models.roles.observer.model, "gemini", FAKE_KEY, GEMINI_KEY_VAR, "x-goog-api-key", "fake-npc", "fake-observer",
    ]) {
      expect(lowerWire.includes(needle.toLowerCase()), `se filtró: ${needle}`).toBe(false);
    }
  });

  test("los mensajes del servidor son estrictos: un campo de más (prompt, model, key) no valida", () => {
    const state: ServerMessage = { type: "scene.state", state: "idle", sub: null, modality: "text", turnIndex: 0, softCapReached: false };
    expect(ServerMessageSchema.safeParse(state).success).toBe(true);
    for (const extra of [{ prompt: "You are Ines" }, { model: "gemini-2.5-flash" }, { apiKey: FAKE_KEY }]) {
      expect(ServerMessageSchema.safeParse({ ...state, ...extra }).success).toBe(false);
    }
    const line = { lineId: "l1", speaker: "NPC-INES", kind: "reply", text: "Hi", template: null };
    expect(ServerMessageSchema.safeParse({ type: "npc.line", line }).success).toBe(true);
    expect(ServerMessageSchema.safeParse({ type: "npc.line", line: { ...line, system: "You are Ines" } }).success).toBe(false);
  });
});
