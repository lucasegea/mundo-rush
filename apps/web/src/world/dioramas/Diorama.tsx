// world/dioramas/Diorama.tsx — dibuja el diorama que el store cargó en el look C (plan estetica-c M1): el grafo
// estático de scene.ts (terreno, agua, props, árboles, detalle), los modelos glTF del pipeline (M2), los NPCs (personajes con esqueleto desde M3) con su etiqueta de nombre y las
// sombras blob. Recibe los clics: el suelo → `moveTo`, un NPC → `interact`. Los clics entran como acciones semánticas
// por state/bridge.ts (R3: nada de eventos del DOM; R10: el mismo traductor del núcleo que usa services/input).
// Plan estetica-c M6: los NPCs usan el cuerpo de la densidad del tier y, con una escena de conversación arriba (`frozen`),
// el agua y las burbujas quedan quietas y solo se animan el jugador y el NPC de la escena (`animatedOnly`).
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import type { SceneDensity } from "@lg/art";
import type { DioramaRuntime } from "@lg/core";
import { bridge } from "../../state/bridge";
import type { MapActor, SceneActivityView } from "../../state/selectors";
import { AnimationGovernor } from "../actors/AnimationGovernor";
import { BlobShadows } from "../actors/BlobShadows";
import { Character, type ActorPose } from "../actors/Character";
import { LABEL_HEIGHT } from "../actors/chibiModel";
import { fallbackLook } from "../actors/looks";
import { labelEntries } from "../labels/labels";
import { NameLabel } from "../labels/NameLabel";
import { RequestBubble } from "../labels/RequestBubble";
import { ModelProps } from "../props/ModelProps";
import { followTarget } from "../runtime";
import { tickWater, waterMaterial } from "../water/waterMaterial";
import type { DioramaScene } from "./scene";

interface Props {
  diorama: DioramaRuntime;
  scene: DioramaScene;
  actors: readonly MapActor[];
  /** El NPC que va a responder a la E (de selectInteractionPrompt, el mismo del aviso del HUD). */
  highlightId: string | null;
  /** El NPC de la charla en curso: no muestra etiqueta. */
  sceneNpcId: string | null;
  /** Distancia pedida de la cámara (m): de lejos solo queda la etiqueta resaltada (D-208). */
  viewDistance: number;
  cut: boolean;
  /** Quién habla y quién escucha en la escena (la máquina de animación lo lee). */
  activity: SceneActivityView;
  /** Tope de personajes animados del tier (`maxAnimatedCharacters`). */
  maxAnimated: number;
  /** Plan estetica-c M5: los NPCs con burbuja ámbar de pedido (de selectRequestBubbles). */
  requestIds?: readonly string[];
  /** Plan estetica-c M6: durante la charla solo pueden animarse estos ids (animState.sceneAnimated); null = todos. */
  animatedOnly?: ReadonlySet<string> | null;
  /** Plan estetica-c M6 (03 §2.7.4): hay una escena de conversación arriba; el agua y lo de fondo quedan quietos. */
  frozen?: boolean;
  /** Densidad del tier: el cuerpo de los NPCs (el completo o el simplificado de `low`). */
  density?: SceneDensity;
}

/** A menos de esto el NPC gira cabeza y cuerpo hacia el jugador (propuesta C §3). */
const LOOK_AT_PLAYER_M = 6;

function Npc({ actor, cut, activity, lod }: { actor: MapActor; cut: boolean; activity: SceneActivityView; lod: SceneDensity }) {
  const pose = useMemo((): (() => ActorPose) => {
    return () => {
      const near = followTarget.ready && Math.hypot(followTarget.x - actor.x, followTarget.z - actor.z) < LOOK_AT_PLAYER_M;
      return { x: actor.x, z: actor.z, speed: 0, yaw: near ? Math.atan2(followTarget.x - actor.x, followTarget.z - actor.z) : null };
    };
  }, [actor.x, actor.z]);
  const onSelect = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation(); // el suelo de atrás no recibe el mismo clic
    bridge.pointer({ kind: "interactable", id: actor.id }, e.nativeEvent.button);
  };
  const mine = activity.npcId === actor.id;
  return (
    <Character
      id={actor.id}
      look={actor.look ?? fallbackLook(actor.id)}
      pose={pose}
      cut={cut}
      scene={mine ? activity.npc : null}
      gesture={mine && activity.greet ? "saludar" : null}
      onSelect={onSelect}
      lod={lod}
    />
  );
}

function WaterClock({ reduceMotion }: { reduceMotion: boolean }) {
  useFrame((_, delta) => tickWater(waterMaterial(), delta, reduceMotion));
  return null;
}

export function Diorama({
  diorama,
  scene,
  actors,
  highlightId,
  sceneNpcId,
  viewDistance,
  cut,
  activity,
  maxAnimated,
  requestIds = [],
  animatedOnly = null,
  frozen = false,
  density = "full",
}: Props) {
  const { minX, maxX, minZ, maxZ } = diorama.bounds;
  const onGround = (e: ThreeEvent<MouseEvent>): void => {
    bridge.pointer({ kind: "ground", x: e.point.x, z: e.point.z }, e.nativeEvent.button);
  };
  const labels = labelEntries(actors, highlightId, sceneNpcId, viewDistance);
  return (
    <group>
      {/* Plano invisible para el raycast del suelo: dentro de los límites el terreno es plano en y = 0. */}
      <mesh position={[(minX + maxX) / 2, 0, (minZ + maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} onClick={onGround}>
        <planeGeometry args={[maxX - minX, maxZ - minZ]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <primitive object={scene.root} />
      <ModelProps slots={scene.models} />
      <WaterClock reduceMotion={cut || frozen} />
      <AnimationGovernor max={maxAnimated} only={animatedOnly} />
      {actors.map((a) => <Npc key={a.id} actor={a} cut={cut} activity={activity} lod={density} />)}
      {labels.map((l) => {
        const a = actors.find((x) => x.id === l.id) as MapActor; // labelEntries sale de `actors`
        return <NameLabel key={l.id} name={l.name} highlighted={l.highlighted} x={a.x} y={LABEL_HEIGHT} z={a.z} />;
      })}
      {requestIds.map((id) => {
        const a = actors.find((x) => x.id === id);
        return a ? <RequestBubble key={`pedido-${id}`} x={a.x} y={LABEL_HEIGHT} z={a.z} still={cut || frozen} /> : null;
      })}
      <BlobShadows anchors={scene.blobAnchors} />
    </group>
  );
}
