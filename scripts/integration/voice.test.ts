// F5.2 end to end WITHOUT a browser, without a microphone and without a paid API (D-016, D-027): the real web client (store,
// actions, scene service with the audio service, browser connector with Node's WebSocket) against the
// real server (HTTP + WebSocket, operator mode) whose Gemini Live adapter talks to the FAKE Live server of the
// tests. Only the audio engine is fake (no Web Audio). A full spoken turn: the player's audio travels in
// binary frames to Live, the transcription returns to the HUD, the NPC's voice reaches the engine and the
// conversation hooks see both turns.
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createGameServer, textProvidersFromEnv, type GameServer } from "../../apps/server/src/app.ts";
import { loadModelsConfig } from "../../apps/server/src/config/models.ts";
import { createGeminiLiveProvider } from "../../apps/server/src/providers/gemini-live/adapter.ts";
import type { ConversationTurn } from "../../apps/server/src/scene-runtime/hooks.ts";
import { createMemoryEvidenceStore } from "../../apps/server/src/store/evidence.ts";
import { createMemorySafetyStore } from "../../apps/server/src/store/safety.ts";
import { receivedOf, startFakeLiveServer, type FakeLiveServer } from "../../apps/server/test/fakes/live-server.ts";
import { realContent } from "../../apps/server/test/helpers.ts";
import { browserSceneConnector } from "../../apps/web/src/services/scene/connector.ts";
import { startSceneService } from "../../apps/web/src/services/scene/index.ts";
import { actions } from "../../apps/web/src/state/actions.ts";
import { selectDialogueHudView } from "../../apps/web/src/state/selectors/index.ts";
import { gameStore, initialGameState, type GameState } from "../../apps/web/src/state/store.ts";
import { fakeEngineFactory } from "../../apps/web/test/fake-audio.ts";
import { compiledClientContent, fetchFromContent } from "../../apps/web/test/helpers.ts";

let game: GameServer | null = null;
let live: FakeLiveServer | null = null;
let stopService: (() => void) | null = null;

beforeEach(() => gameStore.setState(initialGameState(), true));

afterEach(async () => {
  stopService?.();
  stopService = null;
  const g = game;
  game = null;
  if (g) {
    g.close();
    await new Promise<void>((done) => g.server.close(() => done()));
  }
  await live?.close();
  live = null;
});

function until(pred: (s: GameState) => boolean, label: string, ms = 10_000): Promise<void> {
  if (pred(gameStore.getState())) return Promise.resolve();
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { unsub(); fail(new Error(`timeout esperando: ${label}`)); }, ms);
    const unsub = gameStore.subscribe((s) => s, (s) => {
      if (!pred(s)) return;
      clearTimeout(timer);
      unsub();
      done();
    });
  });
}

test("un turno hablado de punta a punta: mic → servidor → Live (falso) → transcripción y voz del NPC en el cliente", async () => {
  live = await startFakeLiveServer();
  const fake = live;
  const env = { LG_OPERATOR_MODE: "1", LG_FAKE_MODELS: "1" };
  const models = loadModelsConfig();
  const turns: ConversationTurn[] = [];
  game = createGameServer({
    env, content: realContent, models, evidence: createMemoryEvidenceStore(), ...textProvidersFromEnv(models, env),
    moderation: null, safety: createMemorySafetyStore(),
    voice: () => createGeminiLiveProvider({ apiKey: "lg-test-key", model: "m", endpoint: fake.url }),
    conversation: { onTurn: (t) => { turns.push(t); } },
  });
  const g = game;
  await new Promise<void>((done) => g.server.listen(0, "127.0.0.1", done));
  const port = (g.server.address() as AddressInfo).port;
  const engines = fakeEngineFactory();
  stopService = startSceneService({
    store: gameStore, actions, baseUrl: "/", fetchJson: fetchFromContent(compiledClientContent()),
    connector: browserSceneConnector({ httpBase: `http://127.0.0.1:${port}`, wsBase: `ws://127.0.0.1:${port}` }),
    audio: { createEngine: engines.createEngine },
  });

  actions.enterScene("NPC-INES", null);
  await until((s) => selectDialogueHudView(s).voice?.canTalk === true, "M0.1 en voz, tu turno");
  expect(gameStore.getState().dialogue.modality).toBe("voice");

  actions.voiceTalkStart();
  await until((s) => s.dialogue.turnSubstate === "speaking", "el servidor abrió el turno hablado");
  for (let i = 0; i < 3; i++) engines.last?.speak(0.2, 1000 + i);
  actions.voiceTalkEnd();

  await until((s) => s.dialogue.history.some((l) => l.speaker === "player" && l.text === "Hello, I'm Nico."), "la transcripción final en el historial");
  await until((s) => s.dialogue.outcome !== null, "fin de la escena");
  expect(gameStore.getState().dialogue.outcome).toBe("success");
  // The NPC's voice (PCM16 from the fake Live) reached the client's engine.
  expect(engines.last?.played.map((p) => [...p])).toEqual([[100, -100, 200, -200]]);
  expect(gameStore.getState().dialogue.history.some((l) => l.kind === "reply" && l.text === "Nice to meet you, Nico!")).toBe(true);

  // Live received activityStart, the 3 blocks of 640 samples (16 kHz) exactly as the client captured them, and activityEnd.
  const conn = fake.connections[0];
  if (!conn) throw new Error("Live no recibió conexión");
  const rt = receivedOf(conn, "realtimeInput");
  expect(rt[0]).toEqual({ activityStart: {} });
  const audio = rt.filter((m) => "audio" in m).map((m) => (m["audio"] as { data: string; mimeType: string }));
  expect(audio).toHaveLength(3);
  expect(audio.every((a) => a.mimeType === "audio/pcm;rate=16000")).toBe(true);
  const first = Buffer.from(audio[0]?.data ?? "", "base64");
  expect(first.length).toBe(1280);
  expect(first.readInt16LE(0)).toBe(1000);
  expect(rt[rt.length - 1]).toEqual({ activityEnd: {} });

  // Hooks: the player's partials, its final and the NPC's line, all of turn 1, in voice.
  expect(turns.filter((t) => t.final).map((t) => [t.speaker, t.text])).toEqual([["player", "Hello, I'm Nico."], ["npc", "Nice to meet you, Nico!"]]);
  expect(turns.some((t) => !t.final && t.speaker === "player")).toBe(true);
  expect(turns.every((t) => t.modality === "voice" && t.turnIndex === 1)).toBe(true);
}, 30_000);
