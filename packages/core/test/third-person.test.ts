// Open-world-3d T4/T5 (D-820, PD-5): look, run, recentering and continuous zoom in the core, pure.
import { describe, expect, test } from "vitest";
import {
  applyLook, clampPitch, DEFAULT_MOVEMENT, gridFromRows, headingYaw, IDLE, KEY_LOOK_PX_PER_STEP, LOOK_DRAG_PX, normalizeYaw, recenterYaw,
  RUN_MOVEMENT, screenDirToWorld, SIM_DT, stepBody, stepZoomDistance, THIRD_PERSON, yawDelta, zoomDistanceAt, zoomTAt,
  type Body, type MoveIntent,
} from "../src";

describe("AC17 mirar: inclinación acotada a [6, 55] y yaw normalizado a [0, 360)", () => {
  test("look {0,5, -4} y después {2, 4} desde el arranque", () => {
    let c = { yawDeg: 0, pitchDeg: THIRD_PERSON.defaultPitchDeg };
    c = applyLook(c.yawDeg, c.pitchDeg, 0.5, -4);
    expect(c.yawDeg).toBeGreaterThanOrEqual(0);
    expect(c.yawDeg).toBeLessThan(360);
    expect(c.yawDeg).toBeCloseTo(360 - 0.5 * THIRD_PERSON.yawDegPerPx, 9);
    expect(c.pitchDeg).toBeCloseTo(17 - 4 * THIRD_PERSON.pitchDegPerPx, 9);
    c = applyLook(c.yawDeg, c.pitchDeg, 2, 4);
    expect(c.yawDeg).toBeCloseTo(360 - 2.5 * THIRD_PERSON.yawDegPerPx, 9);
    expect(c.pitchDeg).toBeCloseTo(17, 9);
  });
  test("arrastres largos topan en 6 y 55; el yaw da vueltas sin salir de [0, 360)", () => {
    expect(applyLook(10, 17, 0, -10_000).pitchDeg).toBe(6);
    expect(applyLook(10, 17, 0, 10_000).pitchDeg).toBe(55);
    for (const dx of [-5000, -1440, -1, 0, 1, 1440, 5000, 123.4]) {
      const y = applyLook(0, 17, dx, 0).yawDeg;
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(360);
    }
    expect(normalizeYaw(-90)).toBe(270);
    expect(normalizeYaw(720)).toBe(0);
    expect(clampPitch(Number.NaN)).toBe(17);
  });
  test("Q gira a la izquierda (yaw sube) y R a la derecha, 95°/s a 30 Hz", () => {
    expect(applyLook(0, 17, -KEY_LOOK_PX_PER_STEP, 0).yawDeg).toBeCloseTo(95 / 30, 9);
    expect(applyLook(0, 17, KEY_LOOK_PX_PER_STEP, 0).yawDeg).toBeCloseTo(360 - 95 / 30, 9);
    // With yaw 90, forward is -x: turning left from looking at -z.
    expect(screenDirToWorld({ x: 0, y: 1 }, 90).x).toBeCloseTo(-1, 12);
    expect(LOOK_DRAG_PX).toBe(6);
  });
});

/** An open field of 200 × 200 m (0.5 m cells) to measure speeds. */
const field = () => gridFromRows(Array.from({ length: 400 }, () => ".".repeat(400)), 0.5, -100, -100);

function walk(intent: MoveIntent, seconds: number, cfg = DEFAULT_MOVEMENT): { body: Body; speed: number } {
  const g = field();
  let body: Body = { x: 0, z: 0, vx: 0, vz: 0 };
  let it = intent;
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) ({ body, intent: it } = stepBody(g, body, it, cfg));
  return { body, speed: Math.hypot(body.vx, body.vz) };
}

describe("AC18 movimiento relativo a la cámara", () => {
  test.each([0, 90, 180])("W con yaw %i: la velocidad apunta a screenDirToWorld({0, 1}, yaw)", (yaw) => {
    const w = screenDirToWorld({ x: 0, y: 1 }, yaw);
    const { body } = walk({ kind: "dir", x: w.x, z: w.z }, 1);
    const len = Math.hypot(body.vx, body.vz);
    expect(body.vx / len).toBeCloseTo(w.x, 6);
    expect(body.vz / len).toBeCloseTo(w.z, 6);
    expect(Math.abs(body.vx / len - w.x)).toBeLessThan(1e-6);
    expect(Math.abs(body.vz / len - w.z)).toBeLessThan(1e-6);
  });
  test("W+D camina a 3,5 m/s (la diagonal normalizada)", () => {
    const d = screenDirToWorld({ x: Math.SQRT1_2, y: Math.SQRT1_2 }, 30);
    expect(walk({ kind: "dir", x: d.x, z: d.z }, 2).speed).toBeCloseTo(3.5, 6);
  });
});

describe("AC21 correr con Shift", () => {
  test("10 s con Shift en llano: 55 ± 3 m; sin Shift: 35 ± 2 m", () => {
    const run = walk({ kind: "dir", x: 0, z: -1 }, 10, RUN_MOVEMENT).body;
    const plain = walk({ kind: "dir", x: 0, z: -1 }, 10).body;
    expect(Math.abs(Math.hypot(run.x, run.z) - 55)).toBeLessThanOrEqual(3);
    expect(Math.abs(Math.hypot(plain.x, plain.z) - 35)).toBeLessThanOrEqual(2);
    expect(RUN_MOVEMENT.speed).toBe(5.5);
    expect(walk(IDLE, 1).speed).toBe(0);
  });
});

describe("AC29 un camino nunca queda orbitando un punto intermedio", () => {
  // With 3.5 m/s at 30 Hz a step is 0.117 m; an intermediate point that sat 0.05-0.067 m before a step would be
  // crossed back and forth forever (arriveRadius 0.05). Sweep of distances, walking and running.
  test.each([["caminando", DEFAULT_MOVEMENT], ["corriendo", RUN_MOVEMENT]] as const)("%s: todo punto intermedio entre 0,3 y 1,3 m", (_, cfg) => {
    const g = field();
    const stalls: number[] = [];
    for (let k = 0; k <= 200; k++) {
      const x = 0.3 + k * 0.005;
      let body: Body = { x: 0, z: 0, vx: 0, vz: 0 };
      let intent: MoveIntent = { kind: "path", waypoints: [{ x, z: 0 }, { x, z: 3 }] };
      for (let i = 0; i < 150 && intent.kind === "path"; i++) ({ body, intent } = stepBody(g, body, intent, cfg));
      if (intent.kind !== "idle" || Math.hypot(body.x - x, body.z - 3) > 0.05) stalls.push(x);
    }
    expect(stalls).toEqual([]);
  });
});

describe("AC25 recentrado", () => {
  const simulate = (forward: boolean, reduceMotion: boolean) => {
    let yaw = 0;
    const heading = 90; // 90° away from the camera
    const trace: { t: number; yaw: number }[] = [];
    for (let i = 1; i <= Math.round(3 / SIM_DT); i++) {
      const t = i * SIM_DT;
      yaw = recenterYaw({ yawDeg: yaw, headingDeg: heading, sinceLookS: t, dt: SIM_DT, forward, reduceMotion });
      trace.push({ t, yaw });
    }
    return trace;
  };
  test("hacia adelante: llega a 5° de la marcha, nunca más de 90°/s, no antes de 1,5 s después de mirar", () => {
    const tr = simulate(true, false);
    expect(Math.abs(yawDelta(tr[tr.length - 1]?.yaw ?? 0, 90))).toBeLessThanOrEqual(5);
    let prev = 0;
    for (const p of tr) {
      expect(Math.abs(yawDelta(prev, p.yaw))).toBeLessThanOrEqual(90 * SIM_DT + 1e-9);
      // The 1.5 s bar is the plan's (AC25), written as a number: it is not taken from the constant under test.
      if (p.t < 1.5 - 1e-9) expect(p.yaw).toBe(0);
      prev = p.yaw;
    }
    // And it starts right after the bar (no later than one step after 1.5 s).
    expect(tr.find((p) => p.t >= 1.5 + SIM_DT + 1e-9)?.yaw ?? 0).toBeGreaterThan(0);
  });
  test("de costado (solo D) y con «reducir movimiento» el yaw no cambia", () => {
    expect(simulate(false, false).every((p) => p.yaw === 0)).toBe(true);
    expect(simulate(true, true).every((p) => p.yaw === 0)).toBe(true);
  });
  test("de lejos (t > 0,4) no recentra; headingYaw es la inversa de screenDirToWorld", () => {
    expect(recenterYaw({ yawDeg: 0, headingDeg: 90, sinceLookS: 5, dt: 1, forward: true, reduceMotion: false, t: 0.6 })).toBe(0);
    for (const yaw of [0, 45, 90, 200, 359]) {
      const f = screenDirToWorld({ x: 0, y: 1 }, yaw);
      expect(Math.abs(yawDelta(headingYaw(f.x, f.z), yaw))).toBeLessThan(1e-9);
    }
  });
});

describe("zoom continuo (PD-5) en el núcleo", () => {
  test("t log-lineal de 2,5 m al mapa entero; un paso es 7 % del rango; los extremos se acotan", () => {
    const fit = 140;
    expect(zoomDistanceAt(0, fit)).toBeCloseTo(2.5, 12);
    expect(zoomDistanceAt(1, fit)).toBeCloseTo(fit, 9);
    expect(zoomTAt(zoomDistanceAt(0.37, fit), fit)).toBeCloseTo(0.37, 12);
    expect(zoomTAt(stepZoomDistance(6, fit, -1), fit) - zoomTAt(6, fit)).toBeCloseTo(THIRD_PERSON.zoomStep, 12);
    expect(stepZoomDistance(2.5, fit, 1)).toBeCloseTo(2.5, 12);
    expect(stepZoomDistance(fit, fit, -1)).toBeCloseTo(fit, 9);
  });
});
