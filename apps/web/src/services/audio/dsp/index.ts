// services/audio/dsp — DSP del audio del cliente como funciones puras (F5.2, P0 §7): PCM, remuestreo, VAD por energía,
// nivel y armado de bloques de captura. Sin DOM ni Web Audio: el worklet y el motor del navegador solo las envuelven.
export { floatToPcm16, pcm16FromBytes, pcm16ToBytes, pcm16ToFloat } from "./pcm";
export { resample } from "./resample";
export { DEFAULT_VAD, initialVad, levelFromRms, rms, vadStep, type VadConfig, type VadEvent, type VadState } from "./vad";
export { CAPTURE_FRAME_MS, CAPTURE_TARGET_RATE, createCaptureFramer, type CaptureFrame, type CaptureFramer, type CaptureFramerOptions } from "./capture";
