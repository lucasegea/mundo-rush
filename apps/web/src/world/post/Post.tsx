// world/post/ — postprocesado por tier (D-077, 03 §2.9): `low` ninguno; `medium` bloom barato (umbral alto,
// media resolución); `high` bloom + profundidad de campo tipo tilt-shift + viñeta. Se carga como chunk aparte
// (import() desde GameCanvas): `low` y `dialog-only` nunca lo descargan (propuesta de D-160 como implementación). El
// tilt-shift enfoca al jugador y se ajusta a la distancia de la cámara (tiltShift.ts, D-208). Open-world-3d T6 (D-823):
// en `thirdPerson` no hay tilt-shift (borronea el cielo y los pies en una vista detrás del personaje); queda en la vista
// de conjunto y en el plano de a dos de `high`. T10-integrate: sus pasadas se precompilan al armarse (con `precompile`).
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, TiltShift2, Vignette } from "@react-three/postprocessing";
import { useCallback, useEffect, useRef } from "react";
import { UnsignedByteType, type WebGLRenderer } from "three";
import type { PostComposer, PostLevel } from "./level";
import { tiltShiftFor } from "./tiltShift";

export type { PostComposer, PostLevel } from "./level";

/**
 * `viewScale` es el de la distancia pedida de la cámara (world/camera/rig.ts). `composer` (T10 (b)): sin él,
 * multisampling 0 y el frame buffer por defecto del composer.
 */
export default function Post({ level, viewScale, tiltShift = true, composer, precompile }: {
  level: PostLevel; viewScale: number; tiltShift?: boolean; composer?: PostComposer | undefined;
  /**
   * T10-integrate: precompila las pasadas del composer armado (GameCanvas pasa `precompilePasses` de WorldLoad.tsx; por
   * prop y no por import, así este chunk no arrastra módulos del canvas).
   */
  precompile?: ((gl: WebGLRenderer, composer: { passes: readonly unknown[] }) => void) | undefined;
}) {
  // T10-integrate: las pasadas se precompilan al armarse el composer (la ref llega con él) y otra vez cuando cambian
  // (nivel o tilt-shift), sin retener el frameloop. La microtarea espera a que el composer termine de rearmar sus pasadas
  // (lo hace en un re-render síncrono de su efecto de layout).
  const gl = useThree((s) => s.gl);
  const built = useRef<{ passes: readonly unknown[] } | null>(null);
  const warm = useCallback(() => queueMicrotask(() => {
    if (built.current) precompile?.(gl, built.current);
  }), [gl, precompile]);
  const onComposer = useCallback((c: { passes: readonly unknown[] } | null) => {
    built.current = c;
    if (c) warm();
  }, [warm]);
  useEffect(() => warm(), [warm, level, tiltShift]);
  if (level === "none") return null;
  const cp = { ref: onComposer, multisampling: composer?.multisampling ?? 0, ...(composer?.eightBit ? { frameBufferType: UnsignedByteType } : {}) };
  if (level === "bloom") {
    return (
      <EffectComposer {...cp}>
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.1} intensity={0.8} resolutionScale={0.5} />
      </EffectComposer>
    );
  }
  const ts = tiltShiftFor(viewScale);
  if (!tiltShift) {
    return (
      <EffectComposer {...cp}>
        <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={1.1} />
        <Vignette offset={0.3} darkness={0.55} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer {...cp}>
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={1.1} />
      <TiltShift2 blur={ts.blur} taper={ts.taper} start={ts.start} end={ts.end} samples={10} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
}
