// world/props/ModelProps.tsx: dibuja los props `modelo/*` del diorama (plan estetica-c M2) cuando su .glb termina de
// bajar. La huella ya bloquea la grilla desde el layout (dato), así que el juego no espera al modelo: si la carga falla,
// el prop no se ve, se avisa por consola y nada más se rompe.
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
      {slots.map((s) => <ModelProp key={`${s.asset}@${s.x},${s.z}`} slot={s} />)}
    </group>
  );
}
