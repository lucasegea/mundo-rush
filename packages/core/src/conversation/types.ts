// Types of the meters-based conversation system (ADR-027; the research report 2.3-2.5). Everything is data: the encounter is
// defined with meters in order (phase = active meter), each of a type with its "scorer" in engine.ts. The judge
// (an LLM, on the server) only LABELS each exchange with these closed lists; the code adds up.
// Imports with the .ts extension and nothing from outside the folder: the server runs it with type stripping through the subpath
// `@lg/core/conversation` (same as scene/).

/** Player dialogue acts (the judge's closed list). */
export const DIALOGUE_ACTS = [
  "greeting", "personal_question", "follow_up_question", "repeated_question", "self_disclosure", "answers_question",
  "empathy_reaction", "states_errand", "polite_request", "gives_reason", "off_topic", "out_of_frame",
] as const;
export type DialogueAct = (typeof DIALOGUE_ACTS)[number];

export const LANGUAGE_USE = ["L2", "L1", "mixed"] as const;
export type LanguageUse = (typeof LANGUAGE_USE)[number];

/** Judge safety flags: they never add up; `real_personal_data` signals to tell things about the CHARACTER. */
export const JUDGE_SAFETY = ["none", "real_personal_data", "inappropriate", "breaking_attempt"] as const;
export type JudgeSafety = (typeof JUDGE_SAFETY)[number];

export const OBJECTION_QUALITY = ["no", "partial", "yes"] as const;
export type ObjectionQuality = (typeof OBJECTION_QUALITY)[number];

/** Labels of ONE exchange (player turn + NPC reply), already sanitized by the server. */
export interface ExchangeLabels {
  readonly language: LanguageUse;
  /** 0: not understood; 1: with effort; 2: clear. */
  readonly comprehensible: 0 | 1 | 2;
  readonly acts: readonly DialogueAct[];
  /** Facts from the NPC's sheet that the NPC revealed in its reply. */
  readonly npcFacts: readonly string[];
  /** Details of the player's character that the player shared. */
  readonly playerFacts: readonly string[];
  readonly objections: readonly { readonly id: string; readonly quality: ObjectionQuality }[];
  readonly safety: JudgeSafety;
}

/**
 * Meter types. `rapport` (getting to know each other) and `request`/`persuasion` (step-based goal and objections) have a scorer;
 * `negotiation` is reserved in the schema and does not have a scorer yet (createEncounter rejects it clearly).
 */
export const METER_KINDS = ["rapport", "request", "persuasion", "negotiation"] as const;
export type MeterKind = (typeof METER_KINDS)[number];

export type Tier = 1 | 2 | 3;

export interface FactDef {
  readonly id: string;
  readonly tier: Tier;
  /** What the HUD shows in "Lo que sabés de…" (es-AR). */
  readonly label: string;
}

export interface PlayerSlotDef {
  readonly id: string;
  readonly label: string;
}

/** Rapport meter rules (initial points from report 2.5.B; calibrated in playtest). */
export interface RapportRules {
  readonly target: number;
  /** Points per new NPC fact according to its tier (1, 2, 3). */
  readonly factPoints: readonly [number, number, number];
  readonly followUp: number;
  readonly newQuestion: number;
  readonly disclosure: number;
  /** Bonus if the player shares something of their own right after the NPC revealed something. */
  readonly reciprocityBonus: number;
  readonly empathy: number;
  /** Consecutive questions without sharing anything of their own before the meter slows. */
  readonly maxQuestionsWithoutSharing: number;
  readonly maxPointsPerTurn: number;
  /** To fill, besides the points: facts learned, details shared and tiers touched. */
  readonly minFacts: number;
  readonly minShares: number;
  readonly minTiers: number;
  /** Tier opening: facts learned from the previous tier and details shared. */
  readonly unlock: { readonly tier2: UnlockRule; readonly tier3: UnlockRule };
}

export interface UnlockRule {
  readonly facts: number;
  readonly shares: number;
}

/** Goal meter step: fulfilled by a player act or a resolved NPC objection. */
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
  /** Companion hint and suggested phrases for getting to know each other, per open tier. */
  readonly rapport: { readonly hint: string; readonly phrasesByTier: Readonly<Record<Tier, readonly string[]>> };
  readonly reciprocity: { readonly hint: string; readonly phrases: readonly string[] };
  readonly earlyErrand: { readonly hint: string };
  readonly l1: { readonly hint: string };
  readonly realData: { readonly hint: string };
}

/** An encounter: the NPC, what can be found out about them, what the player can tell and the meters in order. */
export interface EncounterDef {
  readonly id: string;
  readonly npcId: string;
  readonly facts: readonly FactDef[];
  readonly playerSlots: readonly PlayerSlotDef[];
  /** In order: the first starts active; when it fills, the next one opens. */
  readonly meters: readonly MeterDef[];
  readonly help: HelpDef;
  /** Turns without progress for step 1 (hint) and step 2 (suggested phrases) of the help ladder. */
  readonly helpAfterTurns: readonly [number, number];
}

export type ConversationHelpLevel = 0 | 1 | 2;
export type EncounterNotice = "early_errand" | "real_data" | "l1" | null;

export interface MeterState {
  readonly points: number;
  readonly full: boolean;
  /** Goal meter: state of each step. */
  readonly steps: Readonly<Record<string, ObjectionQuality>>;
}

/** What to measure (report 2.5.F), per encounter. */
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
  /** Index of the active meter; = meters.length when the encounter finished. */
  readonly active: number;
  readonly meters: readonly MeterState[];
  readonly factsLearned: readonly string[];
  readonly playerShared: readonly string[];
  readonly unlockedTier: Tier;
  /** Consecutive turns with a question and without sharing anything of their own. */
  readonly questionStreak: number;
  /** Reciprocity rule active: the meter does not add up until the player shares something. */
  readonly stalled: boolean;
  /** The NPC revealed a fact in the last exchange (for the reciprocity bonus). */
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
