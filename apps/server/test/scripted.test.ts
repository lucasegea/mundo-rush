// F4.2: scripted models to walk through the prologue without a key (LG_FAKE_MODELS=1, operator mode only; D-027).
import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { progressPaths, storesFromEnv, textProvidersFromEnv } from "../src/app.ts";
import { GEMINI_KEY_VAR, loadModelsConfig } from "../src/config/models.ts";
import { readCatalog, renderScriptedText } from "../src/scene-runtime/catalog.ts";
import { createSceneSession } from "../src/scene-runtime/runtime.ts";
import { createMemoryEvidenceStore } from "../src/store/evidence.ts";
import type { ServerMessage } from "@lg/protocol";
import { createManualClock } from "@lg/core";
import { compilarContenido, type FichaConversacion } from "@lg/content-schema";
import { initialEncounterState } from "@lg/core/conversation";
import { leerContenido } from "../../../scripts/content/build.ts";
import { encounterFromSheet } from "../src/conversation/sheet.ts";
import { judgeRequest, parseJudgeOutput } from "../src/conversation/judge.ts";
import { scriptedJudgeProvider } from "../src/providers/scripted.ts";
import { manualScheduler, must, realContent, REPO_ROOT } from "./helpers.ts";

const models = loadModelsConfig();

describe("LG_FAKE_MODELS", () => {
  test("solo con modo operador; sin la bandera y sin clave, el proveedor falla claro", () => {
    expect(textProvidersFromEnv(models, { LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1" }).npcModel.id).toBe("scripted-npc");
    expect(textProvidersFromEnv(models, { LG_FAKE_MODELS: "1" }).npcModel.id).toBe("unavailable");
    expect(textProvidersFromEnv(models, { LG_OPERATOR_MODE: "1" }).npcModel.id).toBe("unavailable");
    // The flag wins over a present key: it never calls the paid API when the script was requested.
    expect(textProvidersFromEnv(models, { LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1", [GEMINI_KEY_VAR]: "x" }).observerModel.id).toBe("scripted-observer");
  });

  test("el prólogo M0.1 → M0.2 → M0.3 se completa por texto con un turno por escena", async () => {
    const { npcModel, observerModel } = textProvidersFromEnv(models, { LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1" });
    const clock = createManualClock(Date.UTC(2026, 9, 8, 12));
    const evidence = createMemoryEvidenceStore();
    const sent: ServerMessage[] = [];
    let n = 0;
    const open = () => createSceneSession({
      content: realContent, npcModel, observerModel, models, evidence, accountId: "op-local", clock,
      scheduler: manualScheduler(clock), newId: () => `id-${++n}`,
    }, (m) => sent.push(m));
    for (const npcId of ["NPC-INES", null, "NPC-MAYA"]) {
      const s = open();
      await s.receive({ type: "scene.start", npcId });
      await s.receive({ type: "turn.text", text: "Hello! What's this? Yes, the canal." });
      expect(s.snapshot.state).toBe("done");
    }
    expect(sent.filter((m) => m.type === "scene.end").map((m) => m.type === "scene.end" && m.outcome)).toEqual(["success", "success", "success"]);
    expect(sent.filter((m) => m.type === "scene.opened").map((m) => m.type === "scene.opened" && m.missionId)).toEqual(["M0.1", "M0.2", "M0.3"]);
  });
});

describe("LG_FAKE_MODELS no escribe en el log real del operador (F7 lo lee como progreso)", () => {
  const event = { id: "e1", accountId: "op-local", at: "2026-10-08T12:00:00.000Z", missionId: "M0.1", sceneId: "M0.1-E1", kind: "mission_outcome" as const, outcome: "success" as const, effects: [], criteriaMet: ["C1"] };

  test("con la bandera, evidencia y safety_events van a memoria: el archivo no se crea", () => {
    const dir = mkdtempSync(join(tmpdir(), "lg-fake-stores-"));
    try {
      const paths = { evidence: join(dir, "evidence.jsonl"), safety: join(dir, "safety.jsonl") };
      const fake = storesFromEnv({ LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1" }, paths);
      fake.evidence.append(event);
      expect(fake.persistent).toBe(false);
      expect(fake.evidence.list("op-local")).toHaveLength(1);
      expect(existsSync(paths.evidence)).toBe(false);
      // Without the flag, the usual file (and it doesn't see what the scripted run wrote).
      const real = storesFromEnv({ LG_OPERATOR_MODE: "1" }, paths);
      expect(real.persistent).toBe(true);
      expect(real.evidence.list("op-local")).toEqual([]);
      real.evidence.append(event);
      expect(existsSync(paths.evidence)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("almacenes por universo (D-812, AC8)", () => {
  const data = (name: string) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));
  const defaults = { evidence: data("evidence.jsonl"), safety: data("safety.jsonl"), costLedger: data("cost-ledger.jsonl"), encounters: data("encounters.json") };

  test.each([[{}], [{ LG_UNIVERSE: "" }], [{ LG_UNIVERSE: "U-CAMPESINO" }]])("sin universo o U-CAMPESINO (%j): las rutas de siempre, literales", (env) => {
    expect(progressPaths(env)).toEqual(defaults);
  });

  test("con LG_UNIVERSE=U-GALEANO: evidencia, seguridad y encuentros llevan el sufijo antes de la extensión; el libro de costos no", () => {
    expect(progressPaths({ LG_UNIVERSE: "U-GALEANO" })).toEqual({
      evidence: data("evidence.U-GALEANO.jsonl"), safety: data("safety.U-GALEANO.jsonl"),
      costLedger: defaults.costLedger, encounters: data("encounters.U-GALEANO.json"),
    });
  });

  test.each(["../x", "U-", "u-galeano", "U-GALEANO/../..", "GALEANO", "U-A B"])("un id inválido (%j) falla claro antes de tocar una ruta", (id) => {
    expect(() => progressPaths({ LG_UNIVERSE: id })).toThrow(/LG_UNIVERSE inválido/);
    expect(() => storesFromEnv({ LG_UNIVERSE: id }, {})).toThrow(/LG_UNIVERSE inválido/);
  });

  test("las rutas explícitas siguen ganando y con modelos guionados el universo no importa (memoria)", () => {
    const dir = mkdtempSync(join(tmpdir(), "lg-uni-stores-"));
    try {
      const paths = { evidence: join(dir, "e.jsonl"), safety: join(dir, "s.jsonl"), encounters: join(dir, "x.json") };
      expect(storesFromEnv({ LG_UNIVERSE: "U-GALEANO" }, paths).persistent).toBe(true);
      expect(storesFromEnv({ LG_UNIVERSE: "U-GALEANO", LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1" }, {}).persistent).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("líneas guionadas con hueco de nombre (02 §2.6)", () => {
  test.each([
    ["Nice to meet you, [nombre]!", null, "Nice to meet you!"],
    ["Nice to meet you, [nombre]!", "Nico", "Nice to meet you, Nico!"],
    ["Thank you, Ollie! Thank you, [nombre]!", "  ", "Thank you, Ollie! Thank you!"],
    ["Hi {nombre_jugador}, welcome.", "Nico", "Hi Nico, welcome."],
    ["Then it's [pueblo]!", "Nico", "Then it's!"],
    ["Here's your key.", null, "Here's your key."],
  ])("%j con nombre %j → %j", (text, name, out) => {
    expect(renderScriptedText(text, name)).toBe(out);
  });

  test("el cierre de M0.1 nunca muestra un [hueco] crudo", async () => {
    const { npcModel, observerModel } = textProvidersFromEnv(models, { LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1" });
    const clock = createManualClock(Date.UTC(2026, 9, 8, 12));
    const sent: ServerMessage[] = [];
    const s = createSceneSession({
      content: realContent, npcModel, observerModel, models, evidence: createMemoryEvidenceStore(), accountId: "op-local", clock,
      scheduler: manualScheduler(clock),
    }, (m) => sent.push(m));
    await s.receive({ type: "scene.start", npcId: "NPC-INES" });
    await s.receive({ type: "turn.text", text: "Hello! I'm Nico." });
    const lines = sent.flatMap((m) => (m.type === "npc.line" && m.line.text !== null ? [m.line] : []));
    const closing = lines.filter((l) => l.kind === "closing").map((l) => l.text);
    expect(closing).toContain("Nice to meet you!");
    expect(lines.filter((l) => /\[[^\]]*\]|\{[^}]*\}/.test(l.text ?? ""))).toEqual([]);
  });
});

describe("juez guionado: reglas de palabras de otros libros (M6, D-813)", () => {
  const compiled = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
  const sheet = must(((compiled.salida?.servidor["conversaciones.json"] ?? []) as FichaConversacion[]).find((c) => c.id === "CONV-POTOSI"), "CONV-POTOSI");
  const def = encounterFromSheet(sheet);
  const role = models.roles.judge;
  const ask = async (playerText: string, active: number) => {
    const state = { ...initialEncounterState(def), active };
    const res = await scriptedJudgeProvider().generate(judgeRequest({ sheet, def, state, npcName: "Factor", playerText, npcText: "Hm.", recent: [] }, role));
    return parseJudgeOutput(res.text, sheet);
  };

  test("en la fase del objetivo, 'Where did all the silver really go?' resuelve la objeción pregunta", async () => {
    expect(await ask("Where did all the silver really go?", 1)).toMatchObject({ ok: true, labels: { objections: [{ id: "pregunta", quality: "yes" }] } });
  });

  test("'I want to understand why Spain stayed poor.' es states_errand", async () => {
    expect(await ask("I want to understand why Spain stayed poor.", 1)).toMatchObject({ ok: true, labels: { acts: expect.arrayContaining(["states_errand"]) } });
  });

  test("fuera de la fase del objetivo no hay objeciones, aunque se diga 'silver'", async () => {
    expect(await ask("Where did all the silver really go?", 0)).toMatchObject({ ok: true, labels: { objections: [] } });
  });

  test("una conversación que no lista 'pregunta' no recibe ese id (campesino intacto)", async () => {
    const harlan = must(readCatalog(realContent()).conversation("CONV-HARLAN"));
    const hdef = encounterFromSheet(harlan);
    const req = judgeRequest({ sheet: harlan, def: hdef, state: { ...initialEncounterState(hdef), active: 1 }, npcName: "Harlan", playerText: "Where did the silver go?", npcText: "Hm.", recent: [] }, role);
    const out = parseJudgeOutput((await scriptedJudgeProvider().generate(req)).text, harlan);
    expect(out).toMatchObject({ ok: true, labels: { objections: [] } });
  });
});
