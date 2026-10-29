// world/actors/glide.ts — suavizado visual de un salto de la pose lógica (plan estetica-c M1 ítem 4, revisión de arquitectura 2026-10-12):
// al empezar la charla el núcleo deja al jugador a 2,6 m del NPC de golpe (position = previous); world/ lo lleva ahí
// desde la última posición dibujada en ~0,35 s. Con "reducir movimiento" corta. Un paso normal (< 0,6 m) no desliza.
export const GLIDE_SEC = 0.35;
/** Más que esto entre lo dibujado y lo lógico es un salto (un paso a 30 Hz mueve ~0,13 m). */
export const GLIDE_JUMP = 0.6;

export interface Spot {
  x: number;
  z: number;
}

export interface GlideState {
  shown: Spot;
  /** Desde dónde se desliza y cuánto va (0 a 1); null sin deslizamiento. */
  glide: { from: Spot; t: number } | null;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Un cuadro: dónde se dibuja, dado lo lógico. */
export function stepGlide(s: GlideState, logical: Spot, dtSec: number, cut: boolean): GlideState {
  if (cut) return { shown: logical, glide: null };
  let glide = s.glide;
  if (!glide && Math.hypot(logical.x - s.shown.x, logical.z - s.shown.z) > GLIDE_JUMP) glide = { from: s.shown, t: 0 };
  if (!glide) return { shown: logical, glide: null };
  const t = Math.min(1, glide.t + dtSec / GLIDE_SEC);
  const k = ease(t);
  const shown = { x: glide.from.x + (logical.x - glide.from.x) * k, z: glide.from.z + (logical.z - glide.from.z) * k };
  return { shown, glide: t >= 1 ? null : { from: glide.from, t } };
}
