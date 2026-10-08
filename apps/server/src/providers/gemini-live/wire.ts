// Formato de cable de la Live API (WebSocket crudo v1beta `BidiGenerateContent`, el que usa un prototipo de voz anterior).
// Procedencia (ADR-005): forma del `setup` y lectura de `serverContent`/`goAway`/`sessionResumptionUpdate`/
// `usageMetadata` portadas de un prototipo de voz anterior (public/index.html, startSession y handleServerMessage), con las
// enmiendas de P0 §4.1: el setup lo arma el SERVIDOR, pide transcripción de entrada y de salida y desactiva la
// detección automática de actividad (turnos manuales, D-091). Nada de esto viaja al cliente del juego.
import type { SceneVoiceSetup, ScriptedTurn, VoiceUsage } from "../types.ts";

export const LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** Tasa del audio del jugador que acepta Live (03 §5.5). */
export const INPUT_SAMPLE_RATE = 16000;

/** Mensaje `setup` armado por el servidor. `resumeHandle`: reanudación tras goAway o un corte. */
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
      // Turnos manuales: el NPC no puede responder hasta activityEnd (ADR-007, D-091).
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Red de seguridad si una escena se alarga por un bug (03 §5.4 punto 5).
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    },
  };
}

/** Turnos de contexto: si el último es del usuario, el modelo responde (turnComplete); si es del modelo, no. */
export const clientContentMessage = (turns: readonly ScriptedTurn[]): unknown => ({
  clientContent: {
    turns: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    turnComplete: turns[turns.length - 1]?.role === "user",
  },
});

export const ACTIVITY_START = { realtimeInput: { activityStart: {} } };
export const ACTIVITY_END = { realtimeInput: { activityEnd: {} } };

/** El PCM se codifica en el momento de la llamada: el adaptador no guarda la referencia al audio (contrato, regla 3). */
export const audioMessage = (pcm16: Int16Array): unknown => ({
  realtimeInput: {
    audio: {
      data: Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength).toString("base64"),
      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
    },
  },
});

/** "10s", "1.5s" → segundos; cualquier otra cosa → null (LT: parseDurationSeconds). */
export function parseDurationSeconds(d: unknown): number | null {
  if (typeof d !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d.trim());
  return m?.[1] ? Number(m[1]) : null;
}

/** base64 de PCM16 little-endian → Int16Array propia (copia). */
export function decodePcm16(b64: string): Int16Array {
  const buf = Buffer.from(b64, "base64");
  const even = buf.byteLength - (buf.byteLength % 2);
  const out = new Int16Array(even / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

/** "audio/pcm;rate=24000" → 24000; sin tasa o con otra, 24000 (la salida de Live). */
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

/** usageMetadata → tokens por modalidad (LT: suma por modalidad, con los totales planos como respaldo). */
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
