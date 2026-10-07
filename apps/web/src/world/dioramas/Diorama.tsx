// world/dioramas/Diorama.tsx — dibuja el diorama que el store cargó (capas de tiles, cajas, NPCs) y recibe los
// clics: el suelo → `moveTo`, un NPC → `interact`. Los clics entran como acciones semánticas por state/bridge.ts
// (R3: nada de eventos del DOM; R10: el mismo traductor del núcleo que usa services/input).
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import type { DioramaRuntime } from "@lg/core";
import { bridge } from "../../state/bridge";
import type { MapActor } from "../../state/selectors";
import { Boxes } from "../props/Boxes";
import { Billboard, type SpritePose } from "../sprites/Billboard";
import { drawSpriteSheet, NPC_PALETTES, type SpritePalette } from "../sprites/sheet";
import { TileLayers } from "../tiles/TileLayers";

interface Props {
  diorama: DioramaRuntime;
  actors: readonly MapActor[];
  pitchDeg: number;
  yawDeg: number;
}

function Npc({ actor, index, pitchDeg, yawDeg }: { actor: MapActor; index: number; pitchDeg: number; yawDeg: number }) {
  const sheet = useMemo(() => drawSpriteSheet(NPC_PALETTES[index % NPC_PALETTES.length] as SpritePalette), [index]);
  const pose = useMemo((): (() => SpritePose) => {
    const still = { x: actor.x, z: actor.z, vx: 0, vz: 0 };
    return () => still;
  }, [actor.x, actor.z]);
  const onSelect = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation(); // el suelo de atrás no recibe el mismo clic
    bridge.pointer({ kind: "interactable", id: actor.id }, e.nativeEvent.button);
  };
  return <Billboard sheet={sheet} pitchDeg={pitchDeg} yawDeg={yawDeg} pose={pose} onSelect={onSelect} />;
}

export function Diorama({ diorama, actors, pitchDeg, yawDeg }: Props) {
  const { minX, maxX, minZ, maxZ } = diorama.bounds;
  const onGround = (e: ThreeEvent<MouseEvent>): void => {
    bridge.pointer({ kind: "ground", x: e.point.x, z: e.point.z }, e.nativeEvent.button);
  };
  return (
    <group>
      {/* Plano invisible para el raycast del suelo: más barato que hacer raycast contra cada chunk. */}
      <mesh position={[(minX + maxX) / 2, 0, (minZ + maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} onClick={onGround}>
        <planeGeometry args={[maxX - minX, maxZ - minZ]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <TileLayers layers={diorama.layers} />
      <Boxes boxes={diorama.boxes} />
      {actors.map((a, i) => <Npc key={a.id} actor={a} index={i} pitchDeg={pitchDeg} yawDeg={yawDeg} />)}
    </group>
  );
}
