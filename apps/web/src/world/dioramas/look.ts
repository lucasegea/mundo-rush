// world/dioramas/look.ts — el look de un diorama (open-world-3d T7b, D-839, D-840). Se resuelve UNA vez, al cargar el
// diorama (GameCanvas), y baja como parámetro a la escena, la luz, la niebla, el fondo, el agua y los personajes; ningún
// componente lo vuelve a deducir del relieve.
// T7b SEAM (diferido por el plan): cuando el manifiesto del universo nombre su look (`look`, con lector y validación),
// esto lo lee de ahí. Hasta entonces el catálogo tiene los dos looks que el juego dibuja en 0034931 y este es el único
// lugar donde `relieve` los elige: el mundo abierto (con relieve) toma DEFAULT_LOOK y los dioramas planos (campesino,
// la plaza de Galeano) el look C pintado de m7. Sin diorama (el canvas antes de cargar), el pintado: el fondo y la niebla
// de bruma de siempre.
import { DEFAULT_LOOK, PAINTED_LOOK, type WorldLook } from "@lg/art";
import type { DioramaRuntime } from "@lg/core";

export function lookForDiorama(diorama: Pick<DioramaRuntime, "ground"> | null): WorldLook {
  return diorama?.ground.terrain.relief === true ? DEFAULT_LOOK : PAINTED_LOOK;
}
