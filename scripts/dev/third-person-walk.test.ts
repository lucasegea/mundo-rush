// open-world-3d M2: the pure parts of the walk's AC28-AC30 steps, with cases that have to fail (FD0 lesson).
import { describe, expect, test } from "vitest";
import { angleDelta, beaconsOk, displacementYaw, forwardOf, forwardWalkOk, onScreen, projectWithMatrices, rightOf, turnFollowsYaw } from "./third-person-walk.ts";

describe("tercera persona en la caminata", () => {
  test("adelante y diferencia de ángulos siguen la convención del núcleo", () => {
    expect(forwardOf(0).z).toBeCloseTo(-1, 12);
    expect(forwardOf(90).x).toBeCloseTo(-1, 12);
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(displacementYaw(forwardOf(270))).toBeCloseTo(270, 9);
  });
  test("AC28: W de 3,5 m pasa; corto, largo o de costado falla", () => {
    expect(forwardWalkOk({ x: 0, z: 0 }, { x: 3.5, z: 0 }, 270).ok).toBe(true);
    expect(forwardWalkOk({ x: 0, z: 0 }, { x: 2, z: 0 }, 270).ok).toBe(false);
    expect(forwardWalkOk({ x: 0, z: 0 }, { x: 5, z: 0 }, 270).ok).toBe(false);
    expect(forwardWalkOk({ x: 0, z: 0 }, { x: 0, z: -3.5 }, 270).ok).toBe(false);
  });
  test("AC28: la marcha gira lo mismo que el yaw; sin giro o con otro giro falla", () => {
    const a = forwardOf(270);
    const b = forwardOf(300);
    expect(turnFollowsYaw(a, b, 30).ok).toBe(true);
    expect(turnFollowsYaw(a, b, 60).ok).toBe(false);
    expect(turnFollowsYaw(a, a, 0).ok).toBe(false);
  });
  test("AC30: proyección con matrices identidad y puntos detrás de la cámara", () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(onScreen(projectWithMatrices(id, id, [0.5, -0.5, 0]))).toBe(true);
    expect(onScreen(projectWithMatrices(id, id, [1.5, 0, 0]))).toBe(false);
    const flip = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1];
    expect(onScreen(projectWithMatrices(id, flip, [0, 0, 0]))).toBe(false);
  });
  test("derecha es adelante girado 90 grados (yaw 0 mira a -z, la derecha es +x)", () => {
    expect(rightOf(0).x).toBeCloseTo(1, 12);
    expect(rightOf(0).z).toBeCloseTo(0, 12);
    const f = forwardOf(37);
    const r = rightOf(37);
    expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 12);
    expect(rightOf(270).z).toBeCloseTo(1, 12);
  });
  test("AC30: balizas visibles, opacas y en pantalla pasan; ocultas, transparentes, afuera o faltantes fallan", () => {
    const good = { visible: true, opacity: 1, ndc: [0.2, 0.1, 5] as const };
    const ids = ["player", "NPC-A"];
    expect(beaconsOk([{ id: "player", ...good }, { id: "NPC-A", ...good }], ids).ok).toBe(true);
    expect(beaconsOk([{ id: "player", ...good }, { id: "NPC-A", ...good, visible: false }], ids).ok).toBe(false);
    expect(beaconsOk([{ id: "player", ...good }, { id: "NPC-A", ...good, opacity: 0.5 }], ids).ok).toBe(false);
    expect(beaconsOk([{ id: "player", ...good }, { id: "NPC-A", ...good, ndc: [1.4, 0, 5] }], ids).ok).toBe(false);
    expect(beaconsOk([{ id: "player", ...good }], ids).ok).toBe(false);
    expect(beaconsOk([], []).ok).toBe(false);
  });
});
