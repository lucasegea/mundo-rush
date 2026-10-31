// Slice `settings` (03 §3.3): accessibility, input, feedback, NPC speed, help, tier, camera.
// Shape and sanitizing in @lg/core (settings/); here only the initial state.
import { DEFAULT_SETTINGS, type Settings } from "@lg/core";

export type SettingsState = Settings;

/** Server + local copy; the graphics tier is local only (03 §3.3). F1.3 makes the local copy. */
export const SETTINGS_PERSIST = "server+local" as const;

export const initialSettings = (): SettingsState => structuredClone(DEFAULT_SETTINGS);
