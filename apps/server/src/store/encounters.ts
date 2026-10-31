// EncounterStore (A2, ADR-027): state of each meters conversation encounter (what the player already knows about the
// NPC, how full each meter is) and the missions' development resets. Interface + memory (tests and
// LG_FAKE_MODELS) + JSON file (apps/server/data/encounters.json, gitignored). It is one of the places in apps/server that
// write to disk (lint, D-108): text only, never audio.
// The file is read on every query (no cache): the reset script (scripts/dev/reset-encounter.ts) edits it while the
// server is running and the next scene already sees it. The write is atomic (temp file + rename).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoBinary } from "./evidence.ts";

export const DEFAULT_ENCOUNTERS_PATH = fileURLToPath(new URL("../../data/encounters.json", import.meta.url));

export interface MissionResetRecord {
  readonly accountId: string;
  readonly missionId: string;
  /** ISO 8601: the mission's evidence dated up to here (inclusive) stops counting. */
  readonly at: string;
}

export interface EncounterFile {
  readonly version: 1;
  /** accountId → sheet id (CONV-*) → saved encounter state (shape of @lg/core EncounterState). */
  readonly encounters: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly resets: readonly MissionResetRecord[];
}

export interface EncounterStore {
  get(accountId: string, encounterId: string): unknown;
  put(accountId: string, encounterId: string, state: unknown): void;
  /** Deletes the encounter state. true if there was anything. */
  remove(accountId: string, encounterId: string): boolean;
  resets(accountId: string): MissionResetRecord[];
  addReset(reset: MissionResetRecord): void;
}

const empty = (): EncounterFile => ({ version: 1, encounters: {}, resets: [] });

/** Reads the file; if it doesn't exist or is broken, empty (a corrupt file never brings the scene down). */
export function readEncounterFile(path: string): EncounterFile {
  if (!existsSync(path)) return empty();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<EncounterFile>;
    const encounters = raw.encounters && typeof raw.encounters === "object" ? raw.encounters : {};
    const resets = Array.isArray(raw.resets)
      ? raw.resets.filter((r): r is MissionResetRecord => !!r && typeof r.accountId === "string" && typeof r.missionId === "string" && typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)))
      : [];
    return { version: 1, encounters, resets };
  } catch {
    return empty();
  }
}

export function writeEncounterFile(path: string, file: EncounterFile): void {
  assertNoBinary(file);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function ops(read: () => EncounterFile, write: (f: EncounterFile) => void): EncounterStore {
  return {
    get: (accountId, encounterId) => read().encounters[accountId]?.[encounterId] ?? null,
    put(accountId, encounterId, state) {
      assertNoBinary(state);
      const f = read();
      write({ ...f, encounters: { ...f.encounters, [accountId]: { ...(f.encounters[accountId] ?? {}), [encounterId]: structuredClone(state) } } });
    },
    remove(accountId, encounterId) {
      const f = read();
      const mine = f.encounters[accountId];
      if (!mine || !(encounterId in mine)) return false;
      const rest = Object.fromEntries(Object.entries(mine).filter(([id]) => id !== encounterId));
      write({ ...f, encounters: { ...f.encounters, [accountId]: rest } });
      return true;
    },
    resets: (accountId) => read().resets.filter((r) => r.accountId === accountId),
    addReset(reset) {
      const f = read();
      write({ ...f, resets: [...f.resets, reset] });
    },
  };
}

export function createMemoryEncounterStore(initial: EncounterFile = empty()): EncounterStore {
  let file: EncounterFile = structuredClone(initial);
  return ops(() => file, (f) => { file = structuredClone(f); });
}

export function createFileEncounterStore(path: string = DEFAULT_ENCOUNTERS_PATH): EncounterStore {
  return ops(() => readEncounterFile(path), (f) => writeEncounterFile(path, f));
}
