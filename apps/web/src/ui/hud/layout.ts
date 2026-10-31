// ui/hud/layout.ts — the minimap's place and what the map HUD leaves free for it (open-world-3d T9, T10-integrate).
// All in rem, like the rest of the HUD: with text at 100 % or 125 % (the factory one) the circle and its gap grow
// together, so what is not covered at one size is not covered at any. The classes are whole literals so
// Tailwind sees them when scanning; test/hud-layout.test.tsx reads their numbers and checks that the gap is enough.

/** Distance from the minimap to the right and bottom screen edge (plus the safe area). */
export const MINIMAP_OFFSET = "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]";

/** The minimap circle: 7rem on phone, 10rem from md (AC55: 112 and 160 px with text at 100 %). */
export const MINIMAP_SIZE = "size-[7rem] md:size-[10rem]";

/**
 * On narrow screens the talk prompt and the zoom go in a single column, stacked over the minimap: the whole bottom
 * block leaves its height free (7rem plus 1rem of air, plus the safe area). From md it is not needed: the prompt goes in the
 * center and only the right column leaves the gap (`MINIMAP_CLEARANCE_SIDE`).
 */
export const MINIMAP_CLEARANCE_NARROW = "pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-0";

/** From md, the right column (the zoom) leaves the minimap's height free: 10rem plus 1rem of air. */
export const MINIMAP_CLEARANCE_SIDE = "md:pb-[11rem]";
