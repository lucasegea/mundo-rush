// F4.1 (03 §6.4.8): el cliente aplica los efectos de misión que emite el servidor al cerrar una escena.
import { beforeEach, describe, expect, test } from "vitest";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { resetStore } from "./helpers";

beforeEach(resetStore);

describe("sceneEffectsApplied", () => {
  test("cerrar M0.1: la cucheta encendida y Maya presentada", () => {
    actions.sceneEffectsApplied([{ flag: "lamp_bunk_on" }, { intro: "NPC-MAYA" }]);
    const { world } = gameStore.getState();
    expect(world.flags).toEqual({ lamp_bunk_on: true });
    expect(world.network.intros).toEqual(["NPC-MAYA"]);
  });

  test("una fundación avanza y nunca retrocede; repetir efectos no notifica", () => {
    actions.sceneEffectsApplied([{ fundacion: "SITIO-HUERTA", estado: "en_marcha" }]);
    actions.sceneEffectsApplied([{ fundacion: "SITIO-HUERTA", estado: "idea" }]);
    expect(gameStore.getState().world.foundations).toEqual({ "SITIO-HUERTA": "en_marcha" });
    const before = gameStore.getState().world;
    actions.sceneEffectsApplied([{ fundacion: "SITIO-HUERTA", estado: "en_marcha" }]);
    expect(gameStore.getState().world).toBe(before);
  });
});
