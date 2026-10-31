// runtime/loadMarks.ts — world load marks (open-world-3d T10 (d), D-835, AC63). The probe (`perf:probe --build`)
// measures `lg:world-first-frame` minus `lg:world-enter`. Pure rules over an injected Performance (no DOM here):
// each mark goes once per page, and the first-frame one only after the entry one (the order is the contract
// of the measurement: a first frame without a click is not a measurable load).

export const LOAD_MARKS = {
  /** The click on "Explorar el mapa" in the menu. */
  worldEnter: "lg:world-enter",
  /** The world's first frame, with the shaders already compiled (compileAsync beforehand). */
  worldFirstFrame: "lg:world-first-frame",
} as const;

/** The minimum of `performance` that the marks use. */
export interface MarkSink {
  mark(name: string, options?: { detail?: unknown }): unknown;
  getEntriesByName(name: string): ArrayLike<unknown>;
}

/** What the first-frame mark carries (the probe reads it from `detail`). */
export interface FirstFrameDetail {
  /** `renderer.info.programs.length` after the first frame. */
  programs: number;
}

const marked = (perf: MarkSink, name: string): boolean => perf.getEntriesByName(name).length > 0;

/** Marks entry into the world (once per page). Returns whether it marked. Without `performance`, nothing. */
export function markWorldEnter(perf: MarkSink | undefined): boolean {
  if (!perf || marked(perf, LOAD_MARKS.worldEnter)) return false;
  perf.mark(LOAD_MARKS.worldEnter);
  return true;
}

/** Marks the world's first frame: once, and only if there was already an entry. Returns whether it marked. */
export function markWorldFirstFrame(perf: MarkSink | undefined, detail: FirstFrameDetail): boolean {
  if (!perf || !marked(perf, LOAD_MARKS.worldEnter) || marked(perf, LOAD_MARKS.worldFirstFrame)) return false;
  perf.mark(LOAD_MARKS.worldFirstFrame, { detail });
  return true;
}
