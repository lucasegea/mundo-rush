// world/labels/RequestBubble.tsx: the amber request bubble over an NPC (plan estetica-c M5). It floats with useFrame
// (no React re-render); with "reduce motion" (`still`) it stays still.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { bubbleCenterY, createRequestBubble, disposeRequestBubble } from "./bubbleSprite";

export function RequestBubble({ x, y, z, still }: { x: number; y: number; z: number; still: boolean }) {
  const sprite = useMemo(() => createRequestBubble(), []);
  useEffect(() => () => disposeRequestBubble(sprite), [sprite]);
  useFrame(({ clock }) => {
    sprite.center.y = bubbleCenterY(clock.elapsedTime, still);
  });
  return <primitive object={sprite} position={[x, y, z]} />;
}
