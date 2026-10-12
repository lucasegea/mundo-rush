// Armado de bloques de captura, puro (F5.2): junta las muestras que entrega el AudioWorklet (128 por llamada, a la
// tasa del AudioContext), y cada `frameMs` emite un bloque remuestreado a 16 kHz en PCM16 con su energía. El worklet
// solo envuelve esto (P0 §7: la lógica vive en dsp/, el worklet no tiene lógica propia).
import { floatToPcm16 } from "./pcm";
import { resample } from "./resample";
import { rms } from "./vad";

/** Tasa del audio del jugador que acepta el servidor (= PLAYER_AUDIO_SAMPLE_RATE de @lg/protocol). */
export const CAPTURE_TARGET_RATE = 16000;
/** 40 ms: bloques chicos (latencia) y con largo entero de salida para 8/16/22,05/24/32/44,1/48/96 kHz. */
export const CAPTURE_FRAME_MS = 40;

export interface CaptureFrame {
  /** PCM16 a `targetRate`. */
  pcm: Int16Array;
  /** Energía RMS del bloque (antes de remuestrear). */
  rms: number;
}

export interface CaptureFramerOptions {
  sourceRate: number;
  targetRate?: number;
  frameMs?: number;
}

export interface CaptureFramer {
  /** Muestras nuevas; devuelve los bloques completos que se cerraron (cero o más). */
  push(samples: Float32Array): CaptureFrame[];
  readonly frameMs: number;
}

export function createCaptureFramer(opts: CaptureFramerOptions): CaptureFramer {
  const targetRate = opts.targetRate ?? CAPTURE_TARGET_RATE;
  const frameMs = opts.frameMs ?? CAPTURE_FRAME_MS;
  const size = Math.max(1, Math.round((opts.sourceRate * frameMs) / 1000));
  let block = new Float32Array(size);
  let filled = 0;
  return {
    frameMs,
    push(samples) {
      const out: CaptureFrame[] = [];
      let i = 0;
      while (i < samples.length) {
        const take = Math.min(size - filled, samples.length - i);
        block.set(samples.subarray(i, i + take), filled);
        filled += take;
        i += take;
        if (filled === size) {
          out.push({ pcm: floatToPcm16(resample(block, opts.sourceRate, targetRate)), rms: rms(block) });
          block = new Float32Array(size);
          filled = 0;
        }
      }
      return out;
    },
  };
}
