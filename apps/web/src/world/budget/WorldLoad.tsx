// world/budget/WorldLoad.tsx — los ganchos de carga del mundo dentro del Canvas (open-world-3d T10 (d)):
// `ShaderWarmup` compila los programas de lo que ya está en la escena con compileAsync y avisa (GameCanvas retiene el
// frameloop mientras tanto); `FirstFrameMark` marca el primer cuadro dibujado. T10-integrate: lo que llega después
// (mallas y mapas de la naturaleza, cuerpos de personajes, pasadas del postprocesado) se precompila al llegar con
// `precompileWorld` / `usePrecompile`, sin retener el frameloop: cuerpos y naturaleza se muestran cuando su compilación
// terminó; las pasadas del post empiezan a compilar al armarse el composer (su primer cuadro puede esperar el resto).
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer } from "three";
import { bridge } from "../../state/bridge";
import { worldFrame } from "../runtime";
import { fullscreenPasses, precompile, reportFirstFrame, type WarmupResult } from "./loadWarmup";

/**
 * Precompila `object` para dibujarse en `scene` con `camera`. `offscreen` (por defecto el del tier, `worldFrame.post`):
 * el cuadro va a un render target (el del composer), así que se compila con uno de 1 × 1 puesto, que se libera enseguida.
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
 * La precompilación contra la escena y la cámara del Canvas (para lo que llega tarde: cuerpos, naturaleza). La función
 * es estable (lee el estado del Canvas al llamarla): que drei cambie la cámara por defecto no relanza las cargas.
 */
export function usePrecompile(): (object: Object3D) => Promise<WarmupResult> {
  const get = useThree((s) => s.get);
  return useCallback((object: Object3D) => {
    const { gl, camera, scene } = get();
    return precompileWorld(gl, object, camera, scene);
  }, [get]);
}

/**
 * Precompila las pasadas del composer del postprocesado (llega en su propio chunk, después de la primera escena): cada
 * escena de pantalla completa con su cámara, para la pantalla o para un render target según donde dibuja.
 */
export function precompilePasses(gl: WebGLRenderer, composer: { passes: readonly unknown[] }): void {
  for (const p of fullscreenPasses(composer)) {
    void precompileWorld(gl, p.scene as Object3D, p.camera as Camera, p.scene as Scene, !p.screen);
  }
}

/** Compila con compileAsync lo que está en la escena y llama a `onReady` (también si falla o se pasa del tope). */
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
 * Marca `lg:world-first-frame` después del primer cuadro que dibuja: useFrame corre antes de `gl.render` en el mismo
 * cuadro, y la microtarea corre cuando el cuadro entero ya se envió.
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
