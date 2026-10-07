// FD0 A10: el diario es solo-agregar, numera y valida cada evento, no guarda audio y prune deja 30 sesiones.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { JournalEventSchema } from "@lg/protocol/director";
import { journalPath } from "../src/files.ts";
import { createJournalWriter, pruneJournal, readSessionEvents, sessionIds } from "../src/journal.ts";
import { AT, removeRoot, sampleEvents, tempRoot, writeSession } from "./helpers.ts";

let root: string;
beforeEach(() => { root = tempRoot(); });
afterEach(() => removeRoot(root));

const S = "20261007-120000-abcd";
const lines = (): string[] => readFileSync(journalPath(root, S), "utf8").split("\n").filter(Boolean);

describe("escritor del diario", () => {
  test("solo agrega: lo ya escrito no cambia y seq sigue (también con un escritor nuevo)", () => {
    const w = createJournalWriter(root);
    w.append(S, [{ type: "session.start", at: AT, gitSha: null, contentHash: null, tier: "low" }, { type: "move.cell", at: AT, diorama: "test", tile: { x: 1, y: 2 } }]);
    const first = readFileSync(journalPath(root, S), "utf8");
    createJournalWriter(root).append(S, [{ type: "interact", at: AT, targetId: "NPC-NELL" }]);
    const now = readFileSync(journalPath(root, S), "utf8");
    expect(now.startsWith(first)).toBe(true);
    expect(lines().map((l) => (JSON.parse(l) as { seq: number }).seq)).toEqual([0, 1, 2]);
  });

  test("cada línea escrita valida contra el esquema", () => {
    createJournalWriter(root).append(S, sampleEvents().map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "seq"))));
    expect(lines()).toHaveLength(5);
    for (const l of lines()) expect(JournalEventSchema.safeParse(JSON.parse(l)).success).toBe(true);
  });

  test("lo que no valida (audio, tipo desconocido) no se escribe y no consume seq", () => {
    const r = createJournalWriter(root).append(S, [
      { type: "line", at: AT, turnId: "t1", speaker: "NPC-NELL", text: "Hi", audio: "UklGRg==" },
      { type: "audio.clip", at: AT },
      { type: "line", at: AT, turnId: "t1", speaker: "NPC-NELL", text: "Hi" },
    ]);
    expect(r.rejected).toBe(2);
    expect(r.written.map((e) => e.seq)).toEqual([0]);
    expect(readFileSync(journalPath(root, S), "utf8")).not.toMatch(/audio/i);
  });

  test("enrich completa lo que sabe Node (gitSha y contentHash de session.start)", () => {
    const w = createJournalWriter(root, (e) => (e["type"] === "session.start" ? { ...e, gitSha: "abc123", contentHash: "h1" } : e));
    w.append(S, [{ type: "session.start", at: AT, gitSha: null, contentHash: null, tier: "medium" }]);
    expect(JSON.parse(lines()[0] ?? "{}")).toMatchObject({ gitSha: "abc123", contentHash: "h1" });
  });

  test("un id de sesión que no es un nombre de archivo seguro se rechaza", () => {
    expect(() => createJournalWriter(root).append("../fuera", [])).toThrow();
    expect(existsSync(join(root, "fuera.jsonl"))).toBe(false);
  });

  test("al leer, una línea corrupta se salta y el resto se lee", () => {
    writeSession(root, S, sampleEvents());
    appendFileSync(journalPath(root, S), "{ roto\n");
    expect(readSessionEvents(root, S)).toHaveLength(5);
  });
});

describe("prune (D-192)", () => {
  test("deja las 30 sesiones más nuevas y borra el resto", () => {
    for (let i = 0; i < 35; i++) writeSession(root, `s${String(i).padStart(2, "0")}`, sampleEvents(), 1_700_000_000 + i);
    const removed = pruneJournal(root);
    expect(removed.sort()).toEqual(["s00", "s01", "s02", "s03", "s04"]);
    expect(sessionIds(root)).toHaveLength(30);
    expect(sessionIds(root)[0]).toBe("s34");
  });

  test("con 30 o menos no borra nada", () => {
    for (let i = 0; i < 3; i++) writeSession(root, `s${i}`, sampleEvents(), 1_700_000_000 + i);
    expect(pruneJournal(root)).toEqual([]);
    expect(pruneJournal(join(root, "sin-diario"))).toEqual([]);
  });
});
