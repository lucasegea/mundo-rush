// Store único (03 §3.3, ADR-003): A6 claves exactas, acciones delgadas que no mutan, view-models estables.
import { describe, expect, test } from "vitest";
import { createActions } from "../src/state/actions";
import { selectDialogOnlyView, selectSettingsView, selectShellView } from "../src/state/selectors";
import * as slices from "../src/state/slices";
import { createGameStore, initialGameState, SLICE_NAMES, type GameState } from "../src/state/store";

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

const setup = () => {
  const store = createGameStore();
  return { store, actions: createActions(store) };
};
const withWebgl = { webgl2: true, deviceMemoryGb: 8, cores: 8 };
const noWebgl = { webgl2: false, deviceMemoryGb: null, cores: null };

describe("A6: las claves de primer nivel son exactamente los 9 slices de 03 §3.3", () => {
  const EXPECTED = ["session", "settings", "world", "player", "dialogue", "companion", "progression", "learner", "ui"];

  test("estado inicial y store vivo", () => {
    const { store, actions } = setup();
    expect(Object.keys(initialGameState()).sort()).toEqual([...EXPECTED].sort());
    expect([...SLICE_NAMES]).toEqual(EXPECTED);
    actions.bootCompleted(withWebgl);
    actions.setHighContrast(true);
    // Las acciones no se cuelan como claves del estado.
    expect(Object.keys(store.getState()).sort()).toEqual([...EXPECTED].sort());
  });

  test("ningún slice de economía, construcción, moneda ni racha (D-018)", () => {
    const keys = JSON.stringify(Object.keys(initialGameState())).toLowerCase();
    for (const banned of ["economy", "build", "currency", "money", "coins", "streak", "shop"]) expect(keys).not.toContain(banned);
  });

  test("un archivo de slice por nombre, con su política de persistencia", () => {
    const persist = Object.keys(slices).filter((k) => k.endsWith("_PERSIST"));
    expect(persist.sort()).toEqual(EXPECTED.map((n) => `${n.toUpperCase()}_PERSIST`).sort());
    expect(slices.DIALOGUE_PERSIST).toBe("none");
    expect(slices.UI_PERSIST).toBe("none");
  });
});

describe("acciones (delegan en @lg/core y no mutan el estado anterior)", () => {
  test("A3: sin WebGL el arranque termina en solo-diálogo, sin menú encima", () => {
    const { store, actions } = setup();
    actions.bootCompleted(noWebgl);
    const s = store.getState();
    expect(s.session.phase).toBe("dialogOnly");
    expect(s.settings.graphics.suggestedTier).toBe("dialog-only");
    expect(s.ui.panels).toEqual([]);
    expect(s.ui.announcement?.key).toBe("announce.noWebgl");
  });

  test("con WebGL: fase world y menú principal abierto", () => {
    const { store, actions } = setup();
    actions.bootCompleted(withWebgl);
    expect(store.getState().session.phase).toBe("world");
    expect(store.getState().ui.panels).toEqual([{ kind: "mainMenu" }]);
  });

  test("ninguna acción muta el estado anterior", () => {
    const { store, actions } = setup();
    const before = deepFreeze(store.getState());
    actions.bootCompleted(withWebgl);
    actions.setTextScale(175);
    actions.setTierChoice("dialog-only");
    actions.openSettings("x");
    actions.closePanel();
    actions.contentLoaded({ regionName: "R", places: [], npcs: [] });
    expect(before).toEqual(initialGameState());
  });

  test("elegir dialog-only estando en el mapa baja a solo-diálogo; sin WebGL no se entra al mapa", () => {
    const { store, actions } = setup();
    actions.bootCompleted(withWebgl);
    actions.setTierChoice("dialog-only");
    expect(store.getState().session.phase).toBe("dialogOnly");

    const other = setup();
    other.actions.bootCompleted(noWebgl);
    other.actions.enterWorld();
    expect(other.store.getState().session.phase).toBe("dialogOnly");
    expect(other.store.getState().ui.announcement?.key).toBe("announce.worldUnavailable");
  });

  test("cerrar un panel devuelve el foco a quien lo abrió", () => {
    const { store, actions } = setup();
    actions.bootCompleted(withWebgl);
    actions.openSettings("menu-settings");
    actions.closePanel();
    expect(store.getState().ui.focusRequest).toBe("menu-settings");
    actions.focusHandled();
    expect(store.getState().ui.focusRequest).toBeNull();
  });

  test("un parche vacío no notifica a los suscriptores", () => {
    const { store, actions } = setup();
    let calls = 0;
    store.subscribe(() => calls++);
    actions.focusHandled();
    actions.closePanel();
    expect(calls).toBe(0);
  });
});

describe("view-models (R14): mismo objeto mientras nada relevante cambie", () => {
  test("selectSettingsView y selectShellView se memorizan por entrada", () => {
    const { store, actions } = setup();
    actions.bootCompleted(withWebgl);
    const s1: GameState = store.getState();
    expect(selectSettingsView(s1)).toBe(selectSettingsView(s1));
    actions.selectPlace("x"); // cambia ui, no settings
    expect(selectSettingsView(store.getState())).toBe(selectSettingsView(s1));
    actions.setHighContrast(true);
    expect(selectSettingsView(store.getState())).not.toBe(selectSettingsView(s1));
    expect(selectShellView(store.getState()).panel).toEqual({ kind: "mainMenu" });
  });

  test("selectDialogOnlyView agrupa NPCs por lugar y marca el elegido", () => {
    const { store, actions } = setup();
    actions.contentLoaded({
      regionName: "Región",
      places: [{ id: "a", name: "A", en: "Sign", diorama: "muelle", description: "d" }, { id: "b", name: "B", en: null, diorama: "plaza", description: "" }],
      npcs: [{ id: "NPC-1", name: "Uno", placeId: "a" }, { id: "NPC-2", name: "Dos", placeId: "a" }],
    });
    actions.selectPlace("a");
    const v = selectDialogOnlyView(store.getState());
    expect(v.status).toBe("ready");
    expect(v.places.map((p) => [p.id, p.npcNames.length, p.selected])).toEqual([["a", 2, true], ["b", 0, false]]);
    expect(v.selected?.npcs.map((n) => n.name)).toEqual(["Uno", "Dos"]);
  });
});
