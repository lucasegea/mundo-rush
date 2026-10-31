// book-mode slice-1 M6.2 (T4, AC5..AC7): the real server (HTTP + WebSocket, operator mode) over U-GALEANO's
// server content, with the scripted models of LG_FAKE_MODELS and storesFromEnv's in-memory stores.
// A WebSocket client drives the protocol as the browser does: token, scene.start, turn.text. Covers the chain
// MITAYO, CERRO, FACTOR and CONV-POTOSI end to end over the socket (book-scene-chain.test covers it without a socket).
// It lives in scripts/ for the same reason as prologue.test.ts (server and web do not import each other).
import type { AddressInfo } from "node:net";
import { compilarContenido } from "@lg/content-schema";
import { ServerMessageSchema, type ServerMessage } from "@lg/protocol";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { leerContenido } from "../content/build.ts";
import { createGameServer, storesFromEnv, textProvidersFromEnv, type GameServer } from "../../apps/server/src/app.ts";
import { loadModelsConfig } from "../../apps/server/src/config/models.ts";
import { must, REPO_ROOT } from "../../apps/server/test/helpers.ts";

const env = { LG_OPERATOR_MODE: "1", LG_FAKE_MODELS: "1", LG_UNIVERSE: "U-GALEANO" };
const models = loadModelsConfig();
const compiled = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
// The npc-base comes from the universe itself (fixture + EMIT, M6.4): nothing is injected from the farmer universe.
const content = Object.freeze({ ...must(compiled.salida, "U-GALEANO no compila").servidor });

interface Server { http: string; ws: string }

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

/** New server with new in-memory stores: each test is a clean game. */
async function startServer(): Promise<Server> {
  const stores = storesFromEnv(env, {}, models);
  expect(stores.persistent).toBe(false);
  game = createGameServer({
    env, models, content: () => content, evidence: stores.evidence, ...textProvidersFromEnv(models, env),
    moderation: null, safety: stores.safety, encounters: stores.encounters, ...(stores.ledger ? { ledger: stores.ledger } : {}),
  });
  const g = game;
  await new Promise<void>((done) => g.server.listen(0, "127.0.0.1", done));
  const port = (g.server.address() as AddressInfo).port;
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

/** A scene over a new socket (like each browser scene). */
class Scene {
  readonly messages: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; done: (m: ServerMessage) => void }[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = ServerMessageSchema.parse(JSON.parse(data.toString()));
      this.messages.push(msg);
      const hits = this.waiters.filter((w) => w.pred(msg));
      this.waiters = this.waiters.filter((w) => !hits.includes(w));
      for (const w of hits) w.done(msg);
    });
  }

  static async open(srv: Server): Promise<Scene> {
    const res = await fetch(`${srv.http}/scene-token`, { method: "POST" });
    const body = (await res.json()) as { ok: boolean; data?: { wsPath: string } };
    expect(body.ok).toBe(true);
    const socket = new WebSocket(`${srv.ws}${body.data?.wsPath ?? ""}`);
    sockets.push(socket);
    const scene = new Scene(socket);
    await new Promise<void>((done, fail) => { socket.once("open", () => done()); socket.once("error", fail); });
    return scene;
  }

  /** Waits for a message (already received or future) that satisfies `pred`, with a cap so a failure does not hang the suite. */
  until(pred: (m: ServerMessage) => boolean, label: string, from = 0, ms = 10_000): Promise<ServerMessage> {
    const hit = this.messages.slice(from).find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`timeout esperando: ${label}`)), ms);
      this.waiters.push({ pred, done: (m) => { clearTimeout(timer); done(m); } });
    });
  }

  send(msg: unknown): void { this.socket.send(JSON.stringify(msg)); }

  /**
   * scene.start and one turn per text. The hand belongs to the player when `playerTurn/waiting` arrives with the `turnIndex`
   * of the turns already played (the `speaking` state is the echo of what was just sent, not the returned hand).
   */
  async play(npcId: string, turns: readonly string[]): Promise<ServerMessage[]> {
    this.send({ type: "scene.start", npcId });
    await this.until((m) => m.type === "scene.opened" || m.type === "scene.blocked", `${npcId}: abierta o bloqueada`);
    const handBack = (played: number) => (m: ServerMessage) =>
      m.type === "scene.end" || (m.type === "scene.state" && m.state === "playerTurn" && m.sub === "waiting" && m.turnIndex === played);
    for (const [played, text] of turns.entries()) {
      await this.until(handBack(played), `${npcId}: tu turno ${played}`);
      if (this.messages.some((m) => m.type === "scene.end")) break;
      this.send({ type: "turn.text", text });
    }
    if (turns.length > 0) await this.until(handBack(turns.length), `${npcId}: fin tras el ultimo turno`);
    return this.messages;
  }
}

const endings = (sent: ServerMessage[]) => sent.flatMap((m) => (m.type === "scene.end" ? [m.outcome] : []));

/** Plays a whole scene over its own socket and returns what was received. */
async function scene(srv: Server, npcId: string, turns: readonly string[]): Promise<ServerMessage[]> {
  return (await Scene.open(srv)).play(npcId, turns);
}

describe("U-GALEANO por WebSocket (modelos guionados, almacenes en memoria)", () => {
  test("AC5: scene.start al FACTOR en una partida limpia responde scene.blocked notIntroduced", async () => {
    const sent = await scene(await startServer(), "NPC-FACTOR", []);
    expect(sent.find((m) => m.type === "scene.blocked")).toMatchObject({ reason: "notIntroduced" });
    expect(sent.some((m) => m.type === "scene.opened")).toBe(false);
  });

  test("AC6: MITAYO y CERRO terminan complete y el FACTOR abre M1.1-E1 con medidores de CONV-POTOSI", async () => {
    const srv = await startServer();
    const mitayo = await scene(srv, "NPC-MITAYO", ["Tell me about the mine."]);
    expect(mitayo.find((m) => m.type === "scene.opened")).toMatchObject({ missionId: "M1.2", sceneId: "M1.2-E1" });
    expect(endings(mitayo)).toEqual(["success"]);
    const cerro = await scene(srv, "NPC-CERRO", ["What did you give the town?"]);
    expect(cerro.find((m) => m.type === "scene.opened")).toMatchObject({ missionId: "M1.2", sceneId: "M1.2-E2" });
    expect(endings(cerro)).toEqual(["success"]);
    const factor = await scene(srv, "NPC-FACTOR", []);
    expect(factor.find((m) => m.type === "scene.opened")).toMatchObject({ missionId: "M1.1", sceneId: "M1.1-E1" });
    expect(factor.some((m) => m.type === "conversation.state")).toBe(true);
    expect(factor.some((m) => m.type === "scene.blocked")).toBe(false);
  });

  test("AC7: CONV-POTOSI llena todos los medidores, termina complete y llega la linea de la vaca y la leche", async () => {
    const srv = await startServer();
    await scene(srv, "NPC-MITAYO", ["Tell me about the mine."]);
    await scene(srv, "NPC-CERRO", ["What did you give the town?"]);
    const sent = await scene(srv, "NPC-FACTOR", [
      "Hello! What do you keep in those ledgers?",
      "I'm Nico. Does the silver really stay in Spain?",
      "I work far from here. Who owns the mine, really?",
      "I want to understand why Spain stayed poor.",
      "Where did all the silver really go?",
      "Thanks.",
    ]);
    const last = [...sent].reverse().find((m) => m.type === "conversation.state");
    expect(last).toMatchObject({ type: "conversation.state", completed: true });
    expect(last?.type === "conversation.state" && last.meters.every((m) => m.status === "full")).toBe(true);
    expect(endings(sent)).toEqual(["success"]);
    const lines = sent.flatMap((m) => (m.type === "npc.line" && m.line.text !== null ? [m.line.text] : []));
    expect(lines.some((l) => l.includes("The milk was never ours"))).toBe(true);
  }, 30_000);
});
