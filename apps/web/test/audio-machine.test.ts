// F5.2: máquina de estados del audio del cliente (sin permiso / listo / escuchando / pensando / reproduciendo) y la cola
// de reproducción de la voz del NPC con un AudioContext falso (sin Web Audio).
import { describe, expect, test } from "vitest";
import { audioTransition, canTalk, createPlaybackQueue, resumeIfSuspended, type AudioEvent, type AudioState, type PlaybackContext } from "../src/services/audio";

const run = (events: AudioEvent[], from: AudioState = "off"): AudioState[] => {
  const out: AudioState[] = [];
  let s = from;
  for (const e of events) out.push((s = audioTransition(s, e)));
  return out;
};

describe("máquina de estados del audio", () => {
  test("un turno completo: permiso, hablar, terminar, voz del NPC, fin de la reproducción", () => {
    expect(run(["prepare", "micGranted", "talkStart", "talkEnd", "npcAudio", "npcAudio", "drained"]))
      .toEqual(["asking", "ready", "listening", "thinking", "playing", "playing", "ready"]);
  });

  test("sin permiso (o sin micrófono): noPermission; se puede volver a pedir", () => {
    expect(run(["prepare", "micDenied"])).toEqual(["asking", "noPermission"]);
    expect(run(["prepare", "micGranted"], "noPermission")).toEqual(["asking", "ready"]);
  });

  test("la respuesta llega sin audio (línea segura, error): pensando → listo con turnReturned", () => {
    expect(run(["turnReturned"], "thinking")).toEqual(["ready"]);
  });

  test("nadie interrumpe: mientras escucha, la voz del NPC no cambia el estado; mientras suena, no se puede hablar", () => {
    expect(audioTransition("listening", "npcAudio")).toBe("listening");
    expect(audioTransition("playing", "talkStart")).toBe("playing");
    expect(audioTransition("playing", "turnReturned")).toBe("playing");
    expect(canTalk("playing")).toBe(false);
    expect(canTalk("ready")).toBe(true);
  });

  test("una respuesta a una nota del director (sin turno hablado) suena desde listo", () => {
    expect(audioTransition("ready", "npcAudio")).toBe("playing");
  });

  test("micLost desde cualquier estado activo → noPermission; stop → off; eventos que no aplican no cambian nada", () => {
    for (const s of ["asking", "ready", "listening", "thinking", "playing"] as const) expect(audioTransition(s, "micLost")).toBe("noPermission");
    expect(audioTransition("off", "micLost")).toBe("off");
    for (const s of ["asking", "noPermission", "ready", "listening", "thinking", "playing"] as const) expect(audioTransition(s, "stop")).toBe("off");
    expect(audioTransition("off", "talkStart")).toBe("off");
    expect(audioTransition("asking", "npcAudio")).toBe("asking");
  });
});

interface FakeSource {
  buffer: { data: Float32Array; rate: number } | null;
  onended: (() => void) | null;
  at: number | null;
  stopped: boolean;
}

function fakeContext(): PlaybackContext & { sources: FakeSource[]; time: number; end(i: number): void } {
  const sources: FakeSource[] = [];
  const ctx = {
    sources,
    time: 0,
    get currentTime() { return ctx.time; },
    destination: {},
    createBuffer(_ch: number, length: number, rate: number) {
      const data = new Float32Array(length);
      return { data, rate, getChannelData: () => data };
    },
    createBufferSource() {
      const s: FakeSource & { connect(): void; start(at: number): void; stop(): void } = {
        buffer: null, onended: null, at: null, stopped: false,
        connect() {},
        start(at: number) { s.at = at; },
        stop() { s.stopped = true; },
      };
      sources.push(s);
      return s as never;
    },
    end(i: number) { sources[i]?.onended?.(); },
  };
  return ctx;
}

describe("cola de reproducción", () => {
  test("agenda los bloques pegados (sin huecos) con un margen inicial, y convierte PCM16 a float", () => {
    const ctx = fakeContext();
    let drained = 0;
    const q = createPlaybackQueue(ctx, () => drained++, 0.1);
    ctx.time = 5;
    q.push(Int16Array.from(new Array(2400).fill(16384)), 24000); // 100 ms
    q.push(new Int16Array(1200), 24000); // 50 ms
    expect(ctx.sources[0]?.at).toBeCloseTo(5.1, 9);
    expect(ctx.sources[1]?.at).toBeCloseTo(5.2, 9); // pegado al anterior: 5,1 + 100 ms
    expect(ctx.sources[0]?.buffer?.data[0]).toBe(0.5);
    expect(ctx.sources[0]?.buffer?.rate).toBe(24000);
    expect(q.playing).toBe(true);
    ctx.end(0);
    expect(drained).toBe(0);
    ctx.end(1);
    expect(drained).toBe(1);
    expect(q.playing).toBe(false);
  });

  test("si la red se atrasa y la cola se vació, el bloque nuevo arranca ahora + margen (no en el pasado)", () => {
    const ctx = fakeContext();
    const q = createPlaybackQueue(ctx, () => {}, 0.05);
    q.push(new Int16Array(240), 24000);
    ctx.end(0);
    ctx.time = 10;
    q.push(new Int16Array(240), 24000);
    expect(ctx.sources[1]?.at).toBe(10.05);
  });

  test("stop corta lo que suena, vacía la cola y no avisa drained; un bloque vacío se ignora", () => {
    const ctx = fakeContext();
    let drained = 0;
    const q = createPlaybackQueue(ctx, () => drained++);
    q.push(new Int16Array(0), 24000);
    expect(ctx.sources).toHaveLength(0);
    q.push(new Int16Array(240), 24000);
    q.push(new Int16Array(240), 24000);
    q.stop();
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);
    ctx.end(0);
    expect(drained).toBe(0);
    expect(q.playing).toBe(false);
  });
});

describe("A2: reanudar el AudioContext al reproducir", () => {
  test("suspendido: se reanuda; corriendo: no; un rechazo del navegador no sale", async () => {
    let resumes = 0;
    const suspended = { state: "suspended", resume: () => { resumes++; return Promise.reject(new Error("sin gesto")); } };
    resumeIfSuspended(suspended);
    resumeIfSuspended({ state: "running", resume: () => { resumes += 10; return Promise.resolve(); } });
    await Promise.resolve();
    expect(resumes).toBe(1);
  });
});
