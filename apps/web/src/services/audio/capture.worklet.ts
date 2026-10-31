// AudioWorklet for capture (F5.2, D-094). It only wraps dsp/ (P0 §7, test in audio-dsp.test.ts): builds 40 ms blocks
// resampled to 16 kHz PCM16 with createCaptureFramer and sends them to the main thread (transferring the buffer, without
// copying it). It has no logic of its own. Vite bundles it separately (`?worker&url` in engine.ts).
import { createCaptureFramer } from "./dsp/capture";

// Minimal AudioWorkletGlobalScope types (they are not in TypeScript's DOM lib).
interface WorkletPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
}
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: WorkletPort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/** Name engine.ts uses to create the AudioWorkletNode. */
const PROCESSOR = "lg-capture";

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly framer = createCaptureFramer({ sourceRate: sampleRate });

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const f of this.framer.push(channel)) this.port.postMessage({ pcm: f.pcm, rms: f.rms }, [f.pcm.buffer]);
    }
    return true;
  }
}

registerProcessor(PROCESSOR, CaptureProcessor);
