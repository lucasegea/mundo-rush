// NPC voice contract (P0 §4.3, 03 §5.11, ADR-023 amended by P0, D-092, D-196): `RealtimeVoiceProvider` with
// two adapters interchangeable by configuration (Gemini Live in F5.1a, cascade in F5.1b). It lives on the server and
// not in @lg/protocol: it carries PCM audio and never travels to the client.
// Contract rules:
//   1. Every event carries `turnId` (null only for session events that arrive with no open turn).
//   2. Output moderation lives in scene-runtime, not in the adapter.
//   3. The turn clip (TurnClip) is built by scene-runtime from the player's `sendAudio`; the adapter copies what it
//      sends at call time and never keeps a reference to the audio.
//   4. The shared contract test compares the SEQUENCE OF event TYPES, not the timings.

/** What scene-runtime builds to open a scene's voice session. The model and key are supplied by the adapter. */
export interface SceneVoiceSetup {
  /** The NPC's system instruction (base prompt + sheet + scene), built by the server (03 §5.4). */
  readonly systemInstruction: string;
  /** NPC voice (provider voice name, comes from models.yaml). */
  readonly voiceName: string;
  /** Conversation language (BCP-47). */
  readonly languageCode: string;
}

/** Injected context turn (already-spoken scripted opening, summary, [DIRECTOR] notes). */
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
  /** Cascade: the full NPC text BEFORE the audio. Live may not emit it. */
  | { readonly type: "npcTextFinal"; readonly turnId: string; readonly text: string }
  /** Live: incremental output transcription. */
  | { readonly type: "npcTranscript"; readonly turnId: string; readonly text: string }
  | { readonly type: "npcAudioChunk"; readonly turnId: string; readonly pcm16: Int16Array; readonly sampleRate: 24000 | 16000 }
  | { readonly type: "npcTurnDone"; readonly turnId: string }
  | { readonly type: "interrupted"; readonly turnId: string }
  /** Live: goAway (the adapter reconnects on its own); cascade: never. */
  | { readonly type: "sessionEnding"; readonly turnId: string | null; readonly secondsLeft: number | null }
  | { readonly type: "usage"; readonly turnId: string | null; readonly usage: VoiceUsage }
  /** `recoverable: false`: the session does not continue (scene-runtime moves the scene to text). */
  | { readonly type: "error"; readonly turnId: string | null; readonly recoverable: boolean; readonly code: string };

export type VoiceEventType = VoiceEvent["type"];

export interface RealtimeVoiceProvider {
  /** Adapter ("gemini-live", "cascade"): the ledger records cost per adapter. */
  readonly adapter: string;
  /** Provider and model for the ledger. They never travel to the client. */
  readonly provider: string;
  readonly model: string;
  /** Opens the session with the setup built by scene-runtime. Rejects if it could not be opened. */
  open(setup: SceneVoiceSetup): Promise<void>;
  /**
   * Injects context turns. If the last turn is the user's, the model responds (a [DIRECTOR] note) and the
   * events of that reply carry `turnId`; if it is the model's (the already-spoken opening), it generates nothing.
   */
  injectContext(turns: readonly ScriptedTurn[], turnId?: string): void;
  /** Live: activityStart; cascade: open the STT. */
  startTurn(turnId: string): void;
  sendAudio(turnId: string, pcm16: Int16Array): void;
  /** Live: activityEnd; cascade: close the STT. */
  endTurn(turnId: string): void;
  /** The player speaks over the NPC: the audio of the current turn is cut. */
  interrupt(): void;
  close(reason: CloseReason): Promise<void>;
  on(handler: (e: VoiceEvent) => void): void;
}

/** Creates a scene's adapter (one session per scene, ADR-006). */
export type VoiceProviderFactory = () => RealtimeVoiceProvider;
