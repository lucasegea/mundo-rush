// Ganchos de conversación de scene-runtime (F5.2): la costura para sistemas que leen la conversación turno a turno sin
// tocar el runtime (p. ej. un sistema de "medidores" de la escena: rapport, conocimiento). El runtime avisa cuando una
// escena arranca, cada turno que entra al transcripto (jugador y NPC, por texto o por voz; en voz, también lo que se va
// oyendo del jugador con `final: false`) y cuando la escena termina. Solo texto: nunca audio (D-108).
// Un gancho que tira una excepción (o un gancho async cuya promesa rechaza) no corta la escena ni el proceso: el runtime
// lo atrapa (corre dentro de los manejadores de socket, lección de F5.1a) y lo reporta por `onHookError`.
// A2 (ADR-027): el arranque trae la ficha de conversación de la escena (si tiene) y un `control` para que el sistema de
// medidores actúe sobre la escena sin tocar la máquina: cambiar la nota del NPC, mandar su estado al HUD y pedir el cierre.
import type { FichaConversacion } from "@lg/content-schema";
import type { ConversationStateMessage } from "@lg/protocol";

export interface ConversationSceneInfo {
  readonly sceneRunId: string;
  readonly accountId: string;
  readonly missionId: string;
  readonly sceneId: string;
  readonly npcId: string | null;
  /** Nombre completo del NPC (ficha), para el HUD. */
  readonly npcName: string | null;
  readonly modality: "voice" | "text";
  /** Ficha de conversación por medidores de la escena (`escena.conversacion`), o null si la escena no tiene. */
  readonly conversation: FichaConversacion | null;
}

/** Lo que un sistema de conversación puede hacer sobre SU escena (solo mientras la escena corre; después no hace nada). */
export interface ConversationSceneControl {
  /**
   * Bloque extra del prompt del NPC (fase, hechos abiertos, objetivo). Reemplaza al anterior. En texto entra en el
   * próximo pedido; en voz, la sesión se reabre con la instrucción nueva y el historial en el próximo turno del jugador
   * (ADR-027 "Cambio de fase en Live").
   */
  setNpcBrief(block: string | null): void;
  /**
   * El objetivo se cumplió: la escena cierra con éxito en la próxima decisión del NPC (el `criteriaMet` de la máquina
   * solo vale en `npcTurn`, 03 §3.5.1). Lo decide el código, nunca el modelo del NPC.
   */
  complete(): void;
  /** Estado de los medidores para el HUD (sin números: anchos 0..1). */
  sendState(view: Omit<ConversationStateMessage, "type">): void;
}

export interface ConversationTurn {
  readonly sceneRunId: string;
  readonly missionId: string;
  readonly sceneId: string;
  readonly npcId: string | null;
  /** `${sceneRunId}:${turnIndex}`: el turno del jugador y la respuesta del NPC a ese turno comparten id. */
  readonly turnId: string;
  readonly turnIndex: number;
  readonly speaker: "player" | "npc";
  readonly text: string;
  /**
   * true: el texto entró al transcripto de la escena (ya moderado). false: transcripción parcial del jugador mientras
   * habla (voz); puede cambiar y no se modera todavía.
   */
  readonly final: boolean;
  readonly modality: "voice" | "text";
  /** `safe`: línea segura guionada que reemplazó un turno cortado por la moderación. */
  readonly kind: "turn" | "safe";
}

export interface ConversationSceneEnd {
  readonly sceneRunId: string;
  readonly outcome: "success" | "partial" | "hardCap" | "containment" | "aborted";
  readonly criteriaMet: readonly string[];
}

/** Un gancho puede ser async: su promesa rechazada se reporta igual que una excepción. */
type HookResult = void | Promise<void>;

export interface ConversationHooks {
  onSceneStart?(scene: ConversationSceneInfo, control: ConversationSceneControl): HookResult;
  onTurn?(turn: ConversationTurn): HookResult;
  onSceneEnd?(end: ConversationSceneEnd): HookResult;
  /** Un gancho tiró una excepción (la escena siguió). */
  onHookError?(message: string): void;
}

function report(hooks: ConversationHooks | undefined, err: unknown): void {
  try {
    hooks?.onHookError?.(err instanceof Error ? err.message : "error en un gancho de conversación");
  } catch {
    // el reporte del error tampoco puede tirar la escena
  }
}

/**
 * Llama a un gancho sin dejar que su excepción salga al runtime. Si el gancho es async, su rechazo también se atrapa
 * (sin esto, una promesa rechazada sin manejar tira el proceso en Node).
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
