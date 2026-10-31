// Selectors of the `dialogue` slice (R14): the dialogue HUD's view-model (F4.2). The UI does not know the protocol or the
// raw glossary: it receives lines already split into tappable words and the glossary already filtered by `glossaryDisplay`
// (03 §8.3, D-131). A word without a visible entry has no translation (D-068): the UI offers to mark it.
import { glossaryKey, glossaryVisibility, HINT_CHIP_DELAY_MS, isGlossaryDisplay, plainTemplateText, tokenizeLine, type LineToken } from "@lg/core";
import type { NoticeCause } from "@lg/protocol";
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
  /** Visible "draft" mark (dev: reviewed/draft, D-131). */
  draft: boolean;
}

export interface HudLine {
  id: string;
  who: "npc" | "lumi" | "player" | "system";
  /** Speaker name (NPC) or null (the UI shows "You", "Lumi"...). */
  name: string | null;
  kind: DialogueLine["kind"];
  /** Language of the text: NPC lines are in English; Lumi and the system, in es-AR. */
  lang: "en" | "es-AR";
  text: string;
  /** Tappable words (only NPC English lines). */
  tokens: LineToken[] | null;
}

export type HudPhase = "connecting" | "offline" | "starting" | "npcSpeaking" | "yourTurn" | "passMenu" | "ended" | "blocked" | "failed";

/** F5.2: what is happening with the voice ("I'm listening / thinking" indicator). */
export type VoicePhase = "asking" | "yourTurn" | "listening" | "thinking" | "npcSpeaking";

export interface VoiceHudView {
  phase: VoicePhase;
  /** A spoken turn can be opened ("Speak"). */
  canTalk: boolean;
  /** A spoken turn is open and "Done" closes it. */
  canFinish: boolean;
  /** The turn is closing (short audio tail before the end). */
  ending: boolean;
  /** Microphone level 0..1. */
  level: number;
  /** What the server is hearing (partial). */
  heard: string | null;
  hint: "silent" | "unheard" | null;
}

export interface DialogueHudView {
  /** With whom (null = scene without an NPC: follow the story with Lumi). */
  npcId: string | null;
  npcName: string | null;
  phase: HudPhase;
  /** You can type and press Done. */
  canWrite: boolean;
  /** "Pass the turn" can be opened. */
  canPass: boolean;
  /** `waiting` sub-state (the hint chip's clock runs only here, 03 §5.5.3). */
  waiting: boolean;
  hintChipEnabled: boolean;
  /** Silence before the chip (D-035: 10 s; 03 §5.5.3, client timer in `waiting`). */
  hintChipDelayMs: number;
  lines: HudLine[];
  outcome: string | null;
  blocked: "notIntroduced" | "noScene" | null;
  failure: GameState["dialogue"]["failure"];
  containment: { line: string; resource: { label: string; detail: string } | null; provisional: boolean } | null;
  notice: string | null;
  /** Cause of the `model_unavailable` notice (open-world-3d T1); null without a cause. */
  noticeCause: NoticeCause | null;
  /** Word key → entry visible in this build. */
  glossary: Readonly<Record<string, GlossaryView>>;
  glossaryReady: boolean;
  /** F5.2: voice controls; null if the scene goes by text. */
  voice: VoiceHudView | null;
  /** F5.2: the scene goes by text because there is no microphone or permission (clear message in the HUD). */
  micProblem: MicProblem | null;
  /** F5.2: the microphone was lost during a voice scene (you must leave and re-enter). */
  micLost: boolean;
  /** A2 (ADR-027): free-conversation meters (null in scripted scenes). */
  conversation: ConversationUi | null;
  /** Silence in `waiting` to climb the help ladder on the client side: [hint, phrases] in ms. */
  conversationHelpIdleMs: readonly [number, number];
  /** "Reduce motion": the "your turn" dot does not pulse (plan estetica-c M4). */
  reduceMotion: boolean;
}

/** A2: the client raises help by itself if the player says nothing (the server raises it by turns without progress). */
export const CONVERSATION_HELP_IDLE_MS = [20000, 40000] as const;

const glossaryCache = new WeakMap<Lexicon, Record<string, GlossaryView>>();

/** Glossary visible in this build, indexed by word (and its plural). What `glossaryVisibility` hides does not enter. */
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
      // Only single-word entries are tappable in a subtitle (D-068: AI lines translated word by word).
      if (key !== "" && !/\s/.test(key) && !(key in out)) out[key] = view;
    }
  }
  return out;
}

const hudLine = (l: DialogueLine, lex: Lexicon, npcName: (id: string) => string | null): HudLine | null => {
  if (l.speaker === "LUMI") {
    // Lumi speaks only with templates by id (02 §2.7); without the loaded text, the line is not shown (nothing invented).
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
  if (d.failure) return "failed";
  if (d.blocked) return "blocked";
  if (d.outcome) return "ended";
  if (d.connection !== "open") return "connecting";
  if (d.state === "playerTurn") return d.turnSubstate === "passMenu" ? "passMenu" : d.turnSubstate === "committed" ? "npcSpeaking" : "yourTurn";
  if (d.state === "idle" || d.state === "pretask") return "starting";
  return "npcSpeaking";
};

export const selectDialogueHudView = createViewSelector(
  (s: GameState) => [s.dialogue, s.world.npcs, s.settings.input.hintChip, s.ui.panels, s.settings.accessibility.reduceMotion] as const,
  (d, npcs, hintChip, panels, reduceMotion): DialogueHudView => {
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
      failure: d.failure,
      containment: d.containment,
      notice: d.notice,
      noticeCause: d.noticeCause,
      glossary: visibleGlossary(d.lexicon),
      glossaryReady: d.lexicon.status === "ready",
      voice: voiceView(d),
      micProblem: d.modality === "text" ? d.voice.micProblem : null,
      micLost: d.modality === "voice" && d.sceneId !== null && d.voice.audio === "noPermission",
      conversation: d.conversation,
      conversationHelpIdleMs: CONVERSATION_HELP_IDLE_MS,
      reduceMotion,
    };
  },
);

/** The scene service reads this to know what to ask for and what to send. */
export const selectSceneRequest = (s: GameState) => s.dialogue.request;
export const selectSceneOutbox = (s: GameState) => s.dialogue.outbox;
export const selectLexiconStatus = (s: GameState) => s.dialogue.lexicon.status;

/** A character's role in the current scene (read by the world/actors animation machine, plan estetica-c M3). */
export type SceneRoleView = "habla" | "escucha" | null;

export interface SceneActivityView {
  /** The scene's NPC (null without a scene). */
  npcId: string | null;
  npc: SceneRoleView;
  player: SceneRoleView;
  /** The scene is starting: the NPC greets. */
  greet: boolean;
}

const NO_ACTIVITY: SceneActivityView = { npcId: null, npc: null, player: null, greet: false };

/**
 * Who speaks and who listens: the NPC speaks while saying their line and listens on the player's turn; the player speaks
 * with the microphone open. M3 SEAM: the gestures the dialogue asks for (nod, shake head, think, be surprised, give something)
 * enter here when the protocol sends them; today the only request is the greeting at the start.
 */
let lastActivity: SceneActivityView = NO_ACTIVITY;
const sameActivity = (a: SceneActivityView, b: SceneActivityView): boolean =>
  a.npcId === b.npcId && a.npc === b.npc && a.player === b.player && a.greet === b.greet;

export const selectSceneActivity = createViewSelector(
  (s: GameState) => [s.dialogue] as const,
  (d): SceneActivityView => {
    let next = NO_ACTIVITY;
    if (d.sceneId !== null && d.npcId !== null) {
      const phase = phaseOf(d);
      const npc: SceneRoleView = phase === "npcSpeaking" ? "habla" : phase === "yourTurn" || phase === "passMenu" ? "escucha" : null;
      const player: SceneRoleView = voicePhaseOf(d) === "listening" && voiceView(d) !== null ? "habla" : phase === "npcSpeaking" ? "escucha" : null;
      next = { npcId: d.npcId, npc, player, greet: phase === "starting" };
    }
    // The microphone level changes many times per second: the same activity returns the same object (no re-render).
    if (!sameActivity(next, lastActivity)) lastActivity = next;
    return lastActivity;
  },
);
