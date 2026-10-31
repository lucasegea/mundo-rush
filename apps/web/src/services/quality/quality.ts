// services/quality/quality.ts — quality tiers as a contract (R12, 03 §2.7.1): the ONLY object from which
// per-tier parameters are read, and browser capability detection (§2.7.2). The rules (suggest and
// resolve the tier, never `xr`) are in @lg/core; here only the browser is measured.
// The ~1 s micro-benchmark and PerformanceMonitor arrive with the canvas (F2).
import type { Capabilities, SelectableTier } from "@lg/core";
import type { SceneDensity } from "@lg/art";

export { QUALITY_TIERS, SELECTABLE_TIERS, effectiveTier, suggestTier } from "@lg/core";
export type { Capabilities, QualityTier, SelectableTier, TierChoice } from "@lg/core";

export interface TierParams {
  targetFps: number | null;
  maxDpr: number | null;
  maxTriangles: number;
  maxDrawCalls: number;
  maxAnimatedCharacters: number;
  shadows: "none" | "blob" | "directional";
  post: "none" | "bloom" | "full";
  maxTextureMb: number;
  /**
   * Plan estetica-c M6: scene density (DENSITY from @lg/art). `low` reduced (less detail, fewer geometry and bodies,
   * coarser terrain, shorter fog: the "short draw distance" of §2.7.1); the rest, the full one.
   */
  density: SceneDensity;
}

/** Parameters from 03 §2.7.1. `xr` has no row: it is reserved and never chosen (R12). */
export const TIER_PARAMS: Readonly<Record<SelectableTier, TierParams>> = {
  low: { targetFps: 30, maxDpr: 1, maxTriangles: 25_000, maxDrawCalls: 60, maxAnimatedCharacters: 4, shadows: "none", post: "none", maxTextureMb: 24, density: "reduced" },
  medium: { targetFps: 60, maxDpr: 1.5, maxTriangles: 50_000, maxDrawCalls: 120, maxAnimatedCharacters: 8, shadows: "blob", post: "bloom", maxTextureMb: 48, density: "full" },
  high: { targetFps: 60, maxDpr: 2, maxTriangles: 100_000, maxDrawCalls: 150, maxAnimatedCharacters: 12, shadows: "directional", post: "full", maxTextureMb: 96, density: "full" },
  "dialog-only": { targetFps: null, maxDpr: null, maxTriangles: 0, maxDrawCalls: 0, maxAnimatedCharacters: 0, shadows: "none", post: "none", maxTextureMb: 0, density: "reduced" },
};

/** The minimum of the browser that detection looks at (injectable for tests without a browser). */
export interface QualityEnv {
  /** Creates a canvas to probe WebGL2; it is not added to the document. */
  createCanvas(): { getContext(id: "webgl2"): unknown } | null;
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
}

export const browserQualityEnv = (): QualityEnv => ({
  createCanvas: () => document.createElement("canvas"),
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency,
});

const positive = (n: number | undefined): number | null => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);

/** WebGL2, memory and cores. Any browser exception while probing WebGL counts as "no WebGL". */
export function detectCapabilities(env: QualityEnv = browserQualityEnv()): Capabilities {
  let webgl2 = false;
  try {
    webgl2 = Boolean(env.createCanvas()?.getContext("webgl2"));
  } catch {
    webgl2 = false;
  }
  return { webgl2, deviceMemoryGb: positive(env.deviceMemory), cores: positive(env.hardwareConcurrency) };
}
