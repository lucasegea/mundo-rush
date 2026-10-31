// open-world-3d M2 (AC28-AC30): the pure parts of the walk's third-person steps. The browser delivers positions,
// yaw and projections; here it is decided whether they pass. Game convention (packages/core/src/camera/camera.ts): with yaw 0 the
// camera looks toward -z, and forward is `(-sin yaw, -cos yaw)`.

export interface P2 { x: number; z: number }

const RAD = Math.PI / 180;

/** Forward in the XZ plane for a camera yaw (degrees). */
export const forwardOf = (yawDeg: number): P2 => ({ x: -Math.sin(yawDeg * RAD), z: -Math.cos(yawDeg * RAD) });

/** Shortest angle difference (degrees), in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Angle (degrees) of a displacement in the yaw convention: the yaw that puts it forward. */
export const displacementYaw = (d: P2): number => ((Math.atan2(-d.x, -d.z) / RAD) % 360 + 360) % 360;

/** AC28: W for 1 s advances 3 to 4.5 m in the yaw direction (and almost nothing sideways). */
export function forwardWalkOk(before: P2, after: P2, yawDeg: number, min = 3, max = 4.5): { ok: boolean; along: number; side: number } {
  const f = forwardOf(yawDeg);
  const d = { x: after.x - before.x, z: after.z - before.z };
  const along = d.x * f.x + d.z * f.z;
  const side = Math.abs(d.x * f.z - d.z * f.x);
  return { ok: along >= min && along <= max && side <= 0.5, along, side };
}

/** AC28: after turning with Q, the march turned the same as the yaw (tolerance in degrees). */
export function turnFollowsYaw(d1: P2, d2: P2, yawChange: number, tolDeg = 10): { ok: boolean; rotated: number } {
  const rotated = angleDelta(displacementYaw(d1), displacementYaw(d2));
  return { ok: Math.abs(angleDelta(rotated, yawChange)) <= tolDeg && Math.abs(yawChange) > 1, rotated };
}

/** NDC of a point with the camera matrices (16-element arrays, column-major, like three's `Matrix4.elements`). */
export function projectWithMatrices(view: readonly number[], proj: readonly number[], p: readonly [number, number, number]): [number, number, number] {
  const mul = (m: readonly number[], v: readonly number[]): number[] =>
    [0, 1, 2, 3].map((r) => (m[r] as number) * (v[0] as number) + (m[4 + r] as number) * (v[1] as number) + (m[8 + r] as number) * (v[2] as number) + (m[12 + r] as number) * (v[3] as number));
  const c = mul(proj, mul(view, [p[0], p[1], p[2], 1]));
  const w = c[3] as number;
  return [(c[0] as number) / w, (c[1] as number) / w, w];
}

/** AC30: a projected point is on screen (in front of the camera and inside NDC [-1, 1]). */
export const onScreen = (ndc: readonly [number, number, number]): boolean => ndc[2] > 0 && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1;

/** Right in the XZ plane for a camera yaw (forward rotated 90 degrees clockwise seen from above). */
export const rightOf = (yawDeg: number): P2 => ({ x: Math.cos(yawDeg * RAD), z: -Math.sin(yawDeg * RAD) });

/** A beacon of the drawn scene, as the walk sees it (AC30). */
export interface BeaconSeen { id: string; visible: boolean; opacity: number; ndc: readonly [number, number, number] }

/**
 * AC30: each expected id (the player and the NPCs) has a visible beacon sprite, opaque (> 0.9) and inside the
 * screen. Projecting the NPC's position is not enough: hidden beacons would pass anyway (QA, M2 iteration 0).
 */
export function beaconsOk(seen: readonly BeaconSeen[], expected: readonly string[]): { ok: boolean; detail: string[] } {
  const detail = expected.map((id) => {
    const b = seen.find((s) => s.id === id);
    if (!b) return `${id}:sin baliza`;
    const why = [!b.visible && "oculta", !(b.opacity > 0.9) && `opacidad ${b.opacity.toFixed(2)}`, !onScreen(b.ndc) && "fuera de pantalla"].filter(Boolean);
    return why.length === 0 ? `${id}:si` : `${id}:NO (${why.join(", ")})`;
  });
  return { ok: expected.length > 0 && detail.every((d) => d.endsWith(":si")), detail };
}
