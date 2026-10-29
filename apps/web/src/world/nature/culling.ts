// world/nature/culling.ts — qué instancias de árboles, rocas y detalle se suben a la GPU (open-world-3d T7, AC45), port
// del mockup V6 (`world.js` updateLOD). Una instancia entra en cada nivel cuya banda contiene su distancia al jugador
// (con el margen de @lg/art `bandLimits`) solo si su esfera toca el frustum, no está pasada la niebla ni su distancia
// máxima (las rocas chicas), y la cámara no está dentro de ella (una copa que tapa la pantalla se esconde). Lo recorre
// solo cuando la vista cambió de verdad (CullGate): el jugador se movió 1 m, el giro o la inclinación cambiaron 5° o el
// zoom cambió la distancia de la cámara 1 m (un 5 % de lejos), y una vez más cuando la vista se asienta lejos del último
// recorrido. Quieto, no se sube nada.
import { Sphere, type Frustum, type InstancedMesh, type Vector3 } from "three";
import { bandLimits, type ShaderBand } from "@lg/art";

/** Una instancia: su lugar, su esfera (centro en altura y radio, en el mundo), su matriz y su tinte. */
export interface NatureEntry {
  x: number;
  z: number;
  /** Altura de la base y escala de la instancia: con la malla cargada, la esfera se recalcula con ellas. */
  base: number;
  k: number;
  cy: number;
  rad: number;
  /** Más allá de esta distancia al jugador no se dibuja (rocas chicas, SMALL_ROCK_MAX_DISTANCE); si no, Infinity. */
  maxD: number;
  matrix: ArrayLike<number>;
  tint: readonly [number, number, number];
}

export interface NatureLevel {
  band: ShaderBand;
  mesh: InstancedMesh;
}

/** Un grupo de instancias de una variante con sus niveles (completo, liviano, impostor; o una sola banda). */
export interface NatureGroup {
  entries: NatureEntry[];
  levels: NatureLevel[];
}

export interface CullView {
  /** El jugador (centro de las bandas). */
  cx: number;
  cz: number;
  camera: Vector3;
  frustum: Frustum;
  fogFar: number;
  full: number;
  mid: number;
}

const sphere = new Sphere();

/** ¿La instancia se ve? (esfera en el frustum, antes de la niebla y de su distancia máxima, cámara fuera de ella). */
export function entryVisible(e: NatureEntry, v: CullView): boolean {
  const d = Math.hypot(e.x - v.cx, e.z - v.cz);
  if (d - e.rad > v.fogFar || d > e.maxD) return false;
  sphere.center.set(e.x, e.cy, e.z);
  sphere.radius = e.rad;
  if (!v.frustum.intersectsSphere(sphere)) return false;
  return sphere.center.distanceTo(v.camera) >= e.rad * 0.8;
}

/** Sube a cada nivel sus instancias visibles dentro de su banda. Devuelve cuántas subió por nivel. */
export function cullGroup(g: NatureGroup, v: CullView): number[] {
  const n = g.levels.map(() => 0);
  const lim = g.levels.map((l) => bandLimits(l.band, v.full, v.mid));
  for (const e of g.entries) {
    if (!entryVisible(e, v)) continue;
    const d = Math.hypot(e.x - v.cx, e.z - v.cz);
    g.levels.forEach((l, li) => {
      const [a, b] = lim[li] as [number, number];
      if (d < a || d > b) return;
      const k = (n[li] as number)++;
      l.mesh.instanceMatrix.array.set(e.matrix, k * 16);
      const c = l.mesh.instanceColor?.array;
      if (c) c.set(e.tint, k * 3);
    });
  }
  g.levels.forEach((l, li) => {
    l.mesh.count = n[li] as number;
    l.mesh.visible = (n[li] as number) > 0;
    l.mesh.instanceMatrix.needsUpdate = true;
    if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true;
  });
  return n;
}

/** Umbrales del recorrido (AC45). */
export const CULL_MOVE_M = 1;
export const CULL_TURN_DEG = 5;

export interface GateState {
  /** El jugador. */
  x: number;
  z: number;
  /** Giro e inclinación de la vista (grados) y distancia de la cámara al jugador (m). */
  yawDeg: number;
  pitchDeg: number;
  distance: number;
}

const angleDelta = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * Por debajo de esto entre dos cuadros seguidos, la vista está quieta (la cámara terminó de asentarse). Fix 1 de QA
 * (hallazgo 5): con solo los umbrales, una cámara que se asienta por menos de 1 m o 5° quedaba con el recorrido de
 * mitad de camino y los triángulos de la sonda salían bimodales en una misma pose.
 */
export const CULL_REST_M = 1e-3;
export const CULL_REST_DEG = 0.02;

const near = (a: GateState, b: GateState, m: number, deg: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) < m
  && angleDelta(a.yawDeg, b.yawDeg) < deg
  && Math.abs(a.pitchDeg - b.pitchDeg) < deg
  && Math.abs(a.distance - b.distance) < m;

/**
 * Decide cuándo recorrer: la primera vez, después solo si la vista cambió más que los umbrales desde el último, y una
 * vez más cuando la vista queda quieta en un lugar distinto del último recorrido (asentarse), así una pose fija da
 * siempre el mismo recorrido.
 */
export class CullGate {
  private last: GateState | null = null;
  private prev: GateState | null = null;
  /** Cuántas veces dijo que sí (los tests y la sonda lo leen). */
  runs = 0;

  shouldUpdate(s: GateState): boolean {
    const l = this.last;
    const p = this.prev;
    this.prev = { ...s };
    const changed = !l
      || Math.hypot(s.x - l.x, s.z - l.z) >= CULL_MOVE_M
      || angleDelta(s.yawDeg, l.yawDeg) >= CULL_TURN_DEG
      || Math.abs(s.pitchDeg - l.pitchDeg) >= CULL_TURN_DEG
      || Math.abs(s.distance - l.distance) >= Math.max(CULL_MOVE_M, 0.05 * l.distance);
    const settled = !changed && p !== null && near(s, p, CULL_REST_M, CULL_REST_DEG) && !near(s, l, CULL_REST_M, CULL_REST_DEG);
    if (changed || settled) {
      this.last = { ...s };
      this.runs += 1;
    }
    return changed || settled;
  }

  /** La próxima consulta recorre sí o sí (cambió el contenido: llegaron las mallas). */
  reset(): void {
    this.last = null;
  }
}

/** Giro y elevación (grados) de la dirección de la vista de una cámara (de su matriz del mundo, la columna -z). */
export function viewAngles(matrixWorld: { elements: ArrayLike<number> }): { yawDeg: number; pitchDeg: number } {
  const e = matrixWorld.elements;
  const fx = -(e[8] as number), fy = -(e[9] as number), fz = -(e[10] as number);
  const len = Math.hypot(fx, fy, fz) || 1;
  return { yawDeg: (Math.atan2(fx, fz) * 180) / Math.PI, pitchDeg: (Math.asin(Math.max(-1, Math.min(1, fy / len))) * 180) / Math.PI };
}
