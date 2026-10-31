// Slice `dialogue` (03 §3.3): the open scene as the server tells it (F4.1) and what the dialogue HUD
// (F4.2) needs to display it. Filled by the scene service (services/scene) with the protocol messages; the UI
// asks for things with actions, which leave commands in `outbox` for the service to send (R5: the network lives in services/).
import type { NpcSpeed } from "@lg/core";
import type { ClientMessage, ConversationStateMessage, NoticeCause } from "@lg/protocol";

/** A history line. `template`: Lumi template id (its text comes from the content, never from the model). */
export interface DialogueLine {
  id: string;
  speaker: "player" | "LUMI" | "system" | (string & {});
  kind: "pretask" | "opening" | "reply" | "closing" | "exit" | "notIntroduced" | "safe" | "player" | "cut";
  text: string | null;
  template: string | null;
}

export type SceneConnection = "idle" | "connecting" | "open" | "closed" | "error";

/** Client audio state (F5.2): computed by the services/audio/machine.ts machine. */
export type AudioState = "off" | "asking" | "noPermission" | "ready" | "listening" | "thinking" | "playing";
/** Why there is no voice on the client side: the scene goes by text with a clear message. */
export type MicProblem = "denied" | "noDevice" | "unsupported" | "failed";

/** The player's voice in the HUD (F5.2). services/audio writes it through actions; the UI reads it through selectors. */
export interface VoiceUi {
  audio: AudioState;
  micProblem: MicProblem | null;
  /** Microphone level 0..1 (check meter). */
  level: number;
  /** Player intent: spoken turn open or closing (services/audio sends the end after a short tail). */
  talk: "idle" | "talking" | "ending";
  /** What the server is hearing of the current turn (partial transcript). */
  heard: string | null;
  /** Notice from the last turn: the microphone picked up no voice, or the server understood nothing. */
  turnHint: "silent" | "unheard" | null;
}

export const initialVoiceUi = (): VoiceUi => ({ audio: "off", micProblem: null, level: 0, talk: "idle", heard: null, turnHint: null });
export type SceneOutcome = "success" | "partial" | "hardCap" | "containment" | "aborted";

export interface OutboxItem {
  seq: number;
  msg: ClientMessage;
}

/** Lumi glossary and templates from the client's compiled content (services/content/lexicon). */
export interface GlossaryEntryInfo {
  id: string;
  en: string;
  enPlural: string | null;
  es: string;
  notes: string | null;
  state: "draft" | "reviewed" | "approved";
}

export interface Lexicon {
  status: "idle" | "loading" | "ready" | "error";
  /** `glossaryDisplay` from the compiled manifest (03 §8.3); null until loaded. */
  glossaryDisplay: "dev" | "release" | "fv" | null;
  glossary: GlossaryEntryInfo[];
  /** Lumi template id → es-AR text. */
  lumi: Record<string, string>;
}

/** A2 (ADR-027): meter-based conversation state as the server sends it (no numbers: widths 0..1). */
export type ConversationUi = Omit<ConversationStateMessage, "type">;

export interface DialogueState {
  /** Scene request from the UI (`seq` changes on every request); null = no scene requested. */
  request: { seq: number; npcId: string | null } | null;
  connection: SceneConnection;
  sceneRunId: string | null;
  missionId: string | null;
  sceneId: string | null;
  npcId: string | null;
  /** Scene machine state (03 §3.5.1); `idle` without a scene. */
  state: string;
  turnSubstate: string | null;
  turnIndex: number;
  modality: "voice" | "text";
  history: DialogueLine[];
  subtitles: { final: string[]; partial: string | null };
  lastNpcLine: string | null;
  effectiveSpeed: NpcSpeed | null;
  silenceMenuOpen: boolean;
  hintChipVisible: boolean;
  suggestedOptions: string[];
  criteriaProgress: number;
  textFallbackReason: string | null;
  outbox: OutboxItem[];
  outboxSeq: number;
  blocked: "notIntroduced" | "noScene" | null;
  outcome: SceneOutcome | null;
  /** Containment (D-112): out-of-fiction line + resource; `provisional` while the texts are not reviewed. */
  containment: { line: string; resource: { label: string; detail: string } | null; provisional: boolean } | null;
  /** Last server notice that does not end the scene (protocol code). */
  notice: string | null;
  /** Structured cause of the NPC's last `model_unavailable` (open-world-3d T1); null if the notice carried no cause. */
  noticeCause: NoticeCause | null;
  lexicon: Lexicon;
  /** F5.2: player voice (microphone, spoken turn, meter). */
  voice: VoiceUi;
  /** A2: free-conversation scene meters (null in scripted scenes). */
  conversation: ConversationUi | null;
}

/** Not persisted: the scene resumes from its start (GDD §2.16). */
export const DIALOGUE_PERSIST = "none" as const;

export const initialLexicon = (): Lexicon => ({ status: "idle", glossaryDisplay: null, glossary: [], lumi: {} });

/** State of a new scene (keeps the request and the already loaded lexicon). */
export const freshScene = (d: DialogueState): DialogueState => ({ ...initialDialogue(), request: d.request, lexicon: d.lexicon, outboxSeq: d.outboxSeq });

export const initialDialogue = (): DialogueState => ({
  request: null,
  connection: "idle",
  sceneRunId: null,
  missionId: null,
  sceneId: null,
  npcId: null,
  state: "idle",
  turnSubstate: null,
  turnIndex: 0,
  modality: "voice",
  history: [],
  subtitles: { final: [], partial: null },
  lastNpcLine: null,
  effectiveSpeed: null,
  silenceMenuOpen: false,
  hintChipVisible: false,
  suggestedOptions: [],
  criteriaProgress: 0,
  textFallbackReason: null,
  outbox: [],
  outboxSeq: 0,
  blocked: null,
  outcome: null,
  containment: null,
  notice: null,
  noticeCause: null,
  lexicon: initialLexicon(),
  voice: initialVoiceUi(),
  conversation: null,
});
