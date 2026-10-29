// open-world-3d M2 (AC28-AC30): lo puro de los pasos de tercera persona de la caminata. El navegador entrega posiciones,
// yaw y proyecciones; aca se decide si pasan. Convencion del juego (packages/core/src/camera/camera.ts): con yaw 0 la
// camara mira hacia -z, y adelante es `(-sin yaw, -cos yaw)`.

export interface P2 { x: number; z: number }

const RAD = Math.PI / 180;

/** Adelante en el plano XZ para un yaw de camara (grados). */
export const forwardOf = (yawDeg: number): P2 => ({ x: -Math.sin(yawDeg * RAD), z: -Math.cos(yawDeg * RAD) });

/** Diferencia de angulo mas corta (grados), en (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Angulo (grados) de un desplazamiento en la convencion del yaw: el yaw que lo pone adelante. */
export const displacementYaw = (d: P2): number => ((Math.atan2(-d.x, -d.z) / RAD) % 360 + 360) % 360;

/** AC28: W 1 s avanza 3 a 4,5 m en la direccion del yaw (y casi nada de costado). */
export function forwardWalkOk(before: P2, after: P2, yawDeg: number, min = 3, max = 4.5): { ok: boolean; along: number; side: number } {
  const f = forwardOf(yawDeg);
  const d = { x: after.x - before.x, z: after.z - before.z };
  const along = d.x * f.x + d.z * f.z;
  const side = Math.abs(d.x * f.z - d.z * f.x);
  return { ok: along >= min && along <= max && side <= 0.5, along, side };
}

/** AC28: despues de girar con Q, la marcha giro lo mismo que el yaw (tolerancia en grados). */
export function turnFollowsYaw(d1: P2, d2: P2, yawChange: number, tolDeg = 10): { ok: boolean; rotated: number } {
  const rotated = angleDelta(displacementYaw(d1), displacementYaw(d2));
  return { ok: Math.abs(angleDelta(rotated, yawChange)) <= tolDeg && Math.abs(yawChange) > 1, rotated };
}

/** NDC de un punto con las matrices de la camara (arreglos de 16, por columnas, como `Matrix4.elements` de three). */
export function projectWithMatrices(view: readonly number[], proj: readonly number[], p: readonly [number, number, number]): [number, number, number] {
  const mul = (m: readonly number[], v: readonly number[]): number[] =>
    [0, 1, 2, 3].map((r) => (m[r] as number) * (v[0] as number) + (m[4 + r] as number) * (v[1] as number) + (m[8 + r] as number) * (v[2] as number) + (m[12 + r] as number) * (v[3] as number));
  const c = mul(proj, mul(view, [p[0], p[1], p[2], 1]));
  const w = c[3] as number;
  return [(c[0] as number) / w, (c[1] as number) / w, w];
}

/** AC30: un punto proyectado esta en pantalla (delante de la camara y dentro de NDC [-1, 1]). */
export const onScreen = (ndc: readonly [number, number, number]): boolean => ndc[2] > 0 && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1;

/** Derecha en el plano XZ para un yaw de camara (adelante girado 90 grados en sentido horario visto desde arriba). */
export const rightOf = (yawDeg: number): P2 => ({ x: Math.cos(yawDeg * RAD), z: -Math.sin(yawDeg * RAD) });

/** Una baliza de la escena dibujada, como la ve la caminata (AC30). */
export interface BeaconSeen { id: string; visible: boolean; opacity: number; ndc: readonly [number, number, number] }

/**
 * AC30: cada id esperado (el jugador y los NPCs) tiene un sprite de baliza visible, opaco (> 0,9) y dentro de la
 * pantalla. Proyectar la posicion del NPC no alcanza: las balizas ocultas pasarian igual (QA, M2 iteracion 0).
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
