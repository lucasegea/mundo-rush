// TurnClip (D-095, D-108, P0 §4.3 rule 3): the player's audio for ONE turn, PCM16 at 16 kHz, built by scene-runtime
// from its own `sendAudio`. Lives in memory only: scene-runtime is its sole owner, hands it read-only to the
// observer (and in FP to pronunciation) and releases it on finish or after 10 s, whichever comes first. It never goes to disk
// (the stores reject binaries) and no adapter keeps it.

export const CLIP_SAMPLE_RATE = 16000;

/** Read-only view that the observer receives. After release, `pcm16()` fails. */
export interface TurnClipView {
  readonly turnId: string;
  readonly sampleRate: typeof CLIP_SAMPLE_RATE;
  readonly released: boolean;
  /** Samples of the turn (a copy). */
  pcm16(): Int16Array;
  readonly sampleCount: number;
}

export interface TurnClip extends TurnClipView {
  append(chunk: Int16Array): void;
  /** Clears the samples (sets them to zero) and drops the references. Idempotent. */
  release(): void;
}

export class ReleasedClipError extends Error {
  constructor(turnId: string) {
    super(`el clip del turno ${turnId} ya se liberó`);
    this.name = "ReleasedClipError";
  }
}

export function createTurnClip(turnId: string): TurnClip {
  let chunks: Int16Array[] = [];
  let count = 0;
  let released = false;
  return {
    turnId,
    sampleRate: CLIP_SAMPLE_RATE,
    get released() {
      return released;
    },
    get sampleCount() {
      return count;
    },
    append(chunk) {
      if (released) return;
      // Own copy: the clip shares no memory with whoever sent the audio.
      chunks.push(Int16Array.from(chunk));
      count += chunk.length;
    },
    pcm16() {
      if (released) throw new ReleasedClipError(turnId);
      const out = new Int16Array(count);
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.length;
      }
      return out;
    },
    release() {
      if (released) return;
      released = true;
      for (const c of chunks) c.fill(0);
      chunks = [];
      count = 0;
    },
  };
}

/** Read-only: what is passed to the observer can neither append nor release. */
export const readOnly = (clip: TurnClip): TurnClipView => ({
  turnId: clip.turnId,
  sampleRate: clip.sampleRate,
  get released() {
    return clip.released;
  },
  get sampleCount() {
    return clip.sampleCount;
  },
  pcm16: () => clip.pcm16(),
});
