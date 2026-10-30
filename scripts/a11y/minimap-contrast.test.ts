// Open-world-3d T9 (AC55, D-839): el contraste de los anillos del minimapa. Los puntos rojos de los NPCs pendientes son
// interfaz (iguales en todo universo) y se dibujan sobre el suelo, el camino y el agua del look del diorama: su contorno
// de tinta tiene que llegar a 3:1 (WCAG 1.4.11, no texto) contra cada uno, en cada look del catálogo. El rojo solo no
// llega sobre el pasto (por eso existe el contorno); el rojo y la flecha del jugador contra el contorno, sí.
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
