// Tipos del sistema de conversación por medidores (ADR-027; informe de investigación 2.3-2.5). Todo es dato: el encuentro se
// define con medidores en orden (fase = medidor activo), cada uno de un tipo con su "puntuador" en engine.ts. El juez
// (un LLM, en el servidor) solo ETIQUETA cada intercambio con estas listas cerradas; el código suma.
// Importa con extensión .ts y sin nada de fuera de la carpeta: el servidor lo corre con type stripping por la subruta
// `@lg/core/conversation` (igual que scene/).

/** Actos de diálogo del jugador (lista cerrada del juez). */
export const DIALOGUE_ACTS = [
  "greeting", "personal_question", "follow_up_question", "repeated_question", "self_disclosure", "answers_question",
  "empathy_reaction", "states_errand", "polite_request", "gives_reason", "off_topic", "out_of_frame",
] as const;
export type DialogueAct = (typeof DIALOGUE_ACTS)[number];

export const LANGUAGE_USE = ["L2", "L1", "mixed"] as const;
export type LanguageUse = (typeof LANGUAGE_USE)[number];

/** Banderas de seguridad del juez: nunca suman; `real_personal_data` avisa que se cuente lo del PERSONAJE. */
export const JUDGE_SAFETY = ["none", "real_personal_data", "inappropriate", "breaking_attempt"] as const;
export type JudgeSafety = (typeof JUDGE_SAFETY)[number];

export const OBJECTION_QUALITY = ["no", "partial", "yes"] as const;
export type ObjectionQuality = (typeof OBJECTION_QUALITY)[number];

/** Etiquetas de UN intercambio (turno del jugador + respuesta del NPC), ya saneadas por el servidor. */
export interface ExchangeLabels {
  readonly language: LanguageUse;
  /** 0: no se entiende; 1: con esfuerzo; 2: claro. */
  readonly comprehensible: 0 | 1 | 2;
  readonly acts: readonly DialogueAct[];
  /** Hechos de la ficha del NPC que el NPC reveló en su respuesta. */
  readonly npcFacts: readonly string[];
  /** Datos del personaje del jugador que el jugador compartió. */
  readonly playerFacts: readonly string[];
  readonly objections: readonly { readonly id: string; readonly quality: ObjectionQuality }[];
  readonly safety: JudgeSafety;
}

/**
 * Tipos de medidor. `rapport` (conocerse) y `request`/`persuasion` (objetivo por pasos y objeciones) tienen puntuador;
 * `negotiation` está reservado en el esquema y todavía no tiene puntuador (createEncounter lo rechaza claro).
 */
export const METER_KINDS = ["rapport", "request", "persuasion", "negotiation"] as const;
export type MeterKind = (typeof METER_KINDS)[number];

export type Tier = 1 | 2 | 3;

export interface FactDef {
  readonly id: string;
  readonly tier: Tier;
  /** Lo que el HUD muestra en "Lo que sabés de…" (es-AR). */
  readonly label: string;
}

export interface PlayerSlotDef {
  readonly id: string;
  readonly label: string;
}

/** Reglas del medidor de rapport (puntos iniciales del informe 2.5.B; se calibran en playtest). */
export interface RapportRules {
  readonly target: number;
  /** Puntos por hecho nuevo del NPC según su nivel (1, 2, 3). */
  readonly factPoints: readonly [number, number, number];
  readonly followUp: number;
  readonly newQuestion: number;
  readonly disclosure: number;
  /** Bono si el jugador cuenta algo propio justo después de que el NPC reveló algo. */
  readonly reciprocityBonus: number;
  readonly empathy: number;
  /** Preguntas seguidas sin contar nada propio antes de que el medidor se frene. */
  readonly maxQuestionsWithoutSharing: number;
  readonly maxPointsPerTurn: number;
  /** Para llenarse además de los puntos: hechos aprendidos, datos compartidos y niveles tocados. */
  readonly minFacts: number;
  readonly minShares: number;
  readonly minTiers: number;
  /** Apertura de niveles: hechos aprendidos del nivel anterior y datos compartidos. */
  readonly unlock: { readonly tier2: UnlockRule; readonly tier3: UnlockRule };
}

export interface UnlockRule {
  readonly facts: number;
  readonly shares: number;
}

/** Paso del medidor de objetivo: lo cumple un acto del jugador o una objeción del NPC resuelta. */
export interface GoalStepDef {
  readonly id: string;
  readonly label: string;
  readonly points: number;
  readonly required: boolean;
  readonly signal: { readonly act: DialogueAct } | { readonly objection: string };
  readonly hint: string | null;
  readonly phrases: readonly string[];
}

export interface RapportMeterDef {
  readonly kind: "rapport";
  readonly id: string;
  readonly label: string;
  readonly rules: RapportRules;
}

export interface GoalMeterDef {
  readonly kind: "request" | "persuasion" | "negotiation";
  readonly id: string;
  readonly label: string;
  readonly steps: readonly GoalStepDef[];
  readonly hint: string | null;
}

export type MeterDef = RapportMeterDef | GoalMeterDef;

export interface HelpDef {
  /** Pista del compañero y frases sugeridas para conocerse, por nivel abierto. */
  readonly rapport: { readonly hint: string; readonly phrasesByTier: Readonly<Record<Tier, readonly string[]>> };
  readonly reciprocity: { readonly hint: string; readonly phrases: readonly string[] };
  readonly earlyErrand: { readonly hint: string };
  readonly l1: { readonly hint: string };
  readonly realData: { readonly hint: string };
}

/** Un encuentro: el NPC, lo que se puede averiguar de él, lo que el jugador puede contar y los medidores en orden. */
export interface EncounterDef {
  readonly id: string;
  readonly npcId: string;
  readonly facts: readonly FactDef[];
  readonly playerSlots: readonly PlayerSlotDef[];
  /** En orden: el primero arranca activo; al llenarse, se abre el siguiente. */
  readonly meters: readonly MeterDef[];
  readonly help: HelpDef;
  /** Turnos sin progreso para el escalón 1 (pista) y el 2 (frases sugeridas) de la escalera de ayuda. */
  readonly helpAfterTurns: readonly [number, number];
}

export type ConversationHelpLevel = 0 | 1 | 2;
export type EncounterNotice = "early_errand" | "real_data" | "l1" | null;

export interface MeterState {
  readonly points: number;
  readonly full: boolean;
  /** Medidor de objetivo: estado de cada paso. */
  readonly steps: Readonly<Record<string, ObjectionQuality>>;
}

/** Qué medir (informe 2.5.F), por encuentro. */
export interface EncounterStats {
  readonly exchanges: number;
  readonly l2Turns: number;
  readonly l1Turns: number;
  readonly questions: number;
  readonly followUps: number;
  readonly disclosures: number;
  readonly stalls: number;
  readonly helpShown: number;
}

export interface EncounterState {
  /** Índice del medidor activo; = meters.length cuando el encuentro terminó. */
  readonly active: number;
  readonly meters: readonly MeterState[];
  readonly factsLearned: readonly string[];
  readonly playerShared: readonly string[];
  readonly unlockedTier: Tier;
  /** Turnos seguidos con pregunta y sin contar nada propio. */
  readonly questionStreak: number;
  /** Regla de reciprocidad activa: el medidor no suma hasta que el jugador comparta algo. */
  readonly stalled: boolean;
  /** El NPC reveló un hecho en el último intercambio (para el bono de reciprocidad). */
  readonly npcJustRevealed: boolean;
  readonly quietTurns: number;
  readonly help: ConversationHelpLevel;
  readonly notice: EncounterNotice;
  readonly stats: EncounterStats;
}

export type EncounterEvent =
  | { readonly type: "points"; readonly meter: string; readonly delta: number }
  | { readonly type: "factLearned"; readonly id: string }
  | { readonly type: "playerShared"; readonly id: string }
  | { readonly type: "tierUnlocked"; readonly tier: Tier }
  | { readonly type: "stalled" }
  | { readonly type: "unstalled" }
  | { readonly type: "stepDone"; readonly meter: string; readonly step: string; readonly quality: ObjectionQuality }
  | { readonly type: "phaseChanged"; readonly from: string; readonly to: string | null }
  | { readonly type: "complete" }
  | { readonly type: "safety"; readonly flag: JudgeSafety };
