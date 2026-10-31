// world/GameCanvas.tsx — canvas root (deferred chunk, 03 §4.2, §2.7.3): App.tsx imports it with import() only
// in the `world` phase, so three never enters the initial load. R3F discipline (03 §2.3): the component only
// re-renders when the diorama, the render parameters, the chat or the highlighted NPC change; what changes per
// frame lives in useFrame. Tiers (R12): the parameters arrive from services/quality (TIER_PARAMS) via props from the composition
// root. Look C (D-207, plan estetica-c M1): background haze and fog, ACES with exposure 1.05, shadows per tier.
// Since D-208 the zoom step's distance arrives from the selector and clipping, fog, shadow, tilt-shift and
// labels depend on it (the fog starts with the proposal's values and Lighting adjusts it each frame).
// Plan estetica-c M6 (03 §2.7.1, §2.7.4): the scene is built with the tier's density (`low` reduced); the canvas has a
// frame cap (30 with a conversation scene on top, the tier's `targetFps` outside it); during the chat the
// non-essential (water, background NPCs) is frozen and PerformanceMonitor does not measure. In development with director mode, a
// probe leaves the renderer.info counters for the snapshot (it does not exist in the build).
// Open-world-3d T6 (D-819, D-823): a diorama with relief is built with the open-world tier (OPEN_WORLD_DENSITY:
// terrain step, tiles, clouds, fog); its background and fog are the dome's horizon (world/sky) and the fog
// comes from `fogFor(scale, t)`. The tilt-shift stays off in `thirdPerson` (Post).
// Open-world-3d T7b (D-839, D-840): the diorama's look is resolved once on loading it (`lookForDiorama`) and from it come
// background, fog, tone, light, the whole scene and the characters; the relief decides only the terrain's shape.
// Open-world-3d T10 (d, D-835): with the scene ready, the frameloop is held ("never") until compileAsync has compiled
// its programs (ShaderWarmup); the first drawn frame marks `lg:world-first-frame` (FirstFrameMark). T10 (b): in
// development, the measurement factors of the query (`?factor=...`, world/budget/devFactors.ts) move the knobs of the
// tier, the composer, the context and the scene; in `vite build` the branch does not exist (check:dev-only).
// T10-integrate: what arrives after the first scene (nature, bodies, post passes) is precompiled on arrival,
// without holding the frameloop (world/budget/WorldLoad.tsx), for the destination of `worldFrame.post`.
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ACESFilmicToneMapping } from "three";
import { DENSITY, OPEN_WORLD_DENSITY, WORLD_TIERS, type SceneDensity, type WorldTier } from "@lg/art";
import type { SelectableTier } from "@lg/core";
import { bridge } from "../state/bridge";
import { selectConversationFrame, selectHighlightedNpc, selectMapView, selectRequestBubbles, selectSceneActivity, selectWorldRender, useGameView } from "../state/selectors";
import { sceneAnimated } from "./actors/animState";
import { PLAYER_LOOK_ID } from "./actors/looks";
import { Player } from "./actors/Player";
import { CameraRig } from "./camera/CameraRig";
import { TWO_SHOT, viewScale } from "./camera/rig";
import { zoomDistanceAt } from "./camera/zoom";
import { Diorama } from "./dioramas/Diorama";
import { lookForDiorama } from "./dioramas/look";
import { buildDioramaScene } from "./dioramas/scene";
import { composerWithFactors, DEV_FACTORS_ATTR, parseDevFactors, sceneWithFactors, tierWithFactors } from "./budget/devFactors";
import { FirstFrameMark, precompilePasses, ShaderWarmup } from "./budget/WorldLoad";
import { FrameRegulator } from "./FrameRegulator";
import { canvasLoop } from "./frameRate";
import { activeLook, worldFrame } from "./runtime";
import { Lighting, type ShadowMode } from "./lighting/Lighting";
import { postLevel, type PostLevel } from "./post/level";
import { tiltShiftOn } from "./post/tiltShift";
import { fogFor } from "./sky/palette";

// The postprocessing goes in its own chunk: `low` and `dialog-only` never download it (03 §2.9, D-160).
const Post = lazy(() => import("./post/Post"));
// renderer.info counters for the director-mode snapshot (M6): only under the director mode's double key; in
// `vite build` the condition is false, the import() is eliminated and the module is not emitted (check:dev-only).
const RenderStatsProbe = import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1" ? lazy(() => import("./budget/renderStats")) : null;
// Performance probe (open-world-3d T2(g), D-833): under its own double key, which only scripts/dev/perf-probe.ts sets
// in its Vite. With it the canvas runs uncapped (frameloop "always", no FrameRegulator) and the hook leaves the times and
// the counters in globalThis. In `vite build` the condition is false and none of this is emitted (check:dev-only).
const PERF_PROBE = import.meta.env.DEV && import.meta.env.VITE_LG_PERF_PROBE === "1";
const PerfProbe = PERF_PROBE ? lazy(() => import("./budget/perfProbe")) : null;
// Measurement factors (open-world-3d T10 (b), D-846): development only; in `vite build` it is null, each use below
// stays in its dead branch and the registry is not emitted (check:dev-only looks for DEV_FACTORS_ATTR in the dist).
const FACTORS = import.meta.env.DEV ? parseDevFactors(globalThis.location?.search ?? "", true) : null;
const SCENE_KNOBS = FACTORS ? sceneWithFactors(FACTORS.effect) : undefined;
const COMPOSER = FACTORS ? composerWithFactors(FACTORS.effect) : undefined;
const DEV_SURFACE = FACTORS ? { [DEV_FACTORS_ATTR]: FACTORS.names.join(",") } : {};

/** What the map needs from each tier (the shape of services/quality's TIER_PARAMS, without importing it). */
export interface WorldTierParams {
  maxDpr: number | null;
  post: PostLevel;
  shadows: ShadowMode;
  /** Cap of simultaneously animated characters (plan estetica-c M3); the rest stay frozen. */
  maxAnimatedCharacters: number;
  /** The tier's target FPS: also its frame cap outside the chat (plan estetica-c M6). */
  targetFps: number | null;
  /** Scene density (plan estetica-c M6): the reduced one on `low`. */
  density: SceneDensity;
}

/** Container attribute: services/input only zooms with the wheel (and looks with the drag) over the map. */
const WORLD_SURFACE = { "data-lg-world": "" };
/** Reference whole-map distance for what depends on zoom in React (post); the camera uses the live one. */
const VIEW_FIT_REFERENCE = 150;

/** The open-world tier of a selectable tier (`dialog-only` does not draw the map: falls to `low`). */
export const worldTierOf = (tier: string): WorldTier => ((WORLD_TIERS as readonly string[]).includes(tier) ? (tier as WorldTier) : "low");

export default function GameCanvas({ tierParams }: { tierParams: Readonly<Record<SelectableTier, WorldTierParams>> }) {
  const map = useGameView(selectMapView);
  const render = useGameView(selectWorldRender);
  const conversation = useGameView(selectConversationFrame);
  const highlightId = useGameView(selectHighlightedNpc);
  const activity = useGameView(selectSceneActivity);
  const requestIds = useGameView(selectRequestBubbles);
  const params = FACTORS ? tierWithFactors(tierParams[render.tier], FACTORS.effect) : tierParams[render.tier];
  const density = params.density;
  const post = postLevel(render.post, params.post);
  // T10-integrate: precompilation compiles for this tier's destination (render target with post, screen without it).
  // It is a value derived from the props, assigned before the Canvas mounts its children.
  worldFrame.post = post !== "none";
  const cut = render.cameraMotion === "cut";
  const loop = canvasLoop(render, params.targetFps, PERF_PROBE);
  const inScene = render.conversationFps !== null;
  const animatedOnly = useMemo(() => sceneAnimated(inScene, [PLAYER_LOOK_ID, conversation?.npcId ?? null]), [inScene, conversation?.npcId]);
  const worldTier = worldTierOf(render.tier);
  const openWorld = map.diorama?.ground.terrain.relief === true;
  // The fog scale belongs to the tier (core): the open world's with relief, DENSITY's without it.
  const fogScale = openWorld ? OPEN_WORLD_DENSITY[worldTier].fogScale : DENSITY[density].fogScale;
  const look = useMemo(() => lookForDiorama(map.diorama), [map.diorama]);
  useEffect(() => {
    activeLook.id = map.diorama ? look.id : null;
    return () => {
      activeLook.id = null;
    };
  }, [map.diorama, look]);
  const fog = fogFor(look.fog.range, fogScale, render.zoomBand);
  // Requested camera distance (open-world-3d T5): the two-person shot's during the chat; on the map, a reference
  // from the quantized zoom t (post and labels). The exact one is carried by CameraRig per frame.
  const viewDistance = render.preset === "dialogueFrame" ? TWO_SHOT.distance : zoomDistanceAt(render.zoomBand, VIEW_FIT_REFERENCE);
  const scene = useMemo(() => (map.diorama ? buildDioramaScene(map.diorama, density, worldTier, look, SCENE_KNOBS) : null), [map.diorama, density, worldTier, look]);
  // T10 (d): once per canvas, the first scene is compiled before being drawn (tier changes do not).
  const [warm, setWarm] = useState(false);
  const onWarm = useCallback(() => setWarm(true), []);
  const warming = scene !== null && !warm;
  // The scene is freed in Diorama (inside the Canvas), not here: see the comment of its effect.

  return (
    // touch-action: none (D-820): a touch drag looks instead of scrolling the page (Pointer Events, no pointer lock).
    <div {...WORLD_SURFACE} {...DEV_SURFACE} className="fixed inset-0 z-0" style={{ touchAction: "none" }} aria-hidden="true">
      <Canvas
        frameloop={warming ? "never" : loop.frameloop}
        dpr={[1, params.maxDpr ?? 1]}
        shadows={params.shadows === "directional"}
        gl={{ antialias: FACTORS?.effect.antialias ?? false }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = look.light.exposure;
          // Context loss (common on weak GPUs, §2.7.2.4): to dialog-only without losing the scene.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            bridge.contextLost();
          });
        }}
      >
        <color attach="background" args={[look.background]} />
        <fog attach="fog" args={[look.fog.color, fog.near, fog.far]} />
        {loop.regulatorFps !== null ? <FrameRegulator maxFps={loop.regulatorFps} /> : null}
        {/* Outside the chat it measures and may lower the tier; during the chat it is unmounted (on return it starts from zero). The
            bounds come from the frame cap, so the cap itself is not read as a drop (canvasLoop in frameRate.ts). */}
        {loop.monitor ? <PerformanceMonitor bounds={loop.monitor.bounds} onDecline={() => bridge.performanceDeclined()} /> : null}
        <Lighting shadows={params.shadows} look={look} fogScale={fogScale} />
        {map.diorama && scene ? (
          <Diorama
            diorama={map.diorama}
            scene={scene}
            actors={map.actors}
            highlightId={highlightId}
            sceneNpcId={conversation?.npcId ?? null}
            viewDistance={viewDistance}
            zoomT={render.zoomBand}
            cut={cut}
            activity={activity}
            maxAnimated={params.maxAnimatedCharacters}
            animatedOnly={animatedOnly}
            frozen={inScene}
            density={density}
            requestIds={requestIds}
          />
        ) : null}
        {/* Player before CameraRig: each frame the camera follows the already-drawn position. */}
        {/* Open-world-3d T7b (D-840): the player with the look's characters (Quaternius in DEFAULT_LOOK, AC47). */}
        {map.diorama ? <Player conversation={conversation} cut={cut} scene={activity.player} lod={DENSITY[density].lod} cast={look.characters} /> : null}
        <CameraRig
          preset={render.preset}
          motion={render.cameraMotion}
          conversation={conversation}
          obstacles={scene?.obstacles ?? []}
          heightAt={scene ? scene.terrain.heightAt : null}
          bounds={map.diorama?.bounds ?? null}
        />
        {post !== "none" ? (
          <Suspense fallback={null}>
            <Post level={post} viewScale={viewScale(viewDistance)} tiltShift={tiltShiftOn(render.preset)} composer={COMPOSER} precompile={precompilePasses} />
          </Suspense>
        ) : null}
        {/* T10 (d): after everything mounted, so compileAsync sees the diorama's scene, the player and the light. */}
        {warming ? <ShaderWarmup onReady={onWarm} /> : null}
        {scene && warm ? <FirstFrameMark /> : null}
        {RenderStatsProbe ? (
          <Suspense fallback={null}>
            <RenderStatsProbe />
          </Suspense>
        ) : null}
        {PerfProbe ? (
          <Suspense fallback={null}>
            <PerfProbe />
          </Suspense>
        ) : null}
      </Canvas>
    </div>
  );
}
