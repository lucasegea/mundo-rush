// Slice `learner` (03 §3.3): review bank, error patterns, scaffolding. Initial state (F7).
export interface LearnerState {
  reviewBank: { id: string; box: number; dueAt: string | null }[];
  errorPatterns: { key: string; type: string; count: number; systematic: boolean }[];
  /** Scaffolding level 1-5 and signal window of the last 3 scenes. */
  scaffoldLevel: 1 | 2 | 3 | 4 | 5;
  scaffoldWindow: string[];
  dueItems: string[];
  /** Words marked for review from the HUD (D-068). They go to the F7 notebook; today they live in the session. */
  marked: string[];
}

export const LEARNER_PERSIST = "server" as const;

export const initialLearner = (): LearnerState => ({
  reviewBank: [],
  errorPatterns: [],
  scaffoldLevel: 1,
  scaffoldWindow: [],
  dueItems: [],
  marked: [],
});
