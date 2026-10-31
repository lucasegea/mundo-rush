// @lg/art minimap.ts: the minimap colors (open-world-3d T9, D-839). The background, path and water come from the diorama's
// look (`palette`/`ground`/`road`/`water`): another look, another minimap, without touching the interface. The dot of pending
// NPCs, its outline and the player's arrow are NOT part of the look: they are interface (like the labels, A14), the same in
// every universe, and their contrast is tested against the background, path and water of each look in the catalog.
import { PALETTE } from "./palette.ts";
import type { WorldLook } from "./worldLook.ts";

/**
 * Red of the pending-NPC dot (mockup V6 `.npc-dot`). It is interface and not a world color, so it is not in the
 * look's palette; on grass it does not contrast on its own (1.2:1), so it always goes with the `MINIMAP_INK.ring` outline.
 */
export const MINIMAP_NPC_RED = "#FF5448";

/** Minimap ink: outline of the dots and of the player's arrow, and the arrow's fill. */
export const MINIMAP_INK = { ring: PALETTE.tinta, player: PALETTE.papel } as const;

/** Minimum contrast for non-text (WCAG 1.4.11): the dots' outline against everything underneath. */
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
