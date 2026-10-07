// Interactuables cercanos (03 §2.4 #5): radio de interacción por entidad. El núcleo los calcula; world/ nunca
// escribe `nearbyInteractables` (lo lee la UI para el aviso "E para hablar" y la lista accesible).
import type { Point } from "./grid";

export interface Interactable {
  id: string;
  kind: "npc" | "object";
  x: number;
  z: number;
  /** Radio de interacción, m. */
  radius: number;
}

/** Radio por defecto si el layout no fija uno: un poco más de un tile. */
export const DEFAULT_INTERACT_RADIUS = 1.5;

/** Ids al alcance, del más cercano al más lejano (desempate por id: determinístico). */
export function nearbyInteractables(p: Point, items: readonly Interactable[]): string[] {
  return items
    .map((it) => ({ id: it.id, d: Math.hypot(it.x - p.x, it.z - p.z), r: it.radius }))
    .filter((e) => e.d <= e.r)
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => e.id);
}

/** ¿Dos listas de ids son iguales? (evita notificar al store en cada paso) */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
