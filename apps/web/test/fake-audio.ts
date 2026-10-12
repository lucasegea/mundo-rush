// Motor de audio falso para los tests de voz (F5.2): sin Web Audio ni micrófono (D-016). El test decide qué responde el
// permiso, empuja bloques de captura como si hablara el jugador y dispara el fin de la reproducción.
import type { CaptureFrame } from "../src/services/audio/dsp";
import type { AudioEngine, MicResult } from "../src/services/audio";

export interface FakeAudioEngine extends AudioEngine {
  /** Bloques de voz del NPC que se mandaron a reproducir. */
  readonly played: Int16Array[];
  readonly resumed: number;
  readonly closed: boolean;
  /** El jugador "habla": un bloque de captura de 40 ms (640 muestras a 16 kHz) con esa energía. */
  speak(rms?: number, value?: number): void;
  /** Termina de sonar todo lo encolado. */
  drain(): void;
  /** El micrófono se pierde. */
  loseMic(): void;
}

export function fakeAudioEngine(result: MicResult = { ok: true }): FakeAudioEngine {
  let frameCb: ((f: CaptureFrame) => void) | null = null;
  const drained: (() => void)[] = [];
  const lost: (() => void)[] = [];
  const played: Int16Array[] = [];
  let resumed = 0;
  let closed = false;
  return {
    played,
    get resumed() { return resumed; },
    get closed() { return closed; },
    startMic(onFrame) {
      if (result.ok) frameCb = onFrame;
      return Promise.resolve(result);
    },
    resume() { resumed++; },
    play(pcm16) { played.push(pcm16); },
    stopPlayback() {},
    onDrained(fn) { drained.push(fn); },
    onMicLost(fn) { lost.push(fn); },
    close() { closed = true; frameCb = null; },
    speak(rms = 0.2, value = 1000) {
      frameCb?.({ pcm: new Int16Array(640).fill(value), rms });
    },
    drain() { drained.forEach((fn) => fn()); },
    loseMic() { lost.forEach((fn) => fn()); },
  };
}

/** Fábrica que entrega motores falsos y recuerda el último. */
export function fakeEngineFactory(result: MicResult = { ok: true }): { createEngine: () => Promise<AudioEngine>; readonly last: FakeAudioEngine | null; readonly created: number } {
  let last: FakeAudioEngine | null = null;
  let created = 0;
  return {
    createEngine: () => {
      created++;
      last = fakeAudioEngine(result);
      return Promise.resolve(last);
    },
    get last() { return last; },
    get created() { return created; },
  };
}
