// world/FrameRegulator.tsx — aplica el tope de cuadros (plan estetica-c M6, frameRate.ts): con el canvas en
// frameloop="demand", en cada cuadro del navegador decide si venció el plazo y, si venció, pide uno con invalidate(). R3F
// lo dibuja en el cuadro siguiente; el `delta` de useFrame es el tiempo real entre cuadros dibujados, así la animación
// sigue a su velocidad aunque el tope baje los cuadros.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { frameDue, nextDeadline } from "./frameRate";

export function FrameRegulator({ maxFps }: { maxFps: number }) {
  const invalidate = useThree((s) => s.invalidate);
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
