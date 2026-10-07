import { describe, expect, it } from "vitest";
import { NearestFilter, SRGBColorSpace, Texture } from "three";
import { configurePixelTexture } from "../src/lib/art";
import { cameraOffset, followAlpha, integerScaleViewWidth, orthoFrustum, presetAngles, snapToPixelGrid } from "../src/lib/camera";
import { buildVolumes, buildWalkPaths, MAP_H, MAP_W, pathLength, samplePath } from "../src/lib/world";

describe("camera rig math", () => {
  it("places the camera by pitch and yaw", () => {
    const [x, y, z] = cameraOffset(57, 0, 10);
    expect(x).toBeCloseTo(0);
    expect(Math.atan2(y, z) * (180 / Math.PI)).toBeCloseTo(57);
    const [ix, , iz] = cameraOffset(35.264, 45, 10);
    expect(ix).toBeCloseTo(iz);
    expect(presetAngles("isoOrtho", 57)).toEqual({ pitchDeg: 35.264, yawDeg: 45 });
    expect(presetAngles("topdownOrtho", 59)).toEqual({ pitchDeg: 59, yawDeg: 0 });
  });

  it("sizes the frustum ~15 tiles wide and finds integer pixel scales", () => {
    expect(orthoFrustum(15, 1.5)).toEqual({ left: -7.5, right: 7.5, top: 5, bottom: -5 });
    expect(integerScaleViewWidth(1366)).toBeCloseTo(1366 / 96); // 3 px per texel, 14.2 tiles
    expect(integerScaleViewWidth(1920)).toBeCloseTo(15); // 4 px per texel, exactly 15 tiles
    expect(integerScaleViewWidth(200)).toBeCloseTo(6.25); // never below 1 px per texel
  });

  it("snaps the position to whole pixels along the camera's right/up axes only", () => {
    const right: [number, number, number] = [1, 0, 0];
    const s = Math.SQRT1_2;
    const up: [number, number, number] = [0, s, -s];
    const snapped = snapToPixelGrid([1.23, 7.77, 3.31], right, up, 0.1);
    const along = (v: number[], a: number[]) => v[0]! * a[0]! + v[1]! * a[1]! + v[2]! * a[2]!;
    expect((along(snapped, right) / 0.1) % 1).toBeCloseTo(0);
    expect(Math.abs(Math.round(along(snapped, up) / 0.1) - along(snapped, up) / 0.1)).toBeLessThan(1e-9);
    // The view direction component is untouched.
    const fwd = [0, -s, -s];
    expect(along(snapped, fwd)).toBeCloseTo(along([1.23, 7.77, 3.31], fwd));
    expect(snapToPixelGrid([1, 2, 3], right, up, 0)).toEqual([1, 2, 3]);
  });

  it("smooths the follow independently of frame rate", () => {
    const one = followAlpha(1 / 30);
    const twoHalves = 1 - (1 - followAlpha(1 / 60)) ** 2;
    expect(one).toBeCloseTo(twoHalves);
    expect(followAlpha(-1)).toBe(0);
  });
});

describe("spike world", () => {
  it("has ~40 volumes inside the 48x32 map and 8 walk loops", () => {
    const v = buildVolumes();
    expect(v.length).toBe(40);
    for (const b of v) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(MAP_W);
      expect(b.z + b.d / 2).toBeLessThanOrEqual(MAP_H);
    }
    expect(buildWalkPaths()).toHaveLength(8);
  });

  it("samples closed loops with unit direction", () => {
    const sq: Array<[number, number]> = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(pathLength(sq)).toBe(8);
    expect(samplePath(sq, 1)).toEqual({ x: 1, z: 0, dx: 1, dz: 0 });
    expect(samplePath(sq, 3)).toEqual({ x: 2, z: 1, dx: 0, dz: 1 });
    expect(samplePath(sq, 9)).toEqual(samplePath(sq, 1));
    expect(samplePath([[0, 0], [4, 0]], 6)).toEqual({ x: 2, z: 0, dx: -1, dz: 0 }); // 2-point loops ping-pong
  });

  it("configures pixel textures as nearest, no mipmaps, sRGB (D-154)", () => {
    const t = configurePixelTexture(new Texture());
    expect(t.magFilter).toBe(NearestFilter);
    expect(t.minFilter).toBe(NearestFilter);
    expect(t.generateMipmaps).toBe(false);
    expect(t.colorSpace).toBe(SRGBColorSpace);
  });
});
