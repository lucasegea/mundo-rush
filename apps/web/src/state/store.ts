// state/store.ts — slice composition (03 §3.3, ADR-003). A single store; the top-level keys are
// EXACTLY the 9 slices (contract; no economy, construction, currency or streak, D-018). Actions do not
// live in the state: they are in action slices (state/actions.ts) and delegate the rules to @lg/core.
// Middleware: subscribeWithSelector (services subscribe to a part). No `persist` (03 §2.5).
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  initialCompanion, initialDialogue, initialLearner, initialPlayer, initialProgression, initialSession,
  initialSettings, initialUi, initialWorld,
  type CompanionState, type DialogueState, type LearnerState, type PlayerState, type ProgressionState,
  type SessionState, type SettingsState, type UiState, type WorldState,
} from "./slices";

export interface GameState {
  session: SessionState;
  settings: SettingsState;
  world: WorldState;
  player: PlayerState;
  dialogue: DialogueState;
  companion: CompanionState;
  progression: ProgressionState;
  learner: LearnerState;
  ui: UiState;
}

/** The 9 slices of 03 §3.3, in the table's order. */
export const SLICE_NAMES = [
  "session", "settings", "world", "player", "dialogue", "companion", "progression", "learner", "ui",
] as const satisfies readonly (keyof GameState)[];

export const initialGameState = (): GameState => ({
  session: initialSession(),
  settings: initialSettings(),
  world: initialWorld(),
  player: initialPlayer(),
  dialogue: initialDialogue(),
  companion: initialCompanion(),
  progression: initialProgression(),
  learner: initialLearner(),
  ui: initialUi(),
});

/** A new store (tests create one per case; the app uses `gameStore`). */
export const createGameStore = (initial: GameState = initialGameState()) =>
  createStore<GameState>()(subscribeWithSelector(() => initial));

export type GameStore = ReturnType<typeof createGameStore>;

/** The app's single store. */
export const gameStore: GameStore = createGameStore();

/** React hook over the single store. Only state/selectors/ uses it (ui/ does not import this file, R14). */
export const useGameStore = <T>(selector: (s: GameState) => T): T => useStore(gameStore, selector);
