// world/labels/NameLabel.tsx — a name chip above an NPC head (plan estetica-c M1 item 14): Sprite of
// constant screen size and always visible (no depth test). It rebuilds itself only if the name or the highlight change.
import { useEffect, useMemo } from "react";
import { createNameLabel, disposeNameLabel } from "./labelSprite";

export function NameLabel({ name, highlighted, x, y, z }: { name: string; highlighted: boolean; x: number; y: number; z: number }) {
  const sprite = useMemo(() => createNameLabel(name, highlighted), [name, highlighted]);
  useEffect(() => () => disposeNameLabel(sprite), [sprite]);
  return <primitive object={sprite} position={[x, y, z]} />;
}
