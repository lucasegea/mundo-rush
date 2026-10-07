// world/post/ — postprocesado por tier (D-077, 03 §2.9): `low` ninguno; `medium` bloom barato (umbral alto,
// media resolución); `high` bloom + profundidad de campo tipo tilt-shift + viñeta. Se carga como chunk aparte
// (import() desde GameCanvas): `low` y `dialog-only` nunca lo descargan (propuesta de D-160 como implementación).
import { Bloom, EffectComposer, TiltShift2, Vignette } from "@react-three/postprocessing";

export type PostLevel = "none" | "bloom" | "full";

export default function Post({ level }: { level: PostLevel }) {
  if (level === "none") return null;
  if (level === "bloom") {
    return (
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.1} intensity={0.8} resolutionScale={0.5} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={1.1} />
      <TiltShift2 blur={0.25} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} samples={10} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
}
