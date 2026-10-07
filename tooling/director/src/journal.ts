// Diario de sesiones de prueba (03 §6.5.2, D-192): `.director/journal/<sessionId>.jsonl`, solo agregar.
// El escritor numera (`seq`) y valida cada evento contra el esquema; lo que no valida no se escribe.
// Se conservan las últimas 30 sesiones (prune).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  JOURNAL_KEEP_SESSIONS, JournalEventSchema, SessionIdSchema, type JournalEvent,
} from "@lg/protocol/director";
import { journalDir, journalPath } from "./files.ts";

export interface JournalAppend {
  written: JournalEvent[];
  rejected: number;
}

/** Último `seq` escrito en un archivo de sesión (−1 si está vacío o no existe). */
function lastSeq(path: string): number {
  if (!existsSync(path)) return -1;
  const lines = readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return -1;
  const parsed = JournalEventSchema.safeParse(JSON.parse(last));
  return parsed.success ? parsed.data.seq : lines.length - 1;
}

/** Escritor solo-agregar. `enrich` completa lo que el cliente no sabe (p. ej. gitSha de session.start). */
export function createJournalWriter(root: string, enrich: (e: Record<string, unknown>) => Record<string, unknown> = (e) => e) {
  const seqs = new Map<string, number>();
  return {
    append(sessionId: string, inputs: readonly unknown[]): JournalAppend {
      SessionIdSchema.parse(sessionId);
      const path = journalPath(root, sessionId);
      let seq = seqs.get(sessionId) ?? lastSeq(path);
      const written: JournalEvent[] = [];
      let rejected = 0;
      for (const input of inputs) {
        const parsed = JournalEventSchema.safeParse(enrich({ ...(input as Record<string, unknown>), seq: seq + 1 }));
        if (!parsed.success) {
          rejected++;
          continue;
        }
        seq++;
        written.push(parsed.data);
      }
      if (written.length > 0) {
        mkdirSync(journalDir(root), { recursive: true });
        appendFileSync(path, written.map((e) => `${JSON.stringify(e)}\n`).join(""));
      }
      seqs.set(sessionId, seq);
      return { written, rejected };
    },
  };
}

/** Ids de sesión del diario, de la más nueva a la más vieja (por fecha de modificación, después por id). */
export function sessionIds(root: string): string[] {
  const dir = journalDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ id: f.slice(0, -".jsonl".length), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.id.localeCompare(a.id))
    .map((s) => s.id);
}

/** Eventos válidos de una sesión, en orden. Una línea corrupta se salta (el diario sigue siendo legible). */
export function readSessionEvents(root: string, sessionId: string): JournalEvent[] {
  SessionIdSchema.parse(sessionId);
  const path = journalPath(root, sessionId);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try {
      const parsed = JournalEventSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

/** Borra las sesiones más viejas y deja `keep` (D-192: 30). Devuelve los ids borrados. */
export function pruneJournal(root: string, keep = JOURNAL_KEEP_SESSIONS): string[] {
  const removed = sessionIds(root).slice(keep);
  for (const id of removed) rmSync(journalPath(root, id), { force: true });
  return removed;
}
