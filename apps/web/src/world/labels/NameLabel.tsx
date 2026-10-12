// world/labels/NameLabel.tsx — un chip de nombre sobre la cabeza de un NPC (plan estetica-c M1 ítem 14): Sprite de
// tamaño constante en pantalla y siempre visible (sin depth test). Se rehace solo si cambian el nombre o el resaltado.
import { useEffect, useMemo } from "react";
import { createNameLabel, disposeNameLabel } from "./labelSprite";

export function NameLabel({ name, highlighted, x, y, z }: { name: string; highlighted: boolean; x: number; y: number; z: number }) {
  const sprite = useMemo(() => createNameLabel(name, highlighted), [name, highlighted]);
  useEffect(() => () => disposeNameLabel(sprite), [sprite]);
  return <primitive object={sprite} position={[x, y, z]} />;
}
