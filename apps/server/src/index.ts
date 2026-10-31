// @lg/server (03 §4.2): HTTP + WS in one process. F1.1b: /health. FD0: compiled content loader. Starts in src/main.ts.
export { createHttpServer, DEFAULT_HOST, DEFAULT_PORT, handle, listenOptions, SERVICE_NAME } from "./http.ts";
export type { Envelope, ErrorCode, HealthBody } from "./http.ts";
export { createContentLoader, GENERATED_CONTENT_DIR, readGeneratedContent } from "./content/loader.ts";
export type { ContentLoader, LoaderOptions, ServerContent, WatchDir } from "./content/loader.ts";
// F4.1: composition, text scene, observer, evidence and model configuration.
export { createGameServer, systemClock, textProvidersFromEnv } from "./app.ts";
export type { GameServer, GameServerOptions } from "./app.ts";
export { createSceneSession, NOT_INTRODUCED_LINE, realScheduler } from "./scene-runtime/runtime.ts";
export type { SceneDeps, SceneSession, Scheduler } from "./scene-runtime/runtime.ts";
// F5.2: conversation hooks (the seam for systems that read the scene turn by turn).
export type { ConversationHooks, ConversationSceneEnd, ConversationSceneInfo, ConversationTurn } from "./scene-runtime/hooks.ts";
export { createFileEvidenceStore, createMemoryEvidenceStore } from "./store/evidence.ts";
export type { EvidenceStore } from "./store/evidence.ts";
export { loadModelsConfig, MODELS_CONFIG_PATH } from "./config/models.ts";
export type { ModelsConfig } from "./config/models.ts";
export type { TextModelProvider, TextRequest, TextResponse } from "./providers/text.ts";
// A2 (ADR-027): meters conversation (judge + pure engine from @lg/core/conversation) and its encounter store.
export type { ConversationSceneControl } from "./scene-runtime/hooks.ts";
export { createConversationSystem } from "./conversation/system.ts";
export type { ConversationSystem, ConversationSystemDeps } from "./conversation/system.ts";
export { createFileEncounterStore, createMemoryEncounterStore, DEFAULT_ENCOUNTERS_PATH } from "./store/encounters.ts";
export type { EncounterStore, MissionResetRecord } from "./store/encounters.ts";
