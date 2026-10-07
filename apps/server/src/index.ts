// @lg/server (03 §4.2): HTTP en un proceso. F1.1b: /health. FD0: cargador de contenido compilado. Arranca en src/main.ts.
export { createHttpServer, DEFAULT_HOST, DEFAULT_PORT, handle, listenOptions, SERVICE_NAME } from "./http.ts";
export type { Envelope, ErrorCode, HealthBody } from "./http.ts";
export { createContentLoader, GENERATED_CONTENT_DIR, readGeneratedContent } from "./content/loader.ts";
export type { ContentLoader, LoaderOptions, ServerContent, WatchDir } from "./content/loader.ts";
