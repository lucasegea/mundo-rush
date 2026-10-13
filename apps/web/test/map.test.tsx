// @vitest-environment jsdom
// F2 A1 (en la app), A3, A5, A7, A8, A9: el mapa de prueba real (content/dioramas/test.yaml compilado) cargado
// por boot(), con el store y las acciones reales. El teclado entra por services/input con eventos sintéticos sobre
// un EventTarget; el clic de R3F entra por state/bridge.ts. Ambos tienen que producir las MISMAS acciones (R10).
// El lazo de simulación corre con un planificador falso: el tiempo lo avanza el test.
import { act, cleanup, render, screen } from "@testing-library/react";
import { circleBlocked, DEFAULT_ZOOM_STEP, facingFrom, planPath, SIM_DT, ZOOM_STEPS, type DioramaLayout } from "@lg/core";
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

/** Planificador de cuadros manual: `advance(ms)` corre un cuadro con el reloj adelantado. */
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
/** Corre cuadros de 1/60 s hasta que la condición se cumpla (o falla). */
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
    expect(view.diorama?.layers.map((l) => l.name)).toEqual(["suelo", "detalle"]);
    expect(view.diorama?.boxes.length).toBeGreaterThan(4);
    expect(view.actors.map((a) => a.id).sort()).toEqual(["NPC-HARLAN", "NPC-INES", "NPC-NELL"]);
    // Los NPCs llevan el nombre del catálogo (no el id).
    expect(view.actors.every((a) => a.name !== a.id)).toBe(true);
    expect(pos()).toEqual({ x: 0.5, z: 3 });
    expect(selectMapActive(gameStore.getState())).toBe(true);
  });

  test("el modo solo-diálogo nunca pide el diorama", async () => {
    const fetchJson = vi.fn((url: string) => {
      const name = url.slice(url.lastIndexOf("/") + 1);
      const files = compiledClientContent();
      return name in files ? Promise.resolve(files[name]) : Promise.reject(new Error(url));
    });
    // Sin WebGL se aterriza en solo-diálogo; elegirlo de nuevo tampoco carga el mapa.
    await act(async () => { stop = await bootApp({ webgl2: false, fetchJson }); });
    act(() => actions.enterDialogOnly());
    act(() => actions.enterWorld()); // sin WebGL no se entra al mapa
    expect(fetchJson.mock.calls.map(([u]) => u).some((u) => u.endsWith("dioramas.json"))).toBe(false);
    expect(gameStore.getState().world.dioramaStatus).toBe("idle");
  });

  test("si el diorama no carga: estado error, anuncio y el HUD ofrece solo-diálogo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await act(async () => {
      await loadDiorama(actions, "/", "test", () => Promise.reject(new Error("404")));
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
    // Se para al sudoeste de la esquina común (-8, 6) y empuja hacia el noreste.
    act(() => {
      gameStore.setState((s) => ({ player: { ...s.player, position: { x: -8.6, z: 6.6 }, previous: { x: -8.6, z: 6.6 } } }));
    });
    act(() => actions.move({ x: 1, y: 1 }));
    act(() => { for (let i = 0; i < 90; i++) clock.advance(1000 / 30); });
    const p = pos();
    // No cruzó al otro lado de la diagonal de las cajas (x > -8 y z < 6 a la vez).
    expect(p.x > -8 && p.z < 6).toBe(false);
  });

  test("el lazo corre a paso fijo: 1 s de cuadros irregulares = 30 pasos; sin mapa activo no acumula", async () => {
    await startMap();
    const t0 = gameStore.getState().player.simTick;
    act(() => actions.move({ x: 1, y: 0 }));
    act(() => clock.advance(0)); // primer cuadro: fija el reloj, sin pasos
    // 1000 ms en cuadros irregulares (ninguno pasa el tope de 5 pasos por cuadro).
    act(() => { for (const ms of [5, 40, 16, 100, 33, 7, 99, 150, 50, 100, 120, 80, 100, 100]) clock.advance(ms); });
    expect(gameStore.getState().player.simTick - t0).toBe(Math.round(1 / SIM_DT));
    act(() => actions.openSettings());
    const t1 = gameStore.getState().player.simTick;
    act(() => { for (let i = 0; i < 30; i++) clock.advance(100); });
    expect(gameStore.getState().player.simTick).toBe(t1);
    act(() => actions.closePanel());
    act(() => clock.advance(16));
    // Al volver no hay un salto por el tiempo en pausa: a lo sumo un paso.
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
    // Botón derecho no camina.
    act(() => bridge.pointer({ kind: "ground", x: 3, z: 3 }, 2));
    expect(gameStore.getState().player.intent.kind).toBe("idle");
  });

  test("E frente a un NPC = clic sobre ese NPC: el mismo panel de escena", async () => {
    // Con el teclado.
    await startMap();
    const nell = npc("NPC-NELL");
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    act(() => { key("keydown", "KeyE"); });
    const byKey = gameStore.getState().ui.panels;
    stop();
    // Con el puntero, desde el mismo lugar.
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
    const zoomAfter = (fn: () => void) => { act(fn); return gameStore.getState().ui.zoomStep; };
    const start = gameStore.getState().ui.zoomStep;
    const byKey = zoomAfter(() => { key("keydown", "Equal"); });
    act(() => actions.zoomOut());
    expect(gameStore.getState().ui.zoomStep).toBe(start);
    // Teclado español/latinoamericano: el "+" impreso es BracketRight y el "-" es Slash (D-197, nota N1 de QA).
    expect(zoomAfter(() => { key("keydown", "BracketRight", "+"); })).toBe(byKey);
    expect(zoomAfter(() => { key("keydown", "Slash", "-"); })).toBe(start);
    stop();
    // La rueda sobre el canvas: el servicio escucha en document (como en window en la app) y mira el target real.
    stop = startInput({ target: document, dispatch: actions.dispatch, isActive: () => selectMapActive(gameStore.getState()) });
    act(() => { inner.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true })); });
    expect(gameStore.getState().ui.zoomStep).toBe(byKey);
    act(() => { panel.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true })); });
    expect(gameStore.getState().ui.zoomStep).toBe(byKey);
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
    // Dentro de un campo de texto: el servicio escucha en document y mira el target real del evento.
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
    // readGame lee la posición sin suscribirse (para world/).
    expect(readGame((s) => s.player.position)).toBe(gameStore.getState().player.position);
  });
});

describe("A9 zoom: la escalera de D-208 acotada, con teclas, rueda o botones", () => {
  test("acercar y alejar recorren toda la escalera de a un paso y se acotan; el HUD dice el nivel y los botones hacen lo mismo", async () => {
    await startMap();
    const step = () => gameStore.getState().ui.zoomStep;
    expect(step()).toBe(DEFAULT_ZOOM_STEP);
    expect(selectWorldRender(gameStore.getState()).zoomDistance).toBe(30);
    act(() => { for (let i = 0; i < ZOOM_STEPS + 2; i++) key("keydown", i % 2 ? "NumpadAdd" : "Equal"); });
    expect(step()).toBe(ZOOM_STEPS - 1);
    expect(selectWorldRender(gameStore.getState()).zoomDistance).toBe(22);
    const walked: number[] = [];
    act(() => { for (let i = 0; i < ZOOM_STEPS + 2; i++) { key("keydown", "Minus"); walked.push(step()); } });
    expect(walked.slice(0, ZOOM_STEPS - 1)).toEqual(Array.from({ length: ZOOM_STEPS - 1 }, (_, i) => ZOOM_STEPS - 2 - i));
    expect(step()).toBe(0);
    expect(selectWorldRender(gameStore.getState()).zoomDistance).toBe(160);
    render(<WorldHud />);
    expect(screen.getByText(`Zoom 1 de ${ZOOM_STEPS}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alejar" }).getAttribute("aria-disabled")).toBe("true");
    act(() => { screen.getByRole("button", { name: "Acercar" }).click(); });
    expect(selectWorldHudView(gameStore.getState()).zoomStep).toBe(1);
    expect(selectWorldRender(gameStore.getState()).zoomStep).toBe(1);
    expect(selectWorldRender(gameStore.getState()).zoomDistance).toBe(120);
  });

  test("rueda de trackpad: muchos eventos chicos suman una muesca, no recorren la escalera", async () => {
    await startMap();
    const surface = document.createElement("div");
    surface.setAttribute(WORLD_SURFACE_ATTR, "");
    document.body.append(surface);
    stop();
    stop = startInput({ target: document, dispatch: actions.dispatch, isActive: () => selectMapActive(gameStore.getState()) });
    const start = gameStore.getState().ui.zoomStep;
    act(() => { for (let i = 0; i < 12; i++) surface.dispatchEvent(new WheelEvent("wheel", { deltaY: 5, bubbles: true, cancelable: true })); });
    expect(gameStore.getState().ui.zoomStep).toBe(start - 1);
    act(() => { for (let i = 0; i < 3; i++) surface.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true })); });
    expect(gameStore.getState().ui.zoomStep).toBe(start - 4);
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

// Plan estetica-c M1 (D-207): las partes del look C que viven en el store, sobre el diorama de prueba real.
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
    // Del lado desde el que llegó.
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
    expect(selectWorldRender(gameStore.getState()).preset).toBe("perspective3D");
    // A8: una escena con un NPC que no está en este diorama no encuadra a nadie.
    act(() => actions.enterScene("NPC-MAYA"));
    expect(gameStore.getState().ui.panels.at(-1)).toEqual({ kind: "scene", npcId: "NPC-MAYA" });
    expect(selectConversationFrame(gameStore.getState())).toBeNull();
    expect(selectWorldRender(gameStore.getState()).preset).toBe("perspective3D");
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
    // El recorrido pasa por los tres NPCs y por lugares sin nadie en rango.
    expect([...seen].sort()).toEqual(["NPC-HARLAN", "NPC-INES", "NPC-NELL", null].sort());
  });
});
