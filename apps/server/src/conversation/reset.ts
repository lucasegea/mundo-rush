// Development reset of a conversation encounter (A2, ADR-027 "Replay"): to replay the chat with an
// NPC from scratch without touching the rest of the real progress. Deletes the encounter state (what you know about the NPC, the
// meters) and records a reset of the missions whose scene uses that sheet: the evidence log is append-only and is not
// touched; when progress is read, anything from those missions dated up to the reset stops counting (progress.ts withoutResets).
import type { FichaConversacion, Mision } from "@lg/content-schema";
import type { ServerContent } from "../content/loader.ts";
import type { EncounterStore } from "../store/encounters.ts";

export interface ResetResult {
  /** Sheets reset (CONV-*). */
  sheets: string[];
  /** Missions whose earlier evidence stops counting. */
  missions: string[];
  /** Sheets that had saved state. */
  cleared: string[];
}

export class ResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResetError";
  }
}

/** `target`: an NPC (NPC-*) or a sheet (CONV-*). */
export function resetEncounter(opts: { store: EncounterStore; content: ServerContent; target: string; accountId: string; at: string }): ResetResult {
  const sheets = (Array.isArray(opts.content["conversaciones.json"]) ? opts.content["conversaciones.json"] : []) as FichaConversacion[];
  const missions = (Array.isArray(opts.content["misiones.json"]) ? opts.content["misiones.json"] : []) as Mision[];
  const chosen = sheets.filter((s) => s.id === opts.target || s.npc === opts.target);
  if (chosen.length === 0) throw new ResetError(`no hay ficha de conversación para ${opts.target} (¿corriste npm run build:content?)`);
  const ids = new Set(chosen.map((s) => s.id));
  const missionIds = missions.filter((m) => m.escenas.some((e) => e.conversacion !== undefined && ids.has(e.conversacion))).map((m) => m.id);
  const cleared = chosen.filter((s) => opts.store.remove(opts.accountId, s.id)).map((s) => s.id);
  for (const missionId of missionIds) opts.store.addReset({ accountId: opts.accountId, missionId, at: opts.at });
  return { sheets: [...ids], missions: missionIds, cleared };
}
