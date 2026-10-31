// Test-session journal (03 §6.5.2, D-192): `.director/journal/<sessionId>.jsonl`, append-only.
// The writer numbers (`seq`) and validates each event against the schema; what does not validate is not written.
// The last 30 sessions are kept (prune).
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

/** Last `seq` written in a session file (−1 if it is empty or does not exist). */
function lastSeq(path: string): number {
  if (!existsSync(path)) return -1;
  const lines = readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return -1;
  const parsed = JournalEventSchema.safeParse(JSON.parse(last));
  return parsed.success ? parsed.data.seq : lines.length - 1;
}

/** Append-only writer. `enrich` fills in what the client does not know (e.g. gitSha of session.start). */
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

/** Journal session ids, newest to oldest (by modification date, then by id). */
export function sessionIds(root: string): string[] {
  const dir = journalDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ id: f.slice(0, -".jsonl".length), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.id.localeCompare(a.id))
    .map((s) => s.id);
}

/** Valid events of a session, in order. A corrupt line is skipped (the journal stays readable). */
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

/** Deletes the oldest sessions and keeps `keep` (D-192: 30). Returns the deleted ids. */
export function pruneJournal(root: string, keep = JOURNAL_KEEP_SESSIONS): string[] {
  const removed = sessionIds(root).slice(keep);
  for (const id of removed) rmSync(journalPath(root, id), { force: true });
  return removed;
}
