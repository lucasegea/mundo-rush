// F2: diorama listo para jugar, acciones semánticas (R10), pasos de zoom (D-197) y presets de cámara (R11).
import { describe, expect, test } from "vitest";
import {
  CAMERA_PRESET_IDS, DEFAULT_ZOOM_STEP, dirFromHeld, downgradeTier, isWalkable, parseTileRows, pointerAction,
  prepareDiorama, presetAngles, screenDirToWorld, SEMANTIC_ACTIONS, stepZoom, wheelAction, ZOOM_STEPS,
  clampZoomStep, WHEEL_NOTCH_PX, wheelZoom, zoomDistance, ZOOM_DISTANCES,
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
  test("rueda acumulada (D-208): una muesca de mouse es un paso; un trackpad necesita sumar una muesca", () => {
    expect(wheelZoom(0, 100)).toEqual({ acc: 0, action: { type: "zoomOut" } });
    expect(wheelZoom(0, -120)).toEqual({ acc: 0, action: { type: "zoomIn" } });
    // Trackpad: eventos chicos se suman hasta WHEEL_NOTCH_PX y dan UN paso.
    let acc = 0;
    const actions: string[] = [];
    for (let i = 0; i < 24; i++) {
      const r = wheelZoom(acc, 4);
      acc = r.acc;
      if (r.action) actions.push(r.action.type);
    }
    expect(actions).toEqual(Array(Math.floor((24 * 4) / WHEEL_NOTCH_PX)).fill("zoomOut"));
    // Cambio de sentido: lo acumulado se descarta.
    expect(wheelZoom(40, -10)).toEqual({ acc: -10, action: null });
    // En líneas (Firefox) cada evento es una muesca.
    expect(wheelZoom(0, 3, 1)).toEqual({ acc: 0, action: { type: "zoomOut" } });
    expect(wheelZoom(7, 0)).toEqual({ acc: 7, action: null });
    expect(wheelZoom(7, Number.NaN)).toEqual({ acc: 7, action: null });
  });
  test("teclas mantenidas → dirección normalizada; opuestas se anulan", () => {
    const d = (...h: HeldDirection[]) => dirFromHeld(new Set(h));
    expect(d("up")).toEqual({ x: 0, y: 1 });
    expect(d("up", "down")).toEqual({ x: 0, y: 0 });
    expect(d("up", "right").x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(d()).toEqual({ x: 0, y: 0 });
  });
});

describe("cámara: presets (R11) y zoom (D-197, D-208)", () => {
  test("los 5 presets de R11; ángulos de D-053/D-154", () => {
    expect([...CAMERA_PRESET_IDS]).toEqual(["topdownOrtho", "isoOrtho", "dialogueFrame", "perspective3D", "xrTabletop"]);
    const top = presetAngles("topdownOrtho");
    expect(top.yawDeg).toBe(0);
    expect(top.pitchDeg).toBeGreaterThanOrEqual(55);
    expect(top.pitchDeg).toBeLessThanOrEqual(60);
    expect(presetAngles("isoOrtho").yawDeg).toBe(45);
  });
  test("escalera de D-208: de 160 a 22 m, el inicio en 30 m, la cantidad sale del arreglo", () => {
    expect([...ZOOM_DISTANCES]).toEqual([160, 120, 90, 65, 48, 38, 30, 22]);
    expect(ZOOM_STEPS).toBe(ZOOM_DISTANCES.length);
    expect(zoomDistance(DEFAULT_ZOOM_STEP)).toBe(30);
    expect(zoomDistance(ZOOM_STEPS - 1)).toBe(22);
    expect(zoomDistance(0)).toBeGreaterThanOrEqual(150);
    // Del más lejos al más cerca, siempre baja, y cada paso es parecido (entre 1,2x y 1,45x el siguiente).
    for (let i = 1; i < ZOOM_STEPS; i++) {
      const ratio = zoomDistance(i - 1) / zoomDistance(i);
      expect(ratio).toBeGreaterThan(1.2);
      expect(ratio).toBeLessThan(1.45);
    }
  });
  test("los botones, las teclas y la rueda recorren toda la escalera de a un paso, con tope en los dos extremos", () => {
    let s = DEFAULT_ZOOM_STEP;
    const seen = [s];
    for (let i = 0; i < ZOOM_STEPS + 3; i++) seen.push((s = stepZoom(s, -1)));
    expect(s).toBe(0);
    for (let i = 0; i < ZOOM_STEPS + 3; i++) seen.push((s = stepZoom(s, 1)));
    expect(s).toBe(ZOOM_STEPS - 1);
    for (let i = 1; i < seen.length; i++) expect(Math.abs((seen[i] as number) - (seen[i - 1] as number))).toBeLessThanOrEqual(1);
    expect(new Set(seen).size).toBe(ZOOM_STEPS);
  });
  test("un paso fuera de rango o no entero cae dentro de la escalera", () => {
    expect(clampZoomStep(-4)).toBe(0);
    expect(clampZoomStep(99)).toBe(ZOOM_STEPS - 1);
    expect(clampZoomStep(2.4)).toBe(2);
    expect(clampZoomStep(Number.NaN)).toBe(DEFAULT_ZOOM_STEP);
    expect(stepZoom(99, -1)).toBe(ZOOM_STEPS - 2);
    expect(zoomDistance(-1)).toBe(160);
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
