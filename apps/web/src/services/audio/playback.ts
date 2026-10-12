// Cola de reproducción de la voz del NPC (F5.2; procedencia: drainAudioQueue/playPcm16 de un prototipo de voz anterior, rehecha
// sin huecos): cada bloque PCM16 se agenda pegado al anterior en el reloj del AudioContext, con un margen inicial corto
// que absorbe el jitter de la red. Avisa cuando terminó de sonar todo lo encolado. Recibe un contexto mínimo para que
// vitest la pruebe sin Web Audio.
import { pcm16ToFloat } from "./dsp";

/** Lo que la cola usa de un AudioBufferSourceNode. */
export interface PlaybackSource {
  buffer: PlaybackBuffer | null;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  start(when: number): void;
  stop(): void;
}

export interface PlaybackBuffer {
  getChannelData(channel: number): Float32Array;
}

/** Lo que la cola usa de un AudioContext. */
export interface PlaybackContext {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): PlaybackBuffer;
  createBufferSource(): PlaybackSource;
}

export interface PlaybackQueue {
  push(pcm16: Int16Array, sampleRate: number): void;
  /** Corta lo que suena y descarta lo encolado (sin avisar `drained`). */
  stop(): void;
  readonly playing: boolean;
}

/** Margen antes del primer bloque de una tirada (s). */
export const PLAYBACK_LEAD_S = 0.08;

export function createPlaybackQueue(ctx: PlaybackContext, onDrained: () => void, leadS = PLAYBACK_LEAD_S): PlaybackQueue {
  const active = new Set<PlaybackSource>();
  let nextAt = 0;
  return {
    push(pcm16, sampleRate) {
      if (pcm16.length === 0) return;
      const buffer = ctx.createBuffer(1, pcm16.length, sampleRate);
      buffer.getChannelData(0).set(pcm16ToFloat(pcm16));
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const at = Math.max(nextAt, ctx.currentTime + (active.size === 0 ? leadS : 0));
      nextAt = at + pcm16.length / sampleRate;
      active.add(src);
      src.onended = () => {
        if (!active.delete(src)) return;
        if (active.size === 0) onDrained();
      };
      src.start(at);
    },
    stop() {
      const all = [...active];
      active.clear();
      nextAt = 0;
      for (const s of all) {
        s.onended = null;
        try {
          s.stop();
        } catch {
          // ya terminó
        }
      }
    },
    get playing() {
      return active.size > 0;
    },
  };
}
