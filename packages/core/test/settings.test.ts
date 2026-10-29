// Ajustes del jugador (slice settings; GDD §2.19): saneo, pasos de texto, sin mutar la entrada.
import { describe, expect, test } from "vitest";
import {
  applySettingsPatch, DEFAULT_SETTINGS, nearestTextScale, persistableSettings, stepTextScale, TEXT_SCALES,
  type SettingsPatch,
} from "../src/index";

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

describe("defaults (GDD §2.19, §2.6)", () => {
  test("texto 125 %, subtítulos sí, tier automático, NPC muy lento en A0", () => {
    expect(DEFAULT_SETTINGS.accessibility.textScale).toBe(125);
    expect(DEFAULT_SETTINGS.accessibility.subtitles).toBe(true);
    expect(DEFAULT_SETTINGS.graphics.tier).toBe("auto");
    expect(DEFAULT_SETTINGS.npcSpeed).toBe("slowest");
  });
});

describe("applySettingsPatch", () => {
  test("aplica cambios válidos sin mutar la entrada", () => {
    const before = deepFreeze(structuredClone(DEFAULT_SETTINGS));
    const after = applySettingsPatch(before, {
      accessibility: { textScale: 175, highContrast: true, volumes: { music: 10 } },
      npcSpeed: "natural", feedbackMode: "flagOnly", graphics: { tier: "low" },
    });
    expect(after.accessibility.textScale).toBe(175);
    expect(after.accessibility.highContrast).toBe(true);
    expect(after.accessibility.volumes).toEqual({ ...DEFAULT_SETTINGS.accessibility.volumes, music: 10 });
    expect(after.npcSpeed).toBe("natural");
    expect(after.feedbackMode).toBe("flagOnly");
    expect(after.graphics.tier).toBe("low");
    expect(before).toEqual(DEFAULT_SETTINGS);
  });

  test("ignora lo que está fuera de contrato (xr, tipos raros, rangos)", () => {
    const junk = {
      accessibility: { textScale: 999, highContrast: "sí", volumes: { npc: -50, lumi: Number.NaN } },
      graphics: { tier: "xr", suggestedTier: "xr" },
      npcSpeed: "rapidísimo", helpLevel: 9, camera: "ojoDePez",
      input: { endOfTurnMs: 5 },
    } as unknown as SettingsPatch;
    const s = applySettingsPatch(DEFAULT_SETTINGS, junk);
    expect(s.accessibility.textScale).toBe(200);
    expect(s.accessibility.highContrast).toBe(false);
    expect(s.accessibility.volumes.npc).toBe(0);
    expect(s.accessibility.volumes.lumi).toBe(100);
    expect(s.graphics).toEqual(DEFAULT_SETTINGS.graphics);
    expect(s.npcSpeed).toBe(DEFAULT_SETTINGS.npcSpeed);
    expect(s.helpLevel).toBe("auto");
    // Cambio registrado (open-world-3d T5, PD-5): el default de la cámara pasó de "perspective3D" a "thirdPerson".
    expect(s.camera).toBe("thirdPerson");
    expect(s.input.endOfTurnMs).toBe(300);
  });

  test("patch vacío o nulo devuelve el mismo objeto", () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, null)).toBe(DEFAULT_SETTINGS);
    expect(applySettingsPatch(DEFAULT_SETTINGS, {})).toEqual(DEFAULT_SETTINGS);
  });
});

describe("tamaño de texto", () => {
  test("5 valores, de 100 a 200 %", () => {
    expect([...TEXT_SCALES]).toEqual([100, 125, 150, 175, 200]);
  });
  test("nearestTextScale redondea al paso más cercano", () => {
    expect(nearestTextScale(130)).toBe(125);
    expect(nearestTextScale(10)).toBe(100);
    expect(nearestTextScale("x")).toBe(125);
  });
  test("stepTextScale no sale del rango", () => {
    expect(stepTextScale(125, 1)).toBe(150);
    expect(stepTextScale(200, 1)).toBe(200);
    expect(stepTextScale(100, -1)).toBe(100);
  });
});

test("persistableSettings deja afuera la sugerencia de tier (se recalcula al arrancar)", () => {
  const p = persistableSettings({ ...DEFAULT_SETTINGS, graphics: { tier: "high", suggestedTier: "low" } });
  expect(p.graphics).toEqual({ tier: "high" });
  expect(applySettingsPatch(DEFAULT_SETTINGS, p).graphics).toEqual({ tier: "high", suggestedTier: "dialog-only" });
});
