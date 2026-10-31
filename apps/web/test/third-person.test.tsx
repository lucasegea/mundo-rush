// @vitest-environment jsdom
// Open-world-3d M2 (T4, T5; D-820, PD-5): camera-relative look and movement (AC17-AC21), pure third person
// (AC22-AC24), continuous zoom up to the whole map (AC26) and the presets (AC27), with the real store and translators.
import {
  CAMERA_PRESET_IDS, CAMERA_PRESETS, KEY_LOOK_PX_PER_STEP, LOOK_DRAG_PX as CORE_LOOK_DRAG_PX, screenDirToWorld, SIM_DT, THIRD_PERSON,
  zoomDistanceAt as coreZoomDistanceAt, zoomTAt as coreZoomTAt, type DioramaLayout, type SemanticAction,
} from "@lg/core";
import { DEFAULT_LOOK, WORLD_LOOKS } from "@lg/art";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createDragLook, startInput, WORLD_SURFACE_ATTR } from "../src/services/input";
import { createActions } from "../src/state/actions";
import { bridge, LOOK_DRAG_PX } from "../src/state/bridge";
import { selectCameraView, selectWorldRender } from "../src/state/selectors";
import { createGameStore } from "../src/state/store";
import { CHIBI_HEAD_TOP, HEAD_RADIUS } from "../src/world/actors/chibiModel";
import { CAMERA_RIG_PRESETS } from "../src/world/camera/presets";
import { solveThirdPerson, type Obstacle } from "../src/world/camera/rig";
import { approach, boundsCenter, fitDistance, projectNdc, thirdPersonFov, THIRD_PERSON_VIEW, zoomDistanceAt, zoomPose, zoomTAt } from "../src/world/camera/zoom";
import { isDragClick, onGroundClick } from "../src/world/dioramas/Diorama";
import { LABEL_HIDE_T, labelEntries } from "../src/world/labels/labels";
import { fogFor } from "../src/world/sky/palette";
import { compiledUniverseClientContent } from "./helpers";

const FIELD: DioramaLayout = { id: "campo", bounds: { minX: -70, maxX: 70, minZ: -50, maxZ: 50 }, spawn: [0, 0, 0] };

/** A store with an open 140 × 100 m field loaded and the map being played. */
function mapStore() {
  const store = createGameStore();
  const actions = createActions(store);
  actions.dioramaLoaded(FIELD);
  store.setState((s) => ({ session: { ...s.session, phase: "world" } }));
  return { store, actions };
}

const steps = (actions: ReturnType<typeof createActions>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) actions.simulationStep();
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AC17 el reductor acota la inclinación y normaliza el yaw", () => {
  test("look {0,5, -4} y {2, 4}; arrastres largos topan en 6 y 55", () => {
    const { store, actions } = mapStore();
    const cam = () => store.getState().ui.camera;
    actions.dispatch({ type: "look", dx: 0.5, dy: -4 });
    expect(cam().yawDeg).toBeGreaterThanOrEqual(0);
    expect(cam().yawDeg).toBeLessThan(360);
    expect(cam().pitchDeg).toBeCloseTo(17 - 4 * THIRD_PERSON.pitchDegPerPx, 9);
    actions.dispatch({ type: "look", dx: 2, dy: 4 });
    expect(cam().yawDeg).toBeCloseTo(360 - 2.5 * THIRD_PERSON.yawDegPerPx, 9);
    expect(cam().pitchDeg).toBeCloseTo(17, 9);
    actions.dispatch({ type: "look", dx: 0, dy: 9999 });
    expect(cam().pitchDeg).toBe(55);
    actions.dispatch({ type: "look", dx: -99999, dy: -9999 });
    expect(cam().pitchDeg).toBe(6);
    expect(cam().yawDeg).toBeGreaterThanOrEqual(0);
    expect(cam().yawDeg).toBeLessThan(360);
  });
});

describe("AC18 W camina hacia donde mira la cámara (yaw vivo, no el del preset)", () => {
  test.each([0, 90, 180])("yaw %i", (yaw) => {
    const { store, actions } = mapStore();
    store.setState((s) => ({ ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg: yaw } } }));
    actions.dispatch({ type: "move", dir: { x: 0, y: 1 } });
    steps(actions, 1);
    const v = store.getState().player.velocity;
    const w = screenDirToWorld({ x: 0, y: 1 }, yaw);
    const len = Math.hypot(v.x, v.z);
    expect(Math.abs(v.x / len - w.x)).toBeLessThan(1e-6);
    expect(Math.abs(v.z / len - w.z)).toBeLessThan(1e-6);
  });
  test("W+D a 3,5 m/s; mirar con W apretada gira la marcha con la cámara", () => {
    const { store, actions } = mapStore();
    actions.dispatch({ type: "move", dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 } });
    steps(actions, 1);
    const v = store.getState().player.velocity;
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(3.5, 6);
    actions.dispatch({ type: "move", dir: { x: 0, y: 1 } });
    actions.dispatch({ type: "look", dx: -360, dy: 0 }); // 90° to the left
    steps(actions, 1);
    const turned = store.getState().player.velocity;
    const w = screenDirToWorld({ x: 0, y: 1 }, store.getState().ui.camera.yawDeg);
    expect(turned.x / Math.hypot(turned.x, turned.z)).toBeCloseTo(w.x, 6);
  });
});

describe("AC21 Shift corre a 5,5 m/s (por el store)", () => {
  test("10 s con run: 55 ± 3 m; sin run: 35 ± 2 m", () => {
    // Yaw 90: forward is -x, the long side of the field (70 m from the spawn).
    const yaw90 = (m: ReturnType<typeof mapStore>) => m.store.setState((s) => ({ ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg: 90 } } }));
    const run = mapStore();
    yaw90(run);
    run.actions.dispatch({ type: "run", on: true });
    run.actions.dispatch({ type: "move", dir: { x: 0, y: 1 } });
    steps(run.actions, 10);
    const p = run.store.getState().player.position ?? { x: NaN, z: NaN };
    expect(Math.abs(Math.hypot(p.x, p.z) - 55)).toBeLessThanOrEqual(3);
    const walk = mapStore();
    yaw90(walk);
    walk.actions.dispatch({ type: "move", dir: { x: 0, y: 1 } });
    steps(walk.actions, 10);
    const q = walk.store.getState().player.position ?? { x: NaN, z: NaN };
    expect(Math.abs(Math.hypot(q.x, q.z) - 35)).toBeLessThanOrEqual(2);
  });
});

describe("AC19 services/input: Q, R, arrastre, clic corto, V y las teclas de zoom del teclado es-AR", () => {
  const setup = () => {
    const surface = document.createElement("div");
    surface.setAttribute(WORLD_SURFACE_ATTR, "");
    const canvas = document.createElement("canvas");
    surface.append(canvas);
    document.body.append(surface);
    const got: SemanticAction[] = [];
    const ticks: (() => void)[] = [];
    const stop = startInput({
      target: document, dispatch: (a) => got.push(a), isActive: () => true,
      timers: { every: (_ms, fn) => { ticks.push(fn); return () => ticks.splice(ticks.indexOf(fn), 1); } },
    });
    const key = (type: "keydown" | "keyup", code: string, k?: string) =>
      canvas.dispatchEvent(new KeyboardEvent(type, { code, ...(k === undefined ? {} : { key: k }), bubbles: true, cancelable: true }));
    const ptr = (type: string, x: number, y: number) => canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
    return { got, ticks, key, ptr, done: () => { stop(); surface.remove(); } };
  };

  test("Q emite look a la izquierda y R a la derecha; mantenidas, el reloj sigue emitiendo; al soltar, para", () => {
    const io = setup();
    io.key("keydown", "KeyQ", "q");
    expect(io.got).toEqual([{ type: "look", dx: -KEY_LOOK_PX_PER_STEP, dy: 0 }]);
    expect(io.ticks.length).toBe(1);
    io.ticks[0]?.();
    expect(io.got.length).toBe(2);
    io.key("keyup", "KeyQ", "q");
    expect(io.ticks.length).toBe(0);
    io.got.length = 0;
    io.key("keydown", "KeyR", "r");
    expect(io.got).toEqual([{ type: "look", dx: KEY_LOOK_PX_PER_STEP, dy: 0 }]);
    io.key("keyup", "KeyR", "r");
    io.done();
  });

  test("un arrastre de 40 px emite look con ese dx; uno de 2 px no emite look (el clic lo resuelve el suelo, AC20)", () => {
    const io = setup();
    io.ptr("pointerdown", 100, 100);
    io.ptr("pointermove", 140, 100);
    io.ptr("pointerup", 140, 100);
    expect(io.got).toEqual([{ type: "look", dx: 40, dy: 0 }]);
    io.got.length = 0;
    io.ptr("pointerdown", 100, 100);
    io.ptr("pointermove", 102, 100);
    io.ptr("pointerup", 102, 100);
    expect(io.got.filter((a) => a.type === "look")).toEqual([]);
    io.done();
  });

  test("createDragLook: hasta el umbral es clic; pasado, mira con deltas desde el movimiento anterior", () => {
    const d = createDragLook();
    d.down(0, 0);
    expect(d.move(LOOK_DRAG_PX, 0)).toBeNull();
    expect(d.move(LOOK_DRAG_PX + 1, 0)).toEqual({ type: "look", dx: LOOK_DRAG_PX + 1, dy: 0 });
    expect(d.move(LOOK_DRAG_PX + 1, 5)).toEqual({ type: "look", dx: 0, dy: 5 });
    expect(d.up()).toBe("drag");
    d.down(0, 0);
    d.move(2, 0);
    expect(d.up()).toBe("tap");
    expect(d.up()).toBeNull();
  });

  test("V por code (KeyV) y por carácter (Semicolon con key v) emiten toggleOverview; + y − del teclado es-AR hacen zoom", () => {
    const io = setup();
    io.key("keydown", "KeyV", "v");
    io.key("keydown", "Semicolon", "v");
    io.key("keydown", "BracketRight", "+");
    io.key("keydown", "Slash", "-");
    expect(io.got).toEqual([{ type: "toggleOverview" }, { type: "toggleOverview" }, { type: "zoomIn" }, { type: "zoomOut" }]);
    io.done();
  });

  test("Shift emite run on y off", () => {
    const io = setup();
    io.key("keydown", "ShiftLeft", "Shift");
    io.key("keydown", "ShiftLeft", "Shift");
    io.key("keyup", "ShiftLeft", "Shift");
    expect(io.got).toEqual([{ type: "run", on: true }, { type: "run", on: false }]);
    io.done();
  });
});

describe("AC20 el clic del suelo descarta los arrastres de mirada", () => {
  test("delta 40 no despacha nada; delta 2 despacha moveTo por bridge.pointer; el umbral es el único LOOK_DRAG_PX", () => {
    const spy = vi.spyOn(bridge, "pointer").mockImplementation(() => undefined);
    onGroundClick({ delta: 40, point: { x: 3, z: 4 }, nativeEvent: { button: 0 } });
    expect(spy).not.toHaveBeenCalled();
    onGroundClick({ delta: 2, point: { x: 3, z: 4 }, nativeEvent: { button: 0 } });
    expect(spy).toHaveBeenCalledWith({ kind: "ground", x: 3, z: 4 }, 0);
    expect(LOOK_DRAG_PX).toBe(CORE_LOOK_DRAG_PX);
    expect(isDragClick(LOOK_DRAG_PX)).toBe(false);
    expect(isDragClick(LOOK_DRAG_PX + 0.5)).toBe(true);
  });
  test("ningún archivo de world/ escribe el umbral como número", () => {
    const src = import.meta.glob("../src/world/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const literal = Object.entries(src).filter(([, text]) => /delta\s*[<>]=?\s*\d/.test(text)).map(([p]) => p);
    expect(literal).toEqual([]);
  });
});

/** The center of the character's head above the ground (chibiModel). */
const HEAD_Y = CHIBI_HEAD_TOP - HEAD_RADIUS;

describe("AC22 solveThirdPerson: detrás del rumbo, a 6 sin 17° sobre el pivote, la cabeza abajo del centro", () => {
  test.each([16 / 9, 9 / 16])("aspecto %f", (aspect) => {
    const ground = 0;
    const target: [number, number, number] = [10, ground + THIRD_PERSON_VIEW.targetHeight, -4];
    const fit = fitDistance(0, aspect, FIELD.bounds);
    const t = zoomTAt(THIRD_PERSON_VIEW.defaultDistance, fit);
    const pose = zoomPose(t, fit, THIRD_PERSON.defaultPitchDeg);
    const shot = solveThirdPerson({ target, yawDeg: 0, pitchDeg: 17, lookPitchDeg: pose.lookPitchDeg * (17 / pose.pitchDeg), distance: 6 });
    // yaw 0: forward is -z, so the camera ends up on the player's +z side.
    expect(shot.position[2]).toBeGreaterThan(target[2]);
    expect(Math.abs(shot.position[0] - target[0])).toBeLessThan(1e-9);
    expect(shot.position[1] - target[1]).toBeCloseTo(6 * Math.sin((17 * Math.PI) / 180), 2);
    expect(Math.abs(shot.position[1] - (6 * Math.sin((17 * Math.PI) / 180) + target[1]))).toBeLessThanOrEqual(0.01);
    const head = projectNdc(shot.position, shot.lookAt, thirdPersonFov(aspect), aspect, [target[0], ground + HEAD_Y, target[2]]);
    expect(head).not.toBeNull();
    const y = head?.[1] ?? 99;
    expect(y).toBeGreaterThanOrEqual(-0.45);
    expect(y).toBeLessThanOrEqual(-0.05);
    expect(Math.abs(head?.[0] ?? 99)).toBeLessThan(1e-6);
  });
});

/** Does any point of the segment cross the obstacle? (fine sampling, 1 cm) */
const segmentHits = (a: readonly number[], b: readonly number[], o: Obstacle): boolean => {
  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000;
    const x = (a[0] as number) + ((b[0] as number) - (a[0] as number)) * t;
    const y = (a[1] as number) + ((b[1] as number) - (a[1] as number)) * t;
    const z = (a[2] as number) + ((b[2] as number) - (a[2] as number)) * t;
    const inside = o.kind === "rect" ? x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ : Math.hypot(x - o.x, z - o.z) < o.r;
    if (inside && y < o.height) return true;
  }
  return false;
};

describe("AC23 un obstáculo entre la cámara y el jugador acerca la cámara (nunca a menos de 1,5 m)", () => {
  const target: [number, number, number] = [0, 1.4, 0];
  test("un muro de 4 m entre los dos", () => {
    const wall: Obstacle = { kind: "rect", minX: -3, maxX: 3, minZ: 3, maxZ: 3.6, height: 4 };
    const free = solveThirdPerson({ target, yawDeg: 0, pitchDeg: 17, distance: 6 });
    expect(free.distanceUsed).toBe(6);
    expect(segmentHits(free.position, target, wall)).toBe(true);
    const shot = solveThirdPerson({ target, yawDeg: 0, pitchDeg: 17, distance: 6, obstacles: [wall] });
    expect(shot.distanceUsed).toBeLessThan(6);
    expect(shot.distanceUsed).toBeGreaterThanOrEqual(1.5);
    expect(segmentHits(shot.position, target, wall)).toBe(false);
  });
  test("un obstáculo pegado al jugador: se queda en 1,5 m", () => {
    const post: Obstacle = { kind: "circle", x: 0, z: 0.9, r: 0.5, height: 4 };
    expect(solveThirdPerson({ target, yawDeg: 0, pitchDeg: 17, distance: 6, obstacles: [post] }).distanceUsed).toBe(1.5);
  });
});

describe("AC24 la cámara nunca queda bajo el terreno", () => {
  test("una loma que sube 3 m detrás del jugador", () => {
    const heightAt = (_x: number, z: number): number => (z > 1 ? Math.min(3, (z - 1) * 1.5) : 0);
    const shot = solveThirdPerson({ target: [0, 1.4, 0], yawDeg: 0, pitchDeg: 17, distance: 6, heightAt });
    expect(shot.position[1]).toBeGreaterThanOrEqual(heightAt(shot.position[0], shot.position[2]) + 0.6 - 1e-9);
    const flat = solveThirdPerson({ target: [0, 1.4, 0], yawDeg: 0, pitchDeg: 17, distance: 6, heightAt: () => 0 });
    expect(flat.distanceUsed).toBe(6);
  });
});

describe("AC26 fitDistance y zoomPose (140 × 100 m)", () => {
  const corners = [[-70, 0, -50], [70, 0, -50], [70, 0, 50], [-70, 0, 50]] as const;
  test.each([[0, 16 / 9], [45, 16 / 9], [90, 16 / 9], [0, 9 / 16], [45, 9 / 16], [90, 9 / 16]])("yaw %i, aspecto %f", (yaw, aspect) => {
    const fit = fitDistance(yaw, aspect, FIELD.bounds);
    const full = zoomPose(1, fit, THIRD_PERSON.defaultPitchDeg);
    expect(full.distance).toBeCloseTo(fit, 6);
    expect(full.pitchDeg).toBe(82);
    expect(full.pivotBlend).toBe(1);
    const shot = solveThirdPerson({ target: boundsCenter(FIELD.bounds), yawDeg: yaw, pitchDeg: full.pitchDeg, lookPitchDeg: full.lookPitchDeg, distance: full.distance });
    const ndc = corners.map((c) => projectNdc(shot.position, shot.lookAt, thirdPersonFov(aspect), aspect, [...c]));
    for (const p of ndc) {
      expect(p).not.toBeNull();
      expect(Math.abs(p?.[0] ?? 9)).toBeLessThanOrEqual(1);
      expect(Math.abs(p?.[1] ?? 9)).toBeLessThanOrEqual(1);
    }
    expect(ndc.some((p) => Math.max(Math.abs(p?.[0] ?? 0), Math.abs(p?.[1] ?? 0)) >= 0.9)).toBe(true);
    // t = 0: 2.5 m; monotonic; equal steps of t give equal ratios (1 %); tilt monotonic from the player's to 82.
    expect(zoomPose(0, fit, 17).distance).toBeCloseTo(2.5, 9);
    expect(zoomPose(0, fit, 17).pitchDeg).toBe(17);
    let prev = zoomPose(0, fit, 17);
    const ratios: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const p = zoomPose(i / 20, fit, 17);
      expect(p.distance).toBeGreaterThan(prev.distance);
      expect(p.pitchDeg).toBeGreaterThanOrEqual(prev.pitchDeg);
      expect(fogFor(DEFAULT_LOOK.fog.range, 1, p.t).far).toBeLessThanOrEqual(p.far);
      ratios.push(p.distance / prev.distance);
      prev = p;
    }
    for (const r of ratios) expect(Math.abs(r / (ratios[0] as number) - 1)).toBeLessThanOrEqual(0.01);
  });
  // Recorded change (open-world-3d T7b, D-839): the fog left the pose (its range belongs to the look); the rule is the same
  // and now holds for every catalog look and every tier fog scale (0.85 / 1 / 1.15).
  test("la niebla nunca pasa el plano lejano, en ningún t, tier ni look", () => {
    for (const look of Object.values(WORLD_LOOKS)) for (const fogScale of [0.85, 1, 1.15]) for (let i = 0; i <= 100; i++) {
      const p = zoomPose(i / 100, 150, 30);
      const fog = fogFor(look.fog.range, fogScale, p.t);
      expect(fog.far, `${look.id} ${fogScale} ${p.t}`).toBeLessThanOrEqual(p.far);
      expect(fog.near).toBeLessThan(fog.far);
    }
  });
  test("con «reducir movimiento» un zoomOut llega a su objetivo en el mismo cuadro; si no, se acerca suave", () => {
    const { store, actions } = mapStore();
    const before = store.getState().ui.camera.zoomDistance;
    actions.zoomOut();
    const target = Math.log(store.getState().ui.camera.zoomDistance);
    expect(approach(Math.log(before), target, 1 / 60, 9, true)).toBe(target);
    const eased = approach(Math.log(before), target, 1 / 60, 9, false);
    expect(eased).toBeGreaterThan(Math.log(before));
    expect(eased).toBeLessThan(target);
  });
  test("la regla de t de world/camera es la del núcleo (mismos números)", () => {
    expect(THIRD_PERSON_VIEW.minDistance).toBe(THIRD_PERSON.minDistance);
    expect(THIRD_PERSON_VIEW.defaultDistance).toBe(THIRD_PERSON.defaultDistance);
    expect(THIRD_PERSON_VIEW.overviewPitchDeg).toBe(THIRD_PERSON.overviewPitchDeg);
    for (const fit of [30, 126.4, 400]) for (const t of [0, 0.13, 0.5, 0.91, 1]) {
      expect(zoomDistanceAt(t, fit)).toBeCloseTo(coreZoomDistanceAt(t, fit), 9);
      expect(zoomTAt(zoomDistanceAt(t, fit), fit)).toBeCloseTo(coreZoomTAt(coreZoomDistanceAt(t, fit), fit), 9);
    }
  });
  test("pasado LABEL_HIDE_T solo queda la etiqueta resaltada", () => {
    const actors = [{ id: "A", name: "A" }, { id: "B", name: "B" }];
    expect(labelEntries(actors, "A", null, 0, 0).length).toBe(2);
    expect(labelEntries(actors, "A", null, 0, LABEL_HIDE_T).map((e) => e.id)).toEqual(["A"]);
  });
});

describe("V: el mapa entero y de vuelta (PD-5)", () => {
  test("V va a t = 1 recordando la distancia; la segunda V la restaura; el fit nuevo arrastra al mapa entero", () => {
    const { store, actions } = mapStore();
    const cam = () => store.getState().ui.camera;
    actions.cameraFitted(140);
    actions.zoomIn();
    const before = cam().zoomDistance;
    actions.dispatch({ type: "toggleOverview" });
    expect(cam().overview).toBe(true);
    expect(cam().zoomDistance).toBe(140);
    actions.cameraFitted(160);
    expect(cam().zoomDistance).toBe(160);
    actions.dispatch({ type: "toggleOverview" });
    expect(cam().overview).toBe(false);
    expect(Math.abs(cam().zoomDistance / before - 1)).toBeLessThanOrEqual(0.02);
    // Outside the whole map, a smaller fit bounds the requested distance (zooming out too far does not accumulate invisible steps).
    actions.zoomTo(0.99);
    actions.cameraFitted(50);
    expect(cam().zoomDistance).toBe(50);
    actions.zoomTo(0);
    expect(cam().zoomDistance).toBeCloseTo(2.5, 9);
  });
});

describe("AC27 presets: sin ajuste o retirado → thirdPerson en el t por defecto; perspective3D → thirdPerson en t = 1", () => {
  test.each([[null, false], [{ camera: "topdownOrtho" }, false], [{ camera: "perspective3D" }, true]] as const)("ajuste %j", (patch, full) => {
    const store = createGameStore();
    const actions = createActions(store);
    actions.restoreSettings(patch as never);
    actions.dioramaLoaded(FIELD);
    store.setState((s) => ({ session: { ...s.session, phase: "world" } }));
    expect(selectWorldRender(store.getState()).preset).toBe("thirdPerson");
    const v = selectCameraView(store.getState());
    expect(v.overview).toBe(full);
    if (!full) expect(v.zoomDistance).toBe(THIRD_PERSON.defaultDistance);
    expect(v.pitchDeg).toBe(THIRD_PERSON.defaultPitchDeg);
  });
  test("las claves de CAMERA_RIG_PRESETS son exactamente CAMERA_PRESET_IDS; thirdPerson es el ajuste por defecto", () => {
    expect(Object.keys(CAMERA_RIG_PRESETS).sort()).toEqual([...CAMERA_PRESET_IDS].sort());
    expect(CAMERA_RIG_PRESETS.thirdPerson).toBe("implemented");
    expect([...CAMERA_PRESETS]).toEqual(["thirdPerson", "perspective3D"]);
  });
});

describe("AC25 recentrado por el store (yaw 90° fuera de la marcha, 3 s)", () => {
  /** Simulates 3 s with the given key and the camera 90° off the heading; returns the yaw of each step. */
  const run = (dir: { x: number; y: number }, reduceMotion: boolean) => {
    const { store, actions } = mapStore();
    actions.cameraFitted(140);
    // The setting goes straight to the store: setReduceMotion goes through changeSettings, which without bootCompleted (suggested tier)
    // drops the phase to dialog-only and the map stops simulating (the test was left empty).
    if (reduceMotion) store.setState((s) => ({ settings: { ...s.settings, accessibility: { ...s.settings.accessibility, reduceMotion: true } } }));
    actions.dispatch({ type: "move", dir });
    // W points the heading at yaw 0; the camera is shifted 90° without «look» (it does not reset the look clock).
    // With D the heading is already 90° off the camera's yaw 0.
    const yaw0 = dir.x === 0 ? 90 : 0;
    store.setState((s) => ({ ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg: yaw0, sinceLookS: 0 } } }));
    const from = store.getState().player.position ?? { x: Number.NaN, z: Number.NaN };
    const trace: { t: number; yaw: number }[] = [];
    for (let i = 1; i <= Math.round(3 / SIM_DT); i++) {
      actions.simulationStep();
      trace.push({ t: i * SIM_DT, yaw: store.getState().ui.camera.yawDeg });
    }
    // Without walking the test proves nothing: in 3 s the player must have advanced more than 5 m.
    const at = store.getState().player.position ?? from;
    expect(Math.hypot(at.x - from.x, at.z - from.z)).toBeGreaterThan(5);
    expect(store.getState().settings.accessibility.reduceMotion).toBe(reduceMotion);
    return { trace, yaw0 };
  };
  const delta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
  test("solo W: llega a 5° de la marcha, a lo sumo 90°/s, nunca antes de 1,5 s", () => {
    const { trace, yaw0 } = run({ x: 0, y: 1 }, false);
    const last = trace[trace.length - 1]?.yaw ?? yaw0;
    expect(Math.abs(delta(last, 0))).toBeLessThanOrEqual(5);
    let prev = yaw0;
    for (const p of trace) {
      expect(Math.abs(delta(prev, p.yaw))).toBeLessThanOrEqual(90 * SIM_DT + 1e-9);
      if (p.t < 1.5 - 1e-9) expect(p.yaw).toBe(yaw0);
      prev = p.yaw;
    }
  });
  test("solo D (de costado): el yaw no cambia en 3 s", () => {
    const { trace, yaw0 } = run({ x: 1, y: 0 }, false);
    expect(trace.every((p) => p.yaw === yaw0)).toBe(true);
  });
  test("W con «reducir movimiento»: el yaw no cambia en 3 s", () => {
    const { trace, yaw0 } = run({ x: 0, y: 1 }, true);
    expect(trace.every((p) => p.yaw === yaw0)).toBe(true);
  });
});

describe("AC29 el clic del muelle de U-GALEANO llega (la caminata se quedaba a 3 m)", () => {
  // QA's GPU walk, M2 iteration 0: 2 out of 5 times the store's destination was (15.35; 11.50) and the player ended
  // at (12.29; 11.28). Since this fix the path has an intermediate point at (12.75; 11.75) that the step crossed
  // back and forth without getting within 0.05 m (controller.ts). The same click, from the same zone, through the real store.
  test.each([[8.04, 8.25], [7.86, 8.5], [7.95, 8.4]])("moveTo(15,35; 11,50) desde (%f, %f)", (x, z) => {
    const layouts = compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[];
    const muelle = layouts.find((d) => d.id === "muelle");
    if (!muelle) throw new Error("U-GALEANO sin el diorama muelle");
    const store = createGameStore();
    const actions = createActions(store);
    actions.dioramaLoaded(muelle);
    store.setState((s) => ({ session: { ...s.session, phase: "world" }, player: { ...s.player, position: { x, z } } }));
    actions.dispatch({ type: "moveTo", x: 15.35, z: 11.5 });
    expect(store.getState().player.intent.kind).toBe("path");
    steps(actions, 5);
    const p = store.getState().player;
    expect(p.intent.kind).toBe("idle");
    const at = p.position ?? { x: Number.NaN, z: Number.NaN };
    expect(Math.hypot(at.x - 15.35, at.z - 11.5)).toBeLessThan(0.5);
  });
});

describe("AC29 (parte pura) la charla no toca el yaw ni el zoom del store", () => {
  test("abrir y cerrar una escena deja yaw y distancia iguales", () => {
    const { store, actions } = mapStore();
    actions.dispatch({ type: "look", dx: 100, dy: 10 });
    actions.zoomOut();
    const before = { ...store.getState().ui.camera };
    store.setState((s) => ({ ui: { ...s.ui, panels: [{ kind: "scene", npcId: "X" }] } }));
    steps(actions, 1);
    store.setState((s) => ({ ui: { ...s.ui, panels: [] } }));
    expect(store.getState().ui.camera.yawDeg).toBe(before.yawDeg);
    expect(store.getState().ui.camera.zoomDistance).toBe(before.zoomDistance);
  });
});
