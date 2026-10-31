// Selectors of the `learner` slice (review and scaffolding arrive with F7).
import type { GameState } from "../store";

export const selectDueItems = (s: GameState): string[] => s.learner.dueItems;
