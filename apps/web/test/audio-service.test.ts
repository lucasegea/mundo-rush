// F5.2: el servicio de audio con el store real, un motor falso y un transporte falso (sin Web Audio, sin red).
// Turnos lentos: el turno lo abre y lo cierra el jugador; después de "Terminé" se manda una cola corta y recién ahí
// voice.turnEnd; la voz del NPC suena y bloquea el turno hasta terminar; sin micrófono, texto con el motivo.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ServerMessage } from "@lg/protocol";
import { NPC_SAMPLE_RATE, PLAYBACK_STUCK_GRACE_MS, startAudioService, TALK_TAIL_MS, TURN_ACK_TIMEOUT_MS, type AudioService, type Schedule, type VoiceTransport } from "../src/services/audio";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { fakeEngineFactory } from "./fake-audio";
import { resetStore } from "./helpers";

/** Temporizadores manuales. */
function manualTimers(): { schedule: Schedule; advance(ms: number): void; now: () => number } {
  let t = 0;
  let tasks: { at: number; fn: () => void }[] = [];
  return {
    now: () => t,
    schedule(ms, fn) {
      const task = { at: t + ms, fn };
      tasks.push(task);
      return () => { tasks = tasks.filter((x) => x !== task); };
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = tasks.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        tasks = tasks.filter((x) => x !== due);
        t = due.at;
        due.fn();
      }
      t = end;
    },
  };
}

function fakeTransport(): VoiceTransport & { sent: Int16Array[]; npc(pcm: Int16Array): void } {
  const listeners = new Set<(p: Int16Array) => void>();
  return {
    sent: [],
    sendPlayerAudio(pcm) { this.sent.push(pcm); },
    onNpcAudio(l) { listeners.add(l); return () => listeners.delete(l); },
    npc(pcm) { listeners.forEach((l) => l(pcm)); },
  };
}

const voiceState = (state: string, sub: string | null, turnIndex = 0): ServerMessage =>
  ({ type: "scene.state", state, sub, modality: "voice", turnIndex, softCapReached: false }) as ServerMessage;

let service: AudioService | null = null;
beforeEach(() => resetStore());
afterEach(() => { service?.stop(); service = null; });

/** Escena de voz abierta con Inés, en playerTurn.waiting, con el micrófono listo. */
async function setup(result?: Parameters<typeof fakeEngineFactory>[0]) {
  const timers = manualTimers();
  const engines = fakeEngineFactory(result);
  const transport = fakeTransport();
  actions.enterScene("NPC-INES", null);
  service = startAudioService({ store: gameStore, actions, createEngine: engines.createEngine, transport, schedule: timers.schedule, now: timers.now });
  const modality = await service.prepare();
  actions.sceneMessage({ type: "scene.opened", sceneRunId: "run-1", missionId: "M0.1", sceneId: "M0.1-E1", npcId: "NPC-INES", modality });
  actions.sceneMessage(voiceState("playerTurn", "waiting"));
  return { timers, engines, transport, modality, voice: () => gameStore.getState().dialogue.voice, outbox: () => gameStore.getState().dialogue.outbox.map((o) => o.msg.type) };
}

describe("preparar el micrófono", () => {
  test("con permiso: voz, estado listo", async () => {
    const s = await setup();
    expect(s.modality).toBe("voice");
    expect(s.voice()).toMatchObject({ audio: "ready", micProblem: null });
  });

  test.each([["denied"], ["noDevice"], ["unsupported"], ["failed"]] as const)("sin micrófono (%s): texto y el motivo en el store", async (problem) => {
    const s = await setup({ ok: false, problem });
    expect(s.modality).toBe("text");
    expect(s.voice()).toMatchObject({ audio: "noPermission", micProblem: problem });
    expect(s.engines.last?.closed).toBe(true);
  });

  test("si crear el motor falla (navegador sin Web Audio): texto con `unsupported`", async () => {
    resetStore();
    service = startAudioService({
      store: gameStore, actions, transport: fakeTransport(), createEngine: () => Promise.reject(new Error("sin Web Audio")),
    });
    expect(await service.prepare()).toBe("text");
    expect(gameStore.getState().dialogue.voice).toMatchObject({ audio: "noPermission", micProblem: "unsupported" });
  });

  test("release suelta el micrófono; un prepare que termina después de un release se descarta", async () => {
    const s = await setup();
    service?.release();
    expect(s.engines.last?.closed).toBe(true);
    expect(s.voice().audio).toBe("off");
    let resolveEngine: ((e: never) => void) | null = null;
    const slow = startAudioService({
      store: gameStore, actions, transport: fakeTransport(),
      createEngine: () => new Promise((r) => { resolveEngine = r as never; }),
    });
    const pending = slow.prepare();
    slow.release();
    const engine = { startMic: () => Promise.resolve({ ok: true }), close: () => { closed = true; } };
    let closed = false;
    (resolveEngine as unknown as (e: unknown) => void)(engine);
    expect(await pending).toBe("text");
    expect(closed).toBe(true);
    slow.stop();
  });
});

describe("un turno hablado", () => {
  test("Hablar → los bloques van al servidor; Terminé → cola corta → voice.turnEnd; después pensando", async () => {
    const s = await setup();
    s.engines.last?.speak(); // antes de hablar: solo medidor, nada se manda
    expect(s.transport.sent).toHaveLength(0);
    actions.voiceTalkStart();
    expect(s.outbox()).toEqual(["voice.turnStart"]);
    expect(s.voice()).toMatchObject({ audio: "listening", talk: "talking" });
    expect(s.engines.last?.resumed).toBe(1); // AudioContext reanudado dentro del gesto
    for (let i = 0; i < 5; i++) s.engines.last?.speak();
    expect(s.transport.sent).toHaveLength(5);
    actions.voiceTalkEnd();
    expect(s.voice().talk).toBe("ending");
    s.engines.last?.speak(); // la cola: todavía se manda
    expect(s.transport.sent).toHaveLength(6);
    expect(s.outbox()).toEqual(["voice.turnStart"]);
    s.timers.advance(TALK_TAIL_MS);
    expect(s.outbox()).toEqual(["voice.turnStart", "voice.turnEnd"]);
    expect(s.voice()).toMatchObject({ audio: "thinking", talk: "idle", turnHint: null });
    s.engines.last?.speak(); // turno cerrado: nada más se manda
    expect(s.transport.sent).toHaveLength(6);
  });

  test("un turno sin voz detectada avisa `silent` (revisá el micrófono)", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    s.engines.last?.speak(0.0001, 0);
    actions.voiceTalkEnd();
    s.timers.advance(TALK_TAIL_MS);
    expect(s.voice().turnHint).toBe("silent");
  });

  test("fuera de tu turno, Hablar no abre nada (y lo anuncia)", async () => {
    const s = await setup();
    actions.sceneMessage(voiceState("npcTurn", null, 1));
    actions.voiceTalkStart();
    expect(s.outbox()).toEqual([]);
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.notYourTurn");
  });

  test("voz del NPC: suena, bloquea Hablar mientras suena y vuelve a listo al terminar", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    actions.voiceTalkEnd();
    s.timers.advance(TALK_TAIL_MS);
    actions.sceneMessage(voiceState("npcTurn", null, 1));
    s.transport.npc(Int16Array.from([1, 2, 3]));
    expect(s.engines.last?.played).toHaveLength(1);
    expect(s.voice().audio).toBe("playing");
    actions.sceneMessage(voiceState("playerTurn", "waiting", 1)); // el servidor ya devolvió el turno; el audio sigue sonando
    actions.voiceTalkStart();
    expect(s.outbox()).toEqual(["voice.turnStart", "voice.turnEnd"]); // no se abrió otro turno
    s.engines.last?.drain();
    expect(s.voice().audio).toBe("ready");
    actions.voiceTalkStart();
    expect(s.outbox()).toEqual(["voice.turnStart", "voice.turnEnd", "voice.turnStart"]);
  });

  test("A2 vigía: si la cola nunca avisa que terminó (contexto trabado), vuelve a listo tras lo encolado + margen", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    actions.voiceTalkEnd();
    s.timers.advance(TALK_TAIL_MS);
    actions.sceneMessage(voiceState("npcTurn", null, 1));
    s.transport.npc(new Int16Array(NPC_SAMPLE_RATE)); // 1 s de voz
    s.timers.advance(500);
    s.transport.npc(new Int16Array(NPC_SAMPLE_RATE)); // otro segundo: el vigía se reprograma (2 s + margen)
    actions.sceneMessage(voiceState("playerTurn", "waiting", 1));
    s.timers.advance(2000 + PLAYBACK_STUCK_GRACE_MS - 1);
    expect(s.voice().audio).toBe("playing");
    s.timers.advance(1);
    expect(s.voice().audio).toBe("ready");
    actions.voiceTalkStart();
    expect(s.outbox()).toEqual(["voice.turnStart", "voice.turnEnd", "voice.turnStart"]);
  });

  test("A2 vigía: con el aviso normal de la cola, el vigía no dispara después", async () => {
    const s = await setup();
    actions.sceneMessage(voiceState("npcTurn", null, 1));
    s.transport.npc(Int16Array.from([1, 2, 3]));
    s.engines.last?.drain();
    expect(s.voice().audio).toBe("ready");
    actions.sceneMessage(voiceState("playerTurn", "waiting", 1));
    actions.voiceTalkStart();
    s.timers.advance(60_000);
    expect(s.voice().audio).toBe("listening");
  });

  test("respuesta sin audio: al volver tu turno, de pensando a listo", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    actions.voiceTalkEnd();
    s.timers.advance(TALK_TAIL_MS);
    actions.sceneMessage(voiceState("npcTurn", null, 1));
    actions.sceneMessage(voiceState("playerTurn", "waiting", 1));
    expect(s.voice().audio).toBe("ready");
  });

  test("si el servidor nunca saca la escena de tu turno (turno rechazado), a los 5 s vuelve a listo", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    actions.voiceTalkEnd();
    s.timers.advance(TALK_TAIL_MS);
    expect(s.voice().audio).toBe("thinking");
    s.timers.advance(TURN_ACK_TIMEOUT_MS);
    expect(s.voice().audio).toBe("ready");
  });

  test("el tope de tiempo saca la escena de tu turno con el turno abierto: se cierra sin mandar el fin", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    actions.sceneMessage(voiceState("closing", null, 0));
    expect(s.voice()).toMatchObject({ talk: "idle" });
    expect(s.outbox()).toEqual(["voice.turnStart"]);
    s.engines.last?.speak();
    expect(s.transport.sent).toHaveLength(0);
  });
});

test("un turno abierto sin captura (estado desfasado) igual manda el fin al cerrarse: el servidor nunca queda colgado", async () => {
  const s = await setup();
  service?.release(); // el servicio ya no captura, pero el store dice que hay un turno abierto
  const d = gameStore.getState().dialogue;
  gameStore.setState({ dialogue: { ...d, voice: { ...d.voice, talk: "talking" } } });
  actions.voiceTalkEnd();
  expect(s.outbox()).toEqual(["voice.turnEnd"]);
  expect(s.voice().talk).toBe("idle");
});

describe("medidor y micrófono", () => {
  test("el nivel se publica cada 100 ms (pico del intervalo, en pasos de 0,05)", async () => {
    const s = await setup();
    s.timers.advance(100);
    s.engines.last?.speak(0.1); // -20 dBFS → 0,666… → 0,65
    expect(s.voice().level).toBeCloseTo(0.65, 5);
    s.engines.last?.speak(0.5); // dentro del intervalo: no publica todavía
    expect(s.voice().level).toBeCloseTo(0.65, 5);
    s.timers.advance(100);
    s.engines.last?.speak(0);
    expect(s.voice().level).toBeCloseTo(0.9, 5); // el pico (0,5 → -6 dBFS) del intervalo
  });

  test("el servidor pasa la escena a texto (sin clave): se suelta el micrófono", async () => {
    const s = await setup();
    actions.sceneMessage({ type: "scene.state", state: "npcOpening", sub: null, modality: "text", turnIndex: 0, softCapReached: false });
    expect(s.engines.last?.closed).toBe(true);
    expect(s.voice().audio).toBe("off");
  });

  test("se pierde el micrófono con el turno abierto: se cierra el turno y queda noPermission", async () => {
    const s = await setup();
    actions.voiceTalkStart();
    s.engines.last?.loseMic();
    expect(s.outbox()).toEqual(["voice.turnStart", "voice.turnEnd"]);
    expect(s.voice()).toMatchObject({ audio: "noPermission", micProblem: "noDevice" });
  });
});
