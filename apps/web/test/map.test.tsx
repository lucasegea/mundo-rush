// @vitest-environment jsdom
// F2 A1 (en la app), A3, A5, A7, A8, A9: el mapa de prueba real (content/dioramas/test.yaml compilado) cargado
// por boot(), con el store y las acciones reales. El teclado entra por services/input con eventos sintéticos sobre
// un EventTarget; el clic de R3F entra por state/bridge.ts. Ambos tienen que producir las MISMAS acciones (R10).
// El lazo de simulación corre con un planificador falso: el tiempo lo avanza el test.
import { act, cleanup, render, screen } from "@testing-library/react";
import { planPath, SIM_DT, type DioramaLayout } from "@lg/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadDiorama, pickDiorama } from "../src/services/content";
import { startInput, WORLD_SURFACE_ATTR } from "../src/services/input";
import type { FrameScheduler } from "../src/services/simulation";
import { actions } from "../src/state/actions";
import { bridge } from "../src/state/bridge";
import {
  readGame, selectInteractionPrompt, selectMapActive, selectMapView, selectWorldHudView, selectWorldRender,
} from "../src/state/selectors";
import { gameStore } from "../src/state/store";
import { WorldHud } from "../src/ui/hud/WorldHud";
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
    expect(view.actors.map((a) => a.id).sort()).toEqual(["NPC-INES", "NPC-NELL"]);
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
  test("acercarse a un NPC muestra «E para hablar con …»; alejarse lo saca", async () => {
    await startMap();
    render(<WorldHud />);
    expect(screen.queryByText(/E para hablar con/)).toBeNull();
    const nell = npc("NPC-NELL");
    act(() => bridge.moveTo(nell.x + 1, nell.z));
    act(() => { settle(); });
    expect(selectInteractionPrompt(gameStore.getState())?.id).toBe("NPC-NELL");
    expect(screen.getByText(`E para hablar con ${npcName("NPC-NELL")}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Hablar con ${npcName("NPC-NELL")}` })).toBeTruthy();
    act(() => bridge.moveTo(0.5, 3));
    act(() => { settle(); });
    expect(screen.queryByText(/E para hablar con/)).toBeNull();
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

describe("A9 zoom: 3 pasos acotados, con teclas, rueda o botones", () => {
  test("acercar y alejar se acotan en [0, 2]; el HUD dice el nivel y los botones hacen lo mismo", async () => {
    await startMap();
    expect(gameStore.getState().ui.zoomStep).toBe(1);
    act(() => { key("keydown", "Equal"); key("keydown", "NumpadAdd"); key("keydown", "Equal"); });
    expect(gameStore.getState().ui.zoomStep).toBe(2);
    act(() => { for (let i = 0; i < 5; i++) key("keydown", "Minus"); });
    expect(gameStore.getState().ui.zoomStep).toBe(0);
    render(<WorldHud />);
    expect(screen.getByText("Zoom 1 de 3")).toBeTruthy();
    act(() => { screen.getByRole("button", { name: "Acercar" }).click(); });
    expect(selectWorldHudView(gameStore.getState()).zoomStep).toBe(1);
    expect(selectWorldRender(gameStore.getState()).zoomStep).toBe(1);
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
