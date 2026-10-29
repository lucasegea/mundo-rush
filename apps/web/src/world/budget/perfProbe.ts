// world/budget/perfProbe.ts — gancho de la sonda de rendimiento (open-world-3d T2(g), D-833, AC58). SOLO DESARROLLO:
// GameCanvas lo carga con import() bajo la doble llave `import.meta.env.DEV && VITE_LG_PERF_PROBE === "1"` (la que pone
// scripts/dev/perf-probe.ts al levantar su propio Vite); en `vite build` la rama se elimina y este módulo no se emite
// (check:dev-only busca su marcador en el dist, también en el build con las variables puestas).
//
// Bajo la misma llave el canvas corre sin tope (frameloop "always", FrameRegulator desmontado; canvasLoop en
// frameRate.ts), y este gancho deja en `globalThis.__lgPerfProbe` lo que la sonda mide: los tiempos entre cuadros, los
// contadores de `renderer.info` del último cuadro completo (todas sus pasadas), los programas compilados, el modo de
// frameloop de R3F y cuántos FrameRegulator hay montados (tiene que ser 0).
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { frameRegulatorsMounted } from "../FrameRegulator";

/** Marcador de solo-desarrollo (check:dev-only lo busca en el dist). */
export const PERF_PROBE_MARKER = "__lg_director:perf-probe";
/** Nombre del gancho en globalThis. */
export const PERF_PROBE_GLOBAL = "__lgPerfProbe";
/** Tope del anillo de tiempos (a 1.000 FPS, 60 s). */
const MAX_FRAMES = 60_000;

export interface PerfCounters {
  calls: number;
  triangles: number;
  programs: number;
  textures: number;
  geometries: number;
}

export interface PerfProbeApi {
  marker: string;
  /** "always" en modo sin tope. */
  frameloop: () => string;
  /** FrameRegulator montados ahora (0 en modo sin tope). */
  regulators: () => number;
  /** Contadores del último cuadro completo. */
  counters: () => PerfCounters;
  /** Tiempos entre cuadros (ms) desde el último `resetFrames`. */
  frameTimes: () => number[];
  /** Milisegundos (reloj de la página) desde el último `resetFrames`. */
  sinceReset: () => number;
  resetFrames: () => void;
}

export default function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const state = useRef({ last: 0, resetAt: 0, times: [] as number[], counters: { calls: 0, triangles: 0, programs: 0, textures: 0, geometries: 0 } as PerfCounters });
  useEffect(() => {
    const prev = gl.info.autoReset;
    gl.info.autoReset = false;
    gl.info.reset();
    gl.domElement.setAttribute("data-lg-perf-probe", PERF_PROBE_MARKER);
    const api: PerfProbeApi = {
      marker: PERF_PROBE_MARKER,
      frameloop: () => get().frameloop,
      regulators: frameRegulatorsMounted,
      counters: () => ({ ...state.current.counters }),
      frameTimes: () => [...state.current.times],
      sinceReset: () => performance.now() - state.current.resetAt,
      resetFrames: () => { state.current.times = []; state.current.last = 0; state.current.resetAt = performance.now(); },
    };
    Reflect.set(globalThis, PERF_PROBE_GLOBAL, api);
    return () => {
      gl.info.autoReset = prev;
      gl.domElement.removeAttribute("data-lg-perf-probe");
      Reflect.deleteProperty(globalThis, PERF_PROBE_GLOBAL);
    };
  }, [gl, get]);
  useFrame(() => {
    const s = state.current;
    const now = performance.now();
    if (s.last !== 0 && s.times.length < MAX_FRAMES) s.times.push(now - s.last);
    s.last = now;
    // Lo acumulado es el cuadro anterior entero (todas sus pasadas): se guarda y se pone en cero para este.
    s.counters = {
      calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length ?? 0,
      textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
    };
    gl.info.reset();
  }, -1000);
  return null;
}
