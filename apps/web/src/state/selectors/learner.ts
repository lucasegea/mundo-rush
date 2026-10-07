// Selectores del slice `learner` (repaso y andamiaje llegan con F7).
import type { GameState } from "../store";

export const selectDueItems = (s: GameState): string[] => s.learner.dueItems;
