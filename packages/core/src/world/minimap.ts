// Minimapa (open-world-3d T9, M4; mockup V6 `main.js`, "heading up, 60 m"): el modelo puro de lo que dibuja el HUD.
// Arriba es adelante (el yaw de la cámara: lo que está arriba en pantalla está arriba en el minimapa), el jugador queda
// en el centro y se ven 60 m a la redonda. Un NPC más lejos que el anillo se clava en el anillo (`edge`) y la interfaz
// lo dibuja como flecha que apunta hacia él. El núcleo no sabe de canvas ni de colores: devuelve píxeles del minimapa
// (origen arriba a la izquierda) y la interfaz solo pinta. Los colores salen del look (@lg/art `minimapColors`, D-839).
// T9 SEAM: quién falta visitar sale de `pendingNpcs` con los completados del store; cuando el servidor mande una
// instantánea de progreso, esa lista llega de ahí y este modelo no cambia.
import { yawDelta, normalizeYaw } from "../camera";
import type { Point } from "../movement";
import type { DioramaGround } from "./diorama";

type Vec2 = readonly [number, number];

/** Números del minimapa (mockup V6 `fixture.js` MINIMAP y `main.js` updateMinimap). */
export const MINIMAP = {
  /** Metros del centro al borde del círculo. */
  radiusM: 60,
  /** Lado del minimapa en píxeles CSS a escala de texto 100 % (escritorio y teléfono). */
  sizePx: { desktop: 160, phone: 112 },
  /** El anillo donde se clavan los NPCs lejanos, como fracción del radio en píxeles (deja entera la flecha). */
  ringFraction: 0.88,
  /** Redibujo a lo sumo cada 100 ms (AC56: 10 por segundo), fuera del bucle de render de three. */
  redrawMs: 100,
  /** Suavizado del giro (1/s): de un redibujo al siguiente recorre 1 - e^(-1,2) = 70 % de lo que falta. */
  yawEasePerS: 12,
  /** Un camino o un río entra si algún punto cae a menos de esto (en radios) más su ancho. */
  shapeCullRadii: 1.5,
} as const;

export interface MinimapNpc {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface MinimapMarker {
  id: string;
  name: string;
  /** Píxeles del minimapa (origen arriba a la izquierda). */
  x: number;
  y: number;
  /** Distancia real al jugador (m). */
  distanceM: number;
  /** Más lejos que el anillo: clavado en el anillo, se dibuja como flecha. */
  edge: boolean;
  /** Hacia dónde está, en grados horarios desde arriba (la flecha del borde gira esto). */
  bearingDeg: number;
}

export interface MinimapLine {
  widthPx: number;
  points: Vec2[];
}

export interface MinimapModel {
  sizePx: number;
  /** Centro (el jugador), radio del círculo y anillo de los marcadores, en píxeles. */
  center: number;
  radiusPx: number;
  ringPx: number;
  pxPerM: number;
  /** Yaw con el que se proyectó (arriba = adelante de ese yaw). */
  yawDeg: number;
  /** El jugador (el centro), en metros del mundo. */
  player: Point;
  markers: MinimapMarker[];
  roads: MinimapLine[];
  rivers: MinimapLine[];
  ponds: Vec2[][];
  /** Los límites del diorama como polígono de 4 esquinas (o null sin límites). */
  bounds: Vec2[] | null;
}

export interface MinimapInput {
  player: Point;
  yawDeg: number;
  npcs: readonly MinimapNpc[];
  sizePx: number;
  radiusM?: number;
  ground?: Pick<DioramaGround, "paths" | "rivers" | "ponds"> | null;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

const RAD = Math.PI / 180;

/** Proyector del mundo al minimapa: adelante del yaw va arriba, la derecha de la cámara va a la derecha. */
function projector(player: Point, yawDeg: number, center: number, pxPerM: number): (x: number, z: number) => Vec2 {
  const s = Math.sin(yawDeg * RAD);
  const c = Math.cos(yawDeg * RAD);
  // Adelante = (-sen, -cos) y derecha = (cos, -sen): las mismas de `screenDirToWorld` en camera.ts.
  return (x, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    const forward = -dx * s - dz * c;
    const right = dx * c - dz * s;
    return [center + right * pxPerM, center - forward * pxPerM];
  };
}

/** Lo que dibuja el minimapa en este cuadro. Puro: mismas entradas, mismos píxeles. */
export function minimapModel(input: MinimapInput): MinimapModel {
  const radiusM = input.radiusM ?? MINIMAP.radiusM;
  const sizePx = input.sizePx;
  const center = sizePx / 2;
  const radiusPx = sizePx / 2;
  const ringPx = radiusPx * MINIMAP.ringFraction;
  const pxPerM = radiusPx / radiusM;
  const yawDeg = normalizeYaw(input.yawDeg);
  const project = projector(input.player, yawDeg, center, pxPerM);

  const markers = input.npcs.map((n): MinimapMarker => {
    const [px, py] = project(n.x, n.z);
    const ox = px - center;
    const oy = py - center;
    const off = Math.hypot(ox, oy);
    const edge = off > ringPx;
    const k = edge ? ringPx / off : 1;
    return {
      id: n.id, name: n.name, x: center + ox * k, y: center + oy * k,
      distanceM: Math.hypot(n.x - input.player.x, n.z - input.player.z), edge,
      bearingDeg: off === 0 ? 0 : normalizeYaw(Math.atan2(ox, -oy) / RAD),
    };
  });

  const reach = radiusM * MINIMAP.shapeCullRadii;
  const near = (line: readonly { x: number; z: number }[], width: number): boolean =>
    line.some((p) => Math.hypot(p.x - input.player.x, p.z - input.player.z) <= reach + width);
  const lineOf = (l: { width: number; line: readonly { x: number; z: number }[] }): MinimapLine =>
    ({ widthPx: l.width * pxPerM, points: l.line.map((p) => project(p.x, p.z)) });
  const ground = input.ground ?? null;
  const b = input.bounds ?? null;
  return {
    sizePx, center, radiusPx, ringPx, pxPerM, yawDeg, player: { x: input.player.x, z: input.player.z }, markers,
    roads: (ground?.paths ?? []).filter((p) => near(p.line, p.width)).map(lineOf),
    rivers: (ground?.rivers ?? []).filter((r) => near(r.line, r.width)).map(lineOf),
    ponds: (ground?.ponds ?? []).filter((poly) => near(poly.map(([x, z]) => ({ x, z })), 0)).map((poly) => poly.map(([x, z]) => project(x, z))),
    bounds: b ? [project(b.minX, b.minZ), project(b.maxX, b.minZ), project(b.maxX, b.maxZ), project(b.minX, b.maxZ)] : null,
  };
}

/** Los NPCs del diorama que faltan visitar, en el orden del layout (un completado que no está en el diorama no cuenta). */
export function pendingNpcs<T extends { id: string }>(npcs: readonly T[], completed: readonly string[]): T[] {
  const done = new Set(completed);
  return npcs.filter((n) => !done.has(n.id));
}

/**
 * Giro del minimapa de un redibujo al siguiente: suavizado exponencial hacia el yaw de la cámara por el camino corto;
 * con "reducir movimiento" (o sin giro previo) corta al yaw pedido, sin animación.
 */
export function stepMinimapYaw(prevDeg: number | null, targetDeg: number, dtS: number, reduceMotion: boolean): number {
  const target = normalizeYaw(targetDeg);
  if (reduceMotion || prevDeg === null || !Number.isFinite(prevDeg)) return target;
  const d = yawDelta(prevDeg, target);
  const k = 1 - Math.exp(-MINIMAP.yawEasePerS * Math.max(0, dtS));
  const next = normalizeYaw(prevDeg + d * k);
  // Al llegar (menos de una centésima de grado) se queda en el pedido: el redibujo se puede saltear.
  return Math.abs(yawDelta(next, target)) < 0.01 ? target : next;
}
