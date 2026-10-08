// Carga de apps/server/config/models.yaml (03 §5.10, ADR-018), validada con zod. Solo lectura. Sin claves: el archivo
// nunca las tiene y este módulo solo informa si la variable existe (presencia, nunca el valor).
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

export const ModelsConfigSchema = z.strictObject({
  roles: z.strictObject({ textNpc: Role, observer: Role }),
  voice: z.strictObject({ npc: z.strictObject({ adapter: z.enum(["live", "cascade"]) }) }),
  observer: z.strictObject({ liveGrammarSignals: z.boolean() }),
  scene: z.strictObject({
    softCapMs: z.number().int().positive(),
    hardCapMs: z.number().int().positive(),
    turnTimerMs: z.number().int().positive(),
  }).refine((s) => s.softCapMs < s.hardCapMs, { message: "softCapMs tiene que ser menor que hardCapMs" }),
  /** Capa "clasificador" de la moderación (03 §7.7, F4.2). `none`: corren solo las listas y las reglas. */
  moderation: z.strictObject({ classifier: z.enum(["none"]) }),
  prices: z.strictObject({ version: z.string(), source: z.string() }),
});
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ModelRole = ModelsConfig["roles"]["textNpc"];

/** Lee y valida la configuración; falla claro con la ruta del campo inválido. */
export function loadModelsConfig(path: string = MODELS_CONFIG_PATH): ModelsConfig {
  const parsed = ModelsConfigSchema.safeParse(parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`models.yaml inválido: ${first ? `${first.path.join(".")}: ${first.message}` : "error"}`);
  }
  return parsed.data;
}

/** Nombre de la variable de la clave del proveedor (03 §4.4). */
export const GEMINI_KEY_VAR = "LG_GEMINI_API_KEY";

/** Presencia de la clave, nunca su valor. */
export const hasGeminiKey = (env: Record<string, string | undefined>): boolean => (env[GEMINI_KEY_VAR] ?? "") !== "";

/** El clasificador de moderación configurado (F4.2). Hoy solo `none`: un proveedor real necesita clave (D-027). */
export function moderationProviderFromConfig(models: ModelsConfig): ModerationProvider | null {
  switch (models.moderation.classifier) {
    case "none":
      return null;
  }
}
