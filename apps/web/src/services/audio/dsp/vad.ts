// Energy-based VAD and microphone level, pure (F5.2, 04 F5.2: configurable threshold, 3 s by default). The player
// closes the turn ("Done" or releasing the button: nobody interrupts them); the VAD only says whether there was speech in the turn and
// when there is a long silence, and the level feeds the microphone-check meter.

/** RMS energy of a block (float [-1, 1]). */
export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / frame.length);
}

/** Meter floor: -60 dBFS = 0, 0 dBFS = 1. */
const FLOOR_DB = -60;

/** RMS → 0..1 level on a dB scale (what the ear expects to see on a meter). */
export function levelFromRms(value: number): number {
  if (!(value > 0)) return 0;
  const db = 20 * Math.log10(value);
  return Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
}

export interface VadConfig {
  /** RMS above which a block counts as speech. */
  threshold: number;
  /** Sustained speech needed to declare that the player is talking (filters out bumps and clicks). */
  speechMs: number;
  /** Silence after speaking that triggers `silence` (03: 3 s configurable). */
  silenceMs: number;
}

export const DEFAULT_VAD: VadConfig = { threshold: 0.015, speechMs: 120, silenceMs: 3000 };

export interface VadState {
  /** There was speech in this turn (at least `speechMs` in a row). */
  heardSpeech: boolean;
  speaking: boolean;
  speechRunMs: number;
  silenceRunMs: number;
}

export const initialVad = (): VadState => ({ heardSpeech: false, speaking: false, speechRunMs: 0, silenceRunMs: 0 });

export type VadEvent = "speechStart" | "silence" | null;

/** One VAD step with the energy of a `frameMs` block. `silence` fires once per long pause. */
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
