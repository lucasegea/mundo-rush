// A2 (ADR-027): encounter store (memory and file read on every query), progress reset filter,
// process guards (unhandled rejected promises) and the scripted judge of LG_FAKE_MODELS.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { EvidenceEvent } from "@lg/protocol";
import { BinaryDataError } from "../src/store/evidence.ts";
import { createFileEncounterStore, createMemoryEncounterStore, readEncounterFile } from "../src/store/encounters.ts";
import { withoutResets } from "../src/scene-runtime/progress.ts";
import { installProcessGuards } from "../src/process-guards.ts";
import { scriptedJudgeProvider } from "../src/providers/scripted.ts";
import { judgeRequest, parseJudgeOutput } from "../src/conversation/judge.ts";
import { encounterFromSheet } from "../src/conversation/sheet.ts";
import { initialEncounterState } from "@lg/core/conversation";
import { loadModelsConfig } from "../src/config/models.ts";
import { readCatalog } from "../src/scene-runtime/catalog.ts";
import { must, realContent } from "./helpers.ts";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lg-encounters-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("EncounterStore", () => {
  test("memoria: guardar, leer, borrar y reinicios por cuenta", () => {
    const s = createMemoryEncounterStore();
    expect(s.get("a", "CONV-X")).toBeNull();
    s.put("a", "CONV-X", { active: 1 });
    expect(s.get("a", "CONV-X")).toEqual({ active: 1 });
    expect(s.get("b", "CONV-X")).toBeNull();
    expect(s.remove("a", "CONV-X")).toBe(true);
    expect(s.remove("a", "CONV-X")).toBe(false);
    s.addReset({ accountId: "a", missionId: "M9.1", at: "2026-10-12T00:00:00.000Z" });
    expect(s.resets("a").map((r) => r.missionId)).toEqual(["M9.1"]);
    expect(s.resets("b")).toEqual([]);
  });

  test("archivo: se lee en cada consulta (otro proceso lo edita y se ve) y se escribe entero", () => {
    const path = join(dir, "encounters.json");
    const a = createFileEncounterStore(path);
    const b = createFileEncounterStore(path);
    a.put("op-local", "CONV-HARLAN", { active: 1, factsLearned: ["granero"] });
    expect(b.get("op-local", "CONV-HARLAN")).toEqual({ active: 1, factsLearned: ["granero"] });
    b.remove("op-local", "CONV-HARLAN");
    expect(a.get("op-local", "CONV-HARLAN")).toBeNull();
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ version: 1, encounters: { "op-local": {} }, resets: [] });
  });

  test("archivo roto o reinicios inválidos: se ignoran sin tirar la escena", () => {
    const path = join(dir, "encounters.json");
    writeFileSync(path, "{ roto", "utf8");
    expect(readEncounterFile(path)).toEqual({ version: 1, encounters: {}, resets: [] });
    writeFileSync(path, JSON.stringify({ encounters: {}, resets: [{ accountId: "a", missionId: "M9.1", at: "ayer" }, { accountId: "a", missionId: "M9.1", at: "2026-10-12T00:00:00.000Z" }] }), "utf8");
    expect(readEncounterFile(path).resets).toHaveLength(1);
  });

  test("nunca guarda binarios (D-108)", () => {
    expect(() => createMemoryEncounterStore().put("a", "CONV-X", { audio: new Int16Array(2) })).toThrow(BinaryDataError);
  });
});

describe("withoutResets", () => {
  const ev = (missionId: string, at: string): EvidenceEvent => ({
    id: `${missionId}-${at}`, accountId: "op-local", at, missionId, sceneId: `${missionId}-E1`, kind: "mission_outcome", outcome: "success", effects: [], criteriaMet: [],
  });
  test("saca solo la evidencia de la misión reiniciada fechada hasta el reinicio (incluido)", () => {
    const events = [ev("M9.1", "2026-10-11T10:00:00.000Z"), ev("M0.1", "2026-10-11T10:00:00.000Z"), ev("M9.1", "2026-10-12T10:00:00.000Z"), ev("M9.1", "2026-10-11T12:00:00.000Z")];
    const kept = withoutResets(events, [{ missionId: "M9.1", at: "2026-10-11T12:00:00.000Z" }]);
    expect(kept.map((e) => e.id)).toEqual(["M0.1-2026-10-11T10:00:00.000Z", "M9.1-2026-10-12T10:00:00.000Z"]);
    expect(withoutResets(events, [])).toEqual(events);
  });
});

describe("guardas del proceso", () => {
  test("una promesa rechazada sin manejar se registra (sin tirar el proceso)", () => {
    const listeners: ((reason: unknown) => void)[] = [];
    const logs: string[] = [];
    installProcessGuards({ on: (_e, fn) => listeners.push(fn) }, (m) => logs.push(m), "srv");
    expect(listeners).toHaveLength(1);
    listeners[0]?.(new Error("gancho roto"));
    listeners[0]?.("texto");
    listeners[0]?.({ raro: true });
    expect(logs).toEqual([
      "srv: promesa rechazada sin manejar (el proceso sigue): gancho roto",
      "srv: promesa rechazada sin manejar (el proceso sigue): texto",
      "srv: promesa rechazada sin manejar (el proceso sigue): motivo desconocido",
    ]);
  });
});

describe("juez guionado (LG_FAKE_MODELS)", () => {
  const sheet = must(readCatalog(realContent()).conversation("CONV-HARLAN"));
  const def = encounterFromSheet(sheet);
  const role = loadModelsConfig().roles.judge;
  const ask = async (playerText: string, state = initialEncounterState(def)) => {
    const req = judgeRequest({ sheet, def, state, npcName: "Harlan", playerText, npcText: "Hm.", recent: [] }, role);
    const res = await scriptedJudgeProvider().generate(req);
    return parseJudgeOutput(res.text, sheet);
  };
  test("una pregunta revela un hecho por nivel; contar algo propio es un dato compartido", async () => {
    expect(await ask("Is this your farm?")).toMatchObject({ ok: true, labels: { acts: ["personal_question"], npcFacts: ["nombre", "amanecer", "cruce_callado"] } });
    expect(await ask("I'm Nico. I work with the crew.")).toMatchObject({ ok: true, labels: { playerFacts: ["nombre", "cuadrilla"], acts: ["self_disclosure"] } });
    expect(await ask("hola, como andas")).toMatchObject({ ok: true, labels: { language: "L1" } });
  });
  test("en la fase del pedido reconoce el recado, el pedido amable y las objeciones", async () => {
    const goal = { ...initialEncounterState(def), active: 1 };
    const r = await ask("Nell sent me, she needs posts for the garden fence. Could I borrow them, please?", goal);
    expect(r).toMatchObject({ ok: true, labels: { acts: expect.arrayContaining(["states_errand", "polite_request", "gives_reason"]) } });
    expect(r.ok && r.labels.objections.map((o) => o.id).sort()).toEqual(["para_que", "quien"]);
  });
});
