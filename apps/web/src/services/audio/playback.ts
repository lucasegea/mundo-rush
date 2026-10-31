// NPC voice playback queue (F5.2; provenance: drainAudioQueue/playPcm16 from an earlier voice prototype, redone
// without gaps): each PCM16 block is scheduled right after the previous one on the AudioContext clock, with a short initial margin
// that absorbs network jitter. Signals when everything queued has finished playing. Takes a minimal context so that
// vitest can test it without Web Audio.
import { pcm16ToFloat } from "./dsp";

/** What the queue uses from an AudioBufferSourceNode. */
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

/** What the queue uses from an AudioContext. */
export interface PlaybackContext {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): PlaybackBuffer;
  createBufferSource(): PlaybackSource;
}

export interface PlaybackQueue {
  push(pcm16: Int16Array, sampleRate: number): void;
  /** Cuts what is playing and discards what is queued (without signaling `drained`). */
  stop(): void;
  readonly playing: boolean;
}

/** What is needed from an AudioContext to resume it. */
export interface ResumableContext {
  readonly state: string;
  resume(): Promise<void>;
}

/**
 * A2: a suspended AudioContext does not advance its clock: what is queued never plays nor signals it finished. It resumes on
 * playback (as well as on the "Talk" gesture); if the browser rejects it, the service watchdog releases the turn.
 */
export function resumeIfSuspended(ctx: ResumableContext): void {
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

/** Margin before the first block of a run (s). */
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
          // already finished
        }
      }
    },
    get playing() {
      return active.size > 0;
    },
  };
}
