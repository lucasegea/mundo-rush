// Contracts of services/audio (F5.2, R13). `VoiceTransport`: how the voice travels (today, binary frames of the
// scene WebSocket, ADR-017; implemented by services/scene). `AudioEngine`: the single AudioContext, the microphone and the
// playback queue (in the browser, engine.ts; in tests, a fake one).
import type { MicProblem } from "../../state/slices";
import type { CaptureFrame } from "./dsp";

export interface VoiceTransport {
  /** A block of player voice (PCM16 16 kHz). Only called with a spoken turn open. */
  sendPlayerAudio(pcm16: Int16Array): void;
  /** NPC voice (PCM16 at NPC_AUDIO_SAMPLE_RATE). Returns how to stop listening. */
  onNpcAudio(listener: (pcm16: Int16Array) => void): () => void;
}

export type MicResult = { ok: true } | { ok: false; problem: MicProblem };

export interface AudioEngine {
  /** Requests the microphone and starts capture. Blocks always arrive (meter); the service decides which ones to send. */
  startMic(onFrame: (frame: CaptureFrame) => void): Promise<MicResult>;
  /** Resumes the AudioContext. Called inside a player gesture (browser autoplay policy). */
  resume(): void;
  /** Queues NPC voice so it plays without cuts. */
  play(pcm16: Int16Array, sampleRate: number): void;
  /** Cuts the voice that is playing and empties the queue. */
  stopPlayback(): void;
  /** The playback queue became empty (what was queued finished playing). */
  onDrained(listener: () => void): void;
  /** The microphone was lost (unplugged, permission revoked). */
  onMicLost(listener: () => void): void;
  /** Releases the microphone and closes the AudioContext. */
  close(): void;
}
