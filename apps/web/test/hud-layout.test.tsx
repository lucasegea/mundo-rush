// @vitest-environment jsdom
// Open-world-3d T10-integrate: at 375 px the talk prompt does not cover the minimap, with text at 100 % and 125 % (the
// default one). jsdom has no layout, so the contract is tested: the rem numbers of ui/hud/layout.ts (the gap the
// HUD leaves against the circle and its distance from the edge) and that the prompt and the zoom live inside the block that leaves that
// gap. Since everything is rem, the math is the same at any text size; it is done at 100 % and 125 % anyway.
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import worldSource from "../src/ui/hud/WorldHud.tsx?raw";
import { MINIMAP_CLEARANCE_NARROW, MINIMAP_CLEARANCE_SIDE, MINIMAP_OFFSET, MINIMAP_SIZE } from "../src/ui/hud/layout";
import { WorldHud } from "../src/ui/hud/WorldHud";
import { resetStore } from "./helpers";

/** The rem number of the `classes` class that starts with `prefix` (`size-[7rem]`, `pb-[calc(8rem+…)]`). */
const rem = (classes: string, prefix: string): number => {
  const cls = classes.split(/\s+/).find((c) => c.startsWith(prefix));
  const m = cls?.match(/\[(?:calc\()?(\d+(?:\.\d+)?)rem/);
  if (!m?.[1]) throw new Error(`sin ${prefix}… en rem en "${classes}"`);
  return Number(m[1]);
};

/** The map HUD's padding (the section): `p-4` = 1rem. */
const SECTION_PAD_REM = 1;
/** Minimum air between what is at the bottom of the HUD and the top edge of the minimap. */
const AIR_REM = 1;
const TEXT_SCALES = [1, 1.25] as const;
const SAFE_AREAS_PX = [0, 34] as const;

describe("a 375 px el aviso de hablar queda encima del minimapa", () => {
  beforeEach(() => resetStore());
  afterEach(() => cleanup());

  test.each(TEXT_SCALES)("texto al %s: lo de abajo del HUD termina al menos 1rem sobre el círculo (con y sin área segura)", (scale) => {
    const px = 16 * scale;
    const offset = rem(MINIMAP_OFFSET, "bottom-");
    for (const safe of SAFE_AREAS_PX) {
      // Phone: the whole block (prompt and zoom) leaves its gap; from md, the zoom column.
      const narrowBottom = (SECTION_PAD_REM + rem(MINIMAP_CLEARANCE_NARROW, "pb-")) * px + safe;
      const narrowTop = (offset + rem(MINIMAP_SIZE, "size-")) * px + safe;
      expect(narrowBottom - narrowTop).toBeGreaterThanOrEqual(AIR_REM * px);
      const sideBottom = (SECTION_PAD_REM + rem(MINIMAP_CLEARANCE_SIDE, "md:pb-")) * px;
      const sideTop = (offset + rem(MINIMAP_SIZE, "md:size-")) * px;
      expect(sideBottom - sideTop).toBeGreaterThanOrEqual(AIR_REM * px);
    }
    // AC55 still holds: 112 px and 160 px with text at 100 %.
    if (scale === 1) expect([rem(MINIMAP_SIZE, "size-") * px, rem(MINIMAP_SIZE, "md:size-") * px]).toEqual([112, 160]);
  });

  test("el aviso y el zoom viven en el bloque que deja el hueco; en angosto, una sola columna", () => {
    expect(worldSource).toMatch(/<section[^>]*className="[^"]*\bp-4\b/);
    render(<WorldHud />);
    const status = document.querySelector('[role="status"]');
    const block = status?.parentElement;
    expect(block).toBeTruthy();
    for (const c of MINIMAP_CLEARANCE_NARROW.split(" ")) expect(block?.classList.contains(c), c).toBe(true);
    expect(block?.classList.contains("grid-cols-1")).toBe(true);
    expect(block?.classList.contains("md:grid-cols-[1fr_auto_1fr]")).toBe(true);
    // The prompt goes to the center only from md (on narrow screens a column that does not exist is not forced).
    expect(status?.classList.contains("md:col-start-2")).toBe(true);
    expect(status?.classList.contains("col-start-2")).toBe(false);
    const zoom = document.getElementById("world-zoom-out")?.closest(".justify-self-end");
    expect(zoom?.parentElement).toBe(block);
    expect(zoom?.classList.contains(MINIMAP_CLEARANCE_SIDE)).toBe(true);
  });
});
