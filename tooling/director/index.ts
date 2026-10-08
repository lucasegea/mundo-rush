// tooling/director — modo director, solo desarrollo (03 §6.5, ADR-026). Workspace `@lg/director` (private: true).
// Nadie del producto lo importa (apps/**, packages/** y scripts/**: zona de lint `apps → tooling`).
// El plugin se registra solo en ./vite.config.ts; la CLI es src/cli.ts y el servidor MCP src/mcp.ts.
export { createDirectorHandler, createDirectorRuntime, directorPlugin, isLocalHost } from "./src/plugin.ts";
export { SERVER_ENTRY, serverLaunch, startScenesServer } from "./src/server.ts";
export { formatWhere, listSessions, lookupContent, readJournal, readState } from "./src/read.ts";
