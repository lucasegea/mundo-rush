// Selectors of the `ui` slice: view-models of the shell (phase + panels), the main menu, the aria-live announcement
// and the focus request.
import { canEnterWorld, effectiveTier, type AppPhase, type Panel } from "@lg/core";
import type { GameState } from "../store";
import type { Announcement } from "../slices";
import { createViewSelector } from "./view";

export interface ShellView {
  phase: AppPhase;
  /** Visible panel (the top of the stack) or null. */
  panel: Panel | null;
}

export const selectShellView = createViewSelector(
  (s: GameState) => [s.session.phase, s.ui.panels] as const,
  (phase, panels): ShellView => ({ phase, panel: panels[panels.length - 1] ?? null }),
);

export interface MainMenuView {
  /** The map is available with the effective tier (not without WebGL). */
  worldAvailable: boolean;
  /** There is already a view behind the menu (startup finished): Escape closes the menu. */
  canClose: boolean;
}

export const selectMainMenuView = createViewSelector(
  (s: GameState) => [s.settings.graphics, s.session.phase] as const,
  (graphics, phase): MainMenuView => ({
    worldAvailable: canEnterWorld(effectiveTier(graphics.tier, graphics.suggestedTier)),
    canClose: phase !== "boot",
  }),
);

export const selectAnnouncement = (s: GameState): Announcement | null => s.ui.announcement;

export const selectFocusRequest = (s: GameState): string | null => s.ui.focusRequest;
