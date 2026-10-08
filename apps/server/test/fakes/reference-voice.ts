// Adaptador de voz de referencia, en memoria (F5.1a A1): implementa `RealtimeVoiceProvider` sin red y con respuestas
// guionadas. Es la vara del test de contrato compartido: el adaptador Live (contra el servidor falso) y, en F5.1b, la
// cascada tienen que emitir la misma secuencia de tipos de evento. Los eventos salen en microtareas (asíncronos, como un
// proveedor real). No guarda el audio: solo cuenta muestras.
import type { RealtimeVoiceProvider, ScriptedTurn, VoiceEvent } from "../../src/providers/types.ts";
import { DEFAULT_REPLY, type ScriptedReply } from "./live-server.ts";

export interface ReferenceVoice extends RealtimeVoiceProvider {
  readonly calls: string[];
  readonly samplesReceived: number;
  readonly closedWith: string | null;
}

export interface ReferenceOptions {
  replies?: readonly ScriptedReply[];
  /** open() rechaza (sesión que no abre). */
  failOpen?: boolean;
  /**
   * Nombre de adaptador para el ledger. Por omisión "gemini-live": el uso que emite tiene la forma de tokens de Live,
   * así el runtime registra el costo con esas tarifas.
   */
  adapter?: string;
}

export function createReferenceVoice(opts: ReferenceOptions = {}): ReferenceVoice {
  let handler: (e: VoiceEvent) => void = () => {};
  const calls: string[] = [];
  let samples = 0;
  let replyIndex = 0;
  let current: string | null = null;
  let playerTurn: string | null = null;
  let interruptedTurn: string | null = null;
  let closedWith: string | null = null;
  const later = (fn: () => void): void => queueMicrotask(() => {
    if (closedWith === null) fn();
  });
  const nextReply = (): ScriptedReply => opts.replies?.[Math.min(replyIndex++, opts.replies.length - 1)] ?? DEFAULT_REPLY;

  const respond = (turnId: string, withPlayer: boolean): void => {
    const r = nextReply();
    later(() => {
      if (withPlayer) {
        for (const p of r.player) handler({ type: "playerTranscriptPartial", turnId, text: p });
        handler({ type: "playerTranscriptFinal", turnId, text: r.player.join("").trim() });
      }
      handler({ type: "npcTranscript", turnId, text: r.npc });
      if (interruptedTurn !== turnId) handler({ type: "npcAudioChunk", turnId, pcm16: Int16Array.from(r.audio), sampleRate: 24000 });
      handler({ type: "npcTurnDone", turnId });
      const u = r.usage ?? DEFAULT_REPLY.usage;
      if (u) handler({ type: "usage", turnId, usage: { kind: "tokens", ...u } });
    });
  };

  return {
    adapter: opts.adapter ?? "gemini-live",
    provider: "reference",
    model: "reference",
    calls,
    get samplesReceived() {
      return samples;
    },
    get closedWith() {
      return closedWith;
    },
    open() {
      calls.push("open");
      return opts.failOpen ? Promise.reject(new Error("no abre")) : Promise.resolve();
    },
    injectContext(turns: readonly ScriptedTurn[], turnId?: string) {
      calls.push(`inject:${turns.map((t) => t.role).join(",")}`);
      if (turnId !== undefined) current = turnId;
      if (turns[turns.length - 1]?.role === "user" && current) respond(current, false);
    },
    startTurn(turnId) {
      calls.push(`start:${turnId}`);
      current = turnId;
      playerTurn = turnId;
      interruptedTurn = null;
    },
    sendAudio(turnId, pcm16) {
      if (turnId === playerTurn) samples += pcm16.length;
    },
    endTurn(turnId) {
      calls.push(`end:${turnId}`);
      if (turnId === playerTurn) respond(turnId, true);
    },
    interrupt() {
      if (!current || interruptedTurn === current) return;
      interruptedTurn = current;
      const id = current;
      handler({ type: "interrupted", turnId: id });
    },
    close(reason) {
      calls.push(`close:${reason}`);
      closedWith = reason;
      return Promise.resolve();
    },
    on(h) {
      handler = h;
    },
  };
}
