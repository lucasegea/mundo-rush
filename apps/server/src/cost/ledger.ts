// Libro de costos de voz (03 §5.9, §5.11; D-027, D-157): una entrada por `usage` de turno y una por escena, con el
// costo calculado al escribir con la tabla de precios de models.yaml y POR ADAPTADOR. Adaptador en memoria (tests) y de
// archivo append-only (apps/server/data/cost-ledger.jsonl, gitignored). Alerta cuando el promedio móvil de US$/min de
// las últimas escenas supera el umbral; nunca corta el juego (el uso del operador no tiene tope, D-135).
// Este módulo es uno de los dos lugares de apps/server que escriben a disco (lint, D-108) y rechaza binarios.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ModelsConfig, Prices } from "../config/models.ts";
import type { VoiceUsage } from "../providers/types.ts";
import { assertNoBinary } from "../store/evidence.ts";

export const DEFAULT_COST_LEDGER_PATH = fileURLToPath(new URL("../../data/cost-ledger.jsonl", import.meta.url));

const Count = z.number().nonnegative();
const UsageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("tokens"), audioIn: Count, audioOut: Count, textIn: Count, textOut: Count }),
  z.strictObject({ kind: z.literal("cascade"), sttSeconds: Count, textIn: Count, textOut: Count, ttsChars: Count }),
]);

const Base = {
  at: z.iso.datetime(),
  sceneRunId: z.string().min(1),
  accountId: z.string().min(1),
  adapter: z.string().min(1),
  usd: z.number().nonnegative(),
  priceTableVersion: z.string(),
};

export const CostEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("turn"), ...Base, turnId: z.string().nullable(), role: z.enum(["npcVoice"]),
    provider: z.string().min(1), model: z.string().min(1), usage: UsageSchema,
  }),
  z.strictObject({ kind: z.literal("scene"), ...Base, wallSeconds: z.number().nonnegative(), turns: z.number().int().nonnegative() }),
]);
export type CostEntry = z.infer<typeof CostEntrySchema>;
export type TurnCostEntry = Extract<CostEntry, { kind: "turn" }>;
export type SceneCostEntry = Extract<CostEntry, { kind: "scene" }>;

export class UnknownPriceError extends Error {
  constructor(adapter: string, kind: string) {
    super(`sin tarifa para el adaptador ${adapter} con uso ${kind} (models.yaml prices.adapters)`);
    this.name = "UnknownPriceError";
  }
}

/** US$ de un `usage` con la tarifa de su adaptador. Tokens: por millón; STT: por minuto; TTS: por millón de caracteres. */
export function usdForUsage(adapter: string, usage: VoiceUsage, prices: Prices): number {
  const M = 1_000_000;
  if (usage.kind === "tokens") {
    if (adapter !== "gemini-live") throw new UnknownPriceError(adapter, usage.kind);
    const p = prices.adapters["gemini-live"];
    return (usage.audioIn * p.audioInPerM + usage.audioOut * p.audioOutPerM + usage.textIn * p.textInPerM + usage.textOut * p.textOutPerM) / M;
  }
  if (adapter !== "cascade") throw new UnknownPriceError(adapter, usage.kind);
  const p = prices.adapters.cascade;
  return (usage.sttSeconds / 60) * p.sttPerMin + (usage.textIn * p.textInPerM + usage.textOut * p.textOutPerM + usage.ttsChars * p.ttsPerMChars) / M;
}

export interface CostAlert {
  /** Promedio móvil en US$ por minuto de escena de voz. */
  usdPerMin: number;
  thresholdUsdPerMin: number;
  scenes: number;
}

export interface CostPolicy {
  prices: Prices;
  alertUsdPerMin: number;
  windowScenes: number;
}

/** Promedio móvil de las últimas `window` escenas: US$ totales / minutos totales. Sin minutos, 0. */
export function rollingUsdPerMin(scenes: readonly SceneCostEntry[], window: number): { usdPerMin: number; scenes: number } {
  const last = scenes.slice(-window);
  const minutes = last.reduce((n, s) => n + s.wallSeconds / 60, 0);
  const usd = last.reduce((n, s) => n + s.usd, 0);
  return { usdPerMin: minutes > 0 ? usd / minutes : 0, scenes: last.length };
}

export interface TurnCostInput {
  at: string;
  sceneRunId: string;
  turnId: string | null;
  accountId: string;
  adapter: string;
  provider: string;
  model: string;
  usage: VoiceUsage;
}

export interface SceneCloseInput {
  at: string;
  sceneRunId: string;
  accountId: string;
  adapter: string;
  wallSeconds: number;
}

export interface CostLedger {
  recordTurn(input: TurnCostInput): TurnCostEntry;
  /** Cierra la escena: suma sus turnos, escribe la fila de escena y devuelve la alerta si el promedio móvil la dispara. */
  closeScene(input: SceneCloseInput): { entry: SceneCostEntry; alert: CostAlert | null };
  entries(): CostEntry[];
}

/** Valida antes de guardar: sin binarios (D-108) y con la forma exacta del esquema. */
function checked(entry: CostEntry): CostEntry {
  assertNoBinary(entry);
  return CostEntrySchema.parse(entry);
}

function createLedger(policy: CostPolicy, initial: CostEntry[], persist: (e: CostEntry) => void): CostLedger {
  const all = [...initial];
  const add = <T extends CostEntry>(e: T): T => {
    const ok = checked(e) as T;
    persist(ok);
    all.push(ok);
    return ok;
  };
  return {
    recordTurn(input) {
      assertNoBinary(input);
      const usd = usdForUsage(input.adapter, input.usage, policy.prices);
      return add<TurnCostEntry>({ kind: "turn", role: "npcVoice", ...input, usd, priceTableVersion: policy.prices.version });
    },
    closeScene(input) {
      const turns = all.filter((e): e is TurnCostEntry => e.kind === "turn" && e.sceneRunId === input.sceneRunId);
      const usd = turns.reduce((n, t) => n + t.usd, 0);
      const entry = add<SceneCostEntry>({ kind: "scene", ...input, usd, turns: turns.length, priceTableVersion: policy.prices.version });
      const scenes = all.filter((e): e is SceneCostEntry => e.kind === "scene");
      const avg = rollingUsdPerMin(scenes, policy.windowScenes);
      const alert = avg.usdPerMin > policy.alertUsdPerMin
        ? { usdPerMin: avg.usdPerMin, thresholdUsdPerMin: policy.alertUsdPerMin, scenes: avg.scenes } : null;
      return { entry, alert };
    },
    entries: () => [...all],
  };
}

export const costPolicyFromConfig = (m: ModelsConfig): CostPolicy =>
  ({ prices: m.prices, alertUsdPerMin: m.cost.alertUsdPerMin, windowScenes: m.cost.windowScenes });

export const createMemoryCostLedger = (policy: CostPolicy): CostLedger => createLedger(policy, [], () => {});

/** Lee el JSONL saltando líneas corruptas. */
export function readCostLedgerFile(path: string): CostEntry[] {
  if (!existsSync(path)) return [];
  const out: CostEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = CostEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // línea corrupta: se ignora
    }
  }
  return out;
}

/** Adaptador de archivo: una línea JSON por entrada, solo agregar; el promedio móvil sigue entre reinicios. */
export function createFileCostLedger(policy: CostPolicy, path: string = DEFAULT_COST_LEDGER_PATH): CostLedger {
  const initial = readCostLedgerFile(path);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  let needsNewline = raw.length > 0 && !raw.endsWith("\n");
  return createLedger(policy, initial, (e) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${needsNewline ? "\n" : ""}${JSON.stringify(e)}\n`, "utf8");
    needsNewline = false;
  });
}
