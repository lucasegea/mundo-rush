// F5.1a A2 (adaptador): setup armado por el servidor, turnos manuales, reconexión ante goAway y corte, cierre, y el
// audio copiado en el momento del envío (el adaptador no guarda el clip). Todo contra el servidor Live falso.
import { afterEach, describe, expect, test } from "vitest";
import { createGeminiLiveProvider } from "../src/providers/gemini-live/adapter.ts";
import { decodePcm16, liveSetupMessage, parseDurationSeconds, usageFromMetadata } from "../src/providers/gemini-live/wire.ts";
import type { RealtimeVoiceProvider, VoiceEvent } from "../src/providers/types.ts";
import { must } from "./helpers.ts";
import { receivedOf, startFakeLiveServer, type FakeLiveServer } from "./fakes/live-server.ts";

const KEY = "lg-test-key-live-0123456789";
const SETUP = { systemInstruction: "=== PERSONA: TEST ===", voiceName: "Puck", languageCode: "en-US" };

let server: FakeLiveServer | null = null;
const providers: RealtimeVoiceProvider[] = [];
afterEach(async () => {
  for (const p of providers.splice(0)) await p.close("done");
  await server?.close();
  server = null;
});

async function live(opts: Parameters<typeof startFakeLiveServer>[0] = {}, maxReconnects = 2) {
  server = await startFakeLiveServer(opts);
  const p = createGeminiLiveProvider({ apiKey: KEY, model: "gemini-test-live", endpoint: server.url, openTimeoutMs: 2000, maxReconnects });
  providers.push(p);
  const events: VoiceEvent[] = [];
  p.on((e) => events.push(e));
  return { p, s: server, events };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
async function until(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !pred(); i++) await tick();
  expect(pred()).toBe(true);
}

describe("A2: setup armado por el servidor", () => {
  test("el primer mensaje es el setup: modelo, instrucción, voz, idioma, transcripciones, actividad manual", async () => {
    const { p, s } = await live();
    await p.open(SETUP);
    const setup = receivedOf(must(s.connections[0]), "setup")[0];
    expect(setup).toEqual({
      model: "models/gemini-test-live",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }, languageCode: "en-US" },
      },
      systemInstruction: { parts: [{ text: "=== PERSONA: TEST ===" }] },
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: {},
    });
    expect(Object.keys(must(must(s.connections[0]).received[0]))).toEqual(["setup"]);
  });

  test("turno manual: activityStart, audio PCM16 a 16 kHz, activityEnd; la apertura inyectada no dispara respuesta", async () => {
    const { p, s, events } = await live();
    await p.open(SETUP);
    p.injectContext([{ role: "user", text: "[DIRECTOR] start" }, { role: "model", text: "Hello!" }]);
    await tick();
    expect(events).toEqual([]); // turnComplete: false → el modelo no habla
    expect(receivedOf(must(s.connections[0]), "clientContent")[0]).toMatchObject({ turnComplete: false });
    p.startTurn("t1");
    p.sendAudio("t1", Int16Array.from([1, -2, 3]));
    p.endTurn("t1");
    await until(() => events.some((e) => e.type === "npcTurnDone"));
    const ri = receivedOf(must(s.connections[0]), "realtimeInput");
    expect(Object.keys(must(ri[0]))).toEqual(["activityStart"]);
    const audio = ri[1]?.["audio"] as { data: string; mimeType: string };
    expect(audio.mimeType).toBe("audio/pcm;rate=16000");
    expect([...decodePcm16(audio.data)]).toEqual([1, -2, 3]);
    expect(Object.keys(must(ri[2]))).toEqual(["activityEnd"]);
  });

  test("una sesión que no abre rechaza sin filtrar la clave", async () => {
    const { p } = await live({ refuseSetup: true });
    const err = await p.open(SETUP).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain(KEY);
  });
});

describe("A2: reconexión ante goAway y corte", () => {
  test("goAway → sessionEnding, reconexión con el handle, y el turno siguiente va por la sesión nueva", async () => {
    const { p, s, events } = await live();
    await p.open(SETUP);
    s.goAway("7s");
    await s.untilConnections(2);
    await until(() => must(s.connections[0]).closed);
    expect(events.filter((e) => e.type === "sessionEnding")).toEqual([{ type: "sessionEnding", turnId: null, secondsLeft: 7 }]);
    expect(receivedOf(must(s.connections[1]), "setup")[0]?.["sessionResumption"]).toEqual({ handle: "resume-1" });
    p.startTurn("t1");
    p.endTurn("t1");
    await until(() => events.some((e) => e.type === "npcTurnDone"));
    expect(receivedOf(must(s.connections[1]), "realtimeInput").map((m) => Object.keys(m)[0])).toEqual(["activityStart", "activityEnd"]);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("un corte del proveedor se reanuda con el handle", async () => {
    const { p, s, events } = await live();
    await p.open(SETUP);
    s.drop();
    await s.untilConnections(2);
    expect(receivedOf(must(s.connections[1]), "setup")[0]?.["sessionResumption"]).toEqual({ handle: "resume-1" });
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("sin handle de reanudación, el corte es un error no recuperable (la escena sigue por texto)", async () => {
    const { p, s, events } = await live({ resumeHandle: null });
    await p.open(SETUP);
    s.drop();
    await until(() => events.some((e) => e.type === "error"));
    expect(events.find((e) => e.type === "error")).toEqual({ type: "error", turnId: null, recoverable: false, code: "resume_unavailable" });
  });

  test("pasado el límite de reconexiones, error no recuperable", async () => {
    const { p, s, events } = await live({}, 1);
    await p.open(SETUP);
    s.drop();
    await s.untilConnections(2);
    s.drop();
    await until(() => events.some((e) => e.type === "error"));
    expect(events.find((e) => e.type === "error")).toMatchObject({ recoverable: false, code: "reconnect_limit" });
  });
});

describe("A2/A3: cierre y audio", () => {
  test("close cierra la sesión Live (código 1000) y no emite más eventos", async () => {
    const { p, s, events } = await live();
    await p.open(SETUP);
    await p.close("hardCap");
    await until(() => must(s.connections[0]).closed);
    expect(must(s.connections[0]).closeCode).toBe(1000);
    s.goAway();
    await tick();
    expect(events).toEqual([]);
  });

  test("el audio se codifica al llamar: el adaptador no guarda la referencia (aunque el envío espere al setup)", async () => {
    server = await startFakeLiveServer();
    const p = createGeminiLiveProvider({ apiKey: KEY, model: "m", endpoint: server.url });
    providers.push(p);
    const opening = p.open(SETUP);
    p.startTurn("t1");
    const chunk = Int16Array.from([5, 6, 7]);
    p.sendAudio("t1", chunk); // va a la cola previa a la apertura
    chunk.fill(0); // quien era dueño del audio lo borra (TurnClip.release)
    await opening;
    await until(() => receivedOf(must(must(server).connections[0]), "realtimeInput").length >= 2);
    const audio = receivedOf(must(server.connections[0]), "realtimeInput")[1]?.["audio"] as { data: string };
    expect([...decodePcm16(audio.data)]).toEqual([5, 6, 7]);
  });

  test("audio de un turno que no es el abierto, o después de endTurn, no sale", async () => {
    const { p, s } = await live();
    await p.open(SETUP);
    p.startTurn("t1");
    p.sendAudio("t0", Int16Array.from([1]));
    p.endTurn("t1");
    p.sendAudio("t1", Int16Array.from([1]));
    await tick();
    expect(receivedOf(must(s.connections[0]), "realtimeInput").map((m) => Object.keys(m)[0])).toEqual(["activityStart", "activityEnd"]);
  });
});

describe("formato de cable", () => {
  test("usageMetadata por modalidad, con los totales planos como respaldo", () => {
    expect(usageFromMetadata({ promptTokensDetails: [{ modality: "AUDIO", tokenCount: 10 }, { modality: "TEXT", tokenCount: 5 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 7 }] }))
      .toEqual({ kind: "tokens", audioIn: 10, textIn: 5, audioOut: 7, textOut: 0 });
    expect(usageFromMetadata({ promptTokenCount: 3, candidatesTokenCount: 4 })).toEqual({ kind: "tokens", audioIn: 0, textIn: 3, audioOut: 0, textOut: 4 });
  });

  test("duración de goAway y reanudación en el setup", () => {
    expect(parseDurationSeconds("10s")).toBe(10);
    expect(parseDurationSeconds("1.5s")).toBe(1.5);
    expect(parseDurationSeconds(undefined)).toBeNull();
    expect((liveSetupMessage("models/x", SETUP, "h") as { setup: { model: string; sessionResumption: unknown } }).setup)
      .toMatchObject({ model: "models/x", sessionResumption: { handle: "h" } });
  });
});
