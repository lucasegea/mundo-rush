// services/audio/ — único AudioContext, costura R13 (F5.2): captura por AudioWorklet (PCM16 16 kHz, D-094), cola de
// reproducción de la voz del NPC, DSP puro en dsp/, máquina de estados del audio y el servicio que los une con el store.
// El motor del navegador (engine.ts) se carga por import() diferido desde la raíz de composición; acá no se importa
// para que el worklet no entre en el grafo de los tests ni del chunk inicial.
export { audioTransition, canTalk, type AudioEvent, type AudioState } from "./machine";
export { createPlaybackQueue, PLAYBACK_LEAD_S, resumeIfSuspended, type PlaybackContext, type PlaybackQueue, type ResumableContext } from "./playback";
export {
  LEVEL_INTERVAL_MS, NPC_SAMPLE_RATE, PLAYBACK_STUCK_GRACE_MS, startAudioService, TALK_TAIL_MS, TURN_ACK_TIMEOUT_MS,
  type AudioService, type AudioServiceDeps, type Schedule,
} from "./service";
export type { AudioEngine, MicResult, VoiceTransport } from "./types";
