// runtime/loadMarks.ts — marcas de carga del mundo (open-world-3d T10 (d), D-835, AC63). La sonda (`perf:probe --build`)
// mide `lg:world-first-frame` menos `lg:world-enter`. Reglas puras sobre una Performance inyectada (sin DOM acá):
// cada marca va una sola vez por página, y la del primer cuadro solo después de la de entrada (el orden es el contrato
// de la medida: un primer cuadro sin clic no es una carga medible).

export const LOAD_MARKS = {
  /** El clic en "Explorar el mapa" del menú. */
  worldEnter: "lg:world-enter",
  /** El primer cuadro del mundo, con los sombreadores ya compilados (compileAsync antes). */
  worldFirstFrame: "lg:world-first-frame",
} as const;

/** Lo mínimo de `performance` que usan las marcas. */
export interface MarkSink {
  mark(name: string, options?: { detail?: unknown }): unknown;
  getEntriesByName(name: string): ArrayLike<unknown>;
}

/** Lo que lleva la marca del primer cuadro (la sonda lo lee de `detail`). */
export interface FirstFrameDetail {
  /** `renderer.info.programs.length` después del primer cuadro. */
  programs: number;
}

const marked = (perf: MarkSink, name: string): boolean => perf.getEntriesByName(name).length > 0;

/** Marca la entrada al mundo (una vez por página). Devuelve si marcó. Sin `performance`, nada. */
export function markWorldEnter(perf: MarkSink | undefined): boolean {
  if (!perf || marked(perf, LOAD_MARKS.worldEnter)) return false;
  perf.mark(LOAD_MARKS.worldEnter);
  return true;
}

/** Marca el primer cuadro del mundo: una vez, y solo si ya hubo entrada. Devuelve si marcó. */
export function markWorldFirstFrame(perf: MarkSink | undefined, detail: FirstFrameDetail): boolean {
  if (!perf || !marked(perf, LOAD_MARKS.worldEnter) || marked(perf, LOAD_MARKS.worldFirstFrame)) return false;
  perf.mark(LOAD_MARKS.worldFirstFrame, { detail });
  return true;
}
