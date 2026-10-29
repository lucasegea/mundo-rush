// world/post/ — postprocesado por tier (D-077, 03 §2.9): `low` ninguno; `medium` bloom barato (umbral alto,
// media resolución); `high` bloom + profundidad de campo tipo tilt-shift + viñeta. Se carga como chunk aparte
// (import() desde GameCanvas): `low` y `dialog-only` nunca lo descargan (propuesta de D-160 como implementación). El
// tilt-shift enfoca al jugador y se ajusta a la distancia de la cámara (tiltShift.ts, D-208).
import { Bloom, EffectComposer, TiltShift2, Vignette } from "@react-three/postprocessing";
import type { PostLevel } from "./level";
import { tiltShiftFor } from "./tiltShift";

export type { PostLevel } from "./level";

/** `viewScale` es el de la distancia pedida de la cámara (world/camera/rig.ts). */
export default function Post({ level, viewScale }: { level: PostLevel; viewScale: number }) {
  if (level === "none") return null;
  if (level === "bloom") {
    return (
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.1} intensity={0.8} resolutionScale={0.5} />
      </EffectComposer>
    );
  }
  const ts = tiltShiftFor(viewScale);
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={1.1} />
      <TiltShift2 blur={ts.blur} taper={ts.taper} start={ts.start} end={ts.end} samples={10} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
}
