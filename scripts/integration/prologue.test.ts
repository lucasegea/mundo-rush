// F4.2 A4 (+ A5 of the plan): end-to-end integration WITHOUT canvas and without a key. The real web client (store,
// actions, scene service and browser connector with Node's fetch/WebSocket) against F4.1's real server
// (HTTP + WebSocket, operator mode) with the scripted models of LG_FAKE_MODELS (D-027: no paid API). The M0.1 → M0.2 → M0.3
// prologue is completed by typing, as the player would in the HUD.
// It lives in scripts/ because web does not import server nor the other way around (§4.3); here the two are joined on purpose.
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createGameServer, textProvidersFromEnv, type GameServer } from "../../apps/server/src/app.ts";
import { loadModelsConfig } from "../../apps/server/src/config/models.ts";
import { OPERATOR_ACCOUNT } from "../../apps/server/src/config/operator.ts";
import { createMemoryEvidenceStore } from "../../apps/server/src/store/evidence.ts";
import { createMemorySafetyStore } from "../../apps/server/src/store/safety.ts";
import { realContent } from "../../apps/server/test/helpers.ts";
import { browserSceneConnector } from "../../apps/web/src/services/scene/connector.ts";
import { startSceneService } from "../../apps/web/src/services/scene/index.ts";
import { actions } from "../../apps/web/src/state/actions.ts";
import { selectDialogueHudView } from "../../apps/web/src/state/selectors/index.ts";
import { gameStore, initialGameState, type GameState } from "../../apps/web/src/state/store.ts";
import { compiledClientContent, fetchFromContent } from "../../apps/web/test/helpers.ts";

let game: GameServer | null = null;
let stopService: (() => void) | null = null;

beforeEach(() => gameStore.setState(initialGameState(), true));

afterEach(async () => {
  stopService?.();
  stopService = null;
  const g = game;
  game = null;
  if (g) {
    g.close();
    await new Promise<void>((done) => g.server.close(() => done()));
  }
});

/** Waits for the state to satisfy `pred` (with a cap, so a failure does not hang the suite). */
function until(pred: (s: GameState) => boolean, label: string, ms = 10_000): Promise<void> {
  if (pred(gameStore.getState())) return Promise.resolve();
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { unsub(); fail(new Error(`timeout esperando: ${label}`)); }, ms);
    const unsub = gameStore.subscribe((s) => s, (s) => {
      if (!pred(s)) return;
      clearTimeout(timer);
      unsub();
      done();
    });
  });
}

async function startStack() {
  const env = { LG_OPERATOR_MODE: "1", LG_FAKE_MODELS: "1" };
  const models = loadModelsConfig();
  const { npcModel, observerModel } = textProvidersFromEnv(models, env);
  expect([npcModel.id, observerModel.id]).toEqual(["scripted-npc", "scripted-observer"]);
  const safety = createMemorySafetyStore();
  game = createGameServer({ env, content: realContent, models, evidence: createMemoryEvidenceStore(), npcModel, observerModel, moderation: null, safety });
  const g = game;
  await new Promise<void>((done) => g.server.listen(0, "127.0.0.1", done));
  const port = (g.server.address() as AddressInfo).port;
  const connector = browserSceneConnector({ httpBase: `http://127.0.0.1:${port}`, wsBase: `ws://127.0.0.1:${port}` });
  stopService = startSceneService({ store: gameStore, actions, connector, baseUrl: "/", fetchJson: fetchFromContent(compiledClientContent()) });
  return { safety };
}

/** Plays a scene by text, like the player in the HUD, until it ends. Returns the result. */
async function playScene(npcId: string | null, missionId: string): Promise<string | null> {
  actions.enterScene(npcId, null);
  await until((s) => s.dialogue.missionId === missionId || s.dialogue.blocked !== null, `${missionId} abierta`);
  expect(gameStore.getState().dialogue.blocked).toBeNull();
  for (let turn = 0; turn < 8; turn++) {
    await until((s) => { const v = selectDialogueHudView(s); return v.canWrite || v.phase === "ended"; }, `${missionId}: turno o fin`);
    if (selectDialogueHudView(gameStore.getState()).phase === "ended") break;
    actions.submitTurn("Hello! I'm Nico. Nice to meet you.");
    await until((s) => !selectDialogueHudView(s).canWrite, `${missionId}: turno cerrado`);
  }
  await until((s) => s.dialogue.outcome !== null, `${missionId} terminada`);
  const v = selectDialogueHudView(gameStore.getState());
  // The HUD showed lines from the NPC (or Lumi) and the player's, with no model or prompt text.
  expect(v.lines.some((l) => l.who === "player")).toBe(true);
  expect(v.lines.some((l) => l.who === "npc" || l.who === "lumi")).toBe(true);
  const outcome = gameStore.getState().dialogue.outcome;
  actions.leaveScene();
  return outcome;
}

test("A4: el prólogo se completa por texto (M0.1 Inés → M0.2 historia → M0.3 Maya) con modelos guionados", async () => {
  const { safety } = await startStack();
  expect(await playScene("NPC-INES", "M0.1")).toBe("success");
  expect(await playScene(null, "M0.2")).toBe("success");
  expect(await playScene("NPC-MAYA", "M0.3")).toBe("success");
  // The glossary was loaded from the compiled content and no turn triggered moderation.
  expect(gameStore.getState().dialogue.lexicon.status).toBe("ready");
  expect(safety.list(OPERATOR_ACCOUNT)).toEqual([]);
}, 60_000);

test("A2 de punta a punta: un turno de riesgo corta la escena con contención y evento de seguridad, sin texto", async () => {
  const { safety } = await startStack();
  actions.enterScene("NPC-INES", null);
  await until((s) => selectDialogueHudView(s).canWrite, "M0.1 tu turno");
  actions.submitTurn("I want to kill myself");
  await until((s) => s.dialogue.outcome !== null, "contención");
  const d = gameStore.getState().dialogue;
  expect(d.outcome).toBe("containment");
  expect(d.containment?.provisional).toBe(true);
  // The risk text did not stay in the history (it was cut before being shown as sent to the NPC).
  const events = safety.list(OPERATOR_ACCOUNT);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ layer: "input", action: "containment" });
  expect(JSON.stringify(events)).not.toContain("kill");
}, 30_000);
