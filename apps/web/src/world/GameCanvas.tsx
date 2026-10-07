// world/GameCanvas.tsx — raíz del canvas (chunk diferido, 03 §4.2, §2.7.3): App.tsx lo importa con import() solo
// en la fase `world`, así three nunca entra a la carga inicial. Disciplina de R3F (03 §2.3): el componente solo
// re-renderiza cuando cambian el diorama o los parámetros de render; lo que cambia por cuadro vive en useFrame.
// Tiers (R12): los parámetros llegan de services/quality (TIER_PARAMS) por props desde la raíz de composición.
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { lazy, Suspense } from "react";
import type { SelectableTier } from "@lg/core";
import { bridge } from "../state/bridge";
import { selectMapView, selectWorldRender, useGameView } from "../state/selectors";
import { Player } from "./actors/Player";
import { CameraRig } from "./camera/CameraRig";
import { Diorama } from "./dioramas/Diorama";
import { Lighting } from "./lighting/Lighting";
import type { PostLevel } from "./post/Post";

// El postprocesado va en su propio chunk: `low` y `dialog-only` nunca lo descargan (03 §2.9, D-160).
const Post = lazy(() => import("./post/Post"));

/** Lo que el mapa necesita de cada tier (la forma de TIER_PARAMS de services/quality, sin importarlo). */
export interface WorldTierParams {
  maxDpr: number | null;
  post: PostLevel;
}

/** Atributo del contenedor: services/input solo hace zoom con la rueda sobre el mapa. */
const WORLD_SURFACE = { "data-lg-world": "" };

export default function GameCanvas({ tierParams }: { tierParams: Readonly<Record<SelectableTier, WorldTierParams>> }) {
  const map = useGameView(selectMapView);
  const render = useGameView(selectWorldRender);
  const params = tierParams[render.tier];
  const post: PostLevel = render.post ? params.post : "none";

  return (
    <div {...WORLD_SURFACE} className="fixed inset-0 z-0" aria-hidden="true">
      <Canvas
        frameloop={render.paused ? "demand" : "always"}
        dpr={[1, params.maxDpr ?? 1]}
        gl={{ antialias: false }}
        onCreated={({ gl }) => {
          // Pérdida de contexto (frecuente en GPUs débiles, §2.7.2.4): a solo-diálogo sin perder la escena.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            bridge.contextLost();
          });
        }}
      >
        <color attach="background" args={["#a8c8e0"]} />
        <PerformanceMonitor onDecline={() => bridge.performanceDeclined()} />
        <Lighting />
        {map.diorama ? <Diorama diorama={map.diorama} actors={map.actors} pitchDeg={render.pitchDeg} yawDeg={render.yawDeg} /> : null}
        {/* Player antes que CameraRig: en cada cuadro la cámara sigue la posición ya interpolada. */}
        {map.diorama ? <Player pitchDeg={render.pitchDeg} yawDeg={render.yawDeg} /> : null}
        <CameraRig preset={render.preset} pitchDeg={render.pitchDeg} yawDeg={render.yawDeg} zoomStep={render.zoomStep} motion={render.cameraMotion} />
        {post !== "none" ? (
          <Suspense fallback={null}>
            <Post level={post} />
          </Suspense>
        ) : null}
      </Canvas>
    </div>
  );
}
