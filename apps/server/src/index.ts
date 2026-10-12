// @lg/server (03 §4.2): HTTP + WS en un proceso. F1.1b: /health. FD0: cargador de contenido compilado. Arranca en src/main.ts.
export { createHttpServer, DEFAULT_HOST, DEFAULT_PORT, handle, listenOptions, SERVICE_NAME } from "./http.ts";
export type { Envelope, ErrorCode, HealthBody } from "./http.ts";
export { createContentLoader, GENERATED_CONTENT_DIR, readGeneratedContent } from "./content/loader.ts";
export type { ContentLoader, LoaderOptions, ServerContent, WatchDir } from "./content/loader.ts";
// F4.1: composición, escena por texto, observador, evidencia y configuración de modelos.
export { createGameServer, systemClock, textProvidersFromEnv } from "./app.ts";
export type { GameServer, GameServerOptions } from "./app.ts";
export { createSceneSession, NOT_INTRODUCED_LINE, realScheduler } from "./scene-runtime/runtime.ts";
export type { SceneDeps, SceneSession, Scheduler } from "./scene-runtime/runtime.ts";
// F5.2: ganchos de conversación (la costura para sistemas que leen la escena turno a turno).
export type { ConversationHooks, ConversationSceneEnd, ConversationSceneInfo, ConversationTurn } from "./scene-runtime/hooks.ts";
export { createFileEvidenceStore, createMemoryEvidenceStore } from "./store/evidence.ts";
export type { EvidenceStore } from "./store/evidence.ts";
export { loadModelsConfig, MODELS_CONFIG_PATH } from "./config/models.ts";
export type { ModelsConfig } from "./config/models.ts";
export type { TextModelProvider, TextRequest, TextResponse } from "./providers/text.ts";
