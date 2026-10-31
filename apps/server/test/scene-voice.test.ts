// F5.1a: voice scene in scene-runtime. A2 (5:00 cap with Live closed on entering closing and the scripted closing
// line; fake Live server), A3 (the TurnClip is built by scene-runtime, reaches the fake observer on each turn and is
// released, also at 10 s), output moderation in the runtime, fallback to text and per-turn cost in the ledger.
import { afterEach, describe, expect, test } from "vitest";
import { createMemoryCostLedger, costPolicyFromConfig } from "../src/cost/ledger.ts";
import { loadModelsConfig } from "../src/config/models.ts";
import { createGeminiLiveProvider } from "../src/providers/gemini-live/adapter.ts";
import type { ModerationProvider } from "../src/providers/moderation.ts";
import { ReleasedClipError } from "../src/scene-runtime/turn-clip.ts";
import { startFakeLiveServer, type FakeLiveServer } from "./fakes/live-server.ts";
import { createReferenceVoice, type ReferenceVoice } from "./fakes/reference-voice.ts";
import { fakeObserverModel, M01_RULES } from "./fakes/text-model.ts";
import type { VoiceEvent } from "../src/providers/types.ts";
import { harness, must, type Harness } from "./helpers.ts";

let server: FakeLiveServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Opens M0.1 with Inés in voice and reaches playerTurn.waiting. */
async function openVoice(h: Harness): Promise<void> {
  await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
  expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
}

/** A spoken turn: start, audio frames, Done. */
async function speak(h: Harness, frames: number[][]): Promise<void> {
  await h.session.receive({ type: "voice.turnStart" });
  for (const f of frames) expect(h.session.receiveAudio(Int16Array.from(f))).toBe(true);
  await h.session.receive({ type: "voice.turnEnd" });
}

describe("A3: el TurnClip", () => {
  test("lo arma scene-runtime con el audio del jugador, llega al observador y se libera", async () => {
    let ref = null as ReferenceVoice | null;
    const h = harness({ rules: M01_RULES, voice: () => (ref = createReferenceVoice()) });
    await openVoice(h);
    expect(h.of("scene.opened")[0]).toMatchObject({ modality: "voice" });
    expect(must(ref).calls).toEqual(["open", "inject:user,model"]); // the already-spoken opening enters as a previous turn
    await speak(h, [[1, 2], [3]]);
    // The observer received the clip (16 kHz) in addition to the adapter's transcript.
    const req = h.observer.calls[0];
    expect(req?.audio ? [...req.audio.pcm16] : null).toEqual([1, 2, 3]);
    expect(req?.audio?.sampleRate).toBe(16000);
    expect(h.observer.observed[0]?.playerText).toBe("Hello, I'm Nico.");
    // Released when the observer finishes: no audio is left in memory.
    expect(h.clips).toHaveLength(1);
    expect(h.clips[0]?.released).toBe(true);
    expect(h.clips[0]?.sampleCount).toBe(0);
    expect(() => h.clips[0]?.pcm16()).toThrow(ReleasedClipError);
    // The adapter received the audio but doesn't keep the clip (it only counts samples).
    expect(must(ref).samplesReceived).toBe(3);
    // Criteria fulfilled (greeting + name): the NPC line goes out moderated and the scene closes successfully.
    expect(h.of("npc.line").some((m) => m.line.kind === "reply" && m.line.text === "Nice to meet you, Nico!")).toBe(true);
    expect(h.of("scene.end")[0]?.outcome).toBe("success");
    expect(must(ref).closedWith).toBe("done");
  });

  test("llega al observador en cada turno, con su propio audio", async () => {
    const h = harness({ rules: [], voice: () => createReferenceVoice() });
    await openVoice(h);
    await speak(h, [[1]]);
    await speak(h, [[2, 2]]);
    expect(h.observer.calls.map((c) => (c.audio ? [...c.audio.pcm16] : null))).toEqual([[1], [2, 2]]);
    expect(h.clips.map((c) => c.released)).toEqual([true, true]);
    expect(h.clips.map((c) => c.turnId.split(":")[1])).toEqual(["1", "2"]);
  });

  test("si el observador no termina, el clip se libera a los 10 s", async () => {
    const hung = fakeObserverModel(() => "{}");
    hung.generate = () => new Promise(() => {}); // never answers
    const h = harness({ voice: () => createReferenceVoice(), observerModel: hung });
    await openVoice(h);
    await h.session.receive({ type: "voice.turnStart" });
    h.session.receiveAudio(Int16Array.from([4, 4]));
    void h.session.receive({ type: "voice.turnEnd" });
    await flush();
    expect(h.clips[0]?.released).toBe(false);
    h.scheduler.advance(9_999);
    expect(h.clips[0]?.released).toBe(false);
    h.scheduler.advance(1);
    expect(h.clips[0]?.released).toBe(true);
    h.session.close();
  });

  test("audio fuera del turno hablado se descarta; en una escena de texto, receiveAudio dice que no", async () => {
    const h = harness({ voice: () => createReferenceVoice() });
    await openVoice(h);
    expect(h.session.receiveAudio(Int16Array.from([1]))).toBe(true); // in voice, but in waiting: it is discarded
    expect(h.clips).toHaveLength(0);
    const t = harness();
    await t.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    expect(t.session.receiveAudio(Int16Array.from([1]))).toBe(false);
  });
});

describe("A2: tope de 5:00 con la sesión Live (servidor falso)", () => {
  test("hardCap en playerTurn.waiting → closing: Live cerrado, línea de cierre guionada en closing, sin audio del NPC", async () => {
    server = await startFakeLiveServer();
    const s = server;
    const h = harness({ voice: () => createGeminiLiveProvider({ apiKey: "lg-test-key", model: "m", endpoint: s.url }) });
    await openVoice(h);
    h.scheduler.advance(240_000); // softCap: only marks
    expect(h.session.snapshot.state).toBe("playerTurn");
    const before = h.sent.length;
    h.scheduler.advance(60_000); // hardCap
    await h.session.settled();
    for (let i = 0; i < 100 && !s.connections[0]?.closed; i++) await new Promise((r) => setTimeout(r, 10));
    expect(s.connections[0]?.closed).toBe(true);
    expect(s.connections[0]?.closeCode).toBe(1000);
    const after = h.sent.slice(before);
    const closingAt = after.findIndex((m) => m.type === "scene.state" && m.state === "closing");
    const exitAt = after.findIndex((m) => m.type === "npc.line" && m.line.kind === "exit");
    expect(closingAt).toBeGreaterThanOrEqual(0);
    expect(exitAt).toBeGreaterThan(closingAt); // the line goes out already in closing, never in playerTurn
    expect(h.of("scene.end")[0]?.outcome).toBe("hardCap");
    expect(h.audioOut).toEqual([]);
    // Nothing asked Live for the closing line: after opening there was only the injected opening.
    expect(s.connections[0]?.received.filter((m) => "clientContent" in m)).toHaveLength(1);
  });

  test("un turno completo por Live: el audio del NPC sale al cliente solo durante npcTurn", async () => {
    server = await startFakeLiveServer();
    const s = server;
    const h = harness({ rules: [], voice: () => createGeminiLiveProvider({ apiKey: "lg-test-key", model: "m", endpoint: s.url }) });
    await openVoice(h);
    await h.session.receive({ type: "voice.turnStart" });
    h.session.receiveAudio(Int16Array.from([7, 8]));
    await h.session.receive({ type: "voice.turnEnd" });
    for (let i = 0; i < 100 && h.session.snapshot.sub !== "waiting"; i++) await new Promise((r) => setTimeout(r, 10));
    await h.session.settled();
    expect(h.audioOut.map((a) => [...a])).toEqual([[100, -100, 200, -200]]);
    expect(h.observer.calls[0]?.audio ? [...h.observer.calls[0].audio.pcm16] : null).toEqual([7, 8]);
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
    h.session.close();
  });
});

describe("moderación de salida en scene-runtime (no en el adaptador)", () => {
  test("una línea del NPC marcada por el clasificador se corta: safety + línea segura, sin la línea original", async () => {
    const classifier: ModerationProvider = {
      id: "fake", classify: (text, dir) => Promise.resolve(dir === "output" && /Nico/.test(text) ? "inappropriate" : "ok"),
    };
    const h = harness({ rules: [], voice: () => createReferenceVoice(), moderation: classifier });
    await openVoice(h);
    await speak(h, [[1]]);
    expect(h.of("scene.safety")).toEqual([{ type: "scene.safety", layer: "output", action: "cut" }]);
    expect(h.of("npc.line").some((m) => m.line.text === "Nice to meet you, Nico!")).toBe(false);
    expect(h.of("npc.line").some((m) => m.line.kind === "safe")).toBe(true);
  });
});

describe("caída a texto (03 §5.8) y pases en voz", () => {
  test("si la sesión de voz no abre: aviso model_unavailable y la misma escena sigue por texto", async () => {
    const h = harness({ rules: M01_RULES, voice: () => createReferenceVoice({ failOpen: true }) });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    expect(h.of("scene.notice").map((n) => n.code)).toEqual(["model_unavailable"]);
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting", ctx: { modality: "text" } });
    await h.session.receive({ type: "turn.text", text: "Hello! I'm Nico." });
    expect(h.of("scene.end")[0]?.outcome).toBe("success");
  });

  test("sin adaptador (sin clave): aviso y texto desde el principio", async () => {
    const h = harness({ voice: null });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    expect(h.of("scene.notice").map((n) => n.code)).toEqual(["model_unavailable"]);
    expect(h.of("scene.opened")[0]?.modality).toBe("text");
  });

  test("la voz se pierde a mitad de escena (error no recuperable): texto desde el último turno", async () => {
    let ref = null as ReferenceVoice | null;
    let emit = null as ((e: VoiceEvent) => void) | null;
    const h = harness({
      voice: () => {
        const r = createReferenceVoice();
        const on = r.on.bind(r);
        r.on = (handler) => {
          emit = handler;
          on(handler);
        };
        return (ref = r);
      },
    });
    await openVoice(h);
    must(emit)({ type: "error", turnId: null, recoverable: false, code: "connection_lost" });
    await h.session.settled();
    expect(h.session.snapshot.ctx.modality).toBe("text");
    expect(must(ref).closedWith).toBe("error");
    expect(h.of("scene.notice").map((n) => n.code)).toEqual(["model_unavailable"]);
    await h.session.receive({ type: "turn.text", text: "Hello?" });
    expect(h.npc.calls).toHaveLength(1); // the text NPC carries on with the scene
  });

  test("Más simple en voz: la nota [DIRECTOR] va al adaptador y su respuesta cierra el turno", async () => {
    let ref = null as ReferenceVoice | null;
    const h = harness({ rules: [], voice: () => (ref = createReferenceVoice()) });
    await openVoice(h);
    await h.session.receive({ type: "turn.pass" });
    await h.session.receive({ type: "turn.choose", option: "simpler" });
    expect(must(ref).calls.at(-1)).toBe("inject:user");
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
    expect(h.observer.calls).toHaveLength(0); // without a spoken turn there is nothing to observe
  });

  test("en voz, turn.text se rechaza y voice.turnEnd sin turno abierto también", async () => {
    const h = harness({ voice: () => createReferenceVoice() });
    await openVoice(h);
    await h.session.receive({ type: "turn.text", text: "hi" });
    await h.session.receive({ type: "voice.turnEnd" });
    expect(h.of("error").map((e) => e.code)).toEqual(["not_your_turn", "not_your_turn"]);
  });
});

describe("costo por turno en el ledger", () => {
  test("cada usage del adaptador queda con su US$ y la escena cierra con su fila", async () => {
    const models = loadModelsConfig();
    const ledger = createMemoryCostLedger(costPolicyFromConfig(models));
    const h = harness({ rules: M01_RULES, voice: () => createReferenceVoice(), ledger });
    await openVoice(h);
    h.clock.set(h.clock.now() + 60_000);
    await speak(h, [[1]]);
    const kinds = ledger.entries().map((e) => e.kind);
    expect(kinds).toEqual(["turn", "scene"]);
    const turn = ledger.entries()[0];
    // 75 audio in × 3 + 150 audio out × 12 + 1500 text in × 0.75 (per million).
    expect(turn?.usd).toBeCloseTo((75 * 3 + 150 * 12 + 1500 * 0.75) / 1e6, 12);
    expect(ledger.entries()[1]).toMatchObject({ kind: "scene", adapter: "gemini-live", turns: 1, wallSeconds: 60 });
    expect(h.alerts).toEqual([]); // ~US$0.003 in a minute: below 0.05
  });

  test("un uso sin tarifa para su adaptador se avisa y la escena sigue (no tira el proceso)", async () => {
    const models = loadModelsConfig();
    const ledger = createMemoryCostLedger(costPolicyFromConfig(models));
    // "cascade" adapter emitting token usage: there is no rate for that combination.
    const h = harness({ rules: M01_RULES, voice: () => createReferenceVoice({ adapter: "cascade" }), ledger });
    await openVoice(h);
    await speak(h, [[1]]);
    expect(h.costErrors).toHaveLength(1);
    expect(h.costErrors[0]).toContain("cascade");
    expect(h.of("scene.end")[0]?.outcome).toBe("success");
    expect(ledger.entries().map((e) => e.kind)).toEqual(["scene"]);
  });

  test("si cerrar la escena en el libro falla (disco lleno), se avisa y la escena termina igual", async () => {
    const models = loadModelsConfig();
    const ledger = createMemoryCostLedger(costPolicyFromConfig(models));
    const broken: typeof ledger = { ...ledger, closeScene: () => { throw new Error("disco lleno"); } };
    const h = harness({ rules: M01_RULES, voice: () => createReferenceVoice(), ledger: broken });
    await openVoice(h);
    await speak(h, [[1]]);
    expect(h.costErrors).toEqual(["disco lleno"]);
    expect(h.of("scene.end")[0]?.outcome).toBe("success");
  });
});
