// services/simulation — lazo de paso fijo (03 §2.4 #4, R7): a 30 Hz, independiente del framerate, despacha
// `simulationStep` mientras el mapa se juega. El render (world/) interpola entre pasos en refs; el store solo ve
// la posición lógica. Reloj y planificador inyectables: los tests avanzan el tiempo a mano.
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
  /** ¿El mapa se está jugando? Si no, el lazo no acumula tiempo (al volver no hay un salto). */
  isActive(): boolean;
  scheduler?: FrameScheduler;
}

/** Arranca el lazo. Devuelve la función que lo detiene. */
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
