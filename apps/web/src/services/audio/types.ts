// Contratos de services/audio (F5.2, R13). `VoiceTransport`: por dónde viaja la voz (hoy, frames binarios del
// WebSocket de escena, ADR-017; lo implementa services/scene). `AudioEngine`: el único AudioContext, el micrófono y la
// cola de reproducción (en el navegador, engine.ts; en tests, uno falso).
import type { MicProblem } from "../../state/slices";
import type { CaptureFrame } from "./dsp";

export interface VoiceTransport {
  /** Un bloque de voz del jugador (PCM16 16 kHz). Solo se llama con un turno hablado abierto. */
  sendPlayerAudio(pcm16: Int16Array): void;
  /** Voz del NPC (PCM16 a NPC_AUDIO_SAMPLE_RATE). Devuelve con qué dejar de escuchar. */
  onNpcAudio(listener: (pcm16: Int16Array) => void): () => void;
}

export type MicResult = { ok: true } | { ok: false; problem: MicProblem };

export interface AudioEngine {
  /** Pide el micrófono y arranca la captura. Los bloques llegan siempre (medidor); el servicio decide cuáles manda. */
  startMic(onFrame: (frame: CaptureFrame) => void): Promise<MicResult>;
  /** Reanuda el AudioContext. Se llama dentro de un gesto del jugador (política de autoplay de los navegadores). */
  resume(): void;
  /** Encola voz del NPC para que suene sin cortes. */
  play(pcm16: Int16Array, sampleRate: number): void;
  /** Corta la voz que suena y vacía la cola. */
  stopPlayback(): void;
  /** La cola de reproducción quedó vacía (terminó de sonar lo encolado). */
  onDrained(listener: () => void): void;
  /** El micrófono se perdió (desenchufado, permiso revocado). */
  onMicLost(listener: () => void): void;
  /** Suelta el micrófono y cierra el AudioContext. */
  close(): void;
}
