// Transient read for world/ (03 §2.3 discipline #2, R7): inside useFrame the store is read without
// subscribing or re-rendering. world/ does not import the store (§4.3): it goes through here.
import { gameStore, type GameState } from "../store";

export const readGame = <T>(selector: (s: GameState) => T): T => selector(gameStore.getState());
