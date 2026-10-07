// Servidor MCP por stdio del modo director (03 §6.5.2, D-188), registrado en .mcp.json. Cuatro herramientas de solo
// lectura, cáscaras sobre src/read.ts: director_state, director_journal, director_sessions, director_content_lookup.
// Sin red: stdio local. Claude Code las usa para saber dónde está el operador y qué pasó.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { REPO_ROOT } from "./files.ts";
import { formatWhere, listSessions, lookupContent, readJournal, readState } from "./read.ts";

export const TOOL_NAMES = ["director_state", "director_journal", "director_sessions", "director_content_lookup"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Lo que devuelve cada herramienta: exactamente lo que devuelve read.ts. */
export function directorTools(root: string) {
  return {
    director_state: () => readState(root),
    director_journal: (a: { session?: string | undefined; tail?: number | undefined }) =>
      readJournal(root, { ...(a.session ? { session: a.session } : {}), ...(a.tail !== undefined ? { tail: a.tail } : {}) }),
    director_sessions: () => listSessions(root),
    director_content_lookup: (a: { id: string }) => lookupContent(root, a.id),
  } satisfies Record<ToolName, (args: never) => unknown>;
}

const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

export function createDirectorMcpServer(root: string = REPO_ROOT): McpServer {
  const tools = directorTools(root);
  const server = new McpServer({ name: "lg-director", version: "0.1.0" });
  server.registerTool("director_state", {
    description: "Estado vivo del juego mientras el operador juega con `npm run dev:director`: diorama, tile, NPC cercano, escena, recorrido, NPCs con los que habló, diálogo reciente, flags y errores de contenido. Incluye `where`, una línea legible. null si el juego no corre.",
  }, () => {
    const state = tools.director_state();
    return asText({ where: formatWhere(state), state });
  });
  server.registerTool("director_journal", {
    description: "Eventos del diario de la sesión de prueba (por defecto la más reciente): movimientos de tile, escenas, líneas finales del diálogo, recargas de contenido.",
    inputSchema: { session: z.string().optional().describe("id de sesión (ver director_sessions)"), tail: z.number().int().min(0).optional().describe("solo los últimos N eventos") },
  }, (args) => asText(tools.director_journal(args)));
  server.registerTool("director_sessions", {
    description: "Sesiones del diario, de la más nueva a la más vieja, con cantidad de eventos y NPCs con los que se habló.",
  }, () => asText(tools.director_sessions()));
  server.registerTool("director_content_lookup", {
    description: "Dónde está definido un id de contenido (NPC-*, M*, escena, SAB-*, SITIO-*, diorama) y el texto de su YAML.",
    inputSchema: { id: z.string().min(1).describe("id de contenido, p. ej. NPC-NELL o M1.1") },
  }, (args) => asText(tools.director_content_lookup(args)));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createDirectorMcpServer().connect(new StdioServerTransport());
}
