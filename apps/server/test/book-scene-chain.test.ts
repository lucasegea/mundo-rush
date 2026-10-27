// book-mode slice-1 M6 (AC5..AC7): el runtime de escenas real, sobre el contenido compilado de U-GALEANO y con los
// modelos guionados de LG_FAKE_MODELS, recorre la cadena MITAYO, CERRO, FACTOR: el FACTOR está bloqueado hasta que el
// CERRO lo presenta, y CONV-POTOSI se completa por medidores hasta "The milk was never ours".
import { compilarContenido } from "@lg/content-schema";
import { createManualClock } from "@lg/core";
import type { ServerMessage } from "@lg/protocol";
import { describe, expect, test } from "vitest";
import { leerContenido } from "../../../scripts/content/build.ts";
import { loadModelsConfig } from "../src/config/models.ts";
import { createConversationSystem } from "../src/conversation/system.ts";
import { scriptedJudgeProvider, scriptedNpcProvider, scriptedObserverProvider } from "../src/providers/scripted.ts";
import { createSceneSession } from "../src/scene-runtime/runtime.ts";
import { createMemoryEncounterStore } from "../src/store/encounters.ts";
import { createMemoryEvidenceStore } from "../src/store/evidence.ts";
import { manualScheduler, must, realContent, REPO_ROOT } from "./helpers.ts";

const models = loadModelsConfig();
const compiled = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
// SEAM (M6.1): EMIT todavia no escribe prompts/npc-base.txt para el universo, asi que prompts.json sale vacio y
// readCatalog lo rechaza. Este test aporta SOLO la base del prompt campesino para recorrer la cadena de escenas;
// el npc-base propio de U-GALEANO es trabajo pendiente (fixture + EMIT), no se oculta aca.
const content = Object.freeze({
  ...must(compiled.salida, "U-GALEANO no compila").servidor,
  "prompts.json": realContent()["prompts.json"],
});

/** Una "partida": evidencia y encuentros compartidos; cada escena abre una sesión nueva (como cada conexión). */
function newRun() {
  const clock = createManualClock(Date.UTC(2026, 9, 26, 12));
  const evidence = createMemoryEvidenceStore();
  const store = createMemoryEncounterStore();
  const conversation = createConversationSystem({ judge: scriptedJudgeProvider(), role: models.roles.judge, store });
  let n = 0;
  return async function scene(npcId: string, turns: readonly string[]): Promise<ServerMessage[]> {
    const sent: ServerMessage[] = [];
    const s = createSceneSession({
      content: () => content, npcModel: scriptedNpcProvider(), observerModel: scriptedObserverProvider(), models, evidence,
      accountId: "op-local", clock, scheduler: manualScheduler(clock), newId: () => `id-${++n}`, conversation,
      resets: () => store.resets("op-local"),
    }, (m) => sent.push(m));
    await s.receive({ type: "scene.start", npcId });
    for (const text of turns) {
      await s.receive({ type: "turn.text", text });
      await conversation.settled();
      await s.settled();
    }
    return sent;
  };
}

const ended = (sent: ServerMessage[]) => sent.flatMap((m) => (m.type === "scene.end" ? [m.outcome] : []));

describe("cadena de introducción de U-GALEANO", () => {
  test("AC5: el FACTOR está bloqueado hasta que el CERRO lo presenta", async () => {
    const sent = await newRun()("NPC-FACTOR", []);
    expect(sent.find((m) => m.type === "scene.blocked")).toMatchObject({ reason: "notIntroduced" });
  });

  test("AC6: MITAYO y CERRO completan por un turno y el FACTOR abre M1.1-E1 con medidores", async () => {
    const scene = newRun();
    const mitayo = await scene("NPC-MITAYO", ["Tell me about the mine."]);
    expect(mitayo.find((m) => m.type === "scene.opened")).toMatchObject({ missionId: "M1.2", sceneId: "M1.2-E1" });
    expect(ended(mitayo)).toEqual(["success"]);
    const cerro = await scene("NPC-CERRO", ["What did you give the town?"]);
    expect(ended(cerro)).toEqual(["success"]);
    const factor = await scene("NPC-FACTOR", []);
    expect(factor.find((m) => m.type === "scene.opened")).toMatchObject({ missionId: "M1.1", sceneId: "M1.1-E1" });
    expect(factor.some((m) => m.type === "conversation.state")).toBe(true);
  });

  test("AC7: CONV-POTOSI llena todos los medidores y cierra con la vaca y la leche", async () => {
    const scene = newRun();
    await scene("NPC-MITAYO", ["Tell me about the mine."]);
    await scene("NPC-CERRO", ["What did you give the town?"]);
    const sent = await scene("NPC-FACTOR", [
      "Hello! What do you keep in those ledgers?",
      "I'm Nico. Does the silver really stay in Spain?",
      "I work far from here. Who owns the mine, really?",
      "I want to understand why Spain stayed poor.",
      "Where did all the silver really go?",
      "Thanks.",
    ]);
    const last = [...sent].reverse().find((m) => m.type === "conversation.state");
    expect(last).toMatchObject({ type: "conversation.state", completed: true });
    expect(last?.type === "conversation.state" && last.meters.every((m) => m.status === "full")).toBe(true);
    expect(ended(sent)).toEqual(["success"]);
    const lines = sent.flatMap((m) => (m.type === "npc.line" && m.line.text !== null ? [m.line.text] : []));
    expect(lines.some((l) => l.includes("The milk was never ours"))).toBe(true);
  });
});
