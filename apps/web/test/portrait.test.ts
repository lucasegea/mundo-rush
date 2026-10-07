// Retratos SVG por código (D-030): determinísticos. Que cada color sea un token de tokens.css lo verifica
// scripts/a11y/contrast.test.ts (lee los dos archivos del disco).
import { expect, test } from "vitest";
import { portraitLook } from "../src/ui/dialog-only/Portrait";

const IDS = ["NPC-INES", "NPC-KOFI", "NPC-MAYA", "NPC-NELL", "NPC-OLLIE"];

test("el mismo id da siempre el mismo retrato; la ropa nunca es del color del fondo; no todos iguales", () => {
  for (const id of IDS) {
    expect(portraitLook(id)).toEqual(portraitLook(id));
    expect(portraitLook(id).clothes).not.toBe(portraitLook(id).background);
    expect(portraitLook(id).hair).not.toBe("tierra");
  }
  expect(new Set(IDS.map((id) => JSON.stringify(portraitLook(id)))).size).toBeGreaterThan(1);
});
