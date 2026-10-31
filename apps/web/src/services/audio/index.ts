// services/audio/ — single AudioContext, R13 seam (F5.2): AudioWorklet capture (PCM16 16 kHz, D-094), NPC voice
// playback queue, pure DSP in dsp/, audio state machine and the service that ties them to the store.
// The browser engine (engine.ts) is loaded via deferred import() from the composition root; it is not imported here
// so that the worklet does not enter the test graph or the initial chunk.
export { audioTransition, canTalk, type AudioEvent, type AudioState } from "./machine";
export { createPlaybackQueue, PLAYBACK_LEAD_S, resumeIfSuspended, type PlaybackContext, type PlaybackQueue, type ResumableContext } from "./playback";
export {
  LEVEL_INTERVAL_MS, NPC_SAMPLE_RATE, PLAYBACK_STUCK_GRACE_MS, startAudioService, TALK_TAIL_MS, TURN_ACK_TIMEOUT_MS,
  type AudioService, type AudioServiceDeps, type Schedule,
} from "./service";
export type { AudioEngine, MicResult, VoiceTransport } from "./types";
