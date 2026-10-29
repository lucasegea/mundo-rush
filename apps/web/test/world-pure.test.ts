// F2 A4, A7 (partes puras de world/): matemática de cámara y registro de presets. Sin WebGL: se prueban las funciones
// que alimentan a three (D-016). Plan estetica-c M7 (D-207): las pruebas de tiles por chunk, billboards, arte pixel
// generado y escala entera de píxel se retiraron con su código; el registro de R11 ya no tiene los ortográficos.
import { CAMERA_PRESET_IDS, presetAngles } from "@lg/core";
import { describe, expect, test } from "vitest";
import { CAMERA_RIG_PRESETS } from "../src/world/camera/presets";
import { cameraOffset, cutFollow, followAlpha } from "../src/world/camera/rig";

describe("A4 CameraRig: exactamente los presets de R11", () => {
  test("las claves del registro son CAMERA_PRESET_IDS; thirdPerson, perspective3D y dialogueFrame implementados, xrTabletop declarado", () => {
    // Cambio registrado (open-world-3d T5, PD-5): el registro gana `thirdPerson` (antes 3 claves).
    expect([...CAMERA_PRESET_IDS]).toEqual(["thirdPerson", "dialogueFrame", "perspective3D", "xrTabletop"]);
    expect(Object.keys(CAMERA_RIG_PRESETS).sort()).toEqual([...CAMERA_PRESET_IDS].sort());
    expect(CAMERA_RIG_PRESETS).toEqual({ thirdPerson: "implemented", dialogueFrame: "implemented", perspective3D: "implemented", xrTabletop: "declared" });
  });

  test("plan estetica-c M7: los ortográficos de HD-2D salieron de R11 (revisión de arquitectura 2026-10-12)", () => {
    for (const id of ["topdownOrtho", "isoOrtho"]) {
      expect(CAMERA_PRESET_IDS as readonly string[]).not.toContain(id);
      expect(Object.keys(CAMERA_RIG_PRESETS)).not.toContain(id);
    }
  });

  test("offset por pitch/yaw: perspective3D a 50° y 45° de giro; el plano de a dos baja a 20°", () => {
    const { pitchDeg, yawDeg } = presetAngles("perspective3D");
    const [x, y, z] = cameraOffset(pitchDeg, yawDeg, 10);
    expect(x).toBeCloseTo(z, 9);
    expect(Math.atan2(y, Math.hypot(x, z))).toBeCloseTo((50 * Math.PI) / 180, 9);
    expect(Math.hypot(x, y, z)).toBeCloseTo(10, 9);
    const [, dy, dz] = cameraOffset(presetAngles("dialogueFrame").pitchDeg, 0, 10);
    expect(Math.atan2(dy, dz)).toBeCloseTo((20 * Math.PI) / 180, 9);
  });
});

describe("A7 reducir movimiento: la cámara corta en vez de seguir", () => {
  test("cutFollow no se mueve mientras el jugador está cerca del centro; corta de golpe cuando sale", () => {
    const here = { x: 0, z: 0 };
    expect(cutFollow(here, { x: 2, z: 1 }, 5, 4)).toBe(here);
    expect(cutFollow(here, { x: 3.5, z: 0 }, 5, 4)).toEqual({ x: 3.5, z: 0 });
    expect(cutFollow(here, { x: 0, z: -2.5 }, 5, 4)).toEqual({ x: 0, z: -2.5 });
  });

  test("el seguimiento suave es independiente del framerate", () => {
    const twoHalves = 1 - (1 - followAlpha(1 / 60)) ** 2;
    expect(twoHalves).toBeCloseTo(followAlpha(1 / 30), 9);
    expect(followAlpha(-1)).toBe(0);
  });
});
