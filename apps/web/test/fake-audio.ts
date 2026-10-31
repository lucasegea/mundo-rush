// Fake audio engine for the voice tests (F5.2): no Web Audio or microphone (D-016). The test decides what the
// permission answers, pushes capture blocks as if the player were speaking and triggers the end of playback.
import type { CaptureFrame } from "../src/services/audio/dsp";
import type { AudioEngine, MicResult } from "../src/services/audio";

export interface FakeAudioEngine extends AudioEngine {
  /** NPC voice blocks that were sent to play. */
  readonly played: Int16Array[];
  readonly resumed: number;
  readonly closed: boolean;
  /** The player "speaks": a 40 ms capture block (640 samples at 16 kHz) with that energy. */
  speak(rms?: number, value?: number): void;
  /** Finishes playing everything queued. */
  drain(): void;
  /** The microphone is lost. */
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

/** Factory that hands out fake engines and remembers the last one. */
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
