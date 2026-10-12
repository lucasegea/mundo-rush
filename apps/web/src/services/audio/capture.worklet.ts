// AudioWorklet de captura (F5.2, D-094). Solo envuelve dsp/ (P0 §7, test en audio-dsp.test.ts): arma bloques de 40 ms
// remuestreados a 16 kHz en PCM16 con createCaptureFramer y los manda al hilo principal (transfiriendo el buffer, sin
// copiarlo). No tiene lógica propia. Vite lo empaqueta aparte (`?worker&url` en engine.ts).
import { createCaptureFramer } from "./dsp/capture";

// Tipos mínimos del AudioWorkletGlobalScope (no están en la lib DOM de TypeScript).
interface WorkletPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
}
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: WorkletPort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/** Nombre con el que engine.ts crea el AudioWorkletNode. */
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
