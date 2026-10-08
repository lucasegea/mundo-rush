// F5.1a A1: test de contrato compartido de `RealtimeVoiceProvider` (P0 §4.3 regla 4). La misma secuencia guionada contra
// el adaptador Live (con el servidor Live falso) y contra el adaptador de referencia en memoria produce la misma
// SECUENCIA DE TIPOS DE EVENTO (con su turnId), no los mismos tiempos. F5.1b agrega la cascada a `ADAPTERS`.
import { afterEach, describe, expect, test } from "vitest";
import { createGeminiLiveProvider } from "../src/providers/gemini-live/adapter.ts";
import type { RealtimeVoiceProvider, VoiceEvent, VoiceEventType } from "../src/providers/types.ts";
import { startFakeLiveServer, type FakeLiveServer } from "./fakes/live-server.ts";
import { createReferenceVoice } from "./fakes/reference-voice.ts";

const SETUP = { systemInstruction: "You are Ines. [test]", voiceName: "Aoede", languageCode: "en-US" };

let server: FakeLiveServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

interface Recorder {
  events: VoiceEvent[];
  /** Espera a que llegue el n-ésimo evento de ese tipo (contando desde el principio). */
  until(type: VoiceEventType, n?: number): Promise<void>;
}

function record(p: RealtimeVoiceProvider): Recorder {
  const events: VoiceEvent[] = [];
  let waiters: { type: VoiceEventType; n: number; done: () => void }[] = [];
  p.on((e) => {
    events.push(e);
    const hits = waiters.filter((w) => events.filter((x) => x.type === w.type).length >= w.n);
    waiters = waiters.filter((w) => !hits.includes(w));
    hits.forEach((w) => w.done());
  });
  return {
    events,
    until: (type, n = 1) => events.filter((x) => x.type === type).length >= n
      ? Promise.resolve() : new Promise((done) => waiters.push({ type, n, done })),
  };
}

/** La secuencia del contrato: apertura inyectada, turno hablado, nota [DIRECTOR], otro turno, interrupción, cierre. */
async function script(p: RealtimeVoiceProvider): Promise<VoiceEvent[]> {
  const rec = record(p);
  await p.open(SETUP);
  p.injectContext([{ role: "user", text: "[DIRECTOR] The scene starts now." }, { role: "model", text: "Hello! Welcome." }]);
  p.startTurn("run:1");
  for (const v of [1, 2, 3]) p.sendAudio("run:1", Int16Array.from([v, v, v]));
  p.endTurn("run:1");
  await rec.until("usage", 1);
  p.injectContext([{ role: "user", text: "[DIRECTOR] Simpler, please." }], "run:2");
  await rec.until("usage", 2);
  p.startTurn("run:3");
  p.sendAudio("run:3", Int16Array.from([9, 9]));
  p.endTurn("run:3");
  await rec.until("usage", 3);
  p.interrupt();
  p.interrupt(); // el segundo no emite nada: un turno se interrumpe una vez
  await p.close("done");
  return rec.events;
}

const signature = (events: readonly VoiceEvent[]): string[] =>
  events.map((e) => `${e.type}@${"turnId" in e ? e.turnId ?? "-" : "-"}`);

const ADAPTERS: Record<string, () => Promise<RealtimeVoiceProvider>> = {
  reference: () => Promise.resolve(createReferenceVoice()),
  "gemini-live": async () => {
    server = await startFakeLiveServer();
    return createGeminiLiveProvider({ apiKey: "lg-test-key", model: "test-live-model", endpoint: server.url });
  },
};

const EXPECTED = [
  "playerTranscriptPartial@run:1", "playerTranscriptPartial@run:1", "playerTranscriptFinal@run:1",
  "npcTranscript@run:1", "npcAudioChunk@run:1", "npcTurnDone@run:1", "usage@run:1",
  "npcTranscript@run:2", "npcAudioChunk@run:2", "npcTurnDone@run:2", "usage@run:2",
  "playerTranscriptPartial@run:3", "playerTranscriptPartial@run:3", "playerTranscriptFinal@run:3",
  "npcTranscript@run:3", "npcAudioChunk@run:3", "npcTurnDone@run:3", "usage@run:3",
  "interrupted@run:3",
];

describe("A1: contrato compartido de RealtimeVoiceProvider", () => {
  test.each(Object.keys(ADAPTERS))("%s emite la secuencia del contrato", async (name) => {
    const make = ADAPTERS[name];
    if (!make) throw new Error(name);
    const events = await script(await make());
    expect(signature(events)).toEqual(EXPECTED);
    // Los datos también coinciden donde el contrato los fija: transcripción final, texto y tasa del audio del NPC.
    expect(events.find((e) => e.type === "playerTranscriptFinal")).toMatchObject({ text: "Hello, I'm Nico." });
    expect(events.find((e) => e.type === "npcTranscript")).toMatchObject({ text: "Nice to meet you, Nico!" });
    const audio = events.find((e) => e.type === "npcAudioChunk");
    expect(audio && audio.type === "npcAudioChunk" ? [...audio.pcm16] : null).toEqual([100, -100, 200, -200]);
    expect(audio).toMatchObject({ sampleRate: 24000 });
    expect(events.find((e) => e.type === "usage")).toMatchObject({ usage: { kind: "tokens", audioIn: 75, audioOut: 150, textIn: 1500, textOut: 0 } });
  });

  test("los dos adaptadores dan exactamente la misma secuencia", async () => {
    const seqs: string[][] = [];
    for (const make of Object.values(ADAPTERS)) seqs.push(signature(await script(await make())));
    expect(seqs[1]).toEqual(seqs[0]);
  });
});
