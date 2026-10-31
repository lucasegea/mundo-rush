// Read hook for ui/ (R14): ui/ does not import the store; it reads view-models through here. The store uses
// useSyncExternalStore underneath (zustand), so the subscription is safe with concurrent rendering.
import { useGameStore, type GameState } from "../store";

export const useGameView = <T>(selector: (s: GameState) => T): T => useGameStore(selector);
