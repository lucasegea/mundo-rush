// Shared reads of director mode (03 §6.5.2, D-188): the CLI and the MCP server are shells over this.
// They read `.director/` and `content/`; they write nothing.
import { existsSync, readFileSync } from "node:fs";
import { compilarContenido } from "@lg/content-schema";
import { DirectorSnapshotSchema, type DirectorSnapshot, type JournalEvent } from "@lg/protocol/director";
import { leerContenido } from "../../../scripts/content/build.ts";
import { statePath } from "./files.ts";
import { readSessionEvents, sessionIds } from "./journal.ts";

/** The last snapshot the plugin wrote, or null if there is none (the game did not run with `npm run dev:director`). */
export function readState(root: string): DirectorSnapshot | null {
  const path = statePath(root);
  if (!existsSync(path)) return null;
  return DirectorSnapshotSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export interface JournalQuery {
  /** Session to read; by default the most recent. */
  session?: string;
  /** Only the last N events. */
  tail?: number;
}

export interface JournalRead {
  sessionId: string | null;
  events: JournalEvent[];
}

export function readJournal(root: string, query: JournalQuery = {}): JournalRead {
  const sessionId = query.session ?? sessionIds(root)[0] ?? null;
  if (sessionId === null) return { sessionId: null, events: [] };
  const events = readSessionEvents(root, sessionId);
  const tail = query.tail;
  return { sessionId, events: tail !== undefined && tail >= 0 ? events.slice(Math.max(0, events.length - tail)) : events };
}

export interface SessionInfo {
  id: string;
  events: number;
  startedAt: string | null;
  lastAt: string | null;
  ended: boolean;
  npcsTalked: string[];
}

/** Journal sessions, newest to oldest, with a summary. */
export function listSessions(root: string): SessionInfo[] {
  return sessionIds(root).map((id) => {
    const events = readSessionEvents(root, id);
    const npcs = new Set(events.flatMap((e) => (e.type === "scene.start" && e.npcId ? [e.npcId] : [])));
    return {
      id,
      events: events.length,
      startedAt: events.find((e) => e.type === "session.start")?.at ?? events[0]?.at ?? null,
      lastAt: events[events.length - 1]?.at ?? null,
      ended: events.some((e) => e.type === "session.end"),
      npcsTalked: [...npcs],
    };
  });
}

export interface ContentLookup {
  id: string;
  file: string;
  text: string;
}

/** Where a content id is defined (`NPC-NELL`, `M1.1`, `M1.1-E1`, `SAB-MATE`, `test`…) and its YAML. */
export function lookupContent(root: string, id: string): ContentLookup | null {
  const files = leerContenido(root);
  const { conjunto } = compilarContenido(files);
  for (const [file, ids] of conjunto.idsPorArchivo) {
    if (ids.includes(id)) return { id, file, text: files.find((f) => f.ruta === file)?.texto ?? "" };
  }
  const scene = conjunto.misiones.find((m) => m.data.escenas.some((e) => e.escena_id === id));
  return scene ? { id, file: scene.archivo, text: files.find((f) => f.ruta === scene.archivo)?.texto ?? "" } : null;
}

/** "hace 3 s" / "hace 2 min": how old the snapshot is (if the game was closed, the assistant sees it). */
const age = (at: string, now: number): string => {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  return s < 120 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
};

/** A readable line: diorama, tile, nearby NPC, mission and step (03 §6.5.2). */
export function formatWhere(s: DirectorSnapshot | null, now: number = Date.now()): string {
  if (!s) return "sin estado: el juego no corre con `npm run dev:director` (o todavía no mandó nada)";
  const tile = s.player.tile ? `tile (${s.player.tile.x},${s.player.tile.y})` : "fuera del mapa";
  const npc = s.nearby.find((id) => id.startsWith("NPC-")) ?? "ninguno";
  const scene = s.scene
    ? `misión ${s.scene.missionId ?? "—"} · escena ${s.scene.sceneId ?? "—"} · paso ${s.scene.step}`
    : "misión — · sin escena";
  const errors = s.contentErrors.length > 0 ? ` · ${s.contentErrors.length} error(es) de contenido` : "";
  return `${s.diorama ?? "sin diorama"} · ${tile} · NPC cerca: ${npc} · ${scene}${errors} · ${age(s.at, now)}`;
}
