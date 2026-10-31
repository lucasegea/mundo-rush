// world/FrameRegulator.tsx — applies the frame cap (plan estetica-c M6, frameRate.ts): with the canvas on
// frameloop="demand", on each browser frame it decides whether the deadline expired and, if so, requests one with invalidate(). R3F
// draws it on the next frame; useFrame's `delta` is the real time between drawn frames, so the animation
// keeps its speed even if the cap lowers the frames.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { frameDue, nextDeadline } from "./frameRate";

/** Regulators mounted now (open-world-3d T2(g)): the performance probe checks that without a cap it is 0. */
let mounted = 0;
export const frameRegulatorsMounted = (): number => mounted;

export function FrameRegulator({ maxFps }: { maxFps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    mounted += 1;
    return () => { mounted -= 1; };
  }, []);
  useEffect(() => {
    let raf = 0;
    let deadline = performance.now() + 1000 / maxFps;
    const tick = (now: number): void => {
      if (frameDue(now, deadline)) {
        deadline = nextDeadline(deadline, now, maxFps);
        invalidate();
      }
      raf = requestAnimationFrame(tick);
    };
    invalidate();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [maxFps, invalidate]);
  return null;
}
