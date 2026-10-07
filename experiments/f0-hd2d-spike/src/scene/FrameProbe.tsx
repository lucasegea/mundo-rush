import { PerformanceMonitor } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { runtime } from "./runtime";

/**
 * Collects frame times, first-frame time and renderer counters into `runtime`; hosts drei's
 * PerformanceMonitor. gl.info is reset manually once per frame so the counters cover every pass
 * (the EffectComposer renders several).
 */
export function FrameProbe({ onDecline }: { onDecline: () => void }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);

  useEffect(() => {
    gl.info.autoReset = false;
    return () => void (gl.info.autoReset = true);
  }, [gl]);

  useFrame((_, delta) => {
    frames.current += 1;
    // useFrame runs before the render: on the 2nd call the 1st frame has been drawn.
    if (frames.current === 2 && runtime.firstFrameAtMs === null) runtime.firstFrameAtMs = performance.now();
    if (frames.current > 2) runtime.sampler.push(delta * 1000);
    runtime.drawCalls = gl.info.render.calls;
    runtime.triangles = gl.info.render.triangles;
    gl.info.reset();
  });

  return (
    <PerformanceMonitor
      onChange={({ factor }) => void (runtime.perf.factor = factor)}
      onIncline={() => {
        runtime.perf.inclines += 1;
        runtime.perf.last = "incline";
      }}
      onDecline={() => {
        runtime.perf.declines += 1;
        runtime.perf.last = "decline";
        onDecline();
      }}
    />
  );
}
