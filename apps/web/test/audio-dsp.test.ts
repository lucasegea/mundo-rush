// F5.2: el DSP del audio del cliente (services/audio/dsp/) con buffers sintéticos en vitest, sin navegador: PCM,
// remuestreo, VAD por energía (silencio, voz simulada, ruido), nivel del medidor y armado de bloques de captura. Y el
// worklet: solo envuelve dsp/ (P0 §7).
import { describe, expect, test } from "vitest";
import {
  CAPTURE_FRAME_MS, createCaptureFramer, DEFAULT_VAD, floatToPcm16, initialVad, levelFromRms, pcm16FromBytes, pcm16ToBytes,
  pcm16ToFloat, resample, rms, vadStep, type VadState,
} from "../src/services/audio/dsp";

const sine = (freq: number, rate: number, ms: number, amp = 0.5): Float32Array => {
  const n = Math.round((rate * ms) / 1000);
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate));
};
/** Ruido pseudoaleatorio determinístico (LCG) de amplitud `amp`. */
const noise = (n: number, amp: number, seed = 7): Float32Array => {
  let x = seed;
  return Float32Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return ((x / 2 ** 31) * 2 - 1) * amp;
  });
};
/** Cruces por cero ascendentes por segundo ≈ frecuencia de un seno. */
const zeroCrossHz = (s: Float32Array, rate: number): number => {
  let n = 0;
  for (let i = 1; i < s.length; i++) if ((s[i - 1] ?? 0) < 0 && (s[i] ?? 0) >= 0) n++;
  return (n * rate) / s.length;
};

describe("PCM", () => {
  test("float ↔ PCM16 con saturación y extremos exactos", () => {
    expect([...floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5]))]).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
    const back = pcm16ToFloat(Int16Array.from([0, -32768, 16384]));
    expect([...back]).toEqual([0, -1, 0.5]);
  });

  test("bytes little-endian ida y vuelta; un byte suelto se descarta", () => {
    const pcm = Int16Array.from([1, -2, 300, -32768, 32767]);
    const bytes = pcm16ToBytes(pcm);
    expect(new Uint8Array(bytes).slice(0, 4)).toEqual(Uint8Array.from([1, 0, 0xfe, 0xff]));
    expect([...pcm16FromBytes(bytes)]).toEqual([...pcm]);
    const odd = new Uint8Array([1, 0, 9]).buffer;
    expect([...pcm16FromBytes(odd)]).toEqual([1]);
  });
});

describe("remuestreo", () => {
  test("48 kHz → 16 kHz: largo exacto y la frecuencia se conserva", () => {
    const input = sine(440, 48000, 1000);
    const out = resample(input, 48000, 16000);
    expect(out.length).toBe(16000);
    expect(zeroCrossHz(out, 16000)).toBeCloseTo(440, -1);
    expect(rms(out)).toBeCloseTo(rms(input), 1);
  });

  test("44,1 kHz → 16 kHz (relación no entera): 40 ms dan 640 muestras", () => {
    const out = resample(sine(300, 44100, 40), 44100, 16000);
    expect(out.length).toBe(640);
    expect(zeroCrossHz(resample(sine(300, 44100, 1000), 44100, 16000), 16000)).toBeCloseTo(300, -1);
  });

  test("bajar promedia: un tono por encima de Nyquist de destino se atenúa mucho", () => {
    const high = sine(12000, 48000, 200); // 12 kHz no entra en 16 kHz (Nyquist 8 kHz)
    expect(rms(resample(high, 48000, 16000))).toBeLessThan(rms(high) * 0.5);
  });

  test("subir interpola (24 kHz → 48 kHz) y misma tasa copia", () => {
    const up = resample(Float32Array.from([0, 1, 0]), 24000, 48000);
    expect([...up]).toEqual([0, 0.5, 1, 0.5, 0, 0]);
    const same = Float32Array.from([1, 2]);
    const copy = resample(same, 16000, 16000);
    expect(copy).not.toBe(same);
    expect([...copy]).toEqual([1, 2]);
  });

  test("tasas inválidas fallan claro", () => {
    expect(() => resample(new Float32Array(4), 0, 16000)).toThrow(RangeError);
  });
});

describe("VAD por energía", () => {
  const frames = (energy: number, count: number, from: VadState = initialVad()) => {
    let s = from;
    const events: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = vadStep(s, energy, 40);
      s = r.state;
      if (r.event) events.push(r.event);
    }
    return { state: s, events };
  };

  test("silencio: nunca hay voz", () => {
    const r = frames(rms(new Float32Array(640)), 100);
    expect(r.events).toEqual([]);
    expect(r.state.heardSpeech).toBe(false);
  });

  test("voz simulada (seno de 200 Hz) dispara speechStart después de speechMs, una sola vez", () => {
    const voice = rms(sine(200, 16000, 40, 0.3));
    expect(voice).toBeGreaterThan(DEFAULT_VAD.threshold);
    const r = frames(voice, 10);
    expect(r.events).toEqual(["speechStart"]);
    expect(r.state.heardSpeech).toBe(true);
    // Un golpe de 40 ms no alcanza (speechMs = 120).
    expect(frames(voice, 2).state.heardSpeech).toBe(false);
  });

  test("ruido de fondo bajo no cuenta como voz", () => {
    expect(frames(rms(noise(640, 0.01)), 50).state.heardSpeech).toBe(false);
  });

  test("silencio largo después de hablar: `silence` a los 3 s (configurable), y heardSpeech queda", () => {
    const voice = rms(sine(200, 16000, 40, 0.3));
    const talked = frames(voice, 10).state;
    const pause = frames(0, 74, talked); // 2960 ms
    expect(pause.events).toEqual([]);
    const more = frames(0, 1, pause.state);
    expect(more.events).toEqual(["silence"]);
    expect(more.state).toMatchObject({ speaking: false, heardSpeech: true });
    expect(frames(0, 80, more.state).events).toEqual([]); // una vez por pausa
    const short = vadStep(talked, 0, 40, { ...DEFAULT_VAD, silenceMs: 40 });
    expect(short.event).toBe("silence");
  });

  test("nivel del medidor en dB: piso, techo y monotonía", () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(0.0005)).toBe(0); // -66 dBFS, bajo el piso
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(0.01)).toBeCloseTo(1 / 3, 2); // -40 dBFS
    expect(levelFromRms(0.1)).toBeGreaterThan(levelFromRms(0.01));
  });
});

describe("bloques de captura", () => {
  test("48 kHz: entradas de 128 muestras salen como bloques de 40 ms a 16 kHz, sin perder muestras", () => {
    const framer = createCaptureFramer({ sourceRate: 48000 });
    expect(framer.frameMs).toBe(CAPTURE_FRAME_MS);
    const input = sine(250, 48000, 400, 0.4); // 19200 muestras = 10 bloques
    const out = [];
    for (let i = 0; i < input.length; i += 128) out.push(...framer.push(input.subarray(i, i + 128)));
    expect(out).toHaveLength(10);
    expect(out.every((f) => f.pcm.length === 640)).toBe(true);
    expect(out[0]?.rms).toBeCloseTo(0.4 / Math.SQRT2, 2);
    // Continuidad: el bloque 2 empieza donde el 1 terminó (mismo seno, sin saltos grandes en el borde).
    const a = out[0]?.pcm ?? new Int16Array();
    const b = out[1]?.pcm ?? new Int16Array();
    expect(Math.abs((b[0] ?? 0) - (a[a.length - 1] ?? 0))).toBeLessThan(2000);
  });

  test("44,1 kHz: 1764 muestras por bloque → 640 a 16 kHz; lo que sobra espera al próximo push", () => {
    const framer = createCaptureFramer({ sourceRate: 44100 });
    expect(framer.push(new Float32Array(1000))).toEqual([]);
    const got = framer.push(new Float32Array(1000));
    expect(got).toHaveLength(1);
    expect(got[0]?.pcm.length).toBe(640);
    expect(got[0]?.rms).toBe(0);
  });
});

describe("el worklet solo envuelve dsp/ (P0 §7)", () => {
  const source = (import.meta.glob("../src/services/audio/capture.worklet.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../src/services/audio/capture.worklet.ts"] ?? "";
  const code = source.replace(/\/\/.*$/gm, "");

  test("existe e importa de dsp/ (guardia contra un archivo que no está)", () => {
    expect(source.length).toBeGreaterThan(100);
    expect(code).toMatch(/import \{ createCaptureFramer \} from "\.\/dsp\/capture";/);
    expect(code).toContain("registerProcessor(");
  });

  test("no tiene lógica propia: sin aritmética de muestras, sin buffers propios, sin otros imports", () => {
    expect([...code.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1])).toEqual(["./dsp/capture"]);
    expect(code).not.toMatch(/new (Float32Array|Int16Array|ArrayBuffer)/);
    expect(code).not.toMatch(/Math\./);
    expect(code).not.toMatch(/[^=!<>]\s[*/+-]\s/); // ni * / + - binarios
    expect(code).not.toMatch(/\bwhile\b/);
    expect(code).not.toMatch(/^(?!declare ).*\bfunction\b/m); // solo las declaraciones de tipos del scope del worklet
  });
});
