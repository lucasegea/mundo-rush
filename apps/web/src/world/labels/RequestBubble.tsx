// world/labels/RequestBubble.tsx: la burbuja ámbar de pedido sobre un NPC (plan estetica-c M5). Flota con useFrame
// (sin re-render de React); con "reducir movimiento" (`still`) queda quieta.
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
