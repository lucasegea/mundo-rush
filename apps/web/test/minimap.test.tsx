// @vitest-environment jsdom
// Open-world-3d T9 (M4): el minimapa en el store y en la interfaz.
//   · AC54: `completedNpcs` crece con un `scene.end` exitoso; los pendientes de Galeano y de la campesino.
//   · AC55: abajo a la derecha (1rem + área segura), 7rem/10rem, tres anillos `data-npc-id` con los colores del
//     selector y un nombre accesible con cada pendiente y su distancia en metros (el contraste >= 3:1 de esos colores,
//     contra cada look, está en scripts/a11y/minimap-contrast.test.ts, donde vive la fórmula WCAG). jsdom no tiene layout: la geometría real (px a
//     1280x720 y 375x667) la mide la caminata (`LG_WALK_ONLY=minimap`, AC57); acá se prueba el contrato de clases.
//   · AC56: a lo sumo 10 redibujos por segundo con 60 cuadros de movimiento en un reloj de prueba, ninguno quieto, fuera
//     del bucle de render; "reducir movimiento" corta el giro.
//   · Visible a todo zoom; oculto en la charla y en `dialog-only`.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prepareDiorama, type DioramaLayout } from "@lg/core";
import type { ServerMessage } from "@lg/protocol";
import minimapSource from "../src/ui/hud/Minimap.tsx?raw";
import { parseDialogOnlyCatalog } from "../src/services/content/dialogOnlyCatalog";
import { actions, withCompletedNpc } from "../src/state/actions";
import { selectMinimap, selectMinimapVisible, selectPendingNpcs } from "../src/state/selectors";
import { gameStore } from "../src/state/store";
import { Minimap } from "../src/ui/hud/Minimap";
import { WorldHud } from "../src/ui/hud/WorldHud";
import { compiledClientContent, compiledUniverseClientContent, resetStore } from "./helpers";

const GALEANO = compiledUniverseClientContent("U-GALEANO");
const CAMPESINO = compiledClientContent();
const layoutOf = (c: Record<string, unknown>, pred: (d: DioramaLayout) => boolean): DioramaLayout => {
  const d = (c["dioramas.json"] as DioramaLayout[]).find(pred);
  if (!d) throw new Error("no hay diorama");
  return d;
};
const MUELLE = layoutOf(GALEANO, (d) => d.id === "muelle");
const CAMPESINO_MAP = layoutOf(CAMPESINO, (d) => (d.npcs ?? []).some((n) => n.id === "NPC-INES"));

/** Mapa jugable con ese contenido: catálogo, diorama, fase `world`, tier medio. */
function playOn(content: Record<string, unknown>, layout: DioramaLayout): void {
  actions.contentLoaded(parseDialogOnlyCatalog(content["lugares.json"], content["npcs.json"]));
  actions.dioramaLoaded(layout);
  const s = gameStore.getState();
  gameStore.setState({
    session: { ...s.session, phase: "world" },
    settings: { ...s.settings, graphics: { ...s.settings.graphics, suggestedTier: "medium" } },
  });
}

/** Una escena abierta con `npcId` que termina con `outcome` (lo que manda el servidor). */
function finishScene(npcId: string, outcome: Extract<ServerMessage, { type: "scene.end" }>["outcome"]): void {
  actions.sceneMessage({ type: "scene.opened", sceneRunId: `run-${npcId}`, missionId: "M1.2", sceneId: "E1", npcId, modality: "text" } as ServerMessage);
  actions.sceneMessage({ type: "scene.end", outcome, criteriaMet: [], evidence: [] });
}

const pendingIds = (): string[] => selectPendingNpcs(gameStore.getState()).map((n) => n.id);

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetStore();
  consoleError = vi.spyOn(console, "error");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(consoleError).not.toHaveBeenCalled();
});

describe("AC54: completedNpcs en el store y los pendientes del selector", () => {
  test("Galeano: [MITAYO, CERRO, FACTOR] y un scene.end con éxito de MITAYO lo saca", () => {
    playOn(GALEANO, MUELLE);
    expect(pendingIds()).toEqual(["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]);
    finishScene("NPC-MITAYO", "success");
    expect(gameStore.getState().progression.completedNpcs).toEqual(["NPC-MITAYO"]);
    expect(pendingIds()).toEqual(["NPC-CERRO", "NPC-FACTOR"]);
    // Repetir el éxito no duplica.
    finishScene("NPC-MITAYO", "success");
    expect(gameStore.getState().progression.completedNpcs).toEqual(["NPC-MITAYO"]);
  });

  test("un final que no es éxito no saca a nadie", () => {
    playOn(GALEANO, MUELLE);
    for (const outcome of ["partial", "hardCap", "containment", "aborted"] as const) finishScene("NPC-CERRO", outcome);
    expect(gameStore.getState().progression.completedNpcs).toEqual([]);
    expect(pendingIds()).toEqual(["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]);
  });

  test("withCompletedNpc: sin NPC o sin éxito devuelve el mismo objeto", () => {
    const p = gameStore.getState().progression;
    expect(withCompletedNpc(p, "success", null)).toBe(p);
    expect(withCompletedNpc(p, "partial", "NPC-X")).toBe(p);
    expect(withCompletedNpc(p, "success", "NPC-X").completedNpcs).toEqual(["NPC-X"]);
  });

  test("la campesino da su propia lista (los NPCs de su diorama, ninguno de Galeano)", () => {
    playOn(CAMPESINO, CAMPESINO_MAP);
    const ids = pendingIds();
    expect(ids).toEqual((CAMPESINO_MAP.npcs ?? []).map((n) => n.id));
    expect(ids).toContain("NPC-INES");
    expect(ids.some((id) => ["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"].includes(id))).toBe(false);
  });
});

describe("visibilidad: a todo zoom; oculto en la charla y en dialog-only", () => {
  test("zoom t 0 y mapa entero: visible; con la escena arriba o en dialog-only: oculto", () => {
    playOn(GALEANO, MUELLE);
    const s = gameStore.getState();
    gameStore.setState({ ui: { ...s.ui, camera: { ...s.ui.camera, zoomDistance: 2.5, overview: false } } });
    expect(selectMinimapVisible(gameStore.getState())).toBe(true);
    actions.toggleOverview();
    expect(gameStore.getState().ui.camera.overview).toBe(true);
    expect(selectMinimapVisible(gameStore.getState())).toBe(true);
    const u = gameStore.getState().ui;
    gameStore.setState({ ui: { ...u, panels: [{ kind: "scene", npcId: "NPC-MITAYO" }] } });
    expect(selectMinimapVisible(gameStore.getState())).toBe(false);
    gameStore.setState({ ui: { ...u, panels: [] } });
    const g = gameStore.getState().settings;
    gameStore.setState({ settings: { ...g, graphics: { ...g.graphics, tier: "dialog-only" } } });
    expect(selectMinimapVisible(gameStore.getState())).toBe(false);
  });

  test("WorldHud lo monta (y por eso no está en la charla, donde el shell muestra el HUD de diálogo)", () => {
    playOn(GALEANO, MUELLE);
    render(<WorldHud />);
    expect(screen.getByTestId("minimap")).toBeTruthy();
  });
});

/** Contexto 2D de mentira: jsdom no tiene canvas. Cuenta los redibujos por `clearRect`. */
function fakeCanvas(): { clears: () => number; reset: () => void } {
  let n = 0;
  const ctx = new Proxy({}, {
    get: (_t, key) => (key === "clearRect" ? () => { n++; } : typeof key === "string" && /^(set|get|create|measure|is)/.test(key) ? () => [] : () => undefined),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ctx) as never);
  // jsdom no tiene layout (clientWidth 0) y sin lado medido el minimapa no pinta: se simula el de escritorio.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(160);
  return { clears: () => n, reset: () => { n = 0; } };
}

describe("AC55: lugar, tamaño, anillos y nombre accesible", () => {
  test("abajo a la derecha (1rem + área segura), 7rem en teléfono y 10rem desde md, tres anillos y las distancias", () => {
    fakeCanvas();
    playOn(GALEANO, MUELLE);
    render(<Minimap />);
    const root = screen.getByTestId("minimap");
    const cls = root.className.split(" ");
    expect(cls).toEqual(expect.arrayContaining(["fixed", "right-[calc(1rem+env(safe-area-inset-right))]", "bottom-[calc(1rem+env(safe-area-inset-bottom))]"]));
    const map = screen.getByTestId("minimap-map").className.split(" ");
    expect(map).toEqual(expect.arrayContaining(["size-[7rem]", "md:size-[10rem]"])); // 112 y 160 px con texto al 100 %
    const rings = root.querySelectorAll("[data-npc-id]");
    expect([...rings].map((r) => r.getAttribute("data-npc-id"))).toEqual(["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]);
    // El nombre accesible lista cada pendiente con su distancia redondeada en metros.
    const s = gameStore.getState();
    const p = s.player.position as { x: number; z: number };
    const name = root.getAttribute("aria-label") ?? "";
    for (const n of s.world.diorama?.npcs ?? []) {
      const npcName = s.world.npcs.find((x) => x.id === n.id)?.name ?? n.id;
      expect(name).toContain(`${npcName}, a ${Math.round(Math.hypot(n.x - p.x, n.z - p.z))} metros`);
    }
    expect(screen.getByRole("region", { name })).toBe(root);
    expect(root.querySelectorAll("ul.sr-only li")).toHaveLength(3);
    // Cada anillo pinta el rojo con contorno de tinta (los colores del selector, ningún hex en ui/).
    const style = (rings[0] as HTMLElement).getAttribute("style") ?? "";
    expect(style).toMatch(/rgb\(255, 84, 72\)|#ff5448/i);
    expect(style).toMatch(/rgb\(42, 42, 51\)|#2a2a33/i);
  });

  test("todos visitados: sin anillos y el nombre lo dice", () => {
    fakeCanvas();
    playOn(GALEANO, MUELLE);
    for (const id of ["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]) finishScene(id, "success");
    render(<Minimap />);
    expect(screen.getByTestId("minimap").querySelectorAll("[data-npc-id]")).toHaveLength(0);
    expect(screen.getByTestId("minimap").getAttribute("aria-label")).toContain("Ya visitaste a todos");
  });
});

describe("AC56: redibujo con tope de 10 por segundo, fuera del bucle de render", () => {
  test("60 cuadros de movimiento en un reloj de prueba: a lo sumo 10 redibujos; quieto, ninguno", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => { throw new Error("el minimapa no usa requestAnimationFrame"); });
    const canvas = fakeCanvas();
    playOn(GALEANO, MUELLE);
    render(<Minimap />);
    expect(canvas.clears()).toBe(1); // el primer dibujo, al montar
    canvas.reset();
    for (let f = 0; f < 60; f++) {
      const s = gameStore.getState();
      const p = s.player.position as { x: number; z: number };
      act(() => { gameStore.setState({ player: { ...s.player, position: { x: p.x + 0.07, z: p.z } } }); });
      act(() => { vi.advanceTimersByTime(1000 / 60); });
    }
    expect(canvas.clears()).toBeLessThanOrEqual(10);
    expect(canvas.clears()).toBeGreaterThanOrEqual(9);
    // El último paso puede caer justo después del último redibujo: se deja pasar un redibujo y después, quieto, nada.
    act(() => { vi.advanceTimersByTime(100); });
    canvas.reset();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(canvas.clears()).toBe(0);
  });

  test("el código no toca el bucle de three (useFrame, @react-three, requestAnimationFrame) ni escribe un hex", () => {
    const code = minimapSource.replace(/^\s*\/\/.*$/gm, "");
    expect(minimapSource.length).toBeGreaterThan(1000); // guardia contra 0 medido
    expect(code).not.toMatch(/useFrame|@react-three|requestAnimationFrame/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).toContain("setInterval(tick, MINIMAP_REDRAW_MS)");
  });

  test("reducir movimiento corta el giro; sin él se suaviza", () => {
    vi.useFakeTimers();
    fakeCanvas();
    playOn(GALEANO, MUELLE);
    const turn = (yawDeg: number): void => {
      const s = gameStore.getState();
      act(() => { gameStore.setState({ ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg } } }); });
      act(() => { vi.advanceTimersByTime(100); });
    };
    render(<Minimap />);
    const map = screen.getByTestId("minimap-map");
    expect(map.dataset.heading).toBe("0");
    turn(90);
    expect(map.dataset.heading).toBe(String(Math.round(90 * (1 - Math.exp(-1.2)))));
    cleanup();
    const s = gameStore.getState();
    gameStore.setState({ settings: { ...s.settings, accessibility: { ...s.settings.accessibility, reduceMotion: true } } });
    render(<Minimap />);
    turn(180);
    expect(screen.getByTestId("minimap-map").dataset.heading).toBe("180");
    // El selector, sin componente: con reducir movimiento el giro es el pedido en un solo redibujo.
    expect(selectMinimap(gameStore.getState(), { prevYawDeg: 0, dtS: 0.1 }).yawDeg).toBe(180);
  });

  test("los anillos van donde dice el modelo (el NPC lejano, como flecha en el borde)", () => {
    vi.useFakeTimers();
    fakeCanvas();
    playOn(GALEANO, MUELLE);
    render(<Minimap />);
    const model = selectMinimap(gameStore.getState()).model;
    for (const k of model?.markers ?? []) {
      const el = screen.getByTestId("minimap").querySelector(`[data-npc-id="${k.id}"]`) as HTMLElement;
      expect(el.style.transform).toContain(`translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)`);
      expect(el.dataset.edge).toBe(String(k.edge));
    }
  });
});

test("prepareDiorama del muelle trae los tres NPCs de Galeano en el orden del layout (base de AC54)", () => {
  expect(prepareDiorama(MUELLE).npcs.map((n) => n.id)).toEqual(["NPC-MITAYO", "NPC-CERRO", "NPC-FACTOR"]);
});
