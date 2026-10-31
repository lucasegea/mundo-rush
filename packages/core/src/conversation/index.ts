// conversation/ — meters-based conversation system (ADR-027): data types, pure engine, help and HUD view.
// Shared by server and client. Imports with the .ts extension: the server runs it with type stripping through the subpath
// `@lg/core/conversation` (same as scene/).
export * from "./types.ts";
export * from "./engine.ts";
