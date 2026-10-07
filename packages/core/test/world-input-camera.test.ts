// F2: diorama listo para jugar, acciones semánticas (R10), pasos de zoom (D-197) y presets de cámara (R11).
import { describe, expect, test } from "vitest";
import {
  CAMERA_PRESET_IDS, DEFAULT_ZOOM_STEP, dirFromHeld, downgradeTier, isWalkable, parseTileRows, pointerAction,
  prepareDiorama, presetAngles, screenDirToWorld, SEMANTIC_ACTIONS, stepZoom, wheelAction, ZOOM_STEPS,
  type DioramaLayout, type HeldDirection,
} from "../src/index";

describe("diorama", () => {
  const layout: DioramaLayout = {
    id: "test",
    bounds: { minX: -4, maxX: 4, minZ: -2, maxZ: 2 },
    spawn: [-3, 0, 0],
    tiles: [{ capa: "suelo", origen: [-4, -2], filas: ["1 1 2 2 1 1 1 1", "1 0 0 1 1 1 1 1", "1 1 1 1 1 1 1 1", "3 3 3 3 3 3 3 3"] }],
    props: [{ asset: "codigo/caja", pos: [2, 0, 0], tam: [1, 1, 1] }, { asset: "kenney/arbol", pos: [0, 0, 1] }],
    npcs: [{ id: "NPC-NELL", spawn: [-1, 0, 0] }],
    interactuables: [{ id: "OBJ-CARTEL", pos: [3, 0, -1.5], radio: 1 }],
    no_caminable: [{ poligono: [[-4, 1], [-2, 1], [-2, 2], [-4, 2]] }],
  };

  test("capas de tiles, cajas, NPCs, interactuables y grilla", () => {
    const d = prepareDiorama(layout);
    expect(d.spawn).toEqual({ x: -3, z: 0 });
    expect(d.layers[0]).toMatchObject({ name: "suelo", originX: -4, originZ: -2, width: 8, height: 4 });
    expect(d.layers[0]?.tiles.slice(8, 11)).toEqual([1, 0, 0]);
    expect(d.boxes).toEqual([{ asset: "codigo/caja", x: 2, y: 0, z: 0, w: 1, h: 1, d: 1 }]); // sin `tam` no hay caja
    expect(d.interactables.map((i) => [i.id, i.kind, i.radius])).toEqual([["NPC-NELL", "npc", 1.5], ["OBJ-CARTEL", "object", 1]]);
    const g = d.grid;
    expect([g.cols, g.rows]).toEqual([16, 8]);
    // La caja (1,5..2,5 × -0,5..0,5) bloquea; el polígono también; el NPC ocupa su medio metro.
    expect(isWalkable(g, 11, 4)).toBe(false);
    expect(isWalkable(g, 0, 7)).toBe(false);
    expect(isWalkable(g, 6, 4)).toBe(false);
    expect(isWalkable(g, 2, 4)).toBe(true);
  });

  test("sin spawn, el centro de los límites", () => {
    expect(prepareDiorama({ id: "test", bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 2 } }).spawn).toEqual({ x: 2, z: 1 });
  });

  test("filas de tiles mal formadas fallan claro", () => {
    expect(() => parseTileRows("suelo", [0, 0], ["1 2", "1"])).toThrow(/fila 1: 1 tiles, se esperaban 2/);
    expect(() => parseTileRows("suelo", [0, 0], ["1 x"])).toThrow(/id de tile inválido "x"/);
    expect(() => parseTileRows("suelo", [0, 0], ["1 -2"])).toThrow(/inválido/);
  });
});

describe("acciones semánticas (R10)", () => {
  test("la lista del contrato (R10 + zoom de D-197)", () => {
    expect([...SEMANTIC_ACTIONS]).toEqual(["move", "moveTo", "interact", "talk", "cancel", "openNotebook", "zoomIn", "zoomOut"]);
  });
  test("puntero: suelo → moveTo, interactuable → interact; otros botones no hacen nada", () => {
    expect(pointerAction({ kind: "ground", x: 1.5, z: -2 })).toEqual({ type: "moveTo", x: 1.5, z: -2 });
    expect(pointerAction({ kind: "interactable", id: "NPC-NELL" })).toEqual({ type: "interact", target: "NPC-NELL" });
    expect(pointerAction({ kind: "ground", x: 0, z: 0 }, 2)).toBeNull();
  });
  test("rueda: adelante acerca, atrás aleja, cero nada", () => {
    expect(wheelAction(-120)).toEqual({ type: "zoomIn" });
    expect(wheelAction(53)).toEqual({ type: "zoomOut" });
    expect(wheelAction(0)).toBeNull();
    expect(wheelAction(Number.NaN)).toBeNull();
  });
  test("teclas mantenidas → dirección normalizada; opuestas se anulan", () => {
    const d = (...h: HeldDirection[]) => dirFromHeld(new Set(h));
    expect(d("up")).toEqual({ x: 0, y: 1 });
    expect(d("up", "down")).toEqual({ x: 0, y: 0 });
    expect(d("up", "right").x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(d()).toEqual({ x: 0, y: 0 });
  });
});

describe("cámara: presets (R11) y zoom (D-197)", () => {
  test("los 5 presets de R11; ángulos de D-053/D-154", () => {
    expect([...CAMERA_PRESET_IDS]).toEqual(["topdownOrtho", "isoOrtho", "dialogueFrame", "perspective3D", "xrTabletop"]);
    const top = presetAngles("topdownOrtho");
    expect(top.yawDeg).toBe(0);
    expect(top.pitchDeg).toBeGreaterThanOrEqual(55);
    expect(top.pitchDeg).toBeLessThanOrEqual(60);
    expect(presetAngles("isoOrtho").yawDeg).toBe(45);
  });
  test("3 pasos, con tope en los dos extremos", () => {
    expect(ZOOM_STEPS).toBe(3);
    expect(DEFAULT_ZOOM_STEP).toBe(1);
    expect(stepZoom(1, 1)).toBe(2);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(0);
    expect(stepZoom(0, -1)).toBe(0);
  });
  test("arriba en pantalla es -z con yaw 0; con yaw 45 rota", () => {
    expect(screenDirToWorld({ x: 0, y: 1 }, 0)).toEqual({ x: 0, z: -1 });
    expect(screenDirToWorld({ x: 1, y: 0 }, 0)).toEqual({ x: 1, z: 0 });
    const iso = screenDirToWorld({ x: 0, y: 1 }, 45);
    expect(iso.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(iso.z).toBeCloseTo(-Math.SQRT1_2, 9);
  });
});

describe("baja automática de tier (§2.7.2.2)", () => {
  test("un escalón, nunca por debajo de low ni a dialog-only", () => {
    expect(downgradeTier("high")).toBe("medium");
    expect(downgradeTier("medium")).toBe("low");
    expect(downgradeTier("low")).toBe("low");
    expect(downgradeTier("dialog-only")).toBe("dialog-only");
  });
});
