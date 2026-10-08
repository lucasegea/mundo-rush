// F4.2: modelos guionados para recorrer el prólogo sin clave (LG_FAKE_MODELS=1, solo modo operador; D-027).
import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storesFromEnv, textProvidersFromEnv } from "../src/app.ts";
import { GEMINI_KEY_VAR, loadModelsConfig } from "../src/config/models.ts";
import { renderScriptedText } from "../src/scene-runtime/catalog.ts";
import { createSceneSession } from "../src/scene-runtime/runtime.ts";
import { createMemoryEvidenceStore } from "../src/store/evidence.ts";
import type { ServerMessage } from "@lg/protocol";
import { createManualClock } from "@lg/core";
import { manualScheduler, realContent } from "./helpers.ts";

const models = loadModelsConfig();

describe("LG_FAKE_MODELS", () => {
  test("solo con modo operador; sin la bandera y sin clave, el proveedor falla claro", () => {
    expect(textProvidersFromEnv(models, { LG_FAKE_MODELS: "1", LG_OPERATOR_MODE: "1" }).npcModel.id).toBe("scripted-npc");
    expect(textProvidersFromEnv(models, { LG_FAKE_MODELS: "1" }).npcModel.id).toBe("unavailable");
    expect(textProvidersFromEnv(models, { LG_OPERATOR_MODE: "1" }).npcModel.id).toBe("unavailable");
    // La bandera gana sobre una clave presente: nunca llama a la API paga cuando se pidió el guion.
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
      // Sin la bandera, el archivo de siempre (y no ve lo que escribió la corrida guionada).
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
