// F4.1 A6: el EvidenceStore de archivo sobrevive a reiniciar el servidor (directorio temporal), rechaza binarios
// (D-108) y el progreso del prólogo se reconstruye desde la evidencia en una sesión nueva.
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { EvidenceEvent } from "@lg/protocol";
import { BinaryDataError, createFileEvidenceStore, createMemoryEvidenceStore, readEvidenceFile } from "../src/store/evidence.ts";
import { M01_RULES } from "./fakes/text-model.ts";
import { harness, play } from "./helpers.ts";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lg-evidence-"));
  file = join(dir, "nested", "evidence.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ev = (id: string, accountId = "op-local"): EvidenceEvent => ({
  id, accountId, at: "2026-10-07T12:00:00.000Z", kind: "target_use", missionId: "M0.1", sceneId: "M0.1-E1",
  structureId: "I'm [nombre]", branch: "nombre", quote: "I'm Nico.",
});

describe("EvidenceStore de archivo", () => {
  test("lo agregado sobrevive a un store nuevo sobre el mismo archivo (reinicio)", () => {
    const first = createFileEvidenceStore(file);
    first.append(ev("e1"));
    first.append(ev("e2", "otra-cuenta"));
    expect(first.list("op-local").map((e) => e.id)).toEqual(["e1"]);
    const restarted = createFileEvidenceStore(file);
    expect(restarted.list("op-local").map((e) => e.id)).toEqual(["e1"]);
    restarted.append(ev("e3"));
    expect(createFileEvidenceStore(file).list("op-local").map((e) => e.id)).toEqual(["e1", "e3"]);
    // JSONL con LF: una línea por evento.
    expect(readFileSync(file, "utf8").split("\n").filter(Boolean)).toHaveLength(3);
  });

  test("una línea corrupta (escritura cortada) se salta y el resto se lee", () => {
    createFileEvidenceStore(file).append(ev("e1"));
    appendFileSync(file, '{"id":"cut","accountId":"op-lo'); // cortada sin salto de línea
    createFileEvidenceStore(file).append(ev("e2"));
    expect(readEvidenceFile(file).map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  test("sin archivo: lista vacía y no crea nada hasta el primer append", () => {
    expect(createFileEvidenceStore(file).list("op-local")).toEqual([]);
    expect(() => readFileSync(file)).toThrow();
  });

  test.each([
    ["Buffer", Buffer.from("audio")],
    ["Uint8Array", new Uint8Array([1, 2])],
    ["ArrayBuffer", new ArrayBuffer(4)],
  ])("rechaza datos binarios (%s): el servidor no guarda audio", (_name, bin) => {
    for (const store of [createFileEvidenceStore(file), createMemoryEvidenceStore()]) {
      expect(() => store.append({ ...ev("b"), quote: bin } as unknown as EvidenceEvent)).toThrow(BinaryDataError);
    }
    expect(readEvidenceFile(file)).toEqual([]);
  });

  test("un campo de más no entra (esquema estricto)", () => {
    expect(() => createMemoryEvidenceStore().append({ ...ev("x"), audio: "base64" } as unknown as EvidenceEvent)).toThrow();
  });

  test("reinicio a mitad del prólogo: la sesión nueva sigue en M0.2 y Maya no repite M0.1", async () => {
    const before = harness({ rules: M01_RULES, evidence: createFileEvidenceStore(file) });
    await play(before, "NPC-INES", ["Hello! I'm Nico."]);
    expect(before.of("scene.end")[0]?.outcome).toBe("success");
    // "Reinicio": store y sesión nuevos sobre el mismo archivo.
    const after = harness({ evidence: createFileEvidenceStore(file) });
    await after.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    expect(after.of("scene.blocked")).toEqual([{ type: "scene.blocked", npcId: "NPC-INES", reason: "noScene" }]);
    await after.session.receive({ type: "scene.start", npcId: null });
    expect(after.of("scene.opened")[0]).toMatchObject({ missionId: "M0.2" });
  });
});
