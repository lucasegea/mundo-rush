import { describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import { billboardYaw, directionFromVelocity, selectSpriteFrame, sheetCellTransform, spriteHeightCompensation, WALK_FPS } from "../src/lib/billboard";
import { cameraOffset } from "../src/lib/camera";

/** Forward vector of a camera at `offset` from the target, looking at it. */
const forwardFrom = (pitch: number, yaw: number) => {
  const [x, y, z] = cameraOffset(pitch, yaw, 1);
  return new Vector3(-x, -y, -z).normalize();
};

describe("billboardYaw (rotation on Y only)", () => {
  it("is 0 for topdownOrtho at any pitch, pi/4 for isoOrtho", () => {
    for (const pitch of [55, 57, 60]) expect(billboardYaw(forwardFrom(pitch, 0))).toBeCloseTo(0);
    expect(billboardYaw(forwardFrom(35.264, 45))).toBeCloseTo(Math.PI / 4);
  });

  it("turns the plane normal (+Z) to point against the camera's horizontal forward", () => {
    for (const yawDeg of [0, 30, 45, 90, 180, -120]) {
      const f = forwardFrom(57, yawDeg);
      const normal = new Vector3(0, 0, 1).applyEuler(new Euler(0, billboardYaw(f), 0));
      expect(normal.y).toBeCloseTo(0); // stays upright: no pitch/roll
      const flat = new Vector3(-f.x, 0, -f.z).normalize();
      expect(normal.dot(flat)).toBeCloseTo(1);
    }
  });

  it("does not depend on pitch (only on the horizontal component)", () => {
    expect(billboardYaw({ x: 0.3, z: -0.4 })).toBeCloseTo(billboardYaw({ x: 0.6, z: -0.8 }));
    expect(billboardYaw({ x: 0, z: 0 })).toBe(0);
  });
});

describe("spriteHeightCompensation", () => {
  it("is 1/cos(pitch): restores the drawn height of a vertical sprite seen from above", () => {
    expect(spriteHeightCompensation(forwardFrom(57, 0))).toBeCloseTo(1 / Math.cos((57 * Math.PI) / 180));
    expect(spriteHeightCompensation(forwardFrom(35.264, 45))).toBeCloseTo(Math.sqrt(1.5));
    expect(spriteHeightCompensation({ x: 0, y: 1, z: 0 })).toBe(3); // straight down: clamped
    expect(spriteHeightCompensation({ x: 0, y: 0, z: 0 })).toBe(1);
  });
});

describe("sprite frame selection by movement direction", () => {
  it("picks the 4 directions relative to a yaw-0 camera (camera on +Z)", () => {
    expect(directionFromVelocity(0, 1, 0)).toBe("down"); // towards the camera
    expect(directionFromVelocity(0, -1, 0)).toBe("up");
    expect(directionFromVelocity(1, 0, 0)).toBe("right");
    expect(directionFromVelocity(-1, 0, 0)).toBe("left");
    expect(directionFromVelocity(1, 0.5, 0)).toBe("right"); // dominant axis wins
  });

  it("is relative to the camera yaw (isoOrtho, yaw 45)", () => {
    const yaw = Math.PI / 4;
    expect(directionFromVelocity(1, 1, yaw)).toBe("down");
    expect(directionFromVelocity(-1, -1, yaw)).toBe("up");
    expect(directionFromVelocity(1, -1, yaw)).toBe("right");
    expect(directionFromVelocity(-1, 1, yaw)).toBe("left");
  });

  it("keeps the previous facing and the idle column when standing still", () => {
    const f = selectSpriteFrame(0, 0, 0, 3.7, "left");
    expect(f).toEqual({ direction: "left", col: 0, row: 1, moving: false });
  });

  it("cycles walk columns 1..3 at WALK_FPS while moving", () => {
    const cols = [0, 1, 2, 3, 4].map((k) => selectSpriteFrame(1, 0, 0, k / WALK_FPS + 1e-6).col);
    expect(cols).toEqual([1, 2, 3, 1, 2]);
    expect(selectSpriteFrame(0, -2, 0, 0).row).toBe(3); // up
  });

  it("maps a sheet cell to texture repeat/offset (row 0 at the top of the canvas)", () => {
    expect(sheetCellTransform(0, 0)).toEqual({ repeatX: 0.25, repeatY: 0.25, offsetX: 0, offsetY: 0.75 });
    expect(sheetCellTransform(3, 3)).toEqual({ repeatX: 0.25, repeatY: 0.25, offsetX: 0.75, offsetY: 0 });
  });
});
