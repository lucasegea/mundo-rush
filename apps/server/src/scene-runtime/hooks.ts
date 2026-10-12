// Ganchos de conversación de scene-runtime (F5.2): la costura para sistemas que leen la conversación turno a turno sin
// tocar el runtime (p. ej. un sistema de "medidores" de la escena: rapport, conocimiento). El runtime avisa cuando una
// escena arranca, cada turno que entra al transcripto (jugador y NPC, por texto o por voz; en voz, también lo que se va
// oyendo del jugador con `final: false`) y cuando la escena termina. Solo texto: nunca audio (D-108).
// Un gancho que tira una excepción no corta la escena ni el proceso: el runtime lo atrapa (corre dentro de los
// manejadores de socket, lección de F5.1a) y lo reporta por `onHookError`.

export interface ConversationSceneInfo {
  readonly sceneRunId: string;
  readonly missionId: string;
  readonly sceneId: string;
  readonly npcId: string | null;
  readonly modality: "voice" | "text";
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

export interface ConversationHooks {
  onSceneStart?(scene: ConversationSceneInfo): void;
  onTurn?(turn: ConversationTurn): void;
  onSceneEnd?(end: ConversationSceneEnd): void;
  /** Un gancho tiró una excepción (la escena siguió). */
  onHookError?(message: string): void;
}

/** Llama a un gancho sin dejar que su excepción salga al runtime. */
export function callHook<A>(hooks: ConversationHooks | undefined, fn: ((arg: A) => void) | undefined, arg: A): void {
  if (!fn) return;
  try {
    fn.call(hooks, arg);
  } catch (err) {
    try {
      hooks?.onHookError?.(err instanceof Error ? err.message : "error en un gancho de conversación");
    } catch {
      // el reporte del error tampoco puede tirar la escena
    }
  }
}
