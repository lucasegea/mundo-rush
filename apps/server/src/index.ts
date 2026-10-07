// @lg/server (03 §4.2): HTTP en un proceso. F1.1b: /health. El proceso arranca en src/main.ts.
export { createHttpServer, DEFAULT_HOST, DEFAULT_PORT, handle, listenOptions, SERVICE_NAME } from "./http.ts";
export type { Envelope, ErrorCode, HealthBody } from "./http.ts";
