// world/budget/renderStats.ts — real renderer counters for the director-mode snapshot (plan estetica-c
// M6): calls, triangles, textures and geometries from `renderer.info`, and the measured FPS, so the operator and the assistant can measure
// without an automated browser (D-016). DEVELOPMENT ONLY: GameCanvas loads it with import() under the director mode's
// double key (`import.meta.env.DEV && VITE_LG_DIRECTOR === "1"`) and boot/dev.ts reads the last sample; in `vite build` the
// branch is eliminated and this module is not emitted (check:dev-only fails if its marker appears in a dist).
//
// A frame can have several passes (`high` shadow, EffectComposer): with `autoReset` off, `info.render` adds up
// all those of the frame; the probe reads the whole previous frame when the next one starts and only then zeroes it.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

/** Development-only marker (check:dev-only looks for it in the dist). */
export const RENDER_STATS_MARKER = "__lg_director:render-stats";

/** FPS sample window. */
export const SAMPLE_WINDOW_MS = 1000;

export interface RenderStatsSample {
  /** Draw calls of the last complete frame (all its passes). */
  drawCalls: number;
  /** Triangles of the last complete frame (all its passes). */
  triangles: number;
  /** Textures and geometries alive on the GPU. */
  textures: number;
  geometries: number;
  /** Frames per second drawn in the last window (with the frame cap applied). */
  fps: number;
}

/** What is read from `WebGLRenderer.info` (injectable in the tests). */
export interface RendererInfoLike {
  render: { calls: number; triangles: number };
  memory: { textures: number; geometries: number };
}

/** A sample from what was accumulated in a frame and the frames counted in the window. */
export function sampleRenderStats(info: RendererInfoLike, frames: number, windowMs: number): RenderStatsSample {
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    fps: windowMs > 0 ? Math.round((frames * 1000 * 10) / windowMs) / 10 : 0,
  };
}

let latest: RenderStatsSample | null = null;

/** The last sample (null if the canvas has not drawn yet). Director mode reads it through boot/dev.ts. */
export const readRenderStats = (): RenderStatsSample | null => latest;

/** The probe: goes inside the <Canvas>; runs before everything else each frame (very negative priority). */
export default function RenderStatsProbe() {
  const gl = useThree((s) => s.gl);
  const win = useRef({ start: 0, frames: 0, fps: 0 });
  useEffect(() => {
    const prev = gl.info.autoReset;
    gl.info.autoReset = false;
    gl.info.reset();
    // The marker stays in the canvas DOM: if this module ever reached a build, check:dev-only finds it in the dist.
    gl.domElement.setAttribute("data-lg-render-stats", RENDER_STATS_MARKER);
    return () => {
      gl.info.autoReset = prev;
      gl.domElement.removeAttribute("data-lg-render-stats");
      latest = null;
    };
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    const w = win.current;
    if (w.start === 0) w.start = now;
    w.frames += 1;
    if (now - w.start >= SAMPLE_WINDOW_MS) {
      w.fps = sampleRenderStats(gl.info, w.frames, now - w.start).fps;
      w.start = now;
      w.frames = 0;
    }
    // What is accumulated is the whole previous frame (all its passes): it is saved and zeroed for this one.
    latest = { ...sampleRenderStats(gl.info, 0, 0), fps: w.fps };
    gl.info.reset();
  }, -1000);
  return null;
}
