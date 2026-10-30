// @lg/art minimap.ts: los colores del minimapa (open-world-3d T9, D-839). El fondo, el camino y el agua salen del look
// del diorama (`palette`/`ground`/`road`/`water`): otro look, otro minimapa, sin tocar la interfaz. El punto de los NPCs
// pendientes, su contorno y la flecha del jugador NO son del look: son interfaz (como las etiquetas, A14), iguales en
// todo universo, y su contraste se prueba contra el fondo, el camino y el agua de cada look del catálogo.
import { PALETTE } from "./palette.ts";
import type { WorldLook } from "./worldLook.ts";

/**
 * Rojo del punto de NPC pendiente (mockup V6 `.npc-dot`). Es interfaz y no un color del mundo, por eso no está en la
 * paleta del look; sobre el pasto no contrasta solo (1,2:1), así que siempre va con el contorno `MINIMAP_INK.ring`.
 */
export const MINIMAP_NPC_RED = "#FF5448";

/** Tinta del minimapa: contorno de los puntos y de la flecha del jugador, y el relleno de la flecha. */
export const MINIMAP_INK = { ring: PALETTE.tinta, player: PALETTE.papel } as const;

/** Contraste mínimo de lo que no es texto (WCAG 1.4.11): el contorno de los puntos contra todo lo que hay debajo. */
export const MINIMAP_NON_TEXT_MIN = 3;

export interface MinimapColors {
  ground: string;
  road: string;
  water: string;
  npc: string;
  ring: string;
  player: string;
}

export function minimapColors(look: Pick<WorldLook, "palette" | "ground" | "road" | "water">): MinimapColors {
  return {
    ground: look.palette[look.ground.vertex.low],
    road: look.palette[look.road.surface],
    water: look.palette[look.water.shallow],
    npc: MINIMAP_NPC_RED,
    ring: MINIMAP_INK.ring,
    player: MINIMAP_INK.player,
  };
}
