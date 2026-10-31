// world/dioramas/Diorama.tsx — draws the diorama the store loaded in look C (plan estetica-c M1): the static
// graph from scene.ts (terrain, water, props, trees, detail), the pipeline's glTF models (M2), the NPCs (skeleton characters since M3) with their name label and the
// blob shadows. It receives the clicks: the ground → `moveTo`, an NPC → `interact`. Clicks enter as semantic actions
// through state/bridge.ts (R3: no DOM events; R10: the same core translator that services/input uses).
// Plan estetica-c M6: the NPCs use the tier-density body and, with a conversation scene on top (`frozen`),
// the water and bubbles stay still and only the player and the scene's NPC animate (`animatedOnly`).
// Open-world-3d T6 (D-819, D-823): with relief, the ground click lands on the mesh (scene.ts's picker), the
// characters, labels, bubbles and shadows rest on `heightAt`, the ground downloads its .ktx2 maps with the renderer and the
// sky follows the camera.
// Open-world-3d T7b (D-840): the characters take skeleton and accessories from the scene's look (`scene.look`); the
// relief (which has a ground picker) decides only the terrain's shape: actor support, sky and nature.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import type { SceneDensity, WorldLook } from "@lg/art";
import type { DioramaRuntime } from "@lg/core";
import { bridge, LOOK_DRAG_PX } from "../../state/bridge";
import type { MapActor, SceneActivityView } from "../../state/selectors";
import { AnimationGovernor } from "../actors/AnimationGovernor";
import { usePrecompile } from "../budget/WorldLoad";
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
  /** The NPC that will answer E (from selectInteractionPrompt, the same as the HUD prompt). */
  highlightId: string | null;
  /** The NPC of the chat in progress: shows no label. */
  sceneNpcId: string | null;
  /** Requested camera distance (m): from afar only the highlighted label remains (D-208). */
  viewDistance: number;
  /** Open-world-3d T5: zoom t (quantized); past LABEL_HIDE_T only the highlighted label remains. */
  zoomT?: number;
  cut: boolean;
  /** Who speaks and who listens in the scene (the animation machine reads it). */
  activity: SceneActivityView;
  /** Cap of the tier's animated characters (`maxAnimatedCharacters`). */
  maxAnimated: number;
  /** Plan estetica-c M5: the NPCs with an amber request bubble (from selectRequestBubbles). */
  requestIds?: readonly string[];
  /** Plan estetica-c M6: during the chat only these ids may animate (animState.sceneAnimated); null = all. */
  animatedOnly?: ReadonlySet<string> | null;
  /** Plan estetica-c M6 (03 §2.7.4): there is a conversation scene on top; the water and the background stay still. */
  frozen?: boolean;
  /** Tier density: the NPCs' body (the full one or the simplified `low` one). */
  density?: SceneDensity;
}

/**
 * Open-world-3d T4 (D-820, AC20): R3F also fires `click` when releasing a drag; an `event.delta` (pixels between
 * press and release) greater than LOOK_DRAG_PX was a look and neither walks nor interacts. The threshold is the core's only one.
 */
export function isDragClick(delta: number): boolean {
  return delta > LOOK_DRAG_PX;
}

/** Click on the ground → `moveTo` through the bridge (or nothing, if it was a look drag). */
export function onGroundClick(e: { delta: number; point: { x: number; z: number }; nativeEvent: { button: number } }): void {
  if (isDragClick(e.delta)) return;
  bridge.pointer({ kind: "ground", x: e.point.x, z: e.point.z }, e.nativeEvent.button);
}

/** Within this the NPC turns head and body toward the player (proposal C §3). */
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
    e.stopPropagation(); // the ground behind does not receive the same click
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
      // Open-world-3d T7b (D-840): the skeleton is the look's; the distance rule (AC47) belongs to the open world.
      cast={cast}
      distanceRules={openWorld}
    />
  );
}

function WaterClock({ look, reduceMotion }: { look: WorldLook; reduceMotion: boolean }) {
  useFrame((_, delta) => tickWater(waterMaterial(look), delta, reduceMotion));
  return null;
}

/** Height of an NPC's labels and bubbles: above the head, resting on the ground (open-world-3d T6, AC37). */
export const labelAnchorY = (heightAt: (x: number, z: number) => number, lift: number, x: number, z: number): number =>
  heightAt(x, z) + lift + LABEL_HEIGHT;

/**
 * The open world: the ground downloads its maps (if they fail, the vertex color remains), the sky follows the camera, the
 * nature (T7) downloads its meshes and maps, bakes the impostors and uploads per frame only what is visible, and the grass (T8) uploads
 * the tufts of the disc that are visible when the view changed.
 */
function OpenWorld({ scene, still }: { scene: DioramaScene; still: boolean }) {
  const gl = useThree((s) => s.gl);
  const precompile = usePrecompile();
  useEffect(() => {
    worldRenderer.gl = gl;
    return () => {
      worldRenderer.gl = null;
    };
  }, [gl]);
  useEffect(() => {
    scene.ground?.loadMaps(gl).catch((e: unknown) => console.warn("suelo: sin mapas .ktx2, queda el color por vértice", e));
    // T10-integrate: nature's new programs compile before the walkthrough shows it.
    scene.nature?.load(gl, precompile).catch((e: unknown) => console.warn("naturaleza: sin árboles ni rocas", e));
  }, [scene, gl, precompile]);
  useFrame(({ camera, scene: three }, delta) => {
    scene.sky?.follow(camera.position.x, camera.position.y, camera.position.z, delta, still);
    if (scene.nature && followTarget.ready) {
      const fog = three.fog as { far?: number } | null;
      scene.nature.update(camera, followTarget.x, followTarget.z, fog?.far ?? Infinity, delta, still, cameraLook.t);
    }
    // T8: the grass with CameraRig's already-smoothed zoom t; its disc (the ground's bed) stays in runtime for the Walk.
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
  // Open-world-3d M3 (GPU leak on tier change, measured with perf:probe): the scene is freed here, at the R3F root,
  // and not in GameCanvas. The Canvas commits its children after the DOM root: freed from GameCanvas, the old
  // scene was drawn a few more frames with its textures already freed, three uploaded them again and nobody deleted them (the
  // ground maps and the clouds of each tier stayed alive). Here the cleanup runs when the old scene is already gone.
  useEffect(() => () => scene.dispose(), [scene]);
  // Before the first frame: the characters (also the player, mounted outside) read this ground.
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
        // Without relief, an invisible plane for the ground raycast: inside the bounds the terrain is flat at y = 0.
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
        const a = actors.find((x) => x.id === l.id) as MapActor; // labelEntries comes from `actors`
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
