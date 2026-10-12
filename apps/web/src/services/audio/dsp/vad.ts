// VAD por energía y nivel del micrófono, puros (F5.2, 04 F5.2: umbral configurable, 3 s por defecto). El turno lo
// cierra el jugador ("Terminé" o soltar el botón: nadie lo interrumpe); el VAD solo dice si hubo voz en el turno y
// cuándo hay silencio largo, y el nivel alimenta el medidor de chequeo del micrófono.

/** Energía RMS de un bloque (float [-1, 1]). */
export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / frame.length);
}

/** Piso del medidor: -60 dBFS = 0, 0 dBFS = 1. */
const FLOOR_DB = -60;

/** RMS → nivel 0..1 en escala de dB (lo que el oído espera ver en un medidor). */
export function levelFromRms(value: number): number {
  if (!(value > 0)) return 0;
  const db = 20 * Math.log10(value);
  return Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
}

export interface VadConfig {
  /** RMS a partir del cual un bloque cuenta como voz. */
  threshold: number;
  /** Voz sostenida que hace falta para declarar que el jugador habla (filtra golpes y clics). */
  speechMs: number;
  /** Silencio después de hablar que dispara `silence` (03: 3 s configurable). */
  silenceMs: number;
}

export const DEFAULT_VAD: VadConfig = { threshold: 0.015, speechMs: 120, silenceMs: 3000 };

export interface VadState {
  /** Hubo voz en este turno (al menos `speechMs` seguidos). */
  heardSpeech: boolean;
  speaking: boolean;
  speechRunMs: number;
  silenceRunMs: number;
}

export const initialVad = (): VadState => ({ heardSpeech: false, speaking: false, speechRunMs: 0, silenceRunMs: 0 });

export type VadEvent = "speechStart" | "silence" | null;

/** Un paso del VAD con la energía de un bloque de `frameMs`. `silence` sale una vez por pausa larga. */
export function vadStep(state: VadState, energy: number, frameMs: number, cfg: VadConfig = DEFAULT_VAD): { state: VadState; event: VadEvent } {
  if (energy >= cfg.threshold) {
    const speechRunMs = state.speechRunMs + frameMs;
    const starts = !state.speaking && speechRunMs >= cfg.speechMs;
    return {
      state: { heardSpeech: state.heardSpeech || starts, speaking: state.speaking || starts, speechRunMs, silenceRunMs: 0 },
      event: starts ? "speechStart" : null,
    };
  }
  const silenceRunMs = state.silenceRunMs + frameMs;
  const ends = state.speaking && silenceRunMs >= cfg.silenceMs;
  return {
    state: { ...state, speaking: state.speaking && !ends, speechRunMs: 0, silenceRunMs },
    event: ends ? "silence" : null,
  };
}
