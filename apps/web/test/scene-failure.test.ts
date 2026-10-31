// J-2 (2026-10-30): a server `error` before `scene.opened` used to be ignored and the HUD stayed on "La escena está
// empezando…" forever. Now the scene is marked as failed and the HUD explains why.
import { describe, expect, test } from "vitest";
import { reduceSceneMessage } from "../src/state/actions";
import { selectDialogueHudView } from "../src/state/selectors";
import { initialDialogue } from "../src/state/slices";
import { gameStore, initialGameState } from "../src/state/store";

const error = (code: "unknown_npc" | "scene_busy" | "not_your_turn" | "bad_message") => ({ type: "error" as const, code, message: "x" });

describe("J-2: an error before the scene opens ends the wait", () => {
  test("before scene.opened: the failure keeps the protocol code it explains, the rest is `other`", () => {
    expect(reduceSceneMessage(initialDialogue(), error("unknown_npc")).failure).toBe("unknown_npc");
    expect(reduceSceneMessage(initialDialogue(), error("scene_busy")).failure).toBe("scene_busy");
    expect(reduceSceneMessage(initialDialogue(), error("bad_message")).failure).toBe("other");
  });

  test("inside an open scene an error does not end it", () => {
    const open = { ...initialDialogue(), sceneRunId: "run-1" };
    expect(reduceSceneMessage(open, error("not_your_turn"))).toBe(open);
  });

  test("the HUD shows the `failed` phase with its reason", () => {
    const state = initialGameState();
    gameStore.setState({ ...state, dialogue: { ...state.dialogue, connection: "open", failure: "unknown_npc" } }, true);
    const view = selectDialogueHudView(gameStore.getState());
    expect(view.phase).toBe("failed");
    expect(view.failure).toBe("unknown_npc");
  });
});

describe("J-3: without ?universe= the client plays the server's universe", () => {
  test("the URL wins; without it, the universe dev:play started; without either, the default", async () => {
    const { universeFromSearch } = await import("../src/services/content");
    expect(universeFromSearch("?universe=U-OTRO", "U-GALEANO")).toBe("U-OTRO");
    expect(universeFromSearch("", "U-GALEANO")).toBe("U-GALEANO");
    expect(universeFromSearch("", undefined)).toBeUndefined();
  });
});
