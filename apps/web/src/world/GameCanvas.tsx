// world/GameCanvas.tsx — raíz del canvas (chunk diferido, 03 §4.2, §2.7.3): App.tsx lo importa con import() solo
// en la fase `world`, así three nunca entra a la carga inicial. Disciplina de R3F (03 §2.3): el componente solo
// re-renderiza cuando cambian el diorama, los parámetros de render, la charla o el NPC resaltado; lo que cambia por
// cuadro vive en useFrame. Tiers (R12): los parámetros llegan de services/quality (TIER_PARAMS) por props desde la raíz
// de composición. Look C (D-207, plan estetica-c M1): bruma de fondo y niebla, ACES con exposición 1,05, sombras por tier.
// Desde D-208 la distancia del paso de zoom llega del selector y de ella dependen recorte, niebla, sombra, tilt-shift y
// etiquetas (la niebla arranca con los valores de la propuesta y Lighting la ajusta cada cuadro).
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { ACESFilmicToneMapping } from "three";
import type { SelectableTier } from "@lg/core";
import { bridge } from "../state/bridge";
import { selectConversationFrame, selectHighlightedNpc, selectMapView, selectSceneActivity, selectWorldRender, useGameView } from "../state/selectors";
import { Player } from "./actors/Player";
import { CameraRig } from "./camera/CameraRig";
import { TWO_SHOT, viewScale } from "./camera/rig";
import { Diorama } from "./dioramas/Diorama";
import { buildDioramaScene } from "./dioramas/scene";
import { Lighting, type ShadowMode } from "./lighting/Lighting";
import { BACKGROUND, FOG, TONE } from "./lighting/params";
import type { PostLevel } from "./post/Post";

// El postprocesado va en su propio chunk: `low` y `dialog-only` nunca lo descargan (03 §2.9, D-160).
const Post = lazy(() => import("./post/Post"));

/** Lo que el mapa necesita de cada tier (la forma de TIER_PARAMS de services/quality, sin importarlo). */
export interface WorldTierParams {
  maxDpr: number | null;
  post: PostLevel;
  shadows: ShadowMode;
  /** Tope de personajes animados a la vez (plan estetica-c M3); los demás quedan congelados. */
  maxAnimatedCharacters: number;
}

/** Atributo del contenedor: services/input solo hace zoom con la rueda sobre el mapa. */
const WORLD_SURFACE = { "data-lg-world": "" };

export default function GameCanvas({ tierParams }: { tierParams: Readonly<Record<SelectableTier, WorldTierParams>> }) {
  const map = useGameView(selectMapView);
  const render = useGameView(selectWorldRender);
  const conversation = useGameView(selectConversationFrame);
  const highlightId = useGameView(selectHighlightedNpc);
  const activity = useGameView(selectSceneActivity);
  const params = tierParams[render.tier];
  const post: PostLevel = render.post ? params.post : "none";
  const cut = render.cameraMotion === "cut";
  // Distancia pedida de la cámara: la del plano de a dos durante la charla, la del paso de zoom en el mapa.
  const viewDistance = render.preset === "dialogueFrame" ? TWO_SHOT.distance : render.zoomDistance;
  const scene = useMemo(() => (map.diorama ? buildDioramaScene(map.diorama) : null), [map.diorama]);
  useEffect(() => () => scene?.dispose(), [scene]);

  return (
    <div {...WORLD_SURFACE} className="fixed inset-0 z-0" aria-hidden="true">
      <Canvas
        frameloop={render.paused ? "demand" : "always"}
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
        <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
        <PerformanceMonitor onDecline={() => bridge.performanceDeclined()} />
        <Lighting shadows={params.shadows} />
        {map.diorama && scene ? (
          <Diorama
            diorama={map.diorama}
            scene={scene}
            actors={map.actors}
            highlightId={highlightId}
            sceneNpcId={conversation?.npcId ?? null}
            viewDistance={viewDistance}
            cut={cut}
            activity={activity}
            maxAnimated={params.maxAnimatedCharacters}
          />
        ) : null}
        {/* Player antes que CameraRig: en cada cuadro la cámara sigue la posición ya dibujada. */}
        {map.diorama ? <Player conversation={conversation} cut={cut} scene={activity.player} /> : null}
        <CameraRig
          preset={render.preset}
          pitchDeg={render.pitchDeg}
          yawDeg={render.yawDeg}
          distance={render.zoomDistance}
          motion={render.cameraMotion}
          conversation={conversation}
          obstacles={scene?.obstacles ?? []}
          heightAt={scene ? scene.terrain.heightAt : null}
        />
        {post !== "none" ? (
          <Suspense fallback={null}>
            <Post level={post} viewScale={viewScale(viewDistance)} />
          </Suspense>
        ) : null}
      </Canvas>
    </div>
  );
}
