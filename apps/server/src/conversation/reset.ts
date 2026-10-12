// Reinicio de desarrollo de un encuentro de conversación (A2, ADR-027 "Rejugar"): para volver a jugar la charla con un
// NPC desde cero sin tocar el resto del progreso real. Borra el estado del encuentro (lo que sabés del NPC, los
// medidores) y registra un reinicio de las misiones cuya escena usa esa ficha: el log de evidencia es append-only y no
// se toca; al leer el progreso, lo de esas misiones fechado hasta el reinicio deja de contar (progress.ts withoutResets).
import type { FichaConversacion, Mision } from "@lg/content-schema";
import type { ServerContent } from "../content/loader.ts";
import type { EncounterStore } from "../store/encounters.ts";

export interface ResetResult {
  /** Fichas reiniciadas (CONV-*). */
  sheets: string[];
  /** Misiones cuya evidencia previa deja de contar. */
  missions: string[];
  /** Fichas que tenían estado guardado. */
  cleared: string[];
}

export class ResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResetError";
  }
}

/** `target`: un NPC (NPC-*) o una ficha (CONV-*). */
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
