// @vitest-environment jsdom
// F2 A1 (in the app), A3, A5, A7, A8, A9: the real test map (content/dioramas/test.yaml compiled) loaded
// by boot(), with the real store and actions. The keyboard enters through services/input with synthetic events on
// an EventTarget; the R3F click enters through state/bridge.ts. Both must produce the SAME actions (R10).
// The simulation loop runs with a fake scheduler: the test advances the time.
import { act, cleanup, render, screen } from "@testing-library/react";
import { circleBlocked, facingFrom, planPath, SIM_DT, THIRD_PERSON, zoomDistanceAt, type DioramaLayout } from "@lg/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadDiorama, pickDiorama } from "../src/services/content";
import { startInput, WORLD_SURFACE_ATTR } from "../src/services/input";
import type { FrameScheduler } from "../src/services/simulation";
import { actions } from "../src/state/actions";
import { bridge } from "../src/state/bridge";
import {
  readGame, selectConversationFrame, selectHighlightedNpc, selectInteractionPrompt, selectMapActive, selectMapView,
  selectWorldHudView, selectWorldRender,
} from "../src/state/selectors";
import { gameStore } from "../src/state/store";
import { WorldHud } from "../src/ui/hud/WorldHud";
import { labelEntries } from "../src/world/labels/labels";
import { bootApp, compiledClientContent, resetStore } from "./helpers";

/** Manual frame scheduler: `advance(ms)` runs one frame with the clock moved forward. */
const manualScheduler = () => {
  let now = 0;
  let pending: ((t: number) => void) | null = null;
  const scheduler: FrameScheduler = {
    request: (cb) => { pending = cb; return 1; },
    cancel: () => { pending = null; },
  };
  return {
    scheduler,
    advance(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.(now);
    },
  };
};

let stop: () => void = () => {};
let target: EventTarget;
let clock: ReturnType<typeof manualScheduler>;

async function startMap() {
  target = new EventTarget();
  clock = manualScheduler();
  await act(async () => { stop = await bootApp({ webgl2: true, world: { inputTarget: target, scheduler: clock.scheduler } }); });
  await act(async () => {
    actions.enterWorld();
    await vi.waitFor(() => { expect(gameStore.getState().world.dioramaStatus).toBe("ready"); });
  });
}

const key = (type: "keydown" | "keyup", code: string, char?: string) =>
  target.dispatchEvent(new KeyboardEvent(type, { code, ...(char === undefined ? {} : { key: char }), cancelable: true }));
const pos = () => gameStore.getState().player.position ?? { x: NaN, z: NaN };
const npcName = (id: string) => gameStore.getState().world.npcs.find((n) => n.id === id)?.name ?? id;
const npc = (id: string) => {
  const n = gameStore.getState().world.diorama?.npcs.find((x) => x.id === id);
  if (!n) throw new Error(`sin ${id}`);
  return n;
};
/** Runs 1/60 s frames until the condition holds (or fails). */
const runUntil = (cond: () => boolean, maxFrames = 1200): number => {
  for (let i = 0; i < maxFrames; i++) {
    if (cond()) return i;
    clock.advance(1000 / 60);
  }
  throw new Error("la condición no se cumplió");
};
const settle = () => runUntil(() => {
  const p = gameStore.getState().player;
  return p.intent.kind === "idle" && p.velocity.x === 0 && p.velocity.z === 0;
});

beforeEach(() => resetStore());
afterEach(() => {
  stop();
  cleanup();
});

describe("carga del diorama de prueba", () => {
  test("entrar al mapa carga test.yaml compilado: capas, cajas, NPCs y jugador en el spawn", async () => {
    await startMap();
    const view = selectMapView(gameStore.getState());
    expect(view.status).toBe("ready");
    expect(view.diorama?.id).toBe("test");
    // Plan estetica-c M5: test.yaml uses the diorama format (curves, water, per-zone detail). M7: the runtime no
    // longer has tile layers or atlases.
    expect(view.diorama).not.toHaveProperty("layers");
    expect(view.diorama).not.toHaveProperty("atlas");
    expect(view.diorama?.ground.paths.length).toBeGreaterThan(0);
    expect(view.diorama?.boxes.length).toBeGreaterThan(4);
    expect(view.actors.map((a) => a.id).sort()).toEqual(["NPC-HARLAN", "NPC-INES", "NPC-NELL"]);
    // NPCs carry the catalog name (not the id).
    expect(view.actors.every((a) => a.name !== a.id)).toBe(true);
    // And the look of their sheet (M5), not the fallback one.
    expect(view.actors.every((a) => a.look !== null)).toBe(true);
    expect(pos()).toEqual({ x: 0.5, z: 3 });
    expect(selectMapActive(gameStore.getState())).toBe(true);
  });

  test("el modo solo-diálogo nunca pide el diorama", async () => {
    const fetchJson = vi.fn((url: string) => {
      const name = url.slice(url.lastIndexOf("/") + 1);
      const files = compiledClientContent();
      return name in files ? Promise.resolve(files[name]) : Promise.reject(new Error(url));
    });
    // Without WebGL you land in dialog-only; choosing it again does not load the map either.
    await act(async () => { stop = await bootApp({ webgl2: false, fetchJson }); });
    act(() => actions.enterDialogOnly());
    act(() => actions.enterWorld()); // without WebGL you do not enter the map
    expect(fetchJson.mock.calls.map(([u]) => u).some((u) => u.endsWith("dioramas.json"))).toBe(false);
    expect(gameStore.getState().world.dioramaStatus).toBe("idle");
  });

  test("si el diorama no carga: estado error, anuncio y el HUD ofrece solo-diálogo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await act(async () => {
      await loadDiorama(actions, "/", "test", undefined, () => Promise.reject(new Error("404")));
    });
    warn.mockRestore();
    expect(gameStore.getState().world.dioramaStatus).toBe("error");
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.mapFailed");
    render(<WorldHud />);
    expect(screen.getByRole("button", { name: "Ir al modo solo diálogo" })).toBeTruthy();
  });

  test("pickDiorama falla claro con forma inválida o id ausente", () => {
    expect(() => pickDiorama({}, "test")).toThrow(/lista/);
    expect(() => pickDiorama([{ id: "otro", bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 } }], "test")).toThrow(/test/);
    expect(() => pickDiorama([{ id: "test" }], "test")).toThrow(/bounds/);
  });
});

describe("A1 en el mapa real: camino y colisión", () => {
  test("desde el spawn se llega a cada NPC (camino de A* sobre la grilla del diorama)", async () => {
    await startMap();
    const d = gameStore.getState().world.diorama;
    if (!d) throw new Error("sin diorama");
    for (const n of d.npcs) expect(planPath(d.grid, d.spawn, { x: n.x + 1, z: n.z }), n.id).not.toBeNull();
  });

  test("las dos cajas que se tocan por la esquina no dejan pasar en diagonal", async () => {
    await startMap();
    // Stands southwest of the shared corner (-8, 6) and pushes northeast.
    act(() => {
      gameStore.setState((s) => ({ player: { ...s.player, position: { x: -8.6, z: 6.6 }, previous: { x: -8.6, z: 6.6 } } }));
    });
    act(() => actions.move({ x: 1, y: 1 }));
    act(() => { for (let i = 0; i < 90; i++) clock.advance(1000 / 30); });
    const p = pos();
    // It did not cross to the other side of the boxes' diagonal (x > -8 and z < 6 at once).
    expect(p.x > -8 && p.z < 6).toBe(false);
  });

  test("el lazo corre a paso fijo: 1 s de cuadros irregulares = 30 pasos; sin mapa activo no acumula", async () => {
    await startMap();
    const t0 = gameStore.getState().player.simTick;
    act(() => actions.move({ x: 1, y: 0 }));
    act(() => clock.advance(0)); // first frame: sets the clock, no steps
    // 1000 ms in irregular frames (none exceeds the cap of 5 steps per frame).
    act(() => { for (const ms of [5, 40, 16, 100, 33, 7, 99, 150, 50, 100, 120, 80, 100, 100]) clock.advance(ms); });
    expect(gameStore.getState().player.simTick - t0).toBe(Math.round(1 / SIM_DT));
    act(() => actions.openSettings());
    const t1 = gameStore.getState().player.simTick;
    act(() => { for (let i = 0; i < 30; i++) clock.advance(100); });
    expect(gameStore.getState().player.simTick).toBe(t1);
    act(() => actions.closePanel());
    act(() => clock.advance(16));
    // On return there is no jump from the paused time: at most one step.
    expect(gameStore.getState().player.simTick - t1).toBeLessThanOrEqual(1);
  });
});

describe("A3 teclado (services/input) y clic (state/bridge) producen las mismas acciones", () => {
  test("WASD camina en la dirección de la pantalla y soltar frena", async () => {
    await startMap();
    const x0 = pos().x;
    act(() => { key("keydown", "KeyD"); });
    expect(gameStore.getState().player.intent.kind).toBe("dir");
    act(() => { for (let i = 0; i < 30; i++) clock.advance(1000 / 30); });
    expect(pos().x).toBeGreaterThan(x0 + 2);
    act(() => { key("keyup", "KeyD"); });
    expect(gameStore.getState().player.intent.kind).toBe("idle");
    act(() => { settle(); });
    const stopped = pos();
    act(() => { for (let i = 0; i < 10; i++) clock.advance(1000 / 30); });
    expect(pos()).toBe(stopped);
  });

  test("clic en el suelo camina hasta ahí (moveTo) y llega dentro del radio de llegada", async () => {
    await startMap();
    act(() => bridge.pointer({ kind: "ground", x: -2, z: 1 }));
    expect(gameStore.getState().player.intent.kind).toBe("path");
    act(() => { settle(); });
    expect(Math.hypot(pos().x + 2, pos().z - 1)).toBeLessThanOrEqual(0.05);
    // Right button does not walk.
    act(() => bridge.pointer({ kind: "ground", x: 3, z: 3 }, 2));
    expect(gameStore.getState().player.intent.kind).toBe("idle");
  });

  test("E frente a un NPC = clic sobre ese NPC: el mismo panel de escena", async () => {
    // With the keyboard.
    await startMap();
    const nell = npc("NPC-NELL");
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    act(() => { key("keydown", "KeyE"); });
    const byKey = gameStore.getState().ui.panels;
    stop();
    // With the pointer, from the same place.
    resetStore();
    await startMap();
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    act(() => bridge.pointer({ kind: "interactable", id: "NPC-NELL" }));
    expect(gameStore.getState().ui.panels).toEqual(byKey);
    expect(byKey).toEqual([{ kind: "scene", npcId: "NPC-NELL" }]);
  });

  test("clic sobre un NPC lejano camina hasta él; al llegar aparece el aviso y E abre la escena", async () => {
    await startMap();
    act(() => bridge.pointer({ kind: "interactable", id: "NPC-INES" }));
    expect(gameStore.getState().player.intent.kind).toBe("path");
    act(() => { runUntil(() => gameStore.getState().world.nearbyInteractables.includes("NPC-INES")); });
    act(() => { key("keydown", "KeyE"); });
    expect(gameStore.getState().ui.panels).toEqual([{ kind: "scene", npcId: "NPC-INES" }]);
  });

  test("rueda sobre el mapa = +/− del teclado; sobre un panel no hace zoom", async () => {
    await startMap();
    const surface = document.createElement("div");
    surface.setAttribute(WORLD_SURFACE_ATTR, "");
    const inner = document.createElement("canvas");
    surface.append(inner);
    const panel = document.createElement("div");
    document.body.append(surface, panel);
    // Recorded change (open-world-3d T5, PD-5 amends D-208 for the default view): before, it compared
    // `ui.zoomStep` (ladder index); with continuous zoom it compares the requested distance `ui.camera.zoomDistance`.
    const dist = () => gameStore.getState().ui.camera.zoomDistance;
    const zoomAfter = (fn: () => void) => { act(fn); return dist(); };
    const start = dist();
    const byKey = zoomAfter(() => { key("keydown", "Equal"); });
    expect(byKey).toBeLessThan(start);
    act(() => actions.zoomOut());
    expect(dist()).toBeCloseTo(start, 9);
    // Spanish/Latin American keyboard: the printed "+" is BracketRight and the "-" is Slash (D-197, QA's note N1).
    expect(zoomAfter(() => { key("keydown", "BracketRight", "+"); })).toBeCloseTo(byKey, 9);
    expect(zoomAfter(() => { key("keydown", "Slash", "-"); })).toBeCloseTo(start, 9);
    stop();
    // The wheel over the canvas: the service listens on document (as on window in the app) and looks at the real target.
    stop = startInput({ target: document, dispatch: actions.dispatch, isActive: () => selectMapActive(gameStore.getState()) });
    act(() => { inner.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true })); });
    expect(dist()).toBeCloseTo(byKey, 9);
    act(() => { panel.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true })); });
    expect(dist()).toBeCloseTo(byKey, 9);
    surface.remove();
    panel.remove();
  });

  test("las teclas no actúan fuera del mapa, con modificadores ni dentro de un campo de texto", async () => {
    await startMap();
    act(() => actions.openSettings());
    act(() => { key("keydown", "KeyD"); });
    expect(gameStore.getState().player.intent.kind).toBe("idle");
    act(() => actions.closePanel());
    act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", ctrlKey: true })); });
    expect(gameStore.getState().player.intent.kind).toBe("idle");
    // Inside a text field: the service listens on document and looks at the event's real target.
    stop();
    stop = startInput({ target: document, dispatch: actions.dispatch, isActive: () => selectMapActive(gameStore.getState()) });
    const input = document.createElement("input");
    document.body.append(input);
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", bubbles: true, cancelable: true })); });
    expect(gameStore.getState().player.intent.kind).toBe("idle");
    act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", bubbles: true, cancelable: true })); });
    expect(gameStore.getState().player.intent.kind).toBe("dir");
    input.remove();
  });

  test("Escape cancela el camino; C anuncia que el cuaderno llega después", async () => {
    await startMap();
    act(() => bridge.moveTo(-6, -2));
    act(() => { key("keydown", "Escape"); });
    expect(gameStore.getState().player.intent.kind).toBe("idle");
    act(() => { key("keydown", "KeyC"); });
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.notebookSoon");
  });
});

describe("A8 aviso de interacción en el HUD (del store, no del canvas)", () => {
  test("acercarse a un NPC muestra «E Hablar con …» (tarjeta abajo al centro); alejarse lo saca", async () => {
    await startMap();
    render(<WorldHud />);
    expect(document.getElementById("world-prompt")).toBeNull();
    const nell = npc("NPC-NELL");
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    expect(selectInteractionPrompt(gameStore.getState())?.id).toBe("NPC-NELL");
    const prompt = document.getElementById("world-prompt");
    expect(prompt?.querySelector("kbd")?.textContent).toBe("E");
    expect(prompt?.textContent?.replace(/\s+/g, " ")).toBe(`E Hablar con ${npcName("NPC-NELL")}`);
    expect(screen.getByRole("button", { name: `Hablar con ${npcName("NPC-NELL")}` })).toBeTruthy();
    act(() => bridge.moveTo(0.5, 3));
    act(() => { settle(); });
    expect(document.getElementById("world-prompt")).toBeNull();
  });

  test("el botón del HUD habla igual que E", async () => {
    await startMap();
    const nell = npc("NPC-NELL");
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    render(<WorldHud />);
    act(() => { screen.getByRole("button", { name: `Hablar con ${npcName("NPC-NELL")}` }).click(); });
    expect(gameStore.getState().ui.panels).toEqual([{ kind: "scene", npcId: "NPC-NELL" }]);
  });

  test("quieto, un paso de simulación no notifica al store (R7: no se re-renderiza a 30 Hz)", async () => {
    await startMap();
    act(() => { settle(); clock.advance(100); });
    const listener = vi.fn();
    const unsub = gameStore.subscribe((s) => s, listener);
    act(() => { for (let i = 0; i < 30; i++) clock.advance(1000 / 30); });
    unsub();
    expect(listener).not.toHaveBeenCalled();
    // readGame reads the position without subscribing (for world/).
    expect(readGame((s) => s.player.position)).toBe(gameStore.getState().player.position);
  });
});

// Recorded change (open-world-3d T5, PD-5 amends D-208 for the default view): this block tested the
// 8-step ladder (`zoomStep` from 30 to 22 and 160 m, "Zoom 1 de 8"); the map camera now has continuous zoom from 2.5 m to the
// whole map. The same caps, keys and buttons are tested over the requested distance.
describe("A9 zoom continuo (PD-5): acotado, con teclas, rueda o botones", () => {
  test("acercar se acota en 2,5 m y alejar en el mapa entero; el HUD dice la distancia y los botones hacen lo mismo", async () => {
    await startMap();
    const cam = () => gameStore.getState().ui.camera;
    expect(cam().zoomDistance).toBe(THIRD_PERSON.defaultDistance);
    expect(selectWorldRender(gameStore.getState()).preset).toBe("thirdPerson");
    act(() => { for (let i = 0; i < 40; i++) key("keydown", i % 2 ? "NumpadAdd" : "Equal"); });
    expect(cam().zoomDistance).toBeCloseTo(THIRD_PERSON.minDistance, 9);
    const walked: number[] = [];
    act(() => { for (let i = 0; i < 40; i++) { key("keydown", "Minus"); walked.push(cam().zoomDistance); } });
    // Each step moves away by the same ratio (log-linear) up to the whole map, where it stays.
    const ratios = walked.slice(1, 10).map((d, i) => d / (walked[i] as number));
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0] as number, 6);
    expect(cam().overview).toBe(true);
    expect(cam().zoomDistance).toBe(cam().fitDistance);
    render(<WorldHud />);
    expect(screen.getByText("Mapa completo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alejar" }).getAttribute("aria-disabled")).toBe("true");
    act(() => { screen.getByRole("button", { name: "Acercar" }).click(); });
    expect(cam().overview).toBe(false);
    expect(cam().zoomDistance).toBeCloseTo(zoomDistanceAt(1 - THIRD_PERSON.zoomStep, cam().fitDistance), 9);
    expect(selectWorldHudView(gameStore.getState()).zoomMeters).toBeCloseTo(cam().zoomDistance, 0);
  });

  test("rueda de trackpad: muchos eventos chicos suman una muesca, no recorren la escalera", async () => {
    await startMap();
    const surface = document.createElement("div");
    surface.setAttribute(WORLD_SURFACE_ATTR, "");
    document.body.append(surface);
    stop();
    stop = startInput({ target: document, dispatch: actions.dispatch, isActive: () => selectMapActive(gameStore.getState()) });
    // Recorded change (PD-5): a notch is one continuous zoom step; before, `zoomStep` indices were counted.
    const fit = gameStore.getState().ui.camera.fitDistance;
    const t = () => Math.log(gameStore.getState().ui.camera.zoomDistance / THIRD_PERSON.minDistance) / Math.log(fit / THIRD_PERSON.minDistance);
    const start = t();
    act(() => { for (let i = 0; i < 12; i++) surface.dispatchEvent(new WheelEvent("wheel", { deltaY: 5, bubbles: true, cancelable: true })); });
    expect(t()).toBeCloseTo(start + THIRD_PERSON.zoomStep, 9);
    act(() => { for (let i = 0; i < 3; i++) surface.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true })); });
    expect(t()).toBeCloseTo(start + 4 * THIRD_PERSON.zoomStep, 9);
    surface.remove();
  });
});

describe("A7 reducir movimiento: corte de cámara y sin postprocesado", () => {
  test("selectWorldRender pasa a «cut» y apaga el post; al volver, sigue y lo prende según el tier", async () => {
    await startMap();
    const before = selectWorldRender(gameStore.getState());
    expect(before.cameraMotion).toBe("follow");
    act(() => actions.setReduceMotion(true));
    const reduced = selectWorldRender(gameStore.getState());
    expect(reduced.cameraMotion).toBe("cut");
    expect(reduced.post).toBe(false);
    act(() => actions.setReduceMotion(false));
    expect(selectWorldRender(gameStore.getState()).cameraMotion).toBe("follow");
    act(() => actions.setTierChoice("low"));
    expect(selectWorldRender(gameStore.getState()).post).toBe(false);
  });

  test("con «reducir movimiento» del sistema, el mapa arranca cortando", async () => {
    await act(async () => { stop = await bootApp({ webgl2: true, prefersReducedMotion: true }); });
    expect(selectWorldRender(gameStore.getState()).cameraMotion).toBe("cut");
  });

  test("un panel encima pausa el render (frameloop demand)", async () => {
    await startMap();
    expect(selectWorldRender(gameStore.getState()).paused).toBe(false);
    act(() => actions.openSettings());
    expect(selectWorldRender(gameStore.getState()).paused).toBe(true);
  });
});

describe("A5 caídas: rendimiento y contexto WebGL", () => {
  test("PerformanceMonitor baja la sugerencia un escalón en auto y lo anuncia; con tier manual no", async () => {
    await startMap();
    const tier0 = gameStore.getState().settings.graphics.suggestedTier;
    act(() => bridge.performanceDeclined());
    const tier1 = gameStore.getState().settings.graphics.suggestedTier;
    expect(tier1).not.toBe(tier0);
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.tierLowered");
    act(() => actions.setTierChoice("high"));
    act(() => bridge.performanceDeclined());
    expect(gameStore.getState().settings.graphics.suggestedTier).toBe(tier1);
  });

  test("no baja la calidad durante una conversación", async () => {
    await startMap();
    act(() => actions.enterScene("NPC-NELL"));
    const tier = gameStore.getState().settings.graphics.suggestedTier;
    act(() => bridge.performanceDeclined());
    expect(gameStore.getState().settings.graphics.suggestedTier).toBe(tier);
  });

  test("perder el contexto WebGL pasa a solo-diálogo con aviso, sin perder la posición", async () => {
    await startMap();
    act(() => bridge.moveTo(-2, 1));
    act(() => { settle(); });
    const where = pos();
    act(() => bridge.contextLost());
    expect(gameStore.getState().session.phase).toBe("dialogOnly");
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.contextLost");
    expect(pos()).toBe(where);
  });
});

describe("unreachable: un destino sin camino se dice por aria-live", () => {
  test("un muro que corta el diorama: no hay camino, el jugador no se mueve", () => {
    const layout: DioramaLayout = {
      id: "muro",
      bounds: { minX: -3, maxX: 3, minZ: -2, maxZ: 2 },
      spawn: [-2, 0, 0],
      props: [{ asset: "codigo/cerco", pos: [0, 0, 0], tam: [1, 1, 4] }],
    };
    act(() => {
      actions.bootCompleted({ webgl2: true, deviceMemoryGb: 8, cores: 8 });
      actions.enterWorld();
      actions.dioramaLoaded(layout);
    });
    act(() => bridge.moveTo(2, 0));
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.unreachable");
    expect(gameStore.getState().player.intent.kind).toBe("idle");
  });
});

// Plan estetica-c M1 (D-207): the parts of look C that live in the store, over the real test diorama.
describe("estetica-c M1 en el mapa real", () => {
  test("A7: con los árboles agregados el diorama tiene 8 a 14 árboles y pinos, y su tronco bloquea la grilla", async () => {
    await startMap();
    const d = gameStore.getState().world.diorama;
    if (!d) throw new Error("sin diorama");
    const trees = d.boxes.filter((b) => b.asset === "codigo/arbol" || b.asset === "codigo/pino");
    expect(trees.length).toBeGreaterThanOrEqual(8);
    expect(trees.length).toBeLessThanOrEqual(14);
    for (const t of trees) expect(circleBlocked(d.grid, t.x, t.z, 0.05), `${t.asset} en ${t.x},${t.z}`).toBe(true);
  });

  test("A9: al abrir la escena con Inés el jugador queda a 2,6 m, de su lado, caminable y mirándola", async () => {
    await startMap();
    const ines = npc("NPC-INES");
    act(() => bridge.pointer({ kind: "interactable", id: "NPC-INES" }));
    act(() => { runUntil(() => gameStore.getState().world.nearbyInteractables.includes("NPC-INES")); });
    const before = pos();
    const tick = gameStore.getState().player.simTick;
    act(() => { key("keydown", "KeyE"); });
    expect(gameStore.getState().ui.panels).toEqual([{ kind: "scene", npcId: "NPC-INES" }]);
    const p = gameStore.getState().player;
    const after = pos();
    const d = gameStore.getState().world.diorama;
    if (!d) throw new Error("sin diorama");
    expect(Math.abs(Math.hypot(after.x - ines.x, after.z - ines.z) - 2.6)).toBeLessThanOrEqual(0.25);
    expect(circleBlocked(d.grid, after.x, after.z, 0.24)).toBe(false);
    // From the side it arrived from.
    expect((before.x - ines.x) * (after.x - ines.x) + (before.z - ines.z) * (after.z - ines.z)).toBeGreaterThan(0);
    expect(p.previous).toEqual(p.position);
    expect(p.facing).toBe(facingFrom(ines.x - after.x, ines.z - after.z, p.facing));
    expect(p.simTick).toBe(tick + 1);
    expect(p.intent.kind).toBe("idle");
  });

  test("A9: enterScene (solo-diálogo o escena sin mapa) no mueve al jugador", async () => {
    await startMap();
    const before = pos();
    act(() => actions.enterScene("NPC-INES"));
    expect(pos()).toEqual(before);
    stop();
    resetStore();
    await act(async () => { stop = await bootApp({ webgl2: false }); });
    act(() => actions.enterDialogOnly());
    const still = gameStore.getState().player.position;
    act(() => actions.enterScene("NPC-INES"));
    expect(gameStore.getState().player.position).toEqual(still);
  });

  test("A10: con la escena arriba el canvas sigue vivo y la cámara es el plano de a dos; con ajustes, pausa", async () => {
    await startMap();
    const nell = npc("NPC-NELL");
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    expect(selectConversationFrame(gameStore.getState())).toBeNull();
    act(() => { key("keydown", "KeyE"); });
    const render1 = selectWorldRender(gameStore.getState());
    expect(render1.paused).toBe(false);
    expect(render1.preset).toBe("dialogueFrame");
    expect(selectConversationFrame(gameStore.getState())?.npcId).toBe("NPC-NELL");
    act(() => actions.openSettings());
    expect(selectWorldRender(gameStore.getState()).paused).toBe(true);
    expect(selectConversationFrame(gameStore.getState())).toBeNull();
    act(() => actions.closePanel());
    act(() => actions.closePanel());
    // Recorded change (open-world-3d T5, PD-5): the map camera outside conversation went from "perspective3D" to
    // "thirdPerson" (in both assertions of this test).
    expect(selectWorldRender(gameStore.getState()).preset).toBe("thirdPerson");
    // A8: a scene with an NPC that is not in this diorama frames nobody.
    act(() => actions.enterScene("NPC-MAYA"));
    expect(gameStore.getState().ui.panels.at(-1)).toEqual({ kind: "scene", npcId: "NPC-MAYA" });
    expect(selectConversationFrame(gameStore.getState())).toBeNull();
    expect(selectWorldRender(gameStore.getState()).preset).toBe("thirdPerson");
  });

  test("A13: el NPC resaltado y el del aviso del HUD siempre coinciden (incluido el medio entre Inés y Harlan)", async () => {
    await startMap();
    render(<WorldHud />);
    const ines = npc("NPC-INES");
    const harlan = npc("NPC-HARLAN");
    const nell = npc("NPC-NELL");
    const spots: [number, number][] = [
      [0.5, 3], [nell.x + 1, nell.z], [ines.x - 1, ines.z], [(ines.x + harlan.x) / 2, (ines.z + harlan.z) / 2],
      [harlan.x - 1, harlan.z], [harlan.x - 0.6, harlan.z - 1.2], [ines.x + 0.4, ines.z + 1.3], [-6, -2],
    ];
    const seen = new Set<string | null>();
    for (const [x, z] of spots) {
      act(() => bridge.moveTo(x, z));
      act(() => { settle(); });
      const s = gameStore.getState();
      const highlighted = selectHighlightedNpc(s);
      const prompt = selectWorldHudView(s).prompt;
      seen.add(highlighted);
      expect(highlighted, `en ${x},${z}`).toBe(prompt?.kind === "npc" ? prompt.id : null);
      const lit = labelEntries(selectMapView(s).actors, highlighted, null).filter((l) => l.highlighted);
      expect(lit.map((l) => l.id)).toEqual(highlighted === null ? [] : [highlighted]);
      const card = document.getElementById("world-prompt");
      if (highlighted === null) expect(card).toBeNull();
      else expect(card?.textContent?.replace(/\s+/g, " ")).toBe(`E Hablar con ${npcName(highlighted)}`);
    }
    // The route passes through the three NPCs and through places with nobody in range.
    expect([...seen].sort()).toEqual(["NPC-HARLAN", "NPC-INES", "NPC-NELL", null].sort());
  });
});
