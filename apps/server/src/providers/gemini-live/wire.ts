// Wire format of the Live API (raw WebSocket v1beta `BidiGenerateContent`, the one an earlier voice prototype uses).
// Provenance (ADR-005): shape of the `setup` and reading of `serverContent`/`goAway`/`sessionResumptionUpdate`/
// `usageMetadata` ported from an earlier voice prototype (public/index.html, startSession and handleServerMessage), with the
// P0 §4.1 amendments: the setup is built by the SERVER, requests input and output transcription and disables
// automatic activity detection (manual turns, D-091). None of this travels to the game client.
import type { SceneVoiceSetup, ScriptedTurn, VoiceUsage } from "../types.ts";

export const LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** Sample rate of the player audio that Live accepts (03 §5.5). */
export const INPUT_SAMPLE_RATE = 16000;

/** `setup` message built by the server. `resumeHandle`: resumption after goAway or a drop. */
export function liveSetupMessage(model: string, setup: SceneVoiceSetup, resumeHandle: string | null): unknown {
  return {
    setup: {
      model: model.startsWith("models/") ? model : `models/${model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: setup.voiceName } },
          languageCode: setup.languageCode,
        },
      },
      systemInstruction: { parts: [{ text: setup.systemInstruction }] },
      // Manual turns: the NPC cannot respond until activityEnd (ADR-007, D-091).
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Safety net if a scene drags on because of a bug (03 §5.4 point 5).
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    },
  };
}

/** Context turns: if the last one is the user's, the model responds (turnComplete); if it is the model's, it doesn't. */
export const clientContentMessage = (turns: readonly ScriptedTurn[]): unknown => ({
  clientContent: {
    turns: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    turnComplete: turns[turns.length - 1]?.role === "user",
  },
});

export const ACTIVITY_START = { realtimeInput: { activityStart: {} } };
export const ACTIVITY_END = { realtimeInput: { activityEnd: {} } };

/** The PCM is encoded at call time: the adapter does not keep the reference to the audio (contract, rule 3). */
export const audioMessage = (pcm16: Int16Array): unknown => ({
  realtimeInput: {
    audio: {
      data: Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength).toString("base64"),
      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
    },
  },
});

/** "10s", "1.5s" → seconds; anything else → null (LT: parseDurationSeconds). */
export function parseDurationSeconds(d: unknown): number | null {
  if (typeof d !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d.trim());
  return m?.[1] ? Number(m[1]) : null;
}

/** base64 of little-endian PCM16 → its own Int16Array (a copy). */
export function decodePcm16(b64: string): Int16Array {
  const buf = Buffer.from(b64, "base64");
  const even = buf.byteLength - (buf.byteLength % 2);
  const out = new Int16Array(even / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

/** "audio/pcm;rate=24000" → 24000; with no rate or another one, 24000 (Live's output). */
export const outputSampleRate = (mime: string): 24000 | 16000 => (/rate=16000/.test(mime) ? 16000 : 24000);

interface ModalityCount {
  modality?: string;
  tokenCount?: number;
}
interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  responseTokenCount?: number;
  promptTokensDetails?: ModalityCount[];
  candidatesTokensDetails?: ModalityCount[];
  responseTokensDetails?: ModalityCount[];
}

/** usageMetadata → tokens per modality (LT: sum per modality, with the flat totals as fallback). */
export function usageFromMetadata(raw: unknown): VoiceUsage {
  const u = (raw ?? {}) as UsageMetadata;
  const sum = (details: ModalityCount[] | undefined, modality: string): number =>
    (details ?? []).filter((d) => d.modality === modality).reduce((n, d) => n + (d.tokenCount ?? 0), 0);
  const outDetails = u.candidatesTokensDetails ?? u.responseTokensDetails;
  return {
    kind: "tokens",
    audioIn: sum(u.promptTokensDetails, "AUDIO"),
    textIn: u.promptTokensDetails ? sum(u.promptTokensDetails, "TEXT") : u.promptTokenCount ?? 0,
    audioOut: sum(outDetails, "AUDIO"),
    textOut: outDetails ? sum(outDetails, "TEXT") : u.candidatesTokenCount ?? u.responseTokenCount ?? 0,
  };
}
