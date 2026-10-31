// world/post/ — postprocessing per tier (D-077, 03 §2.9): `low` none; `medium` cheap bloom (high threshold,
// half resolution); `high` bloom + tilt-shift-style depth of field + vignette. Loaded as a separate chunk
// (import() from GameCanvas): `low` and `dialog-only` never download it (D-160 proposal as implementation). The
// tilt-shift focuses on the player and adjusts to the camera distance (tiltShift.ts, D-208). Open-world-3d T6 (D-823):
// in `thirdPerson` there is no tilt-shift (it blurs the sky and the feet in a behind-the-character view); it stays in the overview
// and in the `high` two-person shot. T10-integrate: its passes are precompiled when built (with `precompile`).
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, TiltShift2, Vignette } from "@react-three/postprocessing";
import { useCallback, useEffect, useRef } from "react";
import { UnsignedByteType, type WebGLRenderer } from "three";
import type { PostComposer, PostLevel } from "./level";
import { tiltShiftFor } from "./tiltShift";

export type { PostComposer, PostLevel } from "./level";

/**
 * `viewScale` is that of the requested camera distance (world/camera/rig.ts). `composer` (T10 (b)): without it,
 * multisampling 0 and the composer default frame buffer.
 */
export default function Post({ level, viewScale, tiltShift = true, composer, precompile }: {
  level: PostLevel; viewScale: number; tiltShift?: boolean; composer?: PostComposer | undefined;
  /**
   * T10-integrate: precompiles the passes of the built composer (GameCanvas passes `precompilePasses` from WorldLoad.tsx; by
   * prop and not by import, so this chunk does not drag in canvas modules).
   */
  precompile?: ((gl: WebGLRenderer, composer: { passes: readonly unknown[] }) => void) | undefined;
}) {
  // T10-integrate: the passes are precompiled when the composer is built (the ref arrives with it) and again when they change
  // (level or tilt-shift), without holding the frameloop. The microtask waits for the composer to finish rebuilding its passes
  // (it does so in a synchronous re-render of its layout effect).
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
