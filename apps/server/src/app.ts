// Server composition (F4.1): HTTP + scene WS in one process (03 §4.2). main.ts starts it with the real adapters;
// tests use the fake model, in-memory evidence or a temp directory, and fake clock/timers.
import type { Server } from "node:http";
import type { Clock } from "@lg/core";
import type { ServerContent } from "./content/loader.ts";
import { GEMINI_KEY_VAR, hasGeminiKey, type ModelsConfig } from "./config/models.ts";
import { OPERATOR_ACCOUNT, operatorModeOn } from "./config/operator.ts";
import { attachSceneGateway, createTokenRegistry, sceneRoutes } from "./gateway/scene.ts";
import { createHttpServer } from "./http.ts";
import { createGeminiTextProvider } from "./providers/gemini-text.ts";
import { unavailableProvider, type TextModelProvider } from "./providers/text.ts";
import { FAKE_MODELS_VAR, scriptedJudgeProvider, scriptedNpcProvider, scriptedObserverProvider } from "./providers/scripted.ts";
import { createSceneSession, type Scheduler } from "./scene-runtime/runtime.ts";
import { createFileEvidenceStore, createMemoryEvidenceStore, DEFAULT_EVIDENCE_PATH, type EvidenceStore } from "./store/evidence.ts";
import type { ModerationProvider } from "./providers/moderation.ts";
import { createFileSafetyStore, createMemorySafetyStore, DEFAULT_SAFETY_PATH, type SafetyEventStore } from "./store/safety.ts";
import { costPolicyFromConfig, createFileCostLedger, createMemoryCostLedger, DEFAULT_COST_LEDGER_PATH, type CostAlert, type CostLedger } from "./cost/ledger.ts";
import type { VoiceProviderFactory } from "./providers/types.ts";
import type { ConversationHooks } from "./scene-runtime/hooks.ts";
import { createConversationSystem } from "./conversation/system.ts";
import { createFileEncounterStore, createMemoryEncounterStore, DEFAULT_ENCOUNTERS_PATH, type EncounterStore } from "./store/encounters.ts";

/** Process clock (the core never reads the time; the app injects it, R4). */
export const systemClock: Clock = { now: () => Date.now() };

export interface GameServerOptions {
  env: Record<string, string | undefined>;
  content: () => ServerContent;
  models: ModelsConfig;
  evidence: EvidenceStore;
  npcModel: TextModelProvider;
  observerModel: TextModelProvider;
  clock?: Clock;
  scheduler?: Scheduler;
  newId?: () => string;
  moderation?: ModerationProvider | null;
  safety?: SafetyEventStore;
  /** F5.1a: voice adapter chosen by configuration (providers/voice.ts); null or absent, no voice. */
  voice?: VoiceProviderFactory | null;
  ledger?: CostLedger;
  onCostAlert?: (alert: CostAlert) => void;
  onCostError?: (message: string) => void;
  /** F5.2: per-scene conversation hooks (scene-runtime/hooks.ts). */
  conversation?: ConversationHooks;
  /**
   * A2 (ADR-027): with the judge and the encounter store, the server plugs in the meters conversation system
   * (if no other hooks were passed) and applies the mission development resets when reading progress.
   */
  judgeModel?: TextModelProvider;
  encounters?: EncounterStore;
  /** Conversation system diagnostics (no conversation text). */
  onConversationLog?: (message: string) => void;
}

export interface GameServer {
  server: Server;
  operatorMode: boolean;
  close(): void;
}

export function createGameServer(opts: GameServerOptions): GameServer {
  const clock = opts.clock ?? systemClock;
  const operatorMode = operatorModeOn(opts.env);
  const tokens = createTokenRegistry(clock);
  // One cost ledger per process (the moving average spans scenes and connections).
  const ledger = opts.ledger ?? createMemoryCostLedger(costPolicyFromConfig(opts.models));
  const server = createHttpServer(sceneRoutes(tokens, operatorMode));
  const encounters = opts.encounters;
  const conversation = opts.conversation ?? (opts.judgeModel && encounters ? createConversationSystem({
    judge: opts.judgeModel, role: opts.models.roles.judge, store: encounters,
    ...(opts.onConversationLog ? { log: opts.onConversationLog } : {}),
  }) : undefined);
  const gateway = attachSceneGateway(server, {
    tokens, operatorMode,
    openSession: (send, sendAudio) => createSceneSession({
      content: opts.content, npcModel: opts.npcModel, observerModel: opts.observerModel, models: opts.models,
      evidence: opts.evidence, accountId: OPERATOR_ACCOUNT, clock,
      ...(opts.scheduler ? { scheduler: opts.scheduler } : {}), ...(opts.newId ? { newId: opts.newId } : {}),
      ...(opts.moderation !== undefined ? { moderation: opts.moderation } : {}), ...(opts.safety ? { safety: opts.safety } : {}),
      ...(opts.voice !== undefined ? { voice: opts.voice } : {}), ledger,
      ...(opts.onCostAlert ? { onCostAlert: opts.onCostAlert } : {}), ...(opts.onCostError ? { onCostError: opts.onCostError } : {}),
      ...(conversation ? { conversation } : {}),
      ...(encounters ? { resets: () => encounters.resets(OPERATOR_ACCOUNT) } : {}),
    }, send, sendAudio),
  });
  return { server, operatorMode, close: () => gateway.close() };
}

/**
 * Real text providers from configuration: with the key present, Gemini; without a key, one that fails clearly
 * (the scene carries on and the client receives `model_unavailable`). The key value is never read or printed.
 */
export function textProvidersFromEnv(models: ModelsConfig, env: Record<string, string | undefined>):
  { npcModel: TextModelProvider; observerModel: TextModelProvider; judgeModel: TextModelProvider } {
  // F4.2: scripted models to walk through the flow without a key (LG_FAKE_MODELS=1), operator mode only.
  if (env[FAKE_MODELS_VAR] === "1" && operatorModeOn(env)) {
    return { npcModel: scriptedNpcProvider(), observerModel: scriptedObserverProvider(), judgeModel: scriptedJudgeProvider() };
  }
  if (!hasGeminiKey(env)) {
    const none = unavailableProvider(`sin ${GEMINI_KEY_VAR}: el modelo de texto no está configurado`);
    return { npcModel: none, observerModel: none, judgeModel: none };
  }
  const key = env[GEMINI_KEY_VAR] ?? "";
  return {
    npcModel: createGeminiTextProvider(key, models.roles.textNpc.model),
    observerModel: createGeminiTextProvider(key, models.roles.observer.model),
    judgeModel: createGeminiTextProvider(key, models.roles.judge.model),
  };
}

/**
 * Process stores. With `LG_FAKE_MODELS=1` the results are fake (the scripted observer marks everything as
 * fulfilled): they go to memory and die with the process, so they never enter the operator's real log
 * (apps/server/data/), which F7 reads as progress. Without the flag, the usual files (D-157).
 */
export function storesFromEnv(
  env: Record<string, string | undefined>,
  paths: { evidence?: string; safety?: string; costLedger?: string; encounters?: string } = {},
  models?: ModelsConfig,
): { evidence: EvidenceStore; safety: SafetyEventStore; ledger: CostLedger | null; encounters: EncounterStore; persistent: boolean } {
  const policy = models ? costPolicyFromConfig(models) : null;
  if (env[FAKE_MODELS_VAR] === "1") {
    return {
      evidence: createMemoryEvidenceStore(), safety: createMemorySafetyStore(), ledger: policy ? createMemoryCostLedger(policy) : null,
      encounters: createMemoryEncounterStore(), persistent: false,
    };
  }
  const defaults = progressPaths(env);
  return {
    evidence: createFileEvidenceStore(paths.evidence ?? defaults.evidence),
    safety: createFileSafetyStore(paths.safety ?? defaults.safety),
    ledger: policy ? createFileCostLedger(policy, paths.costLedger ?? defaults.costLedger) : null,
    encounters: createFileEncounterStore(paths.encounters ?? defaults.encounters),
    persistent: true,
  };
}

/**
 * Default paths of the progress files (D-812). With no universe, or with U-CAMPESINO, the usual ones; with another,
 * the id goes before the extension. The cost ledger is spend, not progress: it is not split by universe.
 */
export function progressPaths(env: Record<string, string | undefined>): { evidence: string; safety: string; costLedger: string; encounters: string } {
  const universe = universeSuffix(env);
  return {
    evidence: withUniverse(DEFAULT_EVIDENCE_PATH, universe),
    safety: withUniverse(DEFAULT_SAFETY_PATH, universe),
    costLedger: DEFAULT_COST_LEDGER_PATH,
    encounters: withUniverse(DEFAULT_ENCOUNTERS_PATH, universe),
  };
}

const UNIVERSE_ID = /^U-[A-Z0-9][A-Z0-9-]*$/;
const DEFAULT_UNIVERSE = "U-CAMPESINO";

/** D-812: non-default universe from `LG_UNIVERSE`, validated before touching a path; undefined if the usual files should be used. */
function universeSuffix(env: Record<string, string | undefined>): string | undefined {
  const id = env["LG_UNIVERSE"] ?? "";
  if (id === "" || id === DEFAULT_UNIVERSE) return undefined;
  if (!UNIVERSE_ID.test(id)) throw new Error(`LG_UNIVERSE inválido: "${id}" (se espera U-<MAYÚSCULAS, dígitos o guiones>)`);
  return id;
}

/** `dir/evidence.jsonl` + `U-X` → `dir/evidence.U-X.jsonl` (the suffix goes before the extension). */
function withUniverse(path: string, universe: string | undefined): string {
  if (!universe) return path;
  const dot = path.lastIndexOf(".");
  return `${path.slice(0, dot)}.${universe}${path.slice(dot)}`;
}
