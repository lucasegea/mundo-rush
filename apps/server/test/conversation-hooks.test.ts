// F5.2: lo que el servidor oyó del jugador llega al cliente (`turn.transcript`) y los ganchos de conversación de
// scene-runtime ven cada turno de jugador y NPC (texto y voz), el arranque y el fin de la escena. Un gancho que tira
// no corta la escena. Sin red: adaptador de voz de referencia y modelos falsos.
import { describe, expect, test } from "vitest";
import { callHook, type ConversationHooks, type ConversationSceneEnd, type ConversationSceneInfo, type ConversationTurn } from "../src/scene-runtime/hooks.ts";
import { createReferenceVoice } from "./fakes/reference-voice.ts";
import { M01_RULES } from "./fakes/text-model.ts";
import { harness, play } from "./helpers.ts";

function recorder(): ConversationHooks & { starts: ConversationSceneInfo[]; turns: ConversationTurn[]; ends: ConversationSceneEnd[]; errors: string[] } {
  const r = {
    starts: [] as ConversationSceneInfo[], turns: [] as ConversationTurn[], ends: [] as ConversationSceneEnd[], errors: [] as string[],
    onSceneStart: (s: ConversationSceneInfo) => { r.starts.push(s); },
    onTurn: (t: ConversationTurn) => { r.turns.push(t); },
    onSceneEnd: (e: ConversationSceneEnd) => { r.ends.push(e); },
    onHookError: (m: string) => { r.errors.push(m); },
  };
  return r;
}

describe("turn.transcript (voz)", () => {
  test("el cliente ve lo que se va oyendo y después la transcripción final, con el turnId del turno", async () => {
    const h = harness({ rules: [], voice: () => createReferenceVoice() });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    await h.session.receive({ type: "voice.turnStart" });
    h.session.receiveAudio(Int16Array.from([1, 2]));
    await h.session.receive({ type: "voice.turnEnd" });
    const heard = h.of("turn.transcript");
    const runId = h.of("scene.opened")[0]?.sceneRunId;
    expect(heard).toEqual([
      { type: "turn.transcript", turnId: `${runId}:1`, speaker: "player", text: "Hello,", final: false },
      { type: "turn.transcript", turnId: `${runId}:1`, speaker: "player", text: "Hello, I'm Nico.", final: false },
      { type: "turn.transcript", turnId: `${runId}:1`, speaker: "player", text: "Hello, I'm Nico.", final: true },
    ]);
    // La final sale antes que la respuesta del NPC (el HUD muestra "Vos: …" y después la línea del NPC).
    const finalAt = h.sent.findIndex((m) => m.type === "turn.transcript" && m.final);
    const replyAt = h.sent.findIndex((m) => m.type === "npc.line" && m.line.kind === "reply");
    expect(finalAt).toBeGreaterThanOrEqual(0);
    expect(replyAt).toBeGreaterThan(finalAt);
  });

  test("si no se oyó nada, la final llega vacía", async () => {
    const h = harness({ rules: [], voice: () => createReferenceVoice({ replies: [{ player: [], npc: "Sorry?", audio: [1] }] }) });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    await h.session.receive({ type: "voice.turnStart" });
    await h.session.receive({ type: "voice.turnEnd" });
    expect(h.of("turn.transcript").map((m) => [m.text, m.final])).toEqual([["", true]]);
  });

  test("una transcripción larguísima se recorta al tope del protocolo (nunca tira el send)", async () => {
    const long = "word ".repeat(600);
    const h = harness({ rules: [], voice: () => createReferenceVoice({ replies: [{ player: [long], npc: "Okay.", audio: [1] }] }) });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    await h.session.receive({ type: "voice.turnStart" });
    await h.session.receive({ type: "voice.turnEnd" });
    const heard = h.of("turn.transcript");
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.every((m) => m.text.length <= 2000)).toBe(true);
  });

  test("en una escena de texto no hay turn.transcript (el cliente ya tiene lo que escribió)", async () => {
    const h = harness({ rules: [] });
    await play(h, "NPC-INES", ["Hello!"]);
    expect(h.of("turn.transcript")).toEqual([]);
  });
});

describe("ganchos de conversación", () => {
  test("texto: arranque, turno del jugador y del NPC (finales, con el mismo turnId) y fin", async () => {
    const rec = recorder();
    const h = harness({ rules: M01_RULES, conversation: rec });
    await play(h, "NPC-INES", ["Okay.", "Hello, I'm Nico."]);
    const runId = h.of("scene.opened")[0]?.sceneRunId ?? "";
    expect(rec.starts).toEqual([{
      sceneRunId: runId, accountId: "op-local", missionId: "M0.1", sceneId: "M0.1-E1", npcId: "NPC-INES", npcName: "Inés Calder",
      modality: "text", conversation: null,
    }]);
    expect(rec.turns.map((t) => [t.speaker, t.text, t.turnId, t.final, t.kind])).toEqual([
      ["player", "Okay.", `${runId}:1`, true, "turn"],
      ["npc", "Good, good. Your turn!", `${runId}:1`, true, "turn"],
      ["player", "Hello, I'm Nico.", `${runId}:2`, true, "turn"],
    ]);
    expect(rec.turns.every((t) => t.modality === "text" && t.npcId === "NPC-INES" && t.missionId === "M0.1")).toBe(true);
    expect(rec.ends).toEqual([{ sceneRunId: runId, outcome: "success", criteriaMet: ["C1", "C2"] }]);
  });

  test("voz: parciales del jugador (no finales), su final y la línea del NPC", async () => {
    const rec = recorder();
    const h = harness({ rules: [], voice: () => createReferenceVoice(), conversation: rec });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    await h.session.receive({ type: "voice.turnStart" });
    h.session.receiveAudio(Int16Array.from([1]));
    await h.session.receive({ type: "voice.turnEnd" });
    expect(rec.starts[0]?.modality).toBe("voice");
    expect(rec.turns.map((t) => [t.speaker, t.text, t.final, t.turnIndex])).toEqual([
      ["player", "Hello,", false, 1],
      ["player", "Hello, I'm Nico.", false, 1],
      ["player", "Hello, I'm Nico.", true, 1],
      ["npc", "Nice to meet you, Nico!", true, 1],
    ]);
    expect(rec.turns.every((t) => t.modality === "voice")).toBe(true);
  });

  test("abortar la escena avisa el fin como aborted", async () => {
    const rec = recorder();
    const h = harness({ conversation: rec });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    await h.session.receive({ type: "scene.abort" });
    expect(rec.ends.map((e) => e.outcome)).toEqual(["aborted"]);
  });

  test("un gancho que tira no corta la escena: se reporta y la conversación sigue", async () => {
    const errors: string[] = [];
    const h = harness({
      rules: [],
      conversation: {
        onSceneStart: () => { throw new Error("boom start"); },
        onTurn: () => { throw new Error("boom turn"); },
        onSceneEnd: () => { throw new Error("boom end"); },
        onHookError: (m) => { errors.push(m); },
      },
    });
    await play(h, "NPC-INES", ["Hi there."]);
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
    expect(h.of("npc.line").some((m) => m.line.kind === "reply")).toBe(true);
    expect(errors).toEqual(["boom start", "boom turn", "boom turn"]);
  });

  test("A2: un gancho async cuya promesa rechaza se reporta igual (nunca queda una promesa rechazada suelta)", async () => {
    const errors: string[] = [];
    const h = harness({
      rules: [],
      conversation: {
        onSceneStart: () => Promise.reject(new Error("async start")),
        onTurn: async () => { await Promise.resolve(); throw new Error("async turn"); },
        onHookError: (m) => { errors.push(m); },
      },
    });
    await play(h, "NPC-INES", ["Hi there."]);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
    expect(errors).toEqual(["async start", "async turn", "async turn"]);
  });

  test("A2: callHook atrapa el rechazo de un gancho async aunque onHookError también tire", async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { seen.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      callHook({ onHookError: () => { throw new Error("y"); } }, () => Promise.reject(new Error("x")));
      await new Promise((r) => setTimeout(r, 10));
      expect(seen).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("un onHookError que también tira no sale del runtime", async () => {
    const h = harness({ rules: [], conversation: { onTurn: () => { throw new Error("x"); }, onHookError: () => { throw new Error("y"); } } });
    await play(h, "NPC-INES", ["Hi there."]);
    expect(h.session.snapshot).toMatchObject({ state: "playerTurn", sub: "waiting" });
  });
});
