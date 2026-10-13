// services/quality/quality.ts — tiers de calidad como contrato (R12, 03 §2.7.1): el ÚNICO objeto del que se
// leen los parámetros por tier, y la detección de capacidades del navegador (§2.7.2). Las reglas (sugerir y
// resolver el tier, nunca `xr`) están en @lg/core; acá solo se mide el navegador.
// El micro-benchmark de ~1 s y PerformanceMonitor llegan con el canvas (F2).
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
   * Plan estetica-c M6: densidad de la escena (DENSITY de @lg/art). `low` reducida (menos detalle, geometría y cuerpos
   * reducidos, terreno más grueso, niebla más corta: "distancia de dibujo corta" de §2.7.1); el resto, la completa.
   */
  density: SceneDensity;
}

/** Parámetros de 03 §2.7.1. `xr` no tiene fila: está reservado y nunca se elige (R12). */
export const TIER_PARAMS: Readonly<Record<SelectableTier, TierParams>> = {
  low: { targetFps: 30, maxDpr: 1, maxTriangles: 25_000, maxDrawCalls: 60, maxAnimatedCharacters: 4, shadows: "none", post: "none", maxTextureMb: 24, density: "reduced" },
  medium: { targetFps: 60, maxDpr: 1.5, maxTriangles: 50_000, maxDrawCalls: 120, maxAnimatedCharacters: 8, shadows: "blob", post: "bloom", maxTextureMb: 48, density: "full" },
  high: { targetFps: 60, maxDpr: 2, maxTriangles: 100_000, maxDrawCalls: 150, maxAnimatedCharacters: 12, shadows: "directional", post: "full", maxTextureMb: 96, density: "full" },
  "dialog-only": { targetFps: null, maxDpr: null, maxTriangles: 0, maxDrawCalls: 0, maxAnimatedCharacters: 0, shadows: "none", post: "none", maxTextureMb: 0, density: "reduced" },
};

/** Lo mínimo del navegador que mira la detección (inyectable para tests sin navegador). */
export interface QualityEnv {
  /** Crea un canvas para probar WebGL2; no se agrega al documento. */
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

/** WebGL2, memoria y núcleos. Cualquier excepción del navegador al probar WebGL cuenta como "sin WebGL". */
export function detectCapabilities(env: QualityEnv = browserQualityEnv()): Capabilities {
  let webgl2 = false;
  try {
    webgl2 = Boolean(env.createCanvas()?.getContext("webgl2"));
  } catch {
    webgl2 = false;
  }
  return { webgl2, deviceMemoryGb: positive(env.deviceMemory), cores: positive(env.hardwareConcurrency) };
}
