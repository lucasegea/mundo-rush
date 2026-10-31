// Slice `companion` (03 §3.3): Lumi. Starts in its initial state; the policy arrives with F6.
export interface CompanionState {
  state: "idle" | "listening" | "speaking" | "signal" | "noted";
  /** Active signal: template id, ladder step, cached audio. */
  signal: { templateId: string; step: number; audio: string | null } | null;
  bubbleVisible: boolean;
  queue: string[];
  /** Glow derived from the total evidence (0-1). */
  glow: number;
  notedThisScene: string[];
}

/** Not persisted: derived from progression and learner. */
export const COMPANION_PERSIST = "none" as const;

export const initialCompanion = (): CompanionState => ({
  state: "idle",
  signal: null,
  bubbleVisible: false,
  queue: [],
  glow: 0,
  notedThisScene: [],
});
