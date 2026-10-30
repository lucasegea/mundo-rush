// world/dioramas/Diorama.tsx — dibuja el diorama que el store cargó en el look C (plan estetica-c M1): el grafo
// estático de scene.ts (terreno, agua, props, árboles, detalle), los modelos glTF del pipeline (M2), los NPCs (personajes con esqueleto desde M3) con su etiqueta de nombre y las
// sombras blob. Recibe los clics: el suelo → `moveTo`, un NPC → `interact`. Los clics entran como acciones semánticas
// por state/bridge.ts (R3: nada de eventos del DOM; R10: el mismo traductor del núcleo que usa services/input).
// Plan estetica-c M6: los NPCs usan el cuerpo de la densidad del tier y, con una escena de conversación arriba (`frozen`),
// el agua y las burbujas quedan quietas y solo se animan el jugador y el NPC de la escena (`animatedOnly`).
// Open-world-3d T6 (D-819, D-823): con relieve, el clic del suelo cae en la malla (el selector de scene.ts), los
// personajes, etiquetas, burbujas y sombras se apoyan en `heightAt`, el suelo baja sus mapas .ktx2 con el renderer y el
// cielo sigue a la cámara.
// Open-world-3d T7b (D-840): los personajes toman esqueleto y accesorios del look de la escena (`scene.look`); el
// relieve (que hay selector del suelo) decide solo la forma del terreno: apoyo de actores, cielo y naturaleza.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import type { SceneDensity, WorldLook } from "@lg/art";
import type { DioramaRuntime } from "@lg/core";
import { bridge, LOOK_DRAG_PX } from "../../state/bridge";
import type { MapActor, SceneActivityView } from "../../state/selectors";
import { AnimationGovernor } from "../actors/AnimationGovernor";
import { BlobShadows } from "../actors/BlobShadows";
import { Character, type ActorPose } from "../actors/Character";
import { LABEL_HEIGHT } from "../actors/chibiModel";
import { fallbackLook } from "../actors/looks";
import { Beacons } from "../labels/Beacons";
import { labelEntries } from "../labels/labels";
import { NameLabel } from "../labels/NameLabel";
import { RequestBubble } from "../labels/RequestBubble";
import { ModelProps } from "../props/ModelProps";
import { cameraLook, followTarget, grassBedView, worldGround, worldRenderer } from "../runtime";
import { tickWater, waterMaterial } from "../water/waterMaterial";
import { ACTOR_LIFT, type DioramaScene } from "./scene";

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
  /** Open-world-3d T5: t de zoom (cuantizado); pasado LABEL_HIDE_T solo queda la etiqueta resaltada. */
  zoomT?: number;
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

/**
 * Open-world-3d T4 (D-820, AC20): R3F dispara `click` también al soltar un arrastre; `event.delta` (píxeles entre el
 * apretar y el soltar) mayor que LOOK_DRAG_PX fue una mirada y no camina ni interactúa. El umbral es el único del núcleo.
 */
export function isDragClick(delta: number): boolean {
  return delta > LOOK_DRAG_PX;
}

/** Clic sobre el suelo → `moveTo` por el puente (o nada, si fue un arrastre de mirada). */
export function onGroundClick(e: { delta: number; point: { x: number; z: number }; nativeEvent: { button: number } }): void {
  if (isDragClick(e.delta)) return;
  bridge.pointer({ kind: "ground", x: e.point.x, z: e.point.z }, e.nativeEvent.button);
}

/** A menos de esto el NPC gira cabeza y cuerpo hacia el jugador (propuesta C §3). */
const LOOK_AT_PLAYER_M = 6;

function Npc({ actor, cut, activity, lod, cast, openWorld }: {
  actor: MapActor; cut: boolean; activity: SceneActivityView; lod: SceneDensity; cast: WorldLook["characters"]; openWorld: boolean;
}) {
  const pose = useMemo((): (() => ActorPose) => {
    return () => {
      const near = followTarget.ready && Math.hypot(followTarget.x - actor.x, followTarget.z - actor.z) < LOOK_AT_PLAYER_M;
      return { x: actor.x, z: actor.z, speed: 0, yaw: near ? Math.atan2(followTarget.x - actor.x, followTarget.z - actor.z) : null };
    };
  }, [actor.x, actor.z]);
  const onSelect = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation(); // el suelo de atrás no recibe el mismo clic
    if (isDragClick(e.delta)) return;
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
      // Open-world-3d T7b (D-840): el esqueleto es el del look; la regla de distancia (AC47) es del mundo abierto.
      cast={cast}
      distanceRules={openWorld}
    />
  );
}

function WaterClock({ look, reduceMotion }: { look: WorldLook; reduceMotion: boolean }) {
  useFrame((_, delta) => tickWater(waterMaterial(look), delta, reduceMotion));
  return null;
}

/** Altura de las etiquetas y burbujas de un NPC: sobre la cabeza, apoyada en el suelo (open-world-3d T6, AC37). */
export const labelAnchorY = (heightAt: (x: number, z: number) => number, lift: number, x: number, z: number): number =>
  heightAt(x, z) + lift + LABEL_HEIGHT;

/**
 * El mundo abierto: el suelo baja sus mapas (si fallan, queda el color por vértice), el cielo sigue a la cámara, la
 * naturaleza (T7) baja sus mallas y mapas, hornea los impostores y sube por cuadro solo lo que se ve, y el pasto (T8) sube
 * las matas del disco que se ven cuando la vista cambió.
 */
function OpenWorld({ scene, still }: { scene: DioramaScene; still: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    worldRenderer.gl = gl;
    return () => {
      worldRenderer.gl = null;
    };
  }, [gl]);
  useEffect(() => {
    scene.ground?.loadMaps(gl).catch((e: unknown) => console.warn("suelo: sin mapas .ktx2, queda el color por vértice", e));
    scene.nature?.load(gl).catch((e: unknown) => console.warn("naturaleza: sin árboles ni rocas", e));
  }, [scene, gl]);
  useFrame(({ camera, scene: three }, delta) => {
    scene.sky?.follow(camera.position.x, camera.position.y, camera.position.z, delta, still);
    if (scene.nature && followTarget.ready) {
      const fog = three.fog as { far?: number } | null;
      scene.nature.update(camera, followTarget.x, followTarget.z, fog?.far ?? Infinity, delta, still, cameraLook.t);
    }
    // T8: el pasto con el t de zoom ya suavizado de CameraRig; su disco (la cama del suelo) queda en runtime para la Walk.
    if (scene.grass && followTarget.ready) {
      scene.grass.update(camera, followTarget.x, followTarget.z, cameraLook.t, delta, still);
      const b = scene.ground?.grassBed;
      if (b) Object.assign(grassBedView, { x: b.x, z: b.y, radius: b.z, on: b.w });
    }
  });
  return null;
}

export function Diorama({
  diorama,
  scene,
  actors,
  highlightId,
  sceneNpcId,
  viewDistance,
  zoomT = 0,
  cut,
  activity,
  maxAnimated,
  requestIds = [],
  animatedOnly = null,
  frozen = false,
  density = "full",
}: Props) {
  const { minX, maxX, minZ, maxZ } = diorama.bounds;
  const onGround = (e: ThreeEvent<MouseEvent>): void => onGroundClick(e);
  const labels = labelEntries(actors, highlightId, sceneNpcId, viewDistance, zoomT);
  const relief = scene.picker !== null;
  const lift = relief ? ACTOR_LIFT : 0;
  const heightAt = scene.terrain.heightAt;
  // Open-world-3d M3 (fuga de GPU al cambiar de tier, medida con perf:probe): la escena se libera acá, en la raíz de R3F,
  // y no en GameCanvas. El Canvas confirma sus hijos después de la raíz del DOM: liberada desde GameCanvas, la escena
  // vieja se dibujaba unos cuadros más con sus texturas ya liberadas, three las volvía a subir y nadie las borraba (los
  // mapas del suelo y las nubes de cada tier quedaban vivos). Acá la limpieza corre cuando la escena vieja ya salió.
  useEffect(() => () => scene.dispose(), [scene]);
  // Antes del primer cuadro: los personajes (también el jugador, montado fuera) leen este suelo.
  useLayoutEffect(() => {
    worldGround.heightAt = heightAt;
    worldGround.lift = lift;
    return () => {
      worldGround.heightAt = () => 0;
      worldGround.lift = 0;
    };
  }, [heightAt, lift]);
  return (
    <group>
      {scene.picker ? (
        <primitive object={scene.picker} onClick={onGround} />
      ) : (
        // Sin relieve, plano invisible para el raycast del suelo: dentro de los límites el terreno es plano en y = 0.
        <mesh position={[(minX + maxX) / 2, 0, (minZ + maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} onClick={onGround}>
          <planeGeometry args={[maxX - minX, maxZ - minZ]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      <primitive object={scene.root} />
      {relief ? <OpenWorld scene={scene} still={cut || frozen} /> : null}
      <ModelProps slots={scene.models} />
      <WaterClock look={scene.look} reduceMotion={cut || frozen} />
      <AnimationGovernor max={maxAnimated} only={animatedOnly} />
      {actors.map((a) => <Npc key={a.id} actor={a} cut={cut} activity={activity} lod={density} cast={scene.look.characters} openWorld={relief} />)}
      {labels.map((l) => {
        const a = actors.find((x) => x.id === l.id) as MapActor; // labelEntries sale de `actors`
        return <NameLabel key={l.id} name={l.name} highlighted={l.highlighted} x={a.x} y={labelAnchorY(heightAt, lift, a.x, a.z)} z={a.z} />;
      })}
      {requestIds.map((id) => {
        const a = actors.find((x) => x.id === id);
        return a ? <RequestBubble key={`pedido-${id}`} x={a.x} y={labelAnchorY(heightAt, lift, a.x, a.z)} z={a.z} still={cut || frozen} /> : null;
      })}
      <BlobShadows anchors={scene.blobAnchors} heightAt={heightAt} />
      <Beacons npcs={actors} heightAt={scene.terrain.heightAt} />
    </group>
  );
}
