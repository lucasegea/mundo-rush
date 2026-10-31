// scene-runtime conversation hooks (F5.2): the seam for systems that read the conversation turn by turn without
// touching the runtime (e.g. a scene "meters" system: rapport, knowledge). The runtime reports when a
// scene starts, each turn that enters the transcript (player and NPC, by text or voice; in voice, also what is
// heard from the player with `final: false`) and when the scene ends. Text only: never audio (D-108).
// A hook that throws (or an async hook whose promise rejects) does not cut the scene or the process: the runtime
// catches it (it runs inside the socket handlers, F5.1a lesson) and reports it via `onHookError`.
// A2 (ADR-027): the start brings the scene's conversation sheet (if it has one) and a `control` so the meters
// system can act on the scene without touching the machine: change the NPC note, send its state to the HUD and ask for closing.
import type { FichaConversacion } from "@lg/content-schema";
import type { ConversationStateMessage } from "@lg/protocol";

export interface ConversationSceneInfo {
  readonly sceneRunId: string;
  readonly accountId: string;
  readonly missionId: string;
  readonly sceneId: string;
  readonly npcId: string | null;
  /** Full name of the NPC (sheet), for the HUD. */
  readonly npcName: string | null;
  readonly modality: "voice" | "text";
  /** Meters conversation sheet of the scene (`escena.conversacion`), or null if the scene has none. */
  readonly conversation: FichaConversacion | null;
}

/** What a conversation system can do on ITS scene (only while the scene runs; afterwards it does nothing). */
export interface ConversationSceneControl {
  /**
   * Extra block of the NPC prompt (phase, open facts, goal). Replaces the previous one. In text it goes into the
   * next request; in voice, the session is reopened with the new instruction and the history on the player's next turn
   * (ADR-027 "Phase change in Live").
   */
  setNpcBrief(block: string | null): void;
  /**
   * The goal was met: the scene closes successfully on the NPC's next decision (the machine's `criteriaMet`
   * only counts in `npcTurn`, 03 §3.5.1). Decided by code, never by the NPC's model.
   */
  complete(): void;
  /** State of the meters for the HUD (no numbers: widths 0..1). */
  sendState(view: Omit<ConversationStateMessage, "type">): void;
}

export interface ConversationTurn {
  readonly sceneRunId: string;
  readonly missionId: string;
  readonly sceneId: string;
  readonly npcId: string | null;
  /** `${sceneRunId}:${turnIndex}`: the player's turn and the NPC's reply to that turn share an id. */
  readonly turnId: string;
  readonly turnIndex: number;
  readonly speaker: "player" | "npc";
  readonly text: string;
  /**
   * true: the text entered the scene transcript (already moderated). false: partial player transcription while
   * they speak (voice); it may change and is not moderated yet.
   */
  readonly final: boolean;
  readonly modality: "voice" | "text";
  /** `safe`: scripted safe line that replaced a turn cut by moderation. */
  readonly kind: "turn" | "safe";
}

export interface ConversationSceneEnd {
  readonly sceneRunId: string;
  readonly outcome: "success" | "partial" | "hardCap" | "containment" | "aborted";
  readonly criteriaMet: readonly string[];
}

/** A hook may be async: its rejected promise is reported just like an exception. */
type HookResult = void | Promise<void>;

export interface ConversationHooks {
  onSceneStart?(scene: ConversationSceneInfo, control: ConversationSceneControl): HookResult;
  onTurn?(turn: ConversationTurn): HookResult;
  onSceneEnd?(end: ConversationSceneEnd): HookResult;
  /** A hook threw an exception (the scene carried on). */
  onHookError?(message: string): void;
}

function report(hooks: ConversationHooks | undefined, err: unknown): void {
  try {
    hooks?.onHookError?.(err instanceof Error ? err.message : "error en un gancho de conversación");
  } catch {
    // the error report can't bring the scene down either
  }
}

/**
 * Calls a hook without letting its exception escape into the runtime. If the hook is async, its rejection is also caught
 * (without this, an unhandled rejected promise brings the process down in Node).
 */
export function callHook<A extends unknown[]>(hooks: ConversationHooks | undefined, fn: ((...args: A) => HookResult) | undefined, ...args: A): void {
  if (!fn) return;
  try {
    const out = fn.apply(hooks, args);
    if (out && typeof (out as Promise<void>).then === "function") (out as Promise<void>).then(undefined, (err: unknown) => report(hooks, err));
  } catch (err) {
    report(hooks, err);
  }
}
