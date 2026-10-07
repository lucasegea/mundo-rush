// Selectores del slice `companion` (Lumi; la política llega con F6).
import type { GameState } from "../store";

export const selectCompanionState = (s: GameState): GameState["companion"]["state"] => s.companion.state;
