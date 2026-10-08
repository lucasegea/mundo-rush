// Fase de la app y pila de paneles del shell (slices `session` y `ui`, 03 §3.3). Reglas puras.
import type { SelectableTier } from "../quality/tiers";

/** Fase de la app (03 §3.3, slice `session`). */
export const APP_PHASES = ["boot", "onboarding", "world", "scene", "notebook", "dialogOnly"] as const;
export type AppPhase = (typeof APP_PHASES)[number];

/** Al terminar el arranque: sin WebGL (o con `dialog-only` elegido) se juega en solo-diálogo (§2.7.2.1). */
export function phaseAfterBoot(tier: SelectableTier): AppPhase {
  return tier === "dialog-only" ? "dialogOnly" : "world";
}

/** Se puede pasar al mapa solo si el tier efectivo lo permite. */
export function canEnterWorld(tier: SelectableTier): boolean {
  return tier !== "dialog-only";
}

/**
 * Paneles del shell DOM. `scene` es el HUD de diálogo (F4.2) con el NPC que se eligió; `npcId: null` = seguir la
 * historia sin NPC (las escenas de Lumi, como M0.2).
 */
export type Panel =
  | { kind: "mainMenu" }
  | { kind: "settings" }
  | { kind: "scene"; npcId: string | null };

export type PanelKind = Panel["kind"];

/** Abre un panel arriba de la pila. Si ya está arriba el mismo, no lo duplica. */
export function pushPanel(panels: readonly Panel[], panel: Panel): Panel[] {
  const top = panels[panels.length - 1];
  const same = top !== undefined && top.kind === panel.kind &&
    (top.kind !== "scene" || (panel.kind === "scene" && top.npcId === panel.npcId));
  return same ? [...panels] : [...panels, panel];
}

/** Cierra el panel de arriba. */
export function popPanel(panels: readonly Panel[]): Panel[] {
  return panels.slice(0, -1);
}
