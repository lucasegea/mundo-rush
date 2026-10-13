// Plan estetica-c M6 (03 §2.7.1, §2.7.4): tiers de calidad y presupuestos en PCs modestas, sin GPU (D-016).
// - TIER_PARAMS (lo que llega a world/) coincide con los topes y la densidad de @lg/art; `low` sin sombra direccional,
//   sin post y con la densidad reducida;
// - el tope de cuadros: 30 con una escena de conversación arriba, el del tier fuera; el regulador simulado lo cumple y
//   PerformanceMonitor no mide durante la charla;
// - durante la charla solo se animan el jugador y el NPC de la escena;
// - memoria de texturas por tier dentro de 24 / 48 / 96 MB;
// - la muestra de renderer.info de la sonda del modo director.
import { DENSITY, keepDetail, keptDetail, SHADOW_MAP_TIERS, TIER_BUDGETS, TIER_DENSITY, WORLD_TIERS } from "@lg/art";
import { describe, expect, test } from "vitest";
import { TIER_PARAMS } from "../src/services/quality";
import { CONVERSATION_MAX_FPS, selectWorldRender } from "../src/state/selectors";
import { createGameStore, type GameState } from "../src/state/store";
import { pickAnimated, sceneAnimated } from "../src/world/actors/animState";
import { PLAYER_LOOK_ID } from "../src/world/actors/looks";
import { sampleRenderStats } from "../src/world/budget/renderStats";
import { estimateTextureMemory } from "../src/world/budget/textures";
import { frameCap, frameDue, monitorActive, nextDeadline, simulateFrames } from "../src/world/frameRate";
import type { WorldTierParams } from "../src/world/GameCanvas";
import { labelLayout } from "../src/world/labels/labels";
import { postLevel } from "../src/world/post/level";
import { compiledClientContent } from "./helpers";

const withPanels = (s: GameState, panels: GameState["ui"]["panels"]): GameState => ({ ...s, ui: { ...s.ui, panels } });

describe("TIER_PARAMS es lo que llega a world/ y coincide con @lg/art", () => {
  test("topes de llamadas, triángulos y texturas: los mismos números en los dos lados (ningún umbral cambia)", () => {
    for (const tier of WORLD_TIERS) {
      const p = TIER_PARAMS[tier];
      expect({ maxDrawCalls: p.maxDrawCalls, maxTriangles: p.maxTriangles, maxTextureMb: p.maxTextureMb }, tier).toEqual(TIER_BUDGETS[tier]);
    }
  });

  test("la densidad de cada tier es la que usa el estimador de validate:content", () => {
    for (const tier of WORLD_TIERS) expect(TIER_PARAMS[tier].density, tier).toBe(TIER_DENSITY[tier]);
  });

  test("solo `high` proyecta sombra direccional (y el estimador cuenta su pasada solo ahí)", () => {
    expect(WORLD_TIERS.filter((t) => TIER_PARAMS[t].shadows === "directional")).toEqual([...SHADOW_MAP_TIERS]);
  });

  test("low: sin sombra direccional, sin post, densidad reducida, 30 FPS y DPR 1", () => {
    const low = TIER_PARAMS.low;
    expect(low).toMatchObject({ shadows: "none", post: "none", density: "reduced", targetFps: 30, maxDpr: 1 });
    expect(postLevel(true, low.post)).toBe("none");
    expect(postLevel(true, TIER_PARAMS["dialog-only"].post)).toBe("none");
    expect(postLevel(false, TIER_PARAMS.high.post)).toBe("none");
    expect(postLevel(true, TIER_PARAMS.high.post)).toBe("full");
  });

  test("medium conserva las sombras blob y los techos de DPR del plan (§9 por defecto)", () => {
    expect(TIER_PARAMS.medium).toMatchObject({ shadows: "blob", maxDpr: 1.5, density: "full" });
    expect(TIER_PARAMS.high.maxDpr).toBe(2);
  });

  test("la densidad reducida recorta de verdad: menos detalle, menos pinos de borde, terreno más grueso, niebla más corta", () => {
    const r = DENSITY.reduced;
    const f = DENSITY.full;
    expect(r.detailKeepEvery).toBeGreaterThan(f.detailKeepEvery);
    expect(r.borderPines).toBeLessThan(f.borderPines);
    expect(r.terrain.fineStep).toBeGreaterThan(f.terrain.fineStep);
    expect(r.fogScale).toBeLessThan(f.fogScale);
    for (const n of [0, 1, 2, 3, 10, 31]) {
      expect(keptDetail(n, "reduced"), `${n}`).toBe(keepDetail(Array.from({ length: n }, (_, i) => i), "reduced").length);
      expect(keptDetail(n, "full")).toBe(n);
    }
  });

  test("TIER_PARAMS cabe en lo que GameCanvas recibe (WorldTierParams): tsc lo exige", () => {
    const asWorld: Readonly<Record<keyof typeof TIER_PARAMS, WorldTierParams>> = TIER_PARAMS;
    expect(asWorld.low.density).toBe("reduced");
  });
});

describe("tope de cuadros (03 §2.7.4)", () => {
  test("el selector: 30 FPS con una escena de conversación arriba; null sin panel o con otro panel arriba", () => {
    const s = createGameStore().getState();
    expect(CONVERSATION_MAX_FPS).toBe(30);
    expect(selectWorldRender(s).conversationFps).toBeNull();
    expect(selectWorldRender(withPanels(s, [{ kind: "scene", npcId: "NPC-NELL" }])).conversationFps).toBe(30);
    const menuOnTop = withPanels(s, [{ kind: "scene", npcId: "NPC-NELL" }, { kind: "mainMenu" }]);
    expect(selectWorldRender(menuOnTop).conversationFps).toBeNull();
    expect(selectWorldRender(menuOnTop).paused).toBe(true);
  });

  test("frameCap: el menor de los topes; fuera de la charla manda el del tier", () => {
    expect(frameCap(30, 60)).toBe(30);
    expect(frameCap(30, 30)).toBe(30);
    expect(frameCap(null, 60)).toBe(60);
    expect(frameCap(null, TIER_PARAMS.low.targetFps)).toBe(30);
    expect(frameCap(30, null)).toBe(30);
    expect(frameCap(null, null)).toBeNull();
  });

  test("el regulador simulado cumple el tope en pantallas de 60, 75, 120 y 144 Hz", () => {
    const fps = (hz: number, cap: number): number => simulateFrames(hz, cap, 10_000) / 10;
    expect(fps(60, 30)).toBeCloseTo(30, 0);
    expect(fps(120, 30)).toBeCloseTo(30, 0);
    expect(fps(144, 30)).toBeLessThanOrEqual(30.1);
    expect(fps(144, 30)).toBeGreaterThanOrEqual(28.5);
    expect(fps(75, 30)).toBeLessThanOrEqual(30.1);
    expect(fps(144, 60)).toBeLessThanOrEqual(60.1);
    expect(fps(144, 60)).toBeGreaterThanOrEqual(57);
    expect(fps(60, 60)).toBeCloseTo(60, 0);
  });

  test("con temblor de rAF (±1 ms) a 60 Hz y tope 60 no se pierde ningún cuadro; a tope 30 nunca pasa de 30", () => {
    const jitter = (i: number): number => ((i * 7919) % 3) - 1;
    expect(simulateFrames(60, 60, 10_000, jitter)).toBeGreaterThanOrEqual(598);
    expect(simulateFrames(60, 30, 10_000, jitter) / 10).toBeLessThanOrEqual(30.1);
  });

  test("frameDue y nextDeadline: el plazo avanza un intervalo exacto y se resincroniza después de una traba", () => {
    expect(frameDue(32.5, 1000 / 30)).toBe(true);
    expect(frameDue(16.7, 1000 / 30)).toBe(false);
    expect(nextDeadline(1000 / 30, 40, 30)).toBeCloseTo(2000 / 30, 9);
    expect(nextDeadline(1000 / 30, 500, 30)).toBeCloseTo(500 + 1000 / 30, 9);
  });

  test("en ninguna pantalla se pasa del tope: a lo sumo un cuadro más que los plazos vencidos", () => {
    for (const hz of [30, 50, 60, 75, 90, 120, 144, 165, 240]) {
      for (const cap of [30, 60]) {
        expect(simulateFrames(hz, cap, 10_000), `${hz} Hz tope ${cap}`).toBeLessThanOrEqual(cap * 10 + 1);
      }
    }
  });

  test("PerformanceMonitor no mide durante la charla (nunca sube ni baja tier o DPR por el tope propio)", () => {
    expect(monitorActive(null)).toBe(true);
    expect(monitorActive(CONVERSATION_MAX_FPS)).toBe(false);
  });
});

describe("congelar lo no esencial durante la charla", () => {
  const entries = [
    { id: PLAYER_LOOK_ID, distance: 3, onScreen: true },
    { id: "NPC-NELL", distance: 4, onScreen: true },
    { id: "NPC-INES", distance: 2, onScreen: true },
    { id: "NPC-HARLAN", distance: 9, onScreen: true },
  ];

  test("fuera de la charla todos compiten por el tope; durante, solo el jugador y el NPC de la escena", () => {
    expect(sceneAnimated(false, [PLAYER_LOOK_ID, "NPC-NELL"])).toBeNull();
    expect(pickAnimated(entries, 8, null).size).toBe(4);
    const only = sceneAnimated(true, [PLAYER_LOOK_ID, "NPC-NELL"]);
    expect([...pickAnimated(entries, 8, only)].sort()).toEqual(["NPC-NELL", PLAYER_LOOK_ID].sort());
    expect([...pickAnimated(entries, 1, only)]).toEqual([PLAYER_LOOK_ID]);
    expect([...(sceneAnimated(true, [PLAYER_LOOK_ID, null]) ?? [])]).toEqual([PLAYER_LOOK_ID]);
  });
});

describe("memoria de texturas por tier (03 §2.7.1: 24 / 48 / 96 MB)", () => {
  const measure = (text: string): number => text.length * 9;
  const names = (compiledClientContent()["npcs.json"] as { id: string; nombre?: string }[]).map((n) => n.nombre ?? n.id);

  test("el contenido real en cada tier entra (todas las etiquetas, en sus dos variantes, y una burbuja por NPC)", () => {
    expect(names.length).toBeGreaterThan(0);
    const labels = names.flatMap((n) => [labelLayout(n, false, measure), labelLayout(n, true, measure)]);
    for (const tier of WORLD_TIERS) {
      const e = estimateTextureMemory({ labels, bubbles: names.length, shadowMap: (SHADOW_MAP_TIERS as readonly string[]).includes(tier) });
      expect(e.mb, `${tier} ${JSON.stringify(e.parts)}`).toBeLessThanOrEqual(TIER_BUDGETS[tier].maxTextureMb);
      expect(e.mb).toBeGreaterThan(0);
    }
  });

  test("el mapa de sombra cuenta solo donde hay sombra direccional", () => {
    const base = estimateTextureMemory({ labels: [], bubbles: 0, shadowMap: false });
    const high = estimateTextureMemory({ labels: [], bubbles: 0, shadowMap: true });
    expect(high.bytes - base.bytes).toBe(1024 * 1024 * 4);
  });

  test("teeth: 2.000 etiquetas grandes se pasan de low", () => {
    const labels = Array.from({ length: 2000 }, () => ({ width: 512, height: 64 }));
    expect(estimateTextureMemory({ labels, bubbles: 0, shadowMap: false }).mb).toBeGreaterThan(TIER_BUDGETS.low.maxTextureMb);
  });
});

describe("la sonda de renderer.info (solo modo director)", () => {
  test("la muestra copia llamadas, triángulos, texturas y geometrías; los FPS salen de la ventana", () => {
    const info = { render: { calls: 29, triangles: 22302 }, memory: { textures: 7, geometries: 40 } };
    expect(sampleRenderStats(info, 30, 1000)).toEqual({ drawCalls: 29, triangles: 22302, textures: 7, geometries: 40, fps: 30 });
    expect(sampleRenderStats(info, 59, 1003).fps).toBeCloseTo(58.8, 1);
    expect(sampleRenderStats(info, 0, 0).fps).toBe(0);
  });
});
