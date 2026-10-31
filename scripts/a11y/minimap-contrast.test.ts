// Open-world-3d T9 (AC55, D-839): the contrast of the minimap rings. The red dots of the pending NPCs are
// interface (the same in every universe) and are drawn over the ground, the path and the water of the diorama's look: their ink outline
// has to reach 3:1 (WCAG 1.4.11, non-text) against each one, in every look of the catalog. The red alone does not
// reach it over the grass (that is why the outline exists); the red and the player's arrow against the outline do.
import { describe, expect, test } from "vitest";
import { MINIMAP_NON_TEXT_MIN, minimapColors, WORLD_LOOKS } from "@lg/art";
import { contrastRatio, NON_TEXT_MIN } from "./contrast";

describe("AC55: contraste de los anillos del minimapa contra cada look", () => {
  test("el mínimo es el de no texto de check:contrast", () => {
    expect(MINIMAP_NON_TEXT_MIN).toBe(NON_TEXT_MIN);
  });

  for (const [id, look] of Object.entries(WORLD_LOOKS)) {
    test(`${id}: contorno >= 3:1 contra suelo, camino y agua; rojo y jugador contra el contorno`, () => {
      const c = minimapColors(look);
      for (const bg of [c.ground, c.road, c.water]) expect(contrastRatio(c.ring, bg), `${id} contorno / ${bg}`).toBeGreaterThanOrEqual(MINIMAP_NON_TEXT_MIN);
      expect(contrastRatio(c.npc, c.ring), `${id} rojo / contorno`).toBeGreaterThanOrEqual(MINIMAP_NON_TEXT_MIN);
      expect(contrastRatio(c.player, c.ring), `${id} jugador / contorno`).toBeGreaterThanOrEqual(MINIMAP_NON_TEXT_MIN);
    });
  }

  test("dientes: el rojo solo sobre el suelo no llega (el contorno hace falta)", () => {
    const c = minimapColors(WORLD_LOOKS.pradera);
    expect(contrastRatio(c.npc, c.ground)).toBeLessThan(MINIMAP_NON_TEXT_MIN);
  });
});
