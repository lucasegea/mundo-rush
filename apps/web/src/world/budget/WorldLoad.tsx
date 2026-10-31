// world/budget/WorldLoad.tsx — the world's loading hooks inside the Canvas (open-world-3d T10 (d)):
// `ShaderWarmup` compiles the programs of what is already in the scene with compileAsync and signals (GameCanvas holds the
// frameloop meanwhile); `FirstFrameMark` marks the first drawn frame. T10-integrate: what arrives later
// (nature meshes and maps, character bodies, postprocessing passes) is precompiled on arrival with
// `precompileWorld` / `usePrecompile`, without holding the frameloop: bodies and nature are shown when their compilation
// finished; the post passes start compiling when the composer is built (its first frame may wait for the rest).
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer } from "three";
import { bridge } from "../../state/bridge";
import { worldFrame } from "../runtime";
import { fullscreenPasses, precompile, reportFirstFrame, type WarmupResult } from "./loadWarmup";

/**
 * Precompiles `object` to be drawn in `scene` with `camera`. `offscreen` (by default the tier's, `worldFrame.post`):
 * the frame goes to a render target (the composer's), so it is compiled with a 1 × 1 one set, which is freed right away.
 */
export function precompileWorld(gl: WebGLRenderer, object: Object3D, camera: Camera, scene: Scene, offscreen = worldFrame.post): Promise<WarmupResult> {
  const rt = offscreen ? new WebGLRenderTarget(1, 1) : null;
  try {
    return precompile<Object3D, Camera, Scene, WebGLRenderTarget>(gl, object, camera, scene, rt);
  } finally {
    rt?.dispose();
  }
}

/**
 * Precompilation against the Canvas's scene and camera (for what arrives late: bodies, nature). The function
 * is stable (it reads the Canvas state when called): drei changing the default camera does not relaunch the loads.
 */
export function usePrecompile(): (object: Object3D) => Promise<WarmupResult> {
  const get = useThree((s) => s.get);
  return useCallback((object: Object3D) => {
    const { gl, camera, scene } = get();
    return precompileWorld(gl, object, camera, scene);
  }, [get]);
}

/**
 * Precompiles the postprocessing composer's passes (it arrives in its own chunk, after the first scene): each
 * full-screen scene with its camera, for the screen or for a render target depending on where it draws.
 */
export function precompilePasses(gl: WebGLRenderer, composer: { passes: readonly unknown[] }): void {
  for (const p of fullscreenPasses(composer)) {
    void precompileWorld(gl, p.scene as Object3D, p.camera as Camera, p.scene as Scene, !p.screen);
  }
}

/** Compiles with compileAsync what is in the scene and calls `onReady` (also if it fails or exceeds the cap). */
export function ShaderWarmup({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    void precompileWorld(gl, scene, camera, scene).then((r) => {
      if (r !== "compiled") console.warn(`mundo: compileAsync ${r === "timeout" ? "no terminó a tiempo" : "falló"}; compila el primer cuadro`);
      if (alive) onReady();
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

/**
 * Marks `lg:world-first-frame` after the first frame it draws: useFrame runs before `gl.render` in the same
 * frame, and the microtask runs when the whole frame has already been submitted.
 */
export function FirstFrameMark() {
  const gl = useThree((s) => s.gl);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    queueMicrotask(() => reportFirstFrame(bridge.worldFirstFrame, gl.info.programs?.length ?? 0));
  });
  return null;
}
