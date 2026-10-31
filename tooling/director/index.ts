// tooling/director — director mode, development only (03 §6.5, ADR-026). Workspace `@lg/director` (private: true).
// Nothing in the product imports it (apps/**, packages/** and scripts/**: lint zone `apps → tooling`).
// The plugin is registered only in ./vite.config.ts; the CLI is src/cli.ts and the MCP server src/mcp.ts.
export { createDirectorHandler, createDirectorRuntime, directorPlugin, isLocalHost } from "./src/plugin.ts";
export { SERVER_ENTRY, serverLaunch, startScenesServer } from "./src/server.ts";
export { formatWhere, listSessions, lookupContent, readJournal, readState } from "./src/read.ts";
