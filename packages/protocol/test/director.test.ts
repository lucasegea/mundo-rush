// FD0 A3/A10: schemas of the director-mode snapshot and journal (03 §6.5.2).
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  DIALOGUE_CAP, DirectorSnapshotSchema, JournalEventSchema, PATH_CAP, SNAPSHOT_EVENT, type DirectorSnapshot,
} from "../src/director";
import * as director from "../src/director";
import * as index from "../src/index";

const AT = "2026-10-07T12:00:00.000Z";

const emptySnapshot = (): DirectorSnapshot => ({
  v: 1, sessionId: "s-test", at: AT, build: { contentHash: null, gitSha: null }, region: null, diorama: null,
  player: { tile: null, pos: null, facing: "s" }, nearby: [], scene: null, path: [], npcsTalked: [], dialogue: [],
  worldFlags: {}, foundations: {}, network: [], lastPick: null, contentErrors: [],
});

describe("DirectorSnapshot (v: 1)", () => {
  test("un snapshot vacío valida y v distinto de 1 no", () => {
    expect(DirectorSnapshotSchema.safeParse(emptySnapshot()).success).toBe(true);
    expect(DirectorSnapshotSchema.safeParse({ ...emptySnapshot(), v: 2 }).success).toBe(false);
  });

  test("objetos estrictos: un campo de más (p. ej. audio) no valida", () => {
    expect(DirectorSnapshotSchema.safeParse({ ...emptySnapshot(), audio: "x" }).success).toBe(false);
  });

  test(`topes: path ≤ ${PATH_CAP} y dialogue ≤ ${DIALOGUE_CAP}`, () => {
    const cell = { tile: { x: 1, y: 2 }, at: AT };
    expect(DirectorSnapshotSchema.safeParse({ ...emptySnapshot(), path: Array(PATH_CAP).fill(cell) }).success).toBe(true);
    expect(DirectorSnapshotSchema.safeParse({ ...emptySnapshot(), path: Array(PATH_CAP + 1).fill(cell) }).success).toBe(false);
    const line = { turnId: "t1", speaker: "NPC-NELL", text: "Hi", at: AT };
    expect(DirectorSnapshotSchema.safeParse({ ...emptySnapshot(), dialogue: Array(DIALOGUE_CAP + 1).fill(line) }).success).toBe(false);
  });

  test("el id de sesión es seguro como nombre de archivo", () => {
    expect(DirectorSnapshotSchema.safeParse({ ...emptySnapshot(), sessionId: "../x" }).success).toBe(false);
  });

  test("el índice del paquete no expone el modo director (solo la subruta @lg/protocol/director)", () => {
    // F4.1 adds the scene messages to the index; no director-mode export gets in.
    const directorExports = Object.keys(director);
    expect(directorExports.length).toBeGreaterThan(0);
    expect(Object.keys(index).filter((k) => directorExports.includes(k))).toEqual([]);
    expect(Object.keys(index)).toContain("PACKAGE_NAME");
    expect(SNAPSHOT_EVENT.startsWith("lg:director:")).toBe(true);
  });
});

describe("eventos del diario (A10)", () => {
  const valid = [
    { seq: 0, at: AT, type: "session.start", gitSha: null, contentHash: "abc", tier: "low" },
    { seq: 1, at: AT, type: "move.cell", diorama: "test", tile: { x: 3, y: 4 } },
    { seq: 2, at: AT, type: "interact", targetId: "NPC-NELL" },
    { seq: 3, at: AT, type: "scene.start", missionId: null, sceneId: null, npcId: "NPC-NELL" },
    { seq: 4, at: AT, type: "choice", choice: "pressDone", option: null },
    { seq: 5, at: AT, type: "line", turnId: "t1", speaker: "NPC-NELL", text: "Morning." },
    { seq: 6, at: AT, type: "scene.end", result: "closed", criteriaMet: [] },
    { seq: 7, at: AT, type: "content.reload", ids: ["M1.1"], ok: true, errors: [] },
    { seq: 8, at: AT, type: "director.note", text: "nota" },
    { seq: 9, at: AT, type: "director.edit", sha: "abc123", summary: "x", paths: ["content/npcs/NPC-NELL.yaml"] },
    { seq: 10, at: AT, type: "session.end" },
  ];

  test.each(valid.map((e) => [e.type, e] as const))("%s valida", (_t, e) => {
    expect(JournalEventSchema.safeParse(e).success).toBe(true);
  });

  test("cubre todos los tipos de 03 §6.5.2", () => {
    const types = JournalEventSchema.options.map((o) => o.shape.type.value).sort();
    expect(types).toEqual(valid.map((e) => e.type).sort());
  });

  test("un evento con audio, tipo desconocido o sin seq no valida", () => {
    expect(JournalEventSchema.safeParse({ ...valid[5], audio: "UklGR" }).success).toBe(false);
    expect(JournalEventSchema.safeParse({ ...valid[5], type: "audio.clip" }).success).toBe(false);
    const noSeq = Object.fromEntries(Object.entries(valid[5] ?? {}).filter(([k]) => k !== "seq"));
    expect(JournalEventSchema.safeParse(noSeq).success).toBe(false);
  });

  test("ningún campo del esquema nombra audio (D-108)", () => {
    const keys = (schema: z.ZodType): string[] => {
      const def = (schema as unknown as { def: { type: string; shape?: Record<string, z.ZodType>; innerType?: z.ZodType; element?: z.ZodType; options?: z.ZodType[]; valueType?: z.ZodType } }).def;
      if (def.type === "object" && def.shape) return Object.entries(def.shape).flatMap(([k, v]) => [k, ...keys(v)]);
      if (def.options) return def.options.flatMap(keys);
      const inner = def.innerType ?? def.element ?? def.valueType;
      return inner ? keys(inner) : [];
    };
    const all = [...keys(JournalEventSchema), ...keys(DirectorSnapshotSchema)];
    expect(all.length).toBeGreaterThan(40);
    expect(all.filter((k) => /audio|clip|pcm|wav|blob|buffer/i.test(k))).toEqual([]);
  });
});
