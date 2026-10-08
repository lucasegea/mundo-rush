// Selectores del slice `settings`: tier efectivo (R12) y view-models de Ajustes y del documento.
import {
  effectiveTier, FEEDBACK_MODES, NPC_SPEEDS, SELECTABLE_TIERS, TEXT_SCALES,
  type FeedbackMode, type NpcSpeed, type SelectableTier, type TextScale, type TierChoice,
} from "@lg/core";
import type { GameState } from "../store";
import { createViewSelector } from "./view";

/** Tier efectivo. Nunca `xr` (R12): lo garantiza effectiveTier del núcleo. */
export const selectEffectiveTier = (s: GameState): SelectableTier =>
  effectiveTier(s.settings.graphics.tier, s.settings.graphics.suggestedTier);

export interface SettingsView {
  textScale: TextScale;
  textScales: readonly TextScale[];
  highContrast: boolean;
  reduceMotion: boolean;
  subtitles: boolean;
  /** Chip de pista a los 10 s (D-035). */
  hintChip: boolean;
  npcSpeed: NpcSpeed;
  npcSpeeds: readonly NpcSpeed[];
  feedbackMode: FeedbackMode;
  feedbackModes: readonly FeedbackMode[];
  tierChoice: TierChoice;
  tierChoices: readonly TierChoice[];
  suggestedTier: SelectableTier;
  effectiveTier: SelectableTier;
  /** Sin WebGL la elección manual no cambia nada: la UI lo explica. */
  tierLocked: boolean;
}

const TIER_CHOICES: readonly TierChoice[] = ["auto", ...SELECTABLE_TIERS];

export const selectSettingsView = createViewSelector(
  (s: GameState) => [s.settings] as const,
  (settings): SettingsView => {
    const a = settings.accessibility;
    const tier = effectiveTier(settings.graphics.tier, settings.graphics.suggestedTier);
    return {
      textScale: a.textScale,
      textScales: TEXT_SCALES,
      highContrast: a.highContrast,
      reduceMotion: a.reduceMotion,
      subtitles: a.subtitles,
      hintChip: settings.input.hintChip,
      npcSpeed: settings.npcSpeed,
      npcSpeeds: NPC_SPEEDS,
      feedbackMode: settings.feedbackMode,
      feedbackModes: FEEDBACK_MODES,
      tierChoice: settings.graphics.tier,
      tierChoices: TIER_CHOICES,
      suggestedTier: settings.graphics.suggestedTier,
      effectiveTier: tier,
      tierLocked: settings.graphics.suggestedTier === "dialog-only",
    };
  },
);

export interface DocumentSettingsView {
  /** Escala del texto raíz (1 = 100 %). */
  fontScale: number;
  highContrast: boolean;
  reduceMotion: boolean;
  font: "legible" | "dyslexia";
}

export const selectDocumentSettings = createViewSelector(
  (s: GameState) => [s.settings.accessibility] as const,
  (a): DocumentSettingsView => ({ fontScale: a.textScale / 100, highContrast: a.highContrast, reduceMotion: a.reduceMotion, font: a.font }),
);
