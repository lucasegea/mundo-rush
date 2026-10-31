// Loads apps/server/config/models.yaml (03 §5.10, ADR-018), validated with zod. Read-only. No keys: the file
// never has them and this module only reports whether the variable exists (presence, never the value).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import type { ModerationProvider } from "../providers/moderation.ts";

export const MODELS_CONFIG_PATH = fileURLToPath(new URL("../../config/models.yaml", import.meta.url));

const Role = z.strictObject({
  provider: z.enum(["gemini-text"]),
  model: z.string().min(1),
  maxOutputTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

const VoiceRole = z.strictObject({
  provider: z.enum(["gemini-live"]),
  model: z.string().min(1),
  openTimeoutMs: z.number().int().positive(),
  maxReconnects: z.number().int().nonnegative(),
});

const PerM = z.number().nonnegative();
/** Per-adapter rates (US$; 03 §5.9): tokens per million, STT per minute, TTS per million characters. */
export const PricesSchema = z.strictObject({
  version: z.string(),
  source: z.string(),
  adapters: z.strictObject({
    "gemini-live": z.strictObject({ audioInPerM: PerM, audioOutPerM: PerM, textInPerM: PerM, textOutPerM: PerM }),
    cascade: z.strictObject({ sttPerMin: PerM, textInPerM: PerM, textOutPerM: PerM, ttsPerMChars: PerM }),
  }),
});
export type Prices = z.infer<typeof PricesSchema>;

export const ModelsConfigSchema = z.strictObject({
  /** A2 (ADR-027): `judge` labels each exchange of a meters conversation (JSON; the code sums). */
  roles: z.strictObject({ textNpc: Role, observer: Role, judge: Role, npcVoice: VoiceRole }),
  voice: z.strictObject({
    npc: z.strictObject({ adapter: z.enum(["live", "cascade"]) }),
    observer: z.strictObject({ source: z.enum(["adapter"]) }),
    voices: z.strictObject({ default: z.string().min(1), byNpc: z.record(z.string(), z.string().min(1)) }),
    languageCode: z.string().min(2),
    clipTtlMs: z.number().int().positive(),
  }),
  observer: z.strictObject({ liveGrammarSignals: z.boolean() }),
  scene: z.strictObject({
    softCapMs: z.number().int().positive(),
    hardCapMs: z.number().int().positive(),
    turnTimerMs: z.number().int().positive(),
  }).refine((s) => s.softCapMs < s.hardCapMs, { message: "softCapMs tiene que ser menor que hardCapMs" }),
  /** The moderation "classifier" layer (03 §7.7, F4.2). `none`: only the lists and rules run. */
  moderation: z.strictObject({ classifier: z.enum(["none"]) }),
  prices: PricesSchema,
  cost: z.strictObject({ alertUsdPerMin: z.number().positive(), windowScenes: z.number().int().positive() }),
});
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ModelRole = ModelsConfig["roles"]["textNpc"];

/** Reads and validates the configuration; fails clearly with the path of the invalid field. */
export function loadModelsConfig(path: string = MODELS_CONFIG_PATH): ModelsConfig {
  const parsed = ModelsConfigSchema.safeParse(parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`models.yaml inválido: ${first ? `${first.path.join(".")}: ${first.message}` : "error"}`);
  }
  return parsed.data;
}

/** Name of the provider key variable (03 §4.4). */
export const GEMINI_KEY_VAR = "LG_GEMINI_API_KEY";

/** Presence of the key, never its value. */
export const hasGeminiKey = (env: Record<string, string | undefined>): boolean => (env[GEMINI_KEY_VAR] ?? "") !== "";

/** The configured moderation classifier (F4.2). For now only `none`: a real provider needs a key (D-027). */
export function moderationProviderFromConfig(models: ModelsConfig): ModerationProvider | null {
  switch (models.moderation.classifier) {
    case "none":
      return null;
  }
}
