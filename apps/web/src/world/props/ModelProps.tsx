// world/props/ModelProps.tsx: draws the diorama `modelo/*` props (plan estetica-c M2) once their .glb finishes
// downloading. The footprint already blocks the grid from the layout (data), so the game does not wait for the model: if loading fails,
// the prop is not seen, a console warning is given and nothing else breaks.
import { useEffect, useState } from "react";
import type { Object3D } from "three";
import { fitToBox, loadModel, type ModelBox } from "./gltf";

export interface ModelSlot extends ModelBox {
  asset: string;
}

function ModelProp({ slot }: { slot: ModelSlot }) {
  const [model, setModel] = useState<Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    loadModel(slot.asset)
      .then((m) => { if (alive) setModel(fitToBox(m, slot)); })
      .catch((e: unknown) => console.error(`modelo ${slot.asset}: no se pudo cargar`, e));
    return () => { alive = false; };
  }, [slot]);
  return model ? <primitive object={model} /> : null;
}

export function ModelProps({ slots }: { slots: readonly ModelSlot[] }) {
  return (
    <group name="modelos">
      {slots.map((s) => <ModelProp key={`${s.asset}@${s.x},${s.z},${s.rotY ?? 0}`} slot={s} />)}
    </group>
  );
}
