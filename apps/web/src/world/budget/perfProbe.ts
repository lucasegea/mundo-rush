// world/budget/perfProbe.ts — performance probe hook (open-world-3d T2(g), D-833, AC58). DEVELOPMENT ONLY:
// GameCanvas loads it with import() under the double key `import.meta.env.DEV && VITE_LG_PERF_PROBE === "1"` (the one set by
// scripts/dev/perf-probe.ts when it starts its own Vite); in `vite build` the branch is eliminated and this module is not emitted
// (check:dev-only looks for its marker in the dist, also in the build with the variables set).
//
// Under the same key the canvas runs uncapped (frameloop "always", FrameRegulator unmounted; canvasLoop in
// frameRate.ts), and this hook leaves in `globalThis.__lgPerfProbe` what the probe measures: the times between frames, the
// `renderer.info` counters of the last complete frame (all its passes), the compiled programs, the R3F
// frameloop mode and how many FrameRegulators are mounted (must be 0).
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { frameRegulatorsMounted } from "../FrameRegulator";

/** Development-only marker (check:dev-only looks for it in the dist). */
export const PERF_PROBE_MARKER = "__lg_director:perf-probe";
/** Name of the hook on globalThis. */
export const PERF_PROBE_GLOBAL = "__lgPerfProbe";
/** Cap of the timing ring (at 1,000 FPS, 60 s). */
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
  /** "always" in uncapped mode. */
  frameloop: () => string;
  /** FrameRegulators mounted now (0 in uncapped mode). */
  regulators: () => number;
  /** Counters of the last complete frame. */
  counters: () => PerfCounters;
  /** Times between frames (ms) since the last `resetFrames`. */
  frameTimes: () => number[];
  /** Milliseconds (page clock) since the last `resetFrames`. */
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
    // What is accumulated is the whole previous frame (all its passes): it is saved and zeroed for this one.
    s.counters = {
      calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length ?? 0,
      textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
    };
    gl.info.reset();
  }, -1000);
  return null;
}
