// Selectores del minimapa (open-world-3d T9, M4): quién falta visitar, dónde está cada uno respecto del jugador y con
// qué colores se pinta. La regla vive en el núcleo (`minimapModel`, `pendingNpcs`, `stepMinimapYaw`) y los colores en
// @lg/art (`minimapColors` del look del diorama, D-839); ui/hud/Minimap.tsx solo dibuja lo que sale de acá.
import { MINIMAP, minimapModel, pendingNpcs, stepMinimapYaw, type MinimapModel, type MinimapNpc } from "@lg/core";
import { lookForRelief, minimapColors, type MinimapColors } from "@lg/art";
import type { GameState } from "../store";
import { selectEffectiveTier } from "./settings";
import { createViewSelector } from "./view";

/**
 * Se ve en el mapa jugable a cualquier zoom (t de 0 a 1): fase `world`, diorama cargado, ningún panel encima (en la
 * charla no se ve) y un tier que dibuja el mundo (en `dialog-only` no hay mapa).
 */
export const selectMinimapVisible = (s: GameState): boolean =>
  s.session.phase === "world" && s.ui.panels.length === 0 && s.world.diorama !== null && selectEffectiveTier(s) !== "dialog-only";

/** Los NPCs del diorama que faltan visitar, en el orden del layout, con su nombre del catálogo (o el id). */
export const selectPendingNpcs = createViewSelector(
  (s: GameState) => [s.world.diorama, s.world.npcs, s.progression.completedNpcs] as const,
  (diorama, npcs, completed): MinimapNpc[] =>
    pendingNpcs(diorama?.npcs ?? [], completed).map((n) => ({ id: n.id, name: npcs.find((x) => x.id === n.id)?.name ?? n.id, x: n.x, z: n.z })),
);

/** Colores del minimapa: los del look del diorama (la misma regla que world/, `lookForRelief`). */
export const selectMinimapColors = createViewSelector(
  (s: GameState) => [s.world.diorama?.ground.terrain.relief === true] as const,
  (relief): MinimapColors => minimapColors(lookForRelief(relief)),
);

/** Un redibujo del minimapa: el tamaño medido y el giro con que se dibujó el anterior (null en el primero). */
export interface MinimapFrame {
  /** Lado en píxeles CSS; 0 o ausente (jsdom, sin layout) = el de escritorio. */
  sizePx?: number;
  prevYawDeg?: number | null;
  /** Segundos desde el redibujo anterior. */
  dtS?: number;
}

export interface MinimapView {
  visible: boolean;
  /** null si no hay diorama o jugador todavía. */
  model: MinimapModel | null;
  /** El giro de este redibujo (el próximo lo pasa como `prevYawDeg`). */
  yawDeg: number;
  /** El yaw de la cámara al que va el giro: cuando `yawDeg` llegó, un redibujo sin otros cambios se puede saltear. */
  targetYawDeg: number;
  colors: MinimapColors;
}

/**
 * Lo que dibuja el minimapa en este redibujo. No se memoriza (el giro suavizado depende del redibujo anterior); lo
 * llama el efecto de 100 ms de ui/hud/Minimap.tsx con `readGame`, nunca el bucle de render.
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

/** Milisegundos entre redibujos (AC56): el número del núcleo, para ui/ (que usa el núcleo solo como tipos). */
export const MINIMAP_REDRAW_MS: number = MINIMAP.redrawMs;
