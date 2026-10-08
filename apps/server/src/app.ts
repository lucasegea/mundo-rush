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
import { FAKE_MODELS_VAR, scriptedNpcProvider, scriptedObserverProvider } from "./providers/scripted.ts";
import { createSceneSession, type Scheduler } from "./scene-runtime/runtime.ts";
import { createFileEvidenceStore, createMemoryEvidenceStore, DEFAULT_EVIDENCE_PATH, type EvidenceStore } from "./store/evidence.ts";
import type { ModerationProvider } from "./providers/moderation.ts";
import { createFileSafetyStore, createMemorySafetyStore, DEFAULT_SAFETY_PATH, type SafetyEventStore } from "./store/safety.ts";

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
  const server = createHttpServer(sceneRoutes(tokens, operatorMode));
  const gateway = attachSceneGateway(server, {
    tokens, operatorMode,
    openSession: (send) => createSceneSession({
      content: opts.content, npcModel: opts.npcModel, observerModel: opts.observerModel, models: opts.models,
      evidence: opts.evidence, accountId: OPERATOR_ACCOUNT, clock,
      ...(opts.scheduler ? { scheduler: opts.scheduler } : {}), ...(opts.newId ? { newId: opts.newId } : {}),
      ...(opts.moderation !== undefined ? { moderation: opts.moderation } : {}), ...(opts.safety ? { safety: opts.safety } : {}),
    }, send),
  });
  return { server, operatorMode, close: () => gateway.close() };
}

/**
 * Proveedores de texto reales desde la configuración: con la clave presente, Gemini; sin clave, uno que falla claro
 * (la escena sigue y el cliente recibe `model_unavailable`). Nunca se lee ni se imprime el valor de la clave.
 */
export function textProvidersFromEnv(models: ModelsConfig, env: Record<string, string | undefined>):
  { npcModel: TextModelProvider; observerModel: TextModelProvider } {
  // F4.2: modelos guionados para recorrer el flujo sin clave (LG_FAKE_MODELS=1), solo en modo operador.
  if (env[FAKE_MODELS_VAR] === "1" && operatorModeOn(env)) return { npcModel: scriptedNpcProvider(), observerModel: scriptedObserverProvider() };
  if (!hasGeminiKey(env)) {
    const none = unavailableProvider(`sin ${GEMINI_KEY_VAR}: el modelo de texto no está configurado`);
    return { npcModel: none, observerModel: none };
  }
  const key = env[GEMINI_KEY_VAR] ?? "";
  return {
    npcModel: createGeminiTextProvider(key, models.roles.textNpc.model),
    observerModel: createGeminiTextProvider(key, models.roles.observer.model),
  };
}

/**
 * Almacenes del proceso. Con `LG_FAKE_MODELS=1` los resultados son de mentira (el observador guionado da todo por
 * cumplido): van a memoria y mueren con el proceso, para que nunca entren al log real del operador
 * (apps/server/data/), que F7 lee como progreso. Sin la bandera, los archivos de siempre (D-157).
 */
export function storesFromEnv(
  env: Record<string, string | undefined>,
  paths: { evidence?: string; safety?: string } = {},
): { evidence: EvidenceStore; safety: SafetyEventStore; persistent: boolean } {
  if (env[FAKE_MODELS_VAR] === "1") return { evidence: createMemoryEvidenceStore(), safety: createMemorySafetyStore(), persistent: false };
  return {
    evidence: createFileEvidenceStore(paths.evidence ?? DEFAULT_EVIDENCE_PATH),
    safety: createFileSafetyStore(paths.safety ?? DEFAULT_SAFETY_PATH),
    persistent: true,
  };
}
