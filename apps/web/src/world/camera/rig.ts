// Matemática pura de CameraRig (R11, D-053, D-197, D-207, D-208): offset por pitch/yaw, el lente largo `perspective3D`
// de la propuesta C §4 (FOV, huella del frustum sobre el suelo y su alcance, planos de recorte y escala de lo que
// depende de la distancia; la escalera de zoom vive en el núcleo y llega como distancia), el plano de a dos en 3/4 de la
// charla con test de oclusión, suavizado y "corte" para "reducir movimiento". Plan estetica-c M7: la matemática
// ortográfica de HD-2D (frustum, escala entera de píxel, snap a la grilla de píxel) se retiró con sus presets.

/** Distancia por defecto de `cameraOffset` (m), cuando no se pasa una. */
export const CAMERA_DISTANCE = 40;

type Vec3 = [number, number, number];

/** Offset del objetivo a la cámara: elevada por pitch, rotada en Y por yaw (yaw 0 = cámara del lado +z). */
export function cameraOffset(pitchDeg: number, yawDeg: number, distance = CAMERA_DISTANCE): Vec3 {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const flat = Math.cos(p) * distance;
  return [Math.sin(y) * flat, Math.sin(p) * distance, Math.cos(y) * flat];
}

/** Factor de suavizado exponencial independiente del framerate. */
export function followAlpha(dtSec: number, rate = 6): number {
  return 1 - Math.exp(-rate * Math.max(0, dtSec));
}

/**
 * "Reducir movimiento" (D-053, F2 A7): la cámara no sigue al jugador de forma continua. Se queda quieta y, cuando
 * el jugador sale del centro de la vista (más de `margin` de la media vista en algún eje), corta de golpe a él.
 */
export function cutFollow(
  current: { x: number; z: number },
  target: { x: number; z: number },
  halfWidth: number,
  halfDepth: number,
  margin = 0.6,
): { x: number; z: number } {
  const out = Math.abs(target.x - current.x) > halfWidth * margin || Math.abs(target.z - current.z) > halfDepth * margin;
  return out ? { x: target.x, z: target.z } : current;
}

// ---------- perspective3D: lente largo (propuesta C §4, plan estetica-c M1 ítem 1) ----------

export const PERSPECTIVE = {
  fovDeg: 30,
  /** FOV vertical en pantallas verticales (aspecto < 1). */
  portraitFovDeg: 40.5,
  near: 0.5,
  far: 200,
  /** La cámara mira al jugador a esta altura. */
  targetHeight: 0.8,
  /** Suavizado exponencial del seguimiento (1/s). */
  followRate: 5,
} as const;

/**
 * Distancia de referencia (m): la del paso de inicio, donde valen los números de la propuesta C §5 (niebla 34 a 78 m,
 * caja de sombra de 44 m). Más lejos, lo que depende de la distancia escala con `viewScale` (D-208); más cerca, no.
 */
export const VIEW_REFERENCE_DISTANCE = 30;

/** Factor de escala de niebla, sombra y recorte para una distancia de cámara: 1 hasta la de referencia, lineal después. */
export function viewScale(distance: number): number {
  return Math.max(1, distance / VIEW_REFERENCE_DISTANCE);
}

/** FOV vertical según el aspecto del canvas (más abierto en vertical, así entra lo mismo de ancho). */
export function perspectiveFov(aspect: number): number {
  return aspect < 1 ? PERSPECTIVE.portraitFovDeg : PERSPECTIVE.fovDeg;
}

const RAD = Math.PI / 180;
const normalize3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Huella del frustum sobre el suelo y = 0: las 4 esquinas de la pantalla proyectadas desde la cámara (que mira a
 * `target` desde `cameraOffset(pitch, yaw, distance)`). null si alguna esquina no toca el suelo (se vería horizonte).
 */
export function frustumGroundFootprint(target: Vec3, pitchDeg: number, yawDeg: number, distance: number, fovDeg: number, aspect: number): [number, number][] | null {
  const off = cameraOffset(pitchDeg, yawDeg, distance);
  const cam: Vec3 = [target[0] + off[0], target[1] + off[1], target[2] + off[2]];
  const fwd = normalize3([-off[0], -off[1], -off[2]]);
  const right = normalize3(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const th = Math.tan((fovDeg * RAD) / 2);
  const tw = th * aspect;
  const out: [number, number][] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const dir: Vec3 = [fwd[0] + right[0] * sx * tw + up[0] * sy * th, fwd[1] + right[1] * sx * tw + up[1] * sy * th, fwd[2] + right[2] * sx * tw + up[2] * sy * th];
    if (dir[1] >= -1e-6) return null;
    const t = -cam[1] / dir[1];
    out.push([cam[0] + dir[0] * t, cam[2] + dir[2] * t]);
  }
  return out;
}

/**
 * Alcance de la huella sobre el suelo: cuánto se aleja del objetivo (en x y en z, el mayor) lo que entra en pantalla.
 * Infinity si se ve el horizonte. El terreno tiene que extenderse al menos esto más allá de los límites caminables.
 */
export function groundReach(distance: number, pitchDeg: number, yawDeg: number, fovDeg: number, aspect: number): number {
  const fp = frustumGroundFootprint([0, PERSPECTIVE.targetHeight, 0], pitchDeg, yawDeg, distance, fovDeg, aspect);
  if (!fp) return Infinity;
  return Math.max(...fp.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))));
}

/** Margen del plano lejano sobre el rayo de pantalla más largo hasta el suelo. */
export const FAR_MARGIN = 1.2;

/**
 * Planos de recorte para una distancia de cámara (D-208). `far` cubre con margen el rayo más largo de las esquinas de
 * la pantalla hasta el suelo (nunca menos que PERSPECTIVE.far; si se ve el horizonte, PERSPECTIVE.far). `near` crece
 * con la distancia para no gastar precisión de profundidad: 0,5 m hasta la referencia, con tope de 4 m.
 */
export function cameraClip(distance: number, pitchDeg: number, fovDeg: number, aspect: number): { near: number; far: number } {
  const near = Math.min(4, PERSPECTIVE.near * viewScale(distance));
  const off = cameraOffset(pitchDeg, 0, distance);
  const cam: Vec3 = [off[0], PERSPECTIVE.targetHeight + off[1], off[2]];
  const fp = frustumGroundFootprint([0, PERSPECTIVE.targetHeight, 0], pitchDeg, 0, distance, fovDeg, aspect);
  if (!fp) return { near, far: PERSPECTIVE.far };
  const longest = Math.max(...fp.map(([x, z]) => Math.hypot(x - cam[0], cam[1], z - cam[2])));
  return { near, far: Math.max(PERSPECTIVE.far, Math.ceil(longest * FAR_MARGIN)) };
}

// ---------- dialogueFrame: plano de a dos en 3/4 (propuesta C §4, plan estetica-c M1 ítem 3) ----------

export const TWO_SHOT = {
  pitchDeg: 20,
  distance: 12.5,
  /** La mira baja 0,9 m desde la altura del pecho para que los dos queden en el tercio de arriba, sobre el panel. */
  chestHeight: 1.2,
  lookDrop: 0.9,
  /** Corrimiento hacia la cara del NPC: el preferido primero, después los otros dos (6 candidatos con los 2 lados). */
  leansDeg: [27, 17.5, 37] as const,
  /** Transición (1/s). */
  rate: 3,
} as const;

/** Huella de algo que puede tapar la charla (props por su caja, árboles por su copa), con su alto. */
export type Obstacle =
  | { kind: "rect"; minX: number; maxX: number; minZ: number; maxZ: number; height: number }
  | { kind: "circle"; x: number; z: number; r: number; height: number };

export interface TwoShotCandidate {
  side: 1 | -1;
  leanDeg: number;
  yawDeg: number;
  /** Muestras tapadas de los segmentos cámara-personajes, más 0,5 si no es el corrimiento preferido. */
  score: number;
}

export interface TwoShot {
  target: Vec3;
  pitchDeg: number;
  yawDeg: number;
  distance: number;
  chosen: TwoShotCandidate;
}

type P2 = { x: number; z: number };

const inside = (o: Obstacle, x: number, z: number, margin: number): boolean =>
  o.kind === "rect"
    ? x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin
    : Math.hypot(x - o.x, z - o.z) < o.r + margin;

/** Los 6 candidatos (2 lados × 3 corrimientos) con su puntaje de oclusión, en orden de preferencia. */
export function twoShotCandidates(player: P2, npc: P2, obstacles: readonly Obstacle[], heightAt?: (x: number, z: number) => number): TwoShotCandidate[] {
  const L = Math.hypot(player.x - npc.x, player.z - npc.z) || 1;
  const nx = (player.x - npc.x) / L;
  const nz = (player.z - npc.z) / L;
  const target = twoShotTarget(player, npc);
  const out: TwoShotCandidate[] = [];
  for (const side of [1, -1] as const) {
    for (const leanDeg of TWO_SHOT.leansDeg) {
      // Perpendicular a la línea jugador-NPC, corrida hacia el jugador: el NPC (que mira al jugador) queda de frente en 3/4.
      const lean = Math.sin(leanDeg * RAD);
      const ux = -nz * side;
      const uz = nx * side;
      const ox = ux * Math.sqrt(1 - lean * lean) + nx * lean;
      const oz = uz * Math.sqrt(1 - lean * lean) + nz * lean;
      const yawDeg = Math.atan2(ox, oz) / RAD;
      const off = cameraOffset(TWO_SHOT.pitchDeg, yawDeg, TWO_SHOT.distance);
      const cam: Vec3 = [target[0] + off[0], target[1] + off[1], target[2] + off[2]];
      let hits = 0;
      for (const who of [player, npc]) {
        const N = 28;
        for (let k = 1; k <= N; k++) {
          const t = k / N;
          const x = who.x + (cam[0] - who.x) * t;
          const y = TWO_SHOT.chestHeight + (cam[1] - TWO_SHOT.chestHeight) * t;
          const z = who.z + (cam[2] - who.z) * t;
          if (Math.hypot(x - who.x, z - who.z) < 0.7) continue; // el propio personaje
          for (const o of obstacles) if (y < o.height && inside(o, x, z, 0.3)) hits++;
          if (heightAt && heightAt(x, z) > y - 0.2) hits++;
        }
      }
      out.push({ side, leanDeg, yawDeg, score: hits + (leanDeg === TWO_SHOT.leansDeg[0] ? 0 : 0.5) });
    }
  }
  return out;
}

/** El punto que mira el plano de a dos: entre los dos, a la altura del pecho menos la bajada. */
export function twoShotTarget(player: P2, npc: P2): Vec3 {
  return [(player.x + npc.x) / 2, TWO_SHOT.chestHeight - TWO_SHOT.lookDrop, (player.z + npc.z) / 2];
}

/** El encuadre de la charla: el candidato de menos oclusión (empate: el primero en orden de preferencia). Nunca falla. */
export function twoShotFrame(player: P2, npc: P2, obstacles: readonly Obstacle[], heightAt?: (x: number, z: number) => number): TwoShot {
  const cands = twoShotCandidates(player, npc, obstacles, heightAt);
  const chosen = cands.reduce((best, c) => (c.score < best.score ? c : best));
  return { target: twoShotTarget(player, npc), pitchDeg: TWO_SHOT.pitchDeg, yawDeg: chosen.yawDeg, distance: TWO_SHOT.distance, chosen };
}

/** Diferencia de ángulo más corta (grados), en (-180, 180]. */
export function shortestYawDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}
