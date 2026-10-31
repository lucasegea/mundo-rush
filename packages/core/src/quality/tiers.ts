// Quality tiers as a contract (R12, 03 §2.7.1-§2.7.2, ADR-012). Pure rules: browser
// detection lives in apps/web/src/services/quality/quality.ts and comes in here as `Capabilities`.

/** Order matters only for reading: `xr` is reserved (epic E-XR) and is never chosen. */
export const QUALITY_TIERS = ["low", "medium", "high", "dialog-only", "xr"] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

/** What the game can choose today: everything but `xr`. */
export type SelectableTier = Exclude<QualityTier, "xr">;
export const SELECTABLE_TIERS: readonly SelectableTier[] = ["low", "medium", "high", "dialog-only"];

/** Choice in Settings: automatic (detection wins) or a fixed tier (wins over detection, §2.7.2.3). */
export type TierChoice = "auto" | SelectableTier;

/** What the browser says about the machine. `null` = the API does not exist (Firefox and Safari have no deviceMemory). */
export interface Capabilities {
  webgl2: boolean;
  deviceMemoryGb: number | null;
  cores: number | null;
}

/** Minimum target PC from 03 §2.7: 4 GB of RAM, 2-4 cores. At that floor or below, `low` (mandatory). */
export const LOW_TIER_MAX_MEMORY_GB = 4;
export const LOW_TIER_MAX_CORES = 4;

export const isSelectableTier = (value: unknown): value is SelectableTier =>
  typeof value === "string" && (SELECTABLE_TIERS as readonly string[]).includes(value);

export const isTierChoice = (value: unknown): value is TierChoice => value === "auto" || isSelectableTier(value);

/**
 * Tier suggested by capabilities (§2.7.2.1). Without WebGL2 → `dialog-only`. At the target PC floor → `low`.
 * Otherwise `medium` (default on a modern integrated GPU). `high` is never suggested without the micro-benchmark (F2).
 */
export function suggestTier(caps: Capabilities): SelectableTier {
  if (!caps.webgl2) return "dialog-only";
  const lowMemory = caps.deviceMemoryGb !== null && caps.deviceMemoryGb <= LOW_TIER_MAX_MEMORY_GB;
  const fewCores = caps.cores !== null && caps.cores <= LOW_TIER_MAX_CORES;
  return lowMemory || fewCores ? "low" : "medium";
}

/**
 * Effective tier. Without WebGL no manual choice is valid: `dialog-only`. With WebGL, the manual one wins over
 * the automatic one. Never returns `xr`: a value outside the contract (e.g. an old save) falls back to the suggestion.
 */
export function effectiveTier(choice: TierChoice, suggested: SelectableTier): SelectableTier {
  const safeSuggested: SelectableTier = isSelectableTier(suggested) ? suggested : "dialog-only";
  if (safeSuggested === "dialog-only") return "dialog-only";
  if (choice === "auto" || !isSelectableTier(choice)) return safeSuggested;
  return choice;
}

/**
 * Automatic drop for performance (§2.7.2.2, PerformanceMonitor): one step, never below `low` (the
 * mandatory tier) nor toward `dialog-only` (that only happens without WebGL or on request). It never goes up by itself.
 */
export function downgradeTier(tier: SelectableTier): SelectableTier {
  if (tier === "high") return "medium";
  if (tier === "medium") return "low";
  return tier;
}
