// world/GameCanvas.tsx — raíz del canvas (chunk diferido, 03 §4.2, §2.7.3): App.tsx lo importa con import() solo
// en la fase `world`, así three nunca entra a la carga inicial. Disciplina de R3F (03 §2.3): el componente solo
// re-renderiza cuando cambian el diorama, los parámetros de render, la charla o el NPC resaltado; lo que cambia por
// cuadro vive en useFrame. Tiers (R12): los parámetros llegan de services/quality (TIER_PARAMS) por props desde la raíz
// de composición. Look C (D-207, plan estetica-c M1): bruma de fondo y niebla, ACES con exposición 1,05, sombras por tier.
// Desde D-208 la distancia del paso de zoom llega del selector y de ella dependen recorte, niebla, sombra, tilt-shift y
// etiquetas (la niebla arranca con los valores de la propuesta y Lighting la ajusta cada cuadro).
// Plan estetica-c M6 (03 §2.7.1, §2.7.4): la escena se arma con la densidad del tier (`low` reducida); el canvas tiene
// tope de cuadros (30 con una escena de conversación arriba, el `targetFps` del tier fuera de ella); durante la charla se
// congela lo no esencial (agua, NPCs de fondo) y PerformanceMonitor no mide. En desarrollo con el modo director, una
// sonda deja los contadores de renderer.info para la instantánea (en build no existe).
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { ACESFilmicToneMapping } from "three";
import { DENSITY, type SceneDensity } from "@lg/art";
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
import { buildDioramaScene } from "./dioramas/scene";
import { FrameRegulator } from "./FrameRegulator";
import { canvasLoop } from "./frameRate";
import { Lighting, type ShadowMode } from "./lighting/Lighting";
import { BACKGROUND, FOG, fogFor, TONE } from "./lighting/params";
import { postLevel, type PostLevel } from "./post/level";

// El postprocesado va en su propio chunk: `low` y `dialog-only` nunca lo descargan (03 §2.9, D-160).
const Post = lazy(() => import("./post/Post"));
// Contadores de renderer.info para la instantánea del modo director (M6): solo bajo la doble llave del modo director; en
// `vite build` la condición es falsa, el import() se elimina y el módulo no se emite (check:dev-only).
const RenderStatsProbe = import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1" ? lazy(() => import("./budget/renderStats")) : null;
// Sonda de rendimiento (open-world-3d T2(g), D-833): bajo su propia doble llave, que solo pone scripts/dev/perf-probe.ts
// en su Vite. Con ella el canvas corre sin tope (frameloop "always", sin FrameRegulator) y el gancho deja los tiempos y
// los contadores en globalThis. En `vite build` la condición es falsa y nada de esto se emite (check:dev-only).
const PERF_PROBE = import.meta.env.DEV && import.meta.env.VITE_LG_PERF_PROBE === "1";
const PerfProbe = PERF_PROBE ? lazy(() => import("./budget/perfProbe")) : null;

/** Lo que el mapa necesita de cada tier (la forma de TIER_PARAMS de services/quality, sin importarlo). */
export interface WorldTierParams {
  maxDpr: number | null;
  post: PostLevel;
  shadows: ShadowMode;
  /** Tope de personajes animados a la vez (plan estetica-c M3); los demás quedan congelados. */
  maxAnimatedCharacters: number;
  /** FPS objetivo del tier: también su tope de cuadros fuera de la charla (plan estetica-c M6). */
  targetFps: number | null;
  /** Densidad de la escena (plan estetica-c M6): la reducida en `low`. */
  density: SceneDensity;
}

/** Atributo del contenedor: services/input solo hace zoom con la rueda (y mira con el arrastre) sobre el mapa. */
const WORLD_SURFACE = { "data-lg-world": "" };
/** Distancia del mapa entero de referencia para lo que depende del zoom en React (post); la cámara usa la viva. */
const VIEW_FIT_REFERENCE = 150;

export default function GameCanvas({ tierParams }: { tierParams: Readonly<Record<SelectableTier, WorldTierParams>> }) {
  const map = useGameView(selectMapView);
  const render = useGameView(selectWorldRender);
  const conversation = useGameView(selectConversationFrame);
  const highlightId = useGameView(selectHighlightedNpc);
  const activity = useGameView(selectSceneActivity);
  const requestIds = useGameView(selectRequestBubbles);
  const params = tierParams[render.tier];
  const density = params.density;
  const post = postLevel(render.post, params.post);
  const cut = render.cameraMotion === "cut";
  const loop = canvasLoop(render, params.targetFps, PERF_PROBE);
  const inScene = render.conversationFps !== null;
  const animatedOnly = useMemo(() => sceneAnimated(inScene, [PLAYER_LOOK_ID, conversation?.npcId ?? null]), [inScene, conversation?.npcId]);
  const fog = fogFor(1, DENSITY[density].fogScale);
  // Distancia pedida de la cámara (open-world-3d T5): la del plano de a dos durante la charla; en el mapa, una referencia
  // del t de zoom cuantizado (post y etiquetas). La exacta la lleva CameraRig por cuadro.
  const viewDistance = render.preset === "dialogueFrame" ? TWO_SHOT.distance : zoomDistanceAt(render.zoomBand, VIEW_FIT_REFERENCE);
  const scene = useMemo(() => (map.diorama ? buildDioramaScene(map.diorama, density) : null), [map.diorama, density]);
  useEffect(() => () => scene?.dispose(), [scene]);

  return (
    // touch-action: none (D-820): un arrastre táctil mira en vez de desplazar la página (Pointer Events, sin pointer lock).
    <div {...WORLD_SURFACE} className="fixed inset-0 z-0" style={{ touchAction: "none" }} aria-hidden="true">
      <Canvas
        frameloop={loop.frameloop}
        dpr={[1, params.maxDpr ?? 1]}
        shadows={params.shadows === "directional"}
        gl={{ antialias: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = TONE.exposure;
          // Pérdida de contexto (frecuente en GPUs débiles, §2.7.2.4): a solo-diálogo sin perder la escena.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            bridge.contextLost();
          });
        }}
      >
        <color attach="background" args={[BACKGROUND]} />
        <fog attach="fog" args={[FOG.color, fog.near, fog.far]} />
        {loop.regulatorFps !== null ? <FrameRegulator maxFps={loop.regulatorFps} /> : null}
        {/* Fuera de la charla mide y puede bajar el tier; durante la charla se desmonta (al volver arranca de cero). Los
            bounds salen del tope de cuadros, así el tope propio no se lee como caída (canvasLoop en frameRate.ts). */}
        {loop.monitor ? <PerformanceMonitor bounds={loop.monitor.bounds} onDecline={() => bridge.performanceDeclined()} /> : null}
        <Lighting shadows={params.shadows} fogScale={DENSITY[density].fogScale} />
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
        {/* Player antes que CameraRig: en cada cuadro la cámara sigue la posición ya dibujada. */}
        {map.diorama ? <Player conversation={conversation} cut={cut} scene={activity.player} lod={DENSITY[density].lod} /> : null}
        <CameraRig
          preset={render.preset}
          motion={render.cameraMotion}
          conversation={conversation}
          obstacles={scene?.obstacles ?? []}
          heightAt={scene ? scene.terrain.heightAt : null}
          bounds={map.diorama?.bounds ?? null}
          fogScale={DENSITY[density].fogScale}
        />
        {post !== "none" ? (
          <Suspense fallback={null}>
            <Post level={post} viewScale={viewScale(viewDistance)} />
          </Suspense>
        ) : null}
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
