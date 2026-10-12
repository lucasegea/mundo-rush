// conversation/ — sistema de conversación por medidores (ADR-027): tipos de dato, motor puro, ayuda y vista del HUD.
// Compartido por servidor y cliente. Importa con extensión .ts: el servidor lo corre con type stripping por la subruta
// `@lg/core/conversation` (igual que scene/).
export * from "./types.ts";
export * from "./engine.ts";
