// Selectors of the `settings` slice: effective tier (R12) and view-models for Settings and the document.
import {
  effectiveTier, FEEDBACK_MODES, NPC_SPEEDS, SELECTABLE_TIERS, TEXT_SCALES,
  type FeedbackMode, type NpcSpeed, type SelectableTier, type TextScale, type TierChoice,
} from "@lg/core";
import type { GameState } from "../store";
import { createViewSelector } from "./view";

/** Effective tier. Never `xr` (R12): guaranteed by the core's effectiveTier. */
export const selectEffectiveTier = (s: GameState): SelectableTier =>
  effectiveTier(s.settings.graphics.tier, s.settings.graphics.suggestedTier);

export interface SettingsView {
  textScale: TextScale;
  textScales: readonly TextScale[];
  highContrast: boolean;
  reduceMotion: boolean;
  subtitles: boolean;
  /** Hint chip at 10 s (D-035). */
  hintChip: boolean;
  npcSpeed: NpcSpeed;
  npcSpeeds: readonly NpcSpeed[];
  feedbackMode: FeedbackMode;
  feedbackModes: readonly FeedbackMode[];
  tierChoice: TierChoice;
  tierChoices: readonly TierChoice[];
  suggestedTier: SelectableTier;
  effectiveTier: SelectableTier;
  /** Without WebGL the manual choice changes nothing: the UI explains it. */
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
  /** Root text scale (1 = 100 %). */
  fontScale: number;
  highContrast: boolean;
  reduceMotion: boolean;
  font: "legible" | "dyslexia";
}

export const selectDocumentSettings = createViewSelector(
  (s: GameState) => [s.settings.accessibility] as const,
  (a): DocumentSettingsView => ({ fontScale: a.textScale / 100, highContrast: a.highContrast, reduceMotion: a.reduceMotion, font: a.font }),
);
