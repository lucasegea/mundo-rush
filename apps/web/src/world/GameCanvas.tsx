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
// Open-world-3d T6 (D-819, D-823): un diorama con relieve se arma con el tier del mundo abierto (OPEN_WORLD_DENSITY:
// paso del terreno, baldosas, nubes, niebla); su fondo y su niebla son el horizonte de la cúpula (world/sky) y la niebla
// sale de `fogFor(scale, t)`. El tilt-shift queda fuera de `thirdPerson` (Post).
// Open-world-3d T7b (D-839, D-840): el look del diorama se resuelve una vez al cargarlo (`lookForDiorama`) y de él salen
// fondo, niebla, tono, luz, la escena entera y los personajes; el relieve decide solo la forma del terreno.
// Open-world-3d T10 (d, D-835): con la escena lista, el frameloop queda retenido ("never") hasta que compileAsync compiló
// sus programas (ShaderWarmup); el primer cuadro dibujado marca `lg:world-first-frame` (FirstFrameMark). T10 (b): en
// desarrollo, los factores de medición de la query (`?factor=...`, world/budget/devFactors.ts) mueven las perillas del
// tier, del composer, del contexto y de la escena; en `vite build` la rama no existe (check:dev-only).
// T10-integrate: lo que llega después de la primera escena (naturaleza, cuerpos, pasadas del post) se precompila al llegar,
// sin retener el frameloop (world/budget/WorldLoad.tsx), para el destino de `worldFrame.post`.
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
// Factores de medición (open-world-3d T10 (b), D-846): solo en desarrollo; en `vite build` es null, cada uso de abajo
// queda en su rama muerta y el registro no se emite (check:dev-only busca DEV_FACTORS_ATTR en el dist).
const FACTORS = import.meta.env.DEV ? parseDevFactors(globalThis.location?.search ?? "", true) : null;
const SCENE_KNOBS = FACTORS ? sceneWithFactors(FACTORS.effect) : undefined;
const COMPOSER = FACTORS ? composerWithFactors(FACTORS.effect) : undefined;
const DEV_SURFACE = FACTORS ? { [DEV_FACTORS_ATTR]: FACTORS.names.join(",") } : {};

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

/** El tier del mundo abierto de un tier seleccionable (`dialog-only` no dibuja el mapa: cae en `low`). */
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
  // T10-integrate: la precompilación compila para el destino de este tier (render target con post, pantalla sin él).
  // Es un valor derivado de las props, asignado antes de que el Canvas monte a sus hijos.
  worldFrame.post = post !== "none";
  const cut = render.cameraMotion === "cut";
  const loop = canvasLoop(render, params.targetFps, PERF_PROBE);
  const inScene = render.conversationFps !== null;
  const animatedOnly = useMemo(() => sceneAnimated(inScene, [PLAYER_LOOK_ID, conversation?.npcId ?? null]), [inScene, conversation?.npcId]);
  const worldTier = worldTierOf(render.tier);
  const openWorld = map.diorama?.ground.terrain.relief === true;
  // La escala de la niebla es del tier (núcleo): la del mundo abierto con relieve, la de DENSITY sin él.
  const fogScale = openWorld ? OPEN_WORLD_DENSITY[worldTier].fogScale : DENSITY[density].fogScale;
  const look = useMemo(() => lookForDiorama(map.diorama), [map.diorama]);
  useEffect(() => {
    activeLook.id = map.diorama ? look.id : null;
    return () => {
      activeLook.id = null;
    };
  }, [map.diorama, look]);
  const fog = fogFor(look.fog.range, fogScale, render.zoomBand);
  // Distancia pedida de la cámara (open-world-3d T5): la del plano de a dos durante la charla; en el mapa, una referencia
  // del t de zoom cuantizado (post y etiquetas). La exacta la lleva CameraRig por cuadro.
  const viewDistance = render.preset === "dialogueFrame" ? TWO_SHOT.distance : zoomDistanceAt(render.zoomBand, VIEW_FIT_REFERENCE);
  const scene = useMemo(() => (map.diorama ? buildDioramaScene(map.diorama, density, worldTier, look, SCENE_KNOBS) : null), [map.diorama, density, worldTier, look]);
  // T10 (d): una sola vez por canvas, la primera escena se compila antes de dibujarse (los cambios de tier, no).
  const [warm, setWarm] = useState(false);
  const onWarm = useCallback(() => setWarm(true), []);
  const warming = scene !== null && !warm;
  // La escena se libera en Diorama (dentro del Canvas), no acá: ver el comentario de su efecto.

  return (
    // touch-action: none (D-820): un arrastre táctil mira en vez de desplazar la página (Pointer Events, sin pointer lock).
    <div {...WORLD_SURFACE} {...DEV_SURFACE} className="fixed inset-0 z-0" style={{ touchAction: "none" }} aria-hidden="true">
      <Canvas
        frameloop={warming ? "never" : loop.frameloop}
        dpr={[1, params.maxDpr ?? 1]}
        shadows={params.shadows === "directional"}
        gl={{ antialias: FACTORS?.effect.antialias ?? false }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = look.light.exposure;
          // Pérdida de contexto (frecuente en GPUs débiles, §2.7.2.4): a solo-diálogo sin perder la escena.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            bridge.contextLost();
          });
        }}
      >
        <color attach="background" args={[look.background]} />
        <fog attach="fog" args={[look.fog.color, fog.near, fog.far]} />
        {loop.regulatorFps !== null ? <FrameRegulator maxFps={loop.regulatorFps} /> : null}
        {/* Fuera de la charla mide y puede bajar el tier; durante la charla se desmonta (al volver arranca de cero). Los
            bounds salen del tope de cuadros, así el tope propio no se lee como caída (canvasLoop en frameRate.ts). */}
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
        {/* Player antes que CameraRig: en cada cuadro la cámara sigue la posición ya dibujada. */}
        {/* Open-world-3d T7b (D-840): el jugador con los personajes del look (Quaternius en DEFAULT_LOOK, AC47). */}
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
        {/* T10 (d): después de todo lo montado, así compileAsync ve la escena del diorama, el jugador y la luz. */}
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
