// Contrato de voz del NPC (P0 §4.3, 03 §5.11, ADR-023 enmendado por P0, D-092, D-196): `RealtimeVoiceProvider` con
// dos adaptadores intercambiables por configuración (Gemini Live en F5.1a, cascada en F5.1b). Vive en el servidor y
// no en @lg/protocol: lleva audio PCM y nunca viaja al cliente.
// Reglas del contrato:
//   1. Todo evento lleva `turnId` (null solo en eventos de sesión que llegan sin turno abierto).
//   2. La moderación de salida vive en scene-runtime, no en el adaptador.
//   3. El clip del turno (TurnClip) lo arma scene-runtime con los `sendAudio` del jugador; el adaptador copia lo que
//      envía en el momento de la llamada y nunca guarda una referencia al audio.
//   4. El test de contrato compartido compara la SECUENCIA DE TIPOS de evento, no los tiempos.

/** Lo que scene-runtime arma para abrir la sesión de voz de una escena. El modelo y la clave los pone el adaptador. */
export interface SceneVoiceSetup {
  /** Instrucción de sistema del NPC (prompt base + ficha + escena), armada por el servidor (03 §5.4). */
  readonly systemInstruction: string;
  /** Voz del NPC (nombre de voz del proveedor, sale de models.yaml). */
  readonly voiceName: string;
  /** Idioma de la conversación (BCP-47). */
  readonly languageCode: string;
}

/** Turno de contexto inyectado (apertura guionada ya dicha, resumen, notas [DIRECTOR]). */
export interface ScriptedTurn {
  readonly role: "user" | "model";
  readonly text: string;
}

export type CloseReason = "done" | "hardCap" | "abort" | "error";

export type VoiceUsage =
  | { readonly kind: "tokens"; readonly audioIn: number; readonly audioOut: number; readonly textIn: number; readonly textOut: number }
  | { readonly kind: "cascade"; readonly sttSeconds: number; readonly textIn: number; readonly textOut: number; readonly ttsChars: number };

export type VoiceEvent =
  | { readonly type: "playerTranscriptPartial"; readonly turnId: string; readonly text: string }
  | { readonly type: "playerTranscriptFinal"; readonly turnId: string; readonly text: string }
  /** Cascada: el texto completo del NPC ANTES del audio. Live puede no emitirlo. */
  | { readonly type: "npcTextFinal"; readonly turnId: string; readonly text: string }
  /** Live: transcripción de salida incremental. */
  | { readonly type: "npcTranscript"; readonly turnId: string; readonly text: string }
  | { readonly type: "npcAudioChunk"; readonly turnId: string; readonly pcm16: Int16Array; readonly sampleRate: 24000 | 16000 }
  | { readonly type: "npcTurnDone"; readonly turnId: string }
  | { readonly type: "interrupted"; readonly turnId: string }
  /** Live: goAway (el adaptador se reconecta solo); cascada: nunca. */
  | { readonly type: "sessionEnding"; readonly turnId: string | null; readonly secondsLeft: number | null }
  | { readonly type: "usage"; readonly turnId: string | null; readonly usage: VoiceUsage }
  /** `recoverable: false`: la sesión no sigue (scene-runtime pasa la escena a texto). */
  | { readonly type: "error"; readonly turnId: string | null; readonly recoverable: boolean; readonly code: string };

export type VoiceEventType = VoiceEvent["type"];

export interface RealtimeVoiceProvider {
  /** Adaptador ("gemini-live", "cascade"): el ledger registra el costo por adaptador. */
  readonly adapter: string;
  /** Proveedor y modelo para el ledger. Nunca viajan al cliente. */
  readonly provider: string;
  readonly model: string;
  /** Abre la sesión con el setup armado por scene-runtime. Rechaza si no se pudo abrir. */
  open(setup: SceneVoiceSetup): Promise<void>;
  /**
   * Inyecta turnos de contexto. Si el último turno es del usuario, el modelo responde (una nota [DIRECTOR]) y los
   * eventos de esa respuesta llevan `turnId`; si es del modelo (la apertura ya dicha), no genera nada.
   */
  injectContext(turns: readonly ScriptedTurn[], turnId?: string): void;
  /** Live: activityStart; cascada: abrir el STT. */
  startTurn(turnId: string): void;
  sendAudio(turnId: string, pcm16: Int16Array): void;
  /** Live: activityEnd; cascada: cerrar el STT. */
  endTurn(turnId: string): void;
  /** El jugador habla encima del NPC: se corta el audio del turno en curso. */
  interrupt(): void;
  close(reason: CloseReason): Promise<void>;
  on(handler: (e: VoiceEvent) => void): void;
}

/** Crea el adaptador de una escena (una sesión por escena, ADR-006). */
export type VoiceProviderFactory = () => RealtimeVoiceProvider;
