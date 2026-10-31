// Tiers as a contract (R12): A7 (exact union, the selector never returns xr) and A3 (no WebGL → dialog-only).
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  detectCapabilities, effectiveTier, QUALITY_TIERS, TIER_PARAMS, type QualityTier, type SelectableTier, type TierChoice,
} from "../src/services/quality";
import { selectEffectiveTier } from "../src/state/selectors";
import { createGameStore, initialGameState } from "../src/state/store";
import { fakeQualityEnv } from "./helpers";

describe("A7: QualityTier", () => {
  test("el tipo es exactamente 'low' | 'medium' | 'high' | 'dialog-only' | 'xr' (lo verifica tsc en verify)", () => {
    expectTypeOf<QualityTier>().toEqualTypeOf<"low" | "medium" | "high" | "dialog-only" | "xr">();
    expectTypeOf(selectEffectiveTier).returns.toEqualTypeOf<SelectableTier>();
    expect([...QUALITY_TIERS]).toEqual(["low", "medium", "high", "dialog-only", "xr"]);
  });

  test("quality.ts es el único objeto de parámetros y no tiene fila xr", () => {
    expect(Object.keys(TIER_PARAMS).sort()).toEqual(["dialog-only", "high", "low", "medium"]);
    expect(TIER_PARAMS.low.maxDpr).toBe(1);
    expect(TIER_PARAMS["dialog-only"].maxDrawCalls).toBe(0);
  });

  test("selectEffectiveTier nunca devuelve xr, ni con un xr colado en el store", () => {
    const choices = ["auto", ...QUALITY_TIERS] as TierChoice[];
    for (const tier of choices) for (const suggestedTier of QUALITY_TIERS as readonly string[]) {
      const state = initialGameState();
      state.settings.graphics = { tier, suggestedTier: suggestedTier as SelectableTier };
      const result = selectEffectiveTier(state);
      expect(result, `${tier}/${suggestedTier}`).not.toBe("xr");
      expect(result).toBe(effectiveTier(tier, suggestedTier as SelectableTier));
    }
  });
});

describe("detectCapabilities (§2.7.2)", () => {
  test("con WebGL2", () => {
    expect(detectCapabilities(fakeQualityEnv({ webgl2: true, memory: 8, cores: 4 }))).toEqual({ webgl2: true, deviceMemoryGb: 8, cores: 4 });
  });

  test("A3: sin WebGL (simulado) → el arranque sugiere dialog-only", () => {
    const caps = detectCapabilities(fakeQualityEnv({ webgl2: false }));
    expect(caps.webgl2).toBe(false);
    const store = createGameStore();
    store.setState({ settings: { ...store.getState().settings, graphics: { tier: "high", suggestedTier: "dialog-only" } } });
    expect(selectEffectiveTier(store.getState())).toBe("dialog-only");
  });

  test("un navegador que lanza al pedir el contexto cuenta como sin WebGL; datos raros = null", () => {
    const throwing = { createCanvas: () => ({ getContext: () => { throw new Error("blocked"); } }), deviceMemory: Number.NaN, hardwareConcurrency: 0 };
    expect(detectCapabilities(throwing)).toEqual({ webgl2: false, deviceMemoryGb: null, cores: null });
    expect(detectCapabilities({ createCanvas: () => null })).toEqual({ webgl2: false, deviceMemoryGb: null, cores: null });
  });
});
