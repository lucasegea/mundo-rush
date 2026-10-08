// TurnClip (D-095, D-108, P0 §4.3 regla 3): el audio del jugador de UN turno, PCM16 a 16 kHz, armado por scene-runtime
// con sus propios `sendAudio`. Vive solo en memoria: scene-runtime es su único dueño, lo entrega de solo lectura al
// observador (y en FP a la pronunciación) y lo libera al terminar o a los 10 s, lo que pase primero. Nunca va a disco
// (los almacenes rechazan binarios) y ningún adaptador lo guarda.

export const CLIP_SAMPLE_RATE = 16000;

/** Vista de solo lectura que recibe el observador. Después de liberar, `pcm16()` falla. */
export interface TurnClipView {
  readonly turnId: string;
  readonly sampleRate: typeof CLIP_SAMPLE_RATE;
  readonly released: boolean;
  /** Muestras del turno (una copia). */
  pcm16(): Int16Array;
  readonly sampleCount: number;
}

export interface TurnClip extends TurnClipView {
  append(chunk: Int16Array): void;
  /** Borra las muestras (las pone en cero) y suelta las referencias. Idempotente. */
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
      // Copia propia: el clip no comparte memoria con quien mandó el audio.
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

/** Solo lectura: lo que se le pasa al observador no puede agregar ni liberar. */
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
