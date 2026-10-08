// Selectores del slice `ui`: view-models del shell (fase + paneles), del menú principal, del anuncio aria-live
// y del pedido de foco.
import { canEnterWorld, effectiveTier, type AppPhase, type Panel } from "@lg/core";
import type { GameState } from "../store";
import type { Announcement } from "../slices";
import { createViewSelector } from "./view";

export interface ShellView {
  phase: AppPhase;
  /** Panel visible (el de arriba de la pila) o null. */
  panel: Panel | null;
}

export const selectShellView = createViewSelector(
  (s: GameState) => [s.session.phase, s.ui.panels] as const,
  (phase, panels): ShellView => ({ phase, panel: panels[panels.length - 1] ?? null }),
);

export interface MainMenuView {
  /** El mapa está disponible con el tier efectivo (sin WebGL no). */
  worldAvailable: boolean;
  /** Ya hay una vista detrás del menú (el arranque terminó): Escape cierra el menú. */
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
