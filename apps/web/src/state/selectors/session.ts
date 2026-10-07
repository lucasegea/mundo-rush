// Selectores del slice `session`.
import type { AppPhase } from "@lg/core";
import type { GameState } from "../store";

export const selectPhase = (s: GameState): AppPhase => s.session.phase;
