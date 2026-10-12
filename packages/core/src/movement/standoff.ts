// Acomodo del jugador al empezar una charla desde el mapa (plan estetica-c M1 ítem 4, revisión de arquitectura 2026-10-12): el jugador
// queda a 2,6 m del NPC, de su lado, en un lugar caminable y con línea libre desde donde está (el segmento no cruza
// nada bloqueado: sin esto podría "saltar" un cerco). Así el plano de a dos de la cámara no se tapa. Puro.
import { circleBlocked } from "./collision";
import type { Point, WalkGrid } from "./grid";

export const STANDOFF_DISTANCE = 2.6;
/** Rango de respaldo si no hay lugar a 2,6 m. */
export const STANDOFF_MIN = 1.8;
export const STANDOFF_MAX = 3.2;
/** Radio del cuerpo que tiene que entrar en el punto elegido (el de DEFAULT_MOVEMENT). */
const BODY_RADIUS = 0.24;
/** Desvíos de ángulo probados alrededor del lado del jugador, del más chico al más grande (nunca pasa al otro lado). */
const ANGLE_OFFSETS_DEG = [0, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90];

/** Distancias candidatas: 2,6 primero y después las más cercanas a 2,6 dentro de [1,8, 3,2], de a 0,1 m. */
function distances(preferred: number): number[] {
  const out: number[] = [];
  for (let d = STANDOFF_MIN; d <= STANDOFF_MAX + 1e-9; d += 0.1) out.push(Math.round(d * 10) / 10);
  return out.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
}

/** ¿Se puede ir en línea recta de `a` a `b` sin que el cuerpo toque una celda bloqueada? */
export function clearLine(g: WalkGrid, a: Point, b: Point, radius = BODY_RADIUS): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / (g.cellSize / 8)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (circleBlocked(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
  }
  return true;
}

/**
 * Dónde se para el jugador para hablar con el NPC: a `distance` m, del lado desde el que llegó, en un punto donde
 * el cuerpo entra y con línea libre desde la posición actual. Si no hay ninguno a 2,6 m, el más cercano a 2,6 entre
 * 1,8 y 3,2 m; si no hay ninguno, la posición actual.
 */
export function standoffPoint(player: Point, npc: Point, g: WalkGrid, distance = STANDOFF_DISTANCE): Point {
  const dx = player.x - npc.x;
  const dz = player.z - npc.z;
  // Encima del NPC (dato raro): se toma +z como "su lado".
  const base = Math.hypot(dx, dz) > 1e-9 ? Math.atan2(dz, dx) : Math.PI / 2;
  for (const d of distances(distance)) {
    for (const off of ANGLE_OFFSETS_DEG) {
      const a = base + (off * Math.PI) / 180;
      const p = { x: npc.x + Math.cos(a) * d, z: npc.z + Math.sin(a) * d };
      if (!circleBlocked(g, p.x, p.z, BODY_RADIUS) && clearLine(g, player, p)) return p;
    }
  }
  return player;
}
