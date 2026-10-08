// Adaptador Gemini Live de `RealtimeVoiceProvider` (03 §5.11, ADR-005/006/007, D-001, D-091, D-093).
// Procedencia: la cola de mensajes previa a la apertura y el cierre seguro salen del proxy de un prototipo de voz anterior
// (server.js, relay /proxy); la lectura de los mensajes del servidor, de su public/index.html. Lo demás es nuevo: el
// servidor arma el setup, una sesión por escena, turnos manuales (activityStart/activityEnd), reconexión con el handle de
// `sessionResumption` ante goAway o un corte, y eventos del contrato con `turnId`.
// La clave viaja solo en la URL del socket hacia Google (como en LT) y nunca se loguea ni aparece en un error.
import { WebSocket, type RawData } from "ws";
import { ProviderError } from "../text.ts";
import type { RealtimeVoiceProvider, SceneVoiceSetup, ScriptedTurn, VoiceEvent } from "../types.ts";
import {
  ACTIVITY_END, ACTIVITY_START, audioMessage, clientContentMessage, decodePcm16, LIVE_ENDPOINT, liveSetupMessage,
  outputSampleRate, parseDurationSeconds, usageFromMetadata,
} from "./wire.ts";

export const GEMINI_LIVE_ADAPTER = "gemini-live";

export interface GeminiLiveOptions {
  apiKey: string;
  model: string;
  /** Solo los tests lo cambian (servidor Live falso en 127.0.0.1). */
  endpoint?: string;
  openTimeoutMs?: number;
  /** Reconexiones por sesión (goAway o corte); después, error no recuperable y la escena sigue por texto. */
  maxReconnects?: number;
}

interface ServerContent {
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  interrupted?: boolean;
  turnComplete?: boolean;
}

interface LiveMessage {
  setupComplete?: unknown;
  serverContent?: ServerContent;
  usageMetadata?: unknown;
  goAway?: { timeLeft?: unknown };
  sessionResumptionUpdate?: { newHandle?: string; token?: string; resumable?: boolean };
}

/** Códigos de cierre que `ws` acepta mandar (LT: toSendableCloseCode). */
function closeSafely(socket: WebSocket, code: number, reason: string): void {
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
  try {
    socket.close(code, reason);
  } catch {
    socket.terminate();
  }
}

export function createGeminiLiveProvider(opts: GeminiLiveOptions): RealtimeVoiceProvider {
  if (opts.apiKey === "") throw new ProviderError("falta la clave del proveedor de voz", "unavailable");
  const endpoint = opts.endpoint ?? LIVE_ENDPOINT;
  const openTimeoutMs = opts.openTimeoutMs ?? 10_000;
  const maxReconnects = opts.maxReconnects ?? 2;

  let handler: (e: VoiceEvent) => void = () => {};
  let setup: SceneVoiceSetup | null = null;
  let socket: WebSocket | null = null;
  let ready = false;
  let closed = false;
  let reconnects = 0;
  let resumeHandle: string | null = null;
  let reconnecting = false;
  const queue: string[] = [];

  // Turno vigente: el del jugador (startTurn) o el de una respuesta pedida por injectContext.
  let current: string | null = null;
  let playerTurn: string | null = null;
  let playerText = "";
  let awaitingFinal = false;
  let interruptedTurn: string | null = null;

  const emit = (e: VoiceEvent): void => {
    if (!closed) handler(e);
  };

  const send = (msg: unknown): void => {
    if (closed) return;
    const text = JSON.stringify(msg);
    if (socket && ready && socket.readyState === WebSocket.OPEN) socket.send(text);
    else queue.push(text);
  };

  const flushFinal = (): void => {
    if (!awaitingFinal || !playerTurn) return;
    awaitingFinal = false;
    emit({ type: "playerTranscriptFinal", turnId: playerTurn, text: playerText.trim() });
  };

  function onServerContent(sc: ServerContent): void {
    const input = sc.inputTranscription?.text;
    if (input && playerTurn) {
      playerText += playerText && !playerText.endsWith(" ") && !input.startsWith(" ") ? ` ${input}` : input;
      emit({ type: "playerTranscriptPartial", turnId: playerTurn, text: input });
    }
    const parts = sc.modelTurn?.parts ?? [];
    const npcOutput = Boolean(sc.outputTranscription?.text) || parts.length > 0 || sc.turnComplete === true;
    if (npcOutput) flushFinal(); // la transcripción del jugador quedó completa cuando el NPC empieza a responder
    if (!current) return;
    if (sc.interrupted && interruptedTurn !== current) {
      interruptedTurn = current;
      emit({ type: "interrupted", turnId: current });
    }
    const out = sc.outputTranscription?.text;
    if (out) emit({ type: "npcTranscript", turnId: current, text: out });
    for (const p of parts) {
      const d = p.inlineData;
      if (!d?.data || !d.mimeType?.startsWith("audio/") || interruptedTurn === current) continue;
      emit({ type: "npcAudioChunk", turnId: current, pcm16: decodePcm16(d.data), sampleRate: outputSampleRate(d.mimeType) });
    }
    if (sc.turnComplete) emit({ type: "npcTurnDone", turnId: current });
  }

  function onMessage(msg: LiveMessage): void {
    const upd = msg.sessionResumptionUpdate;
    if (upd && upd.resumable !== false && (upd.newHandle ?? upd.token)) resumeHandle = upd.newHandle ?? upd.token ?? null;
    if (msg.serverContent) onServerContent(msg.serverContent);
    if (msg.usageMetadata) emit({ type: "usage", turnId: current, usage: usageFromMetadata(msg.usageMetadata) });
    if (msg.goAway) {
      emit({ type: "sessionEnding", turnId: current, secondsLeft: parseDurationSeconds(msg.goAway.timeLeft) });
      reconnect();
    }
  }

  const parse = (data: RawData): LiveMessage | null => {
    try {
      const v: unknown = JSON.parse(data.toString());
      return v !== null && typeof v === "object" ? (v as LiveMessage) : null;
    } catch {
      return null;
    }
  };

  /** Abre un socket, manda el setup y resuelve con setupComplete. Recién ahí reemplaza al socket anterior. */
  function connect(resume: boolean): Promise<void> {
    const s = setup;
    if (!s) return Promise.reject(new ProviderError("sesión sin setup", "unavailable"));
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${endpoint}?key=${encodeURIComponent(opts.apiKey)}`);
      let settled = false;
      const fail = (message: string, code: "unavailable" | "timeout"): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.removeAllListeners("message");
        ws.on("error", () => {});
        ws.terminate();
        reject(new ProviderError(message, code));
      };
      const timer = setTimeout(() => fail("la sesión de voz no abrió a tiempo", "timeout"), openTimeoutMs);
      ws.on("open", () => ws.send(JSON.stringify(liveSetupMessage(opts.model, s, resume ? resumeHandle : null))));
      ws.on("message", (data: RawData) => {
        const msg = parse(data);
        if (!msg) return;
        if (!settled && msg.setupComplete !== undefined) {
          settled = true;
          clearTimeout(timer);
          if (closed) {
            closeSafely(ws, 1000, "closed");
            return resolve();
          }
          const old = socket;
          socket = ws;
          ready = true;
          for (const q of queue.splice(0)) ws.send(q);
          if (old && old !== ws) closeSafely(old, 1000, "resumed");
          return resolve();
        }
        if (settled) onMessage(msg);
      });
      ws.on("error", () => fail("error de red con el proveedor de voz", "unavailable"));
      ws.on("close", () => {
        if (!settled) return fail("la sesión de voz se cerró antes de abrir", "unavailable");
        if (ws === socket && !closed) lost();
      });
    });
  }

  function reconnect(): void {
    if (closed) return;
    if (!resumeHandle || reconnects >= maxReconnects) {
      emit({ type: "error", turnId: current, recoverable: false, code: resumeHandle ? "reconnect_limit" : "resume_unavailable" });
      return;
    }
    if (reconnecting) return;
    reconnects++;
    reconnecting = true;
    ready = false; // lo que se mande mientras tanto espera al socket nuevo
    connect(true).then(
      () => { reconnecting = false; },
      () => {
        reconnecting = false;
        emit({ type: "error", turnId: current, recoverable: false, code: "reconnect_failed" });
      },
    );
  }

  /** El socket activo se cerró sin que lo pidiéramos (corte de red o del proveedor). */
  function lost(): void {
    socket = null;
    ready = false;
    if (!reconnecting) reconnect();
  }

  return {
    adapter: GEMINI_LIVE_ADAPTER,
    provider: "gemini",
    model: opts.model,
    open(s) {
      setup = s;
      return connect(false);
    },
    injectContext(turns: readonly ScriptedTurn[], turnId?: string) {
      if (turns.length === 0) return;
      if (turnId !== undefined) {
        current = turnId;
        interruptedTurn = null;
      }
      send(clientContentMessage(turns));
    },
    startTurn(turnId) {
      current = turnId;
      playerTurn = turnId;
      playerText = "";
      awaitingFinal = false;
      interruptedTurn = null;
      send(ACTIVITY_START);
    },
    sendAudio(turnId, pcm16) {
      if (turnId !== playerTurn || awaitingFinal) return;
      send(audioMessage(pcm16));
    },
    endTurn(turnId) {
      if (turnId !== playerTurn || awaitingFinal) return;
      awaitingFinal = true;
      send(ACTIVITY_END);
    },
    interrupt() {
      if (!current || interruptedTurn === current) return;
      interruptedTurn = current;
      emit({ type: "interrupted", turnId: current });
    },
    close() {
      closed = true;
      queue.length = 0;
      const s = socket;
      socket = null;
      ready = false;
      if (!s || s.readyState === WebSocket.CLOSED) return Promise.resolve();
      return new Promise<void>((done) => {
        s.once("close", () => done());
        closeSafely(s, 1000, "scene closed");
        if (s.readyState === WebSocket.CLOSED) done();
      });
    },
    on(h) {
      handler = h;
    },
  };
}
