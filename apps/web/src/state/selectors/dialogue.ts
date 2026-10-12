// Selectores del slice `dialogue` (R14): el view-model del HUD de diálogo (F4.2). La UI no conoce el protocolo ni el
// glosario crudo: recibe líneas ya partidas en palabras tocables y el glosario ya filtrado por `glossaryDisplay`
// (03 §8.3, D-131). Una palabra sin entrada visible no tiene traducción (D-068): la UI ofrece marcarla.
import { glossaryKey, glossaryVisibility, HINT_CHIP_DELAY_MS, isGlossaryDisplay, plainTemplateText, tokenizeLine, type LineToken } from "@lg/core";
import type { GameState } from "../store";
import type { ConversationUi, DialogueLine, Lexicon, MicProblem } from "../slices";
import { createViewSelector } from "./view";

export interface DialogueView {
  active: boolean;
  npcId: string | null;
  state: string;
}

export const selectDialogueView = createViewSelector(
  (s: GameState) => [s.dialogue] as const,
  (d): DialogueView => ({ active: d.sceneId !== null, npcId: d.npcId, state: d.state }),
);

export interface GlossaryView {
  en: string;
  es: string;
  notes: string | null;
  /** Marca visible "borrador" (dev: reviewed/draft, D-131). */
  draft: boolean;
}

export interface HudLine {
  id: string;
  who: "npc" | "lumi" | "player" | "system";
  /** Nombre del hablante (NPC) o null (la UI pone "Vos", "Lumi"...). */
  name: string | null;
  kind: DialogueLine["kind"];
  /** Idioma del texto: las líneas de NPC son en inglés; Lumi y el sistema, en es-AR. */
  lang: "en" | "es-AR";
  text: string;
  /** Palabras tocables (solo líneas en inglés de NPC). */
  tokens: LineToken[] | null;
}

export type HudPhase = "connecting" | "offline" | "starting" | "npcSpeaking" | "yourTurn" | "passMenu" | "ended" | "blocked";

/** F5.2: qué está pasando con la voz (indicador "te escucho / pensando"). */
export type VoicePhase = "asking" | "yourTurn" | "listening" | "thinking" | "npcSpeaking";

export interface VoiceHudView {
  phase: VoicePhase;
  /** Se puede abrir el turno hablado ("Hablar"). */
  canTalk: boolean;
  /** Hay un turno hablado abierto que "Terminé" cierra. */
  canFinish: boolean;
  /** El turno se está cerrando (cola corta de audio antes del fin). */
  ending: boolean;
  /** Nivel del micrófono 0..1. */
  level: number;
  /** Lo que el servidor va oyendo (parcial). */
  heard: string | null;
  hint: "silent" | "unheard" | null;
}

export interface DialogueHudView {
  /** Con quién (null = escena sin NPC: seguir la historia con Lumi). */
  npcId: string | null;
  npcName: string | null;
  phase: HudPhase;
  /** Se puede escribir y apretar Terminé. */
  canWrite: boolean;
  /** Se puede abrir "Pasar el turno". */
  canPass: boolean;
  /** Sub-estado `waiting` (el reloj del chip de pista corre solo acá, 03 §5.5.3). */
  waiting: boolean;
  hintChipEnabled: boolean;
  /** Silencio antes del chip (D-035: 10 s; 03 §5.5.3, timer del cliente en `waiting`). */
  hintChipDelayMs: number;
  lines: HudLine[];
  outcome: string | null;
  blocked: "notIntroduced" | "noScene" | null;
  containment: { line: string; resource: { label: string; detail: string } | null; provisional: boolean } | null;
  notice: string | null;
  /** Clave de palabra → entrada visible en este build. */
  glossary: Readonly<Record<string, GlossaryView>>;
  glossaryReady: boolean;
  /** F5.2: controles de voz; null si la escena va por texto. */
  voice: VoiceHudView | null;
  /** F5.2: la escena va por texto porque no hay micrófono o permiso (mensaje claro en el HUD). */
  micProblem: MicProblem | null;
  /** F5.2: el micrófono se perdió con la escena en voz (hay que salir y volver a entrar). */
  micLost: boolean;
  /** A2 (ADR-027): medidores de la conversación libre (null en escenas guionadas). */
  conversation: ConversationUi | null;
  /** Silencio en `waiting` para subir la escalera de ayuda del lado del cliente: [pista, frases] en ms. */
  conversationHelpIdleMs: readonly [number, number];
}

/** A2: el cliente sube la ayuda sola si el jugador no dice nada (el servidor la sube por turnos sin progreso). */
export const CONVERSATION_HELP_IDLE_MS = [20000, 40000] as const;

const glossaryCache = new WeakMap<Lexicon, Record<string, GlossaryView>>();

/** Glosario visible en este build, indexado por palabra (y su plural). Lo que `glossaryVisibility` oculta no entra. */
export function visibleGlossary(lex: Lexicon): Record<string, GlossaryView> {
  const cached = glossaryCache.get(lex);
  if (cached) return cached;
  const built = buildGlossary(lex);
  glossaryCache.set(lex, built);
  return built;
}

function buildGlossary(lex: Lexicon): Record<string, GlossaryView> {
  const display = lex.glossaryDisplay;
  const out: Record<string, GlossaryView> = {};
  if (!isGlossaryDisplay(display)) return out;
  for (const e of lex.glossary) {
    const vis = glossaryVisibility(e.state, display);
    if (vis === "hidden") continue;
    const view: GlossaryView = { en: e.en, es: e.es, notes: e.notes, draft: vis === "draftMark" };
    for (const form of [e.en, e.enPlural]) {
      if (!form) continue;
      const key = glossaryKey(form);
      // Solo entradas de una palabra se tocan en un subtítulo (D-068: líneas IA traducidas por palabra).
      if (key !== "" && !/\s/.test(key) && !(key in out)) out[key] = view;
    }
  }
  return out;
}

const hudLine = (l: DialogueLine, lex: Lexicon, npcName: (id: string) => string | null): HudLine | null => {
  if (l.speaker === "LUMI") {
    // Lumi habla solo con plantillas por id (02 §2.7); sin el texto cargado, la línea no se muestra (nada inventado).
    const text = l.template ? lex.lumi[l.template] : undefined;
    return text ? { id: l.id, who: "lumi", name: null, kind: l.kind, lang: "es-AR", text: plainTemplateText(text), tokens: null } : null;
  }
  if (l.speaker === "player") return { id: l.id, who: "player", name: null, kind: l.kind, lang: "en", text: l.text ?? "", tokens: null };
  if (l.speaker === "system") return { id: l.id, who: "system", name: null, kind: l.kind, lang: "es-AR", text: "", tokens: null };
  const text = l.text ?? "";
  return { id: l.id, who: "npc", name: npcName(l.speaker), kind: l.kind, lang: "en", text, tokens: tokenizeLine(text) };
};

const voicePhaseOf = (d: GameState["dialogue"]): VoicePhase => {
  const audio = d.voice.audio;
  if (audio === "asking") return "asking";
  if (audio === "listening" || d.voice.talk !== "idle") return "listening";
  if (audio === "playing") return "npcSpeaking";
  if (audio === "ready" && d.state === "playerTurn" && (d.turnSubstate === "waiting" || d.turnSubstate === "passMenu")) return "yourTurn";
  return "thinking";
};

const voiceView = (d: GameState["dialogue"]): VoiceHudView | null => {
  if (d.modality !== "voice" || d.sceneId === null || d.voice.audio === "off" || d.voice.audio === "noPermission") return null;
  const phase = voicePhaseOf(d);
  return {
    phase,
    canTalk: phase === "yourTurn" && d.turnSubstate === "waiting" && d.voice.talk === "idle",
    canFinish: d.voice.talk === "talking",
    ending: d.voice.talk === "ending",
    level: d.voice.level,
    heard: d.voice.heard,
    hint: d.voice.turnHint,
  };
};

const phaseOf = (d: GameState["dialogue"]): HudPhase => {
  if (d.connection === "error" || (d.connection === "closed" && d.outcome === null && d.blocked === null)) return "offline";
  if (d.blocked) return "blocked";
  if (d.outcome) return "ended";
  if (d.connection !== "open") return "connecting";
  if (d.state === "playerTurn") return d.turnSubstate === "passMenu" ? "passMenu" : d.turnSubstate === "committed" ? "npcSpeaking" : "yourTurn";
  if (d.state === "idle" || d.state === "pretask") return "starting";
  return "npcSpeaking";
};

export const selectDialogueHudView = createViewSelector(
  (s: GameState) => [s.dialogue, s.world.npcs, s.settings.input.hintChip, s.ui.panels] as const,
  (d, npcs, hintChip, panels): DialogueHudView => {
    const top = panels[panels.length - 1];
    const npcId = d.npcId ?? (top?.kind === "scene" ? top.npcId : null);
    const name = (id: string): string | null => npcs.find((n) => n.id === id)?.name ?? null;
    const phase = phaseOf(d);
    const sub = d.turnSubstate;
    return {
      npcId,
      npcName: npcId ? (name(npcId) ?? npcId) : null,
      phase,
      canWrite: d.modality === "text" && phase === "yourTurn" && sub !== null && ["waiting", "speaking", "endPending"].includes(sub),
      canPass: phase === "yourTurn" && (sub === "waiting" || sub === "endPending"),
      waiting: phase === "yourTurn" && sub === "waiting",
      hintChipEnabled: hintChip,
      hintChipDelayMs: HINT_CHIP_DELAY_MS,
      lines: d.history.map((l) => hudLine(l, d.lexicon, name)).filter((l): l is HudLine => l !== null),
      outcome: d.outcome,
      blocked: d.blocked,
      containment: d.containment,
      notice: d.notice,
      glossary: visibleGlossary(d.lexicon),
      glossaryReady: d.lexicon.status === "ready",
      voice: voiceView(d),
      micProblem: d.modality === "text" ? d.voice.micProblem : null,
      micLost: d.modality === "voice" && d.sceneId !== null && d.voice.audio === "noPermission",
      conversation: d.conversation,
      conversationHelpIdleMs: CONVERSATION_HELP_IDLE_MS,
    };
  },
);

/** El servicio de escena lee esto para saber qué pedir y qué mandar. */
export const selectSceneRequest = (s: GameState) => s.dialogue.request;
export const selectSceneOutbox = (s: GameState) => s.dialogue.outbox;
export const selectLexiconStatus = (s: GameState) => s.dialogue.lexicon.status;
