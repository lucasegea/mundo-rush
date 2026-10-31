// services/audio/dsp — client audio DSP as pure functions (F5.2, P0 §7): PCM, resampling, energy-based VAD,
// level and capture-block assembly. No DOM or Web Audio: the worklet and the browser engine only wrap them.
export { floatToPcm16, pcm16FromBytes, pcm16ToBytes, pcm16ToFloat } from "./pcm";
export { resample } from "./resample";
export { DEFAULT_VAD, initialVad, levelFromRms, rms, vadStep, type VadConfig, type VadEvent, type VadState } from "./vad";
export { CAPTURE_FRAME_MS, CAPTURE_TARGET_RATE, createCaptureFramer, type CaptureFrame, type CaptureFramer, type CaptureFramerOptions } from "./capture";
