// Composición del servidor (F4.1): HTTP + WS de escena en un proceso (03 §4.2). main.ts la arranca con los adaptadores
// reales; los tests, con el modelo falso, evidencia en memoria o en un directorio temporal, y reloj/temporizadores falsos.
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

/** Reloj del proceso (el núcleo nunca lee la hora; la inyecta la app, R4). */
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
  /** F5.1a: adaptador de voz elegido por configuración (providers/voice.ts); null o ausente, sin voz. */
  voice?: VoiceProviderFactory | null;
  ledger?: CostLedger;
  onCostAlert?: (alert: CostAlert) => void;
  onCostError?: (message: string) => void;
  /** F5.2: ganchos de conversación de cada escena (scene-runtime/hooks.ts). */
  conversation?: ConversationHooks;
  /**
   * A2 (ADR-027): con el juez y el almacén de encuentros, el servidor enchufa el sistema de conversación por medidores
   * (si no se pasaron otros ganchos) y aplica los reinicios de desarrollo de misiones al leer el progreso.
   */
  judgeModel?: TextModelProvider;
  encounters?: EncounterStore;
  /** Diagnóstico del sistema de conversación (sin texto de la conversación). */
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
  // Un libro de costos por proceso (el promedio móvil cruza escenas y conexiones).
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
 * Proveedores de texto reales desde la configuración: con la clave presente, Gemini; sin clave, uno que falla claro
 * (la escena sigue y el cliente recibe `model_unavailable`). Nunca se lee ni se imprime el valor de la clave.
 */
export function textProvidersFromEnv(models: ModelsConfig, env: Record<string, string | undefined>):
  { npcModel: TextModelProvider; observerModel: TextModelProvider; judgeModel: TextModelProvider } {
  // F4.2: modelos guionados para recorrer el flujo sin clave (LG_FAKE_MODELS=1), solo en modo operador.
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
 * Almacenes del proceso. Con `LG_FAKE_MODELS=1` los resultados son de mentira (el observador guionado da todo por
 * cumplido): van a memoria y mueren con el proceso, para que nunca entren al log real del operador
 * (apps/server/data/), que F7 lee como progreso. Sin la bandera, los archivos de siempre (D-157).
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
 * Rutas por defecto de los archivos de progreso (D-812). Sin universo, o con U-CAMPESINO, las de siempre; con otro,
 * el id va antes de la extensión. El libro de costos es gasto, no progreso: no se parte por universo.
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

/** D-812: universo no por defecto de `LG_UNIVERSE`, validado antes de tocar una ruta; undefined si hay que usar los archivos de siempre. */
function universeSuffix(env: Record<string, string | undefined>): string | undefined {
  const id = env["LG_UNIVERSE"] ?? "";
  if (id === "" || id === DEFAULT_UNIVERSE) return undefined;
  if (!UNIVERSE_ID.test(id)) throw new Error(`LG_UNIVERSE inválido: "${id}" (se espera U-<MAYÚSCULAS, dígitos o guiones>)`);
  return id;
}

/** `dir/evidence.jsonl` + `U-X` → `dir/evidence.U-X.jsonl` (el sufijo va antes de la extensión). */
function withUniverse(path: string, universe: string | undefined): string {
  if (!universe) return path;
  const dot = path.lastIndexOf(".");
  return `${path.slice(0, dot)}.${universe}${path.slice(dot)}`;
}
