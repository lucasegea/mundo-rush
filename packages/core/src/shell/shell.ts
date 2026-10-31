// App phase and shell panel stack (`session` and `ui` slices, 03 §3.3). Pure rules.
import type { SelectableTier } from "../quality/tiers";

/** App phase (03 §3.3, `session` slice). */
export const APP_PHASES = ["boot", "onboarding", "world", "scene", "notebook", "dialogOnly"] as const;
export type AppPhase = (typeof APP_PHASES)[number];

/** When startup ends: without WebGL (or with `dialog-only` chosen) it plays in dialogue-only mode (§2.7.2.1). */
export function phaseAfterBoot(tier: SelectableTier): AppPhase {
  return tier === "dialog-only" ? "dialogOnly" : "world";
}

/** You can move on to the map only if the effective tier allows it. */
export function canEnterWorld(tier: SelectableTier): boolean {
  return tier !== "dialog-only";
}

/**
 * DOM shell panels. `scene` is the dialogue HUD (F4.2) with the chosen NPC; `npcId: null` = continue the
 * story without an NPC (Lumi's scenes, like M0.2).
 */
export type Panel =
  | { kind: "mainMenu" }
  | { kind: "settings" }
  | { kind: "scene"; npcId: string | null };

export type PanelKind = Panel["kind"];

/** Opens a panel on top of the stack. If the same one is already on top, it does not duplicate it. */
export function pushPanel(panels: readonly Panel[], panel: Panel): Panel[] {
  const top = panels[panels.length - 1];
  const same = top !== undefined && top.kind === panel.kind &&
    (top.kind !== "scene" || (panel.kind === "scene" && top.npcId === panel.npcId));
  return same ? [...panels] : [...panels, panel];
}

/** Closes the top panel. */
export function popPanel(panels: readonly Panel[]): Panel[] {
  return panels.slice(0, -1);
}
