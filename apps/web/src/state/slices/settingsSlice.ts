// Slice `settings` (03 §3.3): accesibilidad, entrada, feedback, velocidad de NPC, ayuda, tier, cámara.
// Forma y saneo en @lg/core (settings/); acá solo el estado inicial.
import { DEFAULT_SETTINGS, type Settings } from "@lg/core";

export type SettingsState = Settings;

/** Servidor + copia local; el tier gráfico es solo local (03 §3.3). F1.3 hace la copia local. */
export const SETTINGS_PERSIST = "server+local" as const;

export const initialSettings = (): SettingsState => structuredClone(DEFAULT_SETTINGS);
