// Selectors of the `companion` slice (Lumi; the policy arrives with F6).
import type { GameState } from "../store";

export const selectCompanionState = (s: GameState): GameState["companion"]["state"] => s.companion.state;
