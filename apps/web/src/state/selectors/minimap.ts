// Minimap selectors (open-world-3d T9, M4): who is left to visit, where each one is relative to the player and with
// what colors it is painted. The rule lives in the core (`minimapModel`, `pendingNpcs`, `stepMinimapYaw`) and the colors in
// @lg/art (`minimapColors` of the diorama look, D-839); ui/hud/Minimap.tsx only draws what comes out of here.
import { MINIMAP, minimapModel, pendingNpcs, stepMinimapYaw, type MinimapModel, type MinimapNpc } from "@lg/core";
import { lookForRelief, minimapColors, type MinimapColors } from "@lg/art";
import type { GameState } from "../store";
import { selectEffectiveTier } from "./settings";
import { createViewSelector } from "./view";

/**
 * Visible on the playable map at any zoom (t from 0 to 1): phase `world`, diorama loaded, no panel on top (it is not
 * shown during a conversation) and a tier that draws the world (in `dialog-only` there is no map).
 */
export const selectMinimapVisible = (s: GameState): boolean =>
  s.session.phase === "world" && s.ui.panels.length === 0 && s.world.diorama !== null && selectEffectiveTier(s) !== "dialog-only";

/** The diorama's NPCs still to visit, in layout order, with their catalog name (or the id). */
export const selectPendingNpcs = createViewSelector(
  (s: GameState) => [s.world.diorama, s.world.npcs, s.progression.completedNpcs] as const,
  (diorama, npcs, completed): MinimapNpc[] =>
    pendingNpcs(diorama?.npcs ?? [], completed).map((n) => ({ id: n.id, name: npcs.find((x) => x.id === n.id)?.name ?? n.id, x: n.x, z: n.z })),
);

/** Minimap colors: those of the diorama look (the same rule as world/, `lookForRelief`). */
export const selectMinimapColors = createViewSelector(
  (s: GameState) => [s.world.diorama?.ground.terrain.relief === true] as const,
  (relief): MinimapColors => minimapColors(lookForRelief(relief)),
);

/** A minimap redraw: the measured size and the turn with which the previous one was drawn (null on the first). */
export interface MinimapFrame {
  /** Side in CSS pixels; 0 or absent (jsdom, no layout) = the desktop one. */
  sizePx?: number;
  prevYawDeg?: number | null;
  /** Seconds since the previous redraw. */
  dtS?: number;
}

export interface MinimapView {
  visible: boolean;
  /** null if there is no diorama or player yet. */
  model: MinimapModel | null;
  /** This redraw's turn (the next one passes it as `prevYawDeg`). */
  yawDeg: number;
  /** The camera yaw the turn is heading to: once `yawDeg` has been reached, a redraw with no other changes can be skipped. */
  targetYawDeg: number;
  colors: MinimapColors;
}

/**
 * What the minimap draws in this redraw. Not memoized (the smoothed turn depends on the previous redraw); it is
 * called by the 100 ms effect in ui/hud/Minimap.tsx with `readGame`, never the render loop.
 */
export function selectMinimap(s: GameState, frame: MinimapFrame = {}): MinimapView {
  const target = s.ui.camera.yawDeg;
  const yawDeg = stepMinimapYaw(frame.prevYawDeg ?? null, target, frame.dtS ?? 0, s.settings.accessibility.reduceMotion);
  const diorama = s.world.diorama;
  const player = s.player.position;
  const sizePx = frame.sizePx !== undefined && frame.sizePx > 0 ? frame.sizePx : MINIMAP.sizePx.desktop;
  return {
    visible: selectMinimapVisible(s),
    model: diorama && player ? minimapModel({ player, yawDeg, npcs: selectPendingNpcs(s), sizePx, ground: diorama.ground, bounds: diorama.bounds }) : null,
    yawDeg, targetYawDeg: target,
    colors: selectMinimapColors(s),
  };
}

/** Milliseconds between redraws (AC56): the core's number, for ui/ (which uses the core only as types). */
export const MINIMAP_REDRAW_MS: number = MINIMAP.redrawMs;
