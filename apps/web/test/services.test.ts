// Servicios de F1.3: catálogo de solo-diálogo (contenido compilado), copia local de ajustes, arranque.
import { describe, expect, test, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@lg/core";
import {
  ContentShapeError, loadDialogOnlyCatalog, parseDialogOnlyCatalog, type CatalogSink,
} from "../src/services/content";
import { loadSavedSettings, persistSettings, SETTINGS_KEY } from "../src/services/persistence";
import { gameStore } from "../src/state/store";
import { bootApp, compiledClientContent, fetchFromContent, memoryPlatform, resetStore } from "./helpers";

const sink = (): CatalogSink & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, contentLoading: () => calls.push("loading"), contentLoaded: () => calls.push("loaded"), contentFailed: () => calls.push("failed") };
};

describe("catálogo de solo-diálogo sobre la salida real de F1.2", () => {
  const content = compiledClientContent();

  test("lugares de la Región 1 y los NPCs con ficha, cada uno en un lugar existente", () => {
    const c = parseDialogOnlyCatalog(content["lugares.json"], content["npcs.json"]);
    expect(c.regionName).toBe("Región 1: Los Campos y El Cruce");
    expect(c.places.length).toBeGreaterThan(10);
    expect(c.places.find((p) => p.id === "campos.parada")).toMatchObject({ name: "Parada del colectivo", en: "Welcome to Kestrel Valley", diorama: "muelle" });
    expect(c.npcs.map((n) => n.id).sort()).toEqual(["NPC-HARLAN", "NPC-INES", "NPC-KOFI", "NPC-MAYA", "NPC-NELL", "NPC-OLLIE"]);
    const ids = new Set(c.places.map((p) => p.id));
    for (const n of c.npcs) expect(ids.has(n.placeId), n.id).toBe(true);
  });

  test("la salida del cliente no trae prompts ni campos del servidor", () => {
    expect(Object.keys(content)).not.toContain("prompts.json");
    expect(JSON.stringify(content["npcs.json"])).not.toMatch(/persona|prompt/i);
  });

  test("forma inesperada → ContentShapeError (sin datos inventados)", () => {
    expect(() => parseDialogOnlyCatalog({}, [])).toThrow(ContentShapeError);
    expect(() => parseDialogOnlyCatalog({ regiones: [], lugares: [] }, [])).toThrow(/no hay regiones/);
    expect(() => parseDialogOnlyCatalog(content["lugares.json"], {})).toThrow(/lista/);
    expect(() => parseDialogOnlyCatalog({ regiones: [{ id: "R1", nombre: { "es-AR": "R" } }], lugares: [{ id: "x", region: "R1" }] }, [])).toThrow(/nombre/);
  });

  test("loadDialogOnlyCatalog: carga, o falla claro con aviso en consola", async () => {
    const ok = sink();
    expect(await loadDialogOnlyCatalog(ok, "/", fetchFromContent(content))).toBe(true);
    expect(ok.calls).toEqual(["loading", "loaded"]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = sink();
    expect(await loadDialogOnlyCatalog(bad, "/", fetchFromContent({}))).toBe(false);
    expect(bad.calls).toEqual(["loading", "failed"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("pide los archivos bajo <base>content/", async () => {
    const urls: string[] = [];
    await loadDialogOnlyCatalog(sink(), "/juego/", (u) => { urls.push(u); return fetchFromContent(content)(u); });
    expect(urls.sort()).toEqual(["/juego/content/lugares.json", "/juego/content/npcs.json"]);
  });
});

describe("copia local de ajustes (Platform, R15)", () => {
  test("sin guardado, roto o con almacenamiento caído → null", async () => {
    expect(await loadSavedSettings(memoryPlatform())).toBeNull();
    expect(await loadSavedSettings(memoryPlatform({ [SETTINGS_KEY]: "{no json" }))).toBeNull();
    expect(await loadSavedSettings(memoryPlatform({ [SETTINGS_KEY]: "42" }))).toBeNull();
    const broken = { storage: { get: () => Promise.reject(new Error("x")), set: () => Promise.resolve(), remove: () => Promise.resolve() } };
    expect(await loadSavedSettings(broken)).toBeNull();
  });

  test("si guardar falla, avisa una sola vez y deja de intentar", async () => {
    const set = vi.fn(() => Promise.reject(new Error("quota")));
    const platform = { storage: { get: () => Promise.resolve(null), set, remove: () => Promise.resolve() } };
    let listener: (s: typeof DEFAULT_SETTINGS) => void = () => {};
    const onUnavailable = vi.fn();
    persistSettings({ getSettings: () => DEFAULT_SETTINGS, subscribeSettings: (l) => { listener = l; return () => {}; } }, platform, onUnavailable);
    listener(DEFAULT_SETTINGS);
    await Promise.resolve(); await Promise.resolve();
    listener(DEFAULT_SETTINGS);
    await Promise.resolve();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe("boot/ (raíz de composición)", () => {
  test("restaura ajustes guardados (saneados) y la sugerencia de tier sale de la detección", async () => {
    resetStore();
    const saved = JSON.stringify({ accessibility: { textScale: 200, highContrast: true }, graphics: { tier: "high", suggestedTier: "xr" } });
    const stop = await bootApp({ webgl2: true, platform: memoryPlatform({ [SETTINGS_KEY]: saved }) });
    const s = gameStore.getState().settings;
    expect(s.accessibility.textScale).toBe(200);
    expect(s.accessibility.highContrast).toBe(true);
    expect(s.graphics).toEqual({ tier: "high", suggestedTier: "medium" });
    expect(gameStore.getState().world.catalog).toBe("ready");
    stop();
  });

  test("sin ajustes guardados, prefers-reduced-motion fija el default de reducir movimiento", async () => {
    resetStore();
    const stop = await bootApp({ webgl2: false, prefersReducedMotion: true });
    expect(gameStore.getState().settings.accessibility.reduceMotion).toBe(true);
    expect(gameStore.getState().session.phase).toBe("dialogOnly");
    stop();
  });
});
