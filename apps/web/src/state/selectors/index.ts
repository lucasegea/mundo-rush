// state/selectors/ — view-models con nombre (R14), un archivo por slice. ui/ y world/ leen solo de acá.
export * from "./session";
export * from "./settings";
export * from "./world";
export * from "./player";
export * from "./dialogue";
export * from "./companion";
export * from "./progression";
export * from "./learner";
export * from "./ui";
export * from "./inspect";
export { useGameView } from "./hooks";
export { readGame } from "./transient";
export type { Announcement, ConversationUi } from "../slices";
export type { GameState } from "../store";
