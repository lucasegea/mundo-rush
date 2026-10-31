// EvidenceStore (D-157, ADR-004 amended by P0): the operator's append-only evidence log. Interface + in-memory
// adapter (tests) + JSONL file adapter (apps/server/data/evidence.jsonl, gitignored). This module is one of the
// two places in apps/server that write to disk (lint, D-108) and it rejects any binary data: the server never
// stores audio.
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EvidenceEventSchema, type EvidenceEvent } from "@lg/protocol";

export const DEFAULT_EVIDENCE_PATH = fileURLToPath(new URL("../../data/evidence.jsonl", import.meta.url));

export interface EvidenceStore {
  append(event: EvidenceEvent): void;
  /** The account's events, in the order they were appended. */
  list(accountId: string): EvidenceEvent[];
}

export class BinaryDataError extends Error {
  constructor(path: string) {
    super(`dato binario rechazado en ${path || "(raíz)"}: el servidor no guarda audio (D-108)`);
    this.name = "BinaryDataError";
  }
}

/** Walks the value and fails on Buffer, ArrayBuffer or typed views (D-108). */
export function assertNoBinary(value: unknown, path = ""): void {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || (typeof Blob !== "undefined" && value instanceof Blob)) {
    throw new BinaryDataError(path);
  }
  if (Array.isArray(value)) value.forEach((v, i) => assertNoBinary(v, `${path}[${i}]`));
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoBinary(v, path ? `${path}.${k}` : k);
  }
}

/** Validates before saving: no binaries and with the schema's shape (an extra field doesn't get in). */
function checked(event: EvidenceEvent): EvidenceEvent {
  assertNoBinary(event);
  return EvidenceEventSchema.parse(event);
}

export function createMemoryEvidenceStore(): EvidenceStore {
  const events: EvidenceEvent[] = [];
  return {
    append(event) {
      events.push(checked(event));
    },
    list: (accountId) => events.filter((e) => e.accountId === accountId),
  };
}

/** Reads the JSONL skipping corrupt lines (e.g. a write cut off by a power loss). */
export function readEvidenceFile(path: string): EvidenceEvent[] {
  if (!existsSync(path)) return [];
  const out: EvidenceEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = EvidenceEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // corrupt line: ignored
    }
  }
  return out;
}

/** true if the file does not exist, is empty or its last byte is "
". */
function endsWithNewline(path: string): boolean {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return true;
  }
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return true;
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

/** File adapter: one JSON line per event, append only. What was written survives a server restart. */
export function createFileEvidenceStore(path: string = DEFAULT_EVIDENCE_PATH): EvidenceStore {
  let cache: EvidenceEvent[] | null = null;
  const all = (): EvidenceEvent[] => (cache ??= readEvidenceFile(path));
  return {
    append(event) {
      const ok = checked(event);
      const events = all(); // read before writing: otherwise the new event would end up twice in the cache
      mkdirSync(dirname(path), { recursive: true });
      // If a previous write was cut off with no line break, the new event would stick to it and be
      // lost on reading: the broken line is closed first.
      const sep = endsWithNewline(path) ? "" : "\n";
      appendFileSync(path, `${sep}${JSON.stringify(ok)}\n`, "utf8");
      events.push(ok);
    },
    list: (accountId) => all().filter((e) => e.accountId === accountId),
  };
}
