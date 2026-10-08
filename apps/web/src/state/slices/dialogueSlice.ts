// Slice `dialogue` (03 §3.3): la escena abierta tal como la cuenta el servidor (F4.1) y lo que el HUD de diálogo
// (F4.2) necesita para mostrarla. Lo llena el servicio de escena (services/scene) con los mensajes del protocolo; la UI
// pide cosas con acciones, que dejan comandos en `outbox` para que el servicio los mande (R5: la red vive en services/).
import type { NpcSpeed } from "@lg/core";
import type { ClientMessage } from "@lg/protocol";

/** Una línea del historial. `template`: id de plantilla de Lumi (su texto sale del contenido, nunca del modelo). */
export interface DialogueLine {
  id: string;
  speaker: "player" | "LUMI" | "system" | (string & {});
  kind: "pretask" | "opening" | "reply" | "closing" | "exit" | "notIntroduced" | "safe" | "player" | "cut";
  text: string | null;
  template: string | null;
}

export type SceneConnection = "idle" | "connecting" | "open" | "closed" | "error";
export type SceneOutcome = "success" | "partial" | "hardCap" | "containment" | "aborted";

export interface OutboxItem {
  seq: number;
  msg: ClientMessage;
}

/** Glosario y plantillas de Lumi del contenido compilado del cliente (services/content/lexicon). */
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
  /** `glossaryDisplay` del manifiesto compilado (03 §8.3); null hasta cargar. */
  glossaryDisplay: "dev" | "release" | "fv" | null;
  glossary: GlossaryEntryInfo[];
  /** id de plantilla de Lumi → texto es-AR. */
  lumi: Record<string, string>;
}

export interface DialogueState {
  /** Pedido de escena de la UI (`seq` cambia en cada pedido); null = sin escena pedida. */
  request: { seq: number; npcId: string | null } | null;
  connection: SceneConnection;
  sceneRunId: string | null;
  missionId: string | null;
  sceneId: string | null;
  npcId: string | null;
  /** Estado de la máquina de escena (03 §3.5.1); `idle` sin escena. */
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
  /** Contención (D-112): línea fuera de la ficción + recurso; `provisional` mientras los textos no estén revisados. */
  containment: { line: string; resource: { label: string; detail: string } | null; provisional: boolean } | null;
  /** Último aviso del servidor que no corta la escena (código del protocolo). */
  notice: string | null;
  lexicon: Lexicon;
}

/** No se persiste: la escena se reanuda desde su inicio (GDD §2.16). */
export const DIALOGUE_PERSIST = "none" as const;

export const initialLexicon = (): Lexicon => ({ status: "idle", glossaryDisplay: null, glossary: [], lumi: {} });

/** Estado de una escena nueva (conserva el pedido y el léxico ya cargado). */
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
  lexicon: initialLexicon(),
});
