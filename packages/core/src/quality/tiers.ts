// Tiers de calidad como contrato (R12, 03 §2.7.1-§2.7.2, ADR-012). Reglas puras: la detección del
// navegador vive en apps/web/src/services/quality/quality.ts y entra acá como `Capabilities`.

/** El orden importa solo para leerlo: `xr` está reservado (épica E-XR) y nunca se elige. */
export const QUALITY_TIERS = ["low", "medium", "high", "dialog-only", "xr"] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

/** Lo que el juego puede elegir hoy: todo menos `xr`. */
export type SelectableTier = Exclude<QualityTier, "xr">;
export const SELECTABLE_TIERS: readonly SelectableTier[] = ["low", "medium", "high", "dialog-only"];

/** Elección en Ajustes: automática (gana la detección) o un tier fijo (gana sobre la detección, §2.7.2.3). */
export type TierChoice = "auto" | SelectableTier;

/** Lo que el navegador dice de la máquina. `null` = la API no existe (Firefox y Safari no tienen deviceMemory). */
export interface Capabilities {
  webgl2: boolean;
  deviceMemoryGb: number | null;
  cores: number | null;
}

/** PC objetivo mínima de 03 §2.7: 4 GB de RAM, 2-4 núcleos. A ese piso o por debajo, `low` (obligatorio). */
export const LOW_TIER_MAX_MEMORY_GB = 4;
export const LOW_TIER_MAX_CORES = 4;

export const isSelectableTier = (value: unknown): value is SelectableTier =>
  typeof value === "string" && (SELECTABLE_TIERS as readonly string[]).includes(value);

export const isTierChoice = (value: unknown): value is TierChoice => value === "auto" || isSelectableTier(value);

/**
 * Tier sugerido por capacidades (§2.7.2.1). Sin WebGL2 → `dialog-only`. En el piso de la PC objetivo → `low`.
 * Si no, `medium` (default en GPU integrada moderna). `high` nunca se sugiere sin el micro-benchmark (F2).
 */
export function suggestTier(caps: Capabilities): SelectableTier {
  if (!caps.webgl2) return "dialog-only";
  const lowMemory = caps.deviceMemoryGb !== null && caps.deviceMemoryGb <= LOW_TIER_MAX_MEMORY_GB;
  const fewCores = caps.cores !== null && caps.cores <= LOW_TIER_MAX_CORES;
  return lowMemory || fewCores ? "low" : "medium";
}

/**
 * Tier efectivo. Sin WebGL no hay elección manual que valga: `dialog-only`. Con WebGL, la manual gana sobre
 * la automática. Nunca devuelve `xr`: un valor fuera del contrato (p. ej. un guardado viejo) cae a la sugerencia.
 */
export function effectiveTier(choice: TierChoice, suggested: SelectableTier): SelectableTier {
  const safeSuggested: SelectableTier = isSelectableTier(suggested) ? suggested : "dialog-only";
  if (safeSuggested === "dialog-only") return "dialog-only";
  if (choice === "auto" || !isSelectableTier(choice)) return safeSuggested;
  return choice;
}

/**
 * Baja automática por rendimiento (§2.7.2.2, PerformanceMonitor): un escalón, nunca por debajo de `low` (el
 * tier obligatorio) ni hacia `dialog-only` (eso solo pasa sin WebGL o a pedido). Nunca sube sola.
 */
export function downgradeTier(tier: SelectableTier): SelectableTier {
  if (tier === "high") return "medium";
  if (tier === "medium") return "low";
  return tier;
}
