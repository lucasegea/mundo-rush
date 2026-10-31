// Pure capture-block assembly (F5.2): collects the samples the AudioWorklet delivers (128 per call, at the
// AudioContext rate), and every `frameMs` emits a block resampled to 16 kHz PCM16 along with its energy. The worklet
// only wraps this (P0 §7: the logic lives in dsp/, the worklet has no logic of its own).
import { floatToPcm16 } from "./pcm";
import { resample } from "./resample";
import { rms } from "./vad";

/** Player audio rate the server accepts (= PLAYER_AUDIO_SAMPLE_RATE from @lg/protocol). */
export const CAPTURE_TARGET_RATE = 16000;
/** 40 ms: small blocks (latency) with an integer output length for 8/16/22.05/24/32/44.1/48/96 kHz. */
export const CAPTURE_FRAME_MS = 40;

export interface CaptureFrame {
  /** PCM16 at `targetRate`. */
  pcm: Int16Array;
  /** RMS energy of the block (before resampling). */
  rms: number;
}

export interface CaptureFramerOptions {
  sourceRate: number;
  targetRate?: number;
  frameMs?: number;
}

export interface CaptureFramer {
  /** New samples; returns the complete blocks that closed (zero or more). */
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
