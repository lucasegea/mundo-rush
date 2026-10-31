// services/simulation — fixed-step loop (03 §2.4 #4, R7): at 30 Hz, independent of framerate, dispatches
// `simulationStep` while the map is being played. Rendering (world/) interpolates between steps in refs; the store only sees
// the logical position. Clock and scheduler are injectable: tests advance time by hand.
import { fixedSteps } from "@lg/core";

export interface FrameScheduler {
  request(cb: (nowMs: number) => void): number;
  cancel(id: number): void;
}

export const browserScheduler = (): FrameScheduler => ({
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
});

export interface SimulationDeps {
  step(): void;
  /** Is the map being played? If not, the loop does not accumulate time (on return there is no jump). */
  isActive(): boolean;
  scheduler?: FrameScheduler;
}

/** Starts the loop. Returns the function that stops it. */
export function startSimulation(deps: SimulationDeps): () => void {
  const scheduler = deps.scheduler ?? browserScheduler();
  let accumulator = 0;
  let last: number | null = null;
  let handle = 0;
  let stopped = false;

  const frame = (now: number): void => {
    if (stopped) return;
    if (deps.isActive()) {
      const r = fixedSteps(accumulator, last === null ? 0 : (now - last) / 1000);
      accumulator = r.accumulator;
      for (let i = 0; i < r.steps; i++) deps.step();
      last = now;
    } else {
      accumulator = 0;
      last = null;
    }
    handle = scheduler.request(frame);
  };
  handle = scheduler.request(frame);
  return () => {
    stopped = true;
    scheduler.cancel(handle);
  };
}
