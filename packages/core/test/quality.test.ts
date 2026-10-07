// Tiers de calidad como contrato (R12; F1.3 A3, A7).
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  effectiveTier, isSelectableTier, isTierChoice, QUALITY_TIERS, SELECTABLE_TIERS, suggestTier,
  type Capabilities, type QualityTier, type SelectableTier, type TierChoice,
} from "../src/index";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({ webgl2: true, deviceMemoryGb: 8, cores: 8, ...over });

describe("A7: QualityTier es exactamente la unión del contrato", () => {
  test("tipo y lista en tiempo de ejecución", () => {
    expectTypeOf<QualityTier>().toEqualTypeOf<"low" | "medium" | "high" | "dialog-only" | "xr">();
    expectTypeOf<SelectableTier>().toEqualTypeOf<"low" | "medium" | "high" | "dialog-only">();
    expect([...QUALITY_TIERS]).toEqual(["low", "medium", "high", "dialog-only", "xr"]);
    expect(SELECTABLE_TIERS).not.toContain("xr");
  });

  test("xr no es elegible ni como tier ni como elección", () => {
    expect(isSelectableTier("xr")).toBe(false);
    expect(isTierChoice("xr")).toBe(false);
    expect(isTierChoice("auto")).toBe(true);
  });

  test("effectiveTier nunca devuelve xr, para toda combinación (incluida una xr colada)", () => {
    const choices = ["auto", ...QUALITY_TIERS] as TierChoice[];
    const suggestions = [...QUALITY_TIERS] as SelectableTier[];
    for (const c of choices) for (const s of suggestions) {
      const t = effectiveTier(c, s);
      expect(t, `${c} / ${s}`).not.toBe("xr");
      expect(SELECTABLE_TIERS).toContain(t);
    }
  });
});

describe("suggestTier (§2.7.2)", () => {
  test("A3: sin WebGL2 → dialog-only", () => {
    expect(suggestTier(caps({ webgl2: false }))).toBe("dialog-only");
    expect(suggestTier({ webgl2: false, deviceMemoryGb: null, cores: null })).toBe("dialog-only");
  });

  test("en el piso de la PC objetivo (4 GB o ≤ 4 núcleos) → low", () => {
    expect(suggestTier(caps({ deviceMemoryGb: 4 }))).toBe("low");
    expect(suggestTier(caps({ cores: 2 }))).toBe("low");
  });

  test("por encima del piso → medium; high nunca sin benchmark; sin datos no castiga", () => {
    expect(suggestTier(caps())).toBe("medium");
    expect(suggestTier(caps({ deviceMemoryGb: 32, cores: 32 }))).toBe("medium");
    expect(suggestTier(caps({ deviceMemoryGb: null, cores: null }))).toBe("medium");
  });
});

describe("effectiveTier", () => {
  test("auto sigue a la sugerencia; la manual gana con WebGL", () => {
    expect(effectiveTier("auto", "low")).toBe("low");
    expect(effectiveTier("high", "low")).toBe("high");
    expect(effectiveTier("dialog-only", "medium")).toBe("dialog-only");
  });

  test("sin WebGL ninguna elección manual saca de dialog-only", () => {
    for (const c of ["auto", "low", "medium", "high"] as const) expect(effectiveTier(c, "dialog-only")).toBe("dialog-only");
  });
});
